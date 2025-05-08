import { Router } from "express";
import { createDynamicRecord, getDynamicRecords } from "../controllers/record.controller";

const router = Router();

// Ruta para crear un nuevo registro dinámico
router.post("/:tableSlug", createDynamicRecord);

// Ruta para obtener todos los registros de una tabla dinámica
router.get("/:tableSlug", getDynamicRecords);

export default router;