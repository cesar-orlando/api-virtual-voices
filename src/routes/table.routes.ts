import { Router } from "express";
import { createTable, getTables } from "../controllers/table.controller";

const router = Router();

// Ruta para crear una nueva tabla
router.post("/", createTable);

// Ruta para obtener todas las tablas
router.get("/", getTables);

export default router;