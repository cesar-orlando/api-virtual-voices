# Rutas de API - Documentación Completa

## Descripción General

Esta documentación describe todas las rutas disponibles para la gestión de tablas dinámicas y registros, organizadas por funcionalidad y ordenadas de más específica a más general.

## Rutas de Tablas (`/api/tables`)

### 1. **Obtener Estructura de Tabla** - `GET /:c_name/:slug/structure`
Obtiene la estructura completa de una tabla específica.

**Parámetros:**
- `c_name`: Nombre de la empresa
- `slug`: Slug de la tabla

**Response:**
```json
{
  "message": "Table structure retrieved successfully",
  "structure": {
    "name": "Clientes",
    "slug": "clientes",
    "icon": "👥",
    "fields": [...],
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 2. **Exportar Tabla** - `GET /:c_name/:slug/export`
Exporta una tabla completa en formato JSON.

**Parámetros:**
- `c_name`: Nombre de la empresa
- `slug`: Slug de la tabla
- `format`: Formato de exportación (default: 'json')

**Response:** Archivo JSON descargable

### 3. **Obtener Tabla por Slug** - `GET /:c_name/:slug`
Obtiene una tabla específica por su slug.

**Parámetros:**
- `c_name`: Nombre de la empresa
- `slug`: Slug de la tabla

### 4. **Actualizar Estructura de Tabla** - `PATCH /:c_name/:id/structure`
Actualiza solo la estructura de campos de una tabla.

**Request:**
```json
{
  "fields": [
    {
      "name": "nuevo_campo",
      "label": "Nuevo Campo",
      "type": "text",
      "required": true,
      "order": 1
    }
  ],
  "c_name": "mi-empresa",
  "updatedBy": "user123"
}
```

### 5. **Duplicar Tabla** - `POST /:c_name/:id/duplicate`
Crea una copia de una tabla existente.

**Request:**
```json
{
  "newName": "Clientes Copia",
  "newSlug": "clientes-copia",
  "c_name": "mi-empresa",
  "createdBy": "user123"
}
```

### 6. **Importar Tabla** - `POST /:c_name/import`
Importa una tabla desde datos JSON.

**Request:**
```json
{
  "c_name": "mi-empresa",
  "createdBy": "user123",
  "tableData": {
    "name": "Nueva Tabla",
    "slug": "nueva-tabla",
    "icon": "📊",
    "fields": [...]
  }
}
```

### 7. **Crear Tabla** - `POST /`
Crea una nueva tabla.

### 8. **Obtener Todas las Tablas** - `GET /:c_name`
Obtiene todas las tablas de una empresa.

### 9. **Actualizar Tabla** - `PUT /:id`
Actualiza una tabla completa.

### 10. **Eliminar Tabla** - `DELETE /:c_name/:id`
Elimina una tabla (soft delete).

### 11. **Obtener Campos por ID** - `GET /:c_name/:id/fields`
Obtiene los campos de una tabla por ID.

### 12. **Obtener Campos por Slug** - `GET /:c_name/slug/:slug/fields`
Obtiene los campos de una tabla por slug.

## Rutas de Registros (`/api/records`)

### 1. **Validar Registro** - `POST /validate`
Valida datos sin guardar en la base de datos.

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

### 2. **Actualización Masiva** - `POST /:c_name/:tableSlug/bulk`
Actualiza múltiples registros en una operación.

**Request:**
```json
{
  "records": [
    {
      "id": "record1_id",
      "data": { "nombre": "Juan Pérez Actualizado" }
    },
    {
      "id": "record2_id",
      "data": { "email": "nuevo@email.com" }
    }
  ],
  "updatedBy": "user123"
}
```

**Response:**
```json
{
  "message": "Bulk update completed",
  "results": [...],
  "errors": [...],
  "summary": {
    "total": 2,
    "successful": 2,
    "failed": 0
  }
}
```

### 3. **Eliminación Masiva** - `DELETE /:c_name/:tableSlug/bulk`
Elimina múltiples registros en una operación.

**Request:**
```json
{
  "recordIds": ["record1_id", "record2_id", "record3_id"]
}
```

### 4. **Importar Registros** - `POST /:c_name/:tableSlug/import`
Importa múltiples registros desde datos JSON.

**Request:**
```json
{
  "records": [
    {
      "data": {
        "nombre": "Juan Pérez",
        "email": "juan@email.com"
      }
    },
    {
      "data": {
        "nombre": "María García",
        "email": "maria@email.com"
      }
    }
  ],
  "createdBy": "user123"
}
```

### 5. **Exportar Registros** - `GET /:c_name/:tableSlug/export`
Exporta registros en formato JSON.

**Query Parameters:**
- `format`: Formato de exportación (default: 'json')
- `filters`: Filtros JSON stringificados

**Ejemplo:**
```
GET /api/records/mi-empresa/clientes/export?filters={"activo":true}
```

### 6. **Búsqueda Avanzada** - `POST /:c_name/:tableSlug/search`
Busca registros con filtros avanzados.

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

### 7. **Agregar Campo a Todos los Registros** - `POST /add-field`
Agrega un nuevo campo a todos los registros de una tabla.

**Request:**
```json
{
  "tableSlug": "clientes",
  "c_name": "mi-empresa",
  "fieldName": "nuevo_campo",
  "defaultValue": "valor_por_defecto",
  "updatedBy": "user123"
}
```

**Response:**
```json
{
  "message": "Field added to all records successfully",
  "summary": {
    "totalRecords": 150,
    "newField": "nuevo_campo",
    "defaultValue": "valor_por_defecto"
  }
}
```

### 8. **Eliminar Campos de Todos los Registros** - `POST /delete-fields`
Elimina campos específicos de todos los registros de una tabla.

**Request:**
```json
{
  "tableSlug": "clientes",
  "c_name": "mi-empresa",
  "fieldNames": ["campo_obsoleto", "campo_temporal"],
  "updatedBy": "user123"
}
```

**Response:**
```json
{
  "message": "Fields deleted from all records successfully",
  "summary": {
    "totalRecords": 150,
    "deletedFields": ["campo_obsoleto", "campo_temporal"]
  }
}
```

### 9. **Obtener Registro con Estructura** - `GET /:c_name/:id/with-structure`
Obtiene un registro con la estructura de su tabla.

**Response:**
```json
{
  "message": "Record found successfully",
  "record": {...},
  "structure": {
    "name": "Clientes",
    "slug": "clientes",
    "fields": [...]
  }
}
```

### 10. **Obtener Registro con Tabla** - `GET /:c_name/:id/with-table`
Obtiene un registro con información completa de la tabla.

### 11. **Obtener Registros de Tabla** - `GET /table/:c_name/:tableSlug`
Obtiene todos los registros de una tabla con paginación.

**Query Parameters:**
- `page`: Número de página (default: 1)
- `limit`: Registros por página (default: 10)
- `sortBy`: Campo para ordenar (default: 'createdAt')
- `sortOrder`: Orden ascendente/descendente (default: 'desc')
- `filters`: Filtros JSON stringificados

### 12. **Obtener Registro por ID** - `GET /:c_name/:id`
Obtiene un registro específico por su ID.

### 13. **Crear Registro** - `POST /`
Crea un nuevo registro.

### 14. **Actualizar Registro** - `PUT /:id`
Actualiza un registro existente.

### 15. **Eliminar Campos de Registro** - `PATCH /:id/fields`
Elimina campos específicos de un registro individual.

**Request:**
```json
{
  "fieldNames": ["campo_obsoleto", "campo_temporal"],
  "updatedBy": "user123"
}
```

**Response:**
```json
{
  "message": "Fields deleted from record successfully",
  "record": {...},
  "deletedFields": ["campo_obsoleto", "campo_temporal"]
}
```

### 16. **Eliminar Registro** - `DELETE /:c_name/:id`
Elimina un registro específico.

### 17. **Estadísticas de Registros** - `GET /stats/:c_name/:tableSlug`
Obtiene estadísticas de registros.

## Orden de Rutas

### Tablas (de más específica a más general):
1. `/:c_name/:slug/structure`
2. `/:c_name/:slug/export`
3. `/:c_name/:slug`
4. `/:c_name/:id/structure`
5. `/:c_name/:id/duplicate`
6. `/:c_name/import`
7. `/` (crear)
8. `/:c_name` (listar)
9. `/:id` (actualizar)
10. `/:c_name/:id` (eliminar)

### Registros (por funcionalidad):
1. **Validación**: `/validate`
2. **Operaciones Masivas**: `/bulk`, `/import`, `/export`
3. **Búsqueda**: `/search`
4. **Gestión de Campos**: `/add-field`, `/delete-fields`
5. **Registros Individuales**: `/with-structure`, `/with-table`, `/table`, etc.
6. **Estadísticas**: `/stats`

## Códigos de Estado HTTP

### Éxito:
- `200`: Operación exitosa
- `201`: Recurso creado exitosamente

### Error del Cliente:
- `400`: Datos inválidos o faltantes
- `404`: Recurso no encontrado

### Error del Servidor:
- `500`: Error interno del servidor

## Autenticación

Todas las rutas requieren autenticación. Los campos `createdBy` y `updatedBy` deben tomarse del usuario autenticado:

```javascript
// En middleware de autenticación
req.body.createdBy = req.user.id;
req.body.updatedBy = req.user.id;
```

## Validaciones

### Tablas:
- ✅ Slug único por empresa
- ✅ Campos requeridos: name, slug, c_name, createdBy, fields
- ✅ Estructura de campos válida
- ✅ Nombres y órdenes únicos de campos

### Registros:
- ✅ Datos válidos contra estructura de tabla
- ✅ Tipos de datos correctos
- ✅ Campos requeridos
- ✅ Validación de empresa (c_name)

### Gestión de Campos:
- ✅ Validación de existencia de campos
- ✅ Validación de tabla activa
- ✅ Actualización masiva eficiente
- ✅ Auditoría de cambios

## Ejemplos de Uso

### Crear Tabla y Registros:
```javascript
// 1. Crear tabla
const tableResponse = await fetch('/api/tables', {
  method: 'POST',
  body: JSON.stringify({
    name: "Clientes",
    slug: "clientes",
    c_name: "mi-empresa",
    createdBy: "user123",
    fields: [...]
  })
});

// 2. Crear registro
const recordResponse = await fetch('/api/records', {
  method: 'POST',
  body: JSON.stringify({
    tableSlug: "clientes",
    c_name: "mi-empresa",
    createdBy: "user123",
    data: {
      nombre: "Juan Pérez",
      email: "juan@email.com"
    }
  })
});
```

### Operaciones Masivas:
```javascript
// Actualizar múltiples registros
const bulkResponse = await fetch('/api/records/mi-empresa/clientes/bulk', {
  method: 'POST',
  body: JSON.stringify({
    records: [
      { id: "record1", data: { activo: false } },
      { id: "record2", data: { categoria: "vip" } }
    ],
    updatedBy: "user123"
  })
});
```

### Gestión de Campos:
```javascript
// Agregar campo a todos los registros
const addFieldResponse = await fetch('/api/records/add-field', {
  method: 'POST',
  body: JSON.stringify({
    tableSlug: "clientes",
    c_name: "mi-empresa",
    fieldName: "telefono",
    defaultValue: "",
    updatedBy: "user123"
  })
});

// Eliminar campos de un registro específico
const deleteFieldsResponse = await fetch('/api/records/record_id/fields', {
  method: 'PATCH',
  body: JSON.stringify({
    fieldNames: ["campo_obsoleto"],
    updatedBy: "user123"
  })
});
```

### Exportar e Importar:
```javascript
// Exportar tabla
const exportResponse = await fetch('/api/tables/mi-empresa/clientes/export');

// Importar tabla
const importResponse = await fetch('/api/tables/mi-empresa/import', {
  method: 'POST',
  body: JSON.stringify({
    c_name: "mi-empresa",
    createdBy: "user123",
    tableData: exportedTableData
  })
});
```

## Consideraciones de Implementación

1. **Paginación**: Todas las listas soportan paginación
2. **Filtros**: Filtros dinámicos por query parameters
3. **Ordenamiento**: Ordenamiento personalizable
4. **Validación**: Validación robusta en todos los endpoints
5. **Errores**: Manejo de errores detallado
6. **Auditoría**: Trackeo de createdBy/updatedBy
7. **Seguridad**: Validación de empresa en todas las operaciones
8. **Gestión de Campos**: Operaciones masivas eficientes para modificar estructura de datos
9. **Consistencia**: Validación de integridad de datos en todas las operaciones 