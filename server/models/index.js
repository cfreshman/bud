const mongoose = require('mongoose')

// Plant schema
const plantSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User'
  },
  plotIndex: {
    type: Number,
    required: true,
    min: 0,
    max: 5
  },
  serializedPlant: {
    type: String,
    required: true
  }
})

// Chat history schema
const chatHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User'
  },
  plotIndex: {
    type: Number,
    required: true,
    min: 0,
    max: 5
  },
  messages: [{
    id: String,
    plantId: String,
    content: String,
    sender: {
      type: String,
      enum: ['user', 'plant']
    },
    timestamp: Number
  }]
})

// Compound indices
plantSchema.index({ userId: 1, plotIndex: 1 }, { unique: true })
chatHistorySchema.index({ userId: 1, plotIndex: 1 }, { unique: true })

// Create models
const Plant = mongoose.model('Plant', plantSchema)
const ChatHistory = mongoose.model('ChatHistory', chatHistorySchema)

module.exports = {
  Plant,
  ChatHistory
} 