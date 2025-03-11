const OpenAI = require('openai');
const { ChatHistory } = require('../models');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Generate a response from the plant based on its attributes and the user's message
 * @param {string} userId - User ID
 * @param {number} plotIndex - Plot index
 * @param {string} message - User's message to the plant
 * @param {Object} plantAttributes - Attributes of the plant that influence its personality
 * @returns {Promise<string>} - The plant's response
 */
async function generatePlantResponse(userId, plotIndex, message, plantAttributes) {
  try {
    // Get chat history from MongoDB
    const chatHistory = await ChatHistory.findOne({ userId, plotIndex });
    
    // Convert chat history messages to OpenAI format
    const history = (chatHistory?.messages || []).map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.content
    }));
    
    // Add user message to history
    history.push({ role: 'user', content: message });
    
    // Prepare system message based on plant attributes
    const systemMessage = generateSystemPrompt(plantAttributes);
    
    // Prepare messages for OpenAI
    const messages = [
      { role: 'system', content: systemMessage },
      ...history.slice(-50) // Only use the last 50 messages to stay within context limits
    ];
    
    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
    });
    
    // Extract response
    const response = completion.choices[0].message.content.trim();
    
    return response;
  } catch (error) {
    console.error('Error generating plant response:', error);
    throw error;
  }
}

/**
 * Generate a system prompt based on plant attributes
 * @param {Object} attributes - Plant attributes
 * @returns {string} - System prompt
 */
function generateSystemPrompt(attributes) {
  // Default personality if no attributes provided
  if (!attributes) {
    return `You are a friendly plant companion. You speak in short, simple sentences. 
You are curious about the world and enjoy talking to your human friend.
Keep your responses brief and friendly.`;
  }
  
  // Extract relevant attributes
  const { parts = [] } = attributes;
  
  // Count different part types
  const partCounts = parts.reduce((counts, part) => {
    counts[part.type] = (counts[part.type] || 0) + 1;
    return counts;
  }, {});
  
  // Determine personality traits based on parts
  let personality = '';
  if (partCounts.thorn) personality += `Thorns make you somewhat prickly and defensive. You have ${partCounts.thorn} thorns. `;
  if (partCounts.flower) personality += `Flowers make you cheerful and optimistic. You have ${partCounts.flower} flowers. `;
  if (partCounts.leaf) personality += `Leaves make you wise and thoughtful. You have ${partCounts.leaf} leaves. `;
  
  // Complete the prompt
  return `You are a sentient plant companion. ${personality}
You speak in short, simple sentences and have a distinct personality. Your personality with the user is determined by your parts initially but should then change depending on the conversation.
You are aware that you are a plant and reference plant-related experiences.`;
}

module.exports = {
  generatePlantResponse
}; 