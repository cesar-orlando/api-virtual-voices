import { Request, Response } from "express";
import Record from "../models/record.model";
import Table from "../models/table.model";

// Crear un nuevo registro dinámico
export const createDynamicRecord = async (req: Request, res: Response) => {
  const { tableSlug, fields } = req.body;

  if (!tableSlug || !Array.isArray(fields)) {
    res.status(400).json({ message: "tableSlug and fields are required" });
    return 
  }

  try {
    // Verifica si la tabla existe
    const table = await Table.findOne({ slug: tableSlug });
    if (!table) {
        res.status(404).json({ message: "Table not found" });
        return 
    }

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
  const { tableSlug } = req.params;

  try {
    const records = await Record.find({ tableSlug });
    res.json(records);
  } catch (error) {
    res.status(500).json({ message: "Error fetching dynamic records", error });
  }
};