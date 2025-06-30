import { Router } from "express";
import {
  login,
  register,
  getProfile,
  updateProfile
} from "./user.controller";
import { detectCompanyFromToken } from "../auth/companyMiddleware";

const router = Router();

// Rutas públicas
router.post("/login", login);
router.post("/register", register);

// Middleware para rutas protegidas
router.use(detectCompanyFromToken);

// Perfil del usuario autenticado
router.get("/me", getProfile);
router.put("/me/update", updateProfile);

export default router; 