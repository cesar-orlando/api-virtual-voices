import { Router } from "express";
import {
  getDynamicRecordById,
  createDynamicRecord,
  getDynamicRecords,
  updateDynamicRecord,
  deleteDynamicRecord,
  deleteFieldsFromRecord,
  addNewFieldToAllRecords,
  deleteFieldsFromAllRecords,
} from "../controllers/record.controller";

const router = Router();

// Ruta para crear un nuevo registro dinámico
router.post("/", createDynamicRecord);

// Ruta para buscar un registro por su ID
router.get("/:id", getDynamicRecordById);

// Ruta para obtener todos los registros de una tabla
router.get("/table/:tableSlug", getDynamicRecords);

// Ruta para actualizar un registro dinámico
router.put("/:id", updateDynamicRecord);

// Ruta para eliminar un registro dinámico
router.delete("/:id", deleteDynamicRecord);

// Ruta para eliminar ciertos campos de un registro dinámico
router.patch("/:id/fields", deleteFieldsFromRecord);

// Ruta para agregar un campo vacío a todos los registros
router.post("/add-field", addNewFieldToAllRecords);

// Ruta para eliminar ciertos campos de todos los registros
router.post("/delete-fields", deleteFieldsFromAllRecords);

export default router;