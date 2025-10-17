# 🔧 CONFIGURACIÓN DE ELEVENLABS TOOLS

## ✅ **CÓDIGO LISTO - AHORA CONFIGURA EN ELEVENLABS**

Ya está todo el código implementado. Ahora solo necesitas configurar las **Tools** en el panel de ElevenLabs.

---

## 📝 **PASO 1: IR A TU AGENT EN ELEVENLABS**

1. Ve a: **https://elevenlabs.io/app/conversational-ai**
2. Selecciona tu Agent: **agent_9601k1dx49vdesdrk0btydnyrp4s**
3. Busca la pestaña **"Herramientas"** o **"Tools"**

---

## 🔧 **PASO 2: CREAR TOOL "transfer_to_advisor"**

### **Configuración de la Tool:**

```
Nombre: transfer_to_advisor
Descripción: Transfiere la llamada a un asesor específico. Si el asesor no contesta, la IA continúa y ofrece dejar recado.

Cuándo usar: 
- Cuando el usuario pida hablar con alguien específico
- Cuando diga "quiero hablar con Carlos", "comunícame con Juan", etc.
- Cuando requiera atención personalizada de un asesor

Webhook URL: https://tu-ngrok.ngrok-free.app/api/elevenlabs-tools/transfer-to-advisor

Parámetros (SOLO ESTE):
  - advisor_name (string, required): Nombre del asesor
    Descripción: Nombre del asesor al que se quiere transferir (Orlando, César, Maria, Juan)
    
⚠️ IMPORTANTE: NO agregues call_sid ni conversation_id como parámetros.
   ElevenLabs los envía automáticamente en el request body.
```

### **Prompt para la Tool:**

```
Cuando el usuario pida hablar con un asesor específico:

1. Pregunta el nombre del asesor si no lo mencionó
2. Llama a transfer_to_advisor con el nombre
3. Si advisor_available es true:
   - Di: "Perfecto, te estoy transfiriendo con [nombre]"
   - TERMINA la conversación (la llamada se transfiere)
   
4. Si advisor_available es false:
   - Di: "[Nombre] no está disponible en este momento. ¿Te gustaría dejarle un recado?"
   - Si dice sí: usa take_voicemail
   - Si dice no: ofrece ayuda alternativa
```

---

## 📧 **PASO 3: CREAR TOOL "take_voicemail"**

### **Configuración de la Tool:**

```
Nombre: take_voicemail
Descripción: Toma un recado para un asesor y envía notificación.

Cuándo usar:
- Después de que transfer_to_advisor falle
- Cuando el usuario quiera dejar un mensaje
- Cuando diga "déjale un mensaje", "dile que...", etc.

Webhook URL: https://tu-ngrok.ngrok-free.app/api/elevenlabs-tools/take-voicemail

Parámetros (SOLO ESTOS):
  - advisor_name (string, required): Para quién es el recado
  - client_name (string, optional): Nombre de quien deja el recado
  - message (string, required): El mensaje/recado completo
    
⚠️ IMPORTANTE: NO agregues call_sid, conversation_id, ni caller_phone.
   ElevenLabs los envía automáticamente en el request body.
```

### **Prompt para la Tool:**

```
Para tomar un recado:

1. Pregunta el nombre del llamante si no lo dio
2. Pregunta "¿Qué mensaje quieres dejarle?"
3. Escucha el mensaje completo
4. Llama a take_voicemail con todos los datos
5. Confirma: "Perfecto, le haré llegar tu mensaje a [asesor]. ¿Hay algo más en lo que pueda ayudarte?"
```

---

## 🎯 **PASO 4: ACTUALIZAR PROMPT DEL AGENT**

En la configuración principal del Agent, agrega esto al prompt:

```
# TRANSFERENCIAS Y RECADOS

Cuando un cliente pida hablar con un asesor:

1. SIEMPRE pregunta el nombre del asesor si no lo mencionó
2. Usa la herramienta transfer_to_advisor
3. Si la transferencia es exitosa: despídete naturalmente
4. Si el asesor no está disponible: 
   - Informa al cliente
   - Ofrece: "¿Te gustaría dejarle un recado?"
   - Si acepta: usa take_voicemail
   - Si rechaza: ofrece ayuda alternativa

Nombres de asesores disponibles:
- Carlos
- María  
- Juan

Si mencionan otro nombre, di: "No tengo registro de ese asesor. Los asesores disponibles son Carlos, María y Juan. ¿Con cuál te gustaría comunicarte?"
```

---

## 🔗 **PASO 5: CONFIGURAR WEBHOOK EN TWILIO**

1. Ve a tu número en Twilio Console
2. En **"A CALL COMES IN"**, configura:

```
Webhook: https://api.us.elevenlabs.io/twilio/inbound_call?agent_id=agent_9601k1dx49vdesdrk0btydnyrp4s

HTTP: POST
```

3. **Guarda**

---

## ⚙️ **PASO 6: CONFIGURAR NÚMEROS DE ASESORES**

Edita el archivo: `src/controllers/elevenLabsTools.controller.ts`

Busca la función `getAdvisorPhone` (línea ~220) y agrega los números reales:

```typescript
private async getAdvisorPhone(advisorName: string): Promise<string | null> {
  const advisors: Record<string, string> = {
    'carlos': '+5213312345678',  // ← Cambiar por número real de Carlos
    'maria': '+5213387654321',    // ← Cambiar por número real de María
    'juan': '+5213398765432'      // ← Cambiar por número real de Juan
  };

  const normalizedName = advisorName.toLowerCase().trim();
  return advisors[normalizedName] || null;
}
```

Luego recompila:
```bash
npm run build
npm run dev
```

---

## 🧪 **PASO 7: PROBAR EL FLUJO COMPLETO**

### **Prueba 1: Transferencia Exitosa**

```
📞 Llamas al número
🤖 IA: "¡Hola! ¿En qué puedo ayudarte?"
👤 TÚ: "Quiero hablar con Carlos"
🤖 IA: "Perfecto, te estoy transfiriendo con Carlos..."
📞 (Llama a Carlos, si contesta → conectado)
```

### **Prueba 2: Asesor No Disponible + Recado**

```
📞 Llamas al número
🤖 IA: "¡Hola! ¿En qué puedo ayudarte?"
👤 TÚ: "Quiero hablar con Carlos"
🤖 IA: "Un momento, te comunico con Carlos..."
⏰ (Carlos no contesta)
🤖 IA: "Carlos no está disponible en este momento. ¿Te gustaría dejarle un recado?"
👤 TÚ: "Sí"
🤖 IA: "Claro, ¿cuál es tu nombre?"
👤 TÚ: "Juan"
🤖 IA: "¿Qué mensaje quieres dejarle a Carlos?"
👤 TÚ: "Que me llame por favor"
🤖 IA: "Perfecto, le haré llegar tu mensaje a Carlos. ¿Hay algo más?"
```

---

## 📊 **VERIFICAR QUE FUNCIONA**

### **Logs en tu backend:**

Cuando llames, deberías ver:

```
🔧 ===== TOOL LLAMADA: transfer_to_advisor =====
📞 Intentando transferir a: Carlos
📲 Número del asesor: +5213312345678
🔄 Iniciando transferencia...
📞 Llamando al asesor... Call SID: CAxxxx
```

Si el asesor NO contesta:

```
❌ Carlos no contestó

📧 ===== TOOL LLAMADA: take_voicemail =====
📝 Guardando recado para: Carlos
👤 De: Juan (+523322155070)
💬 Mensaje: Que me llame por favor
💾 Guardando recado...
✅ Recado guardado y notificación enviada
```

---

## 🎯 **RESUMEN DE URLs**

**Tu backend (con ngrok):**
```
https://tu-ngrok.ngrok-free.app/api/elevenlabs-tools/transfer-to-advisor
https://tu-ngrok.ngrok-free.app/api/elevenlabs-tools/take-voicemail
```

**ElevenLabs (en Twilio webhook):**
```
https://api.us.elevenlabs.io/twilio/inbound_call?agent_id=agent_9601k1dx49vdesdrk0btydnyrp4s
```

---

## 🚀 **SIGUIENTES PASOS**

1. ✅ Código implementado (ya está)
2. ⏳ Configurar tools en ElevenLabs (5 minutos)
3. ⏳ Configurar webhook en Twilio (1 minuto)
4. ⏳ Actualizar números de asesores (2 minutos)
5. ⏳ Probar llamando (2 minutos)

**Total: ~10 minutos para tener todo funcionando**

---

## ❓ **TROUBLESHOOTING**

### **La IA no llama la tool:**
- Verifica que agregaste las tools en ElevenLabs
- Revisa el prompt del agent
- Confirma que el webhook URL es correcto

### **Error 404 en webhook:**
- Verifica que el servidor esté corriendo (`npm run dev`)
- Verifica que ngrok esté activo
- Confirma la URL completa

### **No encuentra al asesor:**
- Verifica que el nombre coincida (carlos, maria, juan)
- Revisa los logs en consola
- Confirma que el asesor existe en `getAdvisorPhone()`

---

**¿Listo para configurar?** Sigue los pasos y me dices si funciona 🚀

