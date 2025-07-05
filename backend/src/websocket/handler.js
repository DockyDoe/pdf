const WebSocket = require('ws');
const url = require('url');
const logger = require('../utils/logger');

// Store active connections
const connections = new Map();

function setupWebSocket(server) {
  const wss = new WebSocket.Server({
    port: process.env.WS_PORT || 5001,
    verifyClient: (info) => {
      // Basic verification - in production you might want to verify JWT tokens
      return true;
    }
  });

  wss.on('connection', (ws, req) => {
    const location = url.parse(req.url, true);
    const connectionId = location.query.connectionId || generateConnectionId();
    
    // Store connection
    connections.set(connectionId, ws);
    
    logger.info(`WebSocket client connected: ${connectionId}`);
    
    // Send connection acknowledgment
    ws.send(JSON.stringify({
      type: 'connection',
      status: 'connected',
      connectionId: connectionId,
      timestamp: new Date().toISOString()
    }));

    // Handle incoming messages
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        handleWebSocketMessage(ws, connectionId, data);
      } catch (error) {
        logger.error('WebSocket message parsing error:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format'
        }));
      }
    });

    // Handle client disconnect
    ws.on('close', (code, reason) => {
      logger.info(`WebSocket client disconnected: ${connectionId}, Code: ${code}, Reason: ${reason}`);
      connections.delete(connectionId);
    });

    // Handle connection errors
    ws.on('error', (error) => {
      logger.error(`WebSocket error for ${connectionId}:`, error);
      connections.delete(connectionId);
    });

    // Set up ping/pong for connection health
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
  });

  // Ping all connections every 30 seconds to keep them alive
  const pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        return ws.terminate();
      }
      
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  // Clean up on server close
  wss.on('close', () => {
    clearInterval(pingInterval);
  });

  logger.info(`WebSocket server started on port ${process.env.WS_PORT || 5001}`);
  
  return wss;
}

function handleWebSocketMessage(ws, connectionId, data) {
  logger.info(`WebSocket message from ${connectionId}:`, data);
  
  switch (data.type) {
    case 'subscribe':
      // Subscribe to job updates
      if (data.jobId) {
        ws.subscribedJobs = ws.subscribedJobs || new Set();
        ws.subscribedJobs.add(data.jobId);
        logger.info(`Client ${connectionId} subscribed to job: ${data.jobId}`);
        
        ws.send(JSON.stringify({
          type: 'subscription',
          status: 'subscribed',
          jobId: data.jobId,
          timestamp: new Date().toISOString()
        }));
      }
      break;
      
    case 'unsubscribe':
      // Unsubscribe from job updates
      if (data.jobId && ws.subscribedJobs) {
        ws.subscribedJobs.delete(data.jobId);
        logger.info(`Client ${connectionId} unsubscribed from job: ${data.jobId}`);
        
        ws.send(JSON.stringify({
          type: 'subscription',
          status: 'unsubscribed',
          jobId: data.jobId,
          timestamp: new Date().toISOString()
        }));
      }
      break;
      
    case 'ping':
      // Respond to ping
      ws.send(JSON.stringify({
        type: 'pong',
        timestamp: new Date().toISOString()
      }));
      break;
      
    default:
      logger.warn(`Unknown WebSocket message type: ${data.type}`);
      ws.send(JSON.stringify({
        type: 'error',
        message: `Unknown message type: ${data.type}`
      }));
  }
}

// Function to broadcast job progress to subscribed clients
function broadcastJobProgress(jobId, progress) {
  const message = JSON.stringify({
    type: 'job_progress',
    jobId: jobId,
    progress: progress,
    timestamp: new Date().toISOString()
  });
  
  connections.forEach((ws, connectionId) => {
    if (ws.readyState === WebSocket.OPEN && 
        ws.subscribedJobs && 
        ws.subscribedJobs.has(jobId)) {
      ws.send(message);
    }
  });
  
  logger.info(`Broadcasted progress for job ${jobId}: ${progress}%`);
}

// Function to broadcast job status updates
function broadcastJobStatus(jobId, status, data = {}) {
  const message = JSON.stringify({
    type: 'job_status',
    jobId: jobId,
    status: status,
    data: data,
    timestamp: new Date().toISOString()
  });
  
  connections.forEach((ws, connectionId) => {
    if (ws.readyState === WebSocket.OPEN && 
        ws.subscribedJobs && 
        ws.subscribedJobs.has(jobId)) {
      ws.send(message);
    }
  });
  
  logger.info(`Broadcasted status for job ${jobId}: ${status}`);
}

// Function to broadcast conversion progress
function broadcastConversionProgress(fileId, progress, status = 'processing') {
  const message = JSON.stringify({
    type: 'conversion_progress',
    fileId: fileId,
    progress: progress,
    status: status,
    timestamp: new Date().toISOString()
  });
  
  connections.forEach((ws, connectionId) => {
    if (ws.readyState === WebSocket.OPEN && 
        ws.subscribedFiles && 
        ws.subscribedFiles.has(fileId)) {
      ws.send(message);
    }
  });
  
  logger.info(`Broadcasted conversion progress for file ${fileId}: ${progress}%`);
}

// Function to send message to specific connection
function sendToConnection(connectionId, message) {
  const ws = connections.get(connectionId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
    return true;
  }
  return false;
}

// Function to generate unique connection ID
function generateConnectionId() {
  return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Function to get connection count
function getConnectionCount() {
  return connections.size;
}

// Function to get active connections
function getActiveConnections() {
  const activeConnections = [];
  connections.forEach((ws, connectionId) => {
    if (ws.readyState === WebSocket.OPEN) {
      activeConnections.push({
        connectionId,
        subscribedJobs: ws.subscribedJobs ? Array.from(ws.subscribedJobs) : [],
        subscribedFiles: ws.subscribedFiles ? Array.from(ws.subscribedFiles) : []
      });
    }
  });
  return activeConnections;
}

module.exports = {
  setupWebSocket,
  broadcastJobProgress,
  broadcastJobStatus,
  broadcastConversionProgress,
  sendToConnection,
  getConnectionCount,
  getActiveConnections
};