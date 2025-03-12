const express = require('express')
const router = express.Router()
const auth = require('../middleware/auth')
const { Plant, ChatHistory, Memory } = require('../models')
const { generatePlantResponse } = require('../services/openai')
const { notifyPlantCarryUpdate, notifyWebClientUpdate } = require('../services/websocket')
const { processChatResponse } = require('../services/memory')

// Get all plants for user
router.get('/', auth, async (req, res) => {
  try {
    console.log('GET plants called for userId:', req.user.userId)
    const plants = await Plant.find({ userId: req.user.userId })
    console.log('Found plants:', plants.map(p => ({
      plotIndex: p.plotIndex,
      shareId: p.shareId,
      isCarried: p.isCarried
    })))
    
    // Convert to Map format expected by client
    const plantsMap = {}
    plants.forEach(plant => {
      plantsMap[plant.plotIndex] = {
        plotIndex: plant.plotIndex,
        serializedPlant: plant.serializedPlant,
        isCarried: plant.isCarried || false,
        shareId: plant.shareId
      }
    })
    
    console.log('Sending plants to client:', Object.values(plantsMap).map(p => ({
      plotIndex: p.plotIndex,
      shareId: p.shareId,
      isCarried: p.isCarried
    })))
    
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

    // Find existing plant to preserve shareId
    const existingPlant = await Plant.findOne({ userId: req.user.userId, plotIndex })
    
    const plant = await Plant.findOneAndUpdate(
      { userId: req.user.userId, plotIndex },
      { 
        userId: req.user.userId,
        plotIndex,
        serializedPlant: req.body.serializedPlant,
        isCarried: req.body.isCarried || false,
        // Preserve shareId if it exists
        ...(existingPlant?.shareId && { shareId: existingPlant.shareId })
      },
      { upsert: true, new: true }
    )

    // Notify clients if this plant is carried
    if (plant.isCarried) {
      notifyPlantCarryUpdate(req.user.userId)
    }

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

    // Get plant response with actions
    const actions = await generatePlantResponse(req.user.userId, plotIndex, message, plantAttributes)
    
    // Process actions and get final response
    const response = await processChatResponse(req.user.userId, actions)

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

    // Delete chat history
    await ChatHistory.deleteOne({ userId: req.user.userId, plotIndex })

    // Clear memories for this user
    await Memory.findOneAndUpdate(
      { userId: req.user.userId },
      { $set: { memories: [] } },
      { upsert: true }
    )

    res.status(200).json({ message: 'chat history and memories deleted' })
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

// Share a plant
router.post('/:plotIndex/share', auth, async (req, res) => {
  console.log('Share endpoint called:', {
    plotIndex: req.params.plotIndex,
    userId: req.user.userId
  })
  
  try {
    const plotIndex = parseInt(req.params.plotIndex)
    if (isNaN(plotIndex) || plotIndex < 0 || plotIndex > 5) {
      console.log('Invalid plot index:', plotIndex)
      return res.status(400).json({ message: 'invalid plot index' })
    }

    // First verify the plant exists
    const existingPlant = await Plant.findOne({ userId: req.user.userId, plotIndex })
    console.log('Found existing plant:', {
      found: !!existingPlant,
      plotIndex: existingPlant?.plotIndex,
      currentShareId: existingPlant?.shareId
    })

    if (!existingPlant) {
      console.log('Plant not found')
      return res.status(404).json({ message: 'plant not found' })
    }

    const shareId = Math.random().toString(36).substring(2, 15)
    console.log('Generated shareId:', shareId)
    
    // Update with new options to ensure proper update
    const plant = await Plant.findOneAndUpdate(
      { userId: req.user.userId, plotIndex },
      { $set: { shareId } },
      { new: true, runValidators: true }
    )

    console.log('Updated plant:', {
      found: !!plant,
      plotIndex: plant?.plotIndex,
      shareId: plant?.shareId,
      fullDoc: plant
    })

    if (!plant) {
      console.log('Plant not found after update')
      return res.status(404).json({ message: 'plant not found' })
    }

    // Verify the update worked
    const verifyPlant = await Plant.findOne({ userId: req.user.userId, plotIndex })
    console.log('Verified plant after update:', {
      found: !!verifyPlant,
      plotIndex: verifyPlant?.plotIndex,
      shareId: verifyPlant?.shareId
    })

    console.log('Share successful, sending response')
    res.json({ shareId })
  } catch (error) {
    console.error('Failed to share plant:', error)
    res.status(500).json({ message: 'error sharing plant' })
  }
})

// Unshare a plant
router.post('/:plotIndex/unshare', auth, async (req, res) => {
  try {
    const plotIndex = parseInt(req.params.plotIndex)
    if (isNaN(plotIndex) || plotIndex < 0 || plotIndex > 5) {
      return res.status(400).json({ message: 'invalid plot index' })
    }

    const plant = await Plant.findOneAndUpdate(
      { userId: req.user.userId, plotIndex },
      { $unset: { shareId: "" } },
      { new: true }
    )

    if (!plant) {
      return res.status(404).json({ message: 'plant not found' })
    }

    res.json({ message: 'plant unshared' })
  } catch (error) {
    console.error('Failed to unshare plant:', error)
    res.status(500).json({ message: 'error unsharing plant' })
  }
})

// Get shared plant
router.get('/shared/:shareId', auth, async (req, res) => {
  try {
    const { shareId } = req.params
    
    // Find the shared plant
    const plant = await Plant.findOne({ shareId })
    if (!plant) {
      return res.status(404).json({ message: 'shared plant not found' })
    }

    // Find an empty plot for the current user
    const userPlants = await Plant.find({ userId: req.user.userId })
    const occupiedPlots = new Set(userPlants.map(p => p.plotIndex))
    let emptyPlotIndex = -1
    for (let i = 0; i < 6; i++) {
      if (!occupiedPlots.has(i)) {
        emptyPlotIndex = i
        break
      }
    }

    // If no empty plots, return error
    if (emptyPlotIndex === -1) {
      return res.status(400).json({ message: 'no empty plots available' })
    }

    // Create a copy of the plant in the empty plot
    const newPlant = new Plant({
      userId: req.user.userId,
      plotIndex: emptyPlotIndex,
      serializedPlant: plant.serializedPlant
    })
    await newPlant.save()

    // Delete the original plant and chat history
    await Plant.deleteOne({ userId: plant.userId, plotIndex: plant.plotIndex })
    await ChatHistory.deleteOne({ userId: plant.userId, plotIndex: plant.plotIndex })

    // Notify original owner
    notifyWebClientUpdate(plant.userId)

    res.json({ 
      plotIndex: emptyPlotIndex,
      serializedPlant: plant.serializedPlant
    })
  } catch (error) {
    console.error('Failed to get shared plant:', error)
    res.status(500).json({ message: 'error getting shared plant' })
  }
})

module.exports = router 