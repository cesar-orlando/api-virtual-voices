import { Router } from "express";
import { 
    createWhatsappSession, 
    getAllWhatsappSessions, 
    updateWhatsappSession, 
    deleteWhatsappSession, 
    getAllFacebookSessions, 
    createFacebookSession, 
    updateFacebookSession, 
    deleteFacebookSession 
} from "../controllers/session.controller";

const router = Router();

router.post("/whatsapp", createWhatsappSession);
router.get("/whatsapp/:c_name/:user_id", getAllWhatsappSessions);
router.put("/whatsapp/:c_name", updateWhatsappSession);
router.delete("/whatsapp/:c_name/:sessionId", deleteWhatsappSession);
router.get('/messenger/:c_name/:user_id', getAllFacebookSessions);
router.post('/messenger', createFacebookSession);
router.put('/messenger/:c_name', updateFacebookSession);
router.delete('/messenger/:c_name/:sessionId', deleteFacebookSession);

export default router;
