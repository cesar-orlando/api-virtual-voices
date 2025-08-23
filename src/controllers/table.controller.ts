import { Request, Response } from "express";
import getTableModel, { ITable } from "../models/table.model";
import getRecordModel from "../models/record.model";
import { getConnectionByCompanySlug } from "../config/connectionManager";
import { TableField } from "../types";
import getUserModel from "../core/users/user.model";
import { attachHistoryToData } from "../plugins/auditTrail";

// Tipos de campo permitidos
const ALLOWED_FIELD_TYPES = ['text', 'email', 'number', 'date', 'boolean', 'select', 'file', 'currency', 'object'];

// Función para validar la estructura de un campo
const validateField = (field: any, index: number): { isValid: boolean; error?: string } => {
  // Normalizar campo: si tiene 'key' pero no 'name', usar 'key' como 'name'
  if (!field.name && field.key) {
    field.name = field.key;
    console.log(`[DEBUG] Normalized field ${index}: using 'key' as 'name' (${field.key})`);
  }
  
  if (!field.name || typeof field.name !== 'string') {
    return { isValid: false, error: `Field ${index}: name is required and must be a string` };
  }
  
  if (!field.label || typeof field.label !== 'string') {
    return { isValid: false, error: `Field ${index}: label is required and must be a string` };
  }
  
  if (!field.type || !ALLOWED_FIELD_TYPES.includes(field.type)) {
    return { isValid: false, error: `Field ${index}: type must be one of ${ALLOWED_FIELD_TYPES.join(', ')}` };
  }
  
  if (field.type === 'select' && (!field.options || !Array.isArray(field.options) || field.options.length === 0)) {
    return { isValid: false, error: `Field ${index}: select fields must have options array` };
  }
  
  if (field.order !== undefined && (typeof field.order !== 'number' || field.order < 0)) {
    return { isValid: false, error: `Field ${index}: order must be a positive number` };
  }
  
  return { isValid: true };
};

// Función para asignar orden automático a campos
const assignFieldOrders = (fields: any[]): any[] => {
  return fields.map((field, index) => {
    // Normalizar campo: si tiene 'key' pero no 'name', usar 'key' como 'name'
    if (!field.name && field.key) {
      field.name = field.key;
    }
    
    // Limpiar propiedades redundantes
    const cleanField = {
  ...(field._id ? { _id: field._id } : {}), // Preservar _id de subdocumento si viene del cliente/UI
      name: field.name,
      label: field.label,
      type: field.type,
      required: field.required || false,
      order: field.order !== undefined ? field.order : index + 1,
      ...(field.options && { options: field.options })
    };
    
    return cleanField;
  });
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

// Función para validar órdenes únicos de campos
const validateUniqueFieldOrders = (fields: any[]): { isValid: boolean; error?: string } => {
  const fieldOrders = fields.map(field => field.order);
  const uniqueOrders = new Set(fieldOrders);
  
  if (fieldOrders.length !== uniqueOrders.size) {
    return { isValid: false, error: 'Field orders must be unique within the table' };
  }
  
  return { isValid: true };
};

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

// Crear una nueva tabla
export const createTable = async (req: Request, res: Response): Promise<void> => {
  const { name, slug, icon, c_name, createdBy, fields, isActive = true } = req.body;

  console.log(`[DEBUG] createTable called with:`, {
    name,
    slug,
    c_name,
    createdBy,
    fieldsCount: fields?.length,
    fields: fields?.slice(0, 2) // Log first 2 fields for debugging
  });

  // Validaciones básicas
  if (!name || !slug || !c_name || !createdBy || !fields) {
    console.log(`[ERROR] Missing required fields:`, {
      hasName: !!name,
      hasSlug: !!slug,
      hasCName: !!c_name,
      hasCreatedBy: !!createdBy,
      hasFields: !!fields
    });
    res.status(400).json({ 
      message: "Name, slug, c_name, createdBy and fields are required" 
    });
    return;
  }

  // Validar que fields sea un array y tenga al menos un elemento
  if (!Array.isArray(fields) || fields.length === 0) {
    console.log(`[ERROR] Invalid fields array:`, { isArray: Array.isArray(fields), length: fields?.length });
    res.status(400).json({ 
      message: "Fields must be a non-empty array" 
    });
    return;
  }

  // Validar estructura de cada campo
  for (let i = 0; i < fields.length; i++) {
    console.log(`[DEBUG] Validating field ${i + 1}:`, fields[i]);
    const validation = validateField(fields[i], i + 1);
    if (!validation.isValid) {
      console.log(`[ERROR] Field validation failed for field ${i + 1}:`, validation.error);
      res.status(400).json({ message: validation.error });
      return;
    }
  }

  // Asignar orden automático si no se especifica
  const fieldsWithOrders = assignFieldOrders(fields);
  console.log(`[DEBUG] Fields after normalization:`, fieldsWithOrders);

  // Validar nombres únicos
  const nameValidation = validateUniqueFieldNames(fieldsWithOrders);
  if (!nameValidation.isValid) {
    console.log(`[ERROR] Field name validation failed:`, nameValidation.error);
    res.status(400).json({ message: nameValidation.error });
    return;
  }

  // Validar órdenes únicos
  const orderValidation = validateUniqueFieldOrders(fieldsWithOrders);
  if (!orderValidation.isValid) {
    console.log(`[ERROR] Field order validation failed:`, orderValidation.error);
    res.status(400).json({ message: orderValidation.error });
    return;
  }

  const conn = await getConnectionByCompanySlug(c_name);
  const Table = getTableModel(conn);

  try {
    // Verifica si ya existe una tabla con el mismo slug en la misma empresa
    const existingTable = await Table.findOne({ slug, c_name });
    if (existingTable) {
        console.log(`[ERROR] Table with slug ${slug} already exists for company ${c_name}`);
        res.status(400).json({ 
          message: "A table with this slug already exists in this company" 
        });
        return;
    }

    // Crea y guarda la tabla
    const newTable = new Table({ 
      name, 
      slug, 
      icon, 
      c_name, 
      createdBy, 
      isActive, 
      fields: fieldsWithOrders
    });
    await newTable.save();

    console.log(`[SUCCESS] Table created successfully:`, {
      id: newTable._id,
      name: newTable.name,
      slug: newTable.slug,
      fieldsCount: newTable.fields.length
    });

    res.status(201).json({ 
      message: "Table created successfully", 
      table: newTable 
    });
  } catch (error) {
    console.log(`[ERROR] Database error while creating table:`, error);
    res.status(500).json({ message: "Error creating table", error });
  }
};

// Obtener todas las tablas de una empresa con conteo de registros
export const getTables = async (req: Request, res: Response) => {
  try {
    const { c_name } = req.params;
    const includeHistory = String((req.query.includeHistory as any) || '').toLowerCase() === 'true';
    const historyLimit = Number(req.query.historyLimit || 5);
    const conn = await getConnectionByCompanySlug(c_name);
    const Table = getTableModel(conn);
    const Record = getRecordModel(conn);
    
    // Obtener tablas ordenadas por fecha de creación
    const tables = await Table.find({ c_name})
      .sort({ createdAt: -1 })
      .lean();

    // Para cada tabla, contar registros eficientemente
    let tablesWithCount = await Promise.all(
      tables.map(async (table) => {
        const recordsCount = await Record.countDocuments({ 
          tableSlug: table.slug, 
          c_name: table.c_name 
        });
        
        // Agregar el conteo al objeto de la tabla
        return {
          ...table,
          recordsCount
        };
      })
    );

    if (includeHistory) {
      tablesWithCount = await attachHistoryToData(conn, tablesWithCount, 'Table', Number.isFinite(historyLimit) ? historyLimit : 5);
    }

    res.json({
      tables: tablesWithCount,
      total: tablesWithCount.length
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching tables", error });
  }
};

// Obtener una tabla específica por ID
export const getTable = async (req: Request, res: Response) => {
  try {
    const { id, c_name } = req.params;
    const conn = await getConnectionByCompanySlug(c_name);
    const Table = getTableModel(conn);
    const table = await Table.findOne({ _id: id, c_name });
    
    if (!table) {
      res.status(404).json({ message: "Table not found" });
      return;
    }
    
    res.json(table);
  } catch (error) {
    res.status(500).json({ message: "Error fetching table", error });
  }
};

// Obtener una tabla específica por slug
export const getTableBySlug = async (req: Request, res: Response) => {
  try {
    const { slug, c_name } = req.params;
    const conn = await getConnectionByCompanySlug(c_name);
    const Table = getTableModel(conn);
    const table = await Table.findOne({ slug, c_name, isActive: true });
    
    if (!table) {
      res.status(404).json({ message: "Table not found" });
      return;
    }
    
    res.json(table);
  } catch (error) {
    res.status(500).json({ message: "Error fetching table", error });
  }
};

// Actualizar una tabla manteniendo la integridad de datos
export const updateTable = async (req: Request, res: Response): Promise<void> => {
  const { id, userId } = req.params;
  const { name, slug, icon, c_name, isActive, fields } = req.body;

  if (!c_name) {
    res.status(400).json({ message: "c_name is required" });
    return;
  }

  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const Table = getTableModel(conn);
    
    // Obtener la tabla actual para validaciones
    const currentTable = await Table.findById(id);
    if (!currentTable) {
      res.status(404).json({ message: "Table not found" });
      return;
    }

    // Si se está actualizando el slug, verificar que sea único en la empresa
    if (slug && slug !== currentTable.slug) {
      const existingTable = await Table.findOne({ 
        slug, 
        c_name, 
        _id: { $ne: id } 
      });
      if (existingTable) {
        res.status(400).json({ 
          message: "A table with this slug already exists in this company" 
        });
        return;
      }
    }

    // Si se están actualizando los campos, validar la nueva estructura
    if (fields) {
      if (!Array.isArray(fields) || fields.length === 0) {
        res.status(400).json({ 
          message: "Fields must be a non-empty array" 
        });
        return;
      }

      // Validar estructura de cada campo
      for (let i = 0; i < fields.length; i++) {
        const validation = validateField(fields[i], i + 1);
        if (!validation.isValid) {
          res.status(400).json({ message: validation.error });
          return;
        }
      }

      // Asignar orden automático si no se especifica
      const fieldsWithOrders = assignFieldOrders(fields);

      // Validar nombres únicos
      const nameValidation = validateUniqueFieldNames(fieldsWithOrders);
      if (!nameValidation.isValid) {
        res.status(400).json({ message: nameValidation.error });
        return;
      }

      // Validar órdenes únicos
      const orderValidation = validateUniqueFieldOrders(fieldsWithOrders);
      if (!orderValidation.isValid) {
        res.status(400).json({ message: orderValidation.error });
        return;
      }

      // --- ACTUALIZAR RECORDS SOLO CUANDO HAY RENOMBRES EXPLÍCITOS ---
      // Importante: NO usar el "order" para emparejar campos. Si se elimina un campo,
      // los órdenes se desplazan y eso provoca reasignaciones incorrectas de valores.
      const oldFields = (currentTable.fields || []) as any[];
      const newFields = fieldsWithOrders as any[];

      // Mapas auxiliares para emparejar de forma segura
      const oldById = new Map<string, any>();
      const oldByName = new Map<string, any>();
      for (const ofld of oldFields) {
        if (ofld && ofld._id) oldById.set(String(ofld._id), ofld);
        if (ofld && ofld.name) oldByName.set(ofld.name, ofld);
      }

      type Rename = { oldKey: string; newKey: string };
      const renames: Rename[] = [];

      // Detectar renombres de forma explícita y segura:
      // 1) Si el nuevo campo conserva el mismo _id de subdocumento y cambió el name
      // 2) Si el nuevo campo trae una pista explícita: previousName | renamedFrom | oldName
      for (const nf of newFields) {
        const hint = nf?.previousName || nf?.renamedFrom || nf?.oldName; // opcionales del cliente/UI
        if (nf?._id && oldById.has(String(nf._id))) {
          const old = oldById.get(String(nf._id));
          if (old?.name && nf?.name && old.name !== nf.name) {
            renames.push({ oldKey: old.name, newKey: nf.name });
          }
        } else if (hint && nf?.name && hint !== nf.name) {
          // Solo si el hint existía en los campos viejos (evita colisiones/ambigüedades)
          if (oldByName.has(hint)) {
            renames.push({ oldKey: hint, newKey: nf.name });
          }
        }
      }
      // Detectar campos eliminados (por nombre), excluyendo los que se renombraron
      const newNamesSet = new Set(
        (newFields || []).map((f: any) => f?.name).filter(Boolean)
      );
      const renamedOldKeys = new Set(renames.map(r => r.oldKey));
      const removedFieldNames: string[] = (oldFields || [])
        .map((f: any) => f?.name)
        .filter((n: any): n is string => Boolean(n))
        .filter((n: string) => !newNamesSet.has(n) && !renamedOldKeys.has(n));

      if (renames.length > 0 || removedFieldNames.length > 0) {
        const Record = getRecordModel(conn);
        const baseFilter = { tableSlug: currentTable.slug, c_name } as any;

        // 1) Procesar renombres de forma masiva y segura en dos pasos por cada par
        for (const { oldKey, newKey } of renames) {
          const oldPath = `data.${oldKey}`;
          const newPath = `data.${newKey}`;

          // 1.a) Renombrar cuando el destino NO existe
          const filterRename = {
            ...baseFilter,
            [oldPath]: { $exists: true },
            [newPath]: { $exists: false }
          } as any;
          const renameUpdate = { $rename: { [oldPath]: newPath } } as any;
          const r1 = await Record.updateMany(filterRename, renameUpdate);
          if (r1.modifiedCount) {
            console.log(`[DEBUG] Renombrados ${r1.modifiedCount} registros para ${c_name}: ${oldKey} -> ${newKey}`);
          }

          // 1.b) Si el destino YA existe, eliminar el origen para evitar duplicados/colisiones
          const filterUnsetDup = {
            ...baseFilter,
            [oldPath]: { $exists: true },
            [newPath]: { $exists: true }
          } as any;
          const unsetDupUpdate = { $unset: { [oldPath]: "" } } as any;
          const r2 = await Record.updateMany(filterUnsetDup, unsetDupUpdate);
          if (r2.modifiedCount) {
            console.warn(`[WARN] Eliminado campo duplicado ${oldKey} para ${c_name} en ${r2.modifiedCount} registros porque ${newKey} ya existía`);
          }
        }
      }
      // --- FIN ACTUALIZACIÓN DE RECORDS ---

      // TODO: Validar que no se eliminen campos con datos existentes
      // Esto requeriría consultar la colección de datos de la tabla

      const User = getUserModel(conn);
      const user = await User.findById(userId);

      // Actualizar con los nuevos campos
      const auditContext = {
        _updatedByUser: { id: userId, name: user.name },
        _updatedBy: userId,
        _auditSource: 'API',
        _requestId: (req.headers['x-request-id'] as string) || undefined,
        ip: (req as any).ip,
        userAgent: req.headers['user-agent'],
      };

      const updatedTable = await Table.findOneAndUpdate(
        { _id: id },
        { 
          $set: { 
            ...(name && { name }), 
            ...(slug && { slug }), 
            ...(icon && { icon }), 
            ...(typeof isActive === 'boolean' && { isActive }),
            fields: fieldsWithOrders
          } 
        },
        { new: true, runValidators: true }
      ).setOptions({ auditContext, $locals: { auditContext } } as any);

      res.status(200).json({ 
        message: "Table updated successfully", 
        table: updatedTable 
      });
    } else {
      // Actualizar solo campos básicos sin modificar fields
      const updatedTable = await Table.findByIdAndUpdate(
        id,
        { 
          $set: { 
            ...(name && { name }), 
            ...(slug && { slug }), 
            ...(icon && { icon }), 
            ...(typeof isActive === 'boolean' && { isActive })
          } 
        },
        { new: true, runValidators: true }
      );

      res.status(200).json({ 
        message: "Table updated successfully", 
        table: updatedTable 
      });
    }
  } catch (error) {
    res.status(500).json({ message: "Error updating table", error });
  }
};

// Eliminar una tabla (soft delete cambiando isActive a false)
export const deleteTable = async (req: Request, res: Response): Promise<void> => {
  const { id, c_name } = req.params;
  const { deletedBy } = req.body; // usuario que elimina la tabla

  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const Table = getTableModel(conn);
    const Record = getRecordModel(conn);

    // Buscar la tabla para obtener el slug
    const table = await Table.findById(id) as ITable;
    if (!table) {
      res.status(404).json({ message: "Table not found" });
      return;
    }

    if (table.name === "prospectos") {
      res.status(400).json({ message: "Cannot delete 'prospectos' table" });
      return;
    }

    // Soft delete: cambiar isActive a false y guardar info de eliminación
    table.isActive = false;
    table.deletedAt = new Date();
    table.deletedBy = deletedBy || "unknown";
    await table.save();

    // Eliminar todos los registros asociados a la tabla
    const deleteResult = await Record.deleteMany({ tableSlug: table.slug, c_name });

    res.status(200).json({ 
      message: "Table and associated records deleted successfully", 
      table: table as ITable,
      deletedBy: table.deletedBy,
      deletedAt: table.deletedAt,
      recordsDeleted: deleteResult.deletedCount
    });
  } catch (error) {
    res.status(500).json({ message: "Error deleting table and records", error });
  }
};

// Obtener campos de una tabla específica
export const getTableFields = async (req: Request, res: Response) => {
  try {
    const { id, c_name } = req.params;
    const conn = await getConnectionByCompanySlug(c_name);
    const Table = getTableModel(conn);
    const table = await Table.findOne({ _id: id, c_name, isActive: true });
    
    if (!table) {
      res.status(404).json({ message: "Table not found" });
      return;
    }
    
    res.json({ 
      fields: table.fields,
      tableName: table.name,
      tableSlug: table.slug
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching table fields", error });
  }
};

// Obtener campos de una tabla por slug
export const getTableFieldsBySlug = async (req: Request, res: Response) => {
  try {
    const { slug, c_name } = req.params;
    const conn = await getConnectionByCompanySlug(c_name);
    const Table = getTableModel(conn);
    const table = await Table.findOne({ slug, c_name, isActive: true });
    
    if (!table) {
      res.status(404).json({ message: "Table not found" });
      return;
    }
    
    res.json({ 
      fields: table.fields,
      tableName: table.name,
      tableSlug: table.slug
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching table fields", error });
  }
};

// Obtener estructura de tabla
export const getTableStructure = async (req: Request, res: Response) => {
  try {
    const { slug, c_name } = req.params;
    const conn = await getConnectionByCompanySlug(c_name);
    const Table = getTableModel(conn);
    
    const table = await Table.findOne({ slug, c_name, isActive: true });
    
    if (!table) {
      res.status(404).json({ message: "Table not found or inactive" });
      return;
    }
    
    res.json({
      message: "Table structure retrieved successfully",
      structure: {
        name: table.name,
        slug: table.slug,
        icon: table.icon,
        fields: table.fields,
        isActive: table.isActive,
        createdAt: (table as any).createdAt,
        updatedAt: (table as any).updatedAt
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching table structure", error });
  }
};

// Actualizar estructura de tabla
export const updateTableStructure = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { fields, c_name, updatedBy } = req.body;

  if (!fields || !c_name || !updatedBy) {
    res.status(400).json({ 
      message: "fields, c_name and updatedBy are required" 
    });
    return;
  }

  if (!Array.isArray(fields) || fields.length === 0) {
    res.status(400).json({ 
      message: "Fields must be a non-empty array" 
    });
    return;
  }

  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const Table = getTableModel(conn);

    // Obtener la tabla actual
    const currentTable = await Table.findById(id);
    if (!currentTable) {
      res.status(404).json({ message: "Table not found" });
      return;
    }

    // Validar estructura de cada campo
    for (let i = 0; i < fields.length; i++) {
      const validation = validateField(fields[i], i + 1);
      if (!validation.isValid) {
        res.status(400).json({ message: validation.error });
        return;
      }
    }

    // Asignar orden automático si no se especifica
    const fieldsWithOrders = assignFieldOrders(fields);

    // Validar nombres únicos
    const nameValidation = validateUniqueFieldNames(fieldsWithOrders);
    if (!nameValidation.isValid) {
      res.status(400).json({ message: nameValidation.error });
      return;
    }

    // Validar órdenes únicos
    const orderValidation = validateUniqueFieldOrders(fieldsWithOrders);
    if (!orderValidation.isValid) {
      res.status(400).json({ message: orderValidation.error });
      return;
    }

    // TODO: Validar que no se eliminen campos con datos existentes
    // Esto requeriría consultar la colección de registros

    // Actualizar solo los campos
    currentTable.fields = fieldsWithOrders;
    await currentTable.save();

    res.status(200).json({ 
      message: "Table structure updated successfully", 
      table: currentTable 
    });
  } catch (error) {
    res.status(500).json({ message: "Error updating table structure", error });
  }
};

// Duplicar tabla
export const duplicateTable = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { newName, newSlug, c_name, createdBy } = req.body;

  if (!newName || !newSlug || !c_name || !createdBy) {
    res.status(400).json({ 
      message: "newName, newSlug, c_name and createdBy are required" 
    });
    return;
  }

  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const Table = getTableModel(conn);

    // Obtener la tabla original
    const originalTable = await Table.findById(id);
    if (!originalTable) {
      res.status(404).json({ message: "Original table not found" });
      return;
    }

    // Verificar que el nuevo slug sea único
    const existingTable = await Table.findOne({ slug: newSlug, c_name });
    if (existingTable) {
      res.status(400).json({ 
        message: "A table with this slug already exists in this company" 
      });
      return;
    }

    // Crear nueva tabla con los mismos campos
    const duplicatedTable = new Table({
      name: newName,
      slug: newSlug,
      icon: originalTable.icon,
      c_name,
      createdBy,
      isActive: true,
      fields: originalTable.fields.map(field => ({
        ...field,
        _id: undefined // Remover _id para crear nuevos campos
      }))
    });

    await duplicatedTable.save();

    res.status(201).json({ 
      message: "Table duplicated successfully", 
      originalTable: {
        id: originalTable._id,
        name: originalTable.name,
        slug: originalTable.slug
      },
      newTable: duplicatedTable
    });
  } catch (error) {
    res.status(500).json({ message: "Error duplicating table", error });
  }
};

// Exportar tabla
export const exportTable = async (req: Request, res: Response) => {
  try {
    const { slug, c_name } = req.params;
    const { format = 'json' } = req.query;
    
    const conn = await getConnectionByCompanySlug(c_name);
    const Table = getTableModel(conn);
    
    const table = await Table.findOne({ slug, c_name, isActive: true });
    
    if (!table) {
      res.status(404).json({ message: "Table not found or inactive" });
      return;
    }

    const exportData = {
      table: {
        name: table.name,
        slug: table.slug,
        icon: table.icon,
        fields: table.fields,
        isActive: table.isActive,
        createdAt: (table as any).createdAt,
        updatedAt: (table as any).updatedAt
      },
      exportInfo: {
        exportedAt: new Date(),
        format: format,
        version: "1.0"
      }
    };

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${table.slug}-${Date.now()}.json"`);
      res.json(exportData);
    } else {
      res.status(400).json({ message: "Unsupported export format" });
    }
  } catch (error) {
    res.status(500).json({ message: "Error exporting table", error });
  }
};

// Importar tabla
export const importTable = async (req: Request, res: Response) => {
  const { c_name, createdBy } = req.body;
  const { tableData } = req.body;

  if (!c_name || !createdBy || !tableData) {
    res.status(400).json({ 
      message: "c_name, createdBy and tableData are required" 
    });
    return;
  }

  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const Table = getTableModel(conn);

    // Validar estructura de datos importados
    if (!tableData.name || !tableData.slug || !tableData.fields) {
      res.status(400).json({ 
        message: "Invalid table data structure" 
      });
      return;
    }

    // Verificar que el slug sea único
    const existingTable = await Table.findOne({ slug: tableData.slug, c_name });
    if (existingTable) {
      res.status(400).json({ 
        message: "A table with this slug already exists in this company" 
      });
      return;
    }

    // Validar campos
    if (!Array.isArray(tableData.fields) || tableData.fields.length === 0) {
      res.status(400).json({ 
        message: "Fields must be a non-empty array" 
      });
      return;
    }

    // Validar estructura de cada campo
    for (let i = 0; i < tableData.fields.length; i++) {
      const validation = validateField(tableData.fields[i], i + 1);
      if (!validation.isValid) {
        res.status(400).json({ message: validation.error });
        return;
      }
    }

    // Asignar orden automático
    const fieldsWithOrders = assignFieldOrders(tableData.fields);

    // Validar nombres únicos
    const nameValidation = validateUniqueFieldNames(fieldsWithOrders);
    if (!nameValidation.isValid) {
      res.status(400).json({ message: nameValidation.error });
      return;
    }

    // Validar órdenes únicos
    const orderValidation = validateUniqueFieldOrders(fieldsWithOrders);
    if (!orderValidation.isValid) {
      res.status(400).json({ message: orderValidation.error });
      return;
    }

    // Crear tabla importada
    const importedTable = new Table({
      name: tableData.name,
      slug: tableData.slug,
      icon: tableData.icon || "",
      c_name,
      createdBy,
      isActive: tableData.isActive !== undefined ? tableData.isActive : true,
      fields: fieldsWithOrders
    });

    await importedTable.save();

    res.status(201).json({ 
      message: "Table imported successfully", 
      table: importedTable,
      importInfo: {
        importedAt: new Date(),
        originalData: tableData
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Error importing table", error });
  }
};

// Bulk create tables from Excel with multiple sheets
export const bulkCreateFromExcel = async (req: Request, res: Response): Promise<void> => {
  try {
    const { companySlug } = req.params;
    const { tables } = req.body;

    // El middleware ya validó la estructura básica, aquí solo procesamos
    const conn = await getConnectionByCompanySlug(companySlug);
    const Table = getTableModel(conn);
    const Record = getRecordModel(conn);

    // Resultados de la operación
    const results: any[] = [];
    const errors: any[] = [];
    let totalRecords = 0;

    // Procesar cada tabla
    for (let i = 0; i < tables.length; i++) {
      const tableData = tables[i];
      
      try {
        // Asignar órdenes a los campos
        const fieldsWithOrders = assignFieldOrders(tableData.fields);

        // Crear la tabla
        const newTable = new Table({
          name: tableData.name,
          slug: tableData.slug,
          icon: tableData.icon || "📊",
          description: tableData.description || `Datos de ${tableData.name} desde Excel`,
          c_name: companySlug,
          createdBy: tableData.createdBy || "excel-import",
          isActive: true,
          fields: fieldsWithOrders
        });

        const savedTable = await newTable.save();

        // Crear registros si se proporcionan
        let recordsCreated = 0;
        if (tableData.records && Array.isArray(tableData.records) && tableData.records.length > 0) {
          const recordsToCreate = tableData.records.map((record: any) => ({
            tableSlug: tableData.slug,
            c_name: companySlug,
            createdBy: tableData.createdBy || "excel-import",
            data: record.data || record
          }));

          const createdRecords = await Record.insertMany(recordsToCreate);
          recordsCreated = createdRecords.length;
          totalRecords += recordsCreated;
        }

        // Agregar resultado exitoso
        results.push({
          table: {
            _id: savedTable._id,
            name: savedTable.name,
            slug: savedTable.slug,
            icon: savedTable.icon,
            fieldsCount: savedTable.fields.length
          },
          recordsCreated
        });

      } catch (error: any) {
        errors.push({
          tableIndex: i,
          tableName: tableData.name || `Tabla ${i + 1}`,
          error: error.message || "Error desconocido al crear la tabla"
        });
      }
    }

    // Preparar respuesta
    const successful = results.length;
    const failed = errors.length;
    const totalTables = tables.length;

    // Si hay errores pero también éxitos, es éxito parcial
    if (successful > 0 && failed > 0) {
      res.status(207).json({
        success: true,
        message: `Se crearon ${successful} de ${totalTables} tablas exitosamente`,
        results,
        errors,
        summary: {
          totalTables,
          totalRecords,
          successful,
          failed,
          partialSuccess: true
        }
      });
    }
    // Solo éxitos
    else if (successful > 0 && failed === 0) {
      res.status(201).json({
        success: true,
        message: `Se crearon ${successful} tablas exitosamente`,
        results,
        summary: {
          totalTables,
          totalRecords,
          successful,
          failed
        }
      });
    }
    // Solo errores
    else {
      res.status(400).json({
        success: false,
        message: `No se pudo crear ninguna tabla. ${failed} errores encontrados`,
        errors,
        summary: {
          totalTables,
          totalRecords: 0,
          successful: 0,
          failed
        }
      });
    }

  } catch (error: any) {
    console.error('❌ Error in bulkCreateFromExcel:', error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor al crear tablas en lote",
      error: error.message
    });
  }
};