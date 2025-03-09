const express = require('express');
const { generatePlantResponse } = require('../services/openai');

const router = express.Router();

// POST /api/chat - Send a message to a plant and get a response
router.post('/', async (req, res) => {
  try {
    const { plantId, message, plantAttributes } = req.body;
    
    if (!plantId || !message) {
      return res.status(400).json({ error: 'Missing required fields: plantId and message' });
    }

    // Generate response from OpenAI based on plant attributes and message
    const response = await generatePlantResponse(plantId, message, plantAttributes);
    
    return res.status(200).json({ 
      plantId,
      message: response,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Error in chat endpoint:', error);
    return res.status(500).json({ error: 'Failed to generate response' });
  }
});

module.exports = {
  chatRouter: router
}; 