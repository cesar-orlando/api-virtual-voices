import { Router } from "express";
import {
  createTool,
  getTools,
  getToolById,
  updateTool,
  deleteTool,
  toggleToolStatus,
  getCategories,
  createCategory,
  testTool,
  validateSchema,
  validateEndpoint,
  executeTool,
  batchExecuteTools,
  getOpenAISchema,
  getAnalytics,
  getToolLogs
} from "../controllers/tool.controller";

const router = Router();

// CRUD básico de herramientas
router.post("/", createTool);                           // POST /api/tools
router.get("/:c_name", getTools);                       // GET /api/tools/:c_name
router.get("/:c_name/:id", getToolById);                // GET /api/tools/:c_name/:id
router.put("/:c_name/:id", updateTool);                 // PUT /api/tools/:c_name/:id
router.delete("/:c_name/:id", deleteTool);              // DELETE /api/tools/:c_name/:id

// Control de estado
router.patch("/:c_name/:id/status", toggleToolStatus);  // PATCH /api/tools/:c_name/:id/status

// Gestión de categorías
router.get("/:c_name/categories/list", getCategories);  // GET /api/tools/:c_name/categories/list
router.post("/categories", createCategory);             // POST /api/tools/categories

// Testing y validación
router.post("/:c_name/:id/test", testTool);             // POST /api/tools/:c_name/:id/test
router.post("/validate-schema", validateSchema);        // POST /api/tools/validate-schema
router.post("/validate-endpoint", validateEndpoint);    // POST /api/tools/validate-endpoint

// Ejecución de herramientas
router.post("/execute", executeTool);                   // POST /api/tools/execute
router.post("/batch-execute", batchExecuteTools);       // POST /api/tools/batch-execute

// Integración con OpenAI
router.get("/openai-schema/:c_name", getOpenAISchema);  // GET /api/tools/openai-schema/:c_name

// Analytics y logging
router.get("/analytics/:c_name", getAnalytics);         // GET /api/tools/analytics/:c_name
router.get("/logs/:c_name/:toolId", getToolLogs);       // GET /api/tools/logs/:c_name/:toolId

export default router;