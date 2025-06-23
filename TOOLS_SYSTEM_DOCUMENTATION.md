# Sistema de Herramientas Dinámicas - CRM con OpenAI

## 📋 Descripción General

El Sistema de Herramientas Dinámicas permite a cada empresa crear, configurar y gestionar sus propias herramientas para automatizar procesos de ventas y atención al cliente, integradas con OpenAI Function Calling.

## 🏗️ Arquitectura del Sistema

### Componentes Principales

1. **Modelos de Datos**
   - `Tool`: Herramienta principal
   - `ToolExecution`: Logging de ejecuciones
   - `ToolCategory`: Categorías de herramientas

2. **Servicios**
   - `ToolExecutor`: Ejecutor de herramientas HTTP
   - `ToolValidator`: Validador de seguridad y schemas
   - `OpenAI Service`: Integración con OpenAI Function Calling

3. **Controladores y Rutas**
   - CRUD completo de herramientas
   - Validación y testing
   - Analytics y logging

## 📊 Modelo de Datos

### Herramienta (Tool)

```typescript
interface ITool {
  _id: ObjectId;
  name: string;                    // "get_properties_1_2m", "register_customer"
  displayName: string;             // "Buscar Propiedades $1.2M", "Registrar Cliente"
  description: string;             // Descripción para OpenAI
  category: string;                // "real_estate", "promotions", "data_collection"
  isActive: boolean;
  c_name: string;                  // Empresa propietaria
  createdBy: ObjectId;
  updatedBy?: ObjectId;
  
  config: {
    endpoint: string;              // URL del endpoint
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    headers?: Record<string, string>;
    authType?: 'none' | 'api_key' | 'bearer' | 'basic';
    authConfig?: {
      apiKey?: string;
      bearerToken?: string;
      username?: string;
      password?: string;
    };
    timeout?: number;              // Timeout en ms (default: 10000)
  };
  
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: 'string' | 'number' | 'boolean' | 'array';
      description: string;
      required?: boolean;
      enum?: string[];
      format?: string;             // "email", "phone", "date"
    }>;
    required: string[];
  };
  
  responseMapping?: {
    successPath?: string;          // "data.properties"
    errorPath?: string;            // "error.message"
    transformFunction?: string;    // Función JS para transformar respuesta
  };
  
  security: {
    rateLimit?: {
      requests: number;
      window: string;              // "1h", "1d"
    };
    allowedDomains?: string[];     // Whitelist de dominios
    maxTimeout?: number;           // Timeout máximo
  };
  
  createdAt: Date;
  updatedAt: Date;
}
```

## 🚀 API Endpoints

### CRUD Básico

#### Crear Herramienta
```http
POST /api/tools
Content-Type: application/json

{
  "name": "get_properties_1_2m",
  "displayName": "Buscar Propiedades $1.2M",
  "description": "Busca propiedades disponibles por $1,200,000 en la zona especificada",
  "category": "real_estate",
  "c_name": "inmobiliaria_abc",
  "createdBy": "user123",
  "config": {
    "endpoint": "https://api.inmobiliaria.com/properties",
    "method": "GET",
    "headers": { "Authorization": "Bearer ${API_KEY}" },
    "timeout": 15000
  },
  "parameters": {
    "type": "object",
    "properties": {
      "location": { 
        "type": "string", 
        "description": "Zona de interés (ej: Polanco, Condesa)",
        "required": true 
      },
      "bedrooms": { 
        "type": "number", 
        "description": "Número de recámaras mínimo",
        "required": false 
      }
    },
    "required": ["location"]
  },
  "security": {
    "rateLimit": {
      "requests": 100,
      "window": "1h"
    }
  }
}
```

#### Listar Herramientas
```http
GET /api/tools/{c_name}?page=1&limit=10&category=real_estate&isActive=true
```

#### Obtener Herramienta
```http
GET /api/tools/{c_name}/{tool_id}
```

#### Actualizar Herramienta
```http
PUT /api/tools/{c_name}/{tool_id}
Content-Type: application/json

{
  "displayName": "Nuevo nombre",
  "updatedBy": "user123"
}
```

#### Eliminar Herramienta (Soft Delete)
```http
DELETE /api/tools/{c_name}/{tool_id}
```

#### Activar/Desactivar Herramienta
```http
PATCH /api/tools/{c_name}/{tool_id}/status
Content-Type: application/json

{
  "isActive": false
}
```

### Gestión de Categorías

#### Listar Categorías
```http
GET /api/tools/{c_name}/categories/list
```

#### Crear Categoría
```http
POST /api/tools/categories
Content-Type: application/json

{
  "name": "custom_category",
  "displayName": "Categoría Personalizada",
  "description": "Descripción de la categoría",
  "c_name": "empresa_abc"
}
```

### Testing y Validación

#### Probar Herramienta
```http
POST /api/tools/{c_name}/{tool_id}/test
Content-Type: application/json

{
  "testParameters": {
    "location": "Polanco",
    "bedrooms": 2
  }
}
```

#### Validar Schema de Parámetros
```http
POST /api/tools/validate-schema
Content-Type: application/json

{
  "parameters": {
    "type": "object",
    "properties": {
      "name": {
        "type": "string",
        "description": "Nombre del cliente"
      }
    },
    "required": ["name"]
  }
}
```

#### Validar Endpoint
```http
POST /api/tools/validate-endpoint
Content-Type: application/json

{
  "endpoint": "https://api.example.com/test",
  "method": "GET",
  "timeout": 5000
}
```

### Ejecución de Herramientas

#### Ejecutar Herramienta Individual
```http
POST /api/tools/execute
Content-Type: application/json

{
  "toolName": "get_properties_1_2m",
  "parameters": {
    "location": "Polanco",
    "bedrooms": 2
  },
  "c_name": "inmobiliaria_abc",
  "executedBy": "user123"
}
```

#### Ejecutar Múltiples Herramientas
```http
POST /api/tools/batch-execute
Content-Type: application/json

{
  "tools": [
    {
      "toolName": "get_properties_1_2m",
      "parameters": { "location": "Polanco" }
    },
    {
      "toolName": "register_customer_interest",
      "parameters": { "name": "Juan Pérez", "phone": "555-1234" }
    }
  ],
  "c_name": "inmobiliaria_abc",
  "executedBy": "user123"
}
```

### Integración OpenAI

#### Obtener Schema para OpenAI
```http
GET /api/tools/openai-schema/{c_name}
```

**Respuesta:**
```json
{
  "c_name": "inmobiliaria_abc",
  "toolsCount": 2,
  "schema": [
    {
      "type": "function",
      "function": {
        "name": "get_properties_1_2m",
        "description": "Busca propiedades disponibles por $1,200,000",
        "parameters": {
          "type": "object",
          "properties": {
            "location": {
              "type": "string",
              "description": "Zona de interés"
            }
          },
          "required": ["location"]
        }
      }
    }
  ]
}
```

### Analytics y Monitoreo

#### Obtener Analytics de Uso
```http
GET /api/tools/analytics/{c_name}?startDate=2024-01-01&endDate=2024-01-31
```

#### Obtener Logs de Ejecución
```http
GET /api/tools/logs/{c_name}/{tool_id}?page=1&limit=50
```

## 🔒 Seguridad y Validaciones

### Dominios Permitidos
```typescript
const ALLOWED_DOMAINS = [
  'api.inmobiliaria.com',
  'api.promociones.com',
  'api.crm.com',
  'api.trusted-partners.com'
];
```

### Parámetros Prohibidos
```typescript
const FORBIDDEN_PARAMETERS = [
  'script', 'eval', 'exec', 'system',
  'password', 'token', 'secret', 'key'
];
```

### Rate Limiting por Empresa
```typescript
const COMPANY_LIMITS = {
  'empresa_a': { requests: 500, window: '1h' },
  'empresa_b': { requests: 1000, window: '1h' }
};
```

## 🧪 Ejemplos de Uso

### Ejemplo 1: Herramienta de Propiedades Inmobiliarias

```json
{
  "name": "get_properties_1_2m",
  "displayName": "Buscar Propiedades $1.2M",
  "description": "Busca propiedades disponibles por $1,200,000 en la zona especificada",
  "category": "real_estate",
  "c_name": "inmobiliaria_abc",
  "config": {
    "endpoint": "https://api.inmobiliaria.com/properties",
    "method": "GET",
    "headers": { "Authorization": "Bearer TOKEN" },
    "timeout": 15000
  },
  "parameters": {
    "type": "object",
    "properties": {
      "location": { 
        "type": "string", 
        "description": "Zona de interés (ej: Polanco, Condesa)"
      },
      "bedrooms": { 
        "type": "number", 
        "description": "Número de recámaras mínimo"
      },
      "maxPrice": { 
        "type": "number", 
        "description": "Precio máximo en pesos"
      }
    },
    "required": ["location"]
  },
  "responseMapping": {
    "successPath": "data.properties",
    "errorPath": "error.message"
  }
}
```

### Ejemplo 2: Herramienta de Registro de Clientes

```json
{
  "name": "register_customer_data",
  "displayName": "Registrar Datos Cliente",
  "description": "Registra información del cliente en el CRM de la empresa",
  "category": "data_collection",
  "c_name": "inmobiliaria_abc",
  "config": {
    "endpoint": "/api/customers",
    "method": "POST",
    "headers": { "Content-Type": "application/json" }
  },
  "parameters": {
    "type": "object",
    "properties": {
      "name": { 
        "type": "string", 
        "description": "Nombre completo del cliente"
      },
      "phone": { 
        "type": "string", 
        "description": "Número de teléfono",
        "format": "phone"
      },
      "email": { 
        "type": "string", 
        "description": "Correo electrónico",
        "format": "email"
      },
      "interest": { 
        "type": "string", 
        "description": "Producto de interés",
        "enum": ["casa", "departamento", "terreno", "oficina"]
      },
      "budget": { 
        "type": "number", 
        "description": "Presupuesto en pesos"
      }
    },
    "required": ["name", "phone", "interest"]
  }
}
```

## 🔧 Integración con OpenAI

### Configuración en el Chat

```typescript
import { generateResponse, getToolsForCompany } from './services/openai';

// En el controlador de WhatsApp
const tools = await getToolsForCompany(c_name);
const response = await generateResponse(
  prompt,
  iaConfig,
  chatHistory,
  records,
  c_name,
  userId
);
```

### Ejecución Automática de Herramientas

Cuando OpenAI decide usar una herramienta:

1. **OpenAI Function Call**: OpenAI decide qué herramienta usar
2. **Validación**: Se valida la herramienta y parámetros
3. **Ejecución**: Se ejecuta el HTTP request
4. **Logging**: Se registra la ejecución
5. **Respuesta**: Se devuelve el resultado a OpenAI
6. **Continuación**: OpenAI usa el resultado para generar respuesta final

## 📈 Monitoreo y Analytics

### Métricas Disponibles

- **Ejecuciones Totales**: Número total de veces que se ejecutó cada herramienta
- **Tasa de Éxito**: Porcentaje de ejecuciones exitosas vs fallidas
- **Tiempo de Respuesta**: Tiempo promedio de ejecución por herramienta
- **Uso por Empresa**: Estadísticas de uso por empresa
- **Rate Limiting**: Monitoreo de límites de uso

### Dashboard de Analytics

```typescript
// Ejemplo de respuesta de analytics
{
  "c_name": "inmobiliaria_abc",
  "period": { 
    "startDate": "2024-01-01", 
    "endDate": "2024-01-31" 
  },
  "stats": [
    {
      "_id": "get_properties_1_2m",
      "totalExecutions": 150,
      "successfulExecutions": 142,
      "failedExecutions": 8,
      "averageExecutionTime": 1250,
      "lastExecuted": "2024-01-31T10:30:00Z"
    }
  ]
}
```

## 🚨 Manejo de Errores

### Tipos de Errores

1. **Validación**: Errores de formato o campos requeridos
2. **Seguridad**: Dominios no permitidos, rate limiting
3. **Conectividad**: Timeouts, endpoints no disponibles
4. **Autenticación**: Credenciales inválidas
5. **Datos**: Respuestas malformadas

### Respuestas de Error Estándar

```json
{
  "success": false,
  "error": "Rate limit exceeded. Try again in 300 seconds.",
  "statusCode": 429,
  "executionTime": 1250
}
```

## 🔄 Circuit Breaker Pattern

Para evitar cascadas de errores, el sistema implementa circuit breaker:

- **Closed**: Funcionamiento normal
- **Open**: Después de 5 errores consecutivos, bloquea requests por 1 minuto
- **Half-Open**: Permite 1 request de prueba después del timeout

## 🎯 Casos de Uso por Industria

### Inmobiliarias
- Búsqueda de propiedades
- Registro de leads
- Cálculo de hipotecas
- Agendamiento de citas

### E-commerce
- Búsqueda de productos
- Verificación de inventario
- Aplicación de descuentos
- Tracking de pedidos

### Servicios
- Agendamiento de citas
- Verificación de disponibilidad
- Envío de cotizaciones
- Seguimiento de casos

## ✅ Criterios de Aceptación Completados

- [x] Tools se crean, editan y eliminan correctamente por empresa
- [x] Integración con OpenAI funciona sin errores
- [x] Validaciones de seguridad bloquean requests maliciosos
- [x] Rate limiting funciona por empresa
- [x] Logging completo de todas las operaciones
- [x] Manejo de errores con fallbacks apropiados
- [x] Performance aceptable (< 2s por ejecución)
- [x] Código limpio y bien documentado

## 🚀 Instalación y Configuración

### 1. Dependencias
```bash
npm install
```

### 2. Variables de Entorno
```env
OPENAI_API_KEY=sk-...
MONGODB_URI=mongodb://localhost:27017/crm
```

### 3. Migración de Base de Datos
Las colecciones se crean automáticamente al usar las herramientas por primera vez.

### 4. Configuración de Dominios Permitidos
Editar `src/types/tool.types.ts` para agregar dominios permitidos:

```typescript
export const ALLOWED_DOMAINS = [
  'api.tu-empresa.com',
  'api.partner.com'
];
```

## 🔮 Roadmap Futuro

### v2.0 - Herramientas Avanzadas
- [ ] Herramientas con múltiples pasos
- [ ] Workflows condicionales
- [ ] Integración con Webhooks

### v2.1 - AI Enhancement
- [ ] Auto-generación de herramientas por IA
- [ ] Optimización automática de parámetros
- [ ] Predicción de uso de herramientas

### v2.2 - Enterprise Features
- [ ] SSO Integration
- [ ] Advanced RBAC
- [ ] Multi-tenant isolation
- [ ] Advanced monitoring

## 📞 Soporte

Para soporte técnico, contactar al equipo de desarrollo o revisar los logs en:
- `/api/tools/logs/{c_name}/{tool_id}` para logs específicos
- `/api/tools/analytics/{c_name}` para métricas de uso

---

**Versión**: 1.0.0  
**Última actualización**: Enero 2024  
**Mantenido por**: Equipo de Desarrollo CRM