import { Request, Response } from "express";
import { startWhatsappBot, clients } from "../services/whatsapp/index";
import { getSessionModel } from "../models/session.model";
import { getConnectionByCompanySlug } from "../config/connectionManager";
import { getFacebookChatModel } from "../models/facebookChat.model";
import getBranchModel from "../models/branch.model";
import getIaConfigModel from "../models/iaConfig.model";
import getUserModel from "../core/users/user.model";
import fs from "fs";
import path from "path";
import { loadRecentFacebookMessages } from "../services/meta/messenger";
import getAuditLogModel from "../models/auditLog.model";
import { attachHistoryToData } from "../plugins/auditTrail";

// Helpers to only update changed fields
function getAt(obj: any, path: string): any {
  if (!obj) return undefined;
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function isObjectIdLike(v: any): boolean {
  return !!(v && typeof v === 'object' && (typeof v.toHexString === 'function' || v._bsontype === 'ObjectId' || (v.constructor && v.constructor.name === 'ObjectId')));
}

function normalizeLeaf(v: any): any {
  if (v instanceof Date) return v.toISOString();
  if (isObjectIdLike(v)) return v.toString();
  if (Buffer.isBuffer(v)) return `0x${v.toString('hex')}`;
  return v;
}

function flattenObject(obj: any, prefix = '', forCompare = false, out: Record<string, any> = {}): Record<string, any> {
  if (obj == null || typeof obj !== 'object' || obj instanceof Date) {
    const val = forCompare ? normalizeLeaf(obj) : obj;
    if (prefix) out[prefix] = val;
    return out;
  }
  if (Array.isArray(obj)) {
    // Treat arrays as scalars for updates (set whole array)
    const val = forCompare ? JSON.stringify(obj.map(normalizeLeaf)) : obj;
    if (prefix) out[prefix] = val;
    return out;
  }
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !(v instanceof Date) && !Buffer.isBuffer(v) && !isObjectIdLike(v) && !Array.isArray(v)) {
      flattenObject(v, path, forCompare, out);
    } else {
      out[path] = forCompare ? normalizeLeaf(v) : v;
    }
  }
  return out;
}

export const createFacebookSession = async (req: Request, res: Response) => {
    try {
        const { sessionName, sessionData, c_name, user_id, user_name, branch } = req.body;
        if (!sessionName) {
            res.status(400).json({ message: "sessionName is required" });
            return;
        }
        console.log("Body recibido en createFacebookSession:", req.body);
        const conn = await getConnectionByCompanySlug(c_name);
        console.log("Conexión obtenida");
        const FacebookSession = getSessionModel(conn);
        console.log("Modelo de sesión obtenido");
        const IAConfig = getIaConfigModel(conn);
        console.log("Modelo de IAConfig obtenido");
        const existingSession = await FacebookSession.findOne({ name: sessionName, platform: 'facebook' });
        console.log("Búsqueda de sesión existente terminada");

        if (existingSession) {
            res.status(200).json({
                message: "A session with this name already exists",
            });
        } else {
            try {
                const defaultIAConfig = await IAConfig.findOne({ type: "general" });

                const sessionDataToSave: any = {
                    name: sessionName,
                    user: { id: user_id, name: user_name },
                    platform: 'facebook',
                    sessionData,
                    IA: { id: defaultIAConfig?._id, name: defaultIAConfig?.name },
                };

                // NUEVO: Validar y agregar información de sucursal si está presente
                if (branch && branch.branchId) {
                    const Branch = getBranchModel(conn);
                    const foundBranch = await Branch.findById(branch.branchId);
                    
                    if (foundBranch) {
                        sessionDataToSave.branch = {
                            companyId: foundBranch.companyId,
                            branchId: foundBranch._id,
                            name: foundBranch.name,
                            code: foundBranch.code
                        };
                        console.log("✅ Sucursal agregada a la sesión Facebook:", foundBranch.name, `(${foundBranch.code})`);
                    } else {
                        console.log("⚠️ Sucursal no encontrada con ID:", branch.branchId);
                    }
                }

                const newSession = new FacebookSession(sessionDataToSave);

                await newSession.save();

                const config = {
                    companyDb: c_name,
                    session: newSession,
                };

                await loadRecentFacebookMessages(config);

                res.status(201).json({ message: `Facebook session '${sessionName}' created` });
            } catch (error) {
                console.error("Error creando sesión de Facebook:", error);
                res.status(500).json({ message: "Error creating Facebook session", error });
            }
        }
    } catch (error) {
        console.error("Error general en createFacebookSession:", error);
        res.status(500).json({ message: "Error creating Facebook session", error });
    }
};

export const updateFacebookSession = async (req: Request, res: Response) => {
    try {
        const { c_name } = req.params;
        const updates = req.body;
        const conn = await getConnectionByCompanySlug(c_name);
  const FacebookSession = getSessionModel(conn);

        // NUEVO: Manejar actualización de branch
        if (updates.branch) {
            if (updates.branch.branchId) {
                // Validar y obtener información completa de la sucursal
                const Branch = getBranchModel(conn);
                const foundBranch = await Branch.findById(updates.branch.branchId);
                
                if (foundBranch) {
                    updates.branch = {
                        companyId: foundBranch.companyId,
                        branchId: foundBranch._id,
                        name: foundBranch.name,
                        code: foundBranch.code
                    };
                    console.log("✅ Branch actualizado en sesión Facebook:", foundBranch.name, `(${foundBranch.code})`);
                } else {
                    res.status(400).json({ message: "Branch not found", branchId: updates.branch.branchId });
                    return;
                }
            } else if (updates.branch === null) {
                // Permitir remover branch enviando null
                updates.branch = null;
                console.log("✅ Branch removido de sesión Facebook");
            }
        }

    // Fetch current to compute diff
    const current = await FacebookSession.findOne({ _id: updates._id, platform: 'facebook' }).lean();
    if (!current) {
      res.status(404).json({ message: "Session not found" });
      return;
    }

    // Remove _id from updates and build ops
    const { _id, ...bodyNoId } = updates || {};
    const flatNew = flattenObject(bodyNoId, '', false);
    const flatNewCmp = flattenObject(bodyNoId, '', true);
    const flatCurCmp = flattenObject(current, '', true);
    const $set: Record<string, any> = {};
    const $unset: Record<string, any> = {};
    for (const [path, valCmp] of Object.entries(flatNewCmp)) {
      const rawVal = flatNew[path];
      if (rawVal === null) {
        $unset[path] = 1;
        continue;
      }
      const curVal = getAt(flatCurCmp, path) ?? flatCurCmp[path];
      if (JSON.stringify(curVal) !== JSON.stringify(valCmp)) {
        $set[path] = rawVal;
      }
    }

    const updateOps: any = {};
    if (Object.keys($set).length) updateOps.$set = $set;
    if (Object.keys($unset).length) updateOps.$unset = $unset;

    if (!Object.keys(updateOps).length) {
      res.status(200).json({ message: "No changes detected", session: current });
      return;
    }

    // Build audit context if we can resolve a user
    let fbUserId: string | undefined = (req.params as any).userId || updates?.user?.id || updates?.user_id;
    let fbUserName: string | undefined = undefined;
    if (fbUserId) {
      try {
        const User = getUserModel(conn);
        const u = await User.findById(fbUserId).lean();
        fbUserName = u?.name;
      } catch {}
    }

    const fbAuditContext = fbUserId
      ? {
          _updatedByUser: { id: fbUserId, name: fbUserName },
          _updatedBy: fbUserId,
          _auditSource: 'API',
          _requestId: (req.headers['x-request-id'] as string) || undefined,
          ip: req.ip,
          userAgent: req.get('user-agent') || undefined,
        }
      : undefined;

    const session = await FacebookSession.findOneAndUpdate(
      { _id: updates._id, platform: 'facebook' },
      updateOps,
      { new: true, context: 'query' } as any
    ).setOptions(
      fbAuditContext
        ? ({ auditContext: fbAuditContext, $locals: { auditContext: fbAuditContext } } as any)
        : ({} as any)
    );

        if (!session) {
            res.status(404).json({ message: "Session not found" });
            return;
        }

        // Si el update incluye cambio de nombre, actualiza todos los FacebookChat con ese session.id
        if (typeof updates.name === 'string') {
            try {
                const FacebookChat = getFacebookChatModel(conn);
                await FacebookChat.updateMany(
                    { 'session.id': updates._id },
                    { $set: { 'session.name': updates.name } }
                );
            } catch (err) {
                console.error('Error actualizando session.name en FacebookChat:', err);
            }
        }

        res.status(200).json({ message: "Session updated successfully", session });
    } catch (error) {
        res.status(500).json({ message: "Error updating Facebook session", error });
    }
};

export const getAllFacebookSessions = async (req: Request, res: Response) => {
  try {
    const { c_name, user_id } = req.params;
    const includeHistory = String((req.query.includeHistory as any) || '').toLowerCase() === 'true';
    const historyLimit = Number(req.query.historyLimit || 5);

    const conn = await getConnectionByCompanySlug(c_name);

    const UserConfig = getUserModel(conn);

    const user = await UserConfig.findById(user_id);
    if (!user) {
      res.status(404).json({ message: "Usuario no encontrado." });
      return;
    }

    const FacebookSession = getSessionModel(conn);

    let sessions;

    if (user.role !== "Administrador") {
      sessions = await FacebookSession.find({ "user.id": user_id, platform: 'facebook' });
    } else {
      sessions = await FacebookSession.find({ platform: 'facebook' });
    }

    if (includeHistory) {
      sessions = await attachHistoryToData(conn, sessions, 'Session', Number.isFinite(historyLimit) ? historyLimit : 5);
    }

    res.status(200).json(sessions);
  } catch (error) {
    res.status(500).json({ message: "Error getting all Facebook sessions", error });
  }
};

export const deleteFacebookSession = async (req: Request, res: Response) => {
  try {
    const { c_name, sessionId } = req.params;

    const conn = await getConnectionByCompanySlug(c_name);

    const FacebookSession = getSessionModel(conn);
    const session = await FacebookSession.findByIdAndDelete(sessionId);

    if (!session) {
      res.status(404).json({ message: "Session not found" });
      return;
    }

    const FacebookChat = getFacebookChatModel(conn);
    await FacebookChat.deleteMany({ 'session.id': sessionId });

    res.status(200).json({ message: "Session and related Facebook chats deleted successfully" });
  } catch (error) {
    console.error("Error deleting Facebook session:", error);
    res.status(500).json({ message: "Error deleting Facebook session", error });
  }
};

export const createWhatsappSession = async (req: Request, res: Response) => {
  const { sessionName, c_name, user_id, user_name, branch } = req.body;
  if (!sessionName) {
    res.status(400).json({ message: "sessionName is required" });
    return;
  }
  console.log("Body recibido en createWhatsappSession:", req.body);
  const conn = await getConnectionByCompanySlug(c_name);
  console.log("Conexión obtenida");
  const WhatsappSession = getSessionModel(conn);
  console.log("Modelo de sesión obtenido");
  const IAConfig = getIaConfigModel(conn);
  console.log("Modelo de IAConfig obtenido");
  const existingSession = await WhatsappSession.findOne({ name: sessionName });
  console.log("Búsqueda de sesión existente terminada");

  if (existingSession) {
    await startWhatsappBot(sessionName, c_name, user_id);
    res
      .status(200)
      .json({
        message: "A session with this name already exists, only sending new QR",
      });
  } else {
    try {
      // Espera a que la sesión esté lista antes de guardar en la base de datos
      const client = await startWhatsappBot(sessionName, c_name, user_id);

      const defaultIAConfig = await IAConfig.findOne({ type: "general" }); // Obtiene el prompt general por defecto

      const sessionData: any = {
        name: sessionName,
        user: { id: user_id, name: user_name },
        phone: client.info.wid._serialized || '',
        IA: { id: defaultIAConfig?._id, name: defaultIAConfig?.name },
      };

      // NUEVO: Validar y agregar información de sucursal si está presente
      if (branch && branch.branchId) {
        const Branch = getBranchModel(conn);
        const foundBranch = await Branch.findById(branch.branchId);
        
        if (foundBranch) {
          sessionData.branch = {
            companyId: foundBranch.companyId,
            branchId: foundBranch._id,
            name: foundBranch.name,
            code: foundBranch.code
          };
          console.log("✅ Sucursal agregada a la sesión WhatsApp:", foundBranch.name, `(${foundBranch.code})`);
        } else {
          console.log("⚠️ Sucursal no encontrada con ID:", branch.branchId);
        }
      }

      const newSession = new WhatsappSession(sessionData);

      await newSession.save();
      res.status(201).json({ message: `Session '${sessionName}' started` });
    } catch (error) {
      console.error("Error creando sesión:", error);
      res.status(500).json({ message: "Error creating session", error: error });
    }
  }
};

export const getAllWhatsappSessions = async (req: Request, res: Response) => {
  try {
    const { c_name, user_id } = req.params;
    const includeHistory = String((req.query.includeHistory as any) || '').toLowerCase() === 'true';
    const historyLimit = Number(req.query.historyLimit || 5);

    const conn = await getConnectionByCompanySlug(c_name);

    const UserConfig = getUserModel(conn);

    const user = await UserConfig.findById(user_id);
    if (!user) {
      res.status(404).json({ message: "Usuario no encontrado." });
      return;
    }

    const WhatsappSession = getSessionModel(conn);

    let sessions;

    if (user.role !== "Administrador") {
      sessions = await WhatsappSession.find({ "user.id": user_id, platform: { $ne: 'facebook' } });
    } else {
      sessions = await WhatsappSession.find({ platform: { $ne: 'facebook' } });
    }

    if (includeHistory) {
      sessions = await attachHistoryToData(conn, sessions, 'Session', Number.isFinite(historyLimit) ? historyLimit : 5);
    }

    res.status(200).json(sessions);
  } catch (error) {
    res.status(500).json({ message: "Error fetching sessions", error });
  }
};

export const updateWhatsappSession = async (req: Request, res: Response) => {
  const { c_name, userId } = req.params;
  const updates = req.body;

  try {
    const conn = await getConnectionByCompanySlug(c_name);

    // NUEVO: Manejar actualización de branch
    if (updates.branch) {
      if (updates.branch.branchId) {
        // Validar y obtener información completa de la sucursal
        const Branch = getBranchModel(conn);
        const foundBranch = await Branch.findById(updates.branch.branchId);
        
        if (foundBranch) {
          updates.branch = {
            companyId: foundBranch.companyId,
            branchId: foundBranch._id,
            name: foundBranch.name,
            code: foundBranch.code
          };
          console.log("✅ Branch actualizado en sesión WhatsApp:", foundBranch.name, `(${foundBranch.code})`);
        } else {
          res.status(400).json({ message: "Branch not found", branchId: updates.branch.branchId });
          return;
        }
      } else if (updates.branch === null) {
        // Permitir remover branch enviando null
        updates.branch = null;
        console.log("✅ Branch removido de sesión WhatsApp");
      }
    }

    // Si el update es a status, verifica la sesión en .wwebjs_auth
    if (Object.prototype.hasOwnProperty.call(updates, 'status')) {
      // Obtener el nombre de la sesión
      let sessionName = updates.name;
      if (!sessionName) {
        // Si no viene en el update, buscar en la base de datos
        const WhatsappSessionTmp = getSessionModel(conn);
        const found = await WhatsappSessionTmp.findById(updates._id);
        sessionName = found?.name;
      }
      // Construir ruta de la sesión
      const getAuthDir = () => {
        if (process.env.RENDER === 'true') {
          return '/var/data/.wwebjs_auth';
        }
        return path.join(process.cwd(), '.wwebjs_auth');
      };
      const authDir = getAuthDir();
      const sessionFolder = path.join(authDir, `session-${c_name.toLowerCase()}_${sessionName.toLowerCase()}`);
      // Verificar existencia y validez
      if (!fs.existsSync(sessionFolder)) {
        console.log(`No se encontró la carpeta de sesión en: ${sessionFolder}`);
        res.status(400).json({ message: `No se encontró la carpeta de sesión en: ${sessionFolder}` });
        return;
      }
      // Mejor validación: aceptar si existe 'session.json', 'creds.json' o 'Default' y es parseable
      const files = fs.readdirSync(sessionFolder);
      let valid = false;
      if (files.includes('Default')) {
        // Validación flexible para sesiones modernas
        const defaultDir = path.join(sessionFolder, 'Default');
        if (!fs.lstatSync(defaultDir).isDirectory()) {
          console.log(`'Default' no es una carpeta en: ${sessionFolder}`);
          res.status(400).json({ message: `'Default' no es una carpeta en: ${sessionFolder}` });
          return;
        }
        const defaultFiles = fs.readdirSync(defaultDir);
        // Archivos/carpetas válidos para sesión moderna
        const validFilesOrDirs = ['Cookies', 'Cookies-journal', 'Local Storage', 'IndexedDB'];
        const hasAny = defaultFiles.some(f => validFilesOrDirs.includes(f));
        if (!hasAny) {
          console.log(`La carpeta Default no contiene archivos/carpetas válidos en: ${defaultDir}`);
          res.status(400).json({ message: `La carpeta Default no contiene archivos/carpetas válidos en: ${defaultDir}` });
          return;
        }
        valid = true;
      }
      if (!valid) {
        console.log(`La carpeta de sesión existe pero no contiene archivos de sesión válidos en: ${sessionFolder}`);
        res.status(400).json({ message: `La carpeta de sesión existe pero no contiene archivos de sesión válidos en: ${sessionFolder}` });
        return;
      }
    }

    const WhatsappSession = getSessionModel(conn);
    const current = await WhatsappSession.findOne({ _id: updates._id }).lean();
    if (!current) {
      res.status(404).json({ message: "Session not found" });
      return;
    }

    const { _id, ...bodyNoId } = updates || {};
    const flatNew = flattenObject(bodyNoId, '', false);
    const flatNewCmp = flattenObject(bodyNoId, '', true);
    const flatCurCmp = flattenObject(current, '', true);
    const $set: Record<string, any> = {};
    const $unset: Record<string, any> = {};
    for (const [path, valCmp] of Object.entries(flatNewCmp)) {
      const rawVal = flatNew[path];
      if (rawVal === null) {
        $unset[path] = 1;
        continue;
      }
      const curVal = getAt(flatCurCmp, path) ?? flatCurCmp[path];
      if (JSON.stringify(curVal) !== JSON.stringify(valCmp)) {
        $set[path] = rawVal;
      }
    }

    const updateOps: any = {};
    if (Object.keys($set).length) updateOps.$set = $set;
    if (Object.keys($unset).length) updateOps.$unset = $unset;

    if (!Object.keys(updateOps).length) {
      res.status(200).json({ message: "No changes detected", session: current });
      return;
    }

    const User = getUserModel(conn);
    const user = await User.findById(userId).lean();

    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    // Contexto para plugin de auditoría: pásalo en las opciones de la query
    const auditContext = {
      _updatedByUser: { id: userId, name: user?.name },
      _updatedBy: userId,
      _auditSource: 'API',
      _requestId: (req.headers['x-request-id'] as string) || undefined,
      ip: req.ip,
      userAgent: req.get('user-agent') || undefined,
    };

    const session = await WhatsappSession.findOneAndUpdate(
      { _id: updates._id },
      updateOps,
      { new: true, context: 'query' } as any
    ).setOptions({ auditContext, $locals: { auditContext } } as any);

    if (!session) {
      res.status(404).json({ message: "Session not found" });
      return;
    }

    res.status(200).json({ message: "Session updated", session });
  } catch (error) {
    console.error("Error updating WhatsApp session:", error);
    res.status(500).json({ message: "Error updating session", error });
  }
};

export const deleteWhatsappSession = async (req: Request, res: Response) => {
  const { c_name, sessionId } = req.params;

  const conn = await getConnectionByCompanySlug(c_name);

  const WhatsappSession = getSessionModel(conn);
  const session = await WhatsappSession.findByIdAndDelete(sessionId);

  if (!session) {
    res.status(404).json({ message: "Session not found" });
    return;
  }

  // Cierra el cliente si existe
  if (clients[`${c_name}:${session.name}`]) {
    try {
      await clients[`${c_name}:${session.name}`].destroy();
      delete clients[`${c_name}:${session.name}`];
    } catch (err) {
      console.error("Error closing WhatsApp client:", err);
    }
  }

  // Ahora intenta borrar la carpeta
  try {
    // Usar la misma lógica de rutas que en el servicio de WhatsApp
    const getAuthDir = () => {
      if (process.env.RENDER === 'true') {
        return '/var/data/.wwebjs_auth';
      }
      return path.join(process.cwd(), '.wwebjs_auth');
    };
    
    const authDir = getAuthDir();
    const sessionFolder = path.join(authDir, `session-${c_name}-${session.name}`);
    
    console.log(`🗑️ Intentando eliminar sesión de: ${sessionFolder}`);
    
    if (fs.existsSync(sessionFolder)) {
      fs.rmSync(sessionFolder, { recursive: true, force: true });
      console.log(`✅ Sesión eliminada de: ${sessionFolder}`);
    } else {
      console.log(`⚠️ No se encontró carpeta de sesión en: ${sessionFolder}`);
    }
  } catch (err) {
    console.error("Error deleting session folder:", err);
  }

  res.status(200).json({ message: "Session deleted" });
};