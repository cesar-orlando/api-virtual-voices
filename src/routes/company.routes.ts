import { Router } from "express";
import { 
  createCompanyAndDatabase, 
  getCompany, 
  updateCompany, 
  getAllCompanies,
  getGlobalStats
} from "../controllers/company.controller";

const router = Router();

router.post("/", createCompanyAndDatabase);
router.get("/", getAllCompanies); // Nuevo: listar todas las empresas
router.get("/global/stats", getGlobalStats); // Nuevo: estadísticas globales
router.get("/:name", getCompany);
router.put("/:name", updateCompany);

export default router;