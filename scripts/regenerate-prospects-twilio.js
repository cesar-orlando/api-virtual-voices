#!/usr/bin/env node

const twilio = require('twilio');
const mongoose = require('mongoose');
require('dotenv').config({ path: '.env' });

console.log('📱 OBTENIENDO NÚMEROS DE TELÉFONO DE TWILIO');
console.log('📅 Del 21 de septiembre al 18 de octubre de 2025');
console.log('');

// Función para calcular similitud entre strings (Levenshtein Distance simplificado)
function calculateSimilarity(str1, str2) {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  // Si son iguales, similitud perfecta
  if (s1 === s2) return 1;
  
  // Calcular coincidencias de palabras clave
  const words1 = s1.split(/\s+/);
  const words2 = s2.split(/\s+/);
  
  let matches = 0;
  for (const word1 of words1) {
    if (words2.some(word2 => word1.includes(word2) || word2.includes(word1))) {
      matches++;
    }
  }
  
  // Calcular similitud basada en palabras coincidentes
  const maxWords = Math.max(words1.length, words2.length);
  return matches / maxWords;
}

// Función para encontrar el mejor match de mensaje
function findBestMessageMatch(userMessage, predefinedMessages) {
  if (!userMessage || userMessage === '[Mensaje sin texto - multimedia]') {
    return { medio: 'ORGANICO', campana: 'ORGANICO', similarity: 0 };
  }
  
  let bestMatch = null;
  let bestSimilarity = 0;
  
  for (const predefined of predefinedMessages) {
    const similarity = calculateSimilarity(userMessage, predefined.message);
    
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestMatch = predefined;
    }
  }
  
  // Si la similitud es muy baja, marcar como desconocido
  if (bestSimilarity < 0.6) {
    return { medio: 'ORGANICO', campana: 'ORGANICO', similarity: bestSimilarity };
  }
  
  return { 
    medio: bestMatch.medio, 
    campana: bestMatch.campana, 
    similarity: bestSimilarity 
  };
}

// Configuración - usar las variables que tienes
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

console.log('🔧 Configuración detectada:');
console.log(`📞 Número Twilio: ${phoneNumber || 'No configurado'}`);
console.log(`🆔 Account SID: ${accountSid ? 'Configurado' : 'No configurado'}`);
console.log(`🔑 Auth Token: ${authToken ? 'Configurado' : 'No configurado'}`);
console.log('');

if (!accountSid || !authToken) {
  console.error('❌ Error: Necesitas configurar en tu .env:');
  console.error('   TWILIO_ACCOUNT_SID=tu_account_sid');
  console.error('   TWILIO_AUTH_TOKEN=tu_auth_token');
  console.error('   TWILIO_PHONE_NUMBER=+5213341610749');
  process.exit(1);
}

const client = twilio(accountSid, authToken);

// MongoDB Connection
const QUICKLEARNING_URI = process.env.MONGO_URI_QUICKLEARNING;

if (!QUICKLEARNING_URI) {
  console.error('❌ Error: MONGO_URI_QUICKLEARNING no está configurado en .env');
  process.exit(1);
}

// Define DynamicRecord Schema
const dynamicRecordSchema = new mongoose.Schema({
  tableSlug: String,
  data: mongoose.Schema.Types.Mixed,
  c_name: String
}, { 
  collection: 'dynamicrecords',
  strict: false 
});

async function connectToMongoDB() {
  try {
    console.log('🔗 Conectando a MongoDB QuickLearning...');
    await mongoose.connect(QUICKLEARNING_URI);
    console.log('✅ Conectado a MongoDB QuickLearning');
  } catch (error) {
    console.error('❌ Error conectando a MongoDB:', error.message);
    process.exit(1);
  }
}

async function updateProspectData(phoneNumber, medio, campana) {
  try {
    const DynamicRecord = mongoose.model('DynamicRecord', dynamicRecordSchema);
    
    // Buscar el prospecto por número de teléfono
    const prospecto = await DynamicRecord.findOne({
      tableSlug: 'prospectos',
      'data.number': phoneNumber
    });
    
    if (prospecto) {
      // Actualizar medio y campaña
      prospecto.data.medio = medio;
      prospecto.data.campana = campana;
      
      // ✅ CRITICAL: Mark 'data' as modified for Mongoose to detect changes in Mixed type
      prospecto.markModified('data');
      
      // Registrar quién hizo la actualización (script automatizado)
      prospecto.updatedBy = 'twilio-sync-script';
      await prospecto.save();
      
      return { updated: true, prospecto };
    } else {
      return { updated: false, reason: 'No encontrado' };
    }
  } catch (error) {
    console.error(`❌ Error actualizando prospecto ${phoneNumber}:`, error.message);
    return { updated: false, reason: error.message };
  }
}

async function obtenerNumeros() {
  // Definir mensajes predefinidos al inicio de la función
  const predefinedMessages = [
    {
      message: "Hola. Quiero info sobre el inicio de curso.",
      medio: "META",
      campana: "Inicio de Curso"
    },
    {
      message: "Hola, quiero info sobre los cursos de inglés (u).",
      medio: "META",
      campana: "USA"
    },
    {
      message: "Hola, quiero info sobre los cursos de inglés (c).",
      medio: "META",
      campana: "Can"
    },
    {
      message: "Hola, quiero más información sobre los cursos de inglés de Quick Learning. Los busque en Google.",
      medio: "GOOGLE",
      campana: "Google"
    },
    {
      message: "Hola, me encantaría recibir información de sus cursos.",
      medio: "GOOGLE",
      campana: "Google"
    },
    {
      message: "Hola, quiero más info sobre los cursos presenciales.",
      medio: "META",
      campana: "Presencial"
    },
    {
      message: "Hola, quiero más info sobre los cursos virtuales.",
      medio: "META",
      campana: "Virtual"
    },
    {
      message: "Hola, quiero info sobre la promo virtual.",
      medio: "META",
      campana: "Virtual Promos"
    },
    {
      message: "Hola, quiero más info sobre los cursos online.",
      medio: "META",
      campana: "Online"
    },
    {
      message: "Hola, quiero info sobre la promo online.",
      medio: "META",
      campana: "online"
    },
    {
      message: "Hola, quiero info sobre los cursos de inglés.",
      medio: "META",
      campana: "General"
    },
    {
      message: "Hola. Quiero info sobre los cursos de inglés",
      medio: "META",
      campana: "General"
    },
    {
      message: "Hola. Quiero más info sobre los cursos de inglés en línea.",
      medio: "META",
      campana: "General"
    },
    {
      message: "Hola, quiero info sobre los cursos de inglés (r).",
      medio: "META",
      campana: "RMKT"
    },
    {
      message: "Medio: Meta Campana: RMKT",
      medio: "META",
      campana: "RMKT"
    },
    {
      message: "Hola, quiero más info sobre el curso SMART.",
      medio: "META",
      campana: "SMART"
    },
    {
      message: "Más info de los cursos, los vi en tik tok.",
      medio: "TIKTOK",
      campana: "TIKTOK"
    },
    {
      message: "Hola. Quiero información sobre la flash sale del 30% en virtual.",
      medio: "META",
      campana: "FlashV 30%"
    }
  ];

  try {
    // Conectar a MongoDB primero
    await connectToMongoDB();
    
    console.log('🔍 Buscando mensajes...');
    
    const phoneData = new Map(); // Usar Map para almacenar número y primer mensaje
    let totalMessages = 0;
    let pageCount = 0;
    
    // Fechas del rango
    const startDate = new Date('2025-09-21T00:00:00.000Z');
    const endDate = new Date('2025-10-18T23:59:59.999Z');
    
    console.log(`📅 Rango: ${startDate.toISOString()} - ${endDate.toISOString()}`);
    
    let hasMore = true;
    let nextPageToken = null;
    
    while (hasMore) {
      pageCount++;
      console.log(`📄 Procesando página ${pageCount}...`);
      
    // Obtener mensajes de esta página (ordenados por fecha ascendente para obtener los primeros)
    const messages = await client.messages.list({
      to: `whatsapp:${phoneNumber}`, // Filtrar solo mensajes entrantes a nuestro número
      dateSentAfter: startDate,
      dateSentBefore: endDate,
      pageSize: 1000,
      pageToken: nextPageToken
    });
    
    // Ordenar mensajes por fecha ascendente (más antiguos primero)
    messages.sort((a, b) => new Date(a.dateSent) - new Date(b.dateSent));
      
      console.log(`📊 Página ${pageCount}: ${messages.length} mensajes encontrados`);
      
      // Si no hay mensajes, salir del bucle
      if (messages.length === 0) {
        console.log('⚠️ No se encontraron mensajes en este rango de fechas');
        break;
      }
      
      // Procesar mensajes de esta página (ya filtrados por 'to')
      for (const message of messages) {
        totalMessages++;
        
        let phone = message.from;
        if (phone.startsWith('whatsapp:')) {
          phone = phone.replace('whatsapp:', '');
        }
        
        // Si es la primera vez que vemos este número, guardar el mensaje
        if (!phoneData.has(phone)) {
          const userMessage = message.body || '[Mensaje sin texto - multimedia]';
          
          // Encontrar el mejor match con los mensajes predefinidos
          const match = findBestMessageMatch(userMessage, predefinedMessages);
          
          phoneData.set(phone, {
            number: phone,
            mensaje: userMessage,
            fecha: message.dateSent,
            medio: match.medio,
            campana: match.campana,
            similarity: match.similarity
          });
          
          // Mostrar cada número encontrado con su primer mensaje y clasificación
          console.log(`📞 ${phoneData.size}. ${phone}`);
          console.log(`   💬 "${userMessage}"`);
          console.log(`   📊 Medio: ${match.medio} | Campaña: ${match.campana} (${(match.similarity * 100).toFixed(0)}% match)`);
          console.log(`   📅 ${message.dateSent}`);
        }
      }
      
      // Verificar si hay más páginas
      hasMore = messages.length === 1000;
      if (hasMore && messages.length > 0) {
        // Usar el SID del último mensaje como token para la siguiente página
        nextPageToken = messages[messages.length - 1].sid;
      }
      
      // Pausa pequeña para no sobrecargar la API
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    console.log('\n📊 RESULTADOS FINALES:');
    console.log(`📱 Total de mensajes procesados: ${totalMessages}`);
    console.log(`📞 Números únicos que enviaron mensajes: ${phoneData.size}`);
    
    // Convertir a array y ordenar por número
    const sortedPhoneData = Array.from(phoneData.values()).sort((a, b) => a.number.localeCompare(b.number));
    
    // Actualizar MongoDB con los datos de medio y campaña
    console.log('\n🔄 ACTUALIZANDO BASE DE DATOS...');
    console.log('='.repeat(80));
    
    let updatedCount = 0;
    let notFoundCount = 0;
    let errorCount = 0;
    
    // Tracking arrays for detailed reporting
    const notFoundNumbers = [];
    const errorNumbers = [];
    const updatedByMedio = {};
    
    for (const data of sortedPhoneData) {
      // Extraer solo el número sin el prefijo de whatsapp

      const result = await updateProspectData(data.number, data.medio, data.campana);

      if (result.updated) {
        updatedCount++;
        console.log(`✅ ${updatedCount}/${sortedPhoneData.length} - ${data.number} → ${data.medio} / ${data.campana}`);
        
        // Track updates by medio
        const medioKey = data.medio;
        if (!updatedByMedio[medioKey]) {
          updatedByMedio[medioKey] = 0;
        }
        updatedByMedio[medioKey]++;
      } else if (result.reason === 'No encontrado') {
        notFoundCount++;
        notFoundNumbers.push(data.number);
        console.log(`⚠️  ${data.number} - No encontrado en prospectos`);
      } else {
        errorCount++;
        errorNumbers.push({ number: data.number, error: result.reason });
        console.log(`❌ ${data.number} - Error: ${result.reason}`);
      }
    }
    
    console.log('\n📊 RESUMEN DE ACTUALIZACIÓN:');
    console.log('='.repeat(80));
    console.log(`✅ Actualizados exitosamente: ${updatedCount} (${((updatedCount/sortedPhoneData.length)*100).toFixed(1)}%)`);
    console.log(`⚠️  No encontrados en DB: ${notFoundCount} (${((notFoundCount/sortedPhoneData.length)*100).toFixed(1)}%)`);
    console.log(`❌ Errores: ${errorCount} (${((errorCount/sortedPhoneData.length)*100).toFixed(1)}%)`);
    console.log(`📊 Total procesados: ${sortedPhoneData.length}`);
    
    // Show breakdown by medio
    if (Object.keys(updatedByMedio).length > 0) {
      console.log('\n📈 ACTUALIZACIONES POR MEDIO:');
      console.log('='.repeat(80));
      Object.entries(updatedByMedio)
        .sort((a, b) => b[1] - a[1])
        .forEach(([medio, count]) => {
          console.log(`  ${medio}: ${count} actualizados (${((count/updatedCount)*100).toFixed(1)}%)`);
        });
    }
    
    // Show not found numbers if any
    if (notFoundNumbers.length > 0) {
      console.log('\n⚠️  NÚMEROS NO ENCONTRADOS EN BASE DE DATOS:');
      console.log('='.repeat(80));
      notFoundNumbers.forEach((num, idx) => {
        console.log(`  ${idx + 1}. ${num}`);
      });
    }
    
    // Show errors if any
    if (errorNumbers.length > 0) {
      console.log('\n❌ NÚMEROS CON ERRORES:');
      console.log('='.repeat(80));
      errorNumbers.forEach((item, idx) => {
        console.log(`  ${idx + 1}. ${item.number} - ${item.error}`);
      });
    }
    
    // Calcular estadísticas de clasificación
    const clasificacionStats = {};
    sortedPhoneData.forEach(data => {
      const key = `${data.medio} - ${data.campana}`;
      clasificacionStats[key] = (clasificacionStats[key] || 0) + 1;
    });
    
    console.log('\n📊 ESTADÍSTICAS DE CLASIFICACIÓN:');
    console.log('='.repeat(80));
    Object.entries(clasificacionStats)
      .sort((a, b) => b[1] - a[1])
      .forEach(([key, count]) => {
        console.log(`${key}: ${count} números (${((count / sortedPhoneData.length) * 100).toFixed(1)}%)`);
      });
    
    // Guardar en archivo
    const fs = require('fs');
    const filename = `numeros-con-mensajes-${startDate.toISOString().split('T')[0]}-al-${endDate.toISOString().split('T')[0]}.txt`;
    
    // Generar estadísticas para el archivo
    const statsText = Object.entries(clasificacionStats)
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => `  ${key}: ${count} números (${((count / sortedPhoneData.length) * 100).toFixed(1)}%)`)
      .join('\n');
    
    const content = `NÚMEROS QUE ENVIARON MENSAJES A TWILIO CON PRIMER MENSAJE Y CLASIFICACIÓN
Del ${startDate.toISOString().split('T')[0]} al ${endDate.toISOString().split('T')[0]}

Total de números únicos: ${phoneData.size}
Total de mensajes procesados: ${totalMessages}
Páginas procesadas: ${pageCount}

ESTADÍSTICAS DE CLASIFICACIÓN:
${statsText}

LISTA DE NÚMEROS CON PRIMER MENSAJE Y CLASIFICACIÓN:
${sortedPhoneData.map((data, index) => 
  `${index + 1}. ${data.number}
   Mensaje: "${data.mensaje}"
   Medio: ${data.medio} | Campaña: ${data.campana} (${(data.similarity * 100).toFixed(0)}% match)
   Fecha: ${data.fecha}`
).join('\n\n')}`;
    
    fs.writeFileSync(filename, content);
    console.log(`\n💾 Lista con mensajes guardada en: ${filename}`);
    
    // Guardar en formato JSON
    const jsonFilename = `numeros-con-mensajes-${startDate.toISOString().split('T')[0]}-al-${endDate.toISOString().split('T')[0]}.json`;
    const jsonData = {
      resumen: {
        totalNumeros: phoneData.size,
        totalMensajes: totalMessages,
        paginas: pageCount,
        fechaInicio: startDate.toISOString(),
        fechaFin: endDate.toISOString(),
        clasificacion: clasificacionStats
      },
      numeros: sortedPhoneData
    };
    
    fs.writeFileSync(jsonFilename, JSON.stringify(jsonData, null, 2));
    console.log(`💾 Datos JSON guardados en: ${jsonFilename}`);
    
    // También guardar solo los números (uno por línea)
    const numbersOnlyFilename = `solo-numeros-${startDate.toISOString().split('T')[0]}-al-${endDate.toISOString().split('T')[0]}.txt`;
    fs.writeFileSync(numbersOnlyFilename, sortedPhoneData.map(data => data.number).join('\n'));
    console.log(`💾 Solo números guardados en: ${numbersOnlyFilename}`);
    
    // Cerrar conexión a MongoDB
    await mongoose.connection.close();
    console.log('\n🔌 Conexión a MongoDB cerrada');
    console.log('\n✅ PROCESO COMPLETADO EXITOSAMENTE');
    
  } catch (error) {
    if (error.message.includes('Timeout')) {
      console.log('⚠️ No se encontraron mensajes en el rango de fechas 2025-09-21 al 2025-10-18');
      console.log('💡 Sugerencia: Las fechas del 2025 aún no tienen mensajes. ¿Quieres buscar en 2024?');
    } else {
      console.error('❌ Error:', error.message);
      if (error.code) {
        console.error(`Código de error: ${error.code}`);
      }
      if (error.moreInfo) {
        console.error(`Más información: ${error.moreInfo}`);
      }
    }
  } finally {
    // Asegurar que cerramos la conexión de MongoDB incluso si hay error
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('\n🔌 Conexión a MongoDB cerrada');
    }
  }
}

obtenerNumeros();