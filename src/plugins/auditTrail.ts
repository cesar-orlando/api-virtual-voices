import { Schema, FlattenMaps } from 'mongoose';
import getAuditLogModel from '../models/auditLog.model';

type AuditPluginOptions = {
  includePaths?: string[]; // dot paths to include; if omitted, all root data.* paths are considered
  excludePaths?: string[];
  redactPaths?: string[]; // dot paths to mask
  embeddedHistoryPath?: string; // e.g., 'changeHistory'
  embeddedCap?: number; // keep last N entries
  modelName?: string; // override model name used in AuditLog
  rootPaths?: string[]; // roots to watch (default ['data']). Use [''] to watch entire document.
};

export async function attachHistoryToData(conn: any, data: any[], model, limit = 5) {
  if (!data || data.length === 0) return data;
  const ids = data.map(s => s._id);
  const AuditLog = getAuditLogModel(conn);
  const rows = await AuditLog.aggregate([
    { $match: { model: model, docId: { $in: ids } } },
    { $sort: { changedAt: -1 } },
    {
      $group: {
        _id: '$docId',
        logs: {
          $push: {
            path: '$path',
            oldValue: '$oldValue',
            newValue: '$newValue',
            user: '$user',
            source: '$source',
            requestId: '$requestId',
            changedAt: '$changedAt'
          }
        }
      }
    },
    { $project: { _id: 0, docId: '$_id', logs: { $slice: ['$logs', limit] } } }
  ]).exec();
  const map = new Map<string, any[]>(rows.map(r => [String(r.docId), r.logs]));
  const out = data.map((s: any) => {
    const plain = typeof s?.toObject === 'function' ? s.toObject() : s;
    const idStr = String(s._id);
    return { ...plain, changeHistory: map.get(idStr) || [] };
  });
  return out;
}

function isObjectIdLike(v: any): boolean {
  return !!(v && typeof v === 'object' && (typeof v.toHexString === 'function' || v._bsontype === 'ObjectId' || (v.constructor && v.constructor.name === 'ObjectId')));
}

function isTypedArray(v: any): boolean {
  return !!(v && typeof v === 'object' && ArrayBuffer.isView(v) && !(v instanceof DataView));
}

function normalizeLeaf(v: any): any {
  try {
    if (isObjectIdLike(v)) return v.toString();
    if (Buffer.isBuffer(v)) return `0x${v.toString('hex')}`;
    if (isTypedArray(v)) return `0x${Buffer.from(v as Uint8Array).toString('hex')}`;
    if (v && typeof v === 'object' && typeof v._bsontype === 'string' && typeof v.toString === 'function') {
      // Normalize other BSON types like Decimal128, Long, etc.
      return v.toString();
    }
    if (v instanceof RegExp) return v.toString();
  } catch {
    // fallthrough
  }
  return v;
}

function flatten(obj: any, prefix = ''): Record<string, any> {
  const out: Record<string, any> = {};
  if (obj == null || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    const normalized = normalizeLeaf(v);
    if (normalized !== v) {
      // Special types normalized to scalars
      out[path] = normalized;
    } else if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      Object.assign(out, flatten(v, path));
    } else {
      out[path] = normalized;
    }
  }
  return out;
}

function shouldTrack(path: string, opts: AuditPluginOptions) {
  if (opts.excludePaths?.some(p => path === p || path.startsWith(p + '.'))) return false;
  if (!opts.includePaths || opts.includePaths.length === 0) return true;
  return opts.includePaths.some(p => path === p || path.startsWith(p + '.'));
}

function redact(path: string, value: any, opts: AuditPluginOptions) {
  if (opts.redactPaths?.some(p => path === p || path.startsWith(p + '.'))) {
    return 'REDACTED';
  }
  return value;
}

export default function auditTrailPlugin(schema: Schema, opts: AuditPluginOptions = {}) {
  const roots = (opts.rootPaths && opts.rootPaths.length > 0) ? opts.rootPaths : ['data'];

  const getAtPath = (obj: any, path: string | undefined) => {
    if (!path || path === '') return obj;
    const parts = path.split('.');
    let cur = obj;
    for (const p of parts) {
      if (cur == null) return undefined;
      cur = cur[p];
    }
    return cur;
  };
  // Helper to write audit entries
  async function writeAudit(this: any, changes: Array<{ path: string; oldValue: any; newValue: any }>) {
    if (!changes.length) return;
    const conn = this.db;
    const AuditLog = getAuditLogModel(conn);
    const modelName = opts.modelName || this.constructor.modelName;

    const payloads = changes.map(ch => ({
      c_name: this.c_name,
      model: modelName,
      docId: this._id,
      tableSlug: this.tableSlug,
      path: ch.path,
      oldValue: ch.oldValue,
      newValue: ch.newValue,
      user: this._updatedByUser || (this._updatedBy && { id: this._updatedBy, name: undefined }),
      source: this._auditSource,
      requestId: this._requestId,
      changedAt: new Date(),
    }));

    await AuditLog.insertMany(payloads, { ordered: false });

    // Embedded capped history
    if (opts.embeddedHistoryPath) {
      const entries = payloads.map(p => ({
        user: p.user,
        field: p.path.replace(/^data\./, ''),
        oldValue: p.oldValue,
        newValue: p.newValue,
        changedAt: p.changedAt,
      }));
      const cap = opts.embeddedCap ?? 20;
      // Use direct mutation; caller must markModified if needed
      const arr = this.get(opts.embeddedHistoryPath) || [];
      const next = [...arr, ...entries];
      const sliced = next.slice(Math.max(0, next.length - cap));
      this.set(opts.embeddedHistoryPath, sliced);
    }
  }

  // Pre findOneAndUpdate: compute diffs against current stored doc
  schema.pre(['findOneAndUpdate', 'updateOne'], async function (next) {
    try {
      const query: any = this.getQuery();
      const update: any = this.getUpdate() || {};
        // Extract audit context from query options (supports both options.auditContext and options.$locals.auditContext)
        const qOpts: any = (this as any).getOptions ? (this as any).getOptions() : {};
        const auditCtx = qOpts?.auditContext || qOpts?.$locals?.auditContext || {};
      // Allow callers to skip audit logging for this operation
      if (auditCtx?.skipAudit === true) {
        return next();
      }
      const doc = await (this as any).model.findOne(query).lean();
      if (!doc) return next();
      let flatPrev: Record<string, any> = {};
      for (const root of roots) {
        const prevVal = getAtPath(doc, root);
        Object.assign(flatPrev, flatten(prevVal, root));
      }
      const changes: Array<{ path: string; oldValue: any; newValue: any }> = [];

      // Detect replacement-style updates (keys that don't start with $)
      const hasReplacementKeys = Object.keys(update).some(k => !k.startsWith('$'));

      if (hasReplacementKeys) {
        // Build next state from the replacement doc
        let flatNext: Record<string, any> = {};
        for (const root of roots) {
          const nextVal = getAtPath(update, root);
          Object.assign(flatNext, flatten(nextVal, root));
        }
        const paths = new Set([...Object.keys(flatPrev), ...Object.keys(flatNext)]);
        for (const p of paths) {
          const matchesRoot = roots.some(r => r === '' ? true : (p === r || p.startsWith(r + '.')));
          if (!matchesRoot) continue;
          if (!shouldTrack(p, opts)) continue;
          const a = flatPrev[p];
          const b = flatNext[p];
          if (JSON.stringify(a) !== JSON.stringify(b)) {
            changes.push({ path: p, oldValue: redact(p, a, opts), newValue: redact(p, b, opts) });
          }
        }
      } else {
        // Operator-based updates: consider $set and $unset
        const setOps = update.$set || {};
        const unsetOps = update.$unset || {};
        for (const [k, v] of Object.entries(setOps)) {
          const matchesRoot = roots.some(r => r === '' ? true : (k === r || k.startsWith(r + '.')));
          if (!matchesRoot) continue;
          if (!shouldTrack(k, opts)) continue;
          const oldV = flatPrev[k];
          if (JSON.stringify(oldV) !== JSON.stringify(v)) {
            changes.push({ path: k, oldValue: redact(k, oldV, opts), newValue: redact(k, v, opts) });
          }
        }
        for (const k of Object.keys(unsetOps)) {
          const matchesRoot = roots.some(r => r === '' ? true : (k === r || k.startsWith(r + '.')));
          if (!matchesRoot) continue;
          if (!shouldTrack(k, opts)) continue;
          const oldV = flatPrev[k];
          changes.push({ path: k, oldValue: redact(k, oldV, opts), newValue: redact(k, null, opts) });
        }
      }

    if (changes.length) {
        const conn = (this as any).model.db;
        const AuditLog = getAuditLogModel(conn);
        const modelName = opts.modelName || (this as any).model.modelName;
        const base = {
          c_name: doc.c_name,
          model: modelName,
          docId: doc._id,
          tableSlug: doc.tableSlug,
          changedAt: new Date(),
      user: auditCtx._updatedByUser || (auditCtx._updatedBy && { id: auditCtx._updatedBy, name: undefined }),
      source: auditCtx._auditSource,
      requestId: auditCtx._requestId,
      ip: auditCtx.ip,
      userAgent: auditCtx.userAgent,
        } as any;
        await AuditLog.insertMany(
          changes.map(ch => ({
            ...base,
            path: ch.path,
            oldValue: ch.oldValue,
            newValue: ch.newValue,
          }))
        );
        if (opts.embeddedHistoryPath) {
          const entries = changes.map(ch => ({
            user: undefined,
            field: (() => {
              // Remove the first matching root prefix only
              for (const r of roots) {
                if (r && ch.path.startsWith(r + '.')) return ch.path.slice(r.length + 1);
                if (r === '') return ch.path;
              }
              return ch.path;
            })(),
            oldValue: ch.oldValue,
            newValue: ch.newValue,
            changedAt: base.changedAt,
          }));
          const cap = opts.embeddedCap ?? 20;
          this.setUpdate({
            ...update,
            $push: {
              ...(update.$push || {}),
              [opts.embeddedHistoryPath]: { $each: entries, $slice: -cap },
            },
          });
        }
      }
      next();
    } catch (err) { next(err as any); }
  });

  // Snapshot original on find for save comparisons
  schema.post('init', function (doc: any) {
    doc._originalDoc = doc.toObject({ depopulate: true });
  });
}
