# 🎯 Guía de Configuración: Twilio Console para Desvío de Llamadas

## 📋 URLs de Webhook (ngrok)

### URLs Principales:
- **Voice URL:** `https://e4848c04c857.ngrok-free.app/voice/incoming`
- **Status Callback:** `https://e4848c04c857.ngrok-free.app/voice/transfer/status`

## 🔧 Configuración en Twilio Console

### 1. Configurar Número de Teléfono

1. Ve a **Phone Numbers** → **Manage** → **Active numbers**
2. Selecciona tu número de teléfono
3. En la sección **Voice Configuration:**
   - **Webhook:** `https://e4848c04c857.ngrok-free.app/voice/incoming`
   - **HTTP Method:** POST
   - **Primary Handler Fails:** (dejar vacío)

### 2. Configurar Variables de Entorno

Crea un archivo `.env` con:

```bash
# Twilio Credentials
TWILIO_ACCOUNT_SID=tu-account-sid
TWILIO_AUTH_TOKEN=tu-auth-token
TWILIO_NUMBER=+52XXXXXXXXXX

# ElevenLabs
ELEVENLABS_API_KEY=tu-elevenlabs-api-key
ELEVENLABS_AGENT_ID=agent_01jw2vkb3pf9w8jx85daq02mae

# Voice Settings
CALL_TIMEOUT_SECONDS=25
HOLD_MUSIC_URL=https://demo.twilio.com/docs/classic.mp3
BASE_PUBLIC_URL=https://e4848c04c857.ngrok-free.app
```

## 🎵 Opciones de Música de Espera

### Opción 1: Twilio por Defecto (Recomendado para pruebas)
```bash
HOLD_MUSIC_URL=https://demo.twilio.com/docs/classic.mp3
```

### Opción 2: Música Personalizada
1. Sube tu archivo de audio a un CDN
2. Configura la URL:
```bash
HOLD_MUSIC_URL=https://tu-cdn.com/audio/hold-music.mp3
```

### Opción 3: Audio Libre de Derechos
```bash
# Archive.org
HOLD_MUSIC_URL=https://archive.org/download/classical_music/beethoven_symphony_9.mp3

# Freesound.org
HOLD_MUSIC_URL=https://freesound.org/data/previews/316/316847_4939433-lq.mp3
```

## 🧪 Pruebas

### 1. Probar Endpoints
```bash
# Ejecutar script de prueba
node test-voice-calls.js
```

### 2. Probar Llamada Real
1. Llama a tu número de Twilio
2. Deberías escuchar la música de espera
3. La IA debería contestar (si está configurada)

## 📊 Flujo de Llamada

```
Cliente llama → /voice/incoming
  ↓
IA contesta (ElevenLabs)
  ↓
Usuario pide asesor → /voice/transfer/init
  ↓
Twilio marca al asesor
  ↓
Cliente escucha música de espera
  ↓
Si asesor contesta → Se conecta a conference
Si no contesta → IA vuelve con opción de recado
```

## 🔍 Monitoreo

### Logs del Servidor
```bash
# Ver logs en tiempo real
npm run dev
```

### Logs de Twilio
1. Ve a **Monitor** → **Logs** → **Voice**
2. Busca tu CallSid para ver el flujo completo

## ⚠️ Consideraciones Importantes

### ngrok
- **URL temporal:** La URL de ngrok cambia cada vez que reinicias
- **Para producción:** Usa un dominio fijo con SSL
- **Header requerido:** `ngrok-skip-browser-warning: true`

### Twilio
- **Webhooks:** Deben ser HTTPS
- **Timeout:** Configurado a 25 segundos
- **Recording:** Deshabilitado por defecto

### ElevenLabs
- **Streaming:** Debe estar activo durante la llamada
- **Fallback:** IA retoma control si no contesta asesor

## 🚀 Próximos Pasos

1. **Configurar Twilio Console** con las URLs de webhook
2. **Configurar variables de entorno** en tu `.env`
3. **Probar con llamada real** a tu número
4. **Ajustar música de espera** según preferencias
5. **Monitorear logs** para verificar funcionamiento

## 📞 URLs de Prueba

```bash
# Música de espera
curl -H "ngrok-skip-browser-warning: true" \
  https://e4848c04c857.ngrok-free.app/voice/hold-music

# Llamada entrante (simulada)
curl -X POST \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "ngrok-skip-browser-warning: true" \
  -d "CallSid=CA1234567890&From=%2B521234567890&To=%2B521098765432" \
  https://e4848c04c857.ngrok-free.app/voice/incoming
```

---

> 📘 **Nota:** Recuerda que ngrok es para desarrollo. Para producción, configura un dominio fijo con SSL.

