# 🎯 Guía de Implementación: Desvío de Llamadas con IA

## 📋 Resumen

Este sistema implementa un **desvío inteligente de llamadas** que mantiene la **voz de IA (ElevenLabs)** activa durante todo el flujo, agregando música de espera personalizada y manejo inteligente del fallback cuando el asesor no contesta.

## 🏗️ Arquitectura

### Componentes Principales

- **Leg A:** Cliente (llamante) + IA ElevenLabs
- **Leg B:** Asesor o agente de destino  
- **Conference Room (Twilio):** Conecta A y B bajo control del backend

### Flujo de Llamada

```text
Cliente llama → /voice/incoming
  → IA contesta (ElevenLabs streaming)
  → Usuario pide hablar con asesor → /voice/transfer/init
      ↳ Twilio marca al asesor (Leg B)
      ↳ Cliente escucha música + IA
      ↳ Si B contesta → unir a conference
      ↳ Si B no contesta → IA vuelve: "No contestó, ¿quieres dejar recado?"
```

## 🔧 Configuración

### Variables de Entorno

```bash
# Puerto del servidor
PORT=3001

# Twilio Credentials
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_NUMBER=+52XXXXXXXXXX

# ElevenLabs Configuration
ELEVENLABS_API_KEY=your-elevenlabs-api-key
ELEVENLABS_AGENT_ID=agent_01jw2vkb3pf9w8jx85daq02mae
ELEVENLABS_BASE_URL=https://api.elevenlabs.io/v1

# Voice Call Settings
CALL_TIMEOUT_SECONDS=25
HOLD_MUSIC_URL=https://cdn.tuempresa.com/audio/hold-loop.mp3
BASE_PUBLIC_URL=https://api.tuempresa.com
```

## 🛠️ Endpoints Implementados

### 1. `/voice/incoming` (POST)
**Recibe llamada entrante y crea conference**

```bash
curl -X POST "http://localhost:3001/voice/incoming" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "CallSid=CA1234567890&From=%2B521234567890&To=%2B521098765432"
```

**Respuesta TwiML:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference startConferenceOnEnter="true" endConferenceOnExit="true" 
                waitUrl="https://api.tuempresa.com/voice/hold-music" 
                waitMethod="GET">conf_CA1234567890</Conference>
  </Dial>
</Response>
```

### 2. `/voice/transfer/init` (POST)
**Inicia desvío a asesor**

```bash
curl -X POST "http://localhost:3001/voice/transfer/init" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "CallSid=CA1234567890&To=%2B521234567890&ConferenceName=conf_CA1234567890"
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Desvío iniciado",
  "callSid": "CA9876543210"
}
```

### 3. `/voice/transfer/connect` (POST)
**Conecta asesor a conference**

```bash
curl -X POST "http://localhost:3001/voice/transfer/connect" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "CallSid=CA9876543210&ConferenceName=conf_CA1234567890"
```

### 4. `/voice/transfer/status` (POST)
**Monitorea estado del desvío**

```bash
curl -X POST "http://localhost:3001/voice/transfer/status" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "CallSid=CA9876543210&CallStatus=no-answer&ParentCallSid=CA1234567890"
```

### 5. `/voice/voicemail` (POST)
**Maneja recado cuando no contesta**

```bash
curl -X POST "http://localhost:3001/voice/voicemail" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "CallSid=CA1234567890"
```

### 6. `/voice/hold-music` (GET)
**Música de espera personalizada**

```bash
curl -X GET "http://localhost:3001/voice/hold-music"
```

## 🎯 Casos de Uso

### Escenario 1: Asesor Contesta
1. Cliente llama → IA contesta
2. Cliente pide asesor → Se inicia desvío
3. Asesor contesta → Se conecta a conference
4. Cliente y asesor hablan directamente

### Escenario 2: Asesor No Contesta
1. Cliente llama → IA contesta  
2. Cliente pide asesor → Se inicia desvío
3. Asesor no contesta → IA vuelve a la conversación
4. IA ofrece: "No pudo contestar, ¿quieres dejar recado?"
5. Cliente graba recado → Se guarda y notifica al asesor

## 🔄 Integración con ElevenLabs

### Durante el Desvío
La IA puede decir:
> "Estoy comunicándote con Jesús, espera un momento mientras verifico su disponibilidad."

### Si No Contesta
> "No logró contestar, ¿quieres que le deje tu recado?"

### Al Dejar Recado
> "Deja tu mensaje después del tono y con gusto se lo haré llegar."

## 📊 Monitoreo y Logs

### Logs de Llamada
```
📞 Llamada entrante recibida:
   CallSid: CA1234567890
   From: +521234567890
   To: +521098765432

✅ Conference creada: conf_CA1234567890

🔄 Iniciando desvío:
   CallSid: CA1234567890
   To: +521234567890
   Conference: conf_CA1234567890

✅ Llamada al asesor creada: CA9876543210
```

### Estados de Llamada
- `ringing`: Asesor sonando
- `answered`: Asesor contestó
- `no-answer`: No contestó
- `busy`: Ocupado
- `failed`: Error en la llamada

## 🚀 Próximos Pasos

1. **Configurar Twilio Webhook URLs** en tu cuenta de Twilio
2. **Subir música de espera** a tu CDN
3. **Configurar variables de entorno** según tu setup
4. **Probar flujo completo** con llamadas reales
5. **Integrar con sistema de notificaciones** para recados

## 🔧 Configuración en Twilio Console

### Webhook URLs a Configurar:
- **Voice URL:** `https://api.tuempresa.com/voice/incoming`
- **Status Callback:** `https://api.tuempresa.com/voice/transfer/status`

### Configuración de Número:
1. Ve a **Phone Numbers** → **Manage** → **Active numbers**
2. Selecciona tu número
3. En **Voice Configuration:**
   - **Webhook:** `https://api.tuempresa.com/voice/incoming`
   - **HTTP Method:** POST

## ✅ Beneficios

- ✅ **Cliente nunca escucha voz operativa de Twilio**
- ✅ **Música de espera personalizada**
- ✅ **Fallback natural: IA retoma la conversación**
- ✅ **Experiencia profesional y fluida**
- ✅ **Control total del backend sobre el flujo**

## 🆘 Troubleshooting

### Error: "TWILIO_ACCOUNT_SID y TWILIO_AUTH_TOKEN son requeridos"
**Solución:** Verificar que las variables de entorno estén configuradas correctamente.

### Error: "Failed to create call"
**Solución:** Verificar que el número de Twilio esté configurado correctamente y tenga permisos de llamada.

### Error: "Conference not found"
**Solución:** Asegurarse de que la conference se cree antes de intentar conectar el asesor.

---

> 📘 **Nota:** Este sistema está diseñado para trabajar en conjunto con ElevenLabs. Asegúrate de tener la integración de ElevenLabs funcionando antes de implementar el desvío de llamadas.

