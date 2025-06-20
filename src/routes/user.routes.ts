import { Router } from "express";
import {
  getAllCompanyUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  compareLogin,
  getAllUsers,
} from "../controllers/user.controller";

const router = Router();

// Define routes and map them to controller functions
router.get("/", getAllUsers);
router.get("/:c_name", getAllCompanyUsers);
router.get("/:c_name/:id", getUserById);
router.post("/register", createUser);
router.put("/:id", updateUser);
router.delete("/:id", deleteUser);
router.post("/login", compareLogin);

export default router;