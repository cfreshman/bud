const express = require('express')
const router = express.Router()
const mongoose = require('mongoose')
const auth = require('../middleware/auth')

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

// Compound index to ensure one plant per plot per user
plantSchema.index({ userId: 1, plotIndex: 1 }, { unique: true })

const Plant = mongoose.model('Plant', plantSchema)

// Get all plants for user
router.get('/', auth, async (req, res) => {
  try {
    const plants = await Plant.find({ userId: req.user.userId })
    
    // Convert to Map format expected by client
    const plantsMap = {}
    plants.forEach(plant => {
      plantsMap[plant.plotIndex] = {
        serializedPlant: plant.serializedPlant
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
        serializedPlant: req.body.serializedPlant
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
    res.status(200).json({ message: 'plant deleted' })
  } catch (error) {
    console.error('Failed to delete plant:', error)
    res.status(500).json({ message: 'error deleting plant' })
  }
})

module.exports = router 