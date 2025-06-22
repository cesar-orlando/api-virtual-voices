# Guía de Entornos - Virtual Voices API

## Descripción General

El sistema ahora soporta múltiples entornos (development, qa, production) con configuraciones independientes para cada uno. Esto permite trabajar con diferentes bases de datos y configuraciones según el entorno.

## 🚀 **Scripts Disponibles**

### **Desarrollo:**
```bash
yarn dev
```
- **Entorno**: Development
- **Puerto**: 3000
- **Base de datos**: MONGO_URI_DEV
- **CORS**: http://localhost:3000

### **QA:**
```bash
yarn qa
```
- **Entorno**: QA
- **Puerto**: 3001
- **Base de datos**: MONGO_URI_QA
- **CORS**: http://localhost:3001

### **Producción:**
```bash
yarn prod
```
- **Entorno**: Production
- **Puerto**: 3002
- **Base de datos**: MONGO_URI_PROD
- **CORS**: https://yourdomain.com

## 📋 **Configuración de Variables de Entorno**

### **1. Crear archivo `.env`:**
Copia el archivo `env.example` y renómbralo a `.env`:

```bash
cp env.example .env
```

### **2. Configurar variables por entorno:**

#### **Desarrollo (DEV):**
```env
NODE_ENV=development
MONGO_URI_DEV=mongodb://localhost:27017
CORS_ORIGIN_DEV=http://localhost:3000
JWT_SECRET_DEV=dev-secret-key-change-this
OPENAI_API_KEY_DEV=your-openai-api-key-dev
```

#### **QA:**
```env
NODE_ENV=qa
MONGO_URI_QA=mongodb://localhost:27017
CORS_ORIGIN_QA=http://localhost:3001
JWT_SECRET_QA=qa-secret-key-change-this
OPENAI_API_KEY_QA=your-openai-api-key-qa
```

#### **Producción (PROD):**
```env
NODE_ENV=production
MONGO_URI_PROD=mongodb://localhost:27017
CORS_ORIGIN_PROD=https://yourdomain.com
JWT_SECRET_PROD=prod-secret-key-change-this
OPENAI_API_KEY_PROD=your-openai-api-key-prod
```

## 🔧 **Configuración de Base de Datos**

### **Ejemplos de Configuración:**

#### **MongoDB Local:**
```env
MONGO_URI_DEV=mongodb://localhost:27017
MONGO_URI_QA=mongodb://localhost:27017
MONGO_URI_PROD=mongodb://localhost:27017
```

#### **MongoDB Atlas:**
```env
MONGO_URI_DEV=mongodb+srv://username:password@cluster-dev.mongodb.net
MONGO_URI_QA=mongodb+srv://username:password@cluster-qa.mongodb.net
MONGO_URI_PROD=mongodb+srv://username:password@cluster-prod.mongodb.net
```

#### **MongoDB con Autenticación:**
```env
MONGO_URI_DEV=mongodb://username:password@localhost:27017
MONGO_URI_QA=mongodb://username:password@localhost:27017
MONGO_URI_PROD=mongodb://username:password@localhost:27017
```

## 🎯 **Casos de Uso**

### **1. Desarrollo Local:**
```bash
# Configurar variables de entorno para desarrollo
echo "NODE_ENV=development" > .env
echo "MONGO_URI_DEV=mongodb://localhost:27017" >> .env
echo "CORS_ORIGIN_DEV=http://localhost:3000" >> .env

# Iniciar servidor de desarrollo
yarn dev
```

### **2. Testing en QA:**
```bash
# Configurar variables de entorno para QA
echo "NODE_ENV=qa" > .env
echo "MONGO_URI_QA=mongodb://localhost:27017" >> .env
echo "CORS_ORIGIN_QA=http://localhost:3001" >> .env

# Iniciar servidor de QA
yarn qa
```

### **3. Producción:**
```bash
# Configurar variables de entorno para producción
echo "NODE_ENV=production" > .env
echo "MONGO_URI_PROD=mongodb+srv://user:pass@cluster.mongodb.net" >> .env
echo "CORS_ORIGIN_PROD=https://yourdomain.com" >> .env

# Iniciar servidor de producción
yarn prod
```

## 📊 **Logs de Entorno**

### **Al iniciar el servidor verás:**
```
🚀 Starting Virtual Voices API in DEVELOPMENT mode
📊 Environment: development
🌐 Port: 3000
🔗 CORS Origin: http://localhost:3000
🗄️  MongoDB URI: mongodb://***:***@localhost:27017
🔐 JWT Secret: Configured
🤖 OpenAI API Key: Configured
──────────────────────────────────────────────────
✅ Connected to MongoDB
🗄️  Database: mongodb://localhost:27017
🌍 Environment: DEVELOPMENT
🚀 Servidor corriendo en http://localhost:3000
🌍 Entorno: DEVELOPMENT
📱 Iniciando 0 sesiones de WhatsApp...
```

## 🔄 **Scripts de Build**

### **Build para diferentes entornos:**
```bash
# Build para desarrollo
yarn build:dev

# Build para QA
yarn build:qa

# Build para producción
yarn build:prod
```

### **Start para diferentes entornos:**
```bash
# Start para desarrollo
yarn start:dev

# Start para QA
yarn start:qa

# Start para producción
yarn start:prod
```

## 🛠️ **Configuración Avanzada**

### **1. Configuración de CORS por Entorno:**
```typescript
// En src/app.ts
const config = getEnvironmentConfig();
app.use(cors({
  origin: config.corsOrigin,
  credentials: true
}));
```

### **2. Configuración de JWT por Entorno:**
```typescript
// En cualquier servicio que use JWT
const config = getEnvironmentConfig();
const token = jwt.sign(payload, config.jwtSecret);
```

### **3. Configuración de OpenAI por Entorno:**
```typescript
// En servicios de IA
const config = getEnvironmentConfig();
const openai = new OpenAI({
  apiKey: config.openaiApiKey
});
```

## 🔍 **Verificación de Configuración**

### **Endpoint de Información del Sistema:**
```bash
curl http://localhost:3000/
```

**Response:**
```json
{
  "status": "ok",
  "code": 200,
  "message": "Sistema operativo: Virtual Voices Node Engine v2.4",
  "uptime": "123s",
  "trace": "XJ-85::Verified",
  "environment": "development",
  "database": "mongodb://localhost:27017"
}
```

### **Verificar Variables de Entorno:**
```bash
# Verificar entorno actual
echo $NODE_ENV

# Verificar variables de MongoDB
echo $MONGO_URI_DEV
echo $MONGO_URI_QA
echo $MONGO_URI_PROD
```

## 🚨 **Consideraciones de Seguridad**

### **1. Secrets por Entorno:**
- ✅ Cada entorno tiene su propio JWT_SECRET
- ✅ Cada entorno tiene su propia API_KEY de OpenAI
- ✅ Las credenciales de base de datos son independientes

### **2. CORS Configurado:**
- ✅ Desarrollo: http://localhost:3000
- ✅ QA: http://localhost:3001
- ✅ Producción: https://yourdomain.com

### **3. Puertos Diferentes:**
- ✅ Desarrollo: 3000
- ✅ QA: 3001
- ✅ Producción: 3002

## 📝 **Ejemplos de Uso Práctico**

### **1. Desarrollo con Base de Datos Local:**
```bash
# .env
NODE_ENV=development
MONGO_URI_DEV=mongodb://localhost:27017
CORS_ORIGIN_DEV=http://localhost:3000
JWT_SECRET_DEV=dev-secret-123
OPENAI_API_KEY_DEV=sk-dev-key

# Iniciar
yarn dev
```

### **2. QA con Base de Datos Remota:**
```bash
# .env
NODE_ENV=qa
MONGO_URI_QA=mongodb+srv://qa-user:qa-pass@cluster-qa.mongodb.net
CORS_ORIGIN_QA=http://localhost:3001
JWT_SECRET_QA=qa-secret-456
OPENAI_API_KEY_QA=sk-qa-key

# Iniciar
yarn qa
```

### **3. Producción con Base de Datos de Producción:**
```bash
# .env
NODE_ENV=production
MONGO_URI_PROD=mongodb+srv://prod-user:prod-pass@cluster-prod.mongodb.net
CORS_ORIGIN_PROD=https://api.yourdomain.com
JWT_SECRET_PROD=prod-secret-789
OPENAI_API_KEY_PROD=sk-prod-key

# Iniciar
yarn prod
```

## 🎉 **Beneficios del Sistema de Entornos**

1. **Separación de Datos**: Cada entorno tiene su propia base de datos
2. **Configuración Independiente**: CORS, puertos, secrets diferentes por entorno
3. **Desarrollo Seguro**: No hay riesgo de afectar datos de producción
4. **Testing Aislado**: QA tiene su propio entorno para pruebas
5. **Deployment Fácil**: Scripts específicos para cada entorno
6. **Logging Claro**: Identificación clara del entorno en los logs

¡Ahora puedes trabajar con diferentes entornos de manera segura y organizada! 