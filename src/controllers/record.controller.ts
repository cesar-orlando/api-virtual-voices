import { Request, Response } from "express";
import { Types } from "mongoose";
import { getConnectionByCompanySlug } from "../config/connectionManager";
import getTableModel from "../models/table.model";
import getRecordModel from "../models/record.model";
import { IMPORT_CONFIG, validateImportSize, generateImportReport } from "../config/importConfig";
import getUserModel from "../core/users/user.model";
import getAuditLogModel from "../models/auditLog.model";
import { attachHistoryToData } from "../plugins/auditTrail";
import { getWhatsappChatModel } from "../models/whatsappChat.model";

// Accent-insensitive utilities
// - buildAccentInsensitivePattern: builds a regex pattern string that matches both accented and unaccented variants
// - normalizeForCompare: strips diacritics and lowercases for accent-insensitive comparisons in JS
const ACCENT_MAP: Record<string, string> = {
  a: "aá",
  e: "eé",
  i: "ií",
  o: "oó",
  u: "uúü",
  n: "nñ",
  A: "AÁ",
  E: "EÉ",
  I: "IÍ",
  O: "OÓ",
  U: "UÚÜ",
  N: "NÑ",
};

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildAccentInsensitivePattern(input: string, opts?: { partial?: boolean; flexWhitespace?: boolean }): string {
  const { partial = true, flexWhitespace = true } = opts || {};
  const escaped = escapeRegExp(input);
  let pattern = "";
  for (let i = 0; i < escaped.length; i++) {
    const ch = escaped[i];
    if (ACCENT_MAP[ch]) {
      const chars = ACCENT_MAP[ch];
      pattern += `[${chars}]`;
    } else if (flexWhitespace && /\s/.test(ch)) {
      // Collapse any whitespace in the query to match variable whitespace in data
      pattern += `\\s+`;
      // Skip consecutive whitespace chars in the input
      while (i + 1 < escaped.length && /\s/.test(escaped[i + 1])) i++;
    } else {
      pattern += ch;
    }
  }
  return partial ? `.*${pattern}.*` : pattern;
}

function normalizeForCompare(s: unknown): string {
  if (s == null) return "";
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove combining marks
    .toLowerCase();
}

// Normalize Mongo Extended JSON recursively: {$oid}, {$date}
function normalizeExtendedJson(value: any): any {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(normalizeExtendedJson);
  if (typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, '$oid') && typeof (value as any).$oid === 'string') {
      const oid = (value as any).$oid;
      return Types.ObjectId.isValid(oid) ? new Types.ObjectId(oid) : oid;
    }
    if (Object.prototype.hasOwnProperty.call(value, '$date')) {
      const d = (value as any).$date;
      const dt = new Date(d);
      return isNaN(dt.getTime()) ? d : dt;
    }
    const out: any = {};
    for (const [k, v] of Object.entries(value)) out[k] = normalizeExtendedJson(v);
    return out;
  }
  return value;
}

// Función para validar el valor de un campo según su tipo
const validateFieldValue = (rawValue: any, field: any): any => {
  const value = normalizeExtendedJson(rawValue);
  if (value === undefined || value === null) {
    return field.defaultValue !== undefined ? field.defaultValue : null;
  }

  switch (field.type) {
    case 'text':
    case 'email':
      if (typeof value !== 'string') {
        throw new Error(`Campo '${field.label}' debe ser texto`);
      }
      if (field.type === 'email') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          throw new Error(`Campo '${field.label}' debe ser un email válido`);
        }
      }
      return value;

    case 'number':
      const numValue = Number(value);
      if (isNaN(numValue)) {
        throw new Error(`Campo '${field.label}' debe ser un número`);
      }
      return numValue;

    case 'date':
      // Handle empty values
      if (value === undefined || value === null || value === '') {
        return null;
      }
      
      let dateValue: Date;
      
      // Handle Excel serial date numbers (days since 1900-01-01)
      if (typeof value === 'number') {
        // Excel date serial number conversion
        // Excel counts from 1900-01-01, but has a leap year bug (treats 1900 as leap year)
        const excelEpoch = new Date(1899, 11, 30); // December 30, 1899
        dateValue = new Date(excelEpoch.getTime() + (value * 24 * 60 * 60 * 1000));
      } else {
        // Try to parse as regular date string
        dateValue = new Date(value);
      }
      
      if (isNaN(dateValue.getTime())) {
        throw new Error(`Campo '${field.label}' debe ser una fecha válida. Recibido: ${value} (tipo: ${typeof value})`);
      }
      
      return dateValue;

    case 'boolean':
      if (typeof value === 'string') {
        if (value.toLowerCase() === 'true') return true;
        if (value.toLowerCase() === 'false') return false;
        throw new Error(`Campo '${field.label}' debe ser true o false`);
      }
      if (typeof value !== 'boolean') {
        throw new Error(`Campo '${field.label}' debe ser booleano`);
      }
      return value;

    case 'select':
      if (field.options && !field.options.includes(value) && value !== '') {
        throw new Error(`Campo '${field.label}' debe ser uno de: ${field.options.join(', ')}`);
      }
      return value;

    case 'currency':
      const currencyValue = Number(value);
      if (isNaN(currencyValue)) {
        throw new Error(`Campo '${field.label}' debe ser un valor monetario válido`);
      }
      return currencyValue;

    case 'file':
      // Para archivos, asumimos que ya viene procesado
      return value;

    case 'object':
    case 'json': {
      if (typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`Campo '${field.label}' debe ser un objeto`);
      }
      return value;
    }

    default:
      return value;
  }
};

// Función para transformar y validar datos contra la estructura de tabla
const transformAndValidateData = (data: any, table: any): Record<string, any> => {
  const validatedData: Record<string, any> = {};
  const errors: string[] = [];

  // Validar campos requeridos y transformar valores
  for (const field of table.fields) {
    try {
      const value = data[field.name];
      
      // Verificar campos requeridos
      if (field.required && (value === undefined || value === null || value === '')) {
        errors.push(`Campo '${field.label}' es obligatorio`);
        continue;
      }

      // Validar y transformar valor
      validatedData[field.name] = validateFieldValue(value, field);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Error en campo '${field.label}'`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Errores de validación: ${errors.join(', ')}`);
  }

  return validatedData;
};

// Crear un nuevo registro dinámico
export const createDynamicRecord = async (req: Request, res: Response) => {
  const { tableSlug, data, c_name, createdBy } = req.body;

  if (!tableSlug || !data || !c_name || !createdBy) {
    res.status(400).json({ 
      message: "tableSlug, data, c_name and createdBy are required" 
    });
    return;
  }

  if (typeof data !== 'object' || Array.isArray(data)) {
    res.status(400).json({ 
      message: "data must be an object" 
    });
    return;
  }

  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const Table = getTableModel(conn);
    const Record = getRecordModel(conn);

    // 1. Obtener tabla y validar que existe
    const table = await Table.findOne({ slug: tableSlug, c_name, isActive: true });
    if (!table) {
      res.status(404).json({ message: "Table not found or inactive" });
      return;
    }

    // 2. Transformar y validar datos contra la estructura de tabla
    let validatedData: Record<string, any>;
    try {
      validatedData = transformAndValidateData(data, table);
    } catch (error) {
      res.status(400).json({ 
        message: "Data validation failed", 
        error: error instanceof Error ? error.message : "Unknown validation error"
      });
      return;
    }

    // 3. Crear y guardar el registro
    const newRecord = new Record({ 
      tableSlug, 
      c_name, 
      data: validatedData, 
      createdBy 
    });
    await newRecord.save();

    res.status(201).json({ 
      message: "Dynamic record created successfully", 
      record: newRecord,
      table: {
        name: table.name,
        slug: table.slug,
        fields: table.fields
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Error creating dynamic record", error });
  }
};

export const getDynamicRecords = async (req: Request, res: Response) => {
  const { tableSlug, c_name } = req.params;
  const {
    page = 1,
    limit = 100,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    filters,
    includeHistory,
    historyLimit
  } = req.query;

  try {
    const allowedParams = ['page', 'limit', 'sortBy', 'sortOrder', 'filters','includeHistory','historyLimit'];
    const extraFilters = Object.keys(req.query).filter(key => !allowedParams.includes(key));

    if (extraFilters.length > 0) {
      res.status(400).json({
        message: "All filters must be sent in the 'filters' query parameter as a JSON string.",
        invalidParams: extraFilters
      });
      return;
    }

    const conn = await getConnectionByCompanySlug(c_name);
    const Record = getRecordModel(conn);
    const Table = getTableModel(conn);

    // Validar que la tabla existe
    const table = await Table.findOne({ slug: tableSlug, c_name, isActive: true });
    if (!table) {
      res.status(404).json({ message: "Table not found or inactive" });
      return;
    }

    // Filtros base fijos
    const queryFilter: any = { tableSlug, c_name };

    // Arrays para almacenar filtros
    const orTextFilters: any[] = [];
    const orDateFilters: any[] = [];
    const otherFilters: any[] = [];

    // Procesar filtros directos de query (excluyendo parámetros especiales)
    for (const [key, value] of Object.entries(req.query)) {
      if (
        !['page', 'limit', 'sortBy', 'sortOrder', 'filters'].includes(key) &&
        value !== undefined &&
        value !== null &&
        value !== ''
      ) {
        const fieldDef = table.fields.find((f: any) => f.name === key);
        if (fieldDef) {
          // Soportar rangos numéricos enviados como arrays: ?precio=3000000&precio=4500000
          if ((fieldDef.type === 'number' || fieldDef.type === 'currency') && Array.isArray(value) && value.length >= 2) {
            const [min, max] = value as any[];
            const hasMin = min !== undefined && min !== '' && !isNaN(Number(min));
            const hasMax = max !== undefined && max !== '' && !isNaN(Number(max));
            const range: any = {};
            if (hasMin) range.$gte = Number(min);
            if (hasMax) range.$lte = Number(max);
            if (Object.keys(range).length > 0) {
              queryFilter[`data.${key}`] = range;
              continue;
            }
          }

          // Manejo estándar para valores simples
          switch (fieldDef.type) {
            case 'number':
            case 'currency': {
              const numVal = Number(value as any);
              if (!isNaN(numVal)) queryFilter[`data.${key}`] = numVal;
              break;
            }
            case 'boolean': {
              const boolVal = String(value).toLowerCase() === 'true';
              queryFilter[`data.${key}`] = boolVal;
              break;
            }
            case 'date': {
              if (Array.isArray(value) && value.length >= 2) {
                const [from, to] = value as any[];
                const range: any = {};
                if (from) range.$gte = new Date(from);
                if (to) range.$lte = new Date(to);
                if (Object.keys(range).length > 0) queryFilter[`data.${key}`] = range;
              } else {
                const d = new Date(value as any);
                if (!isNaN(d.getTime())) queryFilter[`data.${key}`] = d;
              }
              break;
            }
            default: {
              // Texto: usar regex (accent- and case-insensitive)
              const pattern = buildAccentInsensitivePattern(String(value));
              queryFilter[`data.${key}`] = { $regex: pattern, $options: 'i' };
              break;
            }
          }
        }
      }
    }

    // Check if value is a number or can be converted to a number
    function isNumberOrConvertible(val: any): boolean {
      if (typeof val === 'number' && !isNaN(val)) return true;
      if (typeof val === 'string' && val.trim() !== '' && !isNaN(Number(val))) return true;
      return false;
    }

    // Procesar filtros dinámicos (JSON string)
    if (filters && typeof filters === 'string') {
      try {
        const parsedFilters = JSON.parse(filters);

        for (const [fieldName, value] of Object.entries(parsedFilters)) {
          if (value === undefined || value === null || value === '') continue;

          const dateFields = [
            ...table.fields
              .filter(field => field.type === 'date')
              .map(field => field.name),
            'createdAt'
          ];

          if (fieldName === 'textQuery') {
            const textFields = table.fields
              .filter(field => ['text', 'email', 'number', 'currency'].includes(field.type))
              .map(field => field.name);

            if (isNumberOrConvertible(value)) {
              // If it's a number, we assume it's a numeric search and convert to string for regex
              const textSearch = textFields.map(field => ({
                $expr: {
                  $regexMatch: {
                    input: { $toString: { $ifNull: [ `$data.${field}`, '' ] } },
                    regex: `.*${escapeRegExp(String(value))}.*`,
                    options: 'i'
                  }
                }
              }));
              orTextFilters.push({ $or: textSearch });
            } else if (typeof value === 'boolean') {
              const boolFields = table.fields
                .filter(field => field.type === 'boolean')
                .map(field => field.name);
              
              const boolSearch = boolFields.map(field => ({
                [`data.${field}`]: value
              }));
              orTextFilters.push({ $or: boolSearch });
            } else if (typeof value === 'string') {
              // If it's a string, we assume it's a text search
              const textSearch = textFields.map(field => ({
                [`data.${field}`]: { $regex: buildAccentInsensitivePattern(String(value)), $options: 'i' }
              }));
              orTextFilters.push(...textSearch);
            }
            // Ignore other types for textQuery
          } else if (dateFields.includes(fieldName)) {
            const dateRange = value as { $gte?: string; $lte?: string };
            const parsedRange: any = {};

            if (dateRange.$gte) parsedRange.$gte = new Date(dateRange.$gte);
            if (dateRange.$lte) parsedRange.$lte = new Date(dateRange.$lte);

            orDateFilters.push({[fieldName]: parsedRange })
            orDateFilters.push({[`data.${fieldName}`]: parsedRange })
          } else {
            // Numeric range support: { fieldName: { $gte: N, $lte: M } }
            const isRangeObject = Array.isArray(value) && value !== null && value.length === 2;
            if (isRangeObject) {
              const range: any = {};
              if ((value as any)[0] !== undefined) range.$gte = Number((value as any)[0]);
              if ((value as any)[1] !== undefined) range.$lte = Number((value as any)[1]);
              otherFilters.push({ [`data.${fieldName}`]: range });
            } else if (isNumberOrConvertible(value)) {
              // Fallback: numeric-like value -> text contains on stringified field
              otherFilters.push({
                $expr: {
                  $regexMatch: {
                    input: { $toString: { $ifNull: [ `$data.${fieldName}`, '' ] } },
                    regex: `.*${escapeRegExp(String(value))}.*`,
                    options: 'i'
                  }
                }
              });
            } else if (typeof value === 'boolean') {
              otherFilters.push({ [`data.${fieldName}`]: value });
            } else if (typeof value === 'string') {
              otherFilters.push({ [`data.${fieldName}`]: { $regex: buildAccentInsensitivePattern(String(value)), $options: 'i' } });
            }
            // Ignore other types for other fields
          }
        }
      } catch (error) {
        res.status(400).json({ message: "Invalid filters format" });
        return;
      }
    }

    // Agrupar los filtros de texto en un solo $or, y los de fecha como $and
    const andGroup: any[] = [];

    if (orTextFilters.length > 0) {
      andGroup.push({ $or: orTextFilters });
    }
    // Agrupar los filtros de fecha en un solo $or si hay más de uno
    if (orDateFilters.length > 0) {
      if (orDateFilters.length === 1) {
        andGroup.push(orDateFilters[0]);
      } else {
        andGroup.push({ $or: orDateFilters });
      }
    }
    if (otherFilters.length > 0) {
      andGroup.push({ $or: otherFilters });
    }

    // Si hay filtros, agruparlos en $and
    if (andGroup.length > 0) {
      queryFilter.$and = andGroup;
    }

    // Configurar paginación y ordenamiento
    const skip = (Number(page) - 1) * Number(limit);
    const sort: any = {};
    sort[sortBy as string] = sortOrder === 'desc' ? -1 : 1;

    // Obtener registros
    const records = await Record.find(queryFilter)
      .sort(sort)
      .skip(skip)
      .limit(Number(limit))
      .lean();

    // Contar total de registros
    const total = await Record.countDocuments(queryFilter);

    // Scoring logic: rank records by number of filter matches (partial/fuzzy matching)
    let scoredRecords: (typeof records[0] & { matchScore: number })[] = records as any;

    // Detect presence of numeric range in direct query (?precio=min&precio=max)
    const hasRangeInQuery = Object.entries(req.query).some(([key, value]) => {
      const fieldDef = table.fields.find((f: any) => f.name === key);
      return fieldDef && (fieldDef.type === 'number' || fieldDef.type === 'currency') && Array.isArray(value) && (value as any[]).length >= 2;
    });

    if ((filters && typeof filters === 'string') || hasRangeInQuery) {
      try {
        const parsedFilters = filters && typeof filters === 'string' ? JSON.parse(filters) : {};

        // Build numeric range criteria from JSON filters ($gte/$lte etc.)
        const rangeCriteriaMap = new Map<string, { $gte?: number; $gt?: number; $lte?: number; $lt?: number }>();
        for (const [fieldName, value] of Object.entries(parsedFilters)) {
          if (value && typeof value === 'object') {
            const v: any = value;
            if ('$gte' in v || '$gt' in v || '$lte' in v || '$lt' in v) {
              rangeCriteriaMap.set(fieldName, {
                ...(v.$gte !== undefined ? { $gte: Number(v.$gte) } : {}),
                ...(v.$lte !== undefined ? { $lte: Number(v.$lte) } : {}),
              });
            }
          }
        }

        // Add numeric range criteria from direct query arrays
        for (const [key, value] of Object.entries(parsedFilters)) {
          const fieldDef = table.fields.find((f: any) => f.name === key);
          if (fieldDef && (fieldDef.type === 'number' || fieldDef.type === 'currency') && Array.isArray(value) && (value as any[]).length >= 1) {
            const [min, max] = value as any[];
            const crit: any = {};
            if (min !== undefined && min !== '' && !isNaN(Number(min))) crit.$gte = Number(min);
            if (max !== undefined && max !== '' && !isNaN(Number(max))) crit.$lte = Number(max);
            if (Object.keys(crit).length > 0 && !rangeCriteriaMap.has(key)) {
              rangeCriteriaMap.set(key, crit);
            }
          }
        }

        scoredRecords = records.map(record => {
          let score = 0;

          // Base scoring from parsedFilters (exact/partial text and equality)
          for (const [fieldName, value] of Object.entries(parsedFilters)) {
            if (value !== undefined && value !== null && value !== '') {
              const fieldValue = record.data[fieldName];
              if (typeof value === 'string' && typeof fieldValue === 'string') {
                const a = normalizeForCompare(fieldValue);
                const b = normalizeForCompare(value);
                if (a === b) {
                  score += 2; // Exact match
                } else if (a.includes(b)) {
                  score += 1; // Partial match
                }
              } else if (typeof (value as any) !== 'object' && fieldValue == value) {
                score += 2; // Exact match for non-string scalar
              }
            }
          }

          // Additional scoring: numeric range matches
          for (const [fieldName, crit] of rangeCriteriaMap.entries()) {
            const val = record.data[fieldName];
            const numVal = typeof val === 'number' ? val : (typeof val === 'string' && val.trim() !== '' && !isNaN(Number(val)) ? Number(val) : undefined);
            if (numVal === undefined) continue;
            if (crit.$gte !== undefined && !(numVal >= crit.$gte)) continue;
            if (crit.$lte !== undefined && !(numVal <= crit.$lte)) continue;
            score += 1; // Reward range match
          }

          return { ...record, matchScore: score };
        });
        scoredRecords.sort((a, b) => b.matchScore - a.matchScore);
      } catch (error) {
        // If parsing fails, keep default ordering
      }
    }

    // Optionally enrich with changeHistory from auditlogs (Option A)
    let finalRecords: any[] = scoredRecords as any[];
    const withHistory = String(includeHistory || 'false').toLowerCase() === 'true';
    const historyCap = Math.min(Number(historyLimit) || 10, 200);
    if (withHistory && finalRecords.length > 0) {
      finalRecords = await attachHistoryToData(conn, finalRecords, 'Record', historyCap);
    }

    res.json({
      records: finalRecords,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Error in getDynamicRecords:', error);
    res.status(500).json({ message: "Error fetching dynamic records", error });
  }
};

// Obtener un registro con estructura de tabla
export const getRecordWithTable = async (req: Request, res: Response) => {
  const { id, c_name } = req.params;

  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const Record = getRecordModel(conn);
    const Table = getTableModel(conn);
    
    const record = await Record.findOne({ _id: id, c_name });

    if (!record) {
      res.status(404).json({ message: "Record not found" });
      return;
    }

    // Obtener estructura de tabla
    const table = await Table.findOne({ slug: record.tableSlug, c_name, isActive: true });
    if (!table) {
      res.status(404).json({ message: "Table not found or inactive" });
      return;
    }

    res.status(200).json({ 
      message: "Record found successfully", 
      record,
      table: {
        name: table.name,
        slug: table.slug,
        fields: table.fields
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching record", error });
  }
};

// Buscar un registro dinámico por su ID
export const getDynamicRecordById = async (req: Request, res: Response) => {
  const { id, c_name } = req.params;

  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const Record = getRecordModel(conn);
    
    const record = await Record.findOne({ _id: id, c_name });

    if (!record) {
      res.status(404).json({ message: "Record not found" });
      return;
    }

    res.status(200).json({ 
      message: "Record found successfully", 
      record 
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching record", error });
  }
};

// Validar datos sin guardar
export const validateRecord = async (req: Request, res: Response) => {
  const { tableSlug, data, c_name } = req.body;

  if (!tableSlug || !data || !c_name) {
    res.status(400).json({ 
      message: "tableSlug, data and c_name are required" 
    });
    return;
  }

  if (typeof data !== 'object' || Array.isArray(data)) {
    res.status(400).json({ 
      message: "data must be an object" 
    });
    return;
  }

  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const Table = getTableModel(conn);

    // Obtener tabla
    const table = await Table.findOne({ slug: tableSlug, c_name, isActive: true });
    if (!table) {
      res.status(404).json({ message: "Table not found or inactive" });
      return;
    }

    // Validar datos
    try {
      const validatedData = transformAndValidateData(data, table);
      
      res.status(200).json({ 
        message: "Data validation successful", 
        isValid: true,
        validatedData,
        table: {
          name: table.name,
          slug: table.slug,
          fields: table.fields
        }
      });
    } catch (error) {
      res.status(400).json({ 
        message: "Data validation failed", 
        isValid: false,
        error: error instanceof Error ? error.message : "Unknown validation error"
      });
    }
  } catch (error) {
    res.status(500).json({ message: "Error validating data", error });
  }
};

// Actualizar un registro dinámico
export const updateDynamicRecord = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { data, c_name, updatedBy } = req.body;

  if (!data || !c_name || !updatedBy) {
    res.status(400).json({ 
      message: "data, c_name and updatedBy are required" 
    });
    return;
  }

  if (typeof data !== 'object' || Array.isArray(data)) {
    res.status(400).json({ 
      message: "data must be an object" 
    });
    return;
  }

  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const Record = getRecordModel(conn);
    const Table = getTableModel(conn);

    // Buscar el registro existente
    const existingRecord = await Record.findOne({ _id: id, c_name });
    if (!existingRecord) {
      res.status(404).json({ message: "Record not found" });
      return;
    }

    // Extraer tableSlug de los datos si está presente
    const { tableSlug: newTableSlug, ...dataWithoutTableSlug } = data;
    const currentTableSlug = existingRecord.tableSlug;
    const isTableSlugChanged = newTableSlug && newTableSlug !== currentTableSlug;

    // Determinar qué tabla usar para validación
    let targetTableSlug = currentTableSlug;
    if (isTableSlugChanged) {
      // Validar que la nueva tabla existe
      const newTable = await Table.findOne({ slug: newTableSlug, c_name, isActive: true });
      if (!newTable) {
        res.status(404).json({ 
          message: "New table not found or inactive", 
          newTableSlug 
        });
        return;
      }
      targetTableSlug = newTableSlug;
    }

    // Obtener tabla para validación
    const table = await Table.findOne({ slug: targetTableSlug, c_name, isActive: true });
    if (!table) {
      res.status(404).json({ message: "Table not found or inactive" });
      return;
    }

    // Validación parcial: validar únicamente los campos provistos
    const updatableFieldNames = new Set<string>(table.fields.map((f: any) => f.name));
    const partialValidated: Record<string, any> = {};
    const partialErrors: string[] = [];
    for (const [key, rawVal] of Object.entries(dataWithoutTableSlug)) {
      if (!updatableFieldNames.has(key)) continue; // ignorar campos no definidos en la tabla
      let fieldDef = table.fields.find((f: any) => f.name === key);
      try {
        partialValidated[key] = validateFieldValue(rawVal, fieldDef);
      } catch (e: any) {
        partialErrors.push(`${e?.message} for field '${key}' with value '${rawVal}'` || `Invalid value for field '${key}'`);
      }
    }
    if (partialErrors.length > 0) {
      res.status(400).json({ message: "Data validation failed", errors: partialErrors });
      return;
    }

    const User = getUserModel(conn);
    // Resolve updatedBy flexibly to avoid ObjectId cast errors
    let user: any = null;
    let userId: any = undefined;
    let userName: string | undefined = undefined;

    try {
      // Support Extended JSON ({ $oid })
      const updatedByObjId =
        (typeof updatedBy === 'object' && updatedBy && '$oid' in updatedBy && Types.ObjectId.isValid((updatedBy as any).$oid))
          ? new Types.ObjectId((updatedBy as any).$oid)
          : (typeof updatedBy === 'string' && Types.ObjectId.isValid(updatedBy))
            ? new Types.ObjectId(updatedBy)
            : null;

      if (updatedByObjId) {
        user = await User.findById(updatedByObjId);
      } else if (typeof updatedBy === 'string') {
        // Try by email, then by name; do NOT query by _id to avoid cast errors
        if (!user && updatedBy.includes('@')) {
          user = await User.findOne({ email: updatedBy });
        }
        if (!user) {
          user = await User.findOne({ name: updatedBy });
        }
      }
    } catch (_) {
      // Swallow lookup errors; we'll fall back to string actor
    }

    if (user) {
      userId = user._id;
      userName = user.name;
    } else if (data?.sessionId) {
      // Bot-driven update
      userId = 'Bot';
      userName = typeof updatedBy === 'string' ? updatedBy : undefined;
    } else if (typeof updatedBy === 'string') {
      // Fallback: treat the string as actor id/name (e.g., "SophIA")
      userId = updatedBy;
      userName = updatedBy;
    }

    // Actualizar el registro parcialmente
    const oldData = { ...(existingRecord.data || {}) };

    // console.log('Partial update diff:', { oldKeys: Object.keys(oldData), newKeys: Object.keys(partialValidated) });

    // Build change entries solo para los campos enviados
    const fields = new Set<string>(Object.keys(partialValidated));
    const changes: Array<{
      user: { id?: any; name?: string };
      field: string;
      oldValue: any;
      newValue: any;
      changedAt: Date;
    }> = [];

    for (const field of fields) {
      const before = oldData[field];
      const after = partialValidated[field];
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        changes.push({
          user: { id: userId, name: userName },
          field,
          oldValue: before,
          newValue: after,
          changedAt: new Date(),
        });
    // Aplicar el cambio sin reemplazar todo el objeto data
        existingRecord.data[field] = after;
      }
    }

    // Mixed type (Schema.Types.Mixed) requires explicit marking when mutating nested keys
    if (changes.length) existingRecord.markModified('data');

    // No reemplazar existingRecord.data completo; ya aplicamos cambios puntuales arriba
    existingRecord.updatedBy = updatedBy;

    // Contexto para plugin de auditoría
    (existingRecord as any)._updatedByUser = { id: userId, name: userName };
    (existingRecord as any)._updatedBy = userId;
    (existingRecord as any)._auditSource = 'API';
    (existingRecord as any)._requestId = (req.headers['x-request-id'] as string) || undefined;

    // Si el tableSlug cambió, actualizarlo también en memoria
    if (isTableSlugChanged) {
      existingRecord.tableSlug = newTableSlug;
    }

    // Persist with an atomic updateOne (faster, triggers audit middleware)
    const setOps: any = { updatedBy, updatedAt: new Date() };
    for (const ch of changes) {
      setOps[`data.${ch.field}`] = ch.newValue;
    }
    if (isTableSlugChanged) {
      setOps.tableSlug = newTableSlug;
    }

    const auditContext = {
      _updatedByUser: { id: userId, name: userName },
      _updatedBy: userId,
      _auditSource: 'API',
      _requestId: (req.headers['x-request-id'] as string) || undefined,
      ip: (req as any).ip,
      userAgent: req.headers['user-agent'],
    };

    await Record.updateOne(
      { _id: id, c_name },
      { $set: setOps }
    ).setOptions({ auditContext, $locals: { auditContext } } as any);

    res.status(200).json({ 
      message: "Dynamic record updated successfully", 
      record: existingRecord,
      table: {
        name: table.name,
        slug: table.slug,
        fields: table.fields
      },
      tableChanged: isTableSlugChanged,
      previousTableSlug: isTableSlugChanged ? currentTableSlug : undefined
    });
  } catch (error) {
    console.log("Error updating dynamic record:", error);
    res.status(500).json({ message: "Error updating dynamic record", error });
  }
};

// Eliminar un registro dinámico
export const deleteDynamicRecord = async (req: Request, res: Response) => {
  const { id, c_name } = req.params;

  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const Record = getRecordModel(conn);

    const deletedRecord = await Record.findOneAndDelete({ _id: id, c_name });

    if (!deletedRecord) {
      res.status(404).json({ message: "Record not found" });
      return;
    }

    res.status(200).json({ 
      message: "Dynamic record deleted successfully", 
      record: deletedRecord 
    });
  } catch (error) {
    res.status(500).json({ message: "Error deleting dynamic record", error });
  }
};

// Buscar registros con filtros
export const searchRecords = async (req: Request, res: Response) => {
  const { tableSlug, c_name } = req.params;
  const { query, filters, page = 1, limit = 10 } = req.body;

  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const Record = getRecordModel(conn);
    const Table = getTableModel(conn);

    // Validar que la tabla existe
    const table = await Table.findOne({ slug: tableSlug, c_name, isActive: true });
    if (!table) {
      res.status(404).json({ message: "Table not found or inactive" });
      return;
    }

    // Construir filtros de búsqueda
    const searchFilter: any = { tableSlug, c_name };

    // Búsqueda por texto en todos los campos de texto
    if (query) {
      const textFields = table.fields
        .filter(field => ['text', 'email'].includes(field.type))
        .map(field => field.name);
      
      if (textFields.length > 0) {
        const textSearch = textFields.map(field => ({
          [`data.${field}`]: { $regex: buildAccentInsensitivePattern(String(query)), $options: 'i' }
        }));
        searchFilter.$or = textSearch;
      }
    }

    // Filtros específicos por campo
    if (filters && typeof filters === 'object') {
      for (const [fieldName, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null && value !== '') {
          searchFilter[`data.${fieldName}`] = value;
        }
      }
    }

    // Configurar paginación
    const skip = (Number(page) - 1) * Number(limit);

    // Ejecutar búsqueda
    const records = await Record.find(searchFilter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const total = await Record.countDocuments(searchFilter);

    res.json({
      records,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Error searching records", error });
  }
};

// Obtener estadísticas de registros
export const getRecordStats = async (req: Request, res: Response) => {
  const { tableSlug, c_name } = req.params;

  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const Record = getRecordModel(conn);
    const Table = getTableModel(conn);

    // Validar que la tabla existe
    const table = await Table.findOne({ slug: tableSlug, c_name, isActive: true });
    if (!table) {
      res.status(404).json({ message: "Table not found or inactive" });
      return;
    }

    // Obtener estadísticas básicas
    const totalRecords = await Record.countDocuments({ tableSlug, c_name });
    
    // Registros creados en los últimos 30 días
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentRecords = await Record.countDocuments({
      tableSlug,
      c_name,
      createdAt: { $gte: thirtyDaysAgo }
    });

    // Registros por día (últimos 7 días)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const dailyStats = await Record.aggregate([
      {
        $match: {
          tableSlug,
          c_name,
          createdAt: { $gte: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Totales por campana
    const campanaStats = await Record.aggregate([
      { $match: { tableSlug, c_name } },
      { $group: { _id: "$data.campana", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Totales por medio
    const medioStats = await Record.aggregate([
      { $match: { tableSlug, c_name } },
      { $group: { _id: "$data.medio", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Totales por ciudad
    const ciudadStats = await Record.aggregate([
      { $match: { tableSlug, c_name } },
      { $group: { _id: "$data.ciudad", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.json({
      totalRecords,
      recentRecords,
      dailyStats,
      campanaStats,
      medioStats,
      ciudadStats,
      table: {
        name: table.name,
        slug: table.slug,
        fieldCount: table.fields.length
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching record stats", error });
  }
};

// Obtener registro con estructura de tabla
export const getRecordWithStructure = async (req: Request, res: Response) => {
  const { id, c_name } = req.params;

  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const Record = getRecordModel(conn);
    const Table = getTableModel(conn);
    
    const record = await Record.findOne({ _id: id, c_name });

    if (!record) {
      res.status(404).json({ message: "Record not found" });
      return;
    }

    // Obtener estructura de tabla
    const table = await Table.findOne({ slug: record.tableSlug, c_name, isActive: true });
    if (!table) {
      res.status(404).json({ message: "Table not found or inactive" });
      return;
    }

    res.status(200).json({ 
      message: "Record found successfully", 
      record,
      structure: {
        name: table.name,
        slug: table.slug,
        fields: table.fields
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching record", error });
  }
};

// Operaciones masivas - Actualizar registros
export const bulkUpdateRecords = async (req: Request, res: Response) => {
  const { tableSlug, c_name } = req.params;
  const { records, updatedBy } = req.body;

  if (!records || !Array.isArray(records) || !updatedBy) {
    res.status(400).json({ 
      message: "records array and updatedBy are required" 
    });
    return;
  }

  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const Record = getRecordModel(conn);
    const Table = getTableModel(conn);

    // Validar que la tabla existe
    const table = await Table.findOne({ slug: tableSlug, c_name, isActive: true });
    if (!table) {
      res.status(404).json({ message: "Table not found or inactive" });
      return;
    }

    const results = [];
    const errors = [];

    for (const recordUpdate of records) {
      try {
        const { id, data } = recordUpdate;
        
        if (!id || !data) {
          errors.push({ id, error: "ID and data are required" });
          continue;
        }

        // Buscar registro existente
        const existingRecord = await Record.findOne({ _id: id, tableSlug, c_name });
        if (!existingRecord) {
          errors.push({ id, error: "Record not found" });
          continue;
        }

        // Combinar datos existentes con nuevos
        const combinedData = { ...existingRecord.data, ...data };

        // Validar datos combinados
        let validatedData: Record<string, any>;
        try {
          validatedData = transformAndValidateData(combinedData, table);
        } catch (validationError) {
          errors.push({ 
            id, 
            error: validationError instanceof Error ? validationError.message : "Validation error" 
          });
          continue;
        }

        // Actualizar registro
        existingRecord.data = validatedData;
        existingRecord.updatedBy = updatedBy;
        await existingRecord.save();

        results.push({ id, success: true, record: existingRecord });
      } catch (error) {
        errors.push({ 
          id: recordUpdate.id, 
          error: error instanceof Error ? error.message : "Unknown error" 
        });
      }
    }

    res.status(200).json({ 
      message: "Bulk update completed", 
      results,
      errors,
      summary: {
        total: records.length,
        successful: results.length,
        failed: errors.length
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Error performing bulk update", error });
  }
};

// Operaciones masivas - Eliminar registros
export const bulkDeleteRecords = async (req: Request, res: Response) => {
  const { tableSlug, c_name } = req.params;
  const { recordIds } = req.body;

  if (!recordIds || !Array.isArray(recordIds)) {
    res.status(400).json({ 
      message: "recordIds array is required" 
    });
    return;
  }

  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const Record = getRecordModel(conn);

    const results = [];
    const errors = [];

    for (const id of recordIds) {
      try {
        const deletedRecord = await Record.findOneAndDelete({ 
          _id: id, 
          tableSlug, 
          c_name 
        });

        if (deletedRecord) {
          results.push({ id, success: true });
        } else {
          errors.push({ id, error: "Record not found" });
        }
      } catch (error) {
        errors.push({ 
          id, 
          error: error instanceof Error ? error.message : "Unknown error" 
        });
      }
    }

    res.status(200).json({ 
      message: "Bulk delete completed", 
      results,
      errors,
      summary: {
        total: recordIds.length,
        successful: results.length,
        failed: errors.length
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Error performing bulk delete", error });
  }
};

// Importar registros
export const importRecords = async (req: Request, res: Response) => {
  const { tableSlug, c_name } = req.params;
  const { records, createdBy, options } = req.body;

  if (!records || !Array.isArray(records) || !createdBy) {
    res.status(400).json({ 
      message: "records array and createdBy are required" 
    });
    return;
  }

  if (records.length === 0) {
    res.status(400).json({ 
      message: "records array cannot be empty" 
    });
    return;
  }

  // Default options if not provided
  const importOptions = {
    duplicateStrategy: options?.duplicateStrategy || 'skip',
    identifierField: options?.identifierField || '',
    updateExistingFields: options?.updateExistingFields !== false // default true
  };

  // Validar tamaño de datos antes de procesar
  const sizeValidation = validateImportSize(req.headers['content-length'], records.length);
  if (!sizeValidation.isValid) {
    res.status(413).json({ 
      message: "Import validation failed", 
      error: sizeValidation.error 
    });
    return;
  }

  console.log(`🚀 Starting import: ${records.length} records for table ${tableSlug} with strategy: ${importOptions.duplicateStrategy}`);

  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const Record = getRecordModel(conn);
    const Table = getTableModel(conn);

    // Validar que la tabla existe
    const table = await Table.findOne({ slug: tableSlug, c_name, isActive: true });
    if (!table) {
      res.status(404).json({ message: "Table not found or inactive" });
      return;
    }

    // Validar que el campo identificador existe si se especifica
    if (importOptions.identifierField && importOptions.duplicateStrategy !== 'create') {
      const fieldExists = table.fields.some((field: any) => field.name === importOptions.identifierField);
      if (!fieldExists) {
        res.status(400).json({ 
          message: `Identifier field '${importOptions.identifierField}' not found in table structure` 
        });
        return;
      }
    }

    // Obtener registros existentes si necesitamos verificar duplicados
    let existingRecords: any[] = [];
    if (importOptions.identifierField && importOptions.duplicateStrategy !== 'create') {
      console.log(`🔍 Fetching existing records for duplicate detection using field: ${importOptions.identifierField}`);
      existingRecords = await Record.find({ 
        tableSlug, 
        c_name,
        [`data.${importOptions.identifierField}`]: { $exists: true }
      }).lean();
      console.log(`📋 Found ${existingRecords.length} existing records`);
    }

    // Crear un mapa de registros existentes para búsqueda rápida
    const existingRecordsMap = new Map();
    if (importOptions.identifierField) {
      existingRecords.forEach(record => {
        const identifierValue = record.data[importOptions.identifierField];
        if (identifierValue !== undefined && identifierValue !== null) {
          existingRecordsMap.set(String(identifierValue), record);
        }
      });
    }

    // Contadores para el reporte
    let newRecords = 0;
    let updatedRecords = 0;
    let duplicatesSkipped = 0;
    const errors: any[] = [];

    // Arrays para diferentes operaciones
    const recordsToInsert: any[] = [];
    const recordsToUpdate: any[] = [];

    console.log(`📋 Processing ${records.length} records...`);

    for (let i = 0; i < records.length; i++) {
      const recordData = records[i];
      
      try {
        if (!recordData.data || typeof recordData.data !== 'object') {
          errors.push({ 
            index: i, 
            error: "Invalid data format" 
          });
          continue;
        }

        // Validar datos contra la estructura de tabla
        let validatedData: Record<string, any>;
        try {
          validatedData = transformAndValidateData(recordData.data, table);
        } catch (validationError) {
          errors.push({ 
            index: i, 
            error: validationError instanceof Error ? validationError.message : "Validation error" 
          });
          continue;
        }

        // Verificar duplicados si se especifica un campo identificador
        let existingRecord = null;
        if (importOptions.identifierField && validatedData[importOptions.identifierField] !== undefined) {
          const identifierValue = String(validatedData[importOptions.identifierField]);
          existingRecord = existingRecordsMap.get(identifierValue);
        }

        if (existingRecord) {
          // Registro duplicado encontrado
          switch (importOptions.duplicateStrategy) {
            case 'skip':
              duplicatesSkipped++;
              console.log(`⏭️  Skipping duplicate record ${i + 1} (${importOptions.identifierField}: ${validatedData[importOptions.identifierField]})`);
              break;

            case 'update':
              // Preparar datos para actualización
              let updateData = { ...validatedData };
              
              if (importOptions.updateExistingFields) {
                // Solo actualizar campos que no están vacíos
                updateData = Object.fromEntries(
                  Object.entries(validatedData).filter(([key, value]) => 
                    value !== null && value !== undefined && value !== ''
                  )
                );
              }

              recordsToUpdate.push({
                filter: { _id: existingRecord._id },
                update: {
                  $set: {
                    data: { ...existingRecord.data, ...updateData },
                    updatedBy: createdBy,
                    updatedAt: new Date()
                  }
                }
              });
              console.log(`🔄 Prepared update for record ${i + 1} (${importOptions.identifierField}: ${validatedData[importOptions.identifierField]})`);
              break;

            case 'create':
              // Crear como nuevo registro (ignorar duplicados)
              recordsToInsert.push({
                tableSlug,
                c_name,
                data: validatedData,
                createdBy,
                createdAt: new Date(),
                updatedAt: new Date()
              });
              break;
          }
        } else {
          // Registro nuevo
          recordsToInsert.push({
            tableSlug,
            c_name,
            data: validatedData,
            createdBy,
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }

        // Log progreso cada 100 registros
        if ((i + 1) % 100 === 0) {
          console.log(`✅ Processed ${i + 1}/${records.length} records`);
        }
      } catch (error) {
        errors.push({ 
          index: i, 
          error: error instanceof Error ? error.message : "Unknown error" 
        });
      }
    }

    console.log(`📊 Processing complete: ${recordsToInsert.length} to insert, ${recordsToUpdate.length} to update, ${duplicatesSkipped} skipped, ${errors.length} errors`);

    // Ejecutar inserciones
    if (recordsToInsert.length > 0) {
      console.log(`💾 Inserting ${recordsToInsert.length} new records...`);
      try {
        const insertedRecords = await Record.insertMany(recordsToInsert, { 
          ordered: false 
        });
        newRecords = insertedRecords.length;
        console.log(`✅ Inserted ${newRecords} new records`);
      } catch (insertError: any) {
        console.error('❌ Insert error:', insertError);
        if (insertError.writeErrors) {
          insertError.writeErrors.forEach((writeError: any) => {
            errors.push({
              index: writeError.index,
              error: writeError.err.errmsg || "Insert error"
            });
          });
          newRecords = recordsToInsert.length - insertError.writeErrors.length;
        }
      }
    }

    // Ejecutar actualizaciones
    if (recordsToUpdate.length > 0) {
      console.log(`🔄 Updating ${recordsToUpdate.length} existing records...`);
      try {
        for (const updateOp of recordsToUpdate) {
          try {
            await Record.updateOne(updateOp.filter, updateOp.update);
            updatedRecords++;
          } catch (updateError) {
            console.error('❌ Update error:', updateError);
            errors.push({
              error: `Failed to update record: ${updateError instanceof Error ? updateError.message : 'Unknown error'}`
            });
          }
        }
        console.log(`✅ Updated ${updatedRecords} records`);
      } catch (bulkUpdateError) {
        console.error('❌ Bulk update error:', bulkUpdateError);
      }
    }

    // Generar reporte final compatible con tu frontend
    const totalProcessed = newRecords + updatedRecords + duplicatesSkipped;
    const report = {
      summary: {
        totalProcessed: records.length,
        successful: newRecords + updatedRecords,
        total: records.length,
        failed: errors.length,
        newRecords,
        updatedRecords,
        duplicatesSkipped,
        errors: errors.length
      },
      details: {
        strategy: importOptions.duplicateStrategy,
        identifierField: importOptions.identifierField,
        updateExistingFields: importOptions.updateExistingFields
      },
      errors: errors.slice(0, 20) // Limitar errores mostrados
    };

    console.log(`✅ Import completed:`, report.summary);

    res.status(201).json({
      message: "Import completed",
      ...report,
      // Keep these for backward compatibility with existing code
      importedRecords: recordsToInsert.length > 0 ? { length: newRecords } : null
    });

  } catch (error) {
    console.error('❌ Import failed:', error);
    res.status(500).json({ 
      message: "Import failed", 
      error: error instanceof Error ? error.message : "Unknown error" 
    });
  }
};

// Exportar registros
export const exportRecords = async (req: Request, res: Response) => {
  const { tableSlug, c_name } = req.params;
  const { format = 'json', filters } = req.query;

  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const Record = getRecordModel(conn);
    const Table = getTableModel(conn);

    // Validar que la tabla existe
    const table = await Table.findOne({ slug: tableSlug, c_name, isActive: true });
    if (!table) {
      res.status(404).json({ message: "Table not found or inactive" });
      return;
    }

    // Construir filtros de consulta
    const queryFilter: any = { tableSlug, c_name };

    // Aplicar filtros si se proporcionan
    if (filters && typeof filters === 'string') {
      try {
        const parsedFilters = JSON.parse(filters);
        for (const [fieldName, value] of Object.entries(parsedFilters)) {
          if (value !== undefined && value !== null && value !== '') {
            queryFilter[`data.${fieldName}`] = value;
          }
        }
      } catch (error) {
        res.status(400).json({ message: "Invalid filters format" });
        return;
      }
    }

    // Obtener todos los registros
    const records = await Record.find(queryFilter)
      .sort({ createdAt: -1 })
      .lean();

    const exportData = {
      table: {
        name: table.name,
        slug: table.slug,
        fields: table.fields
      },
      records,
      exportInfo: {
        exportedAt: new Date(),
        format: format,
        totalRecords: records.length,
        filters: filters || null
      }
    };

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${tableSlug}-records-${Date.now()}.json"`);
      res.json(exportData);
    } else {
      res.status(400).json({ message: "Unsupported export format" });
    }
  } catch (error) {
    res.status(500).json({ message: "Error exporting records", error });
  }
};

// Agregar nuevo campo a todos los registros
export const addNewFieldToAllRecords = async (req: Request, res: Response) => {
  const { tableSlug, c_name, fieldName, defaultValue, updatedBy } = req.body;

  if (!tableSlug || !c_name || !fieldName || !updatedBy) {
    res.status(400).json({ 
      message: "tableSlug, c_name, fieldName and updatedBy are required" 
    });
    return;
  }

  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const Record = getRecordModel(conn);
    const Table = getTableModel(conn);

    // Validar que la tabla existe
    const table = await Table.findOne({ slug: tableSlug, c_name, isActive: true });
    if (!table) {
      res.status(404).json({ message: "Table not found or inactive" });
      return;
    }

    // Verificar que el campo no existe ya en la tabla
    const fieldExists = table.fields.some(field => field.name === fieldName);
    if (fieldExists) {
      res.status(400).json({ message: "Field already exists in table structure" });
      return;
    }

    // Actualizar todos los registros para incluir el nuevo campo
    const updateResult = await Record.updateMany(
      { tableSlug, c_name },
      { 
        $set: { 
          [`data.${fieldName}`]: defaultValue,
          updatedBy,
          updatedAt: new Date()
        } 
      }
    );

    res.status(200).json({ 
      message: "Field added to all records successfully", 
      summary: {
        totalRecords: updateResult.modifiedCount,
        newField: fieldName,
        defaultValue
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Error adding field to records", error });
  }
};

// Eliminar campos de todos los registros
export const deleteFieldsFromAllRecords = async (req: Request, res: Response) => {
  const { tableSlug, c_name, fieldNames, updatedBy } = req.body;

  if (!tableSlug || !c_name || !fieldNames || !Array.isArray(fieldNames) || !updatedBy) {
    res.status(400).json({ 
      message: "tableSlug, c_name, fieldNames array and updatedBy are required" 
    });
    return;
  }

  if (fieldNames.length === 0) {
    res.status(400).json({ message: "fieldNames array cannot be empty" });
    return;
  }

  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const Record = getRecordModel(conn);
    const Table = getTableModel(conn);

    // Validar que la tabla existe
    const table = await Table.findOne({ slug: tableSlug, c_name, isActive: true });
    if (!table) {
      res.status(404).json({ message: "Table not found or inactive" });
      return;
    }

    // Construir objeto de eliminación
    const unsetObject: any = {};
    fieldNames.forEach(fieldName => {
      unsetObject[`data.${fieldName}`] = "";
    });

    // Eliminar campos de todos los registros
    const updateResult = await Record.updateMany(
      { tableSlug, c_name },
      { 
        $unset: unsetObject,
        $set: {
          updatedBy,
          updatedAt: new Date()
        }
      }
    );

    res.status(200).json({ 
      message: "Fields deleted from all records successfully", 
      summary: {
        totalRecords: updateResult.modifiedCount,
        deletedFields: fieldNames
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Error deleting fields from records", error });
  }
};

// Eliminar campos de un registro específico
export const deleteFieldsFromRecord = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { fieldNames, updatedBy } = req.body;

  if (!fieldNames || !Array.isArray(fieldNames) || !updatedBy) {
    res.status(400).json({ 
      message: "fieldNames array and updatedBy are required" 
    });
    return;
  }

  if (fieldNames.length === 0) {
    res.status(400).json({ message: "fieldNames array cannot be empty" });
    return;
  }

  try {
    const conn = await getConnectionByCompanySlug(""); // Necesitamos obtener c_name del registro
    const Record = getRecordModel(conn);

    // Buscar el registro para obtener c_name
    const record = await Record.findById(id);
    if (!record) {
      res.status(404).json({ message: "Record not found" });
      return;
    }

    // Usar la conexión correcta
    const correctConn = await getConnectionByCompanySlug(record.c_name);
    const CorrectRecord = getRecordModel(correctConn);

    // Construir objeto de eliminación
    const unsetObject: any = {};
    fieldNames.forEach(fieldName => {
      unsetObject[`data.${fieldName}`] = "";
    });

    // Eliminar campos del registro
    const updatedRecord = await CorrectRecord.findByIdAndUpdate(
      id,
      { 
        $unset: unsetObject,
        $set: {
          updatedBy,
          updatedAt: new Date()
        }
      },
      { new: true }
    );

    if (!updatedRecord) {
      res.status(404).json({ message: "Record not found after update" });
      return;
    }

    res.status(200).json({ 
      message: "Fields deleted from record successfully", 
      record: updatedRecord,
      deletedFields: fieldNames
    });
  } catch (error) {
    res.status(500).json({ message: "Error deleting fields from record", error });
  }
};

export async function searchPropiedadesGrupokg(req: Request, res: Response): Promise<any> {
  try {
    // Solo permitir para grupokg
    const c_name = 'grupokg';
    const tableSlug = 'propiedades';
    const conn = await getConnectionByCompanySlug(c_name);
    const Record = getRecordModel(conn);

    // Extraer todos los filtros posibles del query
    const { 
      zona, 
      precioMin, 
      precioMax, 
      renta_venta_inversion, 
      titulo,
      colonia,
      recamaras,
      banos,
      estacionamiento,
      mts_de_terreno,
      metros_de_construccion,
      disponibilidad,
      aceptan_creditos,
      mascotas,
      limit = 50
    } = req.query;

    // Construir filtro base
    const filter: any = {
      tableSlug,
      c_name
    };

    // Búsqueda flexible: si solo hay un parámetro de búsqueda principal, busca en los tres campos
    const searchTerm = colonia || zona || titulo;
    const searchParams = [colonia, zona, titulo].filter(Boolean);
    if (searchParams.length === 1 && searchTerm) {
      filter.$or = [
  { 'data.colonia': { $regex: buildAccentInsensitivePattern(String(searchTerm)), $options: 'i' } },
  { 'data.zona': { $regex: buildAccentInsensitivePattern(String(searchTerm)), $options: 'i' } },
  { 'data.titulo': { $regex: buildAccentInsensitivePattern(String(searchTerm)), $options: 'i' } }
      ];
    } else {
      if (zona) {
  filter['data.zona'] = { $regex: buildAccentInsensitivePattern(String(zona)), $options: 'i' };
      }
      if (titulo) {
  filter['data.titulo'] = { $regex: buildAccentInsensitivePattern(String(titulo)), $options: 'i' };
      }
      if (colonia) {
  filter['data.colonia'] = { $regex: buildAccentInsensitivePattern(String(colonia)), $options: 'i' };
      }
    }

    if (precioMin) {
      filter['data.precio'] = { 
        $gte: Number(precioMin),
        ...(filter['data.precio'] || {})
      };
    }
    if (precioMax) {
      filter['data.precio'] = { 
        $lte: Number(precioMax),
        ...(filter['data.precio'] || {})
      };
    }
    if (renta_venta_inversion) {
  filter['data.renta_venta_inversión '] = { $regex: buildAccentInsensitivePattern(String(renta_venta_inversion)), $options: 'i' };
    }
    if (recamaras) {
      filter['data.recamaras'] = recamaras as string;
    }
    if (banos) {
      filter['data.banos'] = Number(banos);
    }
    if (estacionamiento) {
      filter['data.estacionamiento'] = estacionamiento as string;
    }
    if (mts_de_terreno) {
      filter['data.mts_de_terreno'] = { $gte: Number(mts_de_terreno) };
    }
    if (metros_de_construccion) {
      filter['data.metros_de_construccion '] = { $gte: Number(metros_de_construccion) };
    }
    if (disponibilidad) {
  filter['data.disponibilidad'] = { $regex: buildAccentInsensitivePattern(String(disponibilidad)), $options: 'i' };
    }
    if (aceptan_creditos) {
  filter['data.aceptan_creditos '] = { $regex: buildAccentInsensitivePattern(String(aceptan_creditos)), $options: 'i' };
    }
    if (mascotas) {
  filter['data.mascotas'] = { $regex: buildAccentInsensitivePattern(String(mascotas)), $options: 'i' };
    }

    // Ejecutar búsqueda
    const records = await Record.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .lean();

    // Formato exacto como el JSON que enviaste
    const response = {
      records,
      pagination: {
        page: 1,
        limit: records.length,
        total: records.length,
        pages: 1
      }
    };

    console.log(`Búsqueda grupokg propiedades: ${records.length} resultados encontrados`);
    return res.json(response);
    
  } catch (error) {
    console.error('Error en searchPropiedadesGrupokg:', error);
    return res.status(500).json({ 
      error: 'Error interno en búsqueda de propiedades',
      details: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
}

export async function getRecordByPhone(req: Request, res: Response) {
  try {
    const { c_name } = req.params;
    const { 
      page = 1, 
      limit = 50,
      sortBy = 'updatedAt',
      sortOrder = 'desc',
      filters,
      sessionId // ✅ NEW: Session filter parameter
    } = req.query; // ADDED FILTER PARAMETERS
    
    const conn = await getConnectionByCompanySlug(c_name);
    const Record = getRecordModel(conn);
    const Table = getTableModel(conn);
    const Chats = getWhatsappChatModel(conn);

    // Get table definition for filter processing
    const table = await Table.findOne({ slug: "prospectos", c_name, isActive: true });
    if (!table) {
      res.status(404).json({ message: "Prospectos table not found" });
      return;
    }

    // ⚡ BUILD DYNAMIC FILTERS (adapted from getDynamicRecords)
    const dynamicMatchFilters: any = {};
    let lastMessageDate: any = null; // ✅ NEW: Variable to store last message date filter

    function isNumberOrConvertible(val: any): boolean {
      if (typeof val === 'number' && !isNaN(val)) return true;
      if (typeof val === 'string' && val.trim() !== '' && !isNaN(Number(val))) return true;
      return false;
    }
    
    // Process dynamic filters from JSON string
    if (filters && typeof filters === 'string') {
      try {
        const parsedFilters = JSON.parse(filters);
        
        for (const [fieldName, value] of Object.entries(parsedFilters)) {
          if (value === undefined || value === null || value === '') continue;
          
          const fieldDef = table.fields.find((f: any) => f.name === fieldName);
          if (!fieldDef) continue;
          
          // Handle different field types
          switch (fieldDef.type) {
            case 'number':
            case 'currency': {
              const numVal = Number(value);
              if (!isNaN(numVal)) {
                dynamicMatchFilters[`data.${fieldName}`] = numVal;
              }
              break;
            }
            case 'boolean': {
              const boolVal = String(value).toLowerCase() === 'true';
              dynamicMatchFilters[`data.${fieldName}`] = boolVal;
              break;
            }
            case 'date': {
              if (typeof value === 'object' && value !== null) {
                const dateRange = value as any;
                const range: any = {};
                if (dateRange.$gte) range.$gte = new Date(dateRange.$gte);
                if (dateRange.$lte) range.$lte = new Date(dateRange.$lte);
                if (Object.keys(range).length > 0) {
                  dynamicMatchFilters[`data.${fieldName}`] = range;
                }
              } else {
                const d = new Date(value as any);
                if (!isNaN(d.getTime())) {
                  dynamicMatchFilters[`data.${fieldName}`] = d;
                }
              }
              break;
            }
            default: {
              // Text fields: use regex (accent-insensitive)
              const pattern = buildAccentInsensitivePattern(String(value));
              dynamicMatchFilters[`data.${fieldName}`] = { $regex: pattern, $options: 'i' };
              break;
            }
          }
        }
        
        // Handle textQuery (global search)
        if (parsedFilters.textQuery) {
          const textFields = table.fields
            .filter(field => ['text', 'email'].includes(field.type))
            .map(field => field.name);

          const numberFields = table.fields
            .filter(field => ['number', 'currency'].includes(field.type))
            .map(field => field.name);
            
          if (textFields.length > 0) {
            
            if (isNumberOrConvertible(parsedFilters.textQuery)) {
              // If it's a number, we assume it's a numeric search and convert to string for regex
              const numberSearch = numberFields.map(field => ({
                $expr: {
                  $regexMatch: {
                    input: { $toString: { $ifNull: [ `$data.${field}`, '' ] } },
                    regex: `.*${escapeRegExp(String(parsedFilters.textQuery))}.*`,
                    options: 'i'
                  }
                }
              }));
              dynamicMatchFilters.$or = numberSearch;
            } else if (typeof parsedFilters.textQuery === 'string') {
              // If it's a string, we assume it's a text search
              const textSearch = textFields.map(field => ({
                [`data.${field}`]: { $regex: buildAccentInsensitivePattern(String(parsedFilters.textQuery)), $options: 'i' }
              }));
              dynamicMatchFilters.$or = textSearch;
            }
          }
        } else if (parsedFilters.lastMessageDateLte) {
          lastMessageDate = new Date(parsedFilters.lastMessageDateLte);
        } else if (parsedFilters.advisor) {
          // Handle both ObjectId and string formats for advisor matching
          const advisorValue = parsedFilters.advisor;
          const orConditions = [
            { [`data.asesor.id`]: advisorValue } // Match as string
          ];

          // If it's a valid ObjectId, also try matching as ObjectId
          if (Types.ObjectId.isValid(advisorValue)) {
            orConditions.push({
              [`data.asesor.id`]: new Types.ObjectId(advisorValue)
            });
          }

          // If we have multiple conditions, use $or; otherwise use the single condition
          if (orConditions.length > 1) {
            dynamicMatchFilters.$or = orConditions;
          } else {
            dynamicMatchFilters[`data.asesor.id`] = advisorValue;
          }
        }
      } catch (error) {
        res.status(400).json({ message: "Invalid filters format" });
        return;
      }
    }

    // --- Application-level batching for early stop when enough records with chats are found ---
    const startTime = Date.now();
    const batchSize = Number(limit) * 5;
    let foundRecordsWithChats: any[] = [];
    let totalCandidates = 0;
    let lastBatch = false;

    // Build base query for dynamicrecords
    const baseQuery: any = {
      tableSlug: "prospectos",
      c_name: c_name,
      ...dynamicMatchFilters
    };

    // For total count (all candidates, not just with chats)
    const totalCount = await Record.countDocuments(baseQuery);

    // For performance info
    let batches = 0;
    let skipCandidates = 0;

    // True pagination: accumulate all records-with-chats, then slice for requested page
    while (!lastBatch && foundRecordsWithChats.length < Number(page) * Number(limit)) {
      batches++;
      // Fetch a batch of dynamicrecords
      const candidates = await Record.find(baseQuery)
        .sort({ [sortBy as string]: sortOrder === 'desc' ? -1 : 1 })
        .skip(skipCandidates)
        .limit(batchSize)
        .lean();

      if (candidates.length === 0) break;
      totalCandidates += candidates.length;
      if (candidates.length < batchSize) lastBatch = true;

      // --- Bulk chat lookup optimization ---
      // 1. Collect all phone variants for all candidates
      const recordPhoneMap = new Map(); // key: phone variant, value: array of record indexes
      candidates.forEach((record, idx) => {
        const phoneVariants = [
          String(record.data?.number) + "@c.us",
          String(record.data?.number)
        ];
        phoneVariants.forEach(variant => {
          if (variant) {
            if (!recordPhoneMap.has(variant)) recordPhoneMap.set(variant, []);
            recordPhoneMap.get(variant).push(idx);
          }
        });
      });
      const allPhoneVariants = Array.from(recordPhoneMap.keys());

      // 2. Build chat query for all variants in batch
      const chatQuery: any = { phone: { $in: allPhoneVariants } };
      if (sessionId) {
        let sessionIdObj = undefined;
        try {
          if (Types.ObjectId.isValid(sessionId as string)) {
            sessionIdObj = new Types.ObjectId(sessionId as string);
          }
        } catch (_) {}
        chatQuery["$or"] = sessionIdObj ? [
          { "session.id": sessionId },
          { "session.id": sessionIdObj }
        ] : [
          { "session.id": sessionId }
        ];
      }
      let chatsInBatch;
      if (lastMessageDate) {
        // Use aggregation to get only chats whose last message's createdAt matches the filter
        chatsInBatch = await Chats.aggregate([
          { $match: chatQuery },
          { $addFields: {
              lastMessageDate: { $max: "$messages.createdAt" }
            }
          },
          { $match: { lastMessageDate: { $lte: lastMessageDate } } },
        ]);
      } else {
        chatsInBatch = await Chats.find(chatQuery);
      }

      // 3. Map chats to candidate records
      //    For each chat, assign it to all records whose phoneVariants match
      const recordChatsMap = new Map(); // key: candidate idx, value: array of chats
      chatsInBatch.forEach(chat => {
        const idxs = recordPhoneMap.get(chat.phone);
        if (idxs) {
          idxs.forEach(idx => {
            if (!recordChatsMap.has(idx)) recordChatsMap.set(idx, []);
            recordChatsMap.get(idx).push(chat);
          });
        }
      });

      // 4. For each candidate, check if it has chats
      for (let idx = 0; idx < candidates.length; idx++) {
        const record = candidates[idx];
        const chats = recordChatsMap.get(idx) || [];

        // Deduplication: only add if not already seen
        if (chats.length > 0) {
          // Add totalChats and hasActiveBot fields for compatibility
          if (lastMessageDate && sessionId) {
            record.data.lastmessagedate = chats[0].lastMessageDate;
            record.data.lastmessage = chats[0].messages[chats[0].messages.length - 1].body;
          } else if (sessionId) {
            record.data.lastmessagedate = chats[0].messages[chats[0].messages.length - 1].createdAt;
            record.data.lastmessage = chats[0].messages[chats[0].messages.length - 1].body;
          }
          foundRecordsWithChats.push({
            ...record,
            chats,
            totalChats: chats.length,
            hasActiveBot: chats.length > 0
          });
        }
      }
      // Move skip forward for next batch
      skipCandidates += batchSize;
    }

    // Calculate start/end for true pagination
    const startIdx = (Number(page) - 1) * Number(limit);
    const endIdx = startIdx + Number(limit);
    const pagedRecords = foundRecordsWithChats.slice(startIdx, endIdx);
    const endTime = Date.now();
    const executionTime = endTime - startTime;

    res.status(200).json({
      success: true,
      data: pagedRecords,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / Number(limit))
      },
      performance: {
        method: "App-level batching with true pagination on records with chats",
        batches,
        executionTimeMs: executionTime,
        recordsWithChats: foundRecordsWithChats.length,
        includesMessages: "all messages included",
        phoneMatching: "name + number + @c.us variants",
        dynamicFilters: Object.keys(dynamicMatchFilters).length > 0,
        lastMessageDate: lastMessageDate !== null,
        filtersApplied: [
          ...Object.keys(dynamicMatchFilters),
          ...(lastMessageDate ? ['lastMessageDate'] : []),
          ...(sessionId ? ['sessionIdFilter'] : [])
        ],
        sortBy: sortBy as string,
        sortOrder: sortOrder as string,
        earlyPagination: false,
        optimized: true
      },
      message: `Found ${pagedRecords.length} records (with chats, deduplicated) in ${executionTime}ms using app-level batching and true pagination.`
    });

  } catch (error) {
    console.error('Error in ultra-fast aggregation:', error);
    res.status(500).json({
      success: false,
      message: "Error in ultra-fast aggregation",
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}