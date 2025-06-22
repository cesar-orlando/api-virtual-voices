# Importación Masiva de Registros - Documentación

## Descripción General

La funcionalidad de importación masiva permite cargar múltiples registros desde archivos Excel o datos JSON de manera eficiente, utilizando `insertMany` de Mongoose para optimizar el rendimiento.

## Endpoint de Importación

### **POST** `/api/records/:c_name/:tableSlug/import`

Importa múltiples registros en una sola operación.

### **Parámetros de URL:**
- `c_name`: Nombre de la empresa
- `tableSlug`: Slug de la tabla donde se importarán los registros

### **Body de la Request:**
```json
{
  "records": [
    {
      "data": {
        "nombre": "Juan Pérez",
        "email": "juan@email.com",
        "telefono": "+1234567890",
        "activo": true
      }
    },
    {
      "data": {
        "nombre": "María García",
        "email": "maria@email.com",
        "telefono": "+0987654321",
        "activo": false
      }
    }
  ],
  "createdBy": "user123"
}
```

### **Response de Éxito (201):**
```json
{
  "message": "Import completed",
  "importedRecords": [
    {
      "_id": "record1_id",
      "tableSlug": "clientes",
      "c_name": "mi-empresa",
      "data": {
        "nombre": "Juan Pérez",
        "email": "juan@email.com",
        "telefono": "+1234567890",
        "activo": true
      },
      "createdBy": "user123",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "errors": [],
  "summary": {
    "total": 2,
    "successful": 2,
    "failed": 0
  }
}
```

### **Response con Errores (400):**
```json
{
  "message": "Import completed",
  "importedRecords": [...],
  "errors": [
    {
      "index": 1,
      "error": "Field 'email' is required"
    },
    {
      "index": 3,
      "error": "Invalid email format"
    }
  ],
  "summary": {
    "total": 5,
    "successful": 3,
    "failed": 2
  }
}
```

## Características de la Implementación

### **1. Validación Robusta:**
- ✅ Valida que el array `records` exista y no esté vacío
- ✅ Valida que cada registro tenga la estructura `{ data: { ... } }`
- ✅ Valida datos contra la estructura de la tabla
- ✅ Aplica transformaciones y valores por defecto

### **2. Inserción Eficiente:**
- ✅ Usa `insertMany()` para inserción masiva
- ✅ Opción `ordered: false` para continuar aunque algunos registros fallen
- ✅ Una sola operación de base de datos para todos los registros válidos

### **3. Manejo de Errores:**
- ✅ Errores de validación por registro individual
- ✅ Errores de inserción masiva
- ✅ Respuesta detallada con índices de errores
- ✅ Continuación del proceso aunque algunos registros fallen

### **4. Auditoría Completa:**
- ✅ Campo `createdBy` para tracking
- ✅ Timestamps automáticos (`createdAt`, `updatedAt`)
- ✅ Metadatos de empresa y tabla

## Flujo de Procesamiento

### **1. Validación Inicial:**
```javascript
// Validar parámetros requeridos
if (!records || !Array.isArray(records) || !createdBy) {
  return res.status(400).json({ 
    message: "records array and createdBy are required" 
  });
}
```

### **2. Validación de Tabla:**
```javascript
// Verificar que la tabla existe y está activa
const table = await Table.findOne({ slug: tableSlug, c_name, isActive: true });
if (!table) {
  return res.status(404).json({ message: "Table not found or inactive" });
}
```

### **3. Procesamiento de Registros:**
```javascript
// Validar y transformar cada registro
for (let i = 0; i < records.length; i++) {
  const recordData = records[i];
  
  // Validar estructura
  if (!recordData.data || typeof recordData.data !== 'object') {
    errors.push({ index: i, error: "Invalid data format" });
    continue;
  }
  
  // Validar contra estructura de tabla
  try {
    validatedData = transformAndValidateData(recordData.data, table);
  } catch (validationError) {
    errors.push({ index: i, error: validationError.message });
    continue;
  }
  
  // Agregar a lista de inserción
  recordsToInsert.push({
    tableSlug,
    c_name,
    data: validatedData,
    createdBy,
    createdAt: new Date(),
    updatedAt: new Date()
  });
}
```

### **4. Inserción Masiva:**
```javascript
// Insertar todos los registros válidos
const insertedRecords = await Record.insertMany(recordsToInsert, { 
  ordered: false // Continúa aunque algunos fallen
});
```

## Casos de Uso

### **1. Importación desde Excel:**
```javascript
// Frontend procesa Excel y envía datos
const importFromExcel = async (file, tableSlug, c_name) => {
  const excelData = await processExcelFile(file);
  
  const response = await fetch(`/api/records/${c_name}/${tableSlug}/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      records: excelData.map(row => ({ data: row })),
      createdBy: currentUser.id
    })
  });
  
  return response.json();
};
```

### **2. Importación desde JSON:**
```javascript
// Importar datos desde archivo JSON
const importFromJSON = async (jsonData, tableSlug, c_name) => {
  const response = await fetch(`/api/records/${c_name}/${tableSlug}/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      records: jsonData.records,
      createdBy: currentUser.id
    })
  });
  
  return response.json();
};
```

### **3. Migración de Datos:**
```javascript
// Migrar datos de otro sistema
const migrateData = async (legacyData, tableSlug, c_name) => {
  const transformedData = legacyData.map(legacyRecord => ({
    data: {
      nombre: legacyRecord.name,
      email: legacyRecord.email,
      telefono: legacyRecord.phone,
      activo: legacyRecord.status === 'active'
    }
  }));
  
  const response = await fetch(`/api/records/${c_name}/${tableSlug}/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      records: transformedData,
      createdBy: 'migration_user'
    })
  });
  
  return response.json();
};
```

## Validaciones Aplicadas

### **1. Validación de Estructura:**
- ✅ Array `records` debe existir y no estar vacío
- ✅ Cada registro debe tener propiedad `data`
- ✅ `data` debe ser un objeto válido

### **2. Validación de Tabla:**
- ✅ Tabla debe existir y estar activa
- ✅ Tabla debe pertenecer a la empresa especificada

### **3. Validación de Datos:**
- ✅ Campos requeridos según estructura de tabla
- ✅ Tipos de datos correctos
- ✅ Formatos válidos (email, fecha, etc.)
- ✅ Valores por defecto aplicados

### **4. Validación de Empresa:**
- ✅ Registros se crean con `c_name` correcto
- ✅ Validación de permisos de empresa

## Manejo de Errores

### **Errores de Validación:**
```json
{
  "index": 2,
  "error": "Field 'email' is required"
}
```

### **Errores de Formato:**
```json
{
  "index": 5,
  "error": "Invalid email format for field 'email'"
}
```

### **Errores de Inserción:**
```json
{
  "index": 8,
  "error": "Duplicate key error for field 'email'"
}
```

## Consideraciones de Rendimiento

### **1. Límites Recomendados:**
- **Registros por lote**: 1000-5000 registros
- **Tamaño de request**: Máximo 10MB
- **Timeout**: 30 segundos

### **2. Optimizaciones:**
- ✅ Inserción masiva con `insertMany()`
- ✅ Validación previa a inserción
- ✅ Manejo de errores sin interrumpir proceso
- ✅ Respuesta inmediata con resumen

### **3. Monitoreo:**
- ✅ Contador de registros procesados
- ✅ Tiempo de procesamiento
- ✅ Errores detallados por registro
- ✅ Resumen de éxito/fallo

## Ejemplos de Integración

### **Frontend React:**
```javascript
const ImportRecords = () => {
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  const handleImport = async () => {
    setImporting(true);
    try {
      const excelData = await processExcelFile(file);
      
      const response = await fetch(`/api/records/${company}/${tableSlug}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records: excelData.map(row => ({ data: row })),
          createdBy: user.id
        })
      });
      
      const result = await response.json();
      setResult(result);
    } catch (error) {
      console.error('Import error:', error);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <input type="file" onChange={(e) => setFile(e.target.files[0])} />
      <button onClick={handleImport} disabled={importing}>
        {importing ? 'Importing...' : 'Import Records'}
      </button>
      
      {result && (
        <div>
          <h3>Import Results</h3>
          <p>Total: {result.summary.total}</p>
          <p>Successful: {result.summary.successful}</p>
          <p>Failed: {result.summary.failed}</p>
          
          {result.errors.length > 0 && (
            <div>
              <h4>Errors:</h4>
              {result.errors.map((error, index) => (
                <p key={index}>Row {error.index + 1}: {error.error}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
```

### **Node.js Script:**
```javascript
const importRecords = async (data, tableSlug, c_name) => {
  const response = await fetch(`http://localhost:3000/api/records/${c_name}/${tableSlug}/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      records: data.map(record => ({ data: record })),
      createdBy: 'script_user'
    })
  });
  
  const result = await response.json();
  
  console.log(`Import completed:`);
  console.log(`- Total: ${result.summary.total}`);
  console.log(`- Successful: ${result.summary.successful}`);
  console.log(`- Failed: ${result.summary.failed}`);
  
  if (result.errors.length > 0) {
    console.log('Errors:');
    result.errors.forEach(error => {
      console.log(`  Row ${error.index + 1}: ${error.error}`);
    });
  }
  
  return result;
};
```

## Seguridad y Validación

### **1. Autenticación:**
- ✅ Todas las rutas requieren autenticación
- ✅ Validación de permisos de empresa
- ✅ Tracking de usuario que realiza la importación

### **2. Validación de Datos:**
- ✅ Sanitización de datos de entrada
- ✅ Validación contra estructura de tabla
- ✅ Prevención de inyección de datos maliciosos

### **3. Límites de Seguridad:**
- ✅ Límite de tamaño de request
- ✅ Límite de número de registros
- ✅ Timeout de operaciones
- ✅ Validación de tipos de archivo (si aplica)

Esta implementación proporciona una solución robusta y eficiente para la importación masiva de registros, con validación completa, manejo de errores detallado y optimización de rendimiento. 