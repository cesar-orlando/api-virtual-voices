import { Request, Response } from 'express';
import { getConnectionByCompanySlug } from '../config/connectionManager';
import getUserModel from '../core/users/user.model';
import { RAGService } from '../services/rag.service';

/**
 * 🔍 CONTROLADOR RAG (Vector Store por tenant)
 */

const ragService = new RAGService();

// 8️⃣ POST /rag/upsert - Subir documentos al vector store
export const upsertDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const { c_name } = req.params;
    const { 
      userId,
      collection,
      title,
      text,
      chunked = false
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
          message: 'Solo administradores pueden subir documentos al RAG',
          requestId: req.headers['x-request-id']
        }
      });
      return;
    }

    // Validar colección
    if (!['kb', 'faq', 'prompts'].includes(collection)) {
      res.status(400).json({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Colección debe ser: kb, faq o prompts',
          requestId: req.headers['x-request-id']
        }
      });
      return;
    }

    let processedChunks = 0;

    if (chunked && text.length > 1000) {
      // Dividir en chunks
      const chunks = ragService.chunkText(text, 450, 50);
      
      for (let i = 0; i < chunks.length; i++) {
        const chunkTitle = `${title} (Parte ${i + 1}/${chunks.length})`;
        await ragService.upsertDocument(
          conn,
          c_name,
          collection,
          chunkTitle,
          chunks[i]
        );
        processedChunks++;
      }
    } else {
      // Subir como documento único
      await ragService.upsertDocument(
        conn,
        c_name,
        collection,
        title,
        text
      );
      processedChunks = 1;
    }

    res.json({
      ok: true,
      data: {
        title,
        collection,
        processedChunks,
        chunked: processedChunks > 1,
        uploadedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Error upserting document:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'RAG_UPSERT_ERROR',
        message: 'Error al subir documento',
        details: error instanceof Error ? error.message : 'Unknown error',
        requestId: req.headers['x-request-id']
      }
    });
  }
};

// 9️⃣ POST /rag/reindex - Reindexar colección completa
export const reindexCollection = async (req: Request, res: Response): Promise<void> => {
  try {
    const { c_name } = req.params;
    const { 
      userId,
      collection
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
          message: 'Solo administradores pueden reindexar colecciones',
          requestId: req.headers['x-request-id']
        }
      });
      return;
    }

    // Validar colección
    if (!['kb', 'faq', 'prompts'].includes(collection)) {
      res.status(400).json({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Colección debe ser: kb, faq o prompts',
          requestId: req.headers['x-request-id']
        }
      });
      return;
    }

    // Reindexar
    const result = await ragService.reindexCollection(conn, c_name, collection);

    res.json({
      ok: true,
      data: {
        collection,
        processed: result.processed,
        errors: result.errors,
        reindexedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Error reindexing collection:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'RAG_REINDEX_ERROR',
        message: 'Error al reindexar colección',
        details: error instanceof Error ? error.message : 'Unknown error',
        requestId: req.headers['x-request-id']
      }
    });
  }
};

// 🔍 POST /rag/search - Búsqueda vectorial manual (para testing)
export const searchDocuments = async (req: Request, res: Response): Promise<void> => {
  try {
    const { c_name } = req.params;
    const { 
      query,
      collections = ['kb', 'faq'],
      k = 5
    } = req.body;

    const conn = await getConnectionByCompanySlug(c_name);

    // Realizar búsqueda
    const results = await ragService.retrieve(conn, c_name, query, k, collections);

    res.json({
      ok: true,
      data: {
        query,
        collections,
        results,
        count: results.length,
        searchedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Error searching documents:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'RAG_SEARCH_ERROR',
        message: 'Error en búsqueda vectorial',
        details: error instanceof Error ? error.message : 'Unknown error',
        requestId: req.headers['x-request-id']
      }
    });
  }
};
