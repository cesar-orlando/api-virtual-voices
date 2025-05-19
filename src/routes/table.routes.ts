import { Router } from "express";
import {
  createTable,
  getTables,
  deleteTable,
  updateTable,
} from "../controllers/table.controller";

const router = Router();

// Ruta para crear una nueva tabla
router.post("/", createTable);

// Ruta para obtener todas las tablas
router.get("/", getTables);

// Ruta para eliminar una tabla
router.delete("/:id", deleteTable);

// Ruta para actualizar una tabla
router.put("/:id", updateTable);

export default router;