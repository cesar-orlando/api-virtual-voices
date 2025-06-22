# Controlador de Tablas - Documentación Actualizada

## Descripción General

El controlador de tablas ha sido completamente actualizado para manejar campos dinámicos con validaciones robustas y nuevas funcionalidades para la gestión de tablas.

## Funciones de Validación

### `validateField(field, index)`
Valida la estructura de un campo individual:
- ✅ Verifica que `name` y `label` sean strings requeridos
- ✅ Valida que `type` sea uno de los tipos permitidos
- ✅ Para campos `select`, verifica que tenga opciones válidas
- ✅ Valida que `order` sea un número positivo

### `assignFieldOrders(fields)`
Asigna orden automático a campos que no lo tengan:
- ✅ Si no se especifica `order`, asigna secuencialmente (1, 2, 3...)
- ✅ Mantiene el orden especificado si existe

### `validateUniqueFieldNames(fields)`
Valida que los nombres de campos sean únicos:
- ✅ Previene duplicados de nombres de campos
- ✅ Retorna error si hay nombres repetidos

### `validateUniqueFieldOrders(fields)`
Valida que los órdenes de campos sean únicos:
- ✅ Previene conflictos de orden
- ✅ Asegura ordenamiento correcto

## Endpoints Actualizados

### 1. **Crear Tabla** - `POST /api/tables`

**Validaciones implementadas:**
- ✅ Campos requeridos: `name`, `slug`, `c_name`, `createdBy`, `fields`
- ✅ `fields` debe ser un array no vacío
- ✅ Validación de estructura de cada campo
- ✅ Asignación automática de orden
- ✅ Validación de nombres únicos
- ✅ Validación de órdenes únicos
- ✅ Slug único por empresa

**Ejemplo de request:**
```json
{
  "name": "Clientes",
  "slug": "clientes",
  "icon": "👥",
  "c_name": "mi-empresa",
  "createdBy": "user123",
  "isActive": true,
  "fields": [
    {
      "name": "nombre",
      "label": "Nombre",
      "type": "text",
      "required": true,
      "order": 1,
      "width": 200
    },
    {
      "name": "email",
      "label": "Email",
      "type": "email",
      "required": true,
      "order": 2
    }
  ]
}
```

### 2. **Obtener Tablas** - `GET /api/tables/:c_name`

**Mejoras implementadas:**
- ✅ Filtrado por empresa (`c_name`)
- ✅ Solo tablas activas (`isActive: true`)
- ✅ Ordenamiento por fecha de creación (más recientes primero)
- ✅ Conteo de registros (preparado para implementación futura)
- ✅ Respuesta estructurada con total

**Ejemplo de respuesta:**
```json
{
  "tables": [
    {
      "_id": "...",
      "name": "Clientes",
      "slug": "clientes",
      "recordsCount": 0,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "total": 1
}
```

### 3. **Obtener Tabla por ID** - `GET /api/tables/:c_name/:id`

- ✅ Filtrado por empresa
- ✅ Validación de existencia

### 4. **Obtener Tabla por Slug** - `GET /api/tables/:c_name/slug/:slug` ⭐ **NUEVO**

- ✅ Búsqueda por slug en lugar de ID
- ✅ Filtrado por empresa
- ✅ Solo tablas activas
- ✅ Útil para URLs amigables

### 5. **Actualizar Tabla** - `PUT /api/tables/:id`

**Mejoras implementadas:**
- ✅ Validación de `c_name` requerido
- ✅ Verificación de slug único al actualizar
- ✅ Validación completa de campos si se actualizan
- ✅ Mantenimiento de integridad de datos
- ✅ Preparado para validación de campos con datos existentes

**Validaciones de actualización:**
- ✅ Si se actualiza slug, verifica unicidad
- ✅ Si se actualizan campos, valida estructura completa
- ✅ Asigna órdenes automáticos si es necesario
- ✅ Valida nombres y órdenes únicos

### 6. **Eliminar Tabla** - `DELETE /api/tables/:c_name/:id`

- ✅ Soft delete (cambia `isActive` a `false`)
- ✅ No elimina físicamente los datos
- ✅ Mantiene integridad referencial

### 7. **Obtener Campos por ID** - `GET /api/tables/:c_name/:id/fields`

- ✅ Retorna solo los campos de la tabla
- ✅ Incluye información de la tabla

### 8. **Obtener Campos por Slug** - `GET /api/tables/:c_name/slug/:slug/fields` ⭐ **NUEVO**

- ✅ Búsqueda por slug
- ✅ Útil para formularios dinámicos

## Tipos de Campo Soportados

```typescript
type FieldType = 'text' | 'email' | 'number' | 'date' | 'boolean' | 'select' | 'file' | 'currency';
```

### Validaciones Específicas por Tipo:

1. **text**: Sin validaciones adicionales
2. **email**: Validación de formato en frontend
3. **number**: Validación numérica
4. **date**: Validación de fecha
5. **boolean**: Valores true/false
6. **select**: ✅ **Requiere array de `options`**
7. **file**: Para archivos
8. **currency**: Para valores monetarios

## Manejo de Errores

### Errores de Validación (400):
- `"Name, slug, c_name, createdBy and fields are required"`
- `"Fields must be a non-empty array"`
- `"Field X: name is required and must be a string"`
- `"Field X: type must be one of text, email, number, date, boolean, select, file, currency"`
- `"Field X: select fields must have options array"`
- `"Field names must be unique within the table"`
- `"Field orders must be unique within the table"`
- `"A table with this slug already exists in this company"`

### Errores de Recurso (404):
- `"Table not found"`

### Errores de Servidor (500):
- `"Error creating table"`
- `"Error fetching tables"`
- `"Error updating table"`
- `"Error deleting table"`

## Consideraciones de Implementación

### Conteo de Registros
El campo `recordsCount` está preparado para implementación futura:
```javascript
// TODO: Implementar conteo real de registros
recordsCount: 0
```

### Validación de Campos con Datos
La validación para evitar eliminar campos con datos existentes está preparada:
```javascript
// TODO: Validar que no se eliminen campos con datos existentes
// Esto requeriría consultar la colección de datos de la tabla
```

### Autenticación
El campo `createdBy` debe tomarse del usuario autenticado:
```javascript
// Ejemplo de implementación con middleware de autenticación
const createdBy = req.user.id; // Del middleware de autenticación
```

## Ejemplos de Uso Avanzado

### Crear Tabla con Orden Automático
```javascript
const fields = [
  { name: "nombre", label: "Nombre", type: "text", required: true },
  { name: "email", label: "Email", type: "email", required: true },
  { name: "telefono", label: "Teléfono", type: "text" }
  // order se asignará automáticamente: 1, 2, 3
];
```

### Actualizar Solo Campos Básicos
```javascript
PUT /api/tables/tableId
{
  "c_name": "mi-empresa",
  "name": "Nuevo Nombre",
  "isActive": false
}
```

### Actualizar Estructura de Campos
```javascript
PUT /api/tables/tableId
{
  "c_name": "mi-empresa",
  "fields": [
    { name: "nuevo_campo", label: "Nuevo Campo", type: "text", order: 1 },
    { name: "email", label: "Email", type: "email", order: 2 }
  ]
}
```

## Mejoras Futuras Sugeridas

1. **Conteo Real de Registros**: Implementar consulta a colección de datos
2. **Validación de Datos Existentes**: Evitar eliminar campos con datos
3. **Historial de Cambios**: Trackear modificaciones de estructura
4. **Backup de Estructura**: Guardar versiones anteriores
5. **Migración de Datos**: Automatizar cambios de estructura
6. **Validaciones de Frontend**: Sincronizar con validaciones del backend 