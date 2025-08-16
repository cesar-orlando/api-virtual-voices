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
  deleteBranch
} from "../controllers/company.controller";

const router = Router();

router.post("/", createCompanyAndDatabase);
router.get("/", getAllCompanies); // Nuevo: listar todas las empresas
router.get("/global/stats", getGlobalStats); // Nuevo: estadísticas globales
router.get("/:name", getCompany);
router.put("/:name", updateCompany);

// ===== RUTAS PARA BRANCHES =====
router.get("/:c_name/branches", getBranches); // Obtener todas las sucursales
router.post("/:c_name/branches", addBranchToCompany); // Crear nueva sucursal
router.put("/:c_name/branches/:branchId", updateBranch); // Actualizar sucursal
router.delete("/:c_name/branches/:branchId", deleteBranch); // Eliminar sucursal

export default router;