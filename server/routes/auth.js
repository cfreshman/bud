const express = require('express');
const jwt = require('jsonwebtoken');
const { User } = require('../models');

const router = express.Router();

// Register a new user
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate username format
    if (username.length < 3) {
      return res.status(400).json({ message: 'username must be at least 3 characters' });
    }
    if (username.length > 8) {
      return res.status(400).json({ message: 'username must be at most 8 characters' });
    }
    if (username !== username.toLowerCase()) {
      return res.status(400).json({ message: 'username must be lowercase' });
    }
    if (!/^[a-z0-9]+$/.test(username)) {
      return res.status(400).json({ message: 'username can only contain letters and numbers' });
    }

    // Check if username already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: 'username already taken' });
    }

    // Create new user with 10 stars
    const user = new User({ 
      username, 
      password,
      totalStars: 10,
      currentStars: 10
    });
    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({ token });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'error creating account' });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Find user
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ message: 'invalid credentials' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({ token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'error logging in' });
  }
});

module.exports = router; 