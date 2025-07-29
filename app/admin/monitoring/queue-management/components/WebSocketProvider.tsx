'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useWebSocket, AlertNotification, QueueUpdateNotification, SystemUpdateNotification } from '@/hooks/useWebSocket';
import { Alert } from '@/types/queue-management';

interface WebSocketContextType {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  subscribeToQueue: (queueName: string) => void;
  unsubscribeFromQueue: (queueName: string) => void;
  subscribeToAlerts: () => void;
  onAlert: (handler: (notification: AlertNotification) => void) => () => void;
  onQueueUpdate: (handler: (notification: QueueUpdateNotification) => void) => () => void;
  onSystemUpdate: (handler: (notification: SystemUpdateNotification) => void) => () => void;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export function useWebSocketContext() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
}

interface WebSocketProviderProps {
  children: React.ReactNode;
  userId?: string;
}

export function WebSocketProvider({ children, userId }: WebSocketProviderProps) {
  const {
    connected,
    connecting,
    error,
    subscribeToQueue,
    unsubscribeFromQueue,
    subscribeToAlerts,
    onAlert,
    onQueueUpdate,
    onSystemUpdate
  } = useWebSocket({
    userId,
    autoConnect: true,
    reconnectAttempts: 5,
    reconnectInterval: 3000
  });

  const contextValue: WebSocketContextType = {
    connected,
    connecting,
    error,
    subscribeToQueue,
    unsubscribeFromQueue,
    subscribeToAlerts,
    onAlert,
    onQueueUpdate,
    onSystemUpdate
  };

  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
}

// Hook for components to easily subscribe to real-time alerts
export function useRealTimeAlerts() {
  const { connected, onAlert, subscribeToAlerts } = useWebSocketContext();
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    if (connected) {
      subscribeToAlerts();
      
      const unsubscribe = onAlert((notification) => {
        const { alert, action } = notification.data;
        
        setAlerts(prev => {
          switch (action) {
            case 'created':
              return [alert, ...prev];
            
            case 'updated':
            case 'acknowledged':
            case 'resolved':
              return prev.map(a => a.id === alert.id ? alert : a);
            
            default:
              return prev;
          }
        });
      });

      return unsubscribe;
    }
  }, [connected, onAlert, subscribeToAlerts]);

  return { alerts, connected };
}

// Hook for components to subscribe to queue updates
export function useRealTimeQueueUpdates(queueName?: string) {
  const { connected, onQueueUpdate, subscribeToQueue, unsubscribeFromQueue } = useWebSocketContext();
  const [queueData, setQueueData] = useState<any>(null);

  useEffect(() => {
    if (connected && queueName) {
      subscribeToQueue(queueName);
      
      const unsubscribe = onQueueUpdate((notification) => {
        if (notification.data.queueName === queueName) {
          setQueueData(notification.data);
        }
      });

      return () => {
        unsubscribe();
        unsubscribeFromQueue(queueName);
      };
    }
  }, [connected, queueName, onQueueUpdate, subscribeToQueue, unsubscribeFromQueue]);

  return { queueData, connected };
}

// Hook for system-wide updates
export function useRealTimeSystemUpdates() {
  const { connected, onSystemUpdate } = useWebSocketContext();
  const [systemData, setSystemData] = useState<any>(null);

  useEffect(() => {
    if (connected) {
      const unsubscribe = onSystemUpdate((notification) => {
        setSystemData(notification.data);
      });

      return unsubscribe;
    }
  }, [connected, onSystemUpdate]);

  return { systemData, connected };
}