const { ChatHistory } = require('../models')

// Get recent chat history for a plant
async function getChatHistory(userId, plotIndex) {
  const chatHistory = await ChatHistory.findOne({ userId, plotIndex })
  if (!chatHistory) {
    return []
  }

  // Get last 50 messages and convert to OpenAI format
  return chatHistory.messages.slice(-50).map(msg => ({
    role: msg.sender === 'user' ? 'user' : 'assistant',
    content: msg.content
  }))
}

// Add a new message to chat history
async function addChatMessage(userId, plotIndex, role, content) {
  let chatHistory = await ChatHistory.findOne({ userId, plotIndex })
  if (!chatHistory) {
    chatHistory = await ChatHistory.create({
      userId,
      plotIndex,
      messages: []
    })
  }

  chatHistory.messages.push({
    sender: role === 'user' ? 'user' : 'plant',
    content,
    timestamp: new Date()
  })

  await chatHistory.save()
}

module.exports = {
  getChatHistory,
  addChatMessage
} 