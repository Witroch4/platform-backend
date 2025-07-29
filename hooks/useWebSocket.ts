import { useEffect, useRef, useState, useCallback } from 'react';
import { Alert } from '@/types/queue-management';

export interface WebSocketMessage {
  type: 'alert' | 'queue_update' | 'system_update';
  data: any;
  timestamp: string;
}

export interface AlertNotification extends WebSocketMessage {
  type: 'alert';
  data: {
    alert: Alert;
    action: 'created' | 'updated' | 'acknowledged' | 'resolved';
  };
}

export interface QueueUpdateNotification extends WebSocketMessage {
  type: 'queue_update';
  data: {
    queueName: string;
    metrics: any;
    health: any;
  };
}

export interface SystemUpdateNotification extends WebSocketMessage {
  type: 'system_update';
  data: {
    systemMetrics: any;
    timestamp: string;
  };
}

interface UseWebSocketOptions {
  userId?: string;
  autoConnect?: boolean;
  reconnectAttempts?: number;
  reconnectInterval?: number;
}

interface WebSocketState {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  lastMessage: WebSocketMessage | null;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    userId,
    autoConnect = true,
    reconnectAttempts = 5,
    reconnectInterval = 3000
  } = options;

  const [state, setState] = useState<WebSocketState>({
    connected: false,
    connecting: false,
    error: null,
    lastMessage: null
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectCountRef = useRef(0);
  const subscribedQueuesRef = useRef<Set<string>>(new Set());
  const subscribedToAlertsRef = useRef(false);

  // Event handlers
  const alertHandlers = useRef<Set<(notification: AlertNotification) => void>>(new Set());
  const queueUpdateHandlers = useRef<Set<(notification: QueueUpdateNotification) => void>>(new Set());
  const systemUpdateHandlers = useRef<Set<(notification: SystemUpdateNotification) => void>>(new Set());

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setState(prev => ({ ...prev, connecting: true, error: null }));

    try {
      // In a real implementation, this would use socket.io-client
      // For now, we'll simulate WebSocket behavior with a mock implementation
      const mockWs = {
        readyState: WebSocket.OPEN,
        send: (data: string) => {
          console.log('[WebSocket Mock] Sending:', data);
        },
        close: () => {
          console.log('[WebSocket Mock] Closing connection');
        },
        addEventListener: (event: string, handler: Function) => {
          console.log(`[WebSocket Mock] Added listener for: ${event}`);
        },
        removeEventListener: (event: string, handler: Function) => {
          console.log(`[WebSocket Mock] Removed listener for: ${event}`);
        }
      };

      wsRef.current = mockWs as any;

      // Simulate connection success
      setTimeout(() => {
        setState(prev => ({ 
          ...prev, 
          connected: true, 
          connecting: false, 
          error: null 
        }));

        // Simulate authentication if userId is provided
        if (userId) {
          authenticate(userId);
        }

        reconnectCountRef.current = 0;
      }, 500);

      // Simulate periodic messages for demonstration
      const messageInterval = setInterval(() => {
        if (wsRef.current) {
          // Simulate random alert notifications
          if (Math.random() > 0.8) {
            const mockAlert: Alert = {
              id: `alert-${Date.now()}`,
              ruleId: 'rule-1',
              queueName: 'webhook-processing',
              severity: Math.random() > 0.5 ? 'warning' : 'error',
              title: 'Simulated Alert',
              message: 'This is a simulated real-time alert notification',
              metrics: { value: Math.floor(Math.random() * 100) },
              status: 'active',
              createdAt: new Date()
            };

            const notification: AlertNotification = {
              type: 'alert',
              data: { alert: mockAlert, action: 'created' },
              timestamp: new Date().toISOString()
            };

            setState(prev => ({ ...prev, lastMessage: notification }));
            
            alertHandlers.current.forEach(handler => handler(notification));
          }
        }
      }, 10000); // Every 10 seconds

      // Clean up interval when connection closes
      const originalClose = mockWs.close;
      mockWs.close = () => {
        clearInterval(messageInterval);
        originalClose.call(mockWs);
      };

    } catch (error) {
      console.error('[WebSocket] Connection error:', error);
      setState(prev => ({ 
        ...prev, 
        connected: false, 
        connecting: false, 
        error: error instanceof Error ? error.message : 'Connection failed' 
      }));
      
      scheduleReconnect();
    }
  }, [userId]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setState(prev => ({ 
      ...prev, 
      connected: false, 
      connecting: false 
    }));
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (reconnectCountRef.current >= reconnectAttempts) {
      setState(prev => ({ 
        ...prev, 
        error: 'Max reconnection attempts reached' 
      }));
      return;
    }

    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectCountRef.current++;
      console.log(`[WebSocket] Reconnection attempt ${reconnectCountRef.current}/${reconnectAttempts}`);
      connect();
    }, reconnectInterval);
  }, [connect, reconnectAttempts, reconnectInterval]);

  const authenticate = useCallback((userId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('[WebSocket] Cannot authenticate: not connected');
      return;
    }

    const authMessage = JSON.stringify({
      type: 'authenticate',
      data: { userId }
    });

    wsRef.current.send(authMessage);
    console.log(`[WebSocket] Sent authentication for user: ${userId}`);
  }, []);

  const subscribeToQueue = useCallback((queueName: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('[WebSocket] Cannot subscribe: not connected');
      return;
    }

    if (subscribedQueuesRef.current.has(queueName)) {
      return; // Already subscribed
    }

    const subscribeMessage = JSON.stringify({
      type: 'subscribe_queue',
      data: { queueName }
    });

    wsRef.current.send(subscribeMessage);
    subscribedQueuesRef.current.add(queueName);
    
    console.log(`[WebSocket] Subscribed to queue: ${queueName}`);
  }, []);

  const unsubscribeFromQueue = useCallback((queueName: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('[WebSocket] Cannot unsubscribe: not connected');
      return;
    }

    const unsubscribeMessage = JSON.stringify({
      type: 'unsubscribe_queue',
      data: { queueName }
    });

    wsRef.current.send(unsubscribeMessage);
    subscribedQueuesRef.current.delete(queueName);
    
    console.log(`[WebSocket] Unsubscribed from queue: ${queueName}`);
  }, []);

  const subscribeToAlerts = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('[WebSocket] Cannot subscribe to alerts: not connected');
      return;
    }

    if (subscribedToAlertsRef.current) {
      return; // Already subscribed
    }

    const subscribeMessage = JSON.stringify({
      type: 'subscribe_alerts'
    });

    wsRef.current.send(subscribeMessage);
    subscribedToAlertsRef.current = true;
    
    console.log('[WebSocket] Subscribed to alerts');
  }, []);

  // Event handler registration
  const onAlert = useCallback((handler: (notification: AlertNotification) => void) => {
    alertHandlers.current.add(handler);
    
    return () => {
      alertHandlers.current.delete(handler);
    };
  }, []);

  const onQueueUpdate = useCallback((handler: (notification: QueueUpdateNotification) => void) => {
    queueUpdateHandlers.current.add(handler);
    
    return () => {
      queueUpdateHandlers.current.delete(handler);
    };
  }, []);

  const onSystemUpdate = useCallback((handler: (notification: SystemUpdateNotification) => void) => {
    systemUpdateHandlers.current.add(handler);
    
    return () => {
      systemUpdateHandlers.current.delete(handler);
    };
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  return {
    // Connection state
    connected: state.connected,
    connecting: state.connecting,
    error: state.error,
    lastMessage: state.lastMessage,
    
    // Connection methods
    connect,
    disconnect,
    authenticate,
    
    // Subscription methods
    subscribeToQueue,
    unsubscribeFromQueue,
    subscribeToAlerts,
    
    // Event handlers
    onAlert,
    onQueueUpdate,
    onSystemUpdate,
    
    // Utility
    subscribedQueues: Array.from(subscribedQueuesRef.current),
    subscribedToAlerts: subscribedToAlertsRef.current
  };
}