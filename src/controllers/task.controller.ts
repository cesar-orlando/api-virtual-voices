import { Request, Response } from "express";
import { Connection } from "mongoose";
import getTaskModel, { ITask } from "../models/task.model";
import getUserModel from "../core/users/user.model";
import { getCompanyConnection } from "../config/database";
import { TaskService } from "../services/taskService";
import { 
  CreateTaskRequest, 
  UpdateTaskRequest, 
  ChangeTaskStatusRequest, 
  AddCommentRequest,
  TaskFilters,
  UpdateTaskPositionsRequest
} from "../types/task.types";

export class TaskController {
  
  /**
   * Crear nueva tarea
   */
  static async createTask(req: Request, res: Response): Promise<void> {
    try {
      const { 
        title, 
        description, 
        priority = 'medium', 
        assignedTo, 
        dueDate, 
        tags, 
        estimatedHours 
      } = req.body;

      const companySlug = req.headers['x-company-slug'] as string;
      const createdBy = 'system'; // Usuario por defecto - se implementará auth después
      const createdByName = 'Sistema';

      if (!companySlug) {
        res.status(400).json({ message: "Company slug es requerido" });
        return;
      }

      if (!title) {
        res.status(400).json({ message: "El título es requerido" });
        return;
      }

      const conn = await getCompanyConnection(companySlug);
      const TaskModel = getTaskModel(conn);
      const UserModel = getUserModel(conn);

      // Obtener información del usuario asignado si existe
      let assignedToName: string | undefined;
      if (assignedTo) {
        const assignedUser = await UserModel.findById(assignedTo);
        if (!assignedUser) {
          res.status(400).json({ message: "Usuario asignado no encontrado" });
          return;
        }
        assignedToName = assignedUser.name;
      }

      // Obtener la siguiente posición en la columna 'todo'
      const lastTask = await TaskModel.findOne({ 
        companySlug, 
        status: 'todo' 
      }).sort({ position: -1 });
      
      const position = lastTask ? lastTask.position + 1 : 0;

      const task = new TaskModel({
        title,
        description,
        priority,
        assignedTo,
        assignedToName,
        companySlug,
        createdBy,
        createdByName,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        tags: tags || [],
        estimatedHours,
        position
      });

      await task.save();
      res.status(201).json(task);
    } catch (error) {
      console.error("Error creating task:", error);
      res.status(500).json({ message: "Error interno del servidor", error });
    }
  }

  /**
   * Obtener todas las tareas de una empresa o vista consolidada
   */
  static async getTasks(req: Request, res: Response): Promise<void> {
    try {
      const companySlug = req.headers['x-company-slug'] as string;
      const userRole = req.headers['x-user-role'] as string;
      const userCompany = req.headers['x-user-company'] as string;
      const filters = req.query as TaskFilters;

      if (!companySlug) {
        res.status(400).json({ message: "Company slug es requerido" });
        return;
      }

      // Verificar permisos de acceso
      const isSuperAdmin = userRole === 'SuperAdmin';
      const isVirtualVoicesUser = userCompany?.toLowerCase() === 'virtualvoices';
      const canAccessAllCompanies = isSuperAdmin || isVirtualVoicesUser;

      // Si solicita vista consolidada de todas las empresas
      if (companySlug === 'all-companies') {
        if (!canAccessAllCompanies) {
          res.status(403).json({ 
            message: "Acceso denegado. Solo admin supremo o usuarios VirtualVoices pueden ver todas las empresas" 
          });
          return;
        }
        
        const tasks = await TaskService.getAllCompanyTasks(filters);
        res.json(tasks);
        return;
      }

      // Si es usuario normal, solo puede ver su propia empresa
      if (!canAccessAllCompanies && companySlug !== userCompany) {
        res.status(403).json({ 
          message: "Acceso denegado. No puede ver tareas de otra empresa" 
        });
        return;
      }

      const conn = await getCompanyConnection(companySlug);
      const TaskModel = getTaskModel(conn);

      // Construir filtros
      const queryFilters: any = { companySlug };
      
      if (filters.status) queryFilters.status = filters.status;
      if (filters.assignedTo) queryFilters.assignedTo = filters.assignedTo;
      if (filters.priority) queryFilters.priority = filters.priority;
      if (filters.tags) {
        const tagArray = Array.isArray(filters.tags) ? filters.tags : [filters.tags];
        queryFilters.tags = { $in: tagArray };
      }
      if (filters.dueDateFrom || filters.dueDateTo) {
        queryFilters.dueDate = {};
        if (filters.dueDateFrom) queryFilters.dueDate.$gte = new Date(filters.dueDateFrom);
        if (filters.dueDateTo) queryFilters.dueDate.$lte = new Date(filters.dueDateTo);
      }
      if (filters.overdue === true) {
        queryFilters.dueDate = { $lt: new Date() };
        queryFilters.status = { $ne: 'done' };
      }

      const tasks = await TaskModel.find(queryFilters)
        .sort({ status: 1, position: 1, createdAt: -1 });

      res.json(tasks);
    } catch (error) {
      console.error("Error getting tasks:", error);
      res.status(500).json({ message: "Error interno del servidor", error });
    }
  }

  /**
   * Obtener tarea por ID
   */
  static async getTaskById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const companySlug = req.headers['x-company-slug'] as string;

      if (!companySlug) {
        res.status(400).json({ message: "Company slug es requerido" });
        return;
      }

      const conn = await getCompanyConnection(companySlug);
      const TaskModel = getTaskModel(conn);

      const task = await TaskModel.findById(id);
      
      if (!task) {
        res.status(404).json({ message: "Tarea no encontrada" });
        return;
      }

      res.json(task);
    } catch (error) {
      console.error("Error getting task:", error);
      res.status(500).json({ message: "Error interno del servidor", error });
    }
  }

  /**
   * Actualizar tarea
   */
  static async updateTask(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const companySlug = req.headers['x-company-slug'] as string;
      const updates = req.body;

      if (!companySlug) {
        res.status(400).json({ message: "Company slug es requerido" });
        return;
      }

      const conn = await getCompanyConnection(companySlug);
      const TaskModel = getTaskModel(conn);
      const UserModel = getUserModel(conn);

      // Si se está actualizando el usuario asignado, obtener su nombre
      if (updates.assignedTo) {
        const assignedUser = await UserModel.findById(updates.assignedTo);
        if (assignedUser) {
          updates.assignedToName = assignedUser.name;
        }
      }

      const task = await TaskModel.findByIdAndUpdate(
        id, 
        updates, 
        { new: true, runValidators: true }
      );

      if (!task) {
        res.status(404).json({ message: "Tarea no encontrada" });
        return;
      }

      res.json(task);
    } catch (error) {
      console.error("Error updating task:", error);
      res.status(500).json({ message: "Error interno del servidor", error });
    }
  }

  /**
   * Cambiar estado de tarea (para el drag & drop de Trello)
   */
  static async changeTaskStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { status, position } = req.body;
      const companySlug = req.headers['x-company-slug'] as string;

      if (!companySlug) {
        res.status(400).json({ message: "Company slug es requerido" });
        return;
      }

      const conn = await getCompanyConnection(companySlug);
      const TaskModel = getTaskModel(conn);

      // Si se proporciona una nueva posición, actualizar posiciones de otras tareas
      if (position !== undefined) {
        await TaskModel.updateMany(
          { companySlug, status, position: { $gte: position } },
          { $inc: { position: 1 } }
        );
      }

      const task = await TaskModel.findById(id);
      if (!task) {
        res.status(404).json({ message: "Tarea no encontrada" });
        return;
      }

      task.status = status;
      if (position !== undefined) {
        task.position = position;
      }
      await task.save();
      res.json(task);
    } catch (error) {
      console.error("Error changing task status:", error);
      res.status(500).json({ message: "Error interno del servidor", error });
    }
  }

  /**
   * Agregar comentario a tarea
   */
  static async addComment(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { comment } = req.body;
      const companySlug = req.headers['x-company-slug'] as string;
      const userId = 'system';
      const userName = 'Sistema';

      if (!companySlug || !comment) {
        res.status(400).json({ message: "Datos requeridos faltantes" });
        return;
      }

      const conn = await getCompanyConnection(companySlug);
      const TaskModel = getTaskModel(conn);

      const task = await TaskModel.findById(id);
      if (!task) {
        res.status(404).json({ message: "Tarea no encontrada" });
        return;
      }

      task.comments.push({
        userId,
        userName,
        comment,
        createdAt: new Date()
      });
      await task.save();
      res.json(task);
    } catch (error) {
      console.error("Error adding comment:", error);
      res.status(500).json({ message: "Error interno del servidor", error });
    }
  }

  /**
   * Eliminar tarea
   */
  static async deleteTask(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const companySlug = req.headers['x-company-slug'] as string;

      if (!companySlug) {
        res.status(400).json({ message: "Company slug es requerido" });
        return;
      }

      const conn = await getCompanyConnection(companySlug);
      const TaskModel = getTaskModel(conn);

      const task = await TaskModel.findByIdAndDelete(id);
      
      if (!task) {
        res.status(404).json({ message: "Tarea no encontrada" });
        return;
      }

      res.json({ message: "Tarea eliminada correctamente" });
    } catch (error) {
      console.error("Error deleting task:", error);
      res.status(500).json({ message: "Error interno del servidor", error });
    }
  }

  /**
   * Obtener estadísticas de tareas por empresa o globales
   */
  static async getTaskStats(req: Request, res: Response): Promise<void> {
    try {
      const companySlug = req.headers['x-company-slug'] as string;
      const userRole = req.headers['x-user-role'] as string;
      const userCompany = req.headers['x-user-company'] as string;

      if (!companySlug) {
        res.status(400).json({ message: "Company slug es requerido" });
        return;
      }

      const isSuperAdmin = userRole === 'SuperAdmin';
      const isVirtualVoicesUser = userCompany?.toLowerCase() === 'virtualvoices';
      const canAccessAllCompanies = isSuperAdmin || isVirtualVoicesUser;

      // Si solicita estadísticas globales
      if (companySlug === 'all-companies') {
        if (!canAccessAllCompanies) {
          res.status(403).json({ message: "Acceso denegado" });
          return;
        }
        
        const globalStats = await TaskService.getGlobalTaskStats();
        res.json(globalStats);
        return;
      }

      // Verificar permisos para empresa específica
      if (!canAccessAllCompanies && companySlug !== userCompany) {
        res.status(403).json({ message: "Acceso denegado" });
        return;
      }

      const conn = await getCompanyConnection(companySlug);
      const TaskModel = getTaskModel(conn);

      const stats = await TaskModel.aggregate([
        { $match: { companySlug } },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            avgEstimatedHours: { $avg: "$estimatedHours" },
            totalEstimatedHours: { $sum: "$estimatedHours" },
            totalActualHours: { $sum: "$actualHours" }
          }
        }
      ]);

      const priorityStats = await TaskModel.aggregate([
        { $match: { companySlug, status: { $ne: 'done' } } },
        {
          $group: {
            _id: "$priority",
            count: { $sum: 1 }
          }
        }
      ]);

      const overdueCount = await TaskModel.countDocuments({
        companySlug,
        status: { $ne: 'done' },
        dueDate: { $lt: new Date() }
      });

      res.json({
        companyName: companySlug,
        statusStats: stats,
        priorityStats,
        overdueCount
      });
    } catch (error) {
      console.error("Error getting task stats:", error);
      res.status(500).json({ message: "Error interno del servidor", error });
    }
  }

  /**
   * Obtener tareas próximas a vencer
   */
  static async getUpcomingTasks(req: Request, res: Response): Promise<void> {
    try {
      const companySlug = req.headers['x-company-slug'] as string;
      const { days = 7 } = req.query;

      if (!companySlug) {
        res.status(400).json({ message: "Company slug es requerido" });
        return;
      }

      const tasks = await TaskService.getUpcomingTasks(companySlug, Number(days));
      res.json(tasks);
    } catch (error) {
      console.error("Error getting upcoming tasks:", error);
      res.status(500).json({ message: "Error interno del servidor", error });
    }
  }

  /**
   * Obtener tareas vencidas
   */
  static async getOverdueTasks(req: Request, res: Response): Promise<void> {
    try {
      const companySlug = req.headers['x-company-slug'] as string;

      if (!companySlug) {
        res.status(400).json({ message: "Company slug es requerido" });
        return;
      }

      const tasks = await TaskService.getOverdueTasks(companySlug);
      res.json(tasks);
    } catch (error) {
      console.error("Error getting overdue tasks:", error);
      res.status(500).json({ message: "Error interno del servidor", error });
    }
  }

  /**
   * Clonar una tarea
   */
  static async cloneTask(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const companySlug = req.headers['x-company-slug'] as string;
      const userId = 'system';
      const userName = 'Sistema';

      if (!companySlug) {
        res.status(400).json({ message: "Company slug es requerido" });
        return;
      }

      const clonedTask = await TaskService.cloneTask(companySlug, id, userId, userName);
      res.status(201).json(clonedTask);
    } catch (error) {
      console.error("Error cloning task:", error);
      res.status(500).json({ message: "Error interno del servidor", error });
    }
  }

  /**
   * Actualizar posiciones de tareas (para drag & drop)
   */
  static async updateTaskPositions(req: Request, res: Response): Promise<void> {
    try {
      const companySlug = req.headers['x-company-slug'] as string;
      const { tasks }: UpdateTaskPositionsRequest = req.body;

      if (!companySlug) {
        res.status(400).json({ message: "Company slug es requerido" });
        return;
      }

      if (!tasks || !Array.isArray(tasks)) {
        res.status(400).json({ message: "Array de tareas es requerido" });
        return;
      }

      await TaskService.updateTaskPositions(companySlug, tasks);
      res.json({ message: "Posiciones actualizadas correctamente" });
    } catch (error) {
      console.error("Error updating task positions:", error);
      res.status(500).json({ message: "Error interno del servidor", error });
    }
  }

  /**
   * Obtener tareas asignadas a un usuario
   */
  static async getUserTasks(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const companySlug = req.headers['x-company-slug'] as string;
      const { status } = req.query;

      if (!companySlug) {
        res.status(400).json({ message: "Company slug es requerido" });
        return;
      }

      const conn = await getCompanyConnection(companySlug);
      const TaskModel = getTaskModel(conn);

      const filters: any = { companySlug, assignedTo: userId };
      if (status) filters.status = status;

      const tasks = await TaskModel.find(filters)
        .sort({ priority: -1, dueDate: 1, createdAt: -1 });

      res.json(tasks);
    } catch (error) {
      console.error("Error getting user tasks:", error);
      res.status(500).json({ message: "Error interno del servidor", error });
    }
  }
}