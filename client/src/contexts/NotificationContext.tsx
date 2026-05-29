import React, { createContext, useContext, useState, useCallback } from 'react';

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
}

interface NotificationContextType {
  notifications: Notification[];
  addNotification: (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => void;
  removeNotification: (id: string) => void;
  markAsRead: (id: string) => void;
  clearAll: () => void;
  unreadCount: number;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: '1',
      type: 'warning',
      title: 'Estoque Baixo',
      message: 'Medicamento X está com estoque abaixo do mínimo',
      timestamp: new Date(Date.now() - 3600000),
      read: false,
    },
    {
      id: '2',
      type: 'info',
      title: 'Manejo Pendente',
      message: 'Vacinação do animal #5 está pendente desde ontem',
      timestamp: new Date(Date.now() - 7200000),
      read: false,
    },
    {
      id: '3',
      type: 'success',
      title: 'Animal Prenhe',
      message: 'Vaca #2 confirmada prenhe após inseminação',
      timestamp: new Date(Date.now() - 86400000),
      read: true,
    },
  ]);

  const addNotification = useCallback((type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => {
    const newNotification: Notification = {
      id: Date.now().toString(),
      type,
      title,
      message,
      timestamp: new Date(),
      read: false,
    };
    setNotifications(prev => [newNotification, ...prev]);

    // Auto-remove after 5 seconds for success notifications
    if (type === 'success') {
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== newNotification.id));
      }, 5000);
    }
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <NotificationContext.Provider value={{ notifications, addNotification, removeNotification, markAsRead, clearAll, unreadCount }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
};
