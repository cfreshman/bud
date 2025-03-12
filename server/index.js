require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { setupWebSocketServer } = require('./services/websocket');

// Load models first
require('./models');

const { chatRouter } = require('./routes/chat');
const authRouter = require('./routes/auth');
const plantsRouter = require('./routes/plants');

const app = express();
const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:28000/bud';

// Cache for index.html
let indexHtml = null;

// Set up static path
const staticPath = path.join(__dirname, '../client/dist');

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRouter);
app.use('/api/plants', plantsRouter);
app.use('/api/chat', chatRouter);

// Serve shared plant page
app.get('/shared/:shareId', async (req, res) => {
  try {
    // Load index.html if not cached
    if (!indexHtml) {
      indexHtml = await fs.promises.readFile(path.join(staticPath, 'index.html'), 'utf8');
    }

    // Replace title
    const html = indexHtml.replace(
      /<title>.*?<\/title>/,
      '<title>🌱 - someone sent you a bud!</title>'
    );

    res.send(html);
  } catch (error) {
    console.error('Error serving shared plant page:', error);
    res.status(500).send('Error loading page');
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok',
    mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Start HTTP server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Setup WebSocket server
setupWebSocketServer(server);

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  server.close(() => {
    console.log('Server closed');
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
}); 