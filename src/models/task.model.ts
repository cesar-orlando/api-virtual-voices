import { Schema, Document, Connection, Model } from "mongoose";

export interface ITaskComment {
  userId: string;
  userName: string;
  comment: string;
  createdAt: Date;
}

export interface ITask extends Document {
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'review' | 'done';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignedTo?: string; // User ID
  assignedToName?: string; // User name for easier display
  companySlug: string;
  createdBy: string; // User ID who created the task
  createdByName: string; // User name who created the task
  dueDate?: Date;
  tags?: string[];
  comments: ITaskComment[];
  attachments?: string[]; // URLs or file paths
  estimatedHours?: number;
  actualHours?: number;
  position: number; // For ordering within status column
  createdAt: Date;
  updatedAt: Date;
}

const TaskCommentSchema: Schema = new Schema({
  userId: { type: String, required: true },
  userName: { type: String, required: true },
  comment: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const TaskSchema: Schema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    status: { 
      type: String, 
      required: true, 
      enum: ['todo', 'in_progress', 'review', 'done'],
      default: 'todo'
    },
    priority: { 
      type: String, 
      required: true, 
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium'
    },
    assignedTo: { type: String },
    assignedToName: { type: String },
    companySlug: { type: String, required: true },
    createdBy: { type: String, required: true },
    createdByName: { type: String, required: true },
    dueDate: { type: Date },
    tags: [{ type: String, trim: true }],
    comments: [TaskCommentSchema],
    attachments: [{ type: String }],
    estimatedHours: { type: Number, min: 0 },
    actualHours: { type: Number, min: 0 },
    position: { type: Number, required: true, default: 0 }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Índices para mejorar performance
TaskSchema.index({ companySlug: 1, status: 1, position: 1 });
TaskSchema.index({ assignedTo: 1, status: 1 });
TaskSchema.index({ createdBy: 1 });
TaskSchema.index({ dueDate: 1, status: 1 });
TaskSchema.index({ priority: 1, status: 1 });

// Virtual para saber si la tarea está vencida
TaskSchema.virtual('isOverdue').get(function() {
  if (!this.dueDate || this.status === 'done') return false;
  return new Date() > this.dueDate;
});

// Virtual para calcular días restantes
TaskSchema.virtual('daysUntilDue').get(function() {
  if (!this.dueDate || this.status === 'done') return null;
  const now = new Date();
  const due = new Date(this.dueDate as Date);
  const diffTime = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
});

// Método para agregar comentario
TaskSchema.methods.addComment = function(userId: string, userName: string, comment: string) {
  this.comments.push({
    userId,
    userName,
    comment,
    createdAt: new Date()
  });
  return this.save();
};

// Método para cambiar estado y actualizar posición
TaskSchema.methods.changeStatus = function(newStatus: string, newPosition?: number) {
  this.status = newStatus;
  if (newPosition !== undefined) {
    this.position = newPosition;
  }
  return this.save();
};

export default function getTaskModel(conn: Connection): Model<ITask> {
  return conn.model<ITask>("Task", TaskSchema);
}