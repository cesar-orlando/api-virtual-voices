import { Router } from "express";
import { createCompanyAndDatabase, getCompany } from "../controllers/company.controller";

const router = Router();

router.post("/", createCompanyAndDatabase);
router.get("/:name", getCompany);


export default router;