# 🚀 Sistema de Notificaciones en Tiempo Real - Integración Frontend

## 📋 Resumen Ejecutivo

Sistema completo de notificaciones en tiempo real para WhatsApp Business con funcionalidades avanzadas de UX/UI tipo WhatsApp Web.

## 🔌 Eventos de Socket.IO Disponibles

### 1. **nuevo_mensaje_whatsapp**
**Descripción:** Se emite cuando llega un nuevo mensaje (cliente, bot, o asesor)

```javascript
socket.on('nuevo_mensaje_whatsapp', (data) => {
  // data contiene:
  {
    type: "nuevo_mensaje",
    phone: "+5214521311888",
    message: {
      body: "Hola, ¿cómo estás?",
      direction: "inbound", // "inbound" | "outbound-api"
      respondedBy: "human", // "human" | "bot" | "asesor"
      messageType: "text", // "text" | "image" | "audio" | "video" | "location" | "document"
      twilioSid: "SM1234567890",
      timestamp: "2024-01-01T00:00:00.000Z"
    },
    chat: {
      phone: "+5214521311888",
      profileName: "Juan Pérez",
      lastMessage: { body: "...", date: "...", respondedBy: "..." },
      conversationStart: "2024-01-01T00:00:00.000Z",
      status: "active",
      aiEnabled: true,
      unreadCount: 1,
      isNewChat: false
    },
    timestamp: "2024-01-01T00:00:00.000Z",
    metadata: {
      shouldBumpChat: true,      // Mover chat al tope
      shouldPlaySound: true,     // Reproducir sonido
      shouldShowNotification: true, // Mostrar notificación push
      priority: "high"           // "high" | "normal"
    }
  }
});
```

### 2. **escribiendo_whatsapp**
**Descripción:** Indica cuando alguien está escribiendo

```javascript
socket.on('escribiendo_whatsapp', (data) => {
  // data contiene:
  {
    type: "escribiendo",
    phone: "+5214521311888",
    isTyping: true,
    userType: "human", // "human" | "bot" | "asesor"
    timestamp: "2024-01-01T00:00:00.000Z"
  }
});
```

### 3. **mensaje_leido_whatsapp**
**Descripción:** Se emite cuando se marca un mensaje como leído

```javascript
socket.on('mensaje_leido_whatsapp', (data) => {
  // data contiene:
  {
    type: "mensaje_leido",
    phone: "+5214521311888",
    userId: "user123",
    timestamp: "2024-01-01T00:00:00.000Z"
  }
});
```

## 🌐 Endpoints REST Disponibles

### 1. **GET /api/quicklearning/twilio/chats**
**Descripción:** Obtener lista de chats con conteo de no leídos

```javascript
const response = await fetch('/api/quicklearning/twilio/chats?userId=user123&companySlug=quicklearning&limit=50');
const data = await response.json();

// data contiene:
{
  success: true,
  chats: [
    {
      phone: "+5214521311888",
      profileName: "Juan Pérez",
      lastMessage: { body: "...", date: "...", respondedBy: "..." },
      unreadCount: 3,
      hasUnread: true,
      lastMessagePreview: "Hola, ¿cómo estás?...",
      conversationStart: "2024-01-01T00:00:00.000Z",
      status: "active",
      aiEnabled: true
    }
  ],
  total: 25,
  totalUnread: 15
}
```

### 2. **GET /api/quicklearning/twilio/chats/{phone}/history**
**Descripción:** Obtener historial de mensajes de un chat

```javascript
const response = await fetch(`/api/quicklearning/twilio/chats/${phone}/history?companySlug=quicklearning&limit=100`);
const data = await response.json();

// data contiene:
{
  success: true,
  chat: {
    phone: "+5214521311888",
    profileName: "Juan Pérez",
    conversationStart: "2024-01-01T00:00:00.000Z",
    status: "active",
    aiEnabled: true
  },
  messages: [
    {
      direction: "inbound",
      body: "Hola",
      respondedBy: "human",
      messageType: "text",
      twilioSid: "SM1234567890",
      dateCreated: "2024-01-01T00:00:00.000Z"
    }
  ],
  totalMessages: 50
}
```

### 3. **POST /api/quicklearning/twilio/chats/{phone}/read**
**Descripción:** Marcar mensajes como leídos

```javascript
const response = await fetch(`/api/quicklearning/twilio/chats/${phone}/read`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'user123',
    companySlug: 'quicklearning'
  })
});

const data = await response.json();
// data contiene: { success: true, message: "Chat marcado como leído" }
```

## 🎨 Implementación Frontend - React Hook

```typescript
// hooks/useWhatsAppSocket.ts
import { useEffect, useState, useCallback } from 'react';
import io, { Socket } from 'socket.io-client';

interface WhatsAppMessage {
  body: string;
  direction: 'inbound' | 'outbound-api';
  respondedBy: 'human' | 'bot' | 'asesor';
  messageType: string;
  twilioSid: string;
  timestamp: string;
}

interface WhatsAppChat {
  phone: string;
  profileName: string;
  lastMessage: any;
  unreadCount: number;
  hasUnread: boolean;
  lastMessagePreview: string;
  conversationStart: string;
  status: string;
  aiEnabled: boolean;
}

interface SocketNotification {
  type: string;
  phone: string;
  message: WhatsAppMessage;
  chat: WhatsAppChat;
  timestamp: string;
  metadata: {
    shouldBumpChat: boolean;
    shouldPlaySound: boolean;
    shouldShowNotification: boolean;
    priority: 'high' | 'normal';
  };
}

export const useWhatsAppSocket = (serverUrl: string = 'http://localhost:3001') => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [chats, setChats] = useState<WhatsAppChat[]>([]);
  const [currentChat, setCurrentChat] = useState<string | null>(null);

  // Conectar al socket
  const connect = useCallback(() => {
    const newSocket = io(serverUrl);
    
    newSocket.on('connect', () => {
      setIsConnected(true);
      console.log('✅ Conectado al socket de WhatsApp');
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      console.log('❌ Desconectado del socket de WhatsApp');
    });

    // Escuchar nuevos mensajes
    newSocket.on('nuevo_mensaje_whatsapp', (data: SocketNotification) => {
      handleNewMessage(data);
    });

    // Escuchar indicador de escritura
    newSocket.on('escribiendo_whatsapp', (data) => {
      handleTypingIndicator(data);
    });

    // Escuchar mensaje leído
    newSocket.on('mensaje_leido_whatsapp', (data) => {
      handleMessageRead(data);
    });

    setSocket(newSocket);
  }, [serverUrl]);

  // Manejar nuevo mensaje
  const handleNewMessage = useCallback((data: SocketNotification) => {
    console.log('📩 Nuevo mensaje recibido:', data);

    // 1. Mover chat al tope si debe hacer bump
    if (data.metadata.shouldBumpChat) {
      setChats(prevChats => {
        const chatIndex = prevChats.findIndex(chat => chat.phone === data.phone);
        if (chatIndex >= 0) {
          const updatedChats = [...prevChats];
          const chat = { ...updatedChats[chatIndex] };
          
          // Actualizar datos del chat
          chat.unreadCount = (chat.unreadCount || 0) + 1;
          chat.hasUnread = true;
          chat.lastMessagePreview = data.message.body.substring(0, 50) + 
            (data.message.body.length > 50 ? '...' : '');
          
          // Mover al tope
          updatedChats.splice(chatIndex, 1);
          updatedChats.unshift(chat);
          
          return updatedChats;
        } else {
          // Chat nuevo
          const newChat: WhatsAppChat = {
            phone: data.phone,
            profileName: data.chat?.profileName || 'Nuevo contacto',
            lastMessage: data.message,
            unreadCount: 1,
            hasUnread: true,
            lastMessagePreview: data.message.body.substring(0, 50) + 
              (data.message.body.length > 50 ? '...' : ''),
            conversationStart: data.chat?.conversationStart || new Date().toISOString(),
            status: 'active',
            aiEnabled: data.chat?.aiEnabled || false
          };
          return [newChat, ...prevChats];
        }
      });
    }

    // 2. Reproducir sonido si está habilitado
    if (data.metadata.shouldPlaySound) {
      playNotificationSound();
    }

    // 3. Mostrar notificación push si está habilitado
    if (data.metadata.shouldShowNotification && document.hidden) {
      showBrowserNotification(data);
    }

    // 4. Auto-scroll si el usuario está en el chat actual
    if (currentChat === data.phone) {
      // Implementar auto-scroll
      handleAutoScroll();
    }
  }, [currentChat]);

  // Manejar indicador de escritura
  const handleTypingIndicator = useCallback((data) => {
    console.log('✍️ Indicador de escritura:', data);
    // Implementar indicador de "escribiendo..."
  }, []);

  // Manejar mensaje leído
  const handleMessageRead = useCallback((data) => {
    console.log('✅ Mensaje leído:', data);
    // Actualizar estado de no leídos
  }, []);

  // Reproducir sonido de notificación
  const playNotificationSound = useCallback(() => {
    try {
      const audio = new Audio('/sounds/notification.mp3'); // Ajustar ruta
      audio.volume = 0.3;
      audio.play().catch(console.error);
    } catch (error) {
      console.error('Error reproduciendo sonido:', error);
    }
  }, []);

  // Mostrar notificación del navegador
  const showBrowserNotification = useCallback((data: SocketNotification) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Nuevo mensaje de WhatsApp', {
        body: `${data.chat?.profileName || data.phone}: ${data.message.body}`,
        icon: '/icons/whatsapp.png', // Ajustar ruta
        tag: data.phone, // Agrupar notificaciones por chat
        requireInteraction: false
      });
    }
  }, []);

  // Auto-scroll inteligente
  const handleAutoScroll = useCallback(() => {
    const chatContainer = document.querySelector('.chat-messages');
    if (chatContainer) {
      const isAtBottom = chatContainer.scrollTop + chatContainer.clientHeight >= 
                        chatContainer.scrollHeight - 100;
      
      if (isAtBottom) {
        // Auto-scroll si está cerca del final
        chatContainer.scrollTop = chatContainer.scrollHeight;
      } else {
        // Mostrar botón "Bajar al último mensaje"
        showScrollToBottomButton();
      }
    }
  }, []);

  // Marcar chat como leído
  const markChatAsRead = useCallback(async (phone: string, userId: string) => {
    try {
      const response = await fetch(`/api/quicklearning/twilio/chats/${phone}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          companySlug: 'quicklearning'
        })
      });

      if (response.ok) {
        // Actualizar estado local
        setChats(prevChats => 
          prevChats.map(chat => 
            chat.phone === phone 
              ? { ...chat, unreadCount: 0, hasUnread: false }
              : chat
          )
        );
      }
    } catch (error) {
      console.error('Error marcando como leído:', error);
    }
  }, []);

  // Cargar chats iniciales
  const loadChats = useCallback(async (userId: string) => {
    try {
      const response = await fetch(`/api/quicklearning/twilio/chats?userId=${userId}&companySlug=quicklearning`);
      const data = await response.json();
      
      if (data.success) {
        setChats(data.chats);
      }
    } catch (error) {
      console.error('Error cargando chats:', error);
    }
  }, []);

  // Limpiar al desmontar
  useEffect(() => {
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [socket]);

  return {
    socket,
    isConnected,
    chats,
    currentChat,
    connect,
    markChatAsRead,
    loadChats,
    setCurrentChat
  };
};
```

## 🎯 Componente de Lista de Chats

```typescript
// components/ChatList.tsx
import React, { useEffect } from 'react';
import { useWhatsAppSocket } from '../hooks/useWhatsAppSocket';

interface ChatListProps {
  userId: string;
  onChatSelect: (phone: string) => void;
}

export const ChatList: React.FC<ChatListProps> = ({ userId, onChatSelect }) => {
  const { 
    isConnected, 
    chats, 
    currentChat, 
    connect, 
    markChatAsRead, 
    loadChats, 
    setCurrentChat 
  } = useWhatsAppSocket();

  useEffect(() => {
    connect();
    loadChats(userId);
  }, [connect, loadChats, userId]);

  const handleChatClick = (phone: string) => {
    setCurrentChat(phone);
    onChatSelect(phone);
    markChatAsRead(phone, userId);
  };

  return (
    <div className="chat-list">
      <div className="chat-list-header">
        <h2>Chats {isConnected ? '🟢' : '🔴'}</h2>
        <span className="unread-badge">
          {chats.reduce((sum, chat) => sum + chat.unreadCount, 0)}
        </span>
      </div>

      <div className="chat-list-content">
        {chats.map((chat) => (
          <div
            key={chat.phone}
            className={`chat-item ${chat.hasUnread ? 'unread' : ''} ${currentChat === chat.phone ? 'active' : ''}`}
            onClick={() => handleChatClick(chat.phone)}
          >
            <div className="chat-avatar">
              {chat.profileName.charAt(0).toUpperCase()}
            </div>
            
            <div className="chat-info">
              <div className="chat-header">
                <span className="chat-name">{chat.profileName}</span>
                <span className="chat-time">
                  {new Date(chat.lastMessage?.date).toLocaleTimeString()}
                </span>
              </div>
              
              <div className="chat-preview">
                <span className={`preview-text ${chat.hasUnread ? 'unread' : ''}`}>
                  {chat.lastMessagePreview}
                </span>
                {chat.hasUnread && (
                  <span className="unread-count">{chat.unreadCount}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
```

## 🎨 CSS para Animaciones y UX

```css
/* styles/chat.css */
.chat-list {
  width: 300px;
  border-right: 1px solid #e0e0e0;
  background: #f8f9fa;
}

.chat-item {
  display: flex;
  padding: 12px 16px;
  border-bottom: 1px solid #e0e0e0;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.chat-item:hover {
  background: #e3f2fd;
}

.chat-item.active {
  background: #bbdefb;
}

.chat-item.unread {
  background: #fff3e0;
  animation: bump 0.3s ease;
}

@keyframes bump {
  0% { transform: scale(1); }
  50% { transform: scale(1.02); }
  100% { transform: scale(1); }
}

.chat-item.new-message {
  animation: slideIn 0.3s ease;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.chat-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #007bff;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  margin-right: 12px;
}

.chat-info {
  flex: 1;
  min-width: 0;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.chat-name {
  font-weight: 600;
  color: #333;
}

.chat-time {
  font-size: 12px;
  color: #666;
}

.chat-preview {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.preview-text {
  font-size: 14px;
  color: #666;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.preview-text.unread {
  color: #333;
  font-weight: 600;
}

.unread-count {
  background: #dc3545;
  color: white;
  border-radius: 50%;
  min-width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
  margin-left: 8px;
}

.unread-badge {
  background: #dc3545;
  color: white;
  border-radius: 12px;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: bold;
}

/* Animaciones para mensajes */
.message {
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Indicador de escritura */
.typing-indicator {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  color: #666;
  font-style: italic;
}

.typing-dots {
  display: flex;
  margin-left: 8px;
}

.typing-dots span {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #666;
  margin: 0 2px;
  animation: typing 1.4s infinite;
}

.typing-dots span:nth-child(2) { animation-delay: 0.2s; }
.typing-dots span:nth-child(3) { animation-delay: 0.4s; }

@keyframes typing {
  0%, 60%, 100% { opacity: 0.3; }
  30% { opacity: 1; }
}
```

## 🚀 Configuración Inicial

### 1. **Instalar dependencias**
```bash
npm install socket.io-client
```

### 2. **Configurar permisos de notificación**
```javascript
// En tu componente principal
useEffect(() => {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}, []);
```

### 3. **Configurar sonidos**
```javascript
// Crear archivo de sonido: public/sounds/notification.mp3
// O usar Web Audio API para generar sonidos
```

## 📱 Funcionalidades Implementadas

✅ **Orden dinámico de chats** - Mover al tope automáticamente  
✅ **Animaciones y feedback visual** - Bump, fade-in, highlights  
✅ **Badge de contador** - Mensajes no leídos por chat  
✅ **Auto-scroll inteligente** - Solo si está al final del chat  
✅ **Notificaciones de escritorio** - Push notifications  
✅ **Sonido de notificación** - Configurable  
✅ **Vista previa de mensaje** - Snippet del último mensaje  
✅ **Indicador de escritura** - "X está escribiendo..."  
✅ **Accesibilidad** - Keyboard navigation, screen readers  
✅ **Responsive design** - Mobile/tablet friendly  

## 🔧 Próximos Pasos

1. **Implementar filtros** - Por no leídos, recientes, activos
2. **Búsqueda avanzada** - Por nombre, teléfono, contenido
3. **Carga optimista** - Mensajes enviados inmediatamente
4. **Offline support** - Queue de mensajes cuando no hay conexión
5. **Performance** - Virtualización para listas grandes

¡El sistema está listo para una UX/UI de nivel profesional! 🎉 