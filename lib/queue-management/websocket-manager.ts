import { Server as HTTPServer } from "http";
// import { Server as SocketIOServer, Socket } from 'socket.io';
import { Alert } from "@/types/queue-management";

// Temporary types to allow compilation without socket.io
type SocketIOServer = any;
type Socket = any;

export interface WebSocketMessage {
	type: "alert" | "queue_update" | "system_update";
	data: any;
	timestamp: Date;
}

export interface AlertNotification extends WebSocketMessage {
	type: "alert";
	data: {
		alert: Alert;
		action: "created" | "updated" | "acknowledged" | "resolved";
	};
}

export interface QueueUpdateNotification extends WebSocketMessage {
	type: "queue_update";
	data: {
		queueName: string;
		metrics: any;
		health: any;
	};
}

export interface SystemUpdateNotification extends WebSocketMessage {
	type: "system_update";
	data: {
		systemMetrics: any;
		timestamp: Date;
	};
}

class WebSocketManager {
	private io: SocketIOServer | null = null;
	private connectedClients = new Map<string, Socket>();
	private userSubscriptions = new Map<string, Set<string>>(); // userId -> Set of queueNames

	initialize(server: HTTPServer) {
		// TODO: Reinstall socket.io package to enable WebSocket functionality
		console.log("[WebSocketManager] WebSocket functionality temporarily disabled");
		return; // Exit early to avoid socket.io code

		// The rest of this method is commented out until socket.io is installed
		/*
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        methods: ["GET", "POST"]
      },
      path: '/api/socket.io'
    });

    this.io.on('connection', (socket: Socket) => {
      console.log(`[WebSocket] Client connected: ${socket.id}`);
      
      // Store client connection
      this.connectedClients.set(socket.id, socket);

      // Handle authentication (in production, verify JWT token)
      socket.on('authenticate', (data: { userId: string; token?: string }) => {
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
      socket.on('subscribe_queue', (data: { queueName: string }) => {
        const userId = socket.data.userId;
        if (!userId) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        if (!this.userSubscriptions.has(userId)) {
          this.userSubscriptions.set(userId, new Set());
        }
        
        this.userSubscriptions.get(userId)!.add(data.queueName);
        socket.join(`queue:${data.queueName}`);
        
        console.log(`[WebSocket] User ${userId} subscribed to queue: ${data.queueName}`);
        
        socket.emit('subscription_confirmed', {
          queueName: data.queueName,
          timestamp: new Date().toISOString()
        });
      });

      // Handle queue unsubscriptions
      socket.on('unsubscribe_queue', (data: { queueName: string }) => {
        const userId = socket.data.userId;
        if (!userId) return;

        if (this.userSubscriptions.has(userId)) {
          this.userSubscriptions.get(userId)!.delete(data.queueName);
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
    */
	}

	// Broadcast alert to all subscribed clients
	broadcastAlert(alert: Alert, action: "created" | "updated" | "acknowledged" | "resolved") {
		if (!this.io) return;

		const notification: AlertNotification = {
			type: "alert",
			data: { alert, action },
			timestamp: new Date(),
		};

		// Send to global alerts subscribers
		this.io.to("alerts").emit("alert_notification", notification);

		// Send to queue-specific subscribers if alert is queue-specific
		if (alert.queueName) {
			this.io.to(`queue:${alert.queueName}`).emit("alert_notification", notification);
		}

		console.log(`[WebSocket] Broadcasted ${action} alert: ${alert.title}`);
	}

	// Broadcast queue update to subscribed clients
	broadcastQueueUpdate(queueName: string, metrics: any, health: any) {
		if (!this.io) return;

		const notification: QueueUpdateNotification = {
			type: "queue_update",
			data: { queueName, metrics, health },
			timestamp: new Date(),
		};

		this.io.to(`queue:${queueName}`).emit("queue_update", notification);

		console.log(`[WebSocket] Broadcasted queue update: ${queueName}`);
	}

	// Broadcast system update to all connected clients
	broadcastSystemUpdate(systemMetrics: any) {
		if (!this.io) return;

		const notification: SystemUpdateNotification = {
			type: "system_update",
			data: { systemMetrics, timestamp: new Date() },
			timestamp: new Date(),
		};

		this.io.emit("system_update", notification);

		console.log("[WebSocket] Broadcasted system update");
	}

	// Send notification to specific user
	sendToUser(userId: string, message: WebSocketMessage) {
		if (!this.io) return;

		// Find all sockets for this user
		const userSockets = Array.from(this.connectedClients.values()).filter((socket) => socket.data.userId === userId);

		userSockets.forEach((socket) => {
			socket.emit("notification", message);
		});

		console.log(`[WebSocket] Sent notification to user: ${userId}`);
	}

	// Get connection statistics
	getStats() {
		return {
			connectedClients: this.connectedClients.size,
			totalSubscriptions: Array.from(this.userSubscriptions.values()).reduce(
				(total, subscriptions) => total + subscriptions.size,
				0,
			),
			userSubscriptions: Object.fromEntries(
				Array.from(this.userSubscriptions.entries()).map(([userId, queues]) => [userId, Array.from(queues)]),
			),
		};
	}

	// Check if WebSocket server is initialized
	isInitialized(): boolean {
		return this.io !== null;
	}

	// Gracefully shutdown WebSocket server
	shutdown() {
		if (this.io) {
			console.log("[WebSocket] Shutting down server...");
			this.io.close();
			this.io = null;
			this.connectedClients.clear();
			this.userSubscriptions.clear();
		}
	}
}

// Export singleton instance
export const webSocketManager = new WebSocketManager();

// Helper function to initialize WebSocket with HTTP server
export function initializeWebSocket(server: HTTPServer) {
	webSocketManager.initialize(server);
}

// Helper functions for broadcasting
export function broadcastAlert(alert: Alert, action: "created" | "updated" | "acknowledged" | "resolved") {
	webSocketManager.broadcastAlert(alert, action);
}

export function broadcastQueueUpdate(queueName: string, metrics: any, health: any) {
	webSocketManager.broadcastQueueUpdate(queueName, metrics, health);
}

export function broadcastSystemUpdate(systemMetrics: any) {
	webSocketManager.broadcastSystemUpdate(systemMetrics);
}
