import { Router } from "express";
import { createIAConfig , deleteIAConfig, getAllIAConfigs, getGeneralIAConfig, testIA, updateIAConfig} from "../controllers/iaConfig.controller";

const router = Router();

router.post("/:c_name", createIAConfig);

router.post("/testIA/:c_name", testIA);

router.get("/:c_name/:user_id", getAllIAConfigs);

router.get("/:c_name", getGeneralIAConfig);

router.put("/:c_name/:user_id", updateIAConfig);

router.delete("/:c_name/:user_id/:config_id", deleteIAConfig)

export default router;