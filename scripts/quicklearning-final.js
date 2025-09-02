#!/usr/bin/env node

/**
 * SCRIPT FINAL - Quick Learning Campaign Classifier
 * 
 * Este script:
 * 1. Lee todos los chats
 * 2. Toma el primer mensaje de cada chat
 * 3. Clasifica la campaña según el mensaje
 * 4. Actualiza la tabla de prospectos
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGO_URI_QUICKLEARNING;

if (!MONGODB_URI) {
  console.error('❌ ERROR: MONGO_URI_QUICKLEARNING no está configurada');
  process.exit(1);
}

// MENSAJES EXACTOS - Coincidencia exacta con los templates (SIN puntuación final)
const EXACT_MESSAGE_MAPPING = {
  // USA
  'hola, quiero info sobre los cursos de inglés (u)': {
    campaign: 'USA',
    medio: 'Meta'
  },
  
  // CAN
  'hola, quiero info sobre los cursos de inglés (c)': {
    campaign: 'CAN',
    medio: 'Meta'
  },
  
  // PRESENCIAL
  'hola, quiero más info sobre los cursos presenciales': {
    campaign: 'PRESENCIAL',
    medio: 'Meta'
  },
  'hola, quiero más info sobre el curso smart': {
    campaign: 'PRESENCIAL',
    medio: 'Meta'
  },
  'hola. quiero más info de la sucursal satélite': {
    campaign: 'PRESENCIAL',
    medio: 'Meta'
  },
  
  // VIRTUAL
  'hola, quiero más info sobre los cursos virtuales': {
    campaign: 'VIRTUAL',
    medio: 'Meta'
  },
  
  // VIRTUAL PROMOS
  'hola, quiero info sobre la promo virtual': {
    campaign: 'VIRTUAL PROMOS',
    medio: 'Meta'
  },
  
  // ONLINE
  'hola, quiero más info sobre los cursos online': {
    campaign: 'ONLINE',
    medio: 'Meta'
  },
  
  // ONLINE PROMOS
  'hola, quiero info sobre la promo online': {
    campaign: 'ONLINE PROMOS',
    medio: 'Meta'
  },
  
  // GENERAL
  'hola, quiero info sobre los cursos de inglés': {
    campaign: 'GENERAL',
    medio: 'Meta'
  },
  
  // RMKT
  'hola, quiero info sobre los cursos de inglés (r)': {
    campaign: 'RMKT',
    medio: 'Meta'
  },
  
  // GOOGLE - Variaciones conocidas
  'hola, me encantaría recibir información de sus cursos': {
    campaign: 'GOOGLE',
    medio: 'Google'
  },
  'hola, quiero más información sobre los cursos de inglés de quick learning. los busque en google': {
    campaign: 'GOOGLE',
    medio: 'Google'
  }
};

/**
 * Detecta la campaña basada en coincidencia exacta del mensaje
 */
function detectCampaign(message, debug = false) {
  if (!message) {
    if (debug) console.log('      -> ORGANICO (mensaje vacío)');
    return { campaign: 'ORGANICO', medio: 'Interno' };
  }
  
  // Normalizar el mensaje: lowercase, trim, quitar espacios extra y puntuación final
  const normalizedMessage = message.toLowerCase().trim()
    .replace(/\s+/g, ' ') // Múltiples espacios a uno solo
    .replace(/[.]{2,}/g, '.') // Múltiples puntos a uno solo
    .replace(/[.,!?;:]$/, ''); // Quitar puntuación al final
  
  if (debug) {
    console.log(`      Mensaje original: "${message}"`);
    console.log(`      Mensaje normalizado: "${normalizedMessage}"`);
  }
  
  // Buscar coincidencia exacta
  if (EXACT_MESSAGE_MAPPING[normalizedMessage]) {
    const match = EXACT_MESSAGE_MAPPING[normalizedMessage];
    if (debug) console.log(`      -> ${match.campaign} (coincidencia exacta)`);
    return match;
  }
  
  // Si no hay coincidencia exacta, es ORGANICO
  if (debug) console.log('      -> ORGANICO (no coincide exactamente)');
  return { campaign: 'ORGANICO', medio: 'Interno' };
}

/**
 * Función principal
 */
async function processQuickLearningCampaigns() {
  let client;
  
  try {
    console.log('🚀 INICIANDO PROCESAMIENTO - Quick Learning Campaigns (COINCIDENCIA EXACTA)');
    console.log('=' .repeat(70));
    console.log(`📡 Conectando a MongoDB...`);
    
    client = new MongoClient(MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 30000,
      maxIdleTimeMS: 30000,
      connectTimeoutMS: 30000
    });
    await client.connect();
    
    // Verificar conexión
    await client.db().admin().ping();
    console.log('✅ Conectado exitosamente y verificado');
    
    const db = client.db();
    const chatsCollection = db.collection('chats');
    const recordsCollection = db.collection('dynamicrecords');
    
    // PASO 1: Obtener todos los chats (filtrar por fechas)
    console.log('\n📊 PASO 1: Obteniendo todos los chats...');
    
    // Filtro de fechas: del 21 de agosto 2025 hasta el 23 de agosto 2025 
    const startDate = new Date('2025-08-23T00:00:00.000Z');
    const endDate = new Date('2025-09-02T23:59:59.999Z');
    
    console.log(`   Filtrando chats entre ${startDate.toLocaleDateString()} y ${endDate.toLocaleDateString()}`);
    
    const allChats = await chatsCollection.find({
      createdAt: {
        $gte: startDate,
        $lte: endDate
      }
    }).toArray();
    
    console.log(`   Encontrados: ${allChats.length} chats en el rango de fechas`);
    
    if (allChats.length === 0) {
      console.log('❌ No hay chats para procesar en el rango de fechas especificado');
      return;
    }
    
    // PASO 2: Procesar cada chat y obtener el primer mensaje
    console.log('\n📝 PASO 2: Procesando mensajes...');
    const chatAnalysis = [];
    let chatsWithMessages = 0;
    let chatsWithFirstMessage = 0;
    
    for (let i = 0; i < allChats.length; i++) {
      const chat = allChats[i];
      
      if (i % 1000 === 0) {
        console.log(`   Procesando chat ${i + 1}/${allChats.length}...`);
      }
      
      if (!chat.phone) {
        continue; // Skip chats sin phone
      }
      
      if (!chat.messages || chat.messages.length === 0) {
        continue; // Skip chats sin mensajes
      }
      
      chatsWithMessages++;
      
      // Buscar el primer mensaje del usuario (inbound) - los mensajes están en orden cronológico
      const firstUserMessage = chat.messages.find(msg => msg.direction === 'inbound');
      
      if (!firstUserMessage || !firstUserMessage.body) {
        continue; // Skip si no hay mensaje del usuario
      }
      
      chatsWithFirstMessage++;
      
      // DEBUG: Mostrar algunos ejemplos de mensajes y su clasificación
      const isDebugChat = chatsWithFirstMessage <= 20;
      if (isDebugChat) {
        console.log(`   🔍 DEBUG - Chat ${chatsWithFirstMessage}:`);
        console.log(`      Phone: ${chat.phone}`);
        console.log(`      ProfileName: ${chat.profileName || 'Sin nombre'}`);
        console.log(`      Total mensajes: ${chat.messages.length}`);
        console.log(`      Primer mensaje inbound: "${firstUserMessage.body}"`);
        console.log(`      Fecha creación chat: ${new Date(chat.createdAt).toLocaleString()}`);
      }
      
      // Detectar campaña con coincidencia exacta
      const detectionResult = detectCampaign(firstUserMessage.body, isDebugChat);
      
      if (isDebugChat) {
        console.log(`      Clasificado como: ${detectionResult.campaign} (${detectionResult.medio})`);
        console.log('');
      }
      
      chatAnalysis.push({
        phone: chat.phone,
        chatId: chat._id,
        firstMessage: firstUserMessage.body,
        detectedCampaign: detectionResult.campaign,
        medio: detectionResult.medio,
        standardMessage: firstUserMessage.body // Usar el mensaje original
      });
    }
    
    console.log(`   Chats con mensajes: ${chatsWithMessages}`);
    console.log(`   Chats con primer mensaje del usuario: ${chatsWithFirstMessage}`);
    console.log(`   Chats analizados: ${chatAnalysis.length}`);
    
    // Mostrar distribución de campañas detectadas
    console.log('\n📊 DISTRIBUCIÓN DE CAMPAÑAS DETECTADAS:');
    const campaignCount = {};
    chatAnalysis.forEach(analysis => {
      campaignCount[analysis.detectedCampaign] = (campaignCount[analysis.detectedCampaign] || 0) + 1;
    });
    
    Object.entries(campaignCount).forEach(([campaign, count]) => {
      const percentage = ((count / chatAnalysis.length) * 100).toFixed(1);
      console.log(`   ${campaign}: ${count} (${percentage}%)`);
    });
    
    // Mostrar algunos ejemplos de cada campaña
    console.log('\n📝 EJEMPLOS DE MENSAJES POR CAMPAÑA:');
    Object.keys(campaignCount).forEach(campaignType => {
      const examples = chatAnalysis.filter(a => a.detectedCampaign === campaignType).slice(0, 3);
      if (examples.length > 0) {
        console.log(`\n   ${campaignType} (${campaignCount[campaignType] || 0} total):`);
        examples.forEach((example, index) => {
          console.log(`      ${index + 1}. "${example.firstMessage}"`);
        });
      }
    });
    
    // PASO 3: Buscar prospectos correspondientes
    console.log('\n🔍 PASO 3: Vinculando con prospectos...');
    
    // Primero, vamos a ver qué tableSlugs existen
    console.log('   🔍 DEBUG: Verificando tableSlugs disponibles...');
    const tableSlugs = await recordsCollection.distinct('tableSlug');
    console.log(`   Encontrados tableSlugs: ${tableSlugs.join(', ')}`);
    
    // Verificar si hay registros con quicklearning
    const quicklearningCount = await recordsCollection.countDocuments({
      tableSlug: { $regex: /quicklearning/i }
    });
    console.log(`   Registros con 'quicklearning' en tableSlug: ${quicklearningCount}`);
    
    // Probar algunos teléfonos específicos
    const samplePhones = chatAnalysis.slice(0, 3).map(a => a.phone);
    console.log(`   🔍 DEBUG: Probando teléfonos de muestra: ${samplePhones.join(', ')}`);
    
    for (const phone of samplePhones) {
      const testProspecto = await recordsCollection.findOne({
        $or: [
          { 'data.telefono': phone },
          { 'data.phone': phone }
        ]
      });
      console.log(`   Teléfono ${phone}: ${testProspecto ? 'ENCONTRADO' : 'NO ENCONTRADO'}`);
      if (testProspecto) {
        console.log(`     tableSlug: ${testProspecto.tableSlug}`);
        console.log(`     data keys: ${Object.keys(testProspecto.data || {}).join(', ')}`);
      }
    }
    
    const updates = [];
    let prospectsFound = 0;
    
    for (let i = 0; i < chatAnalysis.length; i++) {
      const analysis = chatAnalysis[i];
      
      if (i % 500 === 0) {
        console.log(`   Vinculando ${i + 1}/${chatAnalysis.length}...`);
      }
      
      // Buscar prospecto por teléfono (probando diferentes tableSlugs)
      const prospecto = await recordsCollection.findOne({
        $or: [
          { 'data.telefono': analysis.phone },
          { 'data.phone': analysis.phone }
        ]
      });
      
      if (prospecto) {
        prospectsFound++;
        
        const oldCampaign = prospecto.data?.campana || 'N/A';
        const oldMedio = prospecto.data?.medio || 'N/A';
        
        // Solo agregar si hay cambios
        if (oldCampaign !== analysis.detectedCampaign || oldMedio !== analysis.medio) {
          updates.push({
            prospectoId: prospecto._id,
            phone: analysis.phone,
            firstMessage: analysis.firstMessage,
            oldCampaign: oldCampaign,
            newCampaign: analysis.detectedCampaign,
            oldMedio: oldMedio,
            newMedio: analysis.medio,
            standardMessage: analysis.standardMessage
          });
        }
      }
    }
    
    console.log(`   Prospectos encontrados: ${prospectsFound}`);
    console.log(`   Prospectos que necesitan actualización: ${updates.length}`);
    
    // PASO 4: Mostrar preview de cambios
    console.log('\n📋 PASO 4: PREVIEW DE CAMBIOS:');
    console.log('=' .repeat(70));
    
    if (updates.length === 0) {
      console.log('✅ No hay cambios que hacer. Todos los prospectos ya están actualizados.');
      return;
    }
    
    // Mostrar algunos ejemplos
    console.log(`\nMostrando primeros ${Math.min(10, updates.length)} cambios:`);
    updates.slice(0, 10).forEach((update, index) => {
      console.log(`\n${index + 1}. 📱 ${update.phone}`);
      console.log(`   💬 Primer mensaje: "${update.firstMessage.substring(0, 100)}${update.firstMessage.length > 100 ? '...' : ''}"`);
      console.log(`   🏷️  Campaña: ${update.oldCampaign} → ${update.newCampaign}`);
      console.log(`   📡 Medio: ${update.oldMedio} → ${update.newMedio}`);
    });
    
    if (updates.length > 10) {
      console.log(`\n... y ${updates.length - 10} cambios más`);
    }
    
    // Mostrar distribución de campañas
    console.log('\n📈 DISTRIBUCIÓN DE NUEVAS CAMPAÑAS:');
    const campaignDistribution = {};
    updates.forEach(update => {
      campaignDistribution[update.newCampaign] = (campaignDistribution[update.newCampaign] || 0) + 1;
    });
    
    Object.entries(campaignDistribution).forEach(([campaign, count]) => {
      console.log(`   ${campaign}: ${count} prospectos`);
    });
    
    console.log('\n💾 HAZ UN BACKUP DE TU BASE DE DATOS ANTES DE CONTINUAR');
    console.log('=' .repeat(70));
    
    // PASO 5: Confirmar actualización
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    return new Promise((resolve) => {
      rl.question('¿Estás seguro de que quieres continuar? (escribe "SI" para confirmar): ', async (answer) => {
        if (answer.toUpperCase() === 'SI') {
          console.log('\n🚀 Confirmado. Iniciando actualización...');
          
          let updatedCount = 0;
          let errorCount = 0;
          
          // Procesar en lotes más pequeños para evitar timeout
          const BATCH_SIZE = 50;
          const batches = [];
          
          for (let i = 0; i < updates.length; i += BATCH_SIZE) {
            batches.push(updates.slice(i, i + BATCH_SIZE));
          }
          
          console.log(`   Procesando ${updates.length} actualizaciones en ${batches.length} lotes de ${BATCH_SIZE}`);
          
          for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = batches[batchIndex];
            console.log(`   📦 Lote ${batchIndex + 1}/${batches.length} (${batch.length} registros)...`);
            
            // Verificar que la conexión sigue activa antes de cada lote
            try {
              await client.db().admin().ping();
            } catch (pingError) {
              console.log('⚠️  Reconectando a MongoDB...');
              await client.connect();
            }
            
            // Procesar cada item del lote
            for (let i = 0; i < batch.length; i++) {
              const update = batch[i];
              const globalIndex = (batchIndex * BATCH_SIZE) + i + 1;
              
              try {
                const result = await recordsCollection.updateOne(
                  { _id: update.prospectoId },
                  {
                    $set: {
                      'data.campana': update.newCampaign,
                      'data.medio': update.newMedio,
                      'data.ultimo_mensaje': update.standardMessage
                    }
                  }
                );
                
                if (result.modifiedCount > 0) {
                  updatedCount++;
                  console.log(`✅ ${globalIndex}/${updates.length}: ${update.phone} → ${update.newCampaign}`);
                }
              } catch (error) {
                errorCount++;
                console.error(`❌ ${globalIndex}/${updates.length}: Error en ${update.phone} - ${error.message}`);
              }
            }
            
            // Pequeña pausa entre lotes para no saturar la conexión
            if (batchIndex < batches.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 200));
            }
          }
          
          console.log('\n🎯 RESUMEN FINAL:');
          console.log(`   📊 Total de cambios planificados: ${updates.length}`);
          console.log(`   ✅ Prospectos actualizados: ${updatedCount}`);
          console.log(`   ❌ Errores: ${errorCount}`);
          console.log('\n✅ ¡Actualización completada con COINCIDENCIA EXACTA!');
          
        } else {
          console.log('❌ Cancelado por el usuario');
        }
        
        rl.close();
        resolve();
      });
    });
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    if (client) {
      await client.close();
      console.log('\n🔌 Conexión cerrada');
    }
  }
}

// Ejecutar
processQuickLearningCampaigns()
  .then(() => {
    console.log('🎉 Script completado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Error fatal:', error);
    process.exit(1);
  });
