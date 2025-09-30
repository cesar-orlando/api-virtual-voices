import { Request, Response } from 'express';
import { getConnectionByCompanySlug } from '../config/connectionManager';
import getUserModel from '../core/users/user.model';
import getIaConfigModel from '../models/iaConfig.model';
import getThreadModel from '../models/thread.model';
import getMessageModel from '../models/message.model';
import getCompanyMemoryModel from '../models/companyMemory.model';
import getPromptVersionModel from '../models/promptVersion.model';
import { RAGService } from '../services/rag.service';
import { MemoryService } from '../services/memory.service';
import { PromptBuilderService } from '../services/promptBuilder.service';
import { LLMService } from '../services/llm.service';
import { getCompanyPrompt } from '../prompts/chatInterno.prompt';
import { openai } from '../config/openai';

/**
 * 🤖 CONTROLADOR CHAT INTERNO SIMPLIFICADO
 * Chat tipo ChatGPT para uso interno de la empresa
 * Sin necesidad de configurar personas/IA
 */
const ragService = new RAGService();
const memoryService = new MemoryService();
const promptBuilderService = new PromptBuilderService();
const llmService = new LLMService();

// 1️⃣ POST /threads - Crear nuevo hilo de chat (SIMPLIFICADO)
export const createThread = async (req: Request, res: Response): Promise<void> => {
  try {
    const { c_name } = req.params;
    const { userId, state } = req.body;

    // ✅ Validación de entrada
    if (!userId) {
      res.status(400).json({
        ok: false,
        error: {
          code: 'MISSING_USER_ID',
          message: 'El campo userId es requerido',
          requestId: req.headers['x-request-id']
        }
      });
      return;
    }

    const conn = await getConnectionByCompanySlug(c_name);
    if (!conn) {
      res.status(404).json({
        ok: false,
        error: {
          code: 'COMPANY_NOT_FOUND',
          message: `Empresa "${c_name}" no encontrada`,
          requestId: req.headers['x-request-id']
        }
      });
      return;
    }

    // Validar usuario
    const UserModel = getUserModel(conn);
    const user = await UserModel.findById(userId);
    if (!user) {
      res.status(404).json({
        ok: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'Usuario no encontrado',
          requestId: req.headers['x-request-id']
        }
      });
      return;
    }

    // Configurar LLM (por defecto OpenAI)
    const llmProvider = state?.llmProvider || 'openai';
    const llmModel = state?.llmModel || llmService.getDefaultModel(llmProvider);

    // Validar que el modelo esté disponible
    if (!llmService.isModelAvailable(llmProvider, llmModel)) {
      res.status(400).json({
        ok: false,
        error: {
          code: 'INVALID_LLM_MODEL',
          message: `Modelo "${llmModel}" no disponible para proveedor "${llmProvider}"`,
          availableModels: llmService.getAvailableModels(llmProvider),
          requestId: req.headers['x-request-id']
        }
      });
      return;
    }

    // Crear nuevo hilo SIN personaId (no es necesario)
    const Thread = getThreadModel(conn);
    const newThread = new Thread({
      companySlug: c_name,
      userId,
      personaId: null, // No necesitamos persona, usamos prompt interno
      state: {
        summaryMode: 'smart',
        llmProvider,
        llmModel,
        ...state
      },
      summary: {
        facts: '',
        rolling: ''
      }
    });

    await newThread.save();

    res.json({
      ok: true,
      data: {
        threadId: newThread._id,
        companySlug: c_name,
        userName: user.name,
        state: newThread.state,
        llmProvider,
        llmModel,
        createdAt: newThread.createdAt
      }
    });

  } catch (error: any) {
    console.error('❌ Error creating thread:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    res.status(500).json({
      ok: false,
      error: {
        code: 'THREAD_CREATION_ERROR',
        message: 'Error al crear hilo de chat',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        requestId: req.headers['x-request-id']
      }
    });
  }
};

// 2️⃣ POST /threads/:threadId/messages - Enviar mensaje al chat
export const sendMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { c_name, threadId } = req.params;
    const { content, role = 'user' } = req.body;

    const conn = await getConnectionByCompanySlug(c_name);
    const Thread = getThreadModel(conn);
    const Message = getMessageModel(conn);

    // Validar hilo
    const thread = await Thread.findById(threadId);
    if (!thread || thread.companySlug !== c_name) {
      res.status(404).json({
        ok: false,
        error: {
          code: 'THREAD_NOT_FOUND',
          message: 'Hilo de chat no encontrado',
          requestId: req.headers['x-request-id']
        }
      });
      return;
    }

    // Guardar mensaje del usuario
    const userMessage = new Message({
      threadId,
      role,
      content,
      tokens: Math.ceil(content.length / 4) // Estimación básica
    });
    await userMessage.save();

    // Verificar si necesita resumen automático
    await memoryService.maybeSummarize(conn, threadId);

    // Solo generar respuesta si es mensaje del usuario
    if (role === 'user') {
      // RAG: buscar contexto relevante
      const ragResults = await ragService.retrieve(
        conn, 
        c_name, 
        content, 
        3, 
        ['kb', 'faq']
      );

      // Construir contexto completo
      const context = await memoryService.getContext(conn, {
        threadId,
        companySlug: c_name,
        userQuery: content,
        ragTexts: ragResults
      });

      // Obtener facts de la empresa
      const companyFacts = await memoryService.getCompanyFacts(conn, c_name);

      // Obtener mensajes recientes
      const recentMessages = await Message.find({ threadId })
        .sort({ createdAt: -1 })
        .limit(parseInt(process.env.MAX_RECENT_MESSAGES || '16'));

      // Obtener configuración de LLM del hilo
      const llmProvider = thread.state?.llmProvider || 'openai';
      const llmModel = thread.state?.llmModel || llmService.getDefaultModel(llmProvider);

      // Construir prompt usando el archivo de prompts
      const systemPrompt = getCompanyPrompt(c_name, companyFacts);

      const messages: any[] = [
        { role: 'system', content: systemPrompt },
        ...(context ? [{ role: 'system', content: `CONTEXTO ADICIONAL:\n${context}` }] : []),
        ...recentMessages.reverse().map(msg => ({
          role: msg.role,
          content: msg.content
        }))
      ];

      // Generar respuesta con el LLM seleccionado
      const llmResponse = await llmService.generate(llmProvider, messages, {
        model: llmModel,
        maxTokens: 1000,
        temperature: 0.7
      });

      const assistantContent = llmResponse.content || 'Lo siento, no pude generar una respuesta.';

      // Guardar respuesta del asistente
      const assistantMessage = new Message({
        threadId,
        role: 'assistant',
        content: assistantContent,
        tokens: llmResponse.tokens?.completion || Math.ceil(assistantContent.length / 4)
      });
      await assistantMessage.save();

      res.json({
        ok: true,
        data: {
          messageId: assistantMessage._id,
          content: assistantContent,
          role: 'assistant',
          tokens: assistantMessage.tokens,
          llmProvider: llmResponse.provider,
          llmModel: llmResponse.model,
          ragContext: ragResults.length > 0,
          createdAt: assistantMessage.createdAt
        }
      });

    } else {
      // Solo confirmar guardado del mensaje
      res.json({
        ok: true,
        data: {
          messageId: userMessage._id,
          content: userMessage.content,
          role: userMessage.role,
          createdAt: userMessage.createdAt
        }
      });
    }

  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'MESSAGE_SEND_ERROR',
        message: 'Error al enviar mensaje',
        details: error instanceof Error ? error.message : 'Unknown error',
        requestId: req.headers['x-request-id']
      }
    });
  }
};

// 3️⃣ PUT /company/facts - Actualizar facts de empresa
export const updateCompanyFacts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { c_name } = req.params;
    const { facts, userId } = req.body;

    const conn = await getConnectionByCompanySlug(c_name);

    // Validar permisos (solo admin)
    const UserModel = getUserModel(conn);
    const user = await UserModel.findById(userId);
    if (!user || user.role !== 'Administrador') {
      res.status(403).json({
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Solo administradores pueden actualizar facts de empresa',
          requestId: req.headers['x-request-id']
        }
      });
      return;
    }

    // Actualizar facts
    await memoryService.upsertFactsForCompany(conn, c_name, facts);

    res.json({
      ok: true,
      data: {
        companySlug: c_name,
        factsUpdated: true,
        updatedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Error updating company facts:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'FACTS_UPDATE_ERROR',
        message: 'Error al actualizar facts de empresa',
        requestId: req.headers['x-request-id']
      }
    });
  }
};

// 4️⃣ POST /prompts/generate - Generar prompt con IA
export const generatePrompt = async (req: Request, res: Response): Promise<void> => {
  try {
    const { c_name } = req.params;
    const { 
      userId,
      objective,
      tone,
      industry,
      includeAnalysis = true
    } = req.body;

    const conn = await getConnectionByCompanySlug(c_name);

    // Validar permisos (editor o admin)
    const UserModel = getUserModel(conn);
    const user = await UserModel.findById(userId);
    if (!user || !['Administrador', 'Editor'].includes(user.role)) {
      res.status(403).json({
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Solo administradores y editores pueden generar prompts',
          requestId: req.headers['x-request-id']
        }
      });
      return;
    }

    // Generar prompt
    const result = await promptBuilderService.fromChats(conn, c_name, {
      objective,
      tone,
      industry,
      includeAnalysis
    });

    // Validar calidad
    const validation = promptBuilderService.validate(result.prompt);

    res.json({
      ok: true,
      data: {
        prompt: result.prompt,
        analysis: result.analysis,
        validation,
        generatedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Error generating prompt:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'PROMPT_GENERATION_ERROR',
        message: 'Error al generar prompt',
        requestId: req.headers['x-request-id']
      }
    });
  }
};

// 5️⃣ POST /prompts/publish - Publicar versión de prompt
export const publishPrompt = async (req: Request, res: Response): Promise<void> => {
  try {
    const { c_name } = req.params;
    const { 
      userId,
      personaId,
      prompt
    } = req.body;

    const conn = await getConnectionByCompanySlug(c_name);

    // Validar permisos (solo admin)
    const UserModel = getUserModel(conn);
    const user = await UserModel.findById(userId);
    if (!user || user.role !== 'Administrador') {
      res.status(403).json({
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Solo administradores pueden publicar prompts',
          requestId: req.headers['x-request-id']
        }
      });
      return;
    }

    // Guardar versión como draft primero
    const versionId = await promptBuilderService.saveVersion(
      conn, c_name, personaId, prompt, userId, true
    );

    // Publicar versión
    await promptBuilderService.publishVersion(conn, versionId, c_name);

    // Actualizar la configuración IA con el nuevo prompt
    const IaConfig = getIaConfigModel(conn);
    await IaConfig.updateOne(
      { _id: personaId },
      { $set: { customPrompt: prompt } }
    );

    res.json({
      ok: true,
      data: {
        versionId,
        personaId,
        published: true,
        publishedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Error publishing prompt:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'PROMPT_PUBLISH_ERROR',
        message: 'Error al publicar prompt',
        requestId: req.headers['x-request-id']
      }
    });
  }
};

// 6️⃣ GET /threads - Listar hilos de chat con historial enriquecido
export const getThreads = async (req: Request, res: Response): Promise<void> => {
  try {
    const { c_name } = req.params;
    const { userId, limit = 20, offset = 0 } = req.query;

    const conn = await getConnectionByCompanySlug(c_name);
    const Thread = getThreadModel(conn);
    const Message = getMessageModel(conn);

    // Filtrar por usuario si se especifica
    const filter: any = { companySlug: c_name };
    if (userId) {
      filter.userId = userId;
    }

    const threads = await Thread.find(filter)
      .sort({ updatedAt: -1 })
      .limit(parseInt(limit as string))
      .skip(parseInt(offset as string))
      .populate('personaId', 'name type')
      .select('userId personaId state summary createdAt updatedAt');

    // Enriquecer cada hilo con información adicional
    const enrichedThreads = await Promise.all(
      threads.map(async (thread: any) => {
        // Obtener último mensaje
        const lastMessage = await Message.findOne({ threadId: thread._id })
          .sort({ createdAt: -1 });

        // Contar mensajes totales
        const messageCount = await Message.countDocuments({ threadId: thread._id });

        // Generar título basado en el primer mensaje o resumen
        let title = 'Nueva conversación';
        if (thread.summary?.rolling) {
          title = thread.summary.rolling.length > 50 
            ? thread.summary.rolling.substring(0, 50) + '...'
            : thread.summary.rolling;
        } else if (lastMessage?.content) {
          title = lastMessage.content.length > 50 
            ? lastMessage.content.substring(0, 50) + '...'
            : lastMessage.content;
        }

        return {
          _id: thread._id,
          title,
          lastMessage: lastMessage?.content || 'Sin mensajes',
          messageCount,
          lastActivity: lastMessage?.createdAt || thread.updatedAt,
          personaName: thread.personaId?.name || 'IA',
          state: thread.state,
          summary: thread.summary,
          createdAt: thread.createdAt,
          updatedAt: thread.updatedAt
        };
      })
    );

    const total = await Thread.countDocuments(filter);

    res.json({
      ok: true,
      data: {
        threads: enrichedThreads,
        pagination: {
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
          total
        }
      }
    });

  } catch (error) {
    console.error('Error getting threads:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'THREADS_FETCH_ERROR',
        message: 'Error al obtener hilos',
        requestId: req.headers['x-request-id']
      }
    });
  }
};

// 7️⃣ GET /threads/:threadId/summary - Obtener resumen detallado de un hilo
export const getThreadSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const { c_name, threadId } = req.params;

    const conn = await getConnectionByCompanySlug(c_name);
    const Thread = getThreadModel(conn);
    const Message = getMessageModel(conn);

    // Validar hilo
    const thread = await Thread.findById(threadId);
    if (!thread || thread.companySlug !== c_name) {
      res.status(404).json({
        ok: false,
        error: {
          code: 'THREAD_NOT_FOUND',
          message: 'Hilo no encontrado',
          requestId: req.headers['x-request-id']
        }
      });
      return;
    }

    // Obtener mensajes del hilo
    const messages = await Message.find({ threadId })
      .sort({ createdAt: 1 })
      .select('role content createdAt');

    // Generar resumen de la conversación
    const userMessages = messages.filter(msg => msg.role === 'user');
    const assistantMessages = messages.filter(msg => msg.role === 'assistant');

    // Crear resumen de temas discutidos
    const topics = userMessages.map(msg => {
      const words = msg.content.toLowerCase().split(' ').slice(0, 5);
      return words.join(' ');
    }).filter(topic => topic.length > 10);

    // Generar resumen automático si no existe
    let conversationSummary = thread.summary?.rolling || '';
    if (!conversationSummary && messages.length > 2) {
      const firstUserMsg = userMessages[0]?.content || '';
      const lastAssistantMsg = assistantMessages[assistantMessages.length - 1]?.content || '';
      conversationSummary = `Conversación sobre: ${firstUserMsg.substring(0, 100)}...`;
    }

    res.json({
      ok: true,
      data: {
        threadId: thread._id,
        title: conversationSummary.length > 50 
          ? conversationSummary.substring(0, 50) + '...'
          : conversationSummary || 'Nueva conversación',
        summary: {
          totalMessages: messages.length,
          userMessages: userMessages.length,
          assistantMessages: assistantMessages.length,
          topics: topics.slice(0, 5), // Top 5 temas
          conversationSummary,
          lastActivity: messages[messages.length - 1]?.createdAt || thread.updatedAt,
          duration: messages.length > 1 
            ? Math.round((messages[messages.length - 1].createdAt.getTime() - messages[0].createdAt.getTime()) / 60000) // minutos
            : 0
        },
        state: thread.state,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt
      }
    });

  } catch (error) {
    console.error('Error getting thread summary:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'THREAD_SUMMARY_ERROR',
        message: 'Error al obtener resumen del hilo',
        requestId: req.headers['x-request-id']
      }
    });
  }
};

// 8️⃣ GET /threads/:threadId/messages - Obtener mensajes de un hilo
export const getMessages = async (req: Request, res: Response): Promise<void> => {
  try {
    const { c_name, threadId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const conn = await getConnectionByCompanySlug(c_name);
    const Thread = getThreadModel(conn);
    const Message = getMessageModel(conn);

    // Validar hilo
    const thread = await Thread.findById(threadId);
    if (!thread || thread.companySlug !== c_name) {
      res.status(404).json({
        ok: false,
        error: {
          code: 'THREAD_NOT_FOUND',
          message: 'Hilo no encontrado',
          requestId: req.headers['x-request-id']
        }
      });
      return;
    }

    const messages = await Message.find({ threadId })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit as string))
      .skip(parseInt(offset as string))
      .select('role content tokens createdAt');

    res.json({
      ok: true,
      data: {
        threadId,
        messages: messages.reverse(), // Orden cronológico
        summary: thread.summary,
        pagination: {
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
          total: await Message.countDocuments({ threadId })
        }
      }
    });

  } catch (error) {
    console.error('Error getting messages:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'MESSAGES_FETCH_ERROR',
        message: 'Error al obtener mensajes',
        requestId: req.headers['x-request-id']
      }
    });
  }
};

// 🤖 GET /llm/providers - Obtener proveedores LLM disponibles
export const getLLMProviders = async (req: Request, res: Response): Promise<void> => {
  try {
    const providers = [
      {
        id: 'openai',
        name: 'OpenAI',
        description: 'GPT-4, GPT-4o, GPT-3.5 Turbo',
        available: true,
        models: llmService.getAvailableModels('openai'),
        defaultModel: llmService.getDefaultModel('openai')
      },
      {
        id: 'anthropic',
        name: 'Anthropic',
        description: 'Claude 3.5 Sonnet, Claude 3 Opus',
        available: false,
        models: llmService.getAvailableModels('anthropic'),
        defaultModel: llmService.getDefaultModel('anthropic')
      },
      {
        id: 'google',
        name: 'Google',
        description: 'Gemini 2.0 Flash, Gemini 1.5 Pro',
        available: false,
        models: llmService.getAvailableModels('google'),
        defaultModel: llmService.getDefaultModel('google')
      },
      {
        id: 'meta',
        name: 'Meta',
        description: 'Llama 3.3 70B, Llama 3.1',
        available: false,
        models: llmService.getAvailableModels('meta'),
        defaultModel: llmService.getDefaultModel('meta')
      }
    ];

    res.json({
      ok: true,
      data: {
        providers: providers.filter(p => p.available),
        allProviders: providers
      }
    });

  } catch (error) {
    console.error('Error getting LLM providers:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'LLM_PROVIDERS_ERROR',
        message: 'Error al obtener proveedores LLM',
        requestId: req.headers['x-request-id']
      }
    });
  }
};

// 🤖 GET /llm/models/:provider - Obtener modelos disponibles de un proveedor
export const getLLMModels = async (req: Request, res: Response): Promise<void> => {
  try {
    const { provider } = req.params;

    if (!['openai', 'anthropic', 'google', 'meta'].includes(provider)) {
      res.status(400).json({
        ok: false,
        error: {
          code: 'INVALID_PROVIDER',
          message: `Proveedor LLM inválido: ${provider}`,
          requestId: req.headers['x-request-id']
        }
      });
      return;
    }

    const models = llmService.getAvailableModels(provider as any);
    const defaultModel = llmService.getDefaultModel(provider as any);

    res.json({
      ok: true,
      data: {
        provider,
        models,
        defaultModel
      }
    });

  } catch (error) {
    console.error('Error getting LLM models:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'LLM_MODELS_ERROR',
        message: 'Error al obtener modelos LLM',
        requestId: req.headers['x-request-id']
      }
    });
  }
};

// 🏥 GET /health/:c_name - Health check y diagnóstico de configuración
export const healthCheck = async (req: Request, res: Response): Promise<void> => {
  try {
    const { c_name } = req.params;

    const conn = await getConnectionByCompanySlug(c_name);
    if (!conn) {
      res.status(404).json({
        ok: false,
        error: {
          code: 'COMPANY_NOT_FOUND',
          message: `Empresa "${c_name}" no encontrada`,
          requestId: req.headers['x-request-id']
        }
      });
      return;
    }

    // Verificar usuarios
    const UserModel = getUserModel(conn);
    const usersCount = await UserModel.countDocuments();
    const users = await UserModel.find().select('_id name email role').limit(5);

    // Verificar threads
    const Thread = getThreadModel(conn);
    const threadsCount = await Thread.countDocuments({ companySlug: c_name });

    // Verificar proveedores LLM
    const llmProviders = [
      { id: 'openai', available: true },
      { id: 'anthropic', available: false },
      { id: 'google', available: false },
      { id: 'meta', available: false }
    ];

    res.json({
      ok: true,
      data: {
        company: c_name,
        status: 'healthy',
        config: {
          users: {
            total: usersCount,
            ready: usersCount > 0,
            sample: users.map(u => ({ id: u._id, name: u.name, role: u.role }))
          },
          threads: {
            total: threadsCount
          },
          llm: {
            providers: llmProviders,
            activeProviders: llmProviders.filter(p => p.available).length,
            note: 'Solo OpenAI está activo por ahora'
          },
          prompt: {
            location: 'src/prompts/chatInterno.prompt.ts',
            editable: true,
            note: 'Edita este archivo para ajustar el comportamiento del chat'
          }
        },
        ready: usersCount > 0,
        examplePayload: usersCount > 0 ? {
          userId: users[0]._id,
          state: {
            llmProvider: 'openai',
            llmModel: 'gpt-4o-mini',
            summaryMode: 'smart'
          }
        } : null,
        note: 'Chat interno simplificado - No necesitas personaId, solo userId'
      }
    });

  } catch (error: any) {
    console.error('Error in health check:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'HEALTH_CHECK_ERROR',
        message: 'Error al verificar estado del sistema',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        requestId: req.headers['x-request-id']
      }
    });
  }
};