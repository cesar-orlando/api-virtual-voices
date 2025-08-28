import { Connection } from "mongoose";
import getTaskModel, { ITask } from "../../models/task.model";
import getCompanyModel from "../../models/company.model";
import getUserModel from "../../core/users/user.model";
import { getCompanyConnection, getMainConnection } from "../../config/database";

export class TaskService {
  
  /**
   * Obtener todas las tareas de todas las empresas (solo para Virtual Voices)
   */
  static async getAllCompanyTasks(filters: any = {}): Promise<ITask[]> {
    try {
      // Obtener conexión principal para listar empresas  
      const mainConn = await getMainConnection('test'); // Usar una base conocida
      const CompanyModel = getCompanyModel(mainConn);
      
      // Obtener todas las empresas
      const companies = await CompanyModel.find({});
      
      const allTasks: ITask[] = [];
      
      // Iterar sobre cada empresa y obtener sus tareas
      for (const company of companies) {
        try {
          const conn = await getCompanyConnection(company.name);
          const TaskModel = getTaskModel(conn);
          
          // Aplicar filtros si existen
          const query = { companySlug: company.name, ...filters };
          const tasks = await TaskModel.find(query)
            .sort({ status: 1, position: 1, createdAt: -1 });
          
          // Agregar tareas directamente sin conversión problemática
          tasks.forEach(task => {
            const taskObj = task.toObject();
            (taskObj as any).companyName = company.name;
            (taskObj as any).companyAddress = company.address;
            (taskObj as any).companyPhone = company.phone;
            allTasks.push(task);
          });
        } catch (error) {
          console.error(`Error getting tasks for company ${company.name}:`, error);
          // Continuar con la siguiente empresa si hay error
          continue;
        }
      }
      
      // Ordenar todas las tareas por prioridad y fecha
      allTasks.sort((a, b) => {
        // Primero por prioridad (urgent > high > medium > low)
        const priorityOrder = { 'urgent': 4, 'high': 3, 'medium': 2, 'low': 1 };
        const priorityDiff = (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
        if (priorityDiff !== 0) return priorityDiff;
        
        // Luego por fecha de vencimiento (más próximas primero)
        if (a.dueDate && b.dueDate) {
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        }
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        
        // Finalmente por fecha de creación (más recientes primero)
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      
      return allTasks;
    } catch (error) {
      console.error("Error getting all company tasks:", error);
      throw error;
    }
  }

  /**
   * Obtener estadísticas globales de todas las empresas (solo para Virtual Voices)
   */
  static async getGlobalTaskStats(): Promise<any> {
    try {
          const mainConn = await getMainConnection('test'); // Usar una base conocida
    const CompanyModel = getCompanyModel(mainConn);
      
      const companies = await CompanyModel.find({});
      
      const globalStats = {
        totalTasks: 0,
        tasksByStatus: { todo: 0, in_progress: 0, review: 0, done: 0 },
        tasksByPriority: { low: 0, medium: 0, high: 0, urgent: 0 },
        tasksByCompany: [] as any[],
        totalOverdue: 0,
        totalEstimatedHours: 0,
        totalActualHours: 0
      };
      
      for (const company of companies) {
        try {
          const conn = await getCompanyConnection(company.name);
          const TaskModel = getTaskModel(conn);
          
          const companyStats = await TaskModel.aggregate([
            { $match: { companySlug: company.name } },
            {
              $group: {
                _id: null,
                totalTasks: { $sum: 1 },
                todoTasks: { $sum: { $cond: [{ $eq: ["$status", "todo"] }, 1, 0] } },
                inProgressTasks: { $sum: { $cond: [{ $eq: ["$status", "in_progress"] }, 1, 0] } },
                reviewTasks: { $sum: { $cond: [{ $eq: ["$status", "review"] }, 1, 0] } },
                doneTasks: { $sum: { $cond: [{ $eq: ["$status", "done"] }, 1, 0] } },
                lowPriority: { $sum: { $cond: [{ $eq: ["$priority", "low"] }, 1, 0] } },
                mediumPriority: { $sum: { $cond: [{ $eq: ["$priority", "medium"] }, 1, 0] } },
                highPriority: { $sum: { $cond: [{ $eq: ["$priority", "high"] }, 1, 0] } },
                urgentPriority: { $sum: { $cond: [{ $eq: ["$priority", "urgent"] }, 1, 0] } },
                totalEstimatedHours: { $sum: "$estimatedHours" },
                totalActualHours: { $sum: "$actualHours" }
              }
            }
          ]);
          
          const overdueCount = await TaskModel.countDocuments({
            companySlug: company.name,
            status: { $ne: 'done' },
            dueDate: { $lt: new Date() }
          });
          
          if (companyStats.length > 0) {
            const stats = companyStats[0];
            
            globalStats.totalTasks += stats.totalTasks;
            globalStats.tasksByStatus.todo += stats.todoTasks;
            globalStats.tasksByStatus.in_progress += stats.inProgressTasks;
            globalStats.tasksByStatus.review += stats.reviewTasks;
            globalStats.tasksByStatus.done += stats.doneTasks;
            globalStats.tasksByPriority.low += stats.lowPriority;
            globalStats.tasksByPriority.medium += stats.mediumPriority;
            globalStats.tasksByPriority.high += stats.highPriority;
            globalStats.tasksByPriority.urgent += stats.urgentPriority;
            globalStats.totalOverdue += overdueCount;
            globalStats.totalEstimatedHours += stats.totalEstimatedHours || 0;
            globalStats.totalActualHours += stats.totalActualHours || 0;
            
            globalStats.tasksByCompany.push({
              companyName: company.name,
              totalTasks: stats.totalTasks,
              overdueTasks: overdueCount,
              tasksByStatus: {
                todo: stats.todoTasks,
                in_progress: stats.inProgressTasks,
                review: stats.reviewTasks,
                done: stats.doneTasks
              }
            });
          }
        } catch (error) {
          console.error(`Error getting stats for company ${company.name}:`, error);
          continue;
        }
      }
      
      return globalStats;
    } catch (error) {
      console.error("Error getting global task stats:", error);
      throw error;
    }
  }

  /**
   * Verificar si un usuario tiene permisos para ver tareas de una empresa
   */
  static async canUserAccessCompanyTasks(userId: string, companySlug: string): Promise<boolean> {
    try {
      // Si es Virtual Voices, permitir acceso global (se debe verificar el rol del usuario)
      if (companySlug.toLowerCase() === 'virtual-voices' || companySlug.toLowerCase() === 'virtualvoices') {
        return true; // Aquí podrías agregar lógica adicional para verificar roles específicos
      }
      
      const conn = await getCompanyConnection(companySlug);
      const UserModel = getUserModel(conn);
      
      const user = await UserModel.findOne({ _id: userId, companySlug });
      return !!user && user.status === 'active';
    } catch (error) {
      console.error("Error checking user permissions:", error);
      return false;
    }
  }

  /**
   * Actualizar posiciones de tareas en una columna (para drag & drop)
   */
  static async updateTaskPositions(companySlug: string, tasks: { id: string, position: number }[]): Promise<void> {
    try {
      const conn = await getCompanyConnection(companySlug);
      const TaskModel = getTaskModel(conn);
      
      // Actualizar posiciones en lote
      const bulkOps = tasks.map(task => ({
        updateOne: {
          filter: { _id: task.id },
          update: { position: task.position }
        }
      }));
      
      await TaskModel.bulkWrite(bulkOps);
    } catch (error) {
      console.error("Error updating task positions:", error);
      throw error;
    }
  }

  /**
   * Obtener tareas próximas a vencer (próximos 7 días)
   */
  static async getUpcomingTasks(companySlug: string, days: number = 7): Promise<ITask[]> {
    try {
      const conn = await getCompanyConnection(companySlug);
      const TaskModel = getTaskModel(conn);
      
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + days);
      
      const tasks = await TaskModel.find({
        companySlug,
        status: { $ne: 'done' },
        dueDate: {
          $gte: new Date(),
          $lte: sevenDaysFromNow
        }
      }).sort({ dueDate: 1 });
      
      return tasks;
    } catch (error) {
      console.error("Error getting upcoming tasks:", error);
      throw error;
    }
  }

  /**
   * Obtener tareas vencidas
   */
  static async getOverdueTasks(companySlug: string): Promise<ITask[]> {
    try {
      const conn = await getCompanyConnection(companySlug);
      const TaskModel = getTaskModel(conn);
      
      const tasks = await TaskModel.find({
        companySlug,
        status: { $ne: 'done' },
        dueDate: { $lt: new Date() }
      }).sort({ dueDate: 1 });
      
      return tasks;
    } catch (error) {
      console.error("Error getting overdue tasks:", error);
      throw error;
    }
  }

  /**
   * Clonar una tarea
   */
  static async cloneTask(companySlug: string, taskId: string, userId: string, userName: string): Promise<ITask> {
    try {
      const conn = await getCompanyConnection(companySlug);
      const TaskModel = getTaskModel(conn);
      
      const originalTask = await TaskModel.findById(taskId);
      if (!originalTask) {
        throw new Error("Tarea no encontrada");
      }
      
      // Obtener la siguiente posición en la columna 'todo'
      const lastTask = await TaskModel.findOne({ 
        companySlug, 
        status: 'todo' 
      }).sort({ position: -1 });
      
      const position = lastTask ? lastTask.position + 1 : 0;
      
      const clonedTask = new TaskModel({
        title: `${originalTask.title} (Copia)`,
        description: originalTask.description,
        priority: originalTask.priority,
        assignedTo: originalTask.assignedTo,
        assignedToName: originalTask.assignedToName,
        companySlug,
        createdBy: userId,
        createdByName: userName,
        dueDate: originalTask.dueDate,
        tags: [...(originalTask.tags || [])],
        estimatedHours: originalTask.estimatedHours,
        status: 'todo',
        position,
        comments: [] // No clonamos comentarios
      });
      
      await clonedTask.save();
      return clonedTask;
    } catch (error) {
      console.error("Error cloning task:", error);
      throw error;
    }
  }
}