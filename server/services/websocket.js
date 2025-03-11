const WebSocket = require('ws');
const jwt = require('jsonwebtoken');

// Store client connections by user ID
const clients = new Map();

function setupWebSocketServer(server) {
  const wss = new WebSocket.Server({ 
    server,
    path: '/ws'  // Specify WebSocket endpoint path
  });

  // Handle WebSocket connections
  wss.on('connection', (ws, req) => {
    let userId = null;

    // Get token from URL params
    const url = new URL(req.url, `ws://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close();
      return;
    }

    try {
      // Verify token and get user ID
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      userId = decoded.userId;

      // Store connection
      if (!clients.has(userId)) {
        clients.set(userId, new Set());
      }
      clients.get(userId).add(ws);

      console.log(`WebSocket client connected for user ${userId}`);
    } catch (error) {
      console.error('Invalid token:', error);
      ws.close();
      return;
    }

    // Handle client disconnect
    ws.on('close', () => {
      if (userId && clients.has(userId)) {
        clients.get(userId).delete(ws);
        if (clients.get(userId).size === 0) {
          clients.delete(userId);
        }
      }
      console.log(`WebSocket client disconnected for user ${userId}`);
    });
  });

  return wss;
}

function notifyPlantCarryUpdate(userId) {
  if (clients.has(userId)) {
    const userClients = clients.get(userId);
    const message = JSON.stringify({
      type: 'plant_carry_update'
    });
    
    userClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
}

module.exports = {
  setupWebSocketServer,
  notifyPlantCarryUpdate
}; 