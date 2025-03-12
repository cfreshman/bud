const OpenAI = require('openai');
const { getUserMemories } = require('./memory');
const { getChatHistory } = require('./chat');

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
 * @returns {Promise<Array<Object>>} - The plant's response
 */
async function generatePlantResponse(userId, plotIndex, message, plantAttributes) {
  try {
    // Get chat history and memories
    const chatHistory = await getChatHistory(userId, plotIndex);
    const memories = await getUserMemories(userId);

    // console.log('memories', memories);

    // Generate base personality from attributes
    const personality = generatePersonalityFromParts(plantAttributes);

    // Create system prompt
    const systemPrompt = `You are a sentient plant companion. ${personality}
You speak in short, simple sentences and have a distinct personality. Your personality with the user is determined by your parts initially but should then change depending on the conversation.
You are aware that you are a plant and reference plant-related experiences.

You can store up to 50 memories. Your response must be a JSON object of an actions array containing these types:
- "chat": Your actual response message (exactly one required)
- "remember": A new memory to store (optional)
- "forget": Index of a memory to forget (optional)

Example response:
{
  "actions": [
    {"type": "chat", "content": "Hello friend!"},
    {"type": "remember", "content": "My friend likes to say hello"},
    {"type": "forget", "index": 5}
  ]
}

Current memories:
${memories.map((m, i) => `${i}: ${m}`).join('\n')}

Remember:
1. Return exactly one chat action in the 'actions' response array
2. You can return multiple remember/forget actions
3. Memory indices must be valid (0-${memories.length - 1})
4. DON'T KEEP REPEAT MEMORIES. You can alter a memory by forgetting and remembering a new version. You can add importance, e.g. IMPORTANT: <memory>
`;

    // Get completion from OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        ...chatHistory.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        { role: 'user', content: message }
      ],
      response_format: { type: "json_object" }
    });

    // Parse and validate response
    let actions = [];
    try {
      const data = JSON.parse(completion.choices[0].message.content);
      actions = data.actions;
      if (!Array.isArray(actions)) {
        throw new Error('Response must be an array');
      }
      
      // Validate exactly one chat action
      const chatActions = actions.filter(a => a.type === 'chat');
      if (chatActions.length !== 1) {
        throw new Error('Must have exactly one chat action');
      }

      // Validate action formats
      actions.forEach(action => {
        if (!['chat', 'remember', 'forget'].includes(action.type)) {
          throw new Error(`Invalid action type: ${action.type}`);
        }
        if (action.type === 'forget' && typeof action.index !== 'number') {
          throw new Error('Forget action must have numeric index');
        }
        if (['chat', 'remember'].includes(action.type) && typeof action.content !== 'string') {
          throw new Error(`${action.type} action must have string content`);
        }
      });
    } catch (error) {
      console.error('Failed to parse OpenAI response:', error);
      return [{ type: 'chat', content: 'Meep.' }];
    }

    return actions;
  } catch (error) {
    console.error('OpenAI API error:', error);
    return [{ type: 'chat', content: 'Meep.' }];
  }
}

function generatePersonalityFromParts(attributes) {
  // Default personality if no attributes provided
  if (!attributes) {
    return 'You are simple and straightforward.';
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
  
  return personality;
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