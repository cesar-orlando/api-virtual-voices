# 🚀 Implementación de Twilio para Quick Learning

## 📋 Resumen

Esta implementación integra **Twilio WhatsApp Business API** específicamente para **Quick Learning**, proporcionando:

- ✅ **Mensajería automática** con IA (NatalIA)
- ✅ **Webhooks** para recibir mensajes
- ✅ **Transcripción de audio** con OpenAI Whisper
- ✅ **Geolocalización** para sucursales cercanas
- ✅ **Buffer de mensajes** para evitar spam
- ✅ **Base de datos** integrada con el sistema existente
- ✅ **APIs robustas** para envío y gestión

---

## 🏗️ Arquitectura del Sistema

### **Componentes Principales**

```
📱 WhatsApp (Usuario)
    ↓
🌐 Twilio Webhook
    ↓
🔄 TwilioController (Buffer de mensajes)
    ↓
🤖 OpenAI Service (NatalIA)
    ↓
📊 Quick Learning Database
    ↓
📤 Respuesta automática vía Twilio
```

### **Flujo de Mensajes**

1. **Usuario envía mensaje** → WhatsApp
2. **Twilio recibe** → Webhook `/api/quicklearning/twilio/webhook`
3. **Sistema procesa** → Buffer de 3 segundos
4. **IA genera respuesta** → OpenAI GPT-4 + herramientas
5. **Respuesta enviada** → Twilio WhatsApp API
6. **Todo se guarda** → Base de datos Quick Learning

---

## 📁 Estructura de Archivos

```
src/
├── services/
│   ├── twilio/
│   │   └── twilioService.ts           # Servicio principal de Twilio
│   └── quicklearning/
│       ├── openaiService.ts           # Servicio de IA para Quick Learning
│       └── openaiTools.ts             # Herramientas de IA (funciones)
├── controllers/
│   └── quicklearning/
│       └── twilioController.ts        # Controlador de webhooks y APIs
├── models/
│   └── quicklearning/
│       └── chat.model.ts              # Modelo de chat específico
├── routes/
│   └── quicklearning/
│       └── twilioRoutes.ts            # Rutas de API
├── scripts/
│   └── testTwilioQuickLearning.ts     # Script de pruebas
└── config/
    └── environments.ts                # Configuración actualizada
```

---

## 🛠️ Configuración

### **1. Variables de Entorno**

Agrega estas variables a tu `.env`:

```bash
# TWILIO CONFIGURATION (QUICK LEARNING)
TWILIO_ACCOUNT_SID="AC5f21ea4eaf1c576c0d13fca789f63a5d"
TWILIO_AUTH_TOKEN="210fbd6d7efb23fb555c45d3813a1497"
TWILIO_PHONE_NUMBER=+5213341610750

# URLs para webhooks de Twilio (ajustar según entorno)
TWILIO_WEBHOOK_URL_DEV="http://localhost:3001/api/quicklearning/twilio/webhook"
TWILIO_WEBHOOK_URL_QA="https://your-qa-domain.com/api/quicklearning/twilio/webhook"
TWILIO_WEBHOOK_URL_PROD="https://your-prod-domain.com/api/quicklearning/twilio/webhook"

# APIs de geocodificación (opcionales)
POSITIONSTACK_API_KEY="your-positionstack-api-key"
OPENCAGE_API_KEY="your-opencage-api-key"

# OpenAI (ya existente)
OPENAI_API_KEY="sk-your-openai-api-key"
```

### **2. Configurar Webhook en Twilio**

1. Ve a tu **Twilio Console**
2. Navega a **Messaging** > **Settings** > **WhatsApp sandbox**
3. Configura el webhook:
   ```
   URL: https://your-domain.com/api/quicklearning/twilio/webhook
   Method: POST
   ```

### **3. Instalación de Dependencias**

```bash
npm install twilio @types/twilio axios geolib form-data
```

---

## 🚀 Uso

### **1. Iniciar el Servidor**

```bash
# Desarrollo
npm run dev

# Producción
npm run prod
```

### **2. Ejecutar Pruebas**

```bash
# Prueba completa del sistema
npm run test:twilio-quicklearning
```

### **3. Verificar Estado**

```bash
curl http://localhost:3001/api/quicklearning/twilio/status
```

---

## 📡 APIs Disponibles

### **Webhook de Twilio**
```http
POST /api/quicklearning/twilio/webhook
Content-Type: application/x-www-form-urlencoded

# Recibe mensajes automáticamente de Twilio
```

### **Enviar Mensaje**
```http
POST /api/quicklearning/twilio/send
Content-Type: application/json

{
  "phone": "+5214521311888",
  "message": "¡Hola! ¿Cómo estás?"
}
```

### **Enviar Plantilla**
```http
POST /api/quicklearning/twilio/send-template
Content-Type: application/json

{
  "phone": "+5214521311888",
  "templateId": "HX1234567890abcdef",
  "variables": ["Juan", "Quick Learning", "mañana"]
}
```

### **Estado del Servicio**
```http
GET /api/quicklearning/twilio/status
```

### **Historial de Mensajes**
```http
GET /api/quicklearning/twilio/history?limit=10
```

---

## 🤖 NatalIA - Inteligencia Artificial

### **Características**

- **Nombre**: NatalIA
- **Personalidad**: Asesora de ventas profesional y conversacional
- **Límite**: 1500 caracteres por mensaje
- **Modelo**: GPT-4 Turbo
- **Herramientas disponibles**:
  - `get_start_dates` - Fechas de inicio de cursos
  - `register_user_name` - Registro de usuarios
  - `submit_student_complaint` - Manejo de quejas
  - `suggest_branch_or_virtual_course` - Sugerencias por ciudad
  - `suggest_nearby_branch` - Sucursales cercanas con geolocalización

### **Flujo de Conversación**

1. **Saludo inicial**: "Inglés en Quick Learning, ¡Hablas o Hablas! Soy NatalIA..."
2. **Identificación**: Solicita el nombre del prospecto
3. **Necesidades**: Determina interés en cursos
4. **Modalidad**: Presencial, Virtual u Online
5. **Cierre**: Recolecta datos y agenda seguimiento

---

## 💾 Base de Datos

### **Tablas Utilizadas**

1. **`quicklearning_chats`** - Conversaciones de WhatsApp
2. **`prospectos`** - Clientes potenciales
3. **`sedes`** - Sucursales de Quick Learning
4. **`problemas`** - Quejas y reportes

### **Estructura del Chat**

```typescript
interface IQuickLearningChat {
  phone: string;                    // Número de teléfono
  profileName?: string;             // Nombre de WhatsApp
  messages: IMessage[];             // Historial de mensajes
  linkedTable: {                    // Vinculación con registro
    refModel: string;
    refId: ObjectId;
  };
  advisor?: {                       // Asesor asignado
    id: ObjectId;
    name: string;
  };
  aiEnabled: boolean;               // IA activada/desactivada
  status: "active" | "inactive" | "blocked";
  customerInfo?: {                  // Información del cliente
    name?: string;
    email?: string;
    city?: string;
    stage?: "prospecto" | "interesado" | "inscrito";
  };
}
```

---

## 🔧 Funcionalidades Avanzadas

### **1. Buffer de Mensajes**

- **Propósito**: Evitar múltiples respuestas si el usuario envía varios mensajes rápidos
- **Tiempo**: 3 segundos de espera
- **Funcionamiento**: Combina mensajes en uno solo antes de procesar

### **2. Transcripción de Audio**

- **Servicio**: OpenAI Whisper
- **Formatos**: OGG, MP3, WAV
- **Proceso**: Descarga → Transcribe → Responde con texto

### **3. Geolocalización**

- **APIs usadas**:
  1. PositionStack (principal)
  2. OpenCage (fallback)
  3. Nominatim (gratuito)
- **Función**: Encontrar sucursales cercanas por dirección o coordenadas

### **4. Validación de Webhook**

- **Seguridad**: Verifica signature de Twilio
- **Prevención**: Evita requests maliciosos
- **Implementación**: Automática en cada webhook

---

## 🧪 Pruebas y Validación

### **Script de Pruebas Completo**

```bash
npm run test:twilio-quicklearning
```

**Lo que prueba:**
1. ✅ Conexión a Twilio
2. ✅ Base de datos Quick Learning
3. ✅ Modelos de datos
4. ✅ Cliente de prueba
5. ✅ Chat de prueba
6. ✅ Respuesta de IA
7. ✅ Envío de mensajes
8. ✅ Historial de mensajes
9. ✅ Información del sistema

### **Número de Prueba**

- **Número**: `+5214521311888`
- **Propósito**: Recibir mensajes de prueba del sistema
- **Resultado**: Mensajes informativos sobre el estado del sistema

---

## 🐛 Manejo de Errores

### **Errores Comunes y Soluciones**

| Error | Causa | Solución |
|-------|-------|----------|
| `Invalid phone number` | Formato incorrecto | Usar formato internacional (+52...) |
| `Webhook signature invalid` | Configuración incorrecta | Verificar URL y Auth Token |
| `OpenAI rate limit` | Demasiadas requests | Mensaje automático de espera |
| `Database connection failed` | MongoDB desconectado | Verificar string de conexión |
| `Twilio credentials invalid` | Account SID/Token incorrectos | Verificar variables de entorno |

### **Logs del Sistema**

```bash
# Logs en tiempo real
✅ Mensaje enviado exitosamente: SM1234567890
📝 Mensaje guardado: Hola, quiero información...
🤖 Generando respuesta para: +5214521311888
🔧 Ejecutando herramienta: register_user_name
```

---

## 📊 Monitoreo y Métricas

### **Endpoints de Estado**

```bash
# Estado general del sistema
GET /api/quicklearning/twilio/status

# Historial de mensajes
GET /api/quicklearning/twilio/history

# Estado de la aplicación
GET /
```

### **Métricas Importantes**

- **Mensajes enviados/recibidos**
- **Tiempo de respuesta de IA**
- **Tasa de error de webhooks**
- **Clientes activos con IA**
- **Conversiones de prospecto a cliente**

---

## 🔒 Seguridad

### **Medidas Implementadas**

1. **Validación de webhook** con signature de Twilio
2. **Verificación de número** de destino
3. **Rate limiting** implícito con buffer de mensajes
4. **Sanitización** de inputs de usuario
5. **Logs de auditoría** para todas las operaciones

### **Mejores Prácticas**

- Nunca expongas credenciales en logs
- Usa HTTPS en producción
- Implementa rate limiting adicional si es necesario
- Monitorea webhooks maliciosos
- Mantén actualizadas las dependencias

---

## 🚀 Despliegue

### **Checklist de Producción**

- [ ] Variables de entorno configuradas
- [ ] Webhook de Twilio apuntando a producción
- [ ] Base de datos Quick Learning accesible
- [ ] OpenAI API Key válida
- [ ] SSL/HTTPS configurado
- [ ] Monitoreo de logs activado
- [ ] Pruebas de integración exitosas

### **Configuración de Webhook en Producción**

```
URL: https://tu-dominio.com/api/quicklearning/twilio/webhook
Method: POST
Content-Type: application/x-www-form-urlencoded
```

---

## 📞 Soporte y Contacto

### **Para Problemas Técnicos**

1. **Revisar logs** del servidor
2. **Ejecutar script de pruebas**: `npm run test:twilio-quicklearning`
3. **Verificar configuración** de Twilio Console
4. **Consultar documentación** de Twilio y OpenAI

### **Documentación Adicional**

- 📚 **API Docs**: `/api/docs` (Swagger)
- 🌐 **Twilio Docs**: https://www.twilio.com/docs/whatsapp
- 🤖 **OpenAI Docs**: https://platform.openai.com/docs

---

## 🎉 ¡Listo para Producción!

El sistema está completamente implementado y probado. **Quick Learning** ahora puede:

- ✅ **Recibir mensajes automáticamente** en WhatsApp
- ✅ **Responder con NatalIA** (IA especializada en ventas)
- ✅ **Manejar multimedia** (audio, imágenes, ubicación)
- ✅ **Asignar asesores** automáticamente
- ✅ **Gestionar prospectos** en base de datos
- ✅ **Encontrar sucursales cercanas** con geolocalización

**¡El futuro de la atención al cliente de Quick Learning comienza ahora!** 🚀