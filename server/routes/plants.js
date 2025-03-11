const express = require('express')
const router = express.Router()
const auth = require('../middleware/auth')
const { Plant, ChatHistory } = require('../models')
const { generatePlantResponse } = require('../services/openai')
const { notifyPlantCarryUpdate } = require('../services/websocket')

// Get all plants for user
router.get('/', auth, async (req, res) => {
  try {
    const plants = await Plant.find({ userId: req.user.userId })
    
    // Convert to Map format expected by client
    const plantsMap = {}
    plants.forEach(plant => {
      plantsMap[plant.plotIndex] = {
        plotIndex: plant.plotIndex,
        serializedPlant: plant.serializedPlant,
        isCarried: plant.isCarried || false
      }
    })
    
    res.json(plantsMap)
  } catch (error) {
    console.error('Failed to get plants:', error)
    res.status(500).json({ message: 'error loading plants' })
  }
})

// Save/update plant
router.put('/:plotIndex', auth, async (req, res) => {
  try {
    const plotIndex = parseInt(req.params.plotIndex)
    if (isNaN(plotIndex) || plotIndex < 0 || plotIndex > 5) {
      return res.status(400).json({ message: 'invalid plot index' })
    }

    await Plant.findOneAndUpdate(
      { userId: req.user.userId, plotIndex },
      { 
        userId: req.user.userId,
        plotIndex,
        serializedPlant: req.body.serializedPlant,
        isCarried: req.body.isCarried || false
      },
      { upsert: true, new: true }
    )

    res.status(200).json({ message: 'plant saved' })
  } catch (error) {
    console.error('Failed to save plant:', error)
    res.status(500).json({ message: 'error saving plant' })
  }
})

// Delete plant
router.delete('/:plotIndex', auth, async (req, res) => {
  try {
    const plotIndex = parseInt(req.params.plotIndex)
    if (isNaN(plotIndex) || plotIndex < 0 || plotIndex > 5) {
      return res.status(400).json({ message: 'invalid plot index' })
    }

    await Plant.deleteOne({ userId: req.user.userId, plotIndex })
    
    // Also delete chat history when plant is deleted
    await ChatHistory.deleteOne({ userId: req.user.userId, plotIndex })
    
    res.status(200).json({ message: 'plant deleted' })
  } catch (error) {
    console.error('Failed to delete plant:', error)
    res.status(500).json({ message: 'error deleting plant' })
  }
})

// Get chat history for a plot
router.get('/:plotIndex/chat', auth, async (req, res) => {
  try {
    const plotIndex = parseInt(req.params.plotIndex)
    if (isNaN(plotIndex) || plotIndex < 0 || plotIndex > 5) {
      return res.status(400).json({ message: 'invalid plot index' })
    }

    const chatHistory = await ChatHistory.findOne({ 
      userId: req.user.userId, 
      plotIndex 
    })

    res.json(chatHistory?.messages || [])
  } catch (error) {
    console.error('Failed to get chat history:', error)
    res.status(500).json({ message: 'error loading chat history' })
  }
})

// Send a message to a plant
router.post('/:plotIndex/chat', auth, async (req, res) => {
  try {
    const plotIndex = parseInt(req.params.plotIndex)
    if (isNaN(plotIndex) || plotIndex < 0 || plotIndex > 5) {
      return res.status(400).json({ message: 'invalid plot index' })
    }

    const { message, plantAttributes } = req.body
    if (!message) {
      return res.status(400).json({ message: 'message is required' })
    }

    // Get plant response
    const response = await generatePlantResponse(req.user.userId, plotIndex, message, plantAttributes)

    res.json({ message: response })
  } catch (error) {
    console.error('Failed to get plant response:', error)
    res.status(500).json({ message: 'error getting plant response' })
  }
})

// Save chat history for a plot
router.put('/:plotIndex/chat', auth, async (req, res) => {
  try {
    const plotIndex = parseInt(req.params.plotIndex)
    if (isNaN(plotIndex) || plotIndex < 0 || plotIndex > 5) {
      return res.status(400).json({ message: 'invalid plot index' })
    }

    await ChatHistory.findOneAndUpdate(
      { userId: req.user.userId, plotIndex },
      { 
        userId: req.user.userId,
        plotIndex,
        messages: req.body.messages
      },
      { upsert: true, new: true }
    )

    res.status(200).json({ message: 'chat history saved' })
  } catch (error) {
    console.error('Failed to save chat history:', error)
    res.status(500).json({ message: 'error saving chat history' })
  }
})

// Delete chat history for a plot
router.delete('/:plotIndex/chat', auth, async (req, res) => {
  try {
    const plotIndex = parseInt(req.params.plotIndex)
    if (isNaN(plotIndex) || plotIndex < 0 || plotIndex > 5) {
      return res.status(400).json({ message: 'invalid plot index' })
    }

    await ChatHistory.deleteOne({ userId: req.user.userId, plotIndex })
    res.status(200).json({ message: 'chat history deleted' })
  } catch (error) {
    console.error('Failed to delete chat history:', error)
    res.status(500).json({ message: 'error deleting chat history' })
  }
})

// Start carrying a plant
router.post('/:plotIndex/carry', auth, async (req, res) => {
  try {
    const plotIndex = parseInt(req.params.plotIndex)
    if (isNaN(plotIndex) || plotIndex < 0 || plotIndex > 5) {
      return res.status(400).json({ message: 'invalid plot index' })
    }

    // First uncarry any currently carried plant
    await Plant.updateMany(
      { userId: req.user.userId, isCarried: true },
      { isCarried: false }
    )

    // Then carry the selected plant
    const plant = await Plant.findOneAndUpdate(
      { userId: req.user.userId, plotIndex },
      { 
        isCarried: true,
        lastCarriedAt: new Date()
      },
      { new: true }
    )

    if (!plant) {
      return res.status(404).json({ message: 'plant not found' })
    }

    // Notify clients of the change
    notifyPlantCarryUpdate(req.user.userId)

    res.json({ message: 'plant is now being carried' })
  } catch (error) {
    console.error('Failed to carry plant:', error)
    res.status(500).json({ message: 'error carrying plant' })
  }
})

// Stop carrying a plant
router.post('/:plotIndex/uncarry', auth, async (req, res) => {
  try {
    const plotIndex = parseInt(req.params.plotIndex)
    if (isNaN(plotIndex) || plotIndex < 0 || plotIndex > 5) {
      return res.status(400).json({ message: 'invalid plot index' })
    }

    const plant = await Plant.findOneAndUpdate(
      { userId: req.user.userId, plotIndex },
      { isCarried: false },
      { new: true }
    )

    if (!plant) {
      return res.status(404).json({ message: 'plant not found' })
    }

    // Notify clients of the change
    notifyPlantCarryUpdate(req.user.userId)

    res.json({ message: 'plant is no longer being carried' })
  } catch (error) {
    console.error('Failed to uncarry plant:', error)
    res.status(500).json({ message: 'error uncarrying plant' })
  }
})

module.exports = router 