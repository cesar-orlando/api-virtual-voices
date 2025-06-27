# 🚀 Nueva Funcionalidad: Tools Personalizadas por Tipo de Función

## Descripción General
Se ha implementado un sistema flexible para crear tools personalizadas donde las empresas pueden:
- **Definir el nombre** de la tool (ej: `buscar_sedes`, `crear_prospecto`)
- **Seleccionar el tipo de función** (search, create, update, delete)
- **Especificar la tabla** donde operará
- **Activar/desactivar** tools en la configuración de IA

## Nuevos Endpoints

### 1. Obtener Tipos de Funciones Disponibles
```http
GET /api/tools/function-types/{c_name}
```

**Respuesta:**
```json
{
  "message": "Tipos de funciones disponibles",
  "functionTypes": [
    {
      "type": "search",
      "displayName": "Buscar",
      "description": "Busca registros en una tabla específica",
      "category": "data_retrieval",
      "parameters": {
        "type": "object",
        "properties": {
          "query": {
            "type": "string",
            "description": "Término de búsqueda o filtro"
          },
          "limit": {
            "type": "number",
            "description": "Número máximo de resultados"
          }
        },
        "required": []
      }
    },
    {
      "type": "create",
      "displayName": "Crear",
      "description": "Crea un nuevo registro en una tabla específica",
      "category": "data_creation",
      "parameters": {
        "type": "object",
        "properties": {
          "data": {
            "type": "object",
            "description": "Datos del registro a crear"
          }
        },
        "required": ["data"]
      }
    },
    {
      "type": "update",
      "displayName": "Actualizar",
      "description": "Actualiza un registro existente",
      "category": "data_modification",
      "parameters": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "description": "ID del registro a actualizar"
          },
          "data": {
            "type": "object",
            "description": "Datos a actualizar"
          }
        },
        "required": ["id", "data"]
      }
    },
    {
      "type": "delete",
      "displayName": "Eliminar",
      "description": "Elimina un registro existente",
      "category": "data_deletion",
      "parameters": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "description": "ID del registro a eliminar"
          }
        },
        "required": ["id"]
      }
    }
  ]
}
```

### 2. Crear Tool Personalizada
```http
POST /api/tools/custom-tool
```

**Body:**
```json
{
  "name": "buscar_sedes",
  "functionType": "search",
  "tableSlug": "sedes",
  "customDescription": "Busca sedes disponibles por ubicación",
  "createdBy": "user_id"
}
```

**Respuesta:**
```json
{
  "message": "Tool personalizada creada exitosamente",
  "tool": {
    "_id": "tool_id",
    "name": "buscar_sedes",
    "displayName": "Buscar Sedes",
    "description": "Función para buscar en sedes",
    "category": "data_retrieval",
    "isActive": true,
    "config": {
      "endpoint": "/api/records/table/{c_name}/sedes",
      "method": "GET"
    },
    "parameters": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Término de búsqueda o filtro"
        }
      },
      "required": []
    }
  }
}
```

### 3. Modificación en IA Config

#### Crear IA Config con Tools Activas
```http
POST /api/ia-config/{c_name}
```

**Body:**
```json
{
  "name": "Asistente Ventas",
  "tone": "amigable",
  "objective": "ventas",
  "welcomeMessage": "¡Hola! Soy tu asistente de ventas",
  "customPrompt": "Enfoque en cerrar ventas",
  "activeTools": ["buscar_sedes", "crear_prospecto"],
  "user": {
    "id": "user_id",
    "name": "Admin"
  }
}
```

#### Actualizar IA Config
```http
PUT /api/ia-config/{c_name}/{user_id}
```

**Body:**
```json
{
  "_id": "config_id",
  "name": "Asistente Ventas",
  "activeTools": ["buscar_sedes", "crear_prospecto", "agendar_cita"],
  "customPrompt": "Nuevo prompt personalizado"
}
```

## Flujo de Trabajo Recomendado

1. **Obtener tipos disponibles:** `GET /api/tools/function-types/{c_name}`
2. **Mostrar formulario** con:
   - Campo para nombre de tool
   - Selector de tipo de función (search/create/update/delete)
   - Campo para tabla (tableSlug)
   - Campo opcional para descripción personalizada
3. **Crear tool:** `POST /api/tools/custom-tool`
4. **En IA Config:** Mostrar lista de tools disponibles para activar/desactivar
5. **Guardar configuración** con `activeTools` seleccionadas

## Ejemplos de Uso

### Inmobiliaria:
```json
{
  "name": "buscar_propiedades",
  "functionType": "search",
  "tableSlug": "propiedades"
}
```

### Escuela:
```json
{
  "name": "buscar_alumnos",
  "functionType": "search", 
  "tableSlug": "alumnos"
}
```

### Restaurante:
```json
{
  "name": "crear_reservacion",
  "functionType": "create",
  "tableSlug": "reservaciones"
}
```

## Beneficios

- ✅ **Flexibilidad:** Cada empresa define sus propias tools
- ✅ **Simplicidad:** Solo seleccionar tipo y tabla
- ✅ **Escalabilidad:** Fácil agregar nuevas funciones
- ✅ **Consistencia:** Misma lógica para todas las empresas
- ✅ **Automatización:** OpenAI usa automáticamente las tools activas

## Campos Requeridos

### Para crear tool personalizada:
- `name`: Nombre de la tool (ej: "buscar_sedes")
- `functionType`: Tipo de función ("search", "create", "update", "delete")
- `tableSlug`: Slug de la tabla donde operará
- `createdBy`: ID del usuario que la crea
- `customDescription`: (opcional) Descripción personalizada

### Para IA Config:
- `activeTools`: Array de nombres de tools activas

## Notas Importantes

1. **Nombres únicos:** No puede haber dos tools con el mismo nombre en una empresa
2. **Activación automática:** Las tools se crean activas por defecto
3. **Endpoints dinámicos:** Se generan automáticamente basados en el tableSlug
4. **Integración OpenAI:** Las tools activas se envían automáticamente a OpenAI
5. **Validación:** Se valida que el tipo de función sea válido

---

**Versión:** 1.0.0  
**Fecha:** Enero 2024  
**Mantenido por:** Equipo de Desarrollo CRM 