import { Schema, Connection, Model } from 'mongoose';

export interface IAuditLog {
  c_name?: string;
  model: string;
  docId: any;
  tableSlug?: string;
  path: string; // dot path of the field (e.g., data.ia)
  oldValue: any;
  newValue: any;
  user?: { id?: any; name?: string };
  source?: string; // api|job|bot
  requestId?: string;
  ip?: string;
  userAgent?: string;
  changedAt: Date;
}

export interface IAuditLogModel extends Model<IAuditLog> {}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    c_name: { type: String },
    model: { type: String, required: true },
    docId: { type: Schema.Types.Mixed, required: true },
    tableSlug: { type: String },
    path: { type: String, required: true },
    oldValue: { type: Schema.Types.Mixed },
    newValue: { type: Schema.Types.Mixed },
    user: {
      id: { type: Schema.Types.Mixed },
      name: { type: String },
    },
    source: { type: String },
    requestId: { type: String },
    ip: { type: String },
    userAgent: { type: String },
    changedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

AuditLogSchema.index({ c_name: 1, model: 1, docId: 1, changedAt: -1 });
AuditLogSchema.index({ model: 1, path: 1, changedAt: -1 });
AuditLogSchema.index({ 'user.id': 1, changedAt: -1 });

export default function getAuditLogModel(conn: Connection): IAuditLogModel {
  return conn.model<IAuditLog, IAuditLogModel>('AuditLog', AuditLogSchema, 'auditlogs');
}
