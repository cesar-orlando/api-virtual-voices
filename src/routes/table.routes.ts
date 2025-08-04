import { Router } from "express";
import {
  createTable,
  getTables,
  getTable,
  getTableBySlug,
  getTableStructure,
  updateTableStructure,
  duplicateTable,
  exportTable,
  importTable,
  bulkCreateFromExcel,
  deleteTable,
  updateTable,
  getTableFields,
  getTableFieldsBySlug,
} from "../controllers/table.controller";
import { validateBulkTableCreation } from "../middlewares/table.middleware";

const router = Router();

// Rutas específicas (de más específica a más general)
router.get("/:c_name/:slug/structure", getTableStructure);
router.get("/:c_name/:slug/export", exportTable);
router.get("/:c_name/:slug", getTableBySlug);
router.patch("/:c_name/:id/structure", updateTableStructure);
router.post("/:c_name/:id/duplicate", duplicateTable);
router.post("/:c_name/import", importTable);
router.post("/:c_name/bulk-create-from-excel", validateBulkTableCreation, bulkCreateFromExcel);

// Rutas generales
router.post("/", createTable);
router.get("/:c_name", getTables);
router.put("/:id", updateTable);
router.delete("/:c_name/:id", deleteTable);

// Rutas de campos (mantener compatibilidad)
router.get("/:c_name/:id/fields", getTableFields);
router.get("/:c_name/slug/:slug/fields", getTableFieldsBySlug);

export default router;