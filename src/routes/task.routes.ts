import { Router } from "express";
import { TaskController } from "../controllers/task.controller";

const router = Router();

// Rutas para CRUD de tareas
router.post("/", TaskController.createTask);
router.get("/", TaskController.getTasks);
router.get("/stats", TaskController.getTaskStats);
router.get("/upcoming", TaskController.getUpcomingTasks);
router.get("/overdue", TaskController.getOverdueTasks);
router.get("/user/:userId", TaskController.getUserTasks);
router.get("/:id", TaskController.getTaskById);
router.put("/:id", TaskController.updateTask);
router.patch("/:id/status", TaskController.changeTaskStatus);
router.post("/:id/comments", TaskController.addComment);
router.post("/:id/clone", TaskController.cloneTask);
router.patch("/positions", TaskController.updateTaskPositions);
router.delete("/:id", TaskController.deleteTask);

export default router;