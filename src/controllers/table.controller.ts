import { Request, Response } from "express";
import Table from "../models/table.model";

// Crear una nueva tabla
export const createTable = async (req: Request, res: Response): Promise<void> => {
  const { name, slug, icon } = req.body;

  if (!name || !slug) {
    res.status(400).json({ message: "Name and slug are required" });
    return 
  }

  try {
    // Verifica si ya existe una tabla con el mismo slug
    const existingTable = await Table.findOne({ slug });
    if (existingTable) {
        res.status(400).json({ message: "A table with this slug already exists" });
        return 
    }

    // Crea y guarda la tabla
    const newTable = new Table({ name, slug, icon });
    await newTable.save();

    res.status(201).json({ message: "Table created successfully", table: newTable });
  } catch (error) {
    res.status(500).json({ message: "Error creating table", error });
  }
};

// Obtener todas las tablas
export const getTables = async (req: Request, res: Response) => {
  try {
    const tables = await Table.find();
    res.json(tables);
  } catch (error) {
    res.status(500).json({ message: "Error fetching tables", error });
  }
};