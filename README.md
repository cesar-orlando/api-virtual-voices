# 🚀 Virtual Voices API - BaseAgent System

## 📋 **Sistema BaseAgent Implementado**

Sistema de agentes inteligentes usando el SDK de OpenAI Agents (`@openai/agents`) para manejar conversaciones de WhatsApp de manera inteligente.

### **Archivos del Sistema BaseAgent**

- **`BaseAgent.ts`** - Clase abstracta con SDK `@openai/agents`
- **`QuickLearningAgent.ts`** - Agente específico para Quick Learning
- **`AgentManager.ts`** - Gestor singleton de agentes
- **`WhatsAppAgentService.ts`** - Servicio para procesar mensajes de WhatsApp

### **Endpoints de Prueba**

- `GET /api/test/health` - Health check
- `POST /api/test/agent` - Probar mensaje único
- `POST /api/test/multiple` - Probar múltiples mensajes

### **Scripts de Prueba**

- **`test-perfected-flow.js`** - Flujo perfeccionado con conversaciones inteligentes

### **Cómo Usar**

```bash
# Iniciar servidor
./start-with-base-agent.sh

# Probar flujo perfeccionado (conversaciones inteligentes)
node test-perfected-flow.js
```

### **Ejemplo de Uso**

```bash
# Probar mensaje
curl -X POST http://localhost:3001/api/test/agent \
  -H "Content-Type: application/json" \
  -d '{"message": "Hola", "company": "quicklearning"}'
```

## 🚫 **Nuevo Flujo: Transferencia a Asesor**

El BaseAgent ahora tiene un nuevo flujo que transfiere automáticamente a asesores humanos cuando:

### **Palabras Clave de Transferencia:**
- **Cursos presenciales:** "presencial", "sucursal", "en persona", "físico", "dirección", "ubicación"
- **Pagos con tarjeta:** "tarjeta", "tarjeta de crédito", "tarjeta de débito"
- **Información de pago:** "pago", "información de pago", "datos de pago"

### **Lo que maneja la IA:**
- ✅ **Cursos Virtuales** - Información completa e inscripción
- ✅ **Cursos Online** - Información completa e inscripción  
- ✅ **Transferencias bancarias** - Proceso completo
- ❌ **Cursos presenciales** - Transfiere a asesor
- ❌ **Pagos con tarjeta** - Transfiere a asesor
- ❌ **Información de pago** - Transfiere a asesor después de enviar datos

## 🎯 **Estado**

✅ **Sistema BaseAgent funcionando correctamente**
✅ **Integración con WhatsApp completada**
✅ **Archivos del sistema anterior eliminados**
✅ **Testing automatizado disponible**
✅ **Nuevo flujo de transferencias implementado**