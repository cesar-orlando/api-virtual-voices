import { Request, Response } from "express";
import { getConnectionByCompanySlug } from "../config/connectionManager";
import getTableModel from "../models/table.model";
import getRecordModel from "../models/record.model";
import { IMPORT_CONFIG, validateImportSize, generateImportReport } from "../config/importConfig";

// Función para validar el valor de un campo según su tipo
const validateFieldValue = (value: any, field: any): any => {
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
    filters
  } = req.query;

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
        let filterValue: any = value;
        if (fieldDef) {
          switch (fieldDef.type) {
            case 'number':
            case 'currency':
              filterValue = Number(value);
              break;
            case 'boolean':
              filterValue = value === 'true';
              break;
            case 'date':
              break;
            default:
              filterValue = { $regex: `.*${value}.*`, $options: 'i' };
              break;
          }
        }
      }
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
              .filter(field => ['text', 'email'].includes(field.type))
              .map(field => field.name);

            const textSearch = textFields.map(field => ({
              [`data.${field}`]: { $regex: value, $options: 'i' }
            }));

            orTextFilters.push(...textSearch);

          } else if (dateFields.includes(fieldName)) {
            const dateRange = value as { $gte?: string; $lte?: string };
            const parsedRange: any = {};

            if (dateRange.$gte) parsedRange.$gte = new Date(dateRange.$gte);
            if (dateRange.$lte) parsedRange.$lte = new Date(dateRange.$lte);

            orDateFilters.push({[fieldName]: parsedRange })
            orDateFilters.push({[`data.${fieldName}`]: parsedRange })
          } else {
            otherFilters.push({ [`data.${fieldName}`]: value });
          }
        }
      } catch (error) {
        res.status(400).json({ message: "Invalid filters format" });
        return;
      }
    }
    const andFilters: any[] = [];

    if (orTextFilters.length > 0) {
      andFilters.push({ $or: orTextFilters });
    }

    if (orDateFilters.length > 0) {
      andFilters.push({ $or: orDateFilters });
    }

    if (otherFilters.length > 0) {
      andFilters.push(...otherFilters);
    }

    // Si hay filtros combinados, agregarlos con $and
    if (andFilters.length > 0) {
      queryFilter.$and = andFilters;
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
    console.error('Error in getDynamicRecords:', error);
    res.status(500).json({ message: "Error fetching dynamic records", error });
  }
};


// Obtener todos los registros de una tabla
export const getDynamicRecordsBot = async (req: Request, res: Response) => {
  const { tableSlug, c_name } = req.params;
  const { 
    page = 1, 
    limit = 100, 
    sortBy = 'createdAt', 
    sortOrder = 'desc',
    filters,
    characteristics
  } = req.query;

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

    // Procesar filtros directos de query
    for (const [key, value] of Object.entries(req.query)) {
      if (
        !['page', 'limit', 'sortBy', 'sortOrder', 'filters', 'characteristics'].includes(key) &&
        value !== undefined &&
        value !== null &&
        value !== ''
      ) {
        // Buscar el tipo de campo en la tabla
        const fieldDef = table.fields.find((f: any) => f.name === key);
        let filterValue: any = value;
        if (fieldDef) {
          switch (fieldDef.type) {
            case 'number':
            case 'currency':
              filterValue = Number(value);
              break;
            case 'boolean':
              if (value === 'true') filterValue = true;
              else if (value === 'false') filterValue = false;
              break;
            default:
              filterValue = { $regex: `^${value}$`, $options: 'i' };
              break;
          }
        }
        queryFilter[`data.${key}`] = filterValue;
      }
    }

    // Aplicar filtros dinámicos si se proporcionan
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

    // Configurar paginación y ordenamiento
    const skip = (Number(page) - 1) * Number(limit);
    const sort: any = {};
    sort[sortBy as string] = sortOrder === 'desc' ? -1 : 1;

    // Si characteristics=true, mostrar toda la información (sin proyección)
    // Si characteristics no está presente o es false, mostrar solo ciertos campos
    let projection = undefined;
    if (!characteristics || String(characteristics) === "false") {
      projection = {};
      Object.keys(queryFilter).forEach(key => {
        if (key.startsWith('data.')) {
          projection[key] = 1; // Incluir solo campos de datos
        }
      });
      table.fields.slice(0, 3).forEach((f: any) => {
      projection[`data.${f.name}`] = 1;
      });
      projection["createdAt"] = 1;
      projection["updatedAt"] = 1;
    }

    // Obtener registros con o sin proyección
    const records = await Record.find(queryFilter, projection)
      .sort(sort)
      .skip(skip)
      .limit(Number(limit))
      .lean();

    // Contar total de registros
    const total = await Record.countDocuments(queryFilter);

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

    // Combinar datos existentes con nuevos datos para actualización parcial
    const combinedData = { ...existingRecord.data, ...dataWithoutTableSlug };

    // Validar datos combinados contra la estructura de tabla
    let validatedData: Record<string, any>;
    try {
      validatedData = transformAndValidateData(combinedData, table);
    } catch (error) {
      res.status(400).json({ 
        message: "Data validation failed", 
        error: error instanceof Error ? error.message : "Unknown validation error"
      });
      return;
    }

    // Actualizar el registro
    existingRecord.data = validatedData;
    existingRecord.updatedBy = updatedBy;
    
    // Si el tableSlug cambió, actualizarlo también
    if (isTableSlugChanged) {
      existingRecord.tableSlug = newTableSlug;
    }
    
    await existingRecord.save();

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
          [`data.${field}`]: { $regex: query, $options: 'i' }
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

    // Verificar que los campos existen en la tabla
    const existingFields = table.fields.map(field => field.name);
    const invalidFields = fieldNames.filter(fieldName => !existingFields.includes(fieldName));
    
    if (invalidFields.length > 0) {
      res.status(400).json({ 
        message: "Some fields do not exist in table structure", 
        invalidFields 
      });
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
        { 'data.colonia': { $regex: searchTerm, $options: 'i' } },
        { 'data.zona': { $regex: searchTerm, $options: 'i' } },
        { 'data.titulo': { $regex: searchTerm, $options: 'i' } }
      ];
    } else {
      if (zona) {
        filter['data.zona'] = { $regex: zona as string, $options: 'i' };
      }
      if (titulo) {
        filter['data.titulo'] = { $regex: titulo as string, $options: 'i' };
      }
      if (colonia) {
        filter['data.colonia'] = { $regex: colonia as string, $options: 'i' };
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
      filter['data.renta_venta_inversión '] = { $regex: renta_venta_inversion as string, $options: 'i' };
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
      filter['data.disponibilidad'] = { $regex: disponibilidad as string, $options: 'i' };
    }
    if (aceptan_creditos) {
      filter['data.aceptan_creditos '] = { $regex: aceptan_creditos as string, $options: 'i' };
    }
    if (mascotas) {
      filter['data.mascotas'] = { $regex: mascotas as string, $options: 'i' };
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