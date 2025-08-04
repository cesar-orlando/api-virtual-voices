import { Request, Response } from "express";
import getIaConfigModel, { IIaConfig } from "../models/iaConfig.model";
import { getConnectionByCompanySlug } from "../config/connectionManager";
import { generateResponse, openai, preparePrompt } from "../services/openai";
import getUserModel from "../core/users/user.model";
import getRecordModel from "../models/record.model";
import { MessagingAgentService } from "../services/agents/MessagingAgentService";
import { applyFuzzySearchToToolResult } from "../utils/fuzzyPropertySearch";

// 🔥 Crear configuración inicial si no existe
export const createIAConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { c_name } = req.params;

    const {
      name,
      tone,
      objective,
      customPrompt,
      welcomeMessage,
      user
    } = req.body;

    const conn = await getConnectionByCompanySlug(c_name);

    const IaConfig = getIaConfigModel(conn);

    const existing = await IaConfig.findOne({ name });
    if (existing) {
      res.status(400).json({ message: "Ya existe configuración con este nombre." });
      return;
    }

    const newConfig = new IaConfig({
      name,
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