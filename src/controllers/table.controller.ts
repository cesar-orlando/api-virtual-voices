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

// Actualizar una tabla manteniendo los valores existentes
export const updateTable = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params; // ID de la tabla a actualizar
  const { name, slug, icon } = req.body; // Nuevos datos para actualizar

  try {
    // Busca y actualiza la tabla
    const updatedTable = await Table.findByIdAndUpdate(
      id,
      { $set: { ...(name && { name }), ...(slug && { slug }), ...(icon && { icon }) } },
      { new: true, runValidators: true } // Retorna la tabla actualizada y aplica validaciones
    );

    if (!updatedTable) {
      res.status(404).json({ message: "Table not found" });
      return;
    }

    res.status(200).json({ message: "Table updated successfully", table: updatedTable });
  } catch (error) {
    res.status(500).json({ message: "Error updating table", error });
  }
};

// Eliminar una tabla
export const deleteTable = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params; // ID de la tabla a eliminar

  try {
    // Busca y elimina la tabla
    const deletedTable = await Table.findByIdAndDelete(id);

    if (!deletedTable) {
      res.status(404).json({ message: "Table not found" });
      return;
    }

    res.status(200).json({ message: "Table deleted successfully", table: deletedTable });
  } catch (error) {
    res.status(500).json({ message: "Error deleting table", error });
  }
};