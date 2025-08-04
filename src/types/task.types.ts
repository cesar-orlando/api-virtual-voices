export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface CreateTaskRequest {
  title: string;
  description?: string;
  priority?: TaskPriority;
  assignedTo?: string;
  dueDate?: string;
  tags?: string[];
  estimatedHours?: number;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  assignedTo?: string;
  dueDate?: string;
  tags?: string[];
  estimatedHours?: number;
  actualHours?: number;
}

export interface ChangeTaskStatusRequest {
  status: TaskStatus;
  position?: number;
}

export interface AddCommentRequest {
  comment: string;
}

export interface TaskFilters {
  status?: TaskStatus;
  assignedTo?: string;
  priority?: TaskPriority;
  tags?: string | string[];
  dueDateFrom?: string;
  dueDateTo?: string;
  overdue?: boolean;
}

export interface TaskWithCompanyInfo {
  _id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignedTo?: string;
  assignedToName?: string;
  companySlug: string;
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  createdBy: string;
  createdByName: string;
  dueDate?: Date;
  tags?: string[];
  comments: Array<{
    userId: string;
    userName: string;
    comment: string;
    createdAt: Date;
  }>;
  attachments?: string[];
  estimatedHours?: number;
  actualHours?: number;
  position: number;
  createdAt: Date;
  updatedAt: Date;
  isOverdue?: boolean;
  daysUntilDue?: number;
}

export interface TaskStats {
  totalTasks: number;
  tasksByStatus: {
    todo: number;
    in_progress: number;
    review: number;
    done: number;
  };
  tasksByPriority: {
    low: number;
    medium: number;
    high: number;
    urgent: number;
  };
  overdueCount: number;
  totalEstimatedHours: number;
  totalActualHours: number;
}

export interface GlobalTaskStats extends TaskStats {
  tasksByCompany: Array<{
    companyName: string;
    totalTasks: number;
    overdueTasks: number;
    tasksByStatus: {
      todo: number;
      in_progress: number;
      review: number;
      done: number;
    };
  }>;
}

export interface UpdateTaskPositionsRequest {
  tasks: Array<{
    id: string;
    position: number;
  }>;
}