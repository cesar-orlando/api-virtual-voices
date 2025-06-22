# Controlador de Registros - Documentación Actualizada

## Descripción General

El controlador de registros ha sido completamente actualizado para manejar la nueva estructura de datos dinámica con validaciones robustas contra la estructura de tabla y nuevas funcionalidades avanzadas.

## Funciones de Validación

### `validateFieldValue(value, field)`
Valida y transforma el valor de un campo según su tipo:
- ✅ **text/email**: Valida strings y formato de email
- ✅ **number**: Convierte y valida números
- ✅ **date**: Valida fechas válidas
- ✅ **boolean**: Convierte strings y valida booleanos
- ✅ **select**: Valida opciones permitidas
- ✅ **currency**: Valida valores monetarios
- ✅ **file**: Maneja archivos procesados

### `transformAndValidateData(data, table)`
Transforma y valida datos completos contra la estructura de tabla:
- ✅ Valida campos requeridos
- ✅ Aplica valores por defecto
- ✅ Transforma tipos de datos
- ✅ Retorna datos validados

## Endpoints Actualizados

### 1. **Crear Registro** - `POST /api/records`

**Flujo de Validación:**
1. Obtener tabla por `tableSlug` y `c_name`
2. Validar que la tabla existe y está activa
3. Transformar y validar datos contra estructura de tabla
4. Crear registro con datos validados

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
    "activo": true,
    "categoria": "premium"
  }
}
```

**Response:**
```json
{
  "message": "Dynamic record created successfully",
  "record": {
    "_id": "...",
    "tableSlug": "clientes",
    "c_name": "mi-empresa",
    "data": {
      "nombre": "Juan Pérez",
      "email": "juan@email.com",
      "telefono": "123456789",
      "fecha_nacimiento": "1990-01-01T00:00:00.000Z",
      "activo": true,
      "categoria": "premium"
    },
    "createdBy": "user123",
    "createdAt": "2024-01-01T00:00:00.000Z"
  },
  "table": {
    "name": "Clientes",
    "slug": "clientes",
    "fields": [...]
  }
}
```

### 2. **Validar Datos** - `POST /api/records/validate` ⭐ **NUEVO**

Valida datos sin guardar en la base de datos:

**Request:**
```json
{
  "tableSlug": "clientes",
  "c_name": "mi-empresa",
  "data": {
    "nombre": "Juan Pérez",
    "email": "juan@email.com"
  }
}
```

**Response (Éxito):**
```json
{
  "message": "Data validation successful",
  "isValid": true,
  "validatedData": {
    "nombre": "Juan Pérez",
    "email": "juan@email.com",
    "telefono": null
  },
  "table": {
    "name": "Clientes",
    "slug": "clientes",
    "fields": [...]
  }
}
```

**Response (Error):**
```json
{
  "message": "Data validation failed",
  "isValid": false,
  "error": "Campo 'Email' debe ser un email válido"
}
```

### 3. **Obtener Registros** - `GET /api/records/table/:c_name/:tableSlug`

**Query Parameters:**
- `page`: Número de página (default: 1)
- `limit`: Registros por página (default: 10)
- `sortBy`: Campo para ordenar (default: 'createdAt')
- `sortOrder`: Orden ascendente/descendente (default: 'desc')
- `filters`: Filtros JSON stringificados

**Ejemplo con filtros:**
```
GET /api/records/table/mi-empresa/clientes?page=1&limit=20&filters={"activo":true,"categoria":"premium"}
```

**Response:**
```json
{
  "records": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  },
  "table": {
    "name": "Clientes",
    "slug": "clientes",
    "fields": [...]
  }
}
```

### 4. **Obtener Registro con Tabla** - `GET /api/records/:c_name/:id/with-table` ⭐ **NUEVO**

Obtiene un registro específico junto con la estructura de su tabla:

**Response:**
```json
{
  "message": "Record found successfully",
  "record": {
    "_id": "...",
    "tableSlug": "clientes",
    "data": {...},
    "createdBy": "user123",
    "createdAt": "2024-01-01T00:00:00.000Z"
  },
  "table": {
    "name": "Clientes",
    "slug": "clientes",
    "fields": [
      {
        "name": "nombre",
        "label": "Nombre",
        "type": "text",
        "required": true,
        "order": 1
      }
    ]
  }
}
```

### 5. **Actualizar Registro** - `PUT /api/records/:id`

**Mejoras implementadas:**
- ✅ Validación contra estructura actualizada de tabla
- ✅ Actualización parcial (combina datos existentes con nuevos)
- ✅ Validación de tipos de datos
- ✅ Incluye estructura de tabla en respuesta

**Request:**
```json
{
  "c_name": "mi-empresa",
  "updatedBy": "user456",
  "data": {
    "nombre": "Juan Pérez Actualizado",
    "email": "juan.nuevo@email.com",
    "categoria": "vip"
  }
}
```

**Flujo de Actualización:**
1. Obtener registro existente
2. Obtener tabla actualizada
3. Combinar datos existentes con nuevos
4. Validar datos combinados
5. Actualizar registro

### 6. **Buscar Registros** - `POST /api/records/search/:c_name/:tableSlug`

**Funcionalidades:**
- ✅ Búsqueda por texto en campos de texto
- ✅ Filtros específicos por campo
- ✅ Paginación
- ✅ Ordenamiento

**Request:**
```json
{
  "query": "juan",
  "filters": {
    "activo": true,
    "categoria": "premium"
  },
  "page": 1,
  "limit": 20
}
```

### 7. **Estadísticas** - `GET /api/records/stats/:c_name/:tableSlug`

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

## Validaciones de Tipos de Datos

### Tipos Soportados y Validaciones:

1. **text**: 
   - ✅ Debe ser string
   - ✅ Sin validaciones adicionales

2. **email**: 
   - ✅ Debe ser string
   - ✅ Validación de formato de email con regex

3. **number**: 
   - ✅ Convierte a número
   - ✅ Valida que sea número válido

4. **date**: 
   - ✅ Convierte a Date
   - ✅ Valida que sea fecha válida

5. **boolean**: 
   - ✅ Convierte strings "true"/"false"
   - ✅ Valida tipo boolean

6. **select**: 
   - ✅ Valida contra opciones permitidas
   - ✅ Error si no está en la lista

7. **currency**: 
   - ✅ Convierte a número
   - ✅ Valida valor monetario

8. **file**: 
   - ✅ Asume valor ya procesado
   - ✅ Sin validaciones adicionales

### Ejemplos de Validación:

```javascript
// Campo email requerido
const data = {
  nombre: "Juan",
  email: "email-invalido" // ERROR: formato inválido
};

// Campo select con opciones
const data = {
  categoria: "invalida" // ERROR: no está en opciones
};

// Campo number
const data = {
  edad: "25" // ✅ Se convierte a 25
};
```

## Manejo de Errores

### Errores de Validación (400):
- `"tableSlug, data, c_name and createdBy are required"`
- `"data must be an object"`
- `"Table not found or inactive"`
- `"Campo 'Nombre' es obligatorio"`
- `"Campo 'Email' debe ser un email válido"`
- `"Campo 'Edad' debe ser un número"`
- `"Campo 'Categoría' debe ser uno de: premium, vip, standard"`

### Errores de Recurso (404):
- `"Record not found"`
- `"Table not found or inactive"`

### Errores de Servidor (500):
- `"Error creating dynamic record"`
- `"Error fetching dynamic records"`
- `"Error updating dynamic record"`

## Funcionalidades Avanzadas

### 1. **Actualización Parcial**
```javascript
// Datos existentes
{
  nombre: "Juan Pérez",
  email: "juan@email.com",
  telefono: "123456789"
}

// Actualización parcial
{
  nombre: "Juan Pérez López",
  categoria: "vip"
}

// Resultado combinado
{
  nombre: "Juan Pérez López",
  email: "juan@email.com",
  telefono: "123456789",
  categoria: "vip"
}
```

### 2. **Filtros Dinámicos**
```javascript
// Query parameter
?filters={"activo":true,"categoria":"premium"}

// Se convierte en filtro MongoDB
{
  "data.activo": true,
  "data.categoria": "premium"
}
```

### 3. **Búsqueda por Texto**
```javascript
// Busca en campos de texto y email
{
  $or: [
    { "data.nombre": { $regex: "juan", $options: "i" } },
    { "data.email": { $regex: "juan", $options: "i" } }
  ]
}
```

## Consideraciones de Implementación

### 1. **Autenticación**
```javascript
// En middleware de autenticación
req.body.createdBy = req.user.id;
req.body.updatedBy = req.user.id;
```

### 2. **Validación en Frontend**
```javascript
// Validar antes de enviar
const response = await fetch('/api/records/validate', {
  method: 'POST',
  body: JSON.stringify({ tableSlug, data, c_name })
});

if (response.ok) {
  // Datos válidos, proceder con creación
} else {
  // Mostrar errores de validación
}
```

### 3. **Manejo de Archivos**
```javascript
// Para campos tipo file, procesar antes de enviar
const fileData = await processFile(file);
data.archivo = fileData;
```

## Mejoras Futuras Sugeridas

1. **Validaciones Personalizadas**: Regex personalizados por campo
2. **Transformaciones Avanzadas**: Formateo automático de datos
3. **Historial de Cambios**: Trackear modificaciones
4. **Validación en Tiempo Real**: WebSocket para validación instantánea
5. **Caché de Estructuras**: Cachear estructuras de tabla
6. **Búsqueda Full-Text**: Implementar búsqueda avanzada
7. **Exportación**: Exportar registros validados 