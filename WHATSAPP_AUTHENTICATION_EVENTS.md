# Eventos de Autenticación de WhatsApp

Este documento describe todos los eventos de Socket.IO que el frontend puede escuchar para manejar el proceso de autenticación de WhatsApp.

## Eventos Disponibles

### 1. Evento QR Code
**Evento:** `whatsapp-qr-{company}-{user_id}`
**Descripción:** Se emite cuando se genera un nuevo código QR para escanear
**Payload:** `string` (código QR en formato string)

```javascript
socket.on(`whatsapp-qr-${company}-${user_id}`, (qrCode) => {
  // Mostrar el código QR al usuario
  // qrCode es un string que puedes convertir a imagen QR
});
```

### 2. Evento de Estado de Sesión
**Evento:** `whatsapp-status-{company}-{user_id}`
**Descripción:** Se emite para notificar cambios en el estado de la sesión
**Payload:** `object`

```javascript
socket.on(`whatsapp-status-${company}-${user_id}`, (data) => {
  const { status, session, message, loadingPercent } = data;
  
  switch(status) {
    case 'qr_ready':
      // Mostrar: "Escanea el código QR con WhatsApp"
      // OCULTAR loading, mostrar QR
      break;
      
    case 'qr_scanned':
      // Mostrar: "Cargando WhatsApp... X%"
      // MOSTRAR loading con progress bar
      // loadingPercent contiene el porcentaje de carga
      break;
      
    case 'authenticated':
      // Mostrar: "Inicializando sesión..."
      break;
      
    case 'ready':
      // Mostrar: "WhatsApp conectado y listo para usar"
      // Ocultar loading, mostrar que está conectado
      break;
      
    case 'connected':
      // Estado final - Sesión completamente activa
      break;
      
    case 'disconnected':
      // Mostrar: "Sesión desconectada"
      break;
      
    case 'error':
      // Mostrar: "Error de autenticación"
      break;
  }
});
```

## Estados del Proceso de Autenticación

### 1. `qr_ready`
- **Cuándo:** Se genera el código QR
- **Frontend debe:** Mostrar el QR y mensaje "Escanea el código QR con WhatsApp"
- **Loading:** **OCULTAR** loading, mostrar QR

### 2. `qr_scanned`
- **Cuándo:** El usuario escanea el QR exitosamente
- **Frontend debe:** Mostrar "Cargando WhatsApp... X%"
- **Loading:** **MOSTRAR** loading con progress bar usando `loadingPercent`

### 3. `authenticated`
- **Cuándo:** WhatsApp autentica al usuario
- **Frontend debe:** Mostrar "Inicializando sesión..."
- **Loading:** Continuar spinner

### 4. `ready`
- **Cuándo:** WhatsApp está completamente cargado y listo
- **Frontend debe:** Mostrar "WhatsApp conectado y listo para usar"
- **Loading:** Ocultar loading, mostrar estado conectado

### 5. `connected`
- **Cuándo:** Estado final en la base de datos
- **Frontend debe:** Sesión completamente activa

### 6. `disconnected`
- **Cuándo:** Sesión se desconecta
- **Frontend debe:** Mostrar estado desconectado

### 7. `error`
- **Cuándo:** Error en la autenticación
- **Frontend debe:** Mostrar error y opción de reintentar

## Ejemplo de Implementación en Frontend

```javascript
// Conectar al socket
const socket = io('http://localhost:3000');

// Escuchar eventos de QR
socket.on(`whatsapp-qr-${company}-${user_id}`, (qrCode) => {
  // Generar imagen QR y mostrarla
  generateQRImage(qrCode);
});

// Escuchar eventos de estado
socket.on(`whatsapp-status-${company}-${user_id}`, (data) => {
  const { status, message, loadingPercent } = data;
  
  switch(status) {
    case 'qr_ready':
      hideLoadingState();
      showQRState(message);
      break;
      
    case 'qr_scanned':
      showLoadingState(message, loadingPercent);
      break;
      
    case 'authenticated':
      showLoadingState(message);
      break;
      
    case 'ready':
      hideLoadingState();
      showConnectedState(message);
      break;
      
    case 'connected':
      // Estado final
      break;
      
    case 'disconnected':
      showDisconnectedState(message);
      break;
      
    case 'error':
      showErrorState(message);
      break;
  }
});

function showLoadingState(message, percent = null) {
  // Mostrar loading con mensaje
  // Si percent existe, mostrar progress bar
}

function hideLoadingState() {
  // Ocultar loading
}

function showQRState(message) {
  // Mostrar QR y mensaje, sin loading
}

function showConnectedState(message) {
  // Mostrar que está conectado
}

function showDisconnectedState(message) {
  // Mostrar que está desconectado
}

function showErrorState(message) {
  // Mostrar error
}
```

## Notas Importantes

1. **Eventos únicos por sesión:** Cada sesión tiene su propio conjunto de eventos basado en `company` y `user_id`
2. **Orden de eventos:** Los eventos se emiten en secuencia: `qr_ready` → `qr_scanned` → `authenticated` → `ready` → `connected`
3. **Manejo de errores:** Siempre escuchar también los eventos `disconnected` y `error`
4. **Reconexión:** Si el usuario se desconecta, puede volver a escanear el QR
5. **Loading states:** Usar los mensajes y porcentajes para mostrar progreso al usuario 