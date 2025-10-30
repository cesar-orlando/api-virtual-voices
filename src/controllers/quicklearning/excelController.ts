import { Request, Response } from "express";
import { getConnectionByCompanySlug } from "../../config/connectionManager";
import getRecordModel from "../../models/record.model";
import * as XLSX from 'xlsx';
import twilio from 'twilio';

// Configuración de Twilio
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

if (!accountSid || !authToken || !phoneNumber) {
  throw new Error('Twilio credentials not configured');
}

const client = twilio(accountSid, authToken);

// Función para calcular similitud entre strings (Levenshtein Distance simplificado)
function calculateSimilarity(str1: string, str2: string): number {
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
function findBestMessageMatch(userMessage: string, predefinedMessages: any[]): any {
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

/**
 * Descargar Excel con datos de prospectos de QuickLearning desde Twilio
 * GET /api/quicklearning/excel/prospectos
 */
export const downloadProspectosExcel = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('📊 Generando Excel de prospectos desde Twilio...');
    
    // Obtener parámetros de consulta
    const { 
      startDate, 
      endDate, 
      medio, 
      campana,
      limit = 10000 
    } = req.query;
    
    // Fechas del rango (usar las mismas del script)
    const start = startDate ? new Date(startDate as string) : new Date('2025-10-19T00:00:00.000Z');
    const end = endDate ? new Date(endDate as string) : new Date('2025-10-31T23:59:59.999Z');
    
    // Asegurar que las fechas incluyan todo el día
    start.setUTCHours(0, 0, 0, 0);
    end.setUTCHours(23, 59, 59, 999);
    
    console.log(`📅 Rango: ${start.toISOString()} - ${end.toISOString()}`);
    
    // Mensajes predefinidos (mismos del script)
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
    
    // Obtener datos de Twilio
    const phoneData = new Map();
    let totalMessages = 0;
    let pageCount = 0;
    let hasMore = true;
    let nextPageToken = null;
    
    while (hasMore) {
      pageCount++;
      console.log(`📄 Procesando página ${pageCount}...`);
      
      // Obtener mensajes de esta página
      const messages = await client.messages.list({
        to: `whatsapp:${phoneNumber}`,
        dateSentAfter: start,
        dateSentBefore: end,
        pageSize: 1000,
        ...(nextPageToken && { pageToken: nextPageToken })
      });
      
      // Ordenar mensajes por fecha ascendente (más antiguos primero)
      messages.sort((a, b) => new Date(a.dateSent).getTime() - new Date(b.dateSent).getTime());
      
      console.log(`📊 Página ${pageCount}: ${messages.length} mensajes encontrados`);
      
      // Si no hay mensajes, salir del bucle
      if (messages.length === 0) {
        console.log('⚠️ No se encontraron mensajes en este rango de fechas');
        break;
      }
      
      // Procesar mensajes de esta página
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
        }
      }
      
      // Verificar si hay más páginas
      hasMore = messages.length === 1000;
      if (hasMore && messages.length > 0) {
        nextPageToken = messages[messages.length - 1].sid;
      }
      
      // Pausa pequeña para no sobrecargar la API
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    console.log(`📊 Total de mensajes procesados: ${totalMessages}`);
    console.log(`📞 Números únicos que enviaron mensajes: ${phoneData.size}`);
    
    // Convertir a array y ordenar por número
    const sortedPhoneData = Array.from(phoneData.values()).sort((a, b) => a.number.localeCompare(b.number));
    
    // Aplicar filtros adicionales si se proporcionan
    let filteredData = sortedPhoneData;
    
    if (medio) {
      filteredData = filteredData.filter(item => item.medio === medio);
    }
    
    if (campana) {
      filteredData = filteredData.filter(item => item.campana === campana);
    }
    
    // Aplicar límite
    if (limit) {
      filteredData = filteredData.slice(0, parseInt(limit as string));
    }
    
    console.log(`📊 Total de prospectos para Excel: ${filteredData.length}`);
    
    // Preparar datos para Excel
    const excelData = filteredData.map((item, index) => ({
      'Número': item.number,
      'Medio': item.medio,
      'Campaña': item.campana,
      'Mensaje': item.mensaje,
      'Fecha': new Date(item.fecha).toLocaleDateString('es-MX'),
      'Hora': new Date(item.fecha).toLocaleTimeString('es-MX'),
      'Similitud': `${(item.similarity * 100).toFixed(0)}%`
    }));
    
    // Crear libro de trabajo
    const workbook = XLSX.utils.book_new();
    
    // Crear hoja de trabajo
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    
    // Configurar ancho de columnas
    const columnWidths = [
      { wch: 20 }, // Número
      { wch: 15 }, // Medio
      { wch: 20 }, // Campaña
      { wch: 50 }, // Mensaje
      { wch: 15 }, // Fecha
      { wch: 10 }, // Hora
      { wch: 10 }  // Similitud
    ];
    worksheet['!cols'] = columnWidths;
    
    // Agregar hoja al libro
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Prospectos Twilio');
    
    // Generar buffer del archivo Excel
    const excelBuffer = XLSX.write(workbook, { 
      type: 'buffer', 
      bookType: 'xlsx',
      compression: true 
    });
    
    // Configurar headers para descarga
    const filename = `prospectos-twilio-${new Date().toISOString().split('T')[0]}.xlsx`;
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', excelBuffer.length);
    
    // Enviar archivo
    res.send(excelBuffer);
    
    console.log(`✅ Excel generado exitosamente: ${filename} (${filteredData.length} registros)`);
    
  } catch (error) {
    console.error('❌ Error generando Excel:', error);
    res.status(500).json({
      success: false,
      message: 'Error generando archivo Excel desde Twilio',
      error: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
};

/**
 * Obtener estadísticas de prospectos desde Twilio
 * GET /api/quicklearning/excel/stats
 */
export const getProspectosStats = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('📊 Obteniendo estadísticas de prospectos desde Twilio...');
    
    // Obtener parámetros de consulta
    const { 
      startDate, 
      endDate 
    } = req.query;
    
    // Fechas del rango
    const start = startDate ? new Date(startDate as string) : new Date('2025-09-22T00:00:00.000Z');
    const end = endDate ? new Date(endDate as string) : new Date('2025-10-28T23:59:59.999Z');
    
    // Asegurar que las fechas incluyan todo el día
    start.setUTCHours(0, 0, 0, 0);
    end.setUTCHours(23, 59, 59, 999);
    
    // Obtener datos de Twilio (misma lógica que downloadProspectosExcel)
    const phoneData = new Map();
    let totalMessages = 0;
    let pageCount = 0;
    let hasMore = true;
    let nextPageToken = null;
    
    // Mensajes predefinidos (mismos del script)
    const predefinedMessages = [
      { message: "Hola. Quiero info sobre el inicio de curso.", medio: "META", campana: "Inicio de Curso" },
      { message: "Hola, quiero info sobre los cursos de inglés (u).", medio: "META", campana: "USA" },
      { message: "Hola, quiero info sobre los cursos de inglés (c).", medio: "META", campana: "Can" },
      { message: "Hola, quiero más información sobre los cursos de inglés de Quick Learning. Los busque en Google.", medio: "GOOGLE", campana: "Google" },
      { message: "Hola, me encantaría recibir información de sus cursos.", medio: "GOOGLE", campana: "Google" },
      { message: "Hola, quiero más info sobre los cursos presenciales.", medio: "META", campana: "Presencial" },
      { message: "Hola, quiero más info sobre los cursos virtuales.", medio: "META", campana: "Virtual" },
      { message: "Hola, quiero info sobre la promo virtual.", medio: "META", campana: "Virtual Promos" },
      { message: "Hola, quiero más info sobre los cursos online.", medio: "META", campana: "Online" },
      { message: "Hola, quiero info sobre la promo online.", medio: "META", campana: "online" },
      { message: "Hola, quiero info sobre los cursos de inglés.", medio: "META", campana: "General" },
      { message: "Hola. Quiero info sobre los cursos de inglés", medio: "META", campana: "General" },
      { message: "Hola. Quiero más info sobre los cursos de inglés en línea.", medio: "META", campana: "General" },
      { message: "Hola, quiero info sobre los cursos de inglés (r).", medio: "META", campana: "RMKT" },
      { message: "Medio: Meta Campana: RMKT", medio: "META", campana: "RMKT" },
      { message: "Hola, quiero más info sobre el curso SMART.", medio: "META", campana: "SMART" },
      { message: "Más info de los cursos, los vi en tik tok.", medio: "TIKTOK", campana: "TIKTOK" },
      { message: "Hola. Quiero información sobre la flash sale del 30% en virtual.", medio: "META", campana: "FlashV 30%" }
    ];
    
    while (hasMore) {
      pageCount++;
      
      const messages = await client.messages.list({
        to: `whatsapp:${phoneNumber}`,
        dateSentAfter: start,
        dateSentBefore: end,
        pageSize: 1000,
        ...(nextPageToken && { pageToken: nextPageToken })
      });
      
      messages.sort((a, b) => new Date(a.dateSent).getTime() - new Date(b.dateSent).getTime());
      
      if (messages.length === 0) break;
      
      for (const message of messages) {
        totalMessages++;
        
        let phone = message.from;
        if (phone.startsWith('whatsapp:')) {
          phone = phone.replace('whatsapp:', '');
        }
        
        if (!phoneData.has(phone)) {
          const userMessage = message.body || '[Mensaje sin texto - multimedia]';
          const match = findBestMessageMatch(userMessage, predefinedMessages);
          
          phoneData.set(phone, {
            number: phone,
            mensaje: userMessage,
            fecha: message.dateSent,
            medio: match.medio,
            campana: match.campana,
            similarity: match.similarity
          });
        }
      }
      
      hasMore = messages.length === 1000;
      if (hasMore && messages.length > 0) {
        nextPageToken = messages[messages.length - 1].sid;
      }
      
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    // Calcular estadísticas
    const totalProspectos = phoneData.size;
    const statsByMedio: { [key: string]: number } = {};
    const statsByCampana: { [key: string]: number } = {};
    const statsByMes: { [key: string]: number } = {};
    
    phoneData.forEach((item) => {
      const medio = item.medio || 'No especificado';
      const campana = item.campana || 'No especificado';
      const mes = new Date(item.fecha).toLocaleDateString('es-MX', { 
        year: 'numeric', 
        month: 'long' 
      });
      
      statsByMedio[medio] = (statsByMedio[medio] || 0) + 1;
      statsByCampana[campana] = (statsByCampana[campana] || 0) + 1;
      statsByMes[mes] = (statsByMes[mes] || 0) + 1;
    });
    
    // Ordenar estadísticas
    const sortedStatsByMedio = Object.entries(statsByMedio)
      .sort(([,a], [,b]) => b - a)
      .map(([medio, count]) => ({ medio, count, percentage: ((count / totalProspectos) * 100).toFixed(1) }));
    
    const sortedStatsByCampana = Object.entries(statsByCampana)
      .sort(([,a], [,b]) => b - a)
      .map(([campana, count]) => ({ campana, count, percentage: ((count / totalProspectos) * 100).toFixed(1) }));
    
    const sortedStatsByMes = Object.entries(statsByMes)
      .sort(([,a], [,b]) => b - a)
      .map(([mes, count]) => ({ mes, count, percentage: ((count / totalProspectos) * 100).toFixed(1) }));
    
    res.json({
      success: true,
      data: {
        totalProspectos,
        totalMensajes: totalMessages,
        porMedio: sortedStatsByMedio,
        porCampana: sortedStatsByCampana,
        porMes: sortedStatsByMes,
        fechaGeneracion: new Date().toISOString(),
        fuente: 'Twilio API'
      }
    });
    
    console.log(`✅ Estadísticas generadas desde Twilio: ${totalProspectos} prospectos`);
    
  } catch (error) {
    console.error('❌ Error obteniendo estadísticas:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo estadísticas desde Twilio',
      error: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
};

/**
 * Descargar Excel combinado: Twilio (hoja 1) + Prospectos DB (hoja 2)
 * GET /api/quicklearning/excel/prospectos-combinado
 * Query:
 * - startDate, endDate: ISO strings
 * - companySlug: por defecto 'quicklearning'
 */
export const downloadProspectosCombinadoExcel = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('📊 Generando Excel combinado Twilio + DB...');
    const {
      startDate,
      endDate,
      companySlug = 'quicklearning',
      medio,
      campana
    } = req.query;

    const start = startDate ? new Date(startDate as string) : new Date('2025-10-19T00:00:00.000Z');
    const end = endDate ? new Date(endDate as string) : new Date('2025-10-31T23:59:59.999Z');
    start.setUTCHours(0, 0, 0, 0);
    end.setUTCHours(23, 59, 59, 999);

    // 1) Hoja Twilio: reutilizar lógica de recopilación (primer mensaje por número) con clasificación
    const twilioMap = new Map<string, any>();
    let hasMore = true;
    let nextPageToken: string | null = null;
    const predefinedMessages = [
      { message: "Hola. Quiero info sobre el inicio de curso.", medio: "META", campana: "Inicio de Curso" },
      { message: "Hola, quiero info sobre los cursos de inglés (u).", medio: "META", campana: "USA" },
      { message: "Hola, quiero info sobre los cursos de inglés (c).", medio: "META", campana: "Can" },
      { message: "Hola, quiero más información sobre los cursos de inglés de Quick Learning. Los busque en Google.", medio: "GOOGLE", campana: "Google" },
      { message: "Hola, me encantaría recibir información de sus cursos.", medio: "GOOGLE", campana: "Google" },
      { message: "Hola, quiero más info sobre los cursos presenciales.", medio: "META", campana: "Presencial" },
      { message: "Hola, quiero más info sobre los cursos virtuales.", medio: "META", campana: "Virtual" },
      { message: "Hola, quiero info sobre la promo virtual.", medio: "META", campana: "Virtual Promos" },
      { message: "Hola, quiero más info sobre los cursos online.", medio: "META", campana: "Online" },
      { message: "Hola, quiero info sobre la promo online.", medio: "META", campana: "online" },
      { message: "Hola, quiero info sobre los cursos de inglés.", medio: "META", campana: "General" },
      { message: "Hola. Quiero info sobre los cursos de inglés", medio: "META", campana: "General" },
      { message: "Hola. Quiero más info sobre los cursos de inglés en línea.", medio: "META", campana: "General" },
      { message: "Hola, quiero info sobre los cursos de inglés (r).", medio: "META", campana: "RMKT" },
      { message: "Medio: Meta Campana: RMKT", medio: "META", campana: "RMKT" },
      { message: "Hola, quiero más info sobre el curso SMART.", medio: "META", campana: "SMART" },
      { message: "Más info de los cursos, los vi en tik tok.", medio: "TIKTOK", campana: "TIKTOK" },
      { message: "Hola. Quiero información sobre la flash sale del 30% en virtual.", medio: "META", campana: "FlashV 30%" }
    ];
    while (hasMore) {
      const messages = await client.messages.list({
        to: `whatsapp:${phoneNumber}`,
        dateSentAfter: start,
        dateSentBefore: end,
        pageSize: 1000,
        ...(nextPageToken && { pageToken: nextPageToken })
      });
      messages.sort((a, b) => new Date(a.dateSent).getTime() - new Date(b.dateSent).getTime());
      if (messages.length === 0) break;
      for (const message of messages) {
        let phone = message.from;
        if (phone.startsWith('whatsapp:')) phone = phone.replace('whatsapp:', '');
        if (!twilioMap.has(phone)) {
          const body = message.body || '[Mensaje sin texto - multimedia]';
          const match = findBestMessageMatch(body, predefinedMessages);
          twilioMap.set(phone, {
            number: phone,
            mensaje: body,
            fecha: message.dateSent,
            medio: match.medio,
            campana: match.campana,
            similarity: match.similarity
          });
        }
      }
      hasMore = messages.length === 1000;
      if (hasMore) nextPageToken = messages[messages.length - 1].sid;
    }

    let twilioRows = Array.from(twilioMap.values());
    if (medio) twilioRows = twilioRows.filter((r: any) => r.medio === medio);
    if (campana) twilioRows = twilioRows.filter((r: any) => r.campana === campana);
    const twilioSheetData = twilioRows.map((item: any) => ({
      'Número': item.number,
      'Medio': item.medio,
      'Campaña': item.campana,
      'Mensaje': item.mensaje,
      'Fecha': new Date(item.fecha).toLocaleDateString('es-MX'),
      'Hora': new Date(item.fecha).toLocaleTimeString('es-MX'),
      'Similitud': `${Math.round((item.similarity || 0) * 100)}%`
    }));

    // 2) Hoja Prospectos DB: DynamicRecord(tableSlug='prospectos', c_name=companySlug)
    const conn = await getConnectionByCompanySlug(companySlug as string);
    const Record = getRecordModel(conn);
    const dbQuery: any = {
      tableSlug: 'prospectos',
      c_name: companySlug,
      $or: [
        { createdAt: { $gte: start, $lte: end } },
        { 'data.lastmessagedate': { $gte: start, $lte: end } }
      ]
    };
    if (medio) dbQuery['data.medio'] = medio;
    if (campana) dbQuery['data.campana'] = campana;
    const dbProspects = await Record.find(dbQuery).select({ data: 1, createdAt: 1 }).lean();

    const dbSheetData = dbProspects.map((doc: any) => {
      const msg = doc?.data?.lastmessage || '';
      const match = findBestMessageMatch(msg, predefinedMessages);
      return {
        'Número': doc?.data?.number ?? '',
        'Medio': doc?.data?.medio ?? '',
        'Campaña': doc?.data?.campana ?? '',
        'Mensaje': msg,
        'Fecha': new Date(doc?.data?.lastmessagedate || doc.createdAt).toLocaleDateString('es-MX'),
        'Hora': new Date(doc?.data?.lastmessagedate || doc.createdAt).toLocaleTimeString('es-MX'),
        'Similitud': `${Math.round((match?.similarity || 0) * 100)}%`
      };
    });

    // 3) Construir Excel con 2 hojas
    const workbook = XLSX.utils.book_new();
    const wsTwilio = XLSX.utils.json_to_sheet(twilioSheetData);
    const wsDB = XLSX.utils.json_to_sheet(dbSheetData);

    wsTwilio['!cols'] = [
      { wch: 20 },
      { wch: 50 },
      { wch: 15 },
      { wch: 10 },
      { wch: 10 }
    ];
    wsDB['!cols'] = [
      { wch: 20 },
      { wch: 15 },
      { wch: 20 },
      { wch: 50 },
      { wch: 15 },
      { wch: 10 },
      { wch: 10 }
    ];

    XLSX.utils.book_append_sheet(workbook, wsTwilio, 'Prospectos Twilio');
    XLSX.utils.book_append_sheet(workbook, wsDB, 'Prospectos DB');

    const filename = `prospectos-combinado-${new Date().toISOString().split('T')[0]}.xlsx`;
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
    console.log(`✅ Excel combinado generado: ${filename} | Twilio: ${twilioSheetData.length} | DB: ${dbSheetData.length}`);
  } catch (error) {
    console.error('❌ Error generando Excel combinado:', error);
    res.status(500).json({
      success: false,
      message: 'Error generando archivo Excel combinado',
      error: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
};