const OpenAI = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// In-memory conversation history (in a real app, this would be in a database)
const conversationHistory = new Map();

/**
 * Generate a response from the plant based on its attributes and the user's message
 * @param {string} plantId - Unique identifier for the plant
 * @param {string} message - User's message to the plant
 * @param {Object} plantAttributes - Attributes of the plant that influence its personality
 * @returns {Promise<string>} - The plant's response
 */
async function generatePlantResponse(plantId, message, plantAttributes) {
  try {
    // Get or initialize conversation history for this plant
    if (!conversationHistory.has(plantId)) {
      conversationHistory.set(plantId, []);
    }
    
    const history = conversationHistory.get(plantId);
    
    // Add user message to history
    history.push({ role: 'user', content: message });
    
    // Prepare system message based on plant attributes
    const systemMessage = generateSystemPrompt(plantAttributes);
    
    // Prepare messages for OpenAI
    const messages = [
      { role: 'system', content: systemMessage },
      ...history.slice(-10) // Only use the last 10 messages to stay within context limits
    ];
    
    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
    });
    
    // Extract and save response
    const response = completion.choices[0].message.content.trim();
    history.push({ role: 'assistant', content: response });
    
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

  personality = 'You are friendly and curious. You enjoy learning new things. ';
  if (partCounts.thorn) personality += `Thorns make you somewhat prickly and defensive. You have ${partCounts.thorn} thorns. `;
  if (partCounts.flower) personality += `Flowers make you cheerful and optimistic. You have ${partCounts.flower} flowers. `;
  if (partCounts.leaf) personality += `Leaves make you wise and thoughtful. You have ${partCounts.leaf} leaves. `;
  
  // Complete the prompt
  return `You are a sentient plant companion. ${personality}
You speak in short, simple sentences and have a distinct personality.
You are aware that you are a plant and reference plant-related experiences.`;
}

module.exports = {
  generatePlantResponse
}; 