"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.webSocketManager = void 0;
exports.initializeWebSocket = initializeWebSocket;
exports.broadcastAlert = broadcastAlert;
exports.broadcastQueueUpdate = broadcastQueueUpdate;
exports.broadcastSystemUpdate = broadcastSystemUpdate;
const socket_io_1 = require("socket.io");
class WebSocketManager {
    io = null;
    connectedClients = new Map();
    userSubscriptions = new Map(); // userId -> Set of queueNames
    initialize(server) {
        this.io = new socket_io_1.Server(server, {
            cors: {
                origin: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
                methods: ["GET", "POST"]
            },
            path: '/api/socket.io'
        });
        this.io.on('connection', (socket) => {
            console.log(`[WebSocket] Client connected: ${socket.id}`);
            // Store client connection
            this.connectedClients.set(socket.id, socket);
            // Handle authentication (in production, verify JWT token)
            socket.on('authenticate', (data) => {
                // TODO: Verify JWT token in production
                socket.data.userId = data.userId;
                console.log(`[WebSocket] Client authenticated: ${data.userId}`);
                // Send initial connection confirmation
                socket.emit('authenticated', {
                    success: true,
                    message: 'Successfully authenticated',
                    timestamp: new Date().toISOString()
                });
            });
            // Handle queue subscriptions
            socket.on('subscribe_queue', (data) => {
                const userId = socket.data.userId;
                if (!userId) {
                    socket.emit('error', { message: 'Not authenticated' });
                    return;
                }
                if (!this.userSubscriptions.has(userId)) {
                    this.userSubscriptions.set(userId, new Set());
                }
                this.userSubscriptions.get(userId).add(data.queueName);
                socket.join(`queue:${data.queueName}`);
                console.log(`[WebSocket] User ${userId} subscribed to queue: ${data.queueName}`);
                socket.emit('subscription_confirmed', {
                    queueName: data.queueName,
                    timestamp: new Date().toISOString()
                });
            });
            // Handle queue unsubscriptions
            socket.on('unsubscribe_queue', (data) => {
                const userId = socket.data.userId;
                if (!userId)
                    return;
                if (this.userSubscriptions.has(userId)) {
                    this.userSubscriptions.get(userId).delete(data.queueName);
                }
                socket.leave(`queue:${data.queueName}`);
                console.log(`[WebSocket] User ${userId} unsubscribed from queue: ${data.queueName}`);
                socket.emit('unsubscription_confirmed', {
                    queueName: data.queueName,
                    timestamp: new Date().toISOString()
                });
            });
            // Handle global alerts subscription
            socket.on('subscribe_alerts', () => {
                socket.join('alerts');
                console.log(`[WebSocket] Client ${socket.id} subscribed to alerts`);
                socket.emit('alerts_subscription_confirmed', {
                    timestamp: new Date().toISOString()
                });
            });
            // Handle disconnection
            socket.on('disconnect', (reason) => {
                console.log(`[WebSocket] Client disconnected: ${socket.id}, reason: ${reason}`);
                // Clean up subscriptions
                const userId = socket.data.userId;
                if (userId) {
                    this.userSubscriptions.delete(userId);
                }
                this.connectedClients.delete(socket.id);
            });
            // Handle ping/pong for connection health
            socket.on('ping', () => {
                socket.emit('pong', { timestamp: new Date().toISOString() });
            });
        });
        console.log('[WebSocket] Server initialized');
    }
    // Broadcast alert to all subscribed clients
    broadcastAlert(alert, action) {
        if (!this.io)
            return;
        const notification = {
            type: 'alert',
            data: { alert, action },
            timestamp: new Date()
        };
        // Send to global alerts subscribers
        this.io.to('alerts').emit('alert_notification', notification);
        // Send to queue-specific subscribers if alert is queue-specific
        if (alert.queueName) {
            this.io.to(`queue:${alert.queueName}`).emit('alert_notification', notification);
        }
        console.log(`[WebSocket] Broadcasted ${action} alert: ${alert.title}`);
    }
    // Broadcast queue update to subscribed clients
    broadcastQueueUpdate(queueName, metrics, health) {
        if (!this.io)
            return;
        const notification = {
            type: 'queue_update',
            data: { queueName, metrics, health },
            timestamp: new Date()
        };
        this.io.to(`queue:${queueName}`).emit('queue_update', notification);
        console.log(`[WebSocket] Broadcasted queue update: ${queueName}`);
    }
    // Broadcast system update to all connected clients
    broadcastSystemUpdate(systemMetrics) {
        if (!this.io)
            return;
        const notification = {
            type: 'system_update',
            data: { systemMetrics, timestamp: new Date() },
            timestamp: new Date()
        };
        this.io.emit('system_update', notification);
        console.log('[WebSocket] Broadcasted system update');
    }
    // Send notification to specific user
    sendToUser(userId, message) {
        if (!this.io)
            return;
        // Find all sockets for this user
        const userSockets = Array.from(this.connectedClients.values())
            .filter(socket => socket.data.userId === userId);
        userSockets.forEach(socket => {
            socket.emit('notification', message);
        });
        console.log(`[WebSocket] Sent notification to user: ${userId}`);
    }
    // Get connection statistics
    getStats() {
        return {
            connectedClients: this.connectedClients.size,
            totalSubscriptions: Array.from(this.userSubscriptions.values())
                .reduce((total, subscriptions) => total + subscriptions.size, 0),
            userSubscriptions: Object.fromEntries(Array.from(this.userSubscriptions.entries()).map(([userId, queues]) => [
                userId,
                Array.from(queues)
            ]))
        };
    }
    // Check if WebSocket server is initialized
    isInitialized() {
        return this.io !== null;
    }
    // Gracefully shutdown WebSocket server
    shutdown() {
        if (this.io) {
            console.log('[WebSocket] Shutting down server...');
            this.io.close();
            this.io = null;
            this.connectedClients.clear();
            this.userSubscriptions.clear();
        }
    }
}
// Export singleton instance
exports.webSocketManager = new WebSocketManager();
// Helper function to initialize WebSocket with HTTP server
function initializeWebSocket(server) {
    exports.webSocketManager.initialize(server);
}
// Helper functions for broadcasting
function broadcastAlert(alert, action) {
    exports.webSocketManager.broadcastAlert(alert, action);
}
function broadcastQueueUpdate(queueName, metrics, health) {
    exports.webSocketManager.broadcastQueueUpdate(queueName, metrics, health);
}
function broadcastSystemUpdate(systemMetrics) {
    exports.webSocketManager.broadcastSystemUpdate(systemMetrics);
}
