# 📊 Guía de Logs: Sistema de Desvío con IA

## 🎯 **Logs que Verás en la Consola:**

### **1. Llamada Entrante:**
```
🎯 ===== INICIO DE LLAMADA =====
📞 Llamada entrante recibida:
   📱 CallSid: CA1234567890
   📞 From: +521234567890
   📞 To: +521098765432
   ⏰ Timestamp: 2024-01-01T12:00:00.000Z

🤖 Configurando ElevenLabs Agent:
   🆔 Agent ID: agent_2601k3v42778eq09zsrzqhd68erx
   🔑 API Key configurada: ✅ Sí

🎯 Creando Conference de 3 participantes:
   📛 Conference Name: conf_CA1234567890
   👥 Participantes: Cliente + IA + Asesor (cuando conteste)

✅ Conference creada exitosamente:
   📛 Nombre: conf_CA1234567890
   🤖 IA: Siempre presente
   📞 Cliente: Se conecta automáticamente
   👨‍💼 Asesor: Se conecta cuando conteste
   🎵 Música de espera: Configurada
   📊 Monitoreo: Activo
🎯 ===== LLAMADA CONFIGURADA =====
```

### **2. Desvío a Asesor:**
```
🔄 ===== INICIANDO DESVÍO =====
📞 Desvío solicitado:
   📱 CallSid: CA1234567890
   📞 Asesor: +521234567890
   📛 Conference: conf_CA1234567890
   ⏰ Timestamp: 2024-01-01T12:00:00.000Z

🤖 IA dice: "Por supuesto, te estoy conectando con el asesor, espera un momento..."
🎵 Cliente escucha música de espera mientras se conecta

✅ Desvío iniciado exitosamente:
   📞 Llamada al asesor: CA9876543210
   📛 Conference: conf_CA1234567890
   🤖 IA: Sigue presente en la conference
   🎵 Cliente: Escucha música de espera
🔄 ===== DESVÍO EN PROGRESO =====
```

### **3. Estados del Desvío:**

#### **Asesor Sonando:**
```
📊 ===== ESTADO DEL DESVÍO =====
📞 Llamada al asesor:
   📱 CallSid: CA9876543210
   📊 Status: ringing
   🔗 ParentCallSid: CA1234567890
   ⏰ Timestamp: 2024-01-01T12:00:00.000Z

📞 Asesor sonando...
🎵 Cliente escucha música de espera
🤖 IA: Sigue presente en la conference
📊 ===== ASESOR SONANDO =====
```

#### **Asesor Contestó:**
```
📊 ===== ESTADO DEL DESVÍO =====
📞 Llamada al asesor:
   📱 CallSid: CA9876543210
   📊 Status: answered
   🔗 ParentCallSid: CA1234567890
   ⏰ Timestamp: 2024-01-01T12:00:00.000Z

🎉 ¡ASESOR CONTESTÓ!
👨‍💼 Asesor: "Hola, ¿en qué puedo ayudarte?"
🤖 IA: Se va a salir de la conference
📞 Cliente + Asesor: Hablarán directamente
📊 ===== ASESOR CONTESTÓ =====
```

#### **Asesor No Contestó:**
```
📊 ===== ESTADO DEL DESVÍO =====
📞 Llamada al asesor:
   📱 CallSid: CA9876543210
   📊 Status: no-answer
   🔗 ParentCallSid: CA1234567890
   ⏰ Timestamp: 2024-01-01T12:00:00.000Z

❌ ASESOR NO CONTESTÓ (no-answer)
🤖 IA dice: "Perdón, el asesor está ocupado en este momento"
🤖 IA dice: "¿Quieres dejar un recado o prefieres que te devuelva la llamada más tarde?"
🎯 IA: Se queda en la conference con el cliente

✅ Fallback activado - IA retoma la conversación
📊 ===== FALLBACK ACTIVADO =====
```

### **4. Estado de Conference:**

#### **Conference Iniciada:**
```
📊 ===== ESTADO DE CONFERENCE =====
📛 Conference: conf_CA1234567890
🎯 Evento: start
👤 Participante: null
📊 Estado: null
⏰ Timestamp: 2024-01-01T12:00:00.000Z

🚀 Conference iniciada
📊 ===== CONFERENCE INICIADA =====
```

#### **Asesor Se Unió:**
```
📊 ===== ESTADO DE CONFERENCE =====
📛 Conference: conf_CA1234567890
🎯 Evento: join
👤 Participante: CA9876543210
📊 Estado: in-progress
⏰ Timestamp: 2024-01-01T12:00:00.000Z

🎉 ¡NUEVO PARTICIPANTE SE UNIÓ!
   👨‍💼 Asesor se conectó exitosamente
   🤖 IA: Se va a salir de la conference
   📞 Cliente + Asesor: Hablarán directamente

✅ Transferencia completada exitosamente
📊 ===== TRANSFERENCIA EXITOSA =====
```

## 🎯 **Flujo Completo de Logs:**

1. **Llamada entrante** → Logs de configuración
2. **Desvío iniciado** → Logs de transferencia
3. **Asesor sonando** → Logs de estado
4. **Asesor contesta** → Logs de éxito
5. **IA se sale** → Logs de conference
6. **Conversación directa** → Cliente + Asesor

## 🔍 **Cómo Monitorear:**

### **En la Consola:**
```bash
npm run dev
```

### **Logs en Tiempo Real:**
- ✅ **Cada paso** del flujo está documentado
- ✅ **Timestamps** para seguimiento temporal
- ✅ **Estados claros** de cada participante
- ✅ **Mensajes de IA** simulados
- ✅ **Errores detallados** si algo falla

## 🚀 **Beneficios de los Logs:**

- ✅ **Debugging fácil** - Ves exactamente qué pasa
- ✅ **Monitoreo en tiempo real** - Sigue el flujo completo
- ✅ **Identificación de problemas** - Errores claros
- ✅ **Seguimiento de performance** - Timestamps precisos
- ✅ **Documentación automática** - Cada paso explicado

---

> 📘 **Nota:** Estos logs te permiten ver exactamente qué está pasando en cada momento del flujo, desde que el cliente llama hasta que habla con el asesor o la IA maneja el fallback.

