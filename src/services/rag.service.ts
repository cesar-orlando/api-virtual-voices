import { Connection } from 'mongoose';
import getKbDocModel, { IKbDoc } from '../models/kbDoc.model';
import { openai } from '../config/openai';

export interface RAGResult {
  text: string;
  title?: string;
  docCollection: string;
  score?: number;
}

export class RAGService {
  private embeddingModel: string;
  private vectorIndexName: string;

  constructor() {
    this.embeddingModel = process.env.EMBEDDING_MODEL || 'text-embedding-3-large';
    this.vectorIndexName = process.env.VECTOR_INDEX_NAME || 'kb_vec';
  }

  /**
   * Genera embedding para un texto
   */
  async embed(text: string): Promise<number[]> {
    try {
      const response = await openai.embeddings.create({
        model: this.embeddingModel,
        input: text.replace(/\n/g, ' ').trim()
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw new Error('Failed to generate embedding');
    }
  }

  /**
   * Búsqueda vectorial en Atlas
   */
  async retrieve(
    connection: Connection,
    companySlug: string, 
    query: string, 
    k: number = 5, 
    collections: string[] = ['kb', 'faq', 'prompts']
  ): Promise<RAGResult[]> {
    try {
      // Generar embedding de la query
      const queryEmbedding = await this.embed(query);
      
      const KbDoc = getKbDocModel(connection);

      // Búsqueda vectorial usando Atlas Vector Search
      const pipeline = [
        {
          $vectorSearch: {
            index: this.vectorIndexName,
            path: 'embedding',
            queryVector: queryEmbedding,
            numCandidates: k * 10, // Buscar más candidatos para mejor recall
            limit: k,
            filter: {
              companySlug: { $eq: companySlug },
              docCollection: { $in: collections }
            }
          }
        },
        {
          $project: {
            text: 1,
            title: 1,
            docCollection: 1,
            score: { $meta: 'vectorSearchScore' }
          }
        }
      ];

      const results = await KbDoc.aggregate(pipeline);

      return results.map((doc: any) => ({
        text: doc.text,
        title: doc.title,
        docCollection: doc.docCollection,
        score: doc.score
      }));

    } catch (error) {
      console.error('RAG retrieval error:', error);
      // Si RAG falla, continuar sin RAG (como especifica la doc)
      console.warn('RAG_ERROR: Continuing without RAG context');
      return [];
    }
  }

  /**
   * Upsert de documento con embedding
   */
  async upsertDocument(
    connection: Connection,
    companySlug: string,
    docCollection: 'kb' | 'faq' | 'prompts',
    title: string,
    text: string
  ): Promise<void> {
    try {
      const embedding = await this.embed(text);
      const KbDoc = getKbDocModel(connection);

      await KbDoc.updateOne(
        { companySlug, docCollection, title },
        { 
          $set: { 
            text, 
            embedding,
            updatedAt: new Date()
          } 
        },
        { upsert: true }
      );

    } catch (error) {
      console.error('Error upserting document:', error);
      throw new Error('Failed to upsert document');
    }
  }

  /**
   * Chunking de documentos largos
   */
  chunkText(text: string, chunkSize: number = 450, overlap: number = 50): string[] {
    const words = text.split(/\s+/);
    const chunks: string[] = [];
    
    for (let i = 0; i < words.length; i += chunkSize - overlap) {
      const chunk = words.slice(i, i + chunkSize).join(' ');
      if (chunk.trim().length > 0) {
        chunks.push(chunk.trim());
      }
    }
    
    return chunks;
  }

  /**
   * Reindex completo de una colección
   */
  async reindexCollection(
    connection: Connection,
    companySlug: string,
    docCollection: 'kb' | 'faq' | 'prompts'
  ): Promise<{ processed: number, errors: number }> {
    try {
      const KbDoc = getKbDocModel(connection);
      const docs = await KbDoc.find({ companySlug, docCollection });
      
      let processed = 0;
      let errors = 0;

      for (const doc of docs) {
        try {
          const embedding = await this.embed(doc.text);
          await KbDoc.updateOne(
            { _id: doc._id },
            { $set: { embedding } }
          );
          processed++;
        } catch (error) {
          console.error(`Error reindexing doc ${doc._id}:`, error);
          errors++;
        }
      }

      return { processed, errors };
    } catch (error) {
      console.error('Error reindexing collection:', error);
      throw new Error('Failed to reindex collection');
    }
  }
}
