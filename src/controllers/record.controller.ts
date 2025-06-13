import { Request, Response } from "express";
import { getDbConnection } from "../config/connectionManager";
import getTableModel from "../models/table.model";
import getRecordModel from "../models/record.model";

// Crear un nuevo registro dinámico
export const createDynamicRecord = async (req: Request, res: Response) => {
  const { tableSlug, fields, c_name } = req.body;

  if (!tableSlug || !Array.isArray(fields)) {
    res.status(400).json({ message: "tableSlug and fields are required" });
    return 
  }

  try {

    const conn = await getDbConnection(c_name);
    const Table = getTableModel(conn);
    // Verifica si la tabla existe
    const table = await Table.findOne({ slug: tableSlug });
    if (!table) {
        res.status(404).json({ message: "Table not found" });
        return 
    }

    const Record = getRecordModel(conn);

    // Crea y guarda el registro dinámico
    const newRecord = new Record({ tableSlug, fields });
    await newRecord.save();

    res.status(201).json({ message: "Dynamic record created successfully", record: newRecord });
  } catch (error) {
    res.status(500).json({ message: "Error creating dynamic record", error });
  }
};

// Obtener todos los registros de una tabla
export const getDynamicRecords = async (req: Request, res: Response) => {
  const { tableSlug, c_name } = req.params;

  try {
    const conn = await getDbConnection(c_name);
    const Record = getRecordModel(conn);

    const records = await Record.find({ tableSlug });
    res.json(records);
  } catch (error) {
    res.status(500).json({ message: "Error fetching dynamic records", error });
  }
};

// Buscar un registro dinámico por su ID
export const getDynamicRecordById = async (req: Request, res: Response) => {
  const { id, c_name } = req.params; // ID del registro a buscar

  try {
    const conn = await getDbConnection(c_name);
    const Record = getRecordModel(conn);
    // Busca el registro por su ID
    const record = await Record.findById(id);

    if (!record) {
      res.status(404).json({ message: "Record not found" });
      return;
    }

    res.status(200).json({ message: "Record found successfully", record });
  } catch (error) {
    res.status(500).json({ message: "Error fetching record", error });
  }
};

// Actualizar un registro dinámico sin reemplazar toda la información
export const updateDynamicRecord = async (req: Request, res: Response) => {
  const { id } = req.params; // ID del registro a actualizar
  const { fields, c_name } = req.body; // Nuevos campos para actualizar o agregar

  if (!fields || !Array.isArray(fields)) {
    res.status(400).json({ message: "Fields are required and must be an array" });
    return;
  }

  try {
    const conn = await getDbConnection(c_name);
    const Record = getRecordModel(conn);
    // Busca el registro existente
    const existingRecord = await Record.findById(id);
    if (!existingRecord) {
      res.status(404).json({ message: "Record not found" });
      return;
    }

    // Combina los campos existentes con los nuevos
    const updatedFields = [...existingRecord.fields];

    fields.forEach((newField: any) => {
      const existingFieldIndex = updatedFields.findIndex(
        (field: any) => field.key === newField.key
      );

      if (existingFieldIndex !== -1) {
        // Actualiza el campo existente
        updatedFields[existingFieldIndex] = { ...updatedFields[existingFieldIndex], ...newField };
      } else {
        // Agrega un nuevo campo
        updatedFields.push(newField);
      }
    });

    // Actualiza el registro con los campos combinados
    existingRecord.fields = updatedFields;
    await existingRecord.save();

    res.status(200).json({ message: "Dynamic record updated successfully", record: existingRecord });
  } catch (error) {
    res.status(500).json({ message: "Error updating dynamic record", error });
  }
};

// Eliminar un registro dinámico
export const deleteDynamicRecord = async (req: Request, res: Response) => {
  const { id, c_name } = req.params; // ID del registro a eliminar

  try {
    const conn = await getDbConnection(c_name);
    const Record = getRecordModel(conn);

    // Busca y elimina el registro dinámico
    const deletedRecord = await Record.findByIdAndDelete(id);

    if (!deletedRecord) {
      res.status(404).json({ message: "Record not found" });
      return;
    }

    res.status(200).json({ message: "Dynamic record deleted successfully", record: deletedRecord });
  } catch (error) {
    res.status(500).json({ message: "Error deleting dynamic record", error });
  }
};

// Eliminar ciertos campos de un registro dinámico
export const deleteFieldsFromRecord = async (req: Request, res: Response) => {
  const { id } = req.params; // ID del registro a modificar
  const { keysToDelete, c_name } = req.body; // Lista de claves (keys) de los campos a eliminar

  if (!keysToDelete || !Array.isArray(keysToDelete)) {
    res.status(400).json({ message: "keysToDelete is required and must be an array" });
    return;
  }

  try {
    const conn = await getDbConnection(c_name);
    const Record = getRecordModel(conn);
    // Busca el registro existente
    const existingRecord = await Record.findById(id);
    if (!existingRecord) {
      res.status(404).json({ message: "Record not found" });
      return;
    }

    // Filtra los campos, eliminando los que coincidan con las claves en `keysToDelete`
    const updatedFields = existingRecord.fields.filter((field: any) => {
      // Mantén el campo `name` siempre
      if (field.key === "name") {
        return true;
      }
      // Elimina los campos que coincidan con las claves en `keysToDelete`
      return !keysToDelete.includes(field.key);
    });

    // Verifica que el campo `name` permanezca en el registro
    const hasNameField = updatedFields.some((field: any) => field.key === "name");
    if (!hasNameField) {
      res.status(400).json({ message: "The 'name' field cannot be deleted" });
      return;
    }

    // Actualiza el registro con los campos filtrados
    existingRecord.fields = updatedFields;
    await existingRecord.save();

    res.status(200).json({ message: "Fields deleted successfully", record: existingRecord });
  } catch (error) {
    res.status(500).json({ message: "Error deleting fields from record", error });
  }
};

// Agregar un campo vacío a todos los registros de una tabla
export const addNewFieldToAllRecords = async (req: Request, res: Response) => {
  const { tableSlug, newField, c_name } = req.body;

  if (!tableSlug || !newField || !newField.key) {
    res.status(400).json({ message: "tableSlug and newField with a key are required" });
    return;
  }

  try {
    const conn = await getDbConnection(c_name);
    const Table = getTableModel(conn);
    // Verifica si la tabla existe
    const table = await Table.findOne({ slug: tableSlug });
    if (!table) {
      res.status(404).json({ message: "Table not found" });
      return;
    }
    
    const Record = getRecordModel(conn);

    // Agrega el nuevo campo a todos los registros que no lo tengan y que pertenezcan al mismo tableSlug
    const result = await Record.updateMany(
      { tableSlug, "fields.key": { $ne: newField.key } }, // Filtra registros que no tengan el campo
      {
        $push: {
          fields: {
            key: newField.key,
            label: newField.label || newField.key,
            value: null, // Valor vacío
            type: newField.type || "text", // Tipo predeterminado
            visible: newField.visible !== undefined ? newField.visible : true,
            required: newField.required || false,
          },
        },
      }
    );

    res.status(200).json({
      message: "Field added to all records successfully",
      modifiedCount: result.modifiedCount, // Número de registros actualizados
    });
  } catch (error) {
    res.status(500).json({ message: "Error adding field to all records", error });
  }
};

// Eliminar ciertos campos de todos los registros de una tabla
export const deleteFieldsFromAllRecords = async (req: Request, res: Response) => {
  const { tableSlug, keysToDelete, c_name } = req.body;

  if (!tableSlug || !keysToDelete || !Array.isArray(keysToDelete)) {
    res.status(400).json({ message: "tableSlug and keysToDelete are required and must be an array" });
    return;
  }

  if (keysToDelete.includes("name")) {
    res.status(400).json({ message: "The 'name' field cannot be deleted" });
    return;
  }

  try {
    const conn = await getDbConnection(c_name);
    // Verifica si la tabla existe
    const Table = getTableModel(conn);
    const table = await Table.findOne({ slug: tableSlug });
    if (!table) {
      res.status(404).json({ message: "Table not found" });
      return;
    }
    
    const Record = getRecordModel(conn);
    // Elimina los campos especificados de todos los registros que pertenezcan al mismo tableSlug
    const result = await Record.updateMany(
      { tableSlug }, // Asegura que los registros pertenezcan al mismo tableSlug
      {
        $pull: {
          fields: {
            key: { $in: keysToDelete }, // Elimina los campos cuyo key esté en keysToDelete
          },
        },
      }
    );

    res.status(200).json({
      message: "Fields deleted from all records successfully",
      modifiedCount: result.modifiedCount, // Número de registros actualizados
    });
  } catch (error) {
    res.status(500).json({ message: "Error deleting fields from all records", error });
  }
};