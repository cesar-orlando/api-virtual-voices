# 🤖 Chat Interno con Memoria, RAG y Generador de Prompts

Sistema de chat interno empresarial con capacidades avanzadas de memoria, recuperación de información (RAG) y generación automática de prompts para agentes de IA.

## 🚀 Características Principales

- **💬 Chat Interno Multi-tenant**: Sistema de chat por empresa con aislamiento completo
- **🧠 Memoria Inteligente**: Sistema de memoria en capas (reciente, resumen progresivo, hechos de empresa)
- **🔍 RAG (Retrieval Augmented Generation)**: Búsqueda semántica en base de conocimiento
- **🎯 Generador de Prompts**: Creación automática de prompts personalizados para agentes de IA
- **📋 Historial de Conversaciones**: Lista completa de hilos con resúmenes inteligentes
- **🔐 RBAC**: Control de acceso basado en roles (Admin, Editor, Agent, Viewer)
- **🌐 Multi-threading**: Soporte para múltiples hilos de conversación por usuario

## 📁 Estructura del Proyecto

```
src/
├── controllers/
│   └── chatInternal.controller.ts    # Controlador principal del chat interno
├── models/
│   ├── thread.model.ts               # Modelo de hilos de conversación
│   ├── message.model.ts              # Modelo de mensajes
│   ├── companyMemory.model.ts        # Memoria global de empresa
│   ├── kbDoc.model.ts                # Documentos de base de conocimiento
│   └── promptVersion.model.ts        # Versiones de prompts generados
├── services/
│   ├── rag.service.ts                # Servicio de RAG y búsqueda semántica
│   ├── memory.service.ts             # Gestión de memoria y contexto
│   └── promptBuilder.service.ts      # Generación de prompts personalizados
├── routes/
│   └── chatInternal.routes.ts        # Rutas del API
└── config/
    └── environments.ts               # Configuración de entornos
```

## 🛠️ Instalación

1. **Clonar el repositorio**
```bash
git clone <repository-url>
cd api-virtual-voices
```

2. **Instalar dependencias**
```bash
npm install
```

3. **Configurar variables de entorno**
```bash
cp chat-internal.env.example .env
# Editar .env con tus credenciales
```

4. **Compilar TypeScript**
```bash
npm run build
```

5. **Ejecutar en desarrollo**
```bash
npm run dev
```

## 🔧 Configuración

### Variables de Entorno Requeridas

```env
# OpenAI
OPENAI_API_KEY=sk-...

# MongoDB con Atlas Vector Search
MONGODB_URI=mongodb+srv://...
VECTOR_INDEX_NAME=kb_vec

# Modelos
EMBEDDING_MODEL=text-embedding-3-large
CHAT_MODEL=gpt-4o-mini

# Configuración de Memoria
MAX_RECENT_MESSAGES=16
TOKEN_BUDGET=7000
```

## 📚 API Endpoints

### Hilos de Conversación
- `POST /api/chat-internal/:c_name/threads` - Crear nuevo hilo
- `GET /api/chat-internal/:c_name/threads` - Listar hilos con historial
- `GET /api/chat-internal/:c_name/threads/:threadId/summary` - Resumen detallado
- `GET /api/chat-internal/:c_name/threads/:threadId/messages` - Mensajes del hilo

### Mensajes
- `POST /api/chat-internal/:c_name/threads/:threadId/messages` - Enviar mensaje

### Memoria de Empresa
- `PUT /api/chat-internal/:c_name/company/facts` - Actualizar hechos de empresa

### Generación de Prompts
- `POST /api/chat-internal/:c_name/prompts/generate` - Generar prompt personalizado
- `POST /api/chat-internal/:c_name/prompts/publish` - Publicar prompt

### RAG (Base de Conocimiento)
- `POST /api/chat-internal/:c_name/rag/upsert` - Subir documento
- `POST /api/chat-internal/:c_name/rag/search` - Buscar en base de conocimiento
- `POST /api/chat-internal/:c_name/rag/reindex` - Reindexar colección

## 🧪 Pruebas

### Crear un hilo de conversación
```bash
curl -X POST "http://localhost:3001/api/chat-internal/quicklearning/threads" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "USER_ID",
    "personaId": "PERSONA_ID",
    "state": {
      "objective": "Chat interno genérico",
      "tone": "profesional",
      "summaryMode": "smart"
    }
  }'
```

### Enviar mensaje
```bash
curl -X POST "http://localhost:3001/api/chat-internal/quicklearning/threads/THREAD_ID/messages" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Hola, ¿puedes ayudarme?",
    "role": "user"
  }'
```

### Listar historial de conversaciones
```bash
curl -X GET "http://localhost:3001/api/chat-internal/quicklearning/threads?limit=10"
```

## 🎨 Integración Frontend

El sistema está diseñado para integrarse fácilmente con cualquier frontend. Incluye:

- **Componentes React** listos para usar
- **API Client** con TypeScript
- **Estilos CSS** incluidos
- **Hooks personalizados** para gestión de estado

Ver documentación completa en los archivos de guía del frontend.

## 🔐 Seguridad

- **Aislamiento por empresa**: Cada empresa tiene su propio espacio de datos
- **RBAC**: Control de acceso granular por roles
- **Validación de entrada**: Sanitización de todos los inputs
- **Rate limiting**: Protección contra abuso
- **Audit trail**: Registro completo de actividades

## 📊 Monitoreo

- **Logs estructurados**: Para debugging y monitoreo
- **Métricas de uso**: Tokens, costos, rendimiento
- **Health checks**: Endpoints de estado del sistema
- **Error tracking**: Captura y reporte de errores

## 🤝 Contribución

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Ver `LICENSE` para más detalles.

## 📞 Soporte

Para soporte técnico o preguntas:
- Crear un issue en GitHub
- Contactar al equipo de desarrollo
- Revisar la documentación completa

---

**Desarrollado con ❤️ para Virtual Voices**

