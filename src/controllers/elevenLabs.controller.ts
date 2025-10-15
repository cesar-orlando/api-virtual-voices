// Updated imports and instantiation
import { Request, Response } from 'express';
import ElevenLabsAgent from '../models/elevenLabsAgent.model';
import ElevenLabsService from '../services/elevenLabs/elevenLabsService';

const service = new ElevenLabsService();

// Create Agent
export const createElevenLabsAgent = async (req: Request, res: Response) => {
  try {
    const companySlug = req.query.companySlug as string;
    const agentData = { ...req.body, companySlug };
    
    // Si viene con agentId, solo guardar referencia local
    if (agentData.agentId) {
      console.log('🔄 Importando agente existente de ElevenLabs:', agentData.agentId);
      
      // 1. Verificar si ya existe localmente
      const existingAgent = await ElevenLabsAgent.findOne({ 
        agentId: agentData.agentId, 
        companySlug: agentData.companySlug 
      });
      
      if (existingAgent) {
        console.log('⚠️ Agente ya existe localmente:', existingAgent._id);
        
        // 2. Obtener datos actualizados de ElevenLabs
        const elevenLabsData = await service.getAgent(agentData.agentId);
        console.log('📥 Datos actualizados de ElevenLabs:', elevenLabsData.name);
        
        return res.status(200).json({
          message: 'Agent already exists locally',
          agent: {
            _id: existingAgent._id,
            agentId: existingAgent.agentId,
            companySlug: existingAgent.companySlug,
            createdAt: existingAgent.createdAt
          },
          elevenLabsData: elevenLabsData,
          alreadyExists: true
        });
      }
      
      // 3. Verificar que el agente existe en ElevenLabs
      const elevenLabsData = await service.getAgent(agentData.agentId);
      console.log('📥 Agente verificado en ElevenLabs:', elevenLabsData.name);
      
      // 4. Crear solo referencia local (sin duplicar datos)
      const localAgent = new ElevenLabsAgent({
        agentId: agentData.agentId,
        companySlug: agentData.companySlug
      });
      
      await localAgent.save();
      console.log('✅ Referencia de agente guardada:', localAgent._id);
      
      return res.status(201).json({
        message: 'Agent reference imported successfully',
        agent: {
          _id: localAgent._id,
          agentId: localAgent.agentId,
          companySlug: localAgent.companySlug,
          createdAt: localAgent.createdAt
        },
        elevenLabsData: elevenLabsData,
        imported: true
      });
    }
    
    // Si no hay agentId, crear nuevo agente en ElevenLabs
    console.log('🆕 Creando nuevo agente en ElevenLabs');
    const result = await service.createAgent(agentData);
    const localAgent = new ElevenLabsAgent(result);
    await localAgent.save();
    
    console.log('✅ Nuevo agente creado:', localAgent._id);
    res.status(201).json({
      message: 'Agent created successfully',
      agent: localAgent,
      created: true
    });
  } catch (error) {
    console.error('❌ Error en createElevenLabsAgent:', error);
    res.status(500).json({ message: error.message });
  }
};

// Similar for other functions, using service.method() and new for model

// Get All Agents (traer datos directo de ElevenLabs)
export const getElevenLabsAgents = async (req: Request, res: Response) => {
  try {
    const companySlug = req.query.companySlug as string;
    
    // 1. Obtener lista de agentes de la empresa desde DB local
    const localAgents = await ElevenLabsAgent.find({ companySlug });
    console.log(`📋 Agentes locales encontrados para ${companySlug}:`, localAgents.length);
    
    // 2. Traer datos completos de ElevenLabs para cada agente
    const agentsWithData = await Promise.all(
      localAgents.map(async (localAgent) => {
        try {
          const elevenLabsData = await service.getAgent(localAgent.agentId);
          return {
            _id: localAgent._id,
            agentId: localAgent.agentId,
            companySlug: localAgent.companySlug,
            createdAt: localAgent.createdAt,
            // Datos reales de ElevenLabs
            name: elevenLabsData.name,
            prompt: elevenLabsData.conversation_config?.agent?.prompt?.prompt || '',
            isActive: true, // Si existe en ElevenLabs está activo
            elevenLabsData: elevenLabsData
          };
        } catch (error) {
          console.warn(`⚠️ Error obteniendo datos de ElevenLabs para ${localAgent.agentId}:`, error.message);
          return {
            _id: localAgent._id,
            agentId: localAgent.agentId,
            companySlug: localAgent.companySlug,
            createdAt: localAgent.createdAt,
            name: 'Agente no disponible',
            prompt: 'Error obteniendo datos de ElevenLabs',
            isActive: false,
            error: error.message
          };
        }
      })
    );
    
    console.log(`✅ Datos de ElevenLabs obtenidos para ${agentsWithData.length} agentes`);
    res.json(agentsWithData);
  } catch (error) {
    console.error('❌ Error en getElevenLabsAgents:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get Single Agent (traer datos directo de ElevenLabs)
export const getElevenLabsAgent = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const companySlug = req.query.companySlug as string;
    
    // 1. Buscar agente local
    const localAgent = await ElevenLabsAgent.findOne({ _id: id, companySlug });
    if (!localAgent) {
      return res.status(404).json({ message: 'Agent not found locally' });
    }
    
    // 2. Traer datos completos de ElevenLabs
    console.log(`📥 Obteniendo datos de ElevenLabs para: ${localAgent.agentId}`);
    const elevenLabsData = await service.getAgent(localAgent.agentId);
    
    // 3. Combinar datos locales con datos de ElevenLabs
    const agentWithData = {
      _id: localAgent._id,
      agentId: localAgent.agentId,
      companySlug: localAgent.companySlug,
      createdAt: localAgent.createdAt,
      // Datos reales de ElevenLabs
      name: elevenLabsData.name,
      prompt: elevenLabsData.conversation_config?.agent?.prompt?.prompt || '',
      isActive: true,
      elevenLabsData: elevenLabsData
    };
    
    console.log(`✅ Datos de ElevenLabs obtenidos para: ${elevenLabsData.name}`);
    res.json(agentWithData);
  } catch (error) {
    console.error('❌ Error en getElevenLabsAgent:', error);
    res.status(500).json({ message: error.message });
  }
};

// Update Agent (actualizar directo en ElevenLabs)
export const updateElevenLabsAgent = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const companySlug = req.query.companySlug as string;
    const updateData = req.body;
    
    // 1. Buscar agente local
    const localAgent = await ElevenLabsAgent.findOne({ _id: id, companySlug });
    if (!localAgent) {
      return res.status(404).json({ message: 'Agent not found locally' });
    }
    
    // 2. Actualizar directo en ElevenLabs
    console.log('🔄 Actualizando agente en ElevenLabs:', localAgent.agentId);
    await service.updateAgent(localAgent.agentId, {
      platform_settings: {
        name: updateData.name
      },
      conversation_config: {
        prompt: updateData.prompt
      }
    });
    
    console.log('✅ Agente actualizado en ElevenLabs');
    
    // 3. Obtener datos actualizados de ElevenLabs
    const updatedElevenLabsData = await service.getAgent(localAgent.agentId);
    
    res.json({
      message: 'Agent updated successfully in ElevenLabs',
      agent: {
        _id: localAgent._id,
        agentId: localAgent.agentId,
        companySlug: localAgent.companySlug,
        createdAt: localAgent.createdAt
      },
      elevenLabsData: updatedElevenLabsData,
      updated: true
    });
  } catch (error) {
    console.error('❌ Error en updateElevenLabsAgent:', error);
    res.status(500).json({ message: error.message });
  }
};

// Delete Agent
export const deleteElevenLabsAgent = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const companySlug = req.query.companySlug as string;
    const agent = await ElevenLabsAgent.findOne({ _id: id, companySlug });
    if (!agent) res.status(404).json({ message: 'Agent not found' });
    await service.deleteAgent(agent.agentId);
    await agent.deleteOne();
    res.json({ message: 'Agent deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// List Conversations
export const getElevenLabsConversations = async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const conversations = await service.listConversations(agentId);
    res.json(conversations);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get Conversation
export const getElevenLabsConversation = async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const conversation = await service.getConversation(conversationId);
    res.json(conversation);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get Conversation Audio
export const getElevenLabsConversationAudio = async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const audio = await service.getConversationAudio(conversationId);
    res.set('Content-Type', 'audio/mpeg');
    res.send(audio);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Generate Personalized Prompt
export const generatePersonalizedPrompt = async (req: Request, res: Response) => {
  try {
    const { basePrompt, customerInfo } = req.body;
    const prompt = service.generatePersonalizedPrompt(basePrompt, customerInfo);
    res.json({ prompt });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Sync Agent with ElevenLabs
export const syncElevenLabsAgent = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const companySlug = req.query.companySlug as string;
    
    // 1. Buscar el agente local
    const localAgent = await ElevenLabsAgent.findOne({ _id: id, companySlug });
    if (!localAgent) {
      return res.status(404).json({ message: 'Agent not found locally' });
    }

    // 2. Obtener datos actualizados de ElevenLabs
    const elevenLabsData = await service.getAgent(localAgent.agentId);
    
    // 3. Los datos locales no se actualizan, solo se retornan los de ElevenLabs
    // (La nueva arquitectura no duplica datos)

    res.json({
      message: 'Agent data retrieved from ElevenLabs',
      agent: {
        _id: localAgent._id,
        agentId: localAgent.agentId,
        companySlug: localAgent.companySlug,
        createdAt: localAgent.createdAt
      },
      elevenLabsData: elevenLabsData
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
