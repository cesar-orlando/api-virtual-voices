# Modelo de Tabla - Documentación

## Descripción General

El modelo de tabla ha sido actualizado para soportar campos dinámicos que permiten definir la estructura de la tabla de forma flexible. Cada tabla pertenece a una empresa específica y puede ser activada/desactivada.

## Estructura del Modelo

### Campos Principales

- `name`: Nombre de la tabla (requerido)
- `slug`: Identificador único de la tabla (requerido, único por empresa)
- `icon`: Ícono asociado a la tabla (opcional)
- `c_name`: Nombre de la empresa (requerido)
- `createdBy`: ID del usuario que creó la tabla (requerido)
- `isActive`: Estado activo/inactivo de la tabla (por defecto: true)
- `fields`: Array de campos dinámicos (requerido)

### Estructura de un Campo (`TableField`)

```typescript
{
  name: string;        // "nombre", "email", "telefono"
  label: string;       // "Nombre", "Email", "Teléfono"
  type: 'text' | 'email' | 'number' | 'date' | 'boolean' | 'select' | 'file' | 'currency';
  required?: boolean;  // Por defecto: false
  defaultValue?: any;  // Valor por defecto del campo
  options?: string[];  // Opciones para campos tipo select
  order: number;       // Orden de la columna (requerido)
  width?: number;      // Ancho de la columna (por defecto: 150)
}
```

## Tipos de Campos Soportados

1. **text**: Campo de texto simple
2. **email**: Campo de email con validación
3. **number**: Campo numérico
4. **date**: Campo de fecha
5. **boolean**: Campo booleano (true/false)
6. **select**: Campo de selección con opciones predefinidas
7. **file**: Campo para archivos
8. **currency**: Campo para valores monetarios

## Validaciones

### Validaciones del Modelo

- El slug debe ser único por empresa (combinación de `slug` + `c_name`)
- La tabla debe tener al menos un campo
- Los campos deben tener nombres únicos dentro de la tabla
- Los campos deben tener órdenes únicos

### Validaciones de Campos

- `name` y `label` son requeridos para cada campo
- `type` debe ser uno de los valores permitidos
- `order` es requerido y debe ser único
- `options` solo se usa para campos tipo `select`

## Ejemplos de Uso

### Crear una Tabla de Clientes

```javascript
const clientTable = {
  name: "Clientes",
  slug: "clientes",
  icon: "👥",
  c_name: "mi-empresa",
  createdBy: "user123",
  isActive: true,
  fields: [
    {
      name: "nombre",
      label: "Nombre",
      type: "text",
      required: true,
      order: 1,
      width: 200
    },
    {
      name: "email",
      label: "Email",
      type: "email",
      required: true,
      order: 2,
      width: 250
    },
    {
      name: "telefono",
      label: "Teléfono",
      type: "text",
      required: false,
      order: 3,
      width: 150
    },
    {
      name: "fecha_registro",
      label: "Fecha de Registro",
      type: "date",
      required: false,
      defaultValue: new Date(),
      order: 4,
      width: 150
    },
    {
      name: "estado",
      label: "Estado",
      type: "select",
      required: true,
      options: ["Activo", "Inactivo", "Pendiente"],
      defaultValue: "Activo",
      order: 5,
      width: 120
    }
  ]
};
```

### Crear una Tabla de Productos

```javascript
const productTable = {
  name: "Productos",
  slug: "productos",
  icon: "📦",
  c_name: "mi-empresa",
  createdBy: "user123",
  fields: [
    {
      name: "codigo",
      label: "Código",
      type: "text",
      required: true,
      order: 1,
      width: 100
    },
    {
      name: "nombre",
      label: "Nombre del Producto",
      type: "text",
      required: true,
      order: 2,
      width: 300
    },
    {
      name: "precio",
      label: "Precio",
      type: "currency",
      required: true,
      order: 3,
      width: 120
    },
    {
      name: "stock",
      label: "Stock",
      type: "number",
      required: true,
      defaultValue: 0,
      order: 4,
      width: 100
    },
    {
      name: "activo",
      label: "Activo",
      type: "boolean",
      required: true,
      defaultValue: true,
      order: 5,
      width: 80
    }
  ]
};
```

## Endpoints de la API

### Crear Tabla
```
POST /api/tables
Body: {
  name: string,
  slug: string,
  icon?: string,
  c_name: string,
  createdBy: string,
  isActive?: boolean,
  fields: TableField[]
}
```

### Obtener Todas las Tablas de una Empresa
```
GET /api/tables/:c_name
```

### Obtener una Tabla Específica
```
GET /api/tables/:c_name/:id
```

### Obtener Campos de una Tabla
```
GET /api/tables/:c_name/:id/fields
```

### Actualizar Tabla
```
PUT /api/tables/:id
Body: {
  name?: string,
  slug?: string,
  icon?: string,
  c_name: string,
  isActive?: boolean,
  fields?: TableField[]
}
```

### Eliminar Tabla (Soft Delete)
```
DELETE /api/tables/:c_name/:id
```

## Consideraciones Importantes

1. **Soft Delete**: Las tablas no se eliminan físicamente, solo se marcan como inactivas (`isActive: false`)

2. **Unicidad por Empresa**: El slug debe ser único dentro de cada empresa, pero puede repetirse entre diferentes empresas

3. **Orden de Campos**: El campo `order` determina el orden de visualización de las columnas

4. **Campos Requeridos**: Los campos marcados como `required: true` deben ser validados en el frontend

5. **Tipos de Campo**: Cada tipo de campo puede requerir validaciones específicas en el frontend

6. **Opciones de Select**: Los campos tipo `select` deben incluir un array de `options` con las opciones disponibles 