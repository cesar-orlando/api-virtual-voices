#!/usr/bin/env node

/**
 * Script para optimizar índices de MongoDB
 * Ejecutar: node scripts/optimize-mongodb-indexes.js
 */

const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');

// Cargar variables de entorno como lo hace la aplicación
dotenv.config();

// Usar la misma configuración que la aplicación para QuickLearning
const MONGODB_URI = process.env.MONGO_URI_QUICKLEARNING || process.env.MONGO_URI_DEV || process.env.MONGO_URI || 'mongodb://localhost:27017/virtualvoices';

console.log('🔍 URI detectada:', MONGODB_URI ? 'Configurada' : 'No encontrada');

async function optimizeIndexes() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log('🔗 Conectado a MongoDB');
    
    const db = client.db();
    
    // Índices para dynamicrecords (tabla principal)
    console.log('📊 Creando índices para dynamicrecords...');
    
    // Índice principal para consultas por tableSlug, c_name y ordenamiento
    await db.collection('dynamicrecords').createIndex(
      { tableSlug: 1, c_name: 1, updatedAt: -1, _id: 1 },
      { name: 'tableSlug_cname_updatedAt_id' }
    );
    
    // Índice para filtros por asesor
    await db.collection('dynamicrecords').createIndex(
      { tableSlug: 1, c_name: 1, "data.asesor": 1, updatedAt: -1 },
      { name: 'tableSlug_cname_asesor_updatedAt' }
    );
    
    // Índices para campos de teléfono (QuickLearning)
    await db.collection('dynamicrecords').createIndex(
      { tableSlug: 1, c_name: 1, "data.telefono": 1 },
      { name: 'tableSlug_cname_telefono' }
    );
    
    await db.collection('dynamicrecords').createIndex(
      { tableSlug: 1, c_name: 1, "data.phone": 1 },
      { name: 'tableSlug_cname_phone' }
    );
    
    await db.collection('dynamicrecords').createIndex(
      { tableSlug: 1, c_name: 1, "data.whatsapp": 1 },
      { name: 'tableSlug_cname_whatsapp' }
    );
    
    // Índice para búsquedas de texto
    await db.collection('dynamicrecords').createIndex(
      { tableSlug: 1, c_name: 1, "data.nombre": 1 },
      { name: 'tableSlug_cname_nombre' }
    );
    
    // Índices para whatsappchats
    console.log('💬 Creando índices para whatsappchats...');
    
    await db.collection('whatsappchats').createIndex(
      { phone: 1, "session.id": 1 },
      { name: 'phone_session_id' }
    );
    
    await db.collection('whatsappchats').createIndex(
      { phone: 1, updatedAt: -1 },
      { name: 'phone_updatedAt' }
    );
    
    await db.collection('whatsappchats').createIndex(
      { "session.id": 1, updatedAt: -1 },
      { name: 'session_id_updatedAt' }
    );
    
    // Índice para mensajes dentro de chats
    await db.collection('whatsappchats').createIndex(
      { phone: 1, "messages.createdAt": -1 },
      { name: 'phone_messages_createdAt' }
    );
    
    console.log('✅ Índices creados exitosamente');
    
    // Mostrar estadísticas de índices
    console.log('\n📈 Estadísticas de índices:');
    
    const recordIndexes = await db.collection('dynamicrecords').indexes();
    console.log(`📊 dynamicrecords: ${recordIndexes.length} índices`);
    
    const chatIndexes = await db.collection('whatsappchats').indexes();
    console.log(`💬 whatsappchats: ${chatIndexes.length} índices`);
    
    console.log('\n🎯 Optimización completada. El endpoint debería ser mucho más rápido ahora.');
    
  } catch (error) {
    console.error('❌ Error optimizando índices:', error);
  } finally {
    await client.close();
  }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  optimizeIndexes().catch(console.error);
}

module.exports = { optimizeIndexes };
