const WebSocket = require('ws');
const jwt = require('jsonwebtoken');

// Store client connections by user ID
const clients = new Map();

function setupWebSocketServer(server) {
  const wss = new WebSocket.Server({ 
    server,
    path: '/ws'
  });

  wss.on('connection', (ws, req) => {
    let userId = null;

    const url = new URL(req.url, `ws://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close();
      return;
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      userId = decoded.userId.toString();

      if (!clients.has(userId)) {
        clients.set(userId, new Set());
      }
      clients.get(userId).add(ws);
    } catch (error) {
      ws.close();
      return;
    }

    ws.on('close', () => {
      if (userId && clients.has(userId)) {
        clients.get(userId).delete(ws);
        if (clients.get(userId).size === 0) {
          clients.delete(userId);
        }
      }
    });
  });

  return wss;
}

function notifyPlantCarryUpdate(userId) {
  const userIdStr = userId.toString();
  if (clients.has(userIdStr)) {
    const userClients = clients.get(userIdStr);
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

function notifyWebClientUpdate(userId) {
  const userIdStr = userId.toString();
  if (clients.has(userIdStr)) {
    const userClients = clients.get(userIdStr);
    const message = JSON.stringify({
      type: 'plant_web_update'
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
  notifyPlantCarryUpdate,
  notifyWebClientUpdate
}; 