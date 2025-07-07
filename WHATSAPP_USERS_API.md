# WhatsApp Users API - Documentación Frontend

## 📱 Endpoint Principal

### Obtener Usuarios de Múltiples Tablas
```http
GET /api/whatsapp/usuarios/{c_name}?tableSlugs={tablas}
```

---

## 🔗 URLs de Ejemplo

### Buscar en prospectos y clientes
```http
GET http://localhost:3001/api/whatsapp/usuarios/grupo-milkasa?tableSlugs=prospectos,clientes
```

### Buscar solo en prospectos
```http
GET http://localhost:3001/api/whatsapp/usuarios/grupo-milkasa?tableSlugs=prospectos
```

### Buscar solo en clientes
```http
GET http://localhost:3001/api/whatsapp/usuarios/grupo-milkasa?tableSlugs=clientes
```

---

## 📋 Parámetros

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `c_name` | string | ✅ | Nombre de la empresa (ej: `grupo-milkasa`) |
| `tableSlugs` | string | ✅ | Tablas separadas por coma (ej: `prospectos,clientes`) |

---

## 📤 Respuesta Exitosa

### Estructura de Respuesta
```json
{
  "success": true,
  "usuarios": [
    {
      "_id": "68673a79f95ec6bf44380fe2",
      "name": "Mi Loquita ❣️",
      "phone": "5214525186936@c.us",
      "lastMessage": {
        "body": "Pero las de enfermería no terminan",
        "direction": "inbound",
        "respondedBy": "user",
        "date": "2025-07-04T06:13:21.884Z",
        "_id": "68677101cf3a6075c6f9651c"
      },
      "tableSlug": "clientes",
      "botActive": true,
      "totalMessages": 19,
      "createdAt": "2025-07-04T02:20:41.102Z",
      "updatedAt": "2025-07-04T06:13:21.888Z"
    }
  ],
  "total": 1,
  "tables": ["prospectos", "clientes"]
}
```

### Campos del Usuario

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `_id` | string | ID único del chat |
| `name` | string | Nombre del contacto |
| `phone` | string | **Número limpio sin @c.us** (ej: `5214521311888`) |
| `phoneWithSuffix` | string | Número completo con @c.us para compatibilidad |
| `lastMessage` | object/null | Último mensaje del chat |
| `tableSlug` | string | Tabla de origen (`prospectos` o `clientes`) |
| `botActive` | boolean | Si el bot está activo para este usuario |
| `totalMessages` | number | Total de mensajes en el chat |
| `createdAt` | string | Fecha de creación del chat |
| `updatedAt` | string | Fecha de última actualización |

### Campos del Último Mensaje

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `body` | string | Contenido del mensaje |
| `direction` | string | `inbound` (recibido) o `outbound-api` (enviado por IA) |
| `respondedBy` | string | `user` (usuario) o `bot` (IA) |
| `date` | string | Fecha del mensaje |
| `_id` | string | ID único del mensaje |

---

## ❌ Respuesta de Error

### Error 400 - Parámetros faltantes
```json
{
  "error": "tableSlugs query param is required"
}
```

### Error 500 - Error interno
```json
{
  "error": "Internal server error"
}
```

---

## 💡 Casos de Uso Frontend

### 1. Lista de Usuarios
```javascript
// Obtener todos los usuarios de prospectos y clientes
const response = await fetch('/api/whatsapp/usuarios/grupo-milkasa?tableSlugs=prospectos,clientes');
const data = await response.json();

// Mostrar lista de usuarios
data.usuarios.forEach(usuario => {
  console.log(`${usuario.name} - ${usuario.lastMessage?.body || 'Sin mensajes'}`);
});
```

### 2. Filtrar por Tabla
```javascript
// Solo prospectos
const prospectos = data.usuarios.filter(u => u.tableSlug === 'prospectos');

// Solo clientes
const clientes = data.usuarios.filter(u => u.tableSlug === 'clientes');
```

### 3. Mostrar Preview de Mensaje
```javascript
// Mostrar último mensaje o placeholder
const getMessagePreview = (usuario) => {
  if (usuario.lastMessage) {
    return usuario.lastMessage.body.substring(0, 50) + '...';
  }
  return 'Sin mensajes';
};
```

### 4. Indicador de Actividad
```javascript
// Mostrar si el usuario tiene mensajes recientes
const hasRecentActivity = (usuario) => {
  return usuario.totalMessages > 0;
};
```

### 5. Estado del Bot
```javascript
// Mostrar si el bot está activo
const isBotActive = (usuario) => {
  return usuario.botActive;
};
```

---

## 🔄 Migración Automática

**Característica importante**: Si un usuario se mueve de una tabla a otra (ej: de `prospectos` a `clientes`), aparecerá automáticamente en la nueva tabla sin necesidad de refrescar la lista.

---

## 📱 Endpoints Relacionados

### Obtener Usuario Específico por Teléfono
```http
GET /api/whatsapp/usuarios/{c_name}/{phone}
```

**Ejemplo:**
```http
GET http://localhost:3001/api/whatsapp/usuarios/grupo-milkasa/5214525186936
```

**Características:**
- ✅ Acepta números con o sin `@c.us`
- ✅ Devuelve número limpio en `phone`
- ✅ Incluye `phoneWithSuffix` para compatibilidad

### Obtener Mensajes de un Chat Específico
```http
GET /api/whatsapp/messages/{c_name}/{phone}
```

### Obtener Todos los Chats
```http
GET /api/whatsapp/messages/{c_name}
```

---

## 🚀 Ejemplo Completo Frontend

```javascript
class WhatsAppUsersAPI {
  constructor(companyName) {
    this.companyName = companyName;
    this.baseURL = '/api/whatsapp';
  }

  // Obtener usuarios de múltiples tablas
  async getUsers(tableSlugs = ['prospectos', 'clientes']) {
    try {
      const response = await fetch(
        `${this.baseURL}/usuarios/${this.companyName}?tableSlugs=${tableSlugs.join(',')}`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error obteniendo usuarios:', error);
      throw error;
    }
  }

  // Obtener usuarios de una tabla específica
  async getUsersByTable(tableSlug) {
    return this.getUsers([tableSlug]);
  }

  // Obtener un usuario específico por teléfono
  async getUserByPhone(phone) {
    try {
      const response = await fetch(
        `${this.baseURL}/usuarios/${this.companyName}/${phone}`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error obteniendo usuario:', error);
      throw error;
    }
  }

  // Obtener mensajes de un usuario específico
  async getUserMessages(phone) {
    try {
      const response = await fetch(
        `${this.baseURL}/messages/${this.companyName}/${phone}`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error obteniendo mensajes:', error);
      throw error;
    }
  }
}

// Uso
const api = new WhatsAppUsersAPI('grupo-milkasa');

// Obtener todos los usuarios
const allUsers = await api.getUsers();

// Obtener solo prospectos
const prospectos = await api.getUsersByTable('prospectos');

// Obtener un usuario específico por teléfono (con o sin @c.us)
const user = await api.getUserByPhone('5214525186936');

// Obtener mensajes de un usuario
const messages = await api.getUserMessages('5214521311888@c.us');
```

---

## 📝 Notas Importantes

1. **Formato de teléfono**: Los números se devuelven **limpios sin @c.us** (ej: `5214521311888`)
2. **Compatibilidad**: Se incluye `phoneWithSuffix` con el formato completo para compatibilidad
3. **Búsqueda flexible**: Puedes buscar con o sin `@c.us` (ej: `5214525186936` o `5214525186936@c.us`)
4. **Migración automática**: Los usuarios aparecen en la tabla actual automáticamente
5. **Mensajes vacíos**: Si no hay mensajes, `lastMessage` será `null`
6. **Estado del bot**: `botActive` indica si el bot puede responder a este usuario
7. **Orden**: Los usuarios se devuelven en orden de creación (más recientes primero)

---

## 🔧 Configuración Frontend

### Headers Requeridos
```javascript
const headers = {
  'Content-Type': 'application/json'
};
```

### Manejo de Errores
```javascript
try {
  const data = await api.getUsers();
  // Procesar datos
} catch (error) {
  console.error('Error:', error);
  // Mostrar mensaje de error al usuario
}
``` 