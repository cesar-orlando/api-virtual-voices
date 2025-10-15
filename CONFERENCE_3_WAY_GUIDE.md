# 🎯 Guía: Conference de 3 Participantes con IA

## 🎯 **Flujo Implementado:**

### **Escenario 1: Asesor Contesta**
```
1. Cliente marca → IA contesta (Conference de 3 creada)
2. Cliente: "Quiero hablar con Jesús"
3. IA: "Por supuesto, te estoy conectando con Jesús, espera un momento..."
4. [Música de espera] + IA sigue presente en conference
5. Asesor contesta → Se une a conference
6. Sistema detecta asesor → IA se sale automáticamente
7. Cliente + Asesor hablan directamente
```

### **Escenario 2: Asesor No Contesta**
```
1. Cliente marca → IA contesta (Conference de 3 creada)
2. Cliente: "Quiero hablar con Jesús"
3. IA: "Por supuesto, te estoy conectando con Jesús, espera un momento..."
4. [Música de espera] + IA sigue presente en conference
5. Asesor no contesta → Timeout
6. IA: "Perdón, Jesús está ocupado, ¿quieres dejar recado?"
7. Cliente + IA siguen hablando
```

## 🔧 **Arquitectura Técnica:**

### **Conference de 3 Participantes:**
- **Participante 1:** Cliente (llamante)
- **Participante 2:** IA (ElevenLabs) - Siempre presente
- **Participante 3:** Asesor (cuando contesta)

### **Control Dinámico:**
- **IA siempre presente** durante desvío
- **IA se sale automáticamente** cuando asesor contesta
- **IA se queda** si asesor no contesta

## 📋 **Endpoints Implementados:**

### **1. Llamada Entrante:**
```
POST /voice/incoming
→ Redirige a ElevenLabs Agent
```

### **2. ElevenLabs Agent:**
```
GET /voice/elevenlabs/agent/{agentId}
→ Crea conference de 3 participantes
```

### **3. Estado de Conference:**
```
POST /voice/conference/status
→ Monitorea eventos de la conference
→ Controla cuándo IA se sale
```

### **4. Desvío a Asesor:**
```
POST /voice/transfer/init
→ Marca al asesor
→ Lo conecta a la conference existente
```

## 🎯 **Configuración en Twilio Console:**

### **URLs de Webhook:**
- **Voice URL:** `https://tu-ngrok-url.ngrok-free.app/voice/incoming`
- **Status Callback:** `https://tu-ngrok-url.ngrok-free.app/voice/transfer/status`
- **Conference Status:** `https://tu-ngrok-url.ngrok-free.app/voice/conference/status`

## 🔧 **Variables de Entorno:**

```bash
# ElevenLabs
ELEVENLABS_API_KEY=sk_f553ba40c02f3ef062f505e1697d72ab1d8031661b903b71
ELEVENLABS_AGENT_ID=agent_2601k3v42778eq09zsrzqhd68erx

# Twilio
TWILIO_ACCOUNT_SID=tu-account-sid
TWILIO_AUTH_TOKEN=tu-auth-token
TWILIO_NUMBER=+52XXXXXXXXXX

# URLs
BASE_PUBLIC_URL=https://tu-ngrok-url.ngrok-free.app
```

## 🎯 **Ventajas del Sistema:**

- ✅ **IA siempre presente** durante desvío
- ✅ **Transferencia limpia** cuando asesor contesta
- ✅ **Fallback natural** si no contesta
- ✅ **Experiencia fluida** para el cliente
- ✅ **Control total** del backend

## 🧪 **Pruebas:**

### **1. Probar Llamada Entrante:**
```bash
curl -X POST "https://tu-ngrok-url.ngrok-free.app/voice/incoming" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "CallSid=CA1234567890&From=%2B521234567890&To=%2B521098765432"
```

### **2. Probar ElevenLabs Agent:**
```bash
curl -X GET "https://tu-ngrok-url.ngrok-free.app/voice/elevenlabs/agent/agent_2601k3v42778eq09zsrzqhd68erx?callSid=CA1234567890"
```

### **3. Probar Estado de Conference:**
```bash
curl -X POST "https://tu-ngrok-url.ngrok-free.app/voice/conference/status" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "ConferenceSid=CF1234567890&StatusCallbackEvent=join&ParticipantStatus=in-progress"
```

## 🚀 **Próximos Pasos:**

1. **Configurar ngrok** con nueva URL
2. **Actualizar Twilio Console** con URLs
3. **Configurar variables de entorno**
4. **Probar con llamada real**
5. **Verificar logs** para monitorear flujo

---

> 📘 **Nota:** Este sistema implementa exactamente lo que pediste: IA siempre presente, se sale cuando asesor contesta, se queda si no contesta.

