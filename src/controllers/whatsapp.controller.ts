import { Request, Response } from "express";
import { startWhatsappBot, clients, blockSession, unblockSession, isSessionBlocked } from "../services/whatsapp/index";
import { getSessionModel } from "../models/session.model";
import { getConnectionByCompanySlug } from "../config/connectionManager";
import { getWhatsappChatModel } from "../models/whatsappChat.model";
import getUserModel from "../core/users/user.model";
import getRecordModel from "../models/record.model";
import { Message, MessageMedia } from "whatsapp-web.js";
import fs from "node:fs";
import path from "node:path";
import axios from "axios";

// Obtiene todos los mensajes de todos los chats
export const getAllWhatsappMessages = async (req: Request, res: Response) => {
  try {
    const { c_name } = req.params;
    const conn = await getConnectionByCompanySlug(c_name);
    const WhatsappChat = getWhatsappChatModel(conn);

    const chats = await WhatsappChat.find({});
    res.status(200).json(chats);
  } catch (error) {
    res.status(500).json({ message: "Error fetching messages", error });
  }
};

// Obtiene usuarios de múltiples tablas con su último mensaje de WhatsApp
export const getWhatsappUsers = async (req: Request, res: Response) => {
  try {
    const { c_name, user_id } = req.params;
    const { tableSlugs } = req.query;
    
    if (!tableSlugs) {
      res.status(400).json({ error: "tableSlugs query param is required" });
      return;
    }
    
    const slugs = (tableSlugs as string).split(",").map(s => s.trim()).filter(Boolean);
    const conn = await getConnectionByCompanySlug(c_name);
    const WhatsappChat = getWhatsappChatModel(conn);

    const UserConfig = getUserModel(conn);
    const user = await UserConfig.findById(user_id);

    let chats

    if (user.role == "Administrador") {
      chats = await WhatsappChat.find({ tableSlug: { $in: slugs } }).lean();
    } else {
      const WhatsappSession = getSessionModel(conn);
      const userSessions = await WhatsappSession.find({ "user.id": user_id });
      // Buscar directamente en WhatsappChat por tableSlug
      chats = await WhatsappChat.find({ tableSlug: { $in: slugs }, "session.id": { $in: userSessions.map(session => session.id) } }).lean();
    }

    // Mapear los chats a usuarios con su último mensaje
    const usuarios = chats.map((chat: any) => {
      let lastMessage = null;
      let totalMessages = 0;
      let unreadMessages = 0;
      
      if (chat.messages && chat.messages.length > 0) {
        totalMessages = chat.messages.length;
        // Obtener el último mensaje del array
        const lastMsg = chat.messages[chat.messages.length - 1] as any;
        lastMessage = {
          body: lastMsg.body,
          direction: lastMsg.direction,
          respondedBy: lastMsg.respondedBy,
          date: lastMsg.createdAt || new Date(),
          _id: lastMsg._id
        };
        unreadMessages = chat.messages.filter((msg: any) => msg.status !== 'leído' && msg.direction === 'inbound').length;
      }
      
      // Limpiar el número de teléfono (remover @c.us si existe)
      const cleanPhone = (chat.phone || '').replace('@c.us', '');
      
      return {
        _id: chat._id,
        name: chat.name || '',
        phone: cleanPhone, // Número limpio sin @c.us
        phoneWithSuffix: chat.phone || '', // Número completo con @c.us para compatibilidad
        lastMessage,
        tableSlug: chat.tableSlug,
        botActive: chat.botActive || false,
        totalMessages,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        session: {
          id: chat.session?.id,
          name: chat.session?.name
        },
        unreadMessages
      };
    });
    
    res.status(200).json({
      success: true,
      usuarios,
      total: usuarios.length,
      tables: slugs
    });
  } catch (error) {
    console.error("❌ Error obteniendo usuarios de WhatsApp:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Obtiene un usuario específico por número de teléfono
export const getWhatsappUserByPhone = async (req: Request, res: Response) => {
  try {
    const { c_name, sessionId, phone } = req.params;
    const conn = await getConnectionByCompanySlug(c_name);
    const WhatsappChat = getWhatsappChatModel(conn);
    
    // Limpiar el número de teléfono (remover @c.us si existe)
    const cleanPhone = phone.replace('@c.us', '');
    
    // Buscar por número limpio o con sufijo
    const chat = await WhatsappChat.findOne({
      $or: [
        { phone: cleanPhone },
        { phone: `${cleanPhone}@c.us` }
      ],
      "session.id": sessionId
    }).lean();
    
    if (!chat) {
      res.status(404).json({ 
        success: false,
        error: "Usuario no encontrado",
        phone: cleanPhone,
        suggestion: "Verifica que el número sea correcto"
      });
      return;
    }
    
    let lastMessage = null;
    let totalMessages = 0;
    
    if (chat.messages && chat.messages.length > 0) {
      totalMessages = chat.messages.length;
      // Obtener el último mensaje del array
      const lastMsg = chat.messages[chat.messages.length - 1] as any;
      lastMessage = {
        body: lastMsg.body,
        direction: lastMsg.direction,
        respondedBy: lastMsg.respondedBy,
        date: lastMsg.createdAt || new Date(),
        _id: lastMsg._id
      };
    }
    
    // Limpiar el número de teléfono para la respuesta
    const cleanPhoneResponse = (chat.phone || '').replace('@c.us', '');
    
    const usuario = {
      _id: chat._id,
      name: chat.name || '',
      phone: cleanPhoneResponse, // Número limpio sin @c.us
      phoneWithSuffix: chat.phone || '', // Número completo con @c.us para compatibilidad
      lastMessage,
      tableSlug: chat.tableSlug,
      botActive: chat.botActive || false,
      totalMessages,
      createdAt: (chat as any).createdAt,
      updatedAt: (chat as any).updatedAt
    };
    
    res.status(200).json({
      success: true,
      usuario
    });
  } catch (error) {
    console.error("❌ Error obteniendo usuario por teléfono:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};


export const MessageToAll = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { messageAll } = req.body;
  const { c_name, sessionId } = req.params;

  const conn = await getConnectionByCompanySlug(c_name);

  const WhatsappSession = getSessionModel(conn);
  const session = await WhatsappSession.findById(sessionId);
  if (!session) {
    res.status(404).json({ message: "Session not found" });
    return;
  }
  const whatsappClient = clients[`${c_name}:${session.name}`];

  try {
    const chats = await whatsappClient.getChats();
    const nonGroups = chats.filter((chat) => !chat.isGroup);
    console.log(`Number of chats: ${chats.length}`);
    nonGroups.forEach((chat) => {
      console.log(`Chat ID: ${chat.id._serialized}`);
      console.log("Se envio el siguiente mensaje: ", messageAll);
      whatsappClient.sendMessage(chat.id._serialized, messageAll);
    });
  } catch (error) {
    console.error("Error getting chats:", error);
  }
};

// Save an uploaded in-memory file to disk under src/media/files and return the file path
function saveUploadedToDisk(file: Express.Multer.File): string {
  const baseDir = path.join(process.cwd(), "src", "media", "files");
  if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
  const safeName = file.originalname?.replace(/[^a-zA-Z0-9._-]/g, "_") || `upload_${Date.now()}`;
  const filePath = path.join(baseDir, `${Date.now()}-${safeName}`);
  fs.writeFileSync(filePath, file.buffer);
  return filePath;
}

// Download a URL to disk in src/media/files and return the file path
async function downloadUrlToDisk(url: string): Promise<string> {
  const baseDir = path.join(process.cwd(), "src", "media", "files");
  if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
  // Try to infer filename from URL
  const urlPath = new URL(url).pathname;
  const urlName = path.basename(urlPath) || `download_${Date.now()}`;
  const cleanName = urlName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const targetPath = path.join(baseDir, `${Date.now()}-${cleanName}`);
  const resp = await axios.get<ArrayBuffer>(url, { responseType: "arraybuffer" });
  fs.writeFileSync(targetPath, Buffer.from(resp.data));
  return targetPath;
}

export const sendWhatsappMessage = async (req: Request, res: Response) => {
  try {
    const { c_name, sessionId } = req.params;
    let { phone, message, attachment, type, data } = req.body;
    const uploaded: Express.Multer.File | undefined = (req as any).file;

    if (data) {
      phone = data.phone
      message = data.message
      type = 'AI-tool'
    }

    const conn = await getConnectionByCompanySlug(c_name);

    const WhatsappSession = getSessionModel(conn);

    const session = await WhatsappSession.findById(sessionId);

    if (type === "massive" || type === "AI-tool") {
      blockSession(c_name, session.name, phone);
    }

    if (!session) {
      res.status(404).json({ message: "Session not found" });
      return;
    }

    let sentMessage: Message;

    if (uploaded) {
      // Received as multipart file from frontend
      const filePath = saveUploadedToDisk(uploaded);
      const media = await MessageMedia.fromFilePath(filePath);
      sentMessage = await clients[`${c_name}:${session.name}`].sendMessage(phone, media, { caption: message });
      fs.unlinkSync(filePath); // Eliminar archivo temporal
    } else if (typeof attachment === "string" && attachment.trim().length > 0) {
      // If it's a URL, download it locally first, then send via file path
      const isHttp = /^https?:\/\//i.test(attachment);
      const filePath = isHttp ? await downloadUrlToDisk(attachment) : attachment;
      const media = await MessageMedia.fromFilePath(filePath);
      sentMessage = await clients[`${c_name}:${session.name}`].sendMessage(phone, media, { caption: message });
      fs.unlinkSync(filePath); // Eliminar archivo temporal
    } else {
      sentMessage = await clients[`${c_name}:${session.name}`].sendMessage(phone, message);
    }

    if (type === "massive") {
      const newMessage = {
        msgId: sentMessage.id?.id,
        direction: "outbound-massive-api",
        body: sentMessage.body,
        respondedBy: "human",
        status: 'enviado'
      } as any;
      const WhatsappChat = getWhatsappChatModel(conn);
      await WhatsappChat.findOneAndUpdate(
        {
          'session.name': session.name,
          $or: [
            { phone: Number(phone.replace('@c.us', '')) },
            { phone: phone }
          ]
        },
        { $push: { messages: newMessage } },
        { upsert: true }
      );
      unblockSession(c_name, session.name, phone);
    } else if (type === "AI-tool") {
      const newMessage = {
        msgId: sentMessage.id?.id,
        direction: "outbound-ai-tool",
        body: sentMessage.body,
        respondedBy: "AI",
        status: 'enviado'
      } as any;
      const WhatsappChat = getWhatsappChatModel(conn);
      await WhatsappChat.findOneAndUpdate(
        {
          'session.name': session.name,
          $or: [
            { phone: Number(phone.replace('@c.us', '')) },
            { phone: phone }
          ]
        },
        { $push: { messages: newMessage } },
        { upsert: true }
      );
      unblockSession(c_name, session.name, phone);
    }

    res.status(200).json({ message: "Message sent" });
  } catch (error) {
    res.status(500).json({ message: "Error fetching messages", error });
  }
};

// Obtiene el historial de mensajes de un usuario específico (por número limpio o con @c.us)
export const getChatMessages = async (req: Request, res: Response) : Promise<void> => {
  try {
    const { c_name, sessionId, phone } = req.params;
    const conn = await getConnectionByCompanySlug(c_name);
    const WhatsappChat = getWhatsappChatModel(conn);

    // Buscar por número limpio o con sufijo
    const cleanPhone = phone.replace('@c.us', '');
    const chat = await WhatsappChat.findOne({
      $or: [
        { phone: cleanPhone },
        { phone: `${cleanPhone}@c.us` }
      ],
      "session.id": sessionId
    }).lean();

    if (!chat) {
       res.status(404).json({ message: "Chat no encontrado", phone });
       return
    }

    res.status(200).json({
      success: true,
      chat: {
        _id: chat._id,
        phone: chat.phone,
        name: chat.name,
        botActive: chat.botActive,
        messages: chat.messages || [],
        totalMessages: chat.messages?.length || 0,
        createdAt: (chat as any).createdAt,
        updatedAt: (chat as any).updatedAt
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching chat messages", error });
  }
};

export async function enviarFichaTecnica(req: Request, res: Response): Promise<any> {
  try {
    const { propertyId, phoneNumber, company, sessionName } = req.body;

    if (company !== 'grupokg') {
      return res.status(403).json({ success: false, message: 'Solo disponible para grupokg' });
    }
    if (!propertyId || !phoneNumber) {
      return res.status(400).json({ success: false, message: 'propertyId y phoneNumber son requeridos' });
    }

    // Obtener la propiedad
    const conn = await getConnectionByCompanySlug(company);
    const Record = getRecordModel(conn);
    const propiedad = await Record.findById(propertyId);
    if (!propiedad || !propiedad.data.link_ficha_tecnica) {
      return res.status(404).json({ success: false, message: 'No se encontró el link de la ficha técnica' });
    }
    const link = propiedad.data.link_ficha_tecnica;
    const mensaje = `¡Gracias por tu interés! Aquí tienes la ficha técnica de la propiedad: ${link}`;

    // Enviar mensaje por WhatsApp Web
    const { clients } = require('./index');
    const clientKey = `${company}:${sessionName}`;
    const client = clients[clientKey];
    if (!client) {
      return res.status(500).json({ success: false, message: 'No se encontró la sesión de WhatsApp activa' });
    }

    await client.sendMessage(`${phoneNumber}@c.us`, mensaje);
    return res.json({ success: true, message: 'Ficha técnica enviada exitosamente', link });
  } catch (error) {
    console.error('===> [enviarFichaTecnica] Error enviando ficha técnica:', error);
    return res.status(500).json({ success: false, message: 'Error interno al enviar ficha técnica' });
  }
}

// Permite asignación manual específica
export async function assignChatToAdvisor(req: Request, res: Response): Promise<void> {
  try {
    const { c_name } = req.params;
    const { data, updatedBy } = req.body; // { sessionId, number, advisorId?, isVisibleToAll? }

    const conn = await getConnectionByCompanySlug(c_name);
    const Record = getRecordModel(conn);
    const UserConfig = getUserModel(conn);
    const Session = getSessionModel(conn);

    // Si no se especifica advisorId, desasignar (poner null)
    let advisor = null;
    
    // Obtener la sesión para validar branch
    const targetSession = await Session.findById(data.sessionId).lean();
    if (!targetSession) {
      res.status(404).json({ 
        success: false, 
        message: "Sesión no encontrada" 
      });
      return;
    }
    
    if (data.advisorId) {
      // Buscar el asesor específico
      const targetUser = await UserConfig.findById(data.advisorId).lean();
      
      if (!targetUser || targetUser.role !== 'Asesor') {
        res.status(404).json({ 
          success: false, 
          message: "Asesor no encontrado o no válido" 
        });
        return;
      }

      // ✅ VALIDAR QUE EL ASESOR TENGA LA MISMA SUCURSAL QUE LA SESIÓN
      const sessionBranchId = targetSession.branch?.branchId ? String(targetSession.branch.branchId) : null;
      const userBranchId = targetUser.branch?.branchId ? String(targetUser.branch.branchId) : null;
      
      if (sessionBranchId && userBranchId !== sessionBranchId) {
        res.status(400).json({ 
          success: false, 
          message: `El asesor ${targetUser.name} no pertenece a la sucursal ${targetSession.branch.name}. Solo se pueden asignar asesores de la misma sucursal.`,
          data: {
            advisorBranch: targetUser.branch?.name || 'Sin sucursal',
            sessionBranch: targetSession.branch?.name || 'Sin sucursal'
          }
        });
        return;
      }

      if (data.messagingService == 'twilio') {
        advisor = JSON.stringify(targetUser);
      } else {
        advisor = { id: targetUser._id, name: targetUser.name };
      }
    } else {
      // ✅ ASIGNACIÓN AUTOMÁTICA EN SECUENCIA (ROUND-ROBIN)
      const sessionBranchId = targetSession.branch?.branchId ? String(targetSession.branch.branchId) : null;
      const branchFilter = sessionBranchId
        ? { role: 'Asesor', 'branch.branchId': sessionBranchId }
        : { role: 'Asesor', $or: [{ 'branch.branchId': { $exists: false } }, { 'branch.branchId': null }] };

      // Ordenar por nombre para mantener consistencia en el orden
      const allUsers = await UserConfig.find(branchFilter).sort({ name: 1 }).lean();

      if (allUsers.length === 0) {
        const branchName = targetSession.branch?.name || 'Sin sucursal';
        res.status(404).json({ 
          success: false,
          message: `No hay asesores disponibles en la sucursal: ${branchName}`,
          data: {
            sessionBranch: branchName,
            sessionBranchId: sessionBranchId
          }
        });
        return;
      }

      // Obtener el contador actual de asignaciones para esta sucursal/sesión
      const currentCounter = targetSession.metadata?.assignmentCounter || 0;
      const nextUserIndex = currentCounter % allUsers.length;
      const selectedUser = allUsers[nextUserIndex];

      // Actualizar el contador en la sesión para la próxima asignación
      await Session.findByIdAndUpdate(
        data.sessionId,
        { 
          $set: { 
            'metadata.assignmentCounter': currentCounter + 1,
            'metadata.lastAssignmentAt': new Date(),
            'metadata.lastAssignedTo': selectedUser.name
          } 
        }
      );

      if (data.messagingService == 'twilio') {
        advisor = JSON.stringify(selectedUser);
      } else {
        advisor = { id: selectedUser._id, name: selectedUser.name };
      }
      
      console.log(`🔄 Asignación secuencial: Usuario ${nextUserIndex + 1}/${allUsers.length} - ${selectedUser.name} (Contador: ${currentCounter + 1})`);
    }

    const auditContext = {
      _updatedByUser: { id: 'Bot', name: updatedBy },
      _updatedBy: updatedBy,
      _auditSource: 'API',
      _requestId: (req.headers['x-request-id'] as string) || undefined,
      ip: req.ip,
      userAgent: req.get('user-agent') || undefined,
    };

    // Actualizar el chat con el asesor asignado (o null para desasignar)
    const chat = await Record.findOneAndUpdate(
      { $or: [
        { "data.number": Number(data.number) },
        { "data.telefono": data.number }] },
      {
        $set: {
          'data.asesor': advisor,
          'data.isVisibleToAll': data.isVisibleToAll || false,
          'data.assignedAt': new Date(),
          'data.assignedBy': 'system'
        }
      },
      { new: true, context: 'query' } as any
    ).setOptions({ auditContext, $locals: { auditContext } } as any).lean();

    if (!chat) {
      res.status(404).json({ 
        success: false, 
        message: "Prospecto no encontrado", 
        data: { phone: data.number } 
      });
      return;
    }

    const message = advisor 
      ? `Prospecto asignado correctamente a ${advisor.name}`
      : 'Prospecto desasignado correctamente';

    res.status(200).json({
      success: true,
      message,
      data: {
        phone: data.number,
        advisor: advisor,
        isVisibleToAll: data.isVisibleToAll || false
      }
    });
    
  } catch (error) {
    console.error("Error assigning Prospecto:", error);
    res.status(500).json({ 
      success: false, 
      message: "Error al asignar Prospecto", 
      error 
    });
  }
}

// Endpoint para obtener todos los asesores disponibles
export async function getAvailableAdvisors(req: Request, res: Response): Promise<void> {
  try {
    const { c_name } = req.params;
    
    const conn = await getConnectionByCompanySlug(c_name);
    const UserConfig = getUserModel(conn);
    
    const advisors = await UserConfig.find({ 
      role: 'Asesor',
      status: { $ne: 'inactive' } // Excluir usuarios inactivos
    })
    .select('name email role')
    .sort({ name: 1 })
    .lean();

    res.status(200).json({
      success: true,
      data: advisors.map(advisor => ({
        id: advisor._id.toString(),
        name: advisor.name,
        email: advisor.email,
        role: advisor.role
      }))
    });
    
  } catch (error) {
    console.error("Error getting advisors:", error);
    res.status(500).json({ 
      success: false, 
      message: "Error al obtener asesores" 
    });
  }
}

// Endpoint para obtener chats con filtros por permisos
export async function getFilteredChats(req: Request, res: Response): Promise<void> {
  try {
    const { c_name } = req.params;
    const { showAll, userId, userRole } = req.query; // Obtener desde query parameters
    
    // Validar que se proporcionen los parámetros necesarios
    if (!userId || !userRole) {
      res.status(400).json({ 
        success: false, 
        message: 'userId y userRole son requeridos en query parameters' 
      });
      return;
    }

    const conn = await getConnectionByCompanySlug(c_name);
    const WhatsappChat = getWhatsappChatModel(conn);
    const Record = getRecordModel(conn);

    let filter: any = {};

    // Si no es admin y no quiere ver todos, filtrar por asignación
    if (userRole !== 'Administrador' && userRole !== 'Gerente') {
      filter = {
        $or: [
          { 'advisor.id': userId }, // Chats asignados al usuario
          { isVisibleToAll: true },  // Chats visibles para todos
          { advisor: { $exists: false } }, // Chats sin asignar
          { advisor: null } // Chats explícitamente desasignados
        ]
      };
    } else if (userRole === 'Administrador' && showAll !== 'true') {
      // Admin puede elegir ver solo los suyos
      filter = { 'advisor.id': userId };
    }
    // Si es admin y showAll=true, no aplicar filtro (ver todos)

    const chats = await WhatsappChat.find(filter)
      .sort({ updatedAt: -1 })
      .lean();

    // Buscar los records de prospectos que matchean con los chats
    const prospectPhones = chats
      .map(chat => {
        // Limpiar el número de teléfono para buscar
        return (chat.phone || '').replace('@c.us', '');
      });

    // Buscar los records en la tabla prospectos
    const prospectRecords = await Record.find({
      tableSlug: 'prospectos',
      'data.number': { $in: prospectPhones.map(Number) }
    }).lean();

    // Agregar información adicional a cada chat, incluyendo el record si existe
    const enrichedChats = chats.map(chat => {
      let matchedRecord = null;
      if (chat.phone) {
        const cleanPhone = chat.phone.replace('@c.us', '');
        matchedRecord = prospectRecords.find(
          record => record.data && String(record.data.number) === cleanPhone
        ) || null;
      }
      return {
        ...chat,
        prospectRecord: matchedRecord
      };
    });

    res.status(200).json({
      success: true,
      data: enrichedChats,
      total: enrichedChats.length
    });
    
  } catch (error) {
    console.error("Error getting filtered chats:", error);
    res.status(500).json({ 
      success: false, 
      message: "Error al obtener chats" 
    });
  }
}

// Endpoint para obtener todas las asignaciones de chat (sin filtros de usuario)
export async function getChatAssignments(req: Request, res: Response): Promise<void> {
  try {
    const { c_name } = req.params;
    
    const conn = await getConnectionByCompanySlug(c_name);
    const WhatsappChat = getWhatsappChatModel(conn);

    // Obtener todos los chats con información de asignación
    const chats = await WhatsappChat.find({})
      .select('phone name advisor updatedAt createdAt messages tableSlug botActive')
      .sort({ updatedAt: -1 })
      .lean();

    // Clasificar chats
    const assigned = chats.filter(chat => chat.advisor && chat.advisor.id);
    const unassigned = chats.filter(chat => !chat.advisor || !chat.advisor.id);

    // Agregar información adicional a cada chat
    const enrichedChats = chats.map(chat => ({
      _id: chat._id,
      phone: chat.phone,
      name: chat.name || 'Sin nombre',
      tableSlug: chat.tableSlug,
      botActive: chat.botActive,
      lastMessageCount: chat.messages ? chat.messages.length : 0,
      assignmentStatus: chat.advisor?.id ? 'assigned' : 'unassigned',
      advisorName: chat.advisor?.name || null,
      advisorId: chat.advisor?.id || null,
      updatedAt: (chat as any).updatedAt,
      createdAt: (chat as any).createdAt
    }));

    res.status(200).json({
      success: true,
      data: enrichedChats,
      summary: {
        total: chats.length,
        assigned: assigned.length,
        unassigned: unassigned.length
      }
    });
    
  } catch (error) {
    console.error("Error getting chat assignments:", error);
    res.status(500).json({ 
      success: false, 
      message: "Error al obtener asignaciones de chat",
      error: error.message
    });
  }
}

// NUEVO: Endpoint para obtener estadísticas de asignación secuencial por sesión
export async function getAssignmentStats(req: Request, res: Response): Promise<void> {
  try {
    const { c_name, sessionId } = req.params;
    
    const conn = await getConnectionByCompanySlug(c_name);
    const Session = getSessionModel(conn);
    const UserConfig = getUserModel(conn);
    const Record = getRecordModel(conn);

    // Obtener la sesión con metadata
    const session = await Session.findById(sessionId).lean();
    if (!session) {
      res.status(404).json({ 
        success: false, 
        message: "Sesión no encontrada" 
      });
      return;
    }

    // Obtener asesores disponibles para esta sesión
    const sessionBranchId = session.branch?.branchId ? String(session.branch.branchId) : null;
    const branchFilter = sessionBranchId
      ? { role: 'Asesor', 'branch.branchId': sessionBranchId }
      : { role: 'Asesor', $or: [{ 'branch.branchId': { $exists: false } }, { 'branch.branchId': null }] };

    const availableAdvisors = await UserConfig.find(branchFilter)
      .sort({ name: 1 })
      .select('name email')
      .lean();

    // Obtener estadísticas de asignaciones realizadas
    const totalAssignments = await Record.countDocuments({
      tableSlug: 'prospectos',
      'data.asesor.id': { $exists: true }
    });

    // Contar asignaciones por asesor
    const assignmentsByAdvisor = await Record.aggregate([
      {
        $match: {
          tableSlug: 'prospectos',
          'data.asesor.id': { $exists: true }
        }
      },
      {
        $group: {
          _id: '$data.asesor.id',
          count: { $sum: 1 },
          advisorName: { $first: '$data.asesor.name' },
          lastAssignment: { $max: '$data.assignedAt' }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    // Calcular próximo asesor en la secuencia
    const currentCounter = session.metadata?.assignmentCounter || 0;
    const nextUserIndex = availableAdvisors.length > 0 ? currentCounter % availableAdvisors.length : 0;
    const nextAdvisor = availableAdvisors[nextUserIndex] || null;

    res.status(200).json({
      success: true,
      data: {
        session: {
          id: session._id,
          name: session.name,
          branch: session.branch || null,
          assignmentCounter: session.metadata?.assignmentCounter || 0,
          lastAssignmentAt: session.metadata?.lastAssignmentAt || null,
          lastAssignedTo: session.metadata?.lastAssignedTo || null
        },
        availableAdvisors: availableAdvisors.map((advisor, index) => ({
          id: advisor._id,
          name: advisor.name,
          email: advisor.email,
          sequencePosition: index + 1,
          isNext: index === nextUserIndex
        })),
        nextAdvisor: nextAdvisor ? {
          id: nextAdvisor._id,
          name: nextAdvisor.name,
          sequencePosition: nextUserIndex + 1
        } : null,
        assignmentStats: {
          totalAssignments,
          assignmentsByAdvisor
        }
      }
    });
    
  } catch (error) {
    console.error("Error getting assignment stats:", error);
    res.status(500).json({ 
      success: false, 
      message: "Error al obtener estadísticas de asignación",
      error: error.message
    });
  }
}

// NUEVO: Endpoint para reiniciar el contador de asignación secuencial
export async function resetAssignmentCounter(req: Request, res: Response): Promise<void> {
  try {
    const { c_name, sessionId } = req.params;
    
    const conn = await getConnectionByCompanySlug(c_name);
    const Session = getSessionModel(conn);

    const session = await Session.findByIdAndUpdate(
      sessionId,
      {
        $set: {
          'metadata.assignmentCounter': 0,
          'metadata.lastAssignmentAt': null,
          'metadata.lastAssignedTo': null
        }
      },
      { new: true }
    );

    if (!session) {
      res.status(404).json({ 
        success: false, 
        message: "Sesión no encontrada" 
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Contador de asignación reiniciado",
      data: {
        sessionId: session._id,
        assignmentCounter: 0
      }
    });
    
  } catch (error) {
    console.error("Error resetting assignment counter:", error);
    res.status(500).json({ 
      success: false, 
      message: "Error al reiniciar contador de asignación"
    });
  }
}