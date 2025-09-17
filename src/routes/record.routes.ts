import { Router } from "express";
import {
  getDynamicRecordById,
  getRecordWithTable,
  getRecordWithStructure,
  createDynamicRecord,
  getDynamicRecords,
  updateDynamicRecord,
  deleteDynamicRecord,
  searchRecords,
  getRecordStats,
  validateRecord,
  bulkUpdateRecords,
  bulkDeleteRecords,
  importRecords,
  exportRecords,
  addNewFieldToAllRecords,
  deleteFieldsFromAllRecords,
  deleteFieldsFromRecord,
  getRecordByPhone,
  updateProspectsAI,
  createPaymentRecord
} from "../controllers/record.controller";

const router = Router();

// Validación
router.post("/validate", validateRecord);

// Operaciones masivas
router.post("/:c_name/:tableSlug/bulk", bulkUpdateRecords);
router.delete("/:c_name/:tableSlug/bulk", bulkDeleteRecords);
router.post("/:c_name/:tableSlug/import", importRecords);
router.get("/:c_name/:tableSlug/export", exportRecords);
router.put("/:c_name/ai/bulk", updateProspectsAI);

// Búsqueda
router.post("/:c_name/:tableSlug/search", searchRecords);
router.get('/records-with-chats/:c_name', getRecordByPhone);

// Campos
router.post("/add-field", addNewFieldToAllRecords);
router.post("/delete-fields", deleteFieldsFromAllRecords);

// Registros individuales
router.get("/:c_name/:id/with-structure", getRecordWithStructure);
router.get("/:c_name/:id/with-table", getRecordWithTable);
router.get("/table/:c_name/:tableSlug", getDynamicRecords);
router.post("/payments/:c_name", createPaymentRecord);
// router.get("/bot/table/:c_name/:tableSlug", getDynamicRecordsBot); <--- aqui hay error
router.get("/:c_name/:id", getDynamicRecordById);
router.post("/", createDynamicRecord);
router.put("/:id", updateDynamicRecord);
router.patch("/:id/fields", deleteFieldsFromRecord);
router.delete("/:c_name/:id", deleteDynamicRecord);

// Estadísticas
router.get("/stats/:c_name/:tableSlug", getRecordStats);

export default router;