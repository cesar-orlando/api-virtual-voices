import { Router } from "express";
import { login, register, getProfile, updateProfile } from "./user.controller";

const router = Router();

// Authentication routes
router.post("/login", login);
router.post("/register", register);

// Profile routes (these would need auth middleware in production)
router.get("/profile", getProfile);
router.put("/profile", updateProfile);

export default router;