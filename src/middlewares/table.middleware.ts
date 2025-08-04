import { Request, Response, NextFunction } from "express";
import { getConnectionByCompanySlug } from "../config/connectionManager";
import getTableModel from "../models/table.model";

// Tipos de campo permitidos
const ALLOWED_FIELD_TYPES = ['text', 'email', 'number', 'date', 'boolean', 'select', 'file', 'currency'];

// Función para generar slug a partir de un label
function slugify(text: string): string {
  return text
    .toString()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
    .toLowerCase()
    .replace(/\s+/g, "_") // Replace spaces with _
    .replace(/[^\w\-]+/g, "") // Remove all non-word chars
    .replace(/\_\_+/g, "_") // Replace multiple _ with single _
    .replace(/^_+/, "") // Trim _ from start
    .replace(/_+$/, ""); // Trim _ from end
}

// Función para normalizar y validar la estructura de un campo para Excel import
const validateAndNormalizeField = (field: any, index: number): { isValid: boolean; error?: string; normalizedField?: any } => {
  console.log(`[DEBUG] Validating field ${index + 1}:`, JSON.stringify(field, null, 2));
  
  // Si el campo no tiene 'name' pero tiene 'label', generar 'name' automáticamente
  if (!field.name && field.label) {
    field.name = slugify(field.label);
    console.log(`[DEBUG] Generated name "${field.name}" from label "${field.label}"`);
  }
  
  // Si aún no tiene 'name', verificar si es solo un string (nombre de columna de Excel)
  if (!field.name && typeof field === 'string') {
    const originalField = field;
    field = {
      name: slugify(originalField),
      label: originalField,
      type: 'text', // Tipo por defecto para columnas de Excel
      required: false
    };
    console.log(`[DEBUG] Converted string field "${originalField}" to object:`, field);
  }
  
  // Si sigue sin tener 'name', error
  if (!field.name || typeof field.name !== 'string') {
    console.log(`[ERROR] Field ${index + 1} missing name:`, field);
    return { isValid: false, error: `Field ${index + 1}: name is required and must be a string` };
  }
  
  // Si no tiene label, usar name como label
  if (!field.label) {
    field.label = field.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    console.log(`[DEBUG] Generated label "${field.label}" from name "${field.name}"`);
  }
  
  if (typeof field.label !== 'string') {
    return { isValid: false, error: `Field ${index + 1}: label is required and must be a string` };
  }
  
  // Si no tiene tipo, asignar 'text' por defecto
  if (!field.type) {
    field.type = 'text';
    console.log(`[DEBUG] Assigned default type "text" to field "${field.name}"`);
  }
  
  if (!ALLOWED_FIELD_TYPES.includes(field.type)) {
    return { isValid: false, error: `Field ${index + 1}: type must be one of ${ALLOWED_FIELD_TYPES.join(', ')}` };
  }
  
  if (field.type === 'select' && (!field.options || !Array.isArray(field.options) || field.options.length === 0)) {
    return { isValid: false, error: `Field ${index + 1}: select fields must have options array` };
  }
  
  if (field.order !== undefined && (typeof field.order !== 'number' || field.order < 0)) {
    return { isValid: false, error: `Field ${index + 1}: order must be a positive number` };
  }
  
  console.log(`[DEBUG] Normalized field ${index + 1}:`, JSON.stringify(field, null, 2));
  return { isValid: true, normalizedField: field };
};

// Función para validar la estructura de un campo (versión original para uso no-Excel)
const validateField = (field: any, index: number): { isValid: boolean; error?: string } => {
  if (!field.name || typeof field.name !== 'string') {
    return { isValid: false, error: `Field ${index + 1}: name is required and must be a string` };
  }
  
  if (!field.label || typeof field.label !== 'string') {
    return { isValid: false, error: `Field ${index + 1}: label is required and must be a string` };
  }
  
  if (!field.type || !ALLOWED_FIELD_TYPES.includes(field.type)) {
    return { isValid: false, error: `Field ${index + 1}: type must be one of ${ALLOWED_FIELD_TYPES.join(', ')}` };
  }
  
  if (field.type === 'select' && (!field.options || !Array.isArray(field.options) || field.options.length === 0)) {
    return { isValid: false, error: `Field ${index + 1}: select fields must have options array` };
  }
  
  if (field.order !== undefined && (typeof field.order !== 'number' || field.order < 0)) {
    return { isValid: false, error: `Field ${index + 1}: order must be a positive number` };
  }
  
  return { isValid: true };
};

// Función para validar nombres únicos de campos
const validateUniqueFieldNames = (fields: any[]): { isValid: boolean; error?: string } => {
  const fieldNames = fields.map(field => field.name);
  const uniqueNames = new Set(fieldNames);
  
  if (fieldNames.length !== uniqueNames.size) {
    return { isValid: false, error: 'Field names must be unique within the table' };
  }
  
  return { isValid: true };
};

// Middleware de validación para creación en lote de tablas
export const validateBulkTableCreation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { tables } = req.body;
    const { companySlug } = req.params;
    
    // Validar que se proporcione un array de tablas
    if (!tables || !Array.isArray(tables) || tables.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Se requiere un array de tablas válido'
      });
      return;
    }

    // Validar límite máximo de tablas por operación (opcional)
    if (tables.length > 50) {
      res.status(400).json({
        success: false,
        error: 'No se pueden crear más de 50 tablas en una sola operación'
      });
      return;
    }

    // Obtener conexión para validar slugs únicos
    const conn = await getConnectionByCompanySlug(companySlug);
    const Table = getTableModel(conn);

    // Arrays para validaciones
    const slugs: string[] = [];
    const errors: string[] = [];

    // Validar cada tabla
    for (let i = 0; i < tables.length; i++) {
      const table = tables[i];
      const tableIndex = i + 1;

      // Validar campos requeridos básicos
      if (!table.name || typeof table.name !== 'string') {
        errors.push(`Tabla ${tableIndex}: se requiere un nombre válido`);
        continue;
      }

      // Si no tiene slug, generarlo automáticamente desde el nombre
      if (!table.slug || typeof table.slug !== 'string') {
        if (table.name) {
          table.slug = slugify(table.name);
          console.log(`[INFO] Generated slug "${table.slug}" for table "${table.name}"`);
        } else {
          errors.push(`Tabla ${tableIndex} (${table.name}): se requiere un slug válido o un nombre para generar el slug`);
          continue;
        }
      }

      if (!table.fields || !Array.isArray(table.fields) || table.fields.length === 0) {
        errors.push(`Tabla ${tableIndex} (${table.name}): se requiere un array de campos no vacío`);
        continue;
      }

      // Validar slug único dentro del batch
      if (slugs.includes(table.slug)) {
        errors.push(`Tabla ${tableIndex} (${table.name}): el slug "${table.slug}" está duplicado en el lote`);
        continue;
      }
      slugs.push(table.slug);

      // Validar que el slug no exista en la base de datos
      const existingTable = await Table.findOne({ 
        slug: table.slug, 
        c_name: companySlug 
      });

      if (existingTable) {
        errors.push(`Tabla ${tableIndex} (${table.name}): una tabla con el slug "${table.slug}" ya existe`);
        continue;
      }

      // Validar y normalizar estructura de campos
      const normalizedFields = [];
      let fieldsValid = true;
      let fieldError = "";

      for (let j = 0; j < table.fields.length; j++) {
        const fieldValidation = validateAndNormalizeField(table.fields[j], j);
        if (!fieldValidation.isValid) {
          errors.push(`Tabla ${tableIndex} (${table.name}): ${fieldValidation.error}`);
          fieldsValid = false;
          break;
        }
        normalizedFields.push(fieldValidation.normalizedField);
      }

      if (!fieldsValid) {
        continue;
      }

      // Actualizar los campos normalizados en la tabla
      table.fields = normalizedFields;

      // Validar nombres únicos de campos dentro de la tabla
      const uniqueValidation = validateUniqueFieldNames(table.fields);
      if (!uniqueValidation.isValid) {
        errors.push(`Tabla ${tableIndex} (${table.name}): ${uniqueValidation.error}`);
        continue;
      }

      // Validar registros si se proporcionan
      if (table.records && Array.isArray(table.records)) {
        if (table.records.length > 10000) {
          errors.push(`Tabla ${tableIndex} (${table.name}): no se pueden importar más de 10,000 registros por tabla`);
          continue;
        }

        // Validar estructura básica de registros
        for (let k = 0; k < Math.min(table.records.length, 5); k++) {
          const record = table.records[k];
          if (!record || (typeof record !== 'object')) {
            errors.push(`Tabla ${tableIndex} (${table.name}): registro ${k + 1} debe ser un objeto válido`);
            break;
          }
        }
      }
    }

    // Si hay errores, detener la operación
    if (errors.length > 0) {
      res.status(400).json({
        success: false,
        error: 'Errores de validación encontrados',
        details: errors
      });
      return;
    }

    // Si todo está bien, continuar al controlador
    next();

  } catch (error: any) {
    console.error('❌ Error in validateBulkTableCreation middleware:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno durante la validación',
      details: error.message
    });
  }
};
