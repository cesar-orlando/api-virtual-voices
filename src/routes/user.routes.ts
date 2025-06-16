import { Router } from "express";
import {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  compareLogin,
} from "../controllers/user.controller";

const router = Router();

// Define routes and map them to controller functions
router.get("/:c_name", getAllUsers);
router.get("/:c_name/:id", getUserById);
router.post("/register", createUser);
router.put("/:id", updateUser);
router.delete("/:id", deleteUser);
router.post("/login", compareLogin);

export default router;