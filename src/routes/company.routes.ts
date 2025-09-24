import { Router } from "express";
import { 
  createCompanyAndDatabase, 
  getCompany, 
  updateCompany, 
  getAllCompanies,
  getGlobalStats,
  addBranchToCompany,
  updateBranch,
  getBranches,
  deleteBranch,
  getFirstAdmin,
  updateCompanySummary,
  updateAllCompanySummaries,
} from "../controllers/company.controller";

const router = Router();

/**
 * @swagger
 * /api/company-summary/update-all:
 *   post:
 *     tags:
 *       - Company Summary
 *     summary: Update all company summaries
 *     description: Trigger batch update of summaries for all companies (admin function)
 *     responses:
 *       200:
 *         description: Batch update completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     successful:
 *                       type: array
 *                       items:
 *                         type: string
 *                     failed:
 *                       type: array
 *                       items:
 *                         type: string
 *                     successCount:
 *                       type: number
 *                     failedCount:
 *                       type: number
 */
router.post('/update-all', updateAllCompanySummaries);

/**
 * @swagger
 * /api/company-summary/{companyName}/update:
 *   post:
 *     tags:
 *       - Company Summary
 *     summary: Force update company summary by name
 *     parameters:
 *       - in: path
 *         name: companyName
 *         required: true
 *         schema:
 *           type: string
 *         description: Company name
 *     responses:
 *       200:
 *         description: Company summary updated successfully
 *       500:
 *         description: Failed to update company summary
 */
router.put('/:companyName/update', updateCompanySummary);

router.post("/", createCompanyAndDatabase);
router.get("/all", getAllCompanies); // Nuevo: listar todas las empresas
router.get("/global/stats", getGlobalStats); // Nuevo: estadísticas globales
router.get("/first-admin/:companySlug", getFirstAdmin); // Obtener primer admin de una compañía
router.get("/:name", getCompany);
router.patch("/:name", updateCompany);

// ===== RUTAS PARA BRANCHES =====
router.get("/:c_name/branches", getBranches); // Obtener todas las sucursales
router.post("/:c_name/branches", addBranchToCompany); // Crear nueva sucursal
router.put("/:c_name/branches/:branchId", updateBranch); // Actualizar sucursal
router.delete("/:c_name/branches/:branchId", deleteBranch); // Eliminar sucursal

export default router;