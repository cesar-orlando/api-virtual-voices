import { Router } from "express";
import { createCompanyAndDatabase, getCompany, updateCompany } from "../controllers/company.controller";

const router = Router();

router.post("/", createCompanyAndDatabase);
router.get("/:name", getCompany);
router.put("/:name", updateCompany);

export default router;