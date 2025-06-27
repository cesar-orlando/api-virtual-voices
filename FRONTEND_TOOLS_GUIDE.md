# 🛠️ API Endpoints - Sistema de Herramientas

## Base URL
```
/api/tools
```

## 📋 Endpoints Disponibles

### 1. Crear Herramienta
```http
POST /api/tools
```

**Body:**
```json
{
  "name": "search_properties",
  "displayName": "Buscar Propiedades",
  "description": "Busca propiedades disponibles",
  "category": "real_estate",
  "c_name": "mi_empresa",
  "createdBy": "user123",
  "config": {
    "endpoint": "https://api.ejemplo.com/search",
    "method": "GET",
    "headers": { "Authorization": "Bearer TOKEN" },
    "authType": "bearer",
    "timeout": 15000
  },
  "parameters": {
    "type": "object",
    "properties": {
      "location": {
        "type": "string",
        "description": "Zona de interés",
        "required": true
      }
    },
    "required": ["location"]
  }
}
```

**Respuesta:**
```json
{
  "message": "Tool created successfully",
  "tool": { /* herramienta creada */ }
}
```

---

### 2. Listar Herramientas
```http
GET /api/tools/{c_name}
```

**Query Parameters:**
- `page` (number): Página actual (default: 1)
- `limit` (number): Elementos por página (default: 10)
- `category` (string): Filtrar por categoría
- `isActive` (boolean): Solo activas/inactivas
- `sortBy` (string): Campo para ordenar (default: 'createdAt')
- `sortOrder` (string): 'asc' o 'desc' (default: 'desc')

**Ejemplo:**
```http
GET /api/tools/mi_empresa?page=1&limit=20&category=real_estate&isActive=true
```

**Respuesta:**
```json
{
  "tools": [ /* array de herramientas */ ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 50,
    "pages": 3
  }
}
```

---

### 3. Obtener Herramienta Específica
```http
GET /api/tools/{c_name}/{id}
```

**Respuesta:**
```json
{
  "tool": { /* herramienta específica */ }
}
```

---

### 4. Actualizar Herramienta
```http
PUT /api/tools/{c_name}/{id}
```

**Body:**
```json
{
  "displayName": "Nuevo nombre",
  "description": "Nueva descripción",
  "updatedBy": "user123"
}
```

**Respuesta:**
```json
{
  "message": "Tool updated successfully",
  "tool": { /* herramienta actualizada */ }
}
```

---

### 5. Eliminar Herramienta (Soft Delete)
```http
DELETE /api/tools/{c_name}/{id}
```

**Respuesta:**
```json
{
  "message": "Tool deactivated successfully",
  "tool": { /* herramienta desactivada */ }
}
```

---

### 6. Activar/Desactivar Herramienta
```http
PATCH /api/tools/{c_name}/{id}/status
```

**Body:**
```json
{
  "isActive": false
}
```

**Respuesta:**
```json
{
  "message": "Tool deactivated successfully",
  "tool": { /* herramienta actualizada */ }
}
```

---

### 7. Obtener Categorías
```http
GET /api/tools/{c_name}/categories/list
```

**Respuesta:**
```json
{
  "categories": [
    {
      "name": "sales",
      "displayName": "Sales",
      "description": "Tools for sales automation"
    },
    {
      "name": "real_estate",
      "displayName": "Real Estate",
      "description": "Tools for real estate"
    }
  ]
}
```

---

### 8. Crear Categoría
```http
POST /api/tools/categories
```

**Body:**
```json
{
  "name": "custom_category",
  "displayName": "Categoría Personalizada",
  "description": "Descripción de la categoría",
  "c_name": "mi_empresa"
}
```

---

### 9. Validar Schema de Parámetros
```http
POST /api/tools/validate-schema
```

**Body:**
```json
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

**Respuesta:**
```json
{
  "isValid": true,
  "errors": []
}
```

---

### 10. Validar Endpoint
```http
POST /api/tools/validate-endpoint
```

**Body:**
```json
{
  "endpoint": "https://api.ejemplo.com/test",
  "method": "GET",
  "timeout": 5000
}
```

**Respuesta:**
```json
{
  "isValid": true,
  "status": 200,
  "responseTime": 150
}
```

---

### 11. Probar Herramienta
```http
POST /api/tools/{c_name}/{id}/test
```

**Body:**
```json
{
  "testParameters": {
    "location": "Polanco",
    "bedrooms": 2
  }
}
```

**Respuesta:**
```json
{
  "message": "Tool test completed",
  "result": {
    "success": true,
    "data": { /* respuesta del endpoint */ },
    "executionTime": 250
  }
}
```

---

### 12. Ejecutar Herramienta
```http
POST /api/tools/execute
```

**Body:**
```json
{
  "toolName": "search_properties",
  "parameters": {
    "location": "Polanco"
  },
  "c_name": "mi_empresa",
  "executedBy": "user123"
}
```

**Respuesta:**
```json
{
  "message": "Tool executed successfully",
  "result": {
    "success": true,
    "data": { /* respuesta del endpoint */ },
    "executionTime": 300
  }
}
```

---

### 13. Ejecutar Múltiples Herramientas
```http
POST /api/tools/batch-execute
```

**Body:**
```json
{
  "tools": [
    {
      "toolName": "search_properties",
      "parameters": { "location": "Polanco" }
    },
    {
      "toolName": "register_customer",
      "parameters": { "name": "Juan Pérez" }
    }
  ],
  "c_name": "mi_empresa",
  "executedBy": "user123"
}
```

---

### 14. Obtener Schema para OpenAI
```http
GET /api/tools/openai-schema/{c_name}
```

**Respuesta:**
```json
{
  "c_name": "mi_empresa",
  "toolsCount": 2,
  "schema": [
    {
      "type": "function",
      "function": {
        "name": "search_properties",
        "description": "Busca propiedades disponibles",
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

---

### 15. Obtener Analytics
```http
GET /api/tools/analytics/{c_name}
```

**Query Parameters:**
- `startDate` (string): Fecha inicio (YYYY-MM-DD)
- `endDate` (string): Fecha fin (YYYY-MM-DD)

**Respuesta:**
```json
{
  "c_name": "mi_empresa",
  "period": { "startDate": "2024-01-01", "endDate": "2024-01-31" },
  "stats": [
    {
      "_id": "search_properties",
      "totalExecutions": 150,
      "successfulExecutions": 145,
      "failedExecutions": 5,
      "averageExecutionTime": 250,
      "lastExecuted": "2024-01-31T10:30:00Z"
    }
  ]
}
```

---

### 16. Obtener Logs de Ejecución
```http
GET /api/tools/logs/{c_name}/{toolId}
```

**Query Parameters:**
- `page` (number): Página actual (default: 1)
- `limit` (number): Elementos por página (default: 50)

**Respuesta:**
```json
{
  "logs": [
    {
      "toolId": "tool123",
      "toolName": "search_properties",
      "parameters": { "location": "Polanco" },
      "response": {
        "success": true,
        "data": { /* respuesta */ },
        "executionTime": 250
      },
      "executedBy": "user123",
      "createdAt": "2024-01-31T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "pages": 3
  }
}
```

---

## 📊 Códigos de Error

| Código | Descripción |
|--------|-------------|
| 400 | Datos de entrada inválidos |
| 404 | Herramienta no encontrada |
| 409 | El nombre de la herramienta ya existe |
| 403 | No tienes permisos para esta acción |
| 500 | Error interno del servidor |

---

## 🔒 Validaciones Importantes

### Nombres de Herramientas
- Solo letras minúsculas, números y guiones bajos
- Máximo 50 caracteres
- Único por empresa

### Endpoints
- Solo dominios permitidos (whitelist)
- Timeout máximo: 30 segundos

### Parámetros Prohibidos
- `password`, `secret`, `token`, `key`, `auth`, etc.

---

## 📝 Estructura de Datos

### Herramienta
```typescript
interface Tool {
  _id: string;
  name: string;
  displayName: string;
  description: string;
  category: string;
  isActive: boolean;
  c_name: string;
  createdBy: string;
  updatedBy?: string;
  config: {
    endpoint: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    headers?: Record<string, string>;
    authType: 'none' | 'api_key' | 'bearer' | 'basic';
    authConfig?: {
      apiKey?: string;
      bearerToken?: string;
      username?: string;
      password?: string;
    };
    timeout?: number;
  };
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: 'string' | 'number' | 'boolean' | 'array';
      description: string;
      required?: boolean;
      enum?: string[];
      format?: 'email' | 'phone' | 'date' | 'url' | 'uuid';
    }>;
    required: string[];
  };
  responseMapping?: {
    successPath?: string;
    errorPath?: string;
    transformFunction?: string;
  };
  security?: {
    rateLimit?: {
      requests: number;
      window: '1m' | '5m' | '15m' | '1h' | '1d';
    };
    allowedDomains?: string[];
    maxTimeout?: number;
  };
  createdAt: string;
  updatedAt: string;
}
```

---

## 🚀 Ejemplos de Uso

### Crear Herramienta de Búsqueda
```javascript
const response = await fetch('/api/tools', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: "search_properties",
    displayName: "Buscar Propiedades",
    description: "Busca propiedades disponibles",
    category: "real_estate",
    c_name: "mi_empresa",
    createdBy: "user123",
    config: {
      endpoint: "https://api.inmobiliaria.com/search",
      method: "GET",
      headers: { "Authorization": "Bearer TOKEN" }
    },
    parameters: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "Zona de interés",
          required: true
        }
      },
      required: ["location"]
    }
  })
});
```

### Listar Herramientas con Filtros
```javascript
const response = await fetch('/api/tools/mi_empresa?category=real_estate&isActive=true&page=1&limit=20');
const data = await response.json();
console.log(data.tools); // Array de herramientas
console.log(data.pagination); // Info de paginación
```

### Ejecutar Herramienta
```javascript
const response = await fetch('/api/tools/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    toolName: "search_properties",
    parameters: { location: "Polanco" },
    c_name: "mi_empresa",
    executedBy: "user123"
  })
});
``` 