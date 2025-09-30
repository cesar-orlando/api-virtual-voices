import { Router } from 'express';
import { 
  createThread,
  sendMessage,
  updateCompanyFacts,
  generatePrompt,
  publishPrompt,
  getThreads,
  getThreadSummary,
  getMessages,
  getLLMProviders,
  getLLMModels,
  healthCheck
} from '../controllers/chatInternal.controller';

import {
  upsertDocument,
  reindexCollection,
  searchDocuments
} from '../controllers/rag.controller';

const router = Router();

/**
 * 🤖 RUTAS CHAT INTERNO CON MEMORIA, RAG Y GENERADOR DE PROMPTS
 * Según especificación técnica
 * ✨ SOPORTE MULTI-LLM: OpenAI, Anthropic, Google, Meta
 */

// ===== THREADS =====
// 1️⃣ POST /api/chat-internal/:c_name/threads
router.post('/:c_name/threads', createThread);

// 2️⃣ POST /api/chat-internal/:c_name/threads/:threadId/messages
router.post('/:c_name/threads/:threadId/messages', sendMessage);

// 6️⃣ GET /api/chat-internal/:c_name/threads
router.get('/:c_name/threads', getThreads);

// 7️⃣ GET /api/chat-internal/:c_name/threads/:threadId/summary
router.get('/:c_name/threads/:threadId/summary', getThreadSummary);

// 8️⃣ GET /api/chat-internal/:c_name/threads/:threadId/messages
router.get('/:c_name/threads/:threadId/messages', getMessages);

// ===== COMPANY FACTS =====
// 3️⃣ PUT /api/chat-internal/:c_name/company/facts
router.put('/:c_name/company/facts', updateCompanyFacts);

// ===== PROMPT GENERATOR =====
// 4️⃣ POST /api/chat-internal/:c_name/prompts/generate
router.post('/:c_name/prompts/generate', generatePrompt);

// 5️⃣ POST /api/chat-internal/:c_name/prompts/publish
router.post('/:c_name/prompts/publish', publishPrompt);

// ===== RAG (Vector Store) =====
// 8️⃣ POST /api/chat-internal/:c_name/rag/upsert
router.post('/:c_name/rag/upsert', upsertDocument);

// 9️⃣ POST /api/chat-internal/:c_name/rag/reindex
router.post('/:c_name/rag/reindex', reindexCollection);

// 🔍 POST /api/chat-internal/:c_name/rag/search (para testing)
router.post('/:c_name/rag/search', searchDocuments);

// ===== LLM MANAGEMENT =====
// 🤖 GET /api/chat-internal/llm/providers - Obtener proveedores LLM disponibles
router.get('/llm/providers', getLLMProviders);

// 🤖 GET /api/chat-internal/llm/models/:provider - Obtener modelos de un proveedor
router.get('/llm/models/:provider', getLLMModels);

// ===== HEALTH CHECK =====
// 🏥 GET /api/chat-internal/health/:c_name - Verificar estado y configuración
router.get('/health/:c_name', healthCheck);

export default router;
