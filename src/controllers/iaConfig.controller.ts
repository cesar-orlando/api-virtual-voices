import { Request, Response } from "express";
import getIaConfigModel, { IIaConfig } from "../models/iaConfig.model";
import { getConnectionByCompanySlug } from "../config/connectionManager";
import { generateResponse, openai, preparePrompt } from "../services/openai";
import getUserModel from "../core/users/user.model";
import getRecordModel from "../models/record.model";
import { MessagingAgentService } from "../services/agents/MessagingAgentService";
import { applyFuzzySearchToToolResult } from "../utils/fuzzyPropertySearch";
import { getWhatsappChatModel } from "../models/whatsappChat.model";
import { Agent } from "@openai/agents";
import { AgentManager } from "../services/agents/AgentManager";

// 🔥 Crear configuración inicial si no existe
export const createIAConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { c_name } = req.params;

    const {
      name,
      type = "personal",
      tone,
      objective,
      customPrompt,
      welcomeMessage,
      user
    } = req.body;

    const conn = await getConnectionByCompanySlug(c_name);

    const IaConfig = getIaConfigModel(conn);

    if (type === 'general') {
      const existingGeneral = await IaConfig.findOne({ type: 'general' });
      if (existingGeneral) {
        res.status(400).json({ message: "Ya existe una configuración de tipo 'general'." });
        return;
      }
    }
    if (type === 'interno') {
      const existingInterno = await IaConfig.findOne({ type: 'interno' });
      if (existingInterno) {
        res.status(400).json({ message: "Ya existe una configuración de tipo 'interno'." });
        return;
      }
    }

    const existing = await IaConfig.findOne({ name });
    if (existing) {
      res.status(400).json({ message: "Ya existe configuración con este nombre." });
      return;
    }

    const newConfig = new IaConfig({
      name,
      type,
      tone,
      objective,
      customPrompt,
      welcomeMessage,
      user: {
        id: user.id,
        name: user.name
      }
    });

    await newConfig.save();
    res.status(201).json({ message: "Configuración creada", config: newConfig });
  } catch (error) {
    console.error("Error al crear configuración IA:", error);
    res.status(500).json({ message: "Error al crear configuración IA" });
  }
};

export const getGeneralIAConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { c_name } = req.params;

    const conn = await getConnectionByCompanySlug(c_name);

    const IaConfig = getIaConfigModel(conn);
    const config = await IaConfig.findOne({type: 'general'});

    if (!config) {
      res.status(404).json({ message: "Configuración no encontrada." });
      return;
    }

    res.json(config);
  } catch (error) {
    res.status(500).json({ message: "Error al obtener la configuración." });
  }
};

export const getAllIAConfigs = async (req: Request, res: Response): Promise<void> => {
  try {
    const { c_name, user_id } = req.params;

    const conn = await getConnectionByCompanySlug(c_name);

    const UserConfig = getUserModel(conn);

    const user = await UserConfig.findById(user_id);

    if (!user) {
      res.status(404).json({ message: "Usuario no encontrado." });
      return;
    }

    const IaConfig = getIaConfigModel(conn);

    let configs: IIaConfig[];

    if (user.role !== "Administrador") {
      let general_configs = await IaConfig.find({type: 'general'});
      let user_configs = await IaConfig.find({ "user.id": user_id });
      configs = general_configs.concat(user_configs);
    } else {
      configs = await IaConfig.find({});
    }

    res.json(configs);
  } catch (error) {
    console.error("Error al obtener configuraciones IA:", error);
    res.status(500).json({ message: "Error al obtener configuraciones IA" });
  }
}

export const updateIAConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { c_name, user_id } = req.params;
    const updates = req.body;

    const conn = await getConnectionByCompanySlug(c_name);

    const IaConfig = getIaConfigModel(conn);
    const UserConfig = getUserModel(conn);

    const user = await UserConfig.findById(user_id);

    if (!user) {
      res.status(404).json({ message: "Usuario no encontrado." });
      return;
    }

    // Si el documento a modificar es de tipo general y usuario no es admin entonces ignorar
    const docToUpdate = await IaConfig.findOne({ _id: updates._id }, {}, { sort: { createdAt: 1 } });
    if (docToUpdate?.type === "general" && user.role !== "Administrador") {
      console.log("Intento de modificación de IaConfig general por un usuario no admin.",user);
      res.status(403).json({ message: "No se puede modificar el IaConfig general." });
      return;
    }

    if (updates.type === 'general') {
      // Allow updating the existing 'general' doc, block only if another exists
      const existingGeneral = await IaConfig.findOne({ type: 'general', _id: { $ne: updates._id } });
      if (existingGeneral) {
        res.status(400).json({ message: "Ya existe otra configuración de tipo 'general'." });
        return;
      }
    }

    if (updates.type === 'interno') {
      // Allow updating the existing 'interno' doc, block only if another exists
      const existingInterno = await IaConfig.findOne({ type: 'interno', _id: { $ne: updates._id } });
      if (existingInterno) {
        res.status(400).json({ message: "Ya existe otra configuración de tipo 'interno'." });
        return;
      }
    }

    // Si no es general o el usuario es admin, realiza la actualización normalmente
    const updatedConfig = await IaConfig.findOneAndUpdate(
      { _id: updates._id }, 
      updates, 
      { new: true, sort: { createdAt: 1 } }
    );

    if (!updatedConfig) {
      res.status(404).json({ message: "Configuración no encontrada." });
      return;
    }

    AgentManager.removeAgentsForCompany(c_name);

    res.json({ message: "Configuración actualizada", config: updatedConfig });
  } catch (error) {
    console.error("Error al actualizar configuración IA:", error);
    res.status(500).json({ message: "Error al actualizar configuración IA" });
  }
};

export const deleteIAConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { c_name, user_id, config_id } = req.params;

    const conn = await getConnectionByCompanySlug(c_name);

    const IaConfig = getIaConfigModel(conn);
    const UserConfig = getUserModel(conn);

    const user = await UserConfig.findById(user_id);

    if (!user) {
      res.status(404).json({ message: "Usuario no encontrado." });
      return;
    }

    // Si el documento a modificar es de tipo general y usuario no es admin entonces ignorar
    const docToUpdate = await IaConfig.findOne({ _id: config_id }, {}, { sort: { createdAt: 1 } });
    if (docToUpdate?.type === "general" && user.role !== "Administrador") {
      console.log("Intento de modificación de IaConfig general por un usuario no admin.",user);
      res.status(403).json({ message: "No se puede modificar el IaConfig general." });
      return;
    }

    // Si no es general o el usuario es admin, realiza la actualización normalmente
    const updatedConfig = await IaConfig.findByIdAndDelete({ _id: config_id });

    if (!updatedConfig) {
      res.status(404).json({ message: "Configuración no encontrada." });
      return;
    }

    res.json({ message: "Configuración eliminada", config: updatedConfig });
  } catch (error) {
    console.error("Error al eliminar configuración IA:", error);
    res.status(500).json({ message: "Error al eliminar configuración IA" });
  }
};

export const testIA = async (req: Request, res: Response): Promise<void> => {
  try {
    const { c_name } = req.params;
    const { messages, aiConfig } = req.body;

    console.log(`🧪 Testing IA for company: ${c_name}`);
    console.log(`📝 Messages received: ${messages?.length || 0}`);

    const defaultResponse = "Disculpa, hubo un problema técnico. Un asesor se pondrá en contacto contigo para ayudarte.";
    let aiResponse = defaultResponse;

    // Obtener el último mensaje del usuario
    const lastUserMessage = messages && messages.length > 0 
      ? messages[messages.length - 1].text 
      : '';

    if (!lastUserMessage) {
      res.status(400).json({ 
        message: "No se proporcionó ningún mensaje para procesar" 
      });
      return;
    }

    // Mapear historial para el nuevo sistema de agentes
    const chatHistory = (messages || []).map((msg: any) => ({
      role: msg.from === "user" ? "user" : "assistant",
      content: msg.text,
      timestamp: new Date()
    }));

    try {
      // Usar el nuevo sistema de agentes
      const agentService = new MessagingAgentService();
      
      // Obtener conexión a la base de datos
      const conn = await getConnectionByCompanySlug(c_name);
      
      // Procesar mensaje con el nuevo sistema de agentes
      const response = await agentService.processWhatsAppMessage(
        c_name,
        lastUserMessage,
        'test-frontend-user', // Phone number para testing
        conn,
        aiConfig?._id.toString(),
        aiConfig?.name,
        chatHistory,
        false // isCalendarFallback
      );

      aiResponse = response || defaultResponse;
      console.log(`✅ Agent response: ${aiResponse}`);

    } catch (error) {
      console.error(`❌ Error al obtener respuesta del agente para ${c_name}:`, error);
      aiResponse = defaultResponse;
    }

    res.status(201).json({ message: aiResponse });

  } catch (error) {
    console.error("Error al probar IA:", error);
    res.status(500).json({ message: "Error al probar IA" });
  }
};

// Generar prompt desde TODOS los chats de WhatsApp (admin-only)
export const generateWhatsappPromptFromChats = async (req: Request, res: Response): Promise<void> => {
  try {
    const { c_name, user_id } = req.params;
    const { dateRange, sample } = req.body || {};

    const conn = await getConnectionByCompanySlug(c_name);

    // Validar permisos (solo Administrador)
    const UserModel = getUserModel(conn);
    const user = await UserModel.findById(user_id);
    if (!user) {
      res.status(404).json({ message: "Usuario no encontrado." });
      return;
    }
    if (user.role !== "Administrador") {
      res.status(403).json({ message: "Solo un administrador puede generar el prompt." });
      return;
    }

    const WhatsappChat = getWhatsappChatModel(conn);

    // Filtro de fecha opcional
    const filter: any = {};
    if (dateRange?.from || dateRange?.to) {
      const createdAtFilter: any = {};
      if (dateRange?.from) createdAtFilter.$gte = new Date(dateRange.from);
      if (dateRange?.to) createdAtFilter.$lte = new Date(dateRange.to);
      // Considerar tanto timestamps de chat como de mensajes
      filter.$or = [
        { createdAt: createdAtFilter },
        { 'messages.createdAt': createdAtFilter }
      ];
    }

    const chats = await WhatsappChat.find(filter).lean();

    // Parámetros de muestreo opcionales
    const maxChats: number | null = typeof sample?.maxChats === 'number' && sample.maxChats > 0 ? sample.maxChats : null;
    const maxPairsPerChat: number | null = typeof sample?.maxPairsPerChat === 'number' && sample.maxPairsPerChat > 0 ? sample.maxPairsPerChat : null;

    type Pair = { input: string; output: string };
    const allPairs: Pair[] = [];

    const sanitize = (text: any): string => {
      if (typeof text !== 'string') return '';
      return text
        .replace(/\s+/g, ' ')
        .replace(/\u200B/g, '')
        .trim();
    };

    const isEmoji = (ch: string): boolean => /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(ch);

    // Construir pares entrada (inbound) → salida (siguiente outbound humano)
    for (let chatIdx = 0; chatIdx < chats.length; chatIdx++) {
      if (maxChats !== null && chatIdx >= maxChats) break;

      const messages = Array.isArray(chats[chatIdx]?.messages) ? [...chats[chatIdx].messages] : [];
      messages.sort((a: any, b: any) => new Date(a?.createdAt || 0).getTime() - new Date(b?.createdAt || 0).getTime());

      let pairsForThisChat = 0;

      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const dir = (msg?.direction || '').toString().toLowerCase();
        if (dir !== 'inbound') continue;

        const userText = sanitize(msg?.body);
        if (!userText || userText.length < 2) continue;

        // Buscar la siguiente respuesta HUMANA (outbound, no bot)
        const next = messages.slice(i + 1).find((m: any) => {
          const ndir = (m?.direction || '').toString().toLowerCase();
          const rb = (m?.respondedBy || '').toString().toLowerCase();
          return ndir === 'outbound' && rb !== 'bot' && typeof m?.body === 'string' && m?.body?.trim().length > 0;
        });

        if (!next) continue;

        const outText = sanitize(next.body);
        if (!outText || outText.length < 2) continue;

        allPairs.push({ input: userText, output: outText });
        pairsForThisChat++;
        if (maxPairsPerChat !== null && pairsForThisChat >= maxPairsPerChat) break;
      }
    }

    // Métricas simples para el tono
    let totalOut = 0, emojiOut = 0, exclamOut = 0, ustedHits = 0, tuHits = 0;
    const greetings: Record<string, number> = {};
    const closings: Record<string, number> = {};

    const normalizeKey = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

    for (const p of allPairs) {
      const o = p.output;
      if (!o) continue;
      totalOut++;
      if (/[!¡]/.test(o)) exclamOut++;
      if ([...o].some(isEmoji)) emojiOut++;
      if (/\busted\b|\bdisculpe\b|\bpor favor\b/i.test(o)) ustedHits++;
      if (/\btú\b|\btu\b|\bcontigo\b|\bte\b/i.test(o)) tuHits++;

      if (/\bhola\b|\bbuen[oa]s\b/i.test(o)) {
        const key = normalizeKey(o.length > 160 ? o.slice(0, 160) + '…' : o);
        greetings[key] = (greetings[key] || 0) + 1;
      }
      if (/\?\s*$|\b¿te (gustaria|parece|ayudo)\b|\bhay algo más\b|\b¿algo más\b/i.test(o)) {
        const key = normalizeKey(o.length > 160 ? o.slice(0, 160) + '…' : o);
        closings[key] = (closings[key] || 0) + 1;
      }
    }

    const pickTop = (map: Record<string, number>, n: number) => Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([text]) => text);

    const topGreetings = pickTop(greetings, 3);
    const topClosings = pickTop(closings, 3);

    const emojiRate = totalOut > 0 ? emojiOut / totalOut : 0;
    const exclamRate = totalOut > 0 ? exclamOut / totalOut : 0;
    const preferredPronoun = ustedHits >= tuHits ? 'usted' : 'tú';

    // Construir prompt (solo texto) basado en pares reales
    const lines: string[] = [];
    lines.push("Responde como un asesor humano profesional y cercano.");
    lines.push(`Usa trato de ${preferredPronoun} de forma consistente.`);
    if (emojiRate > 0.05) {
      lines.push("Puedes usar emojis con moderación para dar calidez (sin exceso).");
    } else {
      lines.push("Evita emojis salvo que el usuario los use primero.");
    }
    lines.push("Una sola idea por mensaje, claro y breve. Evita párrafos largos.");
    lines.push("No inventes datos que no estén confirmados en la conversación. Si falta información, pregunta primero.");

    if (topGreetings.length > 0) {
      lines.push("");
      lines.push("Saludo sugerido (tomado de conversaciones reales):");
      for (const g of topGreetings) lines.push(`- ${g}`);
    }

    lines.push("");
    lines.push("Patrones de respuesta útiles (basados en pares reales usuario→asesor):");
    const samplePairs = allPairs.slice(0, 10);
    for (const pair of samplePairs) {
      const user = pair.input.length > 140 ? pair.input.slice(0, 140) + '…' : pair.input;
      const agent = pair.output.length > 180 ? pair.output.slice(0, 180) + '…' : pair.output;
      lines.push(`Usuario: ${user}`);
      lines.push(`Asesor: ${agent}`);
      lines.push('');
    }

    if (topClosings.length > 0) {
      lines.push("Cierres y preguntas de avance frecuentes:");
      for (const c of topClosings) lines.push(`- ${c}`);
    }

    if (exclamRate > 0.1) {
      lines.push("Usa signos de exclamación con criterio (sin abusar).");
    }

    const promptDraft = lines.join("\n").trim();

    res.json({ promptDraft });
  } catch (error) {
    console.error("Error al generar prompt desde WhatsApp chats:", error);
    res.status(500).json({ message: "Error al generar prompt desde chats" });
  }
};