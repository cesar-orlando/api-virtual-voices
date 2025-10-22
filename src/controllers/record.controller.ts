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
import { trackBotDeactivation } from "../services/internal/botAutoReactivation.service";

// Helper function to get phone fields based on company
function getPhoneFieldsForCompany(c_name: string): string[] {
  // QuickLearning uses 'telefono' as primary field
  if (c_name === 'quicklearning') {
    return ['telefono', 'phone', 'whatsapp', 'celular', 'tel', 'movil', 'number'];
  }
  // Other companies use 'phone' as primary field
  return ['phone', 'telefono', 'whatsapp', 'celular', 'tel', 'movil', 'number'];
}

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
    .replace(/\u00A0/g, ' ') // replace non-breaking spaces (char 160) with regular spaces
    .replace(/\s+/g, ' ') // normalize multiple whitespace to single space
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
  let { tableSlug, data, c_name, createdBy } = req.body;

  if (data.tableSlug) {
    tableSlug = data.tableSlug;
    delete data.tableSlug;
  }
  if (data.c_name) {
    c_name = data.c_name;
    delete data.c_name;
  }
  if (data.createdBy) {
    createdBy = data.createdBy;
    delete data.createdBy;
  }

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

    // Fuzzy search functions for intelligent property matching
    function normalizeForFuzzySearch(text: string): string {
      return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/[^\w\s]/g, '') // Remove special characters
        .replace(/\s+/g, ' ') // Normalize spaces
        .trim();
    }

    function calculateLevenshteinDistance(str1: string, str2: string): number {
      const matrix = [];
      const len1 = str1.length;
      const len2 = str2.length;

      for (let i = 0; i <= len2; i++) {
        matrix[i] = [i];
      }

      for (let j = 0; j <= len1; j++) {
        matrix[0][j] = j;
      }

      for (let i = 1; i <= len2; i++) {
        for (let j = 1; j <= len1; j++) {
          if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
            matrix[i][j] = matrix[i - 1][j - 1];
          } else {
            matrix[i][j] = Math.min(
              matrix[i - 1][j - 1] + 1,
              matrix[i][j - 1] + 1,
              matrix[i - 1][j] + 1
            );
          }
        }
      }

      return matrix[len2][len1];
    }

    function calculateSimilarity(str1: string, str2: string): number {
      const normalized1 = normalizeForFuzzySearch(str1);
      const normalized2 = normalizeForFuzzySearch(str2);
      
      if (normalized1 === normalized2) return 1.0;
      
      const distance = calculateLevenshteinDistance(normalized1, normalized2);
      const maxLength = Math.max(normalized1.length, normalized2.length);
      
      if (maxLength === 0) return 0;
      
      return 1 - (distance / maxLength);
    }

    function checkAntiFalsePositive(searchTerm: string, propertyName: string): boolean {
      // Avoid obvious mismatches
      const searchLower = searchTerm.toLowerCase();
      const propertyLower = propertyName.toLowerCase();
      
      // Case 1: "renta" should not match "venta"
      if (searchLower === 'renta' && propertyLower.includes('venta')) {
        return true;
      }
      
      // Case 2: "venta" should not match "renta"
      if (searchLower === 'venta' && propertyLower.includes('renta')) {
        return true;
      }
      
      // Case 3: Avoid matching common words when searching for specific ones
      if (searchLower.length >= 6 && propertyLower.length <= 4) {
        return true;
      }
      
      // Case 4: Avoid matching when the search term is much longer than the property
      if (searchTerm.length > propertyName.length * 1.5) {
        return true;
      }
      
      // Case 5: Strong anti-false-positive for exact opposite words
      const oppositeWords = [
        ['renta', 'venta'],
        ['venta', 'renta'],
        ['compra', 'venta'],
        ['venta', 'compra']
      ];
      
      for (const [word1, word2] of oppositeWords) {
        if (searchLower === word1 && propertyLower.includes(word2)) {
          return true;
        }
      }
      
      // Case 6: Extra strict for "renta" vs "venta"
      if (searchLower === 'renta' && (propertyLower.includes('venta') || propertyLower.includes('en venta') || propertyLower.includes('en_venta'))) {
        return true;
      }
      
      if (searchLower === 'venta' && (propertyLower.includes('renta') || propertyLower.includes('en renta') || propertyLower.includes('en_renta'))) {
        return true;
      }
      
      // Case 7: Ultra strict for exact word matches
      if (searchLower === 'renta' && propertyLower.includes('venta')) {
        return true;
      }
      
      if (searchLower === 'venta' && propertyLower.includes('renta')) {
        return true;
      }
      
      return false;
    }

    function findSmartFuzzyMatches(searchTerm: string, propertyNames: string[]): string[] {
      const normalizedSearch = normalizeForFuzzySearch(searchTerm);
      const matches: string[] = [];
      
      console.log(`🧠 Smart fuzzy search for: "${searchTerm}" against ${propertyNames.length} properties`);
      
      for (const propertyName of propertyNames) {
        const normalizedProperty = normalizeForFuzzySearch(propertyName);
        
        // Only check for very similar matches (high similarity)
        const distance = calculateLevenshteinDistance(normalizedSearch, normalizedProperty);
        const maxLength = Math.max(normalizedSearch.length, normalizedProperty.length);
        const similarity = maxLength > 0 ? 1 - (distance / maxLength) : 0;
        
        // VERY strict threshold - only very similar matches
        if (similarity > 0.8 || distance <= 2) {
          matches.push(propertyName);
          console.log(`🧠 Smart match: "${searchTerm}" ≈ "${propertyName}" (similarity: ${similarity.toFixed(3)}, distance: ${distance})`);
        }
      }
      
      // Sort by similarity (best matches first)
      matches.sort((a, b) => {
        const simA = 1 - (calculateLevenshteinDistance(normalizedSearch, normalizeForFuzzySearch(a)) / Math.max(normalizedSearch.length, normalizeForFuzzySearch(a).length));
        const simB = 1 - (calculateLevenshteinDistance(normalizedSearch, normalizeForFuzzySearch(b)) / Math.max(normalizedSearch.length, normalizeForFuzzySearch(b).length));
        return simB - simA;
      });
      
      console.log(`🎯 Smart fuzzy found ${matches.length} matches: ${matches.join(', ')}`);
      return matches;
    }

    function findEnhancedFuzzyMatches(searchTerm: string, propertyNames: string[]): string[] {
      const normalizedSearch = normalizeForFuzzySearch(searchTerm);
      const matches: string[] = [];
      
      console.log(`🔍 Enhanced fuzzy search for: "${searchTerm}" against ${propertyNames.length} properties`);
      
      for (const propertyName of propertyNames) {
        const normalizedProperty = normalizeForFuzzySearch(propertyName);
        
        // 1. Check for partial word matches
        const searchWords = normalizedSearch.split(' ').filter(word => word.length > 2);
        const propertyWords = normalizedProperty.split(' ').filter(word => word.length > 2);
        
        let hasMatch = false;
        
        // Check if any search word is similar to any property word
        for (const searchWord of searchWords) {
          for (const propertyWord of propertyWords) {
            const distance = calculateLevenshteinDistance(searchWord, propertyWord);
            const maxLength = Math.max(searchWord.length, propertyWord.length);
            const similarity = maxLength > 0 ? 1 - (distance / maxLength) : 0;
            
            // ULTRA precise threshold for enhanced search
            if (similarity > 0.7 || distance <= 1) {
              matches.push(propertyName);
              hasMatch = true;
              console.log(`✨ Enhanced match: "${searchWord}" ≈ "${propertyWord}" (similarity: ${similarity.toFixed(3)}, distance: ${distance})`);
              break;
            }
          }
          if (hasMatch) break;
        }
        
        // 2. Check for substring matches (ULTRA strict)
        if (!hasMatch) {
          for (const searchWord of searchWords) {
            if (searchWord.length >= 5) { // Only for longer words
              // Check if search word is contained in property or vice versa
              if (normalizedProperty.includes(searchWord) || searchWord.includes(normalizedProperty)) {
                matches.push(propertyName);
                console.log(`✨ Substring match: "${searchWord}" in "${propertyName}"`);
                break;
              }
            }
          }
        }
        
        // 3. Check for character-level similarity (more precise)
        if (!hasMatch) {
          for (const searchWord of searchWords) {
            if (searchWord.length >= 4) { // Only for longer words
              // Check if search word shares significant characters with property
              const commonChars = searchWord.split('').filter(char => 
                propertyWords.some(propWord => propWord.includes(char))
              ).length;
              
              // ULTRA strict character matching
              if (commonChars >= Math.min(6, searchWord.length * 0.85)) {
                matches.push(propertyName);
                console.log(`✨ Character match: "${searchWord}" shares ${commonChars} chars with "${propertyName}"`);
                break;
              }
            }
          }
        }
      }
      
      console.log(`🎯 Enhanced fuzzy found ${matches.length} matches: ${matches.join(', ')}`);
      return [...new Set(matches)]; // Remove duplicates
    }

    function findBestPropertyMatch(searchTerm: string, propertyNames: string[], threshold: number = 0.3): string | null {
      const normalizedSearch = normalizeForFuzzySearch(searchTerm);
      let bestMatch = null;
      let bestScore = 0;

      console.log(`🔍 Fuzzy matching "${searchTerm}" against ${propertyNames.length} properties`);

      for (const propertyName of propertyNames) {
        const normalizedProperty = normalizeForFuzzySearch(propertyName);
        let currentScore = 0;
        let matchType = '';
        
        // 1. Exact match (highest priority)
        if (normalizedSearch === normalizedProperty) {
          console.log(`✅ Exact match: "${propertyName}"`);
          return propertyName;
        }
        
        // 2. Check if search term is contained in property name (high priority)
        if (normalizedProperty.includes(normalizedSearch)) {
          const score = normalizedSearch.length / normalizedProperty.length;
          if (score > currentScore) {
            currentScore = score;
            matchType = 'contains';
          }
        }
        
        // 3. Check if property name is contained in search term (medium priority)
        if (normalizedSearch.includes(normalizedProperty)) {
          const score = normalizedProperty.length / normalizedSearch.length;
          if (score > currentScore) {
            currentScore = score;
            matchType = 'contained';
          }
        }
        
        // 4. Word-level matches (for cases like "residencial tamarindos" -> "tamarindos")
        const searchWords = normalizedSearch.split(' ').filter(word => word.length > 2);
        const propertyWords = normalizedProperty.split(' ').filter(word => word.length > 2);
        
        // Prioritize specific words over common words
        const commonWords = ['fraccionamiento', 'condominio', 'coto', 'torre', 'plaza', 'calle', 'paseo', 'casa', 'terreno', 'departamento', 'vista', 'cielo', 'santa', 'anita'];
        const specificWords = searchWords.filter(word => !commonWords.includes(word.toLowerCase()));
        const commonSearchWords = searchWords.filter(word => commonWords.includes(word.toLowerCase()));
        
        let wordMatches = 0;
        let specificWordMatches = 0;
        
        // First, try to match specific words (higher priority)
        for (const searchWord of specificWords) {
          for (const propertyWord of propertyWords) {
            if (propertyWord.includes(searchWord) || searchWord.includes(propertyWord)) {
              specificWordMatches++;
              break;
            }
          }
        }
        
        // Then, try to match common words (lower priority)
        for (const searchWord of commonSearchWords) {
          for (const propertyWord of propertyWords) {
            if (propertyWord.includes(searchWord) || searchWord.includes(propertyWord)) {
              wordMatches++;
              break;
            }
          }
        }
        
        if (specificWordMatches > 0) {
          // High score for specific word matches
          const wordScore = (specificWordMatches * 2) / Math.max(searchWords.length, propertyWords.length);
          if (wordScore > currentScore) {
            currentScore = wordScore;
            matchType = 'specific-word';
          }
        } else if (wordMatches > 0) {
          // Lower score for common word matches
          const wordScore = wordMatches / Math.max(searchWords.length, propertyWords.length);
          if (wordScore > currentScore) {
            currentScore = wordScore;
            matchType = 'common-word';
          }
        }
        
        // Special case: prioritize exact word matches over partial matches
        const exactWordMatches = searchWords.filter(searchWord => 
          propertyWords.some(propertyWord => 
            propertyWord.toLowerCase() === searchWord.toLowerCase()
          )
        ).length;
        
        if (exactWordMatches > 0) {
          const exactScore = (exactWordMatches * 3) / Math.max(searchWords.length, propertyWords.length);
          if (exactScore > currentScore) {
            currentScore = exactScore;
            matchType = 'exact-word';
          }
        }
        
        // 5. Levenshtein distance (for typos and phonetic errors)
        const distance = calculateLevenshteinDistance(normalizedSearch, normalizedProperty);
        const maxLength = Math.max(normalizedSearch.length, normalizedProperty.length);
        const similarity = maxLength > 0 ? 1 - (distance / maxLength) : 0;
        
        // Only use Levenshtein if the similarity is high enough and the difference is reasonable
        if (similarity > currentScore && distance <= 4 && normalizedSearch.length >= 4) {
          currentScore = similarity;
          matchType = 'levenshtein';
        }
        
        // 6. Special case: very small differences (1-2 characters)
        if (distance <= 2 && normalizedSearch.length >= 4) {
          const smallDiffScore = 0.8;
          if (smallDiffScore > currentScore) {
            currentScore = smallDiffScore;
            matchType = 'small-diff';
          }
        }
        
        // 7. Special case: larger differences for longer words (like "tamarindosss" -> "tamarindos")
        if (distance <= 4 && normalizedSearch.length >= 8) {
          const largeDiffScore = 0.6;
          if (largeDiffScore > currentScore) {
            currentScore = largeDiffScore;
            matchType = 'large-diff';
          }
        }
        
        // 8. Anti-false-positive logic: avoid obvious mismatches
        const antiFalsePositive = checkAntiFalsePositive(normalizedSearch, normalizedProperty);
        if (antiFalsePositive) {
          console.log(`🚫 Anti-false-positive: "${propertyName}" rejected for "${normalizedSearch}"`);
          continue; // Skip this match
        }
        
        // Only consider matches above threshold
        if (currentScore >= threshold && currentScore > bestScore) {
          bestScore = currentScore;
          bestMatch = propertyName;
          console.log(`🎯 New best match: "${propertyName}" (${matchType}, score: ${currentScore.toFixed(3)})`);
        }
      }

      console.log(`🏆 Final match: "${bestMatch}" (score: ${bestScore.toFixed(3)})`);
      return bestMatch;
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
              .filter(field => ['text', 'email', 'number', 'currency','select'].includes(field.type))
              .map(field => field.name);
            
            // Add phone fields for QuickLearning
            const phoneFields = getPhoneFieldsForCompany(c_name);
            textFields.push(...phoneFields);

            if (isNumberOrConvertible(value)) {
              // If it's a number, we assume it's a numeric search and convert to string for regex
              const textSearch = textFields.map(field => ({
                $expr: {
                  $regexMatch: {
                    input: { 
                      $convert: {
                        input: { $ifNull: [ `$data.${field}`, '' ] },
                        to: "string",
                        onError: "",
                        onNull: ""
                      }
                    },
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
              // UNIVERSAL FUZZY SEARCH for ALL text fields
              const searchTerm = String(value).trim();
              
              // Get all unique values from ALL text fields for fuzzy matching
              const propertyNames: string[] = [];
              try {
                // Build a select object with all text fields
                const selectFields = textFields.reduce((acc, field) => {
                  acc[`data.${field}`] = 1;
                  return acc;
                }, {} as any);
                
                const allRecords = await Record.find({ tableSlug, c_name })
                  .select(selectFields)
                  .lean();
                
                const uniqueProperties = new Set<string>();
                allRecords.forEach(record => {
                  // Iterate through all text fields
                  textFields.forEach(field => {
                    const fieldValue = record.data?.[field];
                    if (fieldValue && typeof fieldValue === 'string') {
                      const value = fieldValue.trim();
                      
                      // Add the full value
                      uniqueProperties.add(value);
                      
                      // Extract individual words (for compound searches)
                      const words = value.split(' ');
                      words.forEach(word => {
                        const cleanedWord = word.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ]/g, '').trim();
                        if (cleanedWord.length >= 3) {
                          uniqueProperties.add(cleanedWord);
                        }
                      });
                      
                      // Extract 2-word combinations
                      for (let i = 0; i < words.length - 1; i++) {
                        const twoWords = `${words[i]} ${words[i + 1]}`.trim();
                        if (twoWords.length >= 4) {
                          uniqueProperties.add(twoWords);
                        }
                      }
                    }
                  });
                });
                propertyNames.push(...Array.from(uniqueProperties));
              } catch (error) {
                console.log('Error getting property names for fuzzy search:', error);
              }

              // INTELLIGENT FUZZY SEARCH: Only use fuzzy when regular search fails
              console.log(`🔍 Intelligent fuzzy search: "${searchTerm}"`);
              
              // First try regular text search
              const textSearch = textFields.map(field => ({
                [`data.${field}`]: { $regex: buildAccentInsensitivePattern(searchTerm), $options: 'i' }
              }));
              orTextFilters.push(...textSearch);
              console.log(`✅ Using regular text search for: ${searchTerm}`);
              
              // If no exact matches found, try smart fuzzy search
              if (propertyNames.length > 0) {
                console.log(`🔍 Checking if fuzzy search is needed...`);
                
                // Try to find very similar matches (high similarity only)
                const smartMatches = findSmartFuzzyMatches(searchTerm, propertyNames);
                console.log(`✨ Smart fuzzy matches found: ${smartMatches.length}`);
                
                if (smartMatches.length > 0) {
                  // Use only the best match to avoid returning all records
                  const bestMatch = smartMatches[0];
                  const fuzzySearch = textFields.map(field => ({
                    [`data.${field}`]: { $regex: buildAccentInsensitivePattern(bestMatch), $options: 'i' }
                  }));
                  orTextFilters.push(...fuzzySearch);
                  console.log(`✅ Using smart fuzzy match: ${bestMatch}`);
                }
              }
            }
            // Ignore other types for textQuery
          } else if (dateFields.includes(fieldName)) {
            const dateRange = value as { $gte?: string; $lte?: string };
            const parsedRange: any = {};

            if (dateRange.$gte) parsedRange.$gte = new Date(dateRange.$gte);
            if (dateRange.$lte) parsedRange.$lte = new Date(dateRange.$lte);

            orDateFilters.push({[fieldName]: parsedRange })
            orDateFilters.push({[`data.${fieldName}`]: parsedRange })
          } else if (fieldName === 'number' || fieldName === 'sessionId' || fieldName === 'tabla') {
            // Add these fields as optional filters - won't affect query if no match
            otherFilters.push({
              $or: [{ 
                $expr: {
                  $regexMatch: {
                    input: { 
                      $convert: {
                        input: { $ifNull: [ `$data.${fieldName}`, '' ] },
                        to: "string",
                        onError: "",
                        onNull: ""
                      }
                    },
                    regex: `.*${escapeRegExp(String(value))}.*`,
                    options: 'i'
                  }
                }},
              ]
            });
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
                    input: { 
                      $convert: {
                        input: { $ifNull: [ `$data.${fieldName}`, '' ] },
                        to: "string",
                        onError: "",
                        onNull: ""
                      }
                    },
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

    // Obtener registros con límite de memoria optimizado
    const maxLimit = Math.min(Number(limit), 100); // Limitar a máximo 100 resultados
    const records = await Record.find(queryFilter)
      .sort(sort)
      .skip(skip)
      .limit(maxLimit)
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
                const a = normalizeForCompare(fieldValue).trim();
                const b = normalizeForCompare(value).trim();
                
                if (a === b) {
                  score += 2; // Exact match
                } else if (a.includes(b)) {
                  score += 1; // Partial match
                } else if (b.includes(a)) {
                  score += 1; // Reverse partial match
                } else {
                  // Enhanced word-level matching for better substring detection
                  const searchWords = b.split(/\s+/).filter(word => word.length > 2); // Skip short words
                  const recordWords = a.split(/\s+/);
                  
                  let wordMatches = 0;
                  let totalSearchWords = searchWords.length;
                  
                  for (const searchWord of searchWords) {
                    // Check for exact word match
                    if (recordWords.some(recordWord => recordWord === searchWord)) {
                      wordMatches += 1;
                    }
                    // Check for partial word match (substring)
                    else if (recordWords.some(recordWord => 
                      recordWord.includes(searchWord) || searchWord.includes(recordWord)
                    )) {
                      wordMatches += 0.5;
                    }
                  }
                  
                  // Score based on percentage of words matched
                  if (totalSearchWords > 0 && wordMatches > 0) {
                    const matchRatio = wordMatches / totalSearchWords;
                    if (matchRatio >= 0.7) {
                      score += 1.5; // High word match ratio
                    } else if (matchRatio >= 0.5) {
                      score += 1; // Medium word match ratio
                    } else if (matchRatio >= 0.3) {
                      score += 0.5; // Low word match ratio
                    }
                  }
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

  if (data.campos_a_actualizar) {
    // Process campos_a_actualizar array and merge into data
    if (Array.isArray(data.campos_a_actualizar)) {
      data.campos_a_actualizar.forEach((campo: string) => {
        const [key, value] = campo.split(':');
        if (key && value !== undefined) {
          data[key.trim()] = value.trim();
        }
      });
      // Remove the campos_a_actualizar field after processing
      delete data.campos_a_actualizar;
    }
  }

  if (data.messagingService == 'twilio') {
    data['asesor'] = JSON.stringify(data.asesor);
  }

  delete data.messagingService;

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

    if (data.ia == false && existingRecord.tableSlug == 'prospectos') {
      try {
        
        await trackBotDeactivation(
          existingRecord._id.toString(),
          c_name,
          {
            inactivityThreshold: Number(process.env.BOT_REACTIVATION_TIMEOUT) || 60, // Minutes before reactivation
            autoReactivationEnabled: true
          }
        );
      } catch (err) {
        console.error('⚠️ Failed to track bot deactivation:', err);
      }
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
      errors_found: partialErrors,
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

export async function getRecordByPhone(req: Request, res: Response) {
  try {
    const { c_name } = req.params;
    const { 
      page = 1, 
      limit = 50,
      sortBy = 'updatedAt',
      sortOrder = 'desc',
      filters,
      sessionId,
      tableSlug: tableSlugQuery
    } = req.query;
    const tableSlug = (typeof tableSlugQuery === 'string' && tableSlugQuery) ? tableSlugQuery : 'prospectos';

    const conn = await getConnectionByCompanySlug(c_name);
    const Record = getRecordModel(conn);
    const Table = getTableModel(conn);
    const Chats = getWhatsappChatModel(conn);

    // Get table definition for filter processing
    const table = await Table.findOne({ slug: tableSlug, c_name, isActive: true });

    // ⚡ BUILD DYNAMIC FILTERS (adapted from getDynamicRecords)
    const dynamicMatchFilters: any = {};
    let lastMessageDate: any = null;

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
          
          // If table schema exists, use it to type filters; otherwise, apply generic handling
          const fieldDef = table ? table.fields.find((f: any) => f.name === fieldName) : null;
          if (!fieldDef && !table) {
            // Generic fallback: try to infer simple equality or text contains
            if (typeof value === 'string') {
              dynamicMatchFilters[`data.${fieldName}`] = { $regex: buildAccentInsensitivePattern(String(value)), $options: 'i' };
            } else if (typeof value === 'boolean') {
              dynamicMatchFilters[`data.${fieldName}`] = value;
            } else if (isNumberOrConvertible(value)) {
              dynamicMatchFilters[`data.${fieldName}`] = Number(value as any);
            }
            continue;
          }
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
          // Get phone fields based on company
          const phoneFields = getPhoneFieldsForCompany(c_name);
          
          // Get text fields
          const textFields = table
            ? table.fields.filter(field => ['text', 'email'].includes(field.type)).map(field => field.name)
            : ['nombre', 'name', 'email'];
          
          // Create search conditions for both phone and text fields
          const searchConditions: any[] = [];
          
          // Add phone field searches
          phoneFields.forEach(field => {
            searchConditions.push({
              [`data.${field}`]: { $regex: `.*${escapeRegExp(String(parsedFilters.textQuery))}.*`, $options: 'i' }
            });
          });
          
          // Add text field searches
          textFields.forEach(field => {
            searchConditions.push({
              [`data.${field}`]: { $regex: buildAccentInsensitivePattern(String(parsedFilters.textQuery)), $options: 'i' }
            });
          });
          
          if (searchConditions.length > 0) {
            // Preservar $or existente si existe
            if (dynamicMatchFilters.$or) {
              dynamicMatchFilters.$and = [
                { $or: dynamicMatchFilters.$or },
                { $or: searchConditions }
              ];
              delete dynamicMatchFilters.$or;
            } else {
            dynamicMatchFilters.$or = searchConditions;
            }
          }
        } 
        if (parsedFilters.lastMessageDateLte) {
          lastMessageDate = new Date(parsedFilters.lastMessageDateLte);
        } 
        if (parsedFilters.advisor) {
          // Filtro de asesor simplificado y efectivo
          const advisorValue = String(parsedFilters.advisor);
          
          // Usar solo la búsqueda por regex que sabemos que funciona
          dynamicMatchFilters['data.asesor'] = { $regex: advisorValue, $options: 'i' };
        }
      } catch (error) {
        res.status(400).json({ message: "Invalid filters format" });
        return;
      }
    }

    // ⚡ FAST APPROACH: Get records first, then attach chats
    const startTime = Date.now();

    // Build base query for records
    const baseQuery: any = {
      tableSlug,
      c_name: c_name,
      ...dynamicMatchFilters
    };

    // Get total count
    const totalCount = await Record.countDocuments(baseQuery);

    // Get records with pagination
    const skip = (Number(page) - 1) * Number(limit);
    const sort: any = {};
    sort[sortBy as string] = sortOrder === 'desc' ? -1 : 1;

    const records = await Record.find(baseQuery)
      .sort(sort)
      .skip(skip)
      .limit(Number(limit))
        .lean();

    // ⚡ FAST CHAT LOOKUP: Bulk fetch chats for all records
    if (records.length > 0) {
      // Collect all phone variants for all records
      const recordPhoneMap = new Map(); // key: phone variant, value: array of record indexes
      const phoneFields = getPhoneFieldsForCompany(c_name);
      
      records.forEach((record, idx) => {
        // Try phone fields in priority order based on company
        let candidatePhoneRaw = null;
        for (const field of phoneFields) {
          if (record?.data?.[field]) {
            candidatePhoneRaw = record.data[field];
            break; // Use first non-empty field found
          }
        }
        
        if (candidatePhoneRaw) {
          const val = String(candidatePhoneRaw).trim();
        const normalized = val.replace(/\s+/g, '').replace(/^\+?52/, '52'); // normalize basic MX prefix use-case
        const withPlus = normalized.startsWith('+') ? normalized : (normalized ? `+${normalized}` : normalized);
        const phoneVariants = Array.from(new Set([
          val,
          normalized,
          withPlus,
          `${normalized}@c.us`,
          `${withPlus}@c.us`
        ].filter(Boolean)));
          
        phoneVariants.forEach(variant => {
          if (variant) {
            if (!recordPhoneMap.has(variant)) recordPhoneMap.set(variant, []);
            recordPhoneMap.get(variant).push(idx);
          }
        });
        }
      });

      const allPhoneVariants = Array.from(recordPhoneMap.keys());

      if (allPhoneVariants.length > 0) {
        // Build chat query for all variants
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
            { $project: { phone: 1, messages: 1, session: 1, lastMessageDate: 1, updatedAt: 1, botActive: 1 } }
        ]);
      } else {
          // Return only essential chat data for performance
          chatsInBatch = await Chats.find(chatQuery, { 
            phone: 1, 
            session: 1, 
            messages: 1, 
            updatedAt: 1, 
            botActive: 1 
          } as any).lean();
        }

        // Map chats to records
        const recordChatsMap = new Map(); // key: record idx, value: array of chats
      chatsInBatch.forEach(chat => {
        const idxs = recordPhoneMap.get(chat.phone);
        if (idxs) {
          idxs.forEach(idx => {
            if (!recordChatsMap.has(idx)) recordChatsMap.set(idx, []);
            recordChatsMap.get(idx).push(chat);
          });
        }
      });

        // Attach chats to records
        records.forEach((record, idx) => {
        const chats = recordChatsMap.get(idx) || [];
        if (chats.length > 0) {
            // Add chat data for compatibility
            (record as any).chats = chats;
            (record as any).totalChats = chats.length;
            (record as any).hasActiveBot = chats.some((chat: any) => chat.botActive) || chats.length > 0;
            
            // Add last message info if available
            if (chats[0] && chats[0].messages && chats[0].messages.length > 0) {
              const lastMsg = chats[0].messages[chats[0].messages.length - 1];
              record.data = record.data || {};
              record.data.lastmessagedate = lastMsg.createdAt;
              record.data.lastmessage = lastMsg.body;
            }
          } else {
            // Ensure compatibility fields exist
            (record as any).chats = [];
            (record as any).totalChats = 0;
            (record as any).hasActiveBot = false;
          }
        });
      } else {
        // No phone variants found, ensure compatibility fields exist
        records.forEach(record => {
          (record as any).chats = [];
          (record as any).totalChats = 0;
          (record as any).hasActiveBot = false;
        });
      }
    }

    const endTime = Date.now();
    const executionTime = endTime - startTime;

    // Add history if needed
    let finalRecords: any[] = records as any[];
    const historyCap = Math.min(10, 200);
    finalRecords = await attachHistoryToData(conn, finalRecords, 'Record', historyCap);

    res.status(200).json({
      success: true,
      data: finalRecords,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / Number(limit))
      },
      performance: {
        method: "Fast records-first with bulk chat lookup",
        executionTimeMs: executionTime,
        recordsFound: records.length,
        phoneMatching: "company-specific phone fields",
        dynamicFilters: Object.keys(dynamicMatchFilters).length > 0,
        lastMessageDate: lastMessageDate !== null,
        filtersApplied: [
          ...Object.keys(dynamicMatchFilters),
          ...(lastMessageDate ? ['lastMessageDate'] : []),
          ...(sessionId ? ['sessionIdFilter'] : [])
        ],
        sortBy: sortBy as string,
        sortOrder: sortOrder as string,
        optimized: true
      },
      message: `Found ${records.length} records in ${executionTime}ms using fast records-first approach.`,
      // 📱 CAMPOS ADICIONALES PARA SCROLL INFINITO
      scrollInfo: {
        currentPage: Number(page),
        totalPages: Math.ceil(totalCount / Number(limit)),
        hasMorePages: Number(page) < Math.ceil(totalCount / Number(limit)),
        recordsInThisPage: records.length,
        totalRecords: totalCount,
        nextPage: Number(page) < Math.ceil(totalCount / Number(limit)) ? Number(page) + 1 : null,
        previousPage: Number(page) > 1 ? Number(page) - 1 : null,
        progressPercentage: Math.round((Number(page) / Math.ceil(totalCount / Number(limit))) * 100),
        estimatedRemainingPages: Math.max(0, Math.ceil(totalCount / Number(limit)) - Number(page)),
        loadMoreUrl: `?page=${Number(page) + 1}&limit=${Number(limit)}&sortBy=${sortBy}&sortOrder=${sortOrder}${filters ? `&filters=${encodeURIComponent(filters as string)}` : ''}`
      },
      // 👤 INFORMACIÓN DEL ASESOR
      advisorInfo: (() => {
        try {
          const parsedFilters = filters ? JSON.parse(filters as string) : {};
          return parsedFilters?.advisor ? {
            advisorId: String(parsedFilters.advisor),
            totalProspectsAssigned: totalCount,
            currentPageProspects: records.length,
            hasMoreProspects: Number(page) < Math.ceil(totalCount / Number(limit))
          } : null;
        } catch {
          return null;
        }
      })()
    });

  } catch (error) {
    console.error('❌ Error in getRecordByPhone:', error);
    res.status(500).json({
      success: false,
      message: "Error in fast records lookup",
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export async function updateProspectsAI(req: Request, res: Response) {
  const { c_name } = req.params;
  const { user, tableSlug = 'prospectos', recordIds, AI } = req.body;

  if (!user || !recordIds) {
    res.status(400).json({ message: "user and recordIds are required" });
    return;
  }
  
  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const Record = getRecordModel(conn);
    const Table = getTableModel(conn);
    
    const table = await Table.findOne({ slug: tableSlug, c_name });
    if (!table) {
      res.status(404).json({ message: "Table not found or inactive" });
      return;
    }

    const auditContext = {
      _updatedByUser: { id: user.id, name: user.name },
      _updatedBy: user.id,
      _auditSource: 'API',
      _requestId: (req.headers['x-request-id'] as string) || undefined,
      ip: (req as any).ip,
      userAgent: req.headers['user-agent'],
    };
    
    let updateResult;
    if (recordIds === "all") {
      updateResult = await Record.updateMany(
        { tableSlug, c_name },
        { 
          $set: { 
            'data.ia': AI,
            updatedBy: user.id,
            updatedAt: new Date()
          } 
        }
      ).setOptions({ auditContext, $locals: { auditContext } } as any);
    } else {
      updateResult = await Record.updateMany(
        { tableSlug, c_name, _id: { $in: recordIds } },
        { 
          $set: { 
            'data.ia': AI,
            updatedBy: user.id,
            updatedAt: new Date()
          } 
        }
      ).setOptions({ auditContext, $locals: { auditContext } } as any);
    }
    
    res.status(200).json({ 
      message: "Prospects updated successfully with AI data", 
      updated: updateResult.modifiedCount,
      matched: updateResult.matchedCount,
      AI: AI
    });
    
  } catch (error) {
    console.error("Error updating prospects AI:", error);
    res.status(500).json({ message: "Error updating prospects", error });
  }
}

export async function createPaymentRecord(req: Request, res: Response) {
  const { c_name } = req.params;
  const { data } = req.body;

  if (!data.paymentData || !c_name) {
    res.status(400).json({ message: "c_name and data are required" });
    return;
  }
  
  try {
    const db_data: any = {};

    // Process paymentData array and merge into db_data
    if (Array.isArray(data.paymentData)) {
      data.paymentData.forEach((campo: string) => {
        const [key, value] = campo.split(':');
        if (key && value !== undefined) {
          db_data[key.trim()] = value.trim();
        }
      });
    }

    // Add additional fields if provided
    if (data.number) db_data.numero_de_cliente = data.number;

    const conn = await getConnectionByCompanySlug(c_name);
    const Record = getRecordModel(conn);
    const Table = getTableModel(conn);
    const tableSlug = 'pagos';

    // Check if table exists, if not create it
    let table = await Table.findOne({ slug: tableSlug, c_name });
    if (!table) {
      table = await Table.create({
        name: "Pagos",
        slug: tableSlug,
        c_name,
        isActive: true,
        fields: [
          { name: 'propietario', type: 'text', label: 'Propietario', required: false },
          { name: 'tipo_de_inmueble', type: 'text', label: 'Tipo de Inmueble', required: false },
          { name: 'domicilio', type: 'text', label: 'Domicilio', required: false },
          { name: 'arrendatario', type: 'text', label: 'Arrendatario', required: false },
          { name: 'precio_renta', type: 'currency', label: 'Precio Renta', required: false },
          { name: 'pago_realizado', type: 'currency', label: 'Pago Realizado', required: false },
          { name: 'numero_de_cliente', type: 'text', label: 'Número de Cliente', required: false },
        ]
      });
    }

    const newRecord = await Record.create({
      tableSlug,
      c_name,
      data: db_data,
      createdBy: data.createdBy,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    res.status(201).json({ 
      message: "Payment record created successfully", 
      record: newRecord,
      table: {
        name: table.name,
        slug: table.slug
      }
    });
  } catch (error) {
    console.error("❌ Error creating payment record:", error);
    res.status(500).json({ 
      message: "Error creating payment record", 
      error: error instanceof Error ? error.message : "Unknown error" 
    });
  }
}
