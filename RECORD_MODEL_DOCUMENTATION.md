# Modelo de Registros - Documentación Actualizada

## Descripción General

El modelo de registros ha sido completamente actualizado para usar una estructura de datos dinámica más eficiente y flexible. En lugar de usar un array de campos, ahora utiliza un objeto `data` que permite mejor rendimiento y facilidad de uso.

## Cambios Principales

### Estructura Anterior vs Nueva

**ANTES (Array de fields):**
```javascript
{
  tableSlug: "clientes",
  fields: [
    { name: "nombre", type: "text", value: "Juan Pérez" },
    { name: "email", type: "email", value: "juan@email.com" }
  ]
}
```

**DESPUÉS (Objeto data):**
```javascript
{
  tableSlug: "clientes",
  c_name: "mi-empresa",
  data: {
    nombre: "Juan Pérez",
    email: "juan@email.com",
    telefono: "123456789"
  },
  createdBy: "user123",
  updatedBy: "user456"
}
```

## Nueva Interfaz IRecord

```typescript
export interface IRecord extends Document {
  tableSlug: string;        // Slug de la tabla dinámica asociada
  c_name: string;           // Nombre de la empresa
  data: Record<string, any>; // Objeto dinámico con los datos del registro
  createdBy: string;        // Usuario que creó el registro
  updatedBy?: string;       // Usuario que actualizó el registro
  getFormattedData(): Record<string, any>; // Método de instancia
}
```

## Ventajas de la Nueva Estructura

### 1. **Mejor Rendimiento**
- ✅ Consultas más rápidas en MongoDB
- ✅ Índices más eficientes
- ✅ Menor uso de memoria

### 2. **Más Flexible**
- ✅ Fácil agregar/quitar campos
- ✅ Validación dinámica contra estructura de tabla
- ✅ Mejor escalabilidad

### 3. **Mejor Validación**
- ✅ Validación automática contra estructura de tabla
- ✅ Validación de tipos de datos
- ✅ Validación de campos requeridos

## Funcionalidades del Modelo

### 1. **Índices Optimizados**
```javascript
// Índice compuesto para búsquedas por tabla y empresa
RecordSchema.index({ tableSlug: 1, c_name: 1 });

// Índice para listar registros por empresa ordenados por fecha
RecordSchema.index({ c_name: 1, createdAt: -1 });

// Índice para búsquedas por usuario creador
RecordSchema.index({ createdBy: 1, c_name: 1 });
```

### 2. **Validación Automática**
El modelo incluye un método estático `validateDataAgainstTable` que:
- ✅ Valida que la tabla existe y está activa
- ✅ Verifica campos requeridos
- ✅ Valida tipos de datos según la estructura de la tabla
- ✅ Valida opciones para campos tipo select

### 3. **Método de Formateo**
```javascript
// Obtener datos formateados
const formattedData = record.getFormattedData();
```

## Endpoints de la API

### 1. **Crear Registro** - `POST /api/records`

**Request:**
```json
{
  "tableSlug": "clientes",
  "c_name": "mi-empresa",
  "createdBy": "user123",
  "data": {
    "nombre": "Juan Pérez",
    "email": "juan@email.com",
    "telefono": "123456789",
    "fecha_nacimiento": "1990-01-01",
    "activo": true
  }
}
```

**Validaciones:**
- ✅ Campos requeridos: `tableSlug`, `c_name`, `createdBy`, `data`
- ✅ `data` debe ser un objeto
- ✅ Validación contra estructura de tabla
- ✅ Validación de tipos de datos

### 2. **Obtener Registros** - `GET /api/records/table/:c_name/:tableSlug`

**Query Parameters:**
- `page`: Número de página (default: 1)
- `limit`: Registros por página (default: 10)
- `sortBy`: Campo para ordenar (default: 'createdAt')
- `sortOrder`: Orden ascendente/descendente (default: 'desc')

**Response:**
```json
{
  "records": [...],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "pages": 10
  },
  "table": {
    "name": "Clientes",
    "slug": "clientes",
    "fields": [...]
  }
}
```

### 3. **Buscar Registros** - `POST /api/records/search/:c_name/:tableSlug`

**Request:**
```json
{
  "query": "juan",
  "filters": {
    "activo": true,
    "categoria": "vip"
  },
  "page": 1,
  "limit": 10
}
```

**Funcionalidades:**
- ✅ Búsqueda por texto en campos de texto
- ✅ Filtros específicos por campo
- ✅ Paginación
- ✅ Ordenamiento

### 4. **Estadísticas** - `GET /api/records/stats/:c_name/:tableSlug`

**Response:**
```json
{
  "totalRecords": 1000,
  "recentRecords": 50,
  "dailyStats": [
    { "_id": "2024-01-01", "count": 10 },
    { "_id": "2024-01-02", "count": 15 }
  ],
  "table": {
    "name": "Clientes",
    "slug": "clientes",
    "fieldCount": 8
  }
}
```

### 5. **Actualizar Registro** - `PUT /api/records/:id`

**Request:**
```json
{
  "c_name": "mi-empresa",
  "updatedBy": "user456",
  "data": {
    "nombre": "Juan Pérez Actualizado",
    "email": "juan.nuevo@email.com"
  }
}
```

### 6. **Eliminar Registro** - `DELETE /api/records/:c_name/:id`

Elimina físicamente el registro de la base de datos.

## Validaciones de Tipos de Datos

### Tipos Soportados:
1. **text**: String sin validaciones adicionales
2. **email**: Validación de formato de email
3. **number**: Debe ser número válido
4. **date**: Debe ser fecha válida
5. **boolean**: Debe ser true/false
6. **select**: Debe estar en las opciones permitidas
7. **file**: Para archivos
8. **currency**: Para valores monetarios

### Ejemplo de Validación:
```javascript
// Si la tabla tiene un campo email requerido
const data = {
  nombre: "Juan",
  // email faltante - ERROR
};

// Validación fallará con: "Field 'Email' is required"
```

## Ejemplos de Uso

### Crear Registro de Cliente
```javascript
const clienteData = {
  tableSlug: "clientes",
  c_name: "mi-empresa",
  createdBy: "user123",
  data: {
    nombre: "María García",
    email: "maria@email.com",
    telefono: "987654321",
    fecha_registro: new Date(),
    categoria: "premium",
    activo: true
  }
};
```

### Buscar Clientes Activos
```javascript
const searchData = {
  filters: {
    activo: true,
    categoria: "premium"
  },
  page: 1,
  limit: 20
};
```

### Actualizar Datos de Cliente
```javascript
const updateData = {
  c_name: "mi-empresa",
  updatedBy: "user456",
  data: {
    nombre: "María García López",
    telefono: "987654322",
    categoria: "vip"
  }
};
```

## Consideraciones de Implementación

### 1. **Migración de Datos**
Si tienes datos existentes con la estructura anterior, necesitarás migrarlos:
```javascript
// Ejemplo de migración
const oldRecords = await Record.find({});
for (const record of oldRecords) {
  const newData = {};
  record.fields.forEach(field => {
    newData[field.name] = field.value;
  });
  
  await Record.findByIdAndUpdate(record._id, {
    $set: { data: newData },
    $unset: { fields: 1 }
  });
}
```

### 2. **Autenticación**
Los campos `createdBy` y `updatedBy` deben tomarse del usuario autenticado:
```javascript
// En el middleware de autenticación
req.body.createdBy = req.user.id;
```

### 3. **Validación en Frontend**
Sincronizar las validaciones del frontend con las del backend:
```javascript
// Validar antes de enviar
const validation = await validateData(data, tableStructure);
if (!validation.isValid) {
  // Mostrar errores
}
```

## Mejoras Futuras Sugeridas

1. **Búsqueda Avanzada**: Implementar búsqueda full-text
2. **Filtros Dinámicos**: Filtros basados en la estructura de la tabla
3. **Exportación**: Exportar registros a CSV/Excel
4. **Importación**: Importar registros desde archivos
5. **Historial**: Trackear cambios en los registros
6. **Backup**: Backup automático de registros
7. **Caché**: Implementar caché para consultas frecuentes 