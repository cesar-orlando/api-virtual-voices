import { Router } from "express";
import { createIAConfig , getIAConfig, testIA, updateIAConfig} from "../controllers/iaConfig.controller";

const router = Router();

router.post("/:c_name", createIAConfig);

router.post("/testIA/:c_name", testIA);

router.get("/:c_name", getIAConfig);

router.put("/:c_name", updateIAConfig);

export default router;