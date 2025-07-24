const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

// Conectar directamente a MongoDB
const quicklearningUri = process.env.MONGO_URI_QUICKLEARNING;
console.log(quicklearningUri);
if (!quicklearningUri) {
  console.error('❌ MONGO_URI_QUICKLEARNING no configurado');
  process.exit(1);
}

// Esquema para el chat de QuickLearning (usando la colección 'chats')
const chatSchema = new mongoose.Schema({
  phone: { 
    type: String, 
    required: true, 
    unique: true,
    index: true
  },
  profileName: { type: String },
  messages: [
    {
      direction: { 
        type: String, 
        enum: ["inbound", "outbound-api"], 
        required: true 
      },
      body: { type: String, required: true },
      dateCreated: { type: Date, default: Date.now },
      respondedBy: { 
        type: String, 
        enum: ["bot", "human", "asesor"], 
        required: true 
      },
      responseTime: { type: Number },
      twilioSid: { type: String },
      mediaUrl: [{ type: String }],
      messageType: { 
        type: String, 
        enum: ["text", "image", "audio", "video", "location", "document"], 
        default: "text" 
      },
      metadata: {
        lat: { type: Number },
        lng: { type: Number },
        type: mongoose.Schema.Types.Mixed
      }
    },
  ],
  linkedTable: {
    refModel: { type: String, required: true },
    refId: { 
      type: mongoose.Schema.Types.ObjectId, 
      required: true, 
      refPath: "linkedTable.refModel" 
    },
  },
  advisor: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    name: { type: String },
  },
  conversationStart: { type: Date, default: Date.now },
  lastMessage: {
    body: { type: String },
    date: { type: Date },
    respondedBy: { type: String }
  },
  aiEnabled: { type: Boolean, default: true },
  status: { 
    type: String, 
    enum: ["active", "inactive", "blocked"], 
    default: "active" 
  },
  tags: [{ type: String }],
  notes: { type: String },
  customerInfo: {
    name: { type: String },
    email: { type: String },
    city: { type: String },
    interests: [{ type: String }],
    stage: { 
      type: String, 
      enum: ["prospecto", "interesado", "inscrito", "no_prospecto"], 
      default: "prospecto" 
    }
  }
}, { 
  timestamps: true,
  collection: 'chats'  // ¡IMPORTANTE! Esto fuerza que use la colección 'chats'
});

// Función para obtener conexión
async function getQuickLearningConnection() {
  const conn = mongoose.createConnection(quicklearningUri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    bufferCommands: true, // Cambiar a true para evitar errores
    ssl: true,
    tls: true,
    retryWrites: true,
    w: 'majority'
  });
  
  // Esperar a que la conexión esté lista
  await conn.asPromise();
  return conn;
}

// Función para obtener el modelo - ¡IMPORTANTE! Usar el nombre correcto
function getQuickLearningChatModel(conn) {
  return conn.model('Chat', chatSchema, 'chats'); // Especificar explícitamente la colección 'chats'
}



// Función para normalizar números de teléfono con prefijo +
function normalizePhoneNumber(phone) {
  if (!phone || phone === 'Sin teléfono') {
    return 'Sin teléfono';
  }
  
  // Limpiar el número de caracteres no numéricos
  const cleanPhone = phone.replace(/\D/g, '');
  
  // Si ya tiene el prefijo +, retornarlo tal como está
  if (phone.startsWith('+')) {
    return phone;
  }
  
  // Si empieza con 52 (código de país de México), agregar +
  if (cleanPhone.startsWith('52')) {
    return `+${cleanPhone}`;
  }
  
  // Si no empieza con 52, asumir que es un número mexicano y agregar +52
  if (cleanPhone.length === 10) {
    return `+52${cleanPhone}`;
  }
  
  // Si tiene 11 dígitos y empieza con 1, agregar +52
  if (cleanPhone.length === 11 && cleanPhone.startsWith('1')) {
    return `+52${cleanPhone.substring(1)}`;
  }
  
  // Para cualquier otro caso, agregar +52 al inicio
  return `+52${cleanPhone}`;
}

// Mapeo de ladas a ciudades (actualizado con datos de Wikipedia)
const ladaPorEstado = {
  "Aguascalientes": ["449","458","465","495","496"],
  "Baja California": ["616","646","653","658","661","663","664","665","686"],
  "Baja California Sur": ["612","613","615","624"],
  "Campeche": ["913","938","981","982","983","996"],
  "Chiapas": ["916","917","918","919","932","934","961","962","963","964","965","966","967","968","992","994"],
  "Chihuahua": ["614","621","625","626","627","628","629","635","636","639","648","649","652","656","657","659"],
  "Coahuila": ["671","842","844","861","862","864","866","867","869","871","872","873","877","878"],
  "Colima": ["312","313","314"],
  "Ciudad de México": ["55","56"],
  "Durango": ["618","629","649","671","674","675","676","677","871","872"],
  "Estado de México": ["55","56","427","588","591","592","593","594","595","596","597","599","711","712","713","714","716","717","718","719","721","722","723","724","725","726","728","729","743","751","761","767"],
  "Guanajuato": ["352","411","412","413","415","417","418","419","421","428","429","432","438","442","445","456","461","462","464","466","468","469","472","473","476","477","479"],
  "Guerrero": ["721","727","732","733","736","741","742","744","745","747","753","754","755","756","757","758","762","767","781"],
  "Hidalgo": ["441","483","591","738","743","746","748","759","761","763","771","772","773","774","775","776","778","779","789","791"],
  "Jalisco": ["33","312","315","316","317","321","322","326","341","342","343","344","345","346","347","348","349","354","357","358","371","372","373","374","375","376","377","378","382","384","385","386","387","388","391","392","393","395","424","431","437","457","474","475","495","496","499"],
  "Michoacán": ["313","328","351","352","353","354","355","356","359","381","383","393","394","421","422","423","424","425","426","434","435","436","438","443","447","451","452","453","454","455","459","471","711","715","753","767","786"],
  "Morelos": ["731","734","735","737","739","751","769","777"],
  "Nayarit": ["311","319","322","323","324","325","327","329","389","437"],
  "Nuevo León": ["81","488","821","823","824","825","826","828","829","867","873","892"],
  "Oaxaca": ["236","274","281","283","287","741","757","924","951","953","954","958","971","972","994","995"],
  "Puebla": ["221","222","223","224","226","227","231","232","233","236","237","238","243","244","245","248","249","273","275","276","278","282","746","764","776","797","953"],
  "Querétaro": ["414","419","427","441","442","446","448","487"],
  "Quintana Roo": ["983","984","987","997","998"],
  "San Luis Potosí": ["444"],
  "Sinaloa": ["667","669"],
  "Sonora": ["662"],
  "Tabasco": ["993"],
  "Tamaulipas": ["834","899"],
  "Tlaxcala": ["246"],
  "Veracruz": ["229","228"],
  "Yucatán": ["999"],
  "Zacatecas": ["492"]
};

// Convertir el objeto por estado a un mapeo directo de lada a ciudad
const LADA_TO_CITY = {};
for (const [estado, ladas] of Object.entries(ladaPorEstado)) {
  for (const lada of ladas) {
    LADA_TO_CITY[lada] = estado;
  }
}

function getCityByLada(phone) {
  // Limpiar el número y quitar el prefijo +52, 521, 522, etc.
  let cleanPhone = phone.replace(/\D/g, ''); // Solo números
  if (cleanPhone.startsWith('52')) {
    cleanPhone = cleanPhone.replace(/^52(1|2)?/, '');
  }
  // Probar primero con lada de 2 dígitos
  let lada = cleanPhone.substring(0, 2);
  if (LADA_TO_CITY[lada]) {
    return LADA_TO_CITY[lada];
  }
  // Si no existe, probar con lada de 3 dígitos
  lada = cleanPhone.substring(0, 3);
  if (LADA_TO_CITY[lada]) {
    return LADA_TO_CITY[lada];
  }
  return 'CDMX'; // Default
}

async function mapSinContestar(record, UserModel) {
  // Inicializar con valores por defecto
  const mappedData = {
    nombre: null,
    telefono: null,
    email: null,
    clasificacion: null,
    medio: 'Meta', // Valor fijo
    curso: null,
    ciudad: null,
    campana: 'RMKT', // Valor fijo
    comentario: null,
    asesor: null,
    ultimo_mensaje: null,
    aiEnabled: false,
    lastMessageDate: null
  };
  
  let asesorNombre = null;
  let asesorEmail = null;
  let asesorOriginal = null;
  let lastMessageDate = null;
  
  // Mapear campos desde customFields
  for (const field of record.customFields) {
    switch (field.key) {
      case 'name': 
        mappedData.nombre = field.value || 'Sin nombre'; 
        break;
      case 'phone': 
        // Agregar + al teléfono si no lo tiene
        const phoneValue = field.value || 'Sin teléfono';
        mappedData.telefono = phoneValue.startsWith('+') ? phoneValue : `+${phoneValue}`;
        mappedData.ciudad = getCityByLada(field.value);
        break;
      case 'email': 
        mappedData.email = field.value || null; 
        break;
      case 'classification': 
        mappedData.clasificacion = field.value || null; 
        break;
      case 'asesor': 
        // Procesar asesor como en el script de prospectos
        if (typeof field.value === 'string' && field.value.startsWith('{')) {
          try {
            asesorOriginal = JSON.parse(field.value);
            asesorNombre = asesorOriginal.name;
            asesorEmail = asesorOriginal.email;
          } catch { asesorNombre = field.value; asesorOriginal = { name: field.value }; }
        } else if (typeof field.value === 'object' && field.value !== null) {
          asesorOriginal = field.value;
          asesorNombre = field.value.name;
          asesorEmail = field.value.email;
        } else {
          asesorNombre = field.value;
          asesorOriginal = { name: field.value };
        }
        break;
      case 'ai': 
        mappedData.aiEnabled = field.value === true || field.value === 'true'; 
        break;
      case 'lastMessage': 
        mappedData.ultimo_mensaje = field.value || null; 
        break;
      case 'lastMessageTime': 
        lastMessageDate = field.value || null; 
        break;
    }
  }
  
  // Buscar asesor en la colección de usuarios SOLO por nombre
  let user = null;
  let asesorFound = false;
  if (asesorNombre) {
    user = await UserModel.findOne({ name: asesorNombre });
    if (user) {
      asesorFound = true;
      console.log(`   👤 Asesor encontrado: ${user.name} (ID: ${user._id})`);
    } else {
      console.log(`   ⚠️  Asesor no encontrado en BD local: ${asesorNombre}`);
    }
  }
  
  // Construir el objeto asesor final
  let asesorFinal = null;
  if (user && asesorFound) {
    // Usar datos del usuario encontrado en BD local
    asesorFinal = {
      name: user.name,
      _id: user._id.toString(),
      email: user.email || null
    };
    console.log(`   ✅ Asesor asignado correctamente: ${user.name} (ID: ${user._id})`);
  } else if (asesorOriginal && asesorOriginal.name) {
    // Usar datos originales si no se encontró en BD local
    asesorFinal = {
      name: asesorOriginal.name,
      _id: asesorOriginal._id || null,
      email: asesorOriginal.email || null
    };
    console.log(`   ⚠️  Usando datos originales del asesor: ${asesorOriginal.name} (ID: ${asesorOriginal._id || 'N/A'})`);
  } else if (asesorNombre) {
    // Solo nombre disponible
    asesorFinal = { name: asesorNombre, _id: null, email: null };
    console.log(`   ⚠️  Solo nombre disponible para asesor: ${asesorNombre} (sin ID)`);
  } else {
    console.log(`   ℹ️  No hay información de asesor disponible`);
  }
  
  mappedData.asesor = asesorFinal ? JSON.stringify(asesorFinal) : null;
  
  // Valores por defecto obligatorios
  if (!mappedData.nombre) mappedData.nombre = 'Sin nombre';
  if (!mappedData.telefono) mappedData.telefono = 'Sin teléfono';
  if (!mappedData.ciudad) mappedData.ciudad = 'CDMX';
  
  // lastMessageDate dentro de data
  mappedData.lastMessageDate = lastMessageDate || new Date();
  
  return mappedData;
}

async function getChatInfo(phone) {
  try {
    // Normalizar número de teléfono
    const normalizedPhone = normalizePhoneNumber(phone);
    if (!normalizedPhone || normalizedPhone === 'Sin teléfono') {
      return null;
    }

    // Limpiar número de teléfono para la API (sin el +)
    const cleanPhone = normalizedPhone.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone === 'Sinteléfono') {
      return null;
    }

    // Obtener mensajes del chat desde la API externa
    const response = await axios.get(`https://api.quick-learning.virtualvoices.com.mx/api/whatsapp/chat/${cleanPhone}`);
    const messages = response.data;
    if (Array.isArray(messages) && messages.length > 0) {
      // Ordenar por dateCreated descendente y tomar el más reciente
      const lastMsg = messages.sort((a, b) => new Date(b.dateCreated) - new Date(a.dateCreated))[0];
      return {
        ultimo_mensaje: lastMsg.body || null,
        lastMessageDate: lastMsg.dateCreated || null,
        messages: messages
      };
    }
    return null;
  } catch (error) {
    // Si no se encuentra el chat, retornar null
    return null;
  }
}

async function checkDuplicateProspect(phone) {
  try {
    // Normalizar el teléfono para la búsqueda
    const normalizedPhone = normalizePhoneNumber(phone);
    
    // Buscar específicamente por teléfono en la tabla prospectos
    const response = await axios.get(`http://localhost:3001/api/records/table/quicklearning/prospectos?page=1&limit=2000`);
    const records = response.data.records;
    
    // Verificar si existe algún record con el mismo teléfono (comparar ambos normalizados)
    const duplicate = records.find(record => {
      const recordPhone = normalizePhoneNumber(record.data?.telefono);
      return recordPhone === normalizedPhone;
    });
    
    if (duplicate) {
      console.log(`   🔍 Duplicado encontrado: ${duplicate.data?.nombre} (${duplicate.data?.telefono})`);
    }
    
    return !!duplicate;
  } catch (error) {
    console.error('Error verificando duplicados:', error.message);
    return false;
  }
}

async function importSinContestarFromAPI() {
  try {
    console.log('📖 Obteniendo datos de sin contestar desde la API...');
    
    // Conectar a la base de datos para obtener el modelo de usuarios
    const conn = await getQuickLearningConnection();
    const UserModel = conn.model('User', new mongoose.Schema({
      name: String,
      email: String,
      _id: mongoose.Schema.Types.ObjectId
    }));
    
    // Obtener datos desde la API
    const response = await axios.get('https://api.quick-learning.virtualvoices.com.mx/api/records/alumnos');
    const data = response.data;
    const records = data.records;
    
    console.log(`📊 Total de registros a procesar: ${records.length}`);
    
    let successCount = 0;
    let errorCount = 0;
    let duplicateCount = 0;
    let noChatCount = 0;
    
    // Continuar desde el registro 109 (índice 108) donde se quedó
    const startIndex = 108; // Cambia este número si quieres reanudar desde otro punto
    console.log(`🚀 Continuando desde el registro ${startIndex + 1} (índice ${startIndex})`);
    for (let i = startIndex; i < records.length; i++) {
      const record = records[i];
      const mappedRecord = await mapSinContestar(record, UserModel);
      
      // Preparar el payload para el POST
      const postPayload = {
        tableSlug: 'alumnos',
        c_name: 'quicklearning',
        createdBy: 'admin@quicklearning.com',
        data: mappedRecord
      };
      // Agregar createdAt del registro externo si existe
      if (record.createdAt) {
        postPayload.createdAt = record.createdAt;
      }
      
      console.log(`\n🔄 Importando registro ${i + 1}/${records.length}: ${mappedRecord.nombre}`);
      console.log(`   📱 Teléfono: ${mappedRecord.telefono}`);
      console.log(`   🏙️  Ciudad: ${mappedRecord.ciudad}`);
      
      try {
        // Verificar si ya existe el prospecto por teléfono
        const isDuplicate = await checkDuplicateProspect(mappedRecord.telefono);
        if (isDuplicate) {
          console.log(`   ⚠️  Prospecto con teléfono ${mappedRecord.telefono} ya existe, omitiendo`);
          duplicateCount++;
          continue;
        }
        
        // Obtener información del chat ANTES de crear el registro
        console.log(`   🔍 Buscando chat para ${mappedRecord.telefono}...`);
        const chatInfo = await getChatInfo(mappedRecord.telefono);
        
        if (!chatInfo || !chatInfo.messages || chatInfo.messages.length === 0) {
          console.log(`   ❌ NO SE ENCONTRÓ CHAT para ${mappedRecord.nombre} (${mappedRecord.telefono})`);
          noChatCount++;
          continue;
        }
        
        // Actualizar con información del chat
        mappedRecord.ultimo_mensaje = chatInfo.ultimo_mensaje || mappedRecord.ultimo_mensaje;
        mappedRecord.lastMessageDate = chatInfo.lastMessageDate || mappedRecord.lastMessageDate;
        console.log(`   ✅ Chat encontrado con ${chatInfo.messages.length} mensajes`);
        console.log(`   📅 Último mensaje: ${chatInfo.lastMessageDate ? new Date(chatInfo.lastMessageDate).toLocaleString() : 'N/A'}`);
        console.log(`   💬 Mensaje: ${chatInfo.ultimo_mensaje ? chatInfo.ultimo_mensaje.substring(0, 50) + '...' : 'N/A'}`);
        
        // Crear el registro
        const createResponse = await axios.post('http://localhost:3001/api/records', postPayload);
        
        // Validar que la respuesta tiene un _id válido
        const newRecordId = createResponse?.data?.record?._id;
        if (!newRecordId) {
          console.log(`   ❌ Error: No se obtuvo el _id del registro creado para el prospecto.`);
          console.log(`   📋 Respuesta completa de la API:`);
          console.log(`   ${JSON.stringify(createResponse?.data, null, 2)}`);
          console.log(`   🛑 DETENIENDO TODO EL PROCESO - No se puede continuar sin el ID del registro`);
          console.log(`   📍 Último prospecto procesado exitosamente: ${successCount > 0 ? 'Sí' : 'No'}`);
          console.log(`   📍 Total de prospectos procesados antes del error: ${successCount}`);
          console.log(`   📍 Índice del prospecto problemático: ${i + 1}`);
          console.log(`   📍 Nombre del prospecto problemático: ${mappedRecord.nombre}`);
          console.log(`   📍 Teléfono del prospecto problemático: ${mappedRecord.telefono}`);
          console.log(`\n🎯 RESUMEN FINAL:`);
          console.log(`✅ Prospectos importados exitosamente: ${successCount}`);
          console.log(`⚠️  Prospectos duplicados omitidos: ${duplicateCount}`);
          console.log(`❌ Errores: ${errorCount}`);
          console.log(`🚫 Error sin _id (proceso detenido): 1`);
          console.log(`📊 Total procesados: ${i + 1}`);
          process.exit(1);
        }
        
        console.log(`   ✅ Registro creado exitosamente`);
        
        // Guardar chat en la colección de chats
        try {
          console.log(`   💬 Guardando chat en colección 'chats'...`);
          const Chat = getQuickLearningChatModel(conn);
          
          // Verificar si el chat ya existe
          let existingChat = await Chat.findOne({ phone: mappedRecord.telefono });
          
          // Mapear mensajes al formato correcto
          const mappedMessages = chatInfo.messages.map(msg => ({
            direction: msg.direction || 'inbound',
            body: msg.body || '',
            dateCreated: msg.dateCreated || new Date(),
            respondedBy: msg.respondedBy || 'human',
            responseTime: msg.responseTime,
            twilioSid: msg.twilioSid,
            mediaUrl: msg.mediaUrl || [],
            messageType: msg.messageType || 'text',
            metadata: msg.metadata || {}
          }));
          
          const firstMsg = chatInfo.messages[0];
          const lastMsg = chatInfo.messages[chatInfo.messages.length - 1];
          
          if (existingChat) {
            // Actualizar chat existente
            console.log(`   🔄 Chat existente encontrado, actualizando...`);
            
            // Agregar mensajes nuevos (sin duplicar)
            const existingIds = new Set(existingChat.messages.map(m => m._id?.toString()));
            const newMessages = mappedMessages.filter(msg => !existingIds.has(msg._id?.toString()));
            
            if (newMessages.length > 0) {
              existingChat.messages.push(...newMessages);
            }
            
            // Actualizar información del chat
            existingChat.profileName = mappedRecord.nombre;
            existingChat.linkedTable = {
              refModel: 'Record',
              refId: newRecordId
            };
            existingChat.lastMessage = {
              body: lastMsg?.body || '',
              date: lastMsg?.dateCreated || new Date(),
              respondedBy: lastMsg?.respondedBy || 'human'
            };
            existingChat.customerInfo = {
              name: mappedRecord.nombre,
              city: mappedRecord.ciudad,
              stage: 'prospecto'
            };
            
            await existingChat.save();
            console.log(`   ✅ Chat existente actualizado con ${newMessages.length} mensajes nuevos`);
          } else {
            // Crear nuevo chat
            console.log(`   ➕ Creando nuevo chat...`);
            const chat = new Chat({
              phone: mappedRecord.telefono,
              profileName: mappedRecord.nombre,
              linkedTable: {
                refModel: 'Record',
                refId: newRecordId
              },
              conversationStart: firstMsg?.dateCreated || new Date(),
              lastMessage: {
                body: lastMsg?.body || '',
                date: lastMsg?.dateCreated || new Date(),
                respondedBy: lastMsg?.respondedBy || 'human'
              },
              messages: mappedMessages,
              status: 'active',
              aiEnabled: true,
              customerInfo: {
                name: mappedRecord.nombre,
                city: mappedRecord.ciudad,
                stage: 'prospecto'
              }
            });
            
            await chat.save();
            console.log(`   ✅ Chat nuevo creado exitosamente con ${mappedMessages.length} mensajes`);
          }
        } catch (chatError) {
          console.log(`   ❌ Error guardando chat: ${chatError.message}`);
          console.log(`   🛑 DETENIENDO TODO EL PROCESO - No se puede continuar sin guardar el chat`);
          console.log(`   📍 Último prospecto procesado exitosamente: ${successCount > 0 ? 'Sí' : 'No'}`);
          console.log(`   📍 Total de prospectos procesados antes del error: ${successCount}`);
          console.log(`   📍 Índice del prospecto problemático: ${i + 1}`);
          console.log(`   📍 Nombre del prospecto problemático: ${mappedRecord.nombre}`);
          console.log(`   📍 Teléfono del prospecto problemático: ${mappedRecord.telefono}`);
          console.log(`\n🎯 RESUMEN FINAL:`);
          console.log(`✅ Prospectos importados exitosamente: ${successCount}`);
          console.log(`⚠️  Prospectos duplicados omitidos: ${duplicateCount}`);
          console.log(`❌ Errores: ${errorCount}`);
          console.log(`🚫 Error guardando chat (proceso detenido): 1`);
          console.log(`📊 Total procesados: ${i + 1}`);
          process.exit(1); // Detener todo el proceso
        }
        
        successCount++;
        
        // Pequeña pausa para no sobrecargar el servidor
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.log(`   ❌ Error: ${error.response?.data?.message || error.message}`);
        errorCount++;
      }
    }
    
    console.log(`\n🎉 Importación completada exitosamente!`);
    console.log(`✅ Registros creados: ${successCount}`);
    console.log(`⚠️  Prospectos duplicados omitidos: ${duplicateCount}`);
    console.log(`❌ Errores: ${errorCount}`);
    console.log(`📊 Total procesados: ${records.length}`);
    
  } catch (error) {
    console.error('❌ Error general:', error.message);
  }
}

async function importChatsFromSinContestar() {
  try {
    console.log('💬 Importando chats de registros sin contestar...');
    // Obtener todos los registros de sin contestar
    const response = await axios.get('http://localhost:3001/api/records/table/quicklearning/alumnos?page=1&limit=2000');
    const records = response.data.records;
    console.log(`📊 Total registros de sin contestar: ${records.length}`);
    let created = 0;
    let skipped = 0;
    let errors = 0;
    for (const record of records) {
      const phone = record.data?.telefono;
      const name = record.data?.nombre;
      if (!phone || phone === 'Sin teléfono') {
        console.log(`⚠️  Registro sin teléfono: ${name}`);
        skipped++;
        continue;
      }
      try {
        // Obtener mensajes del endpoint externo (sin + para la API)
        const cleanPhone = phone.replace(/\D/g, '');
        const chatResp = await axios.get(`https://api.quick-learning.virtualvoices.com.mx/api/whatsapp/chat/${cleanPhone}`);
        const messages = chatResp.data;
        if (!Array.isArray(messages) || messages.length === 0) {
          console.log(`⚠️  Sin mensajes para ${name} (${phone})`);
          skipped++;
          continue;
        }
        // Crear chat local
        const normalizedPhone = normalizePhoneNumber(phone);
        const chatData = {
          phone: normalizedPhone,
          profileName: name,
          messages: messages,
          status: 'active',
          createdAt: messages[0].dateCreated || new Date(),
        };
        await axios.post('http://localhost:3001/api/whatsapp/chat', chatData);
        console.log(`✅ Chat creado para ${name} (${phone})`);
        created++;
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        if (error.response && error.response.data) {
          console.log(`❌ Error creando chat para ${name}:`, JSON.stringify(error.response.data, null, 2));
        } else {
          console.log(`❌ Error creando chat para ${name}: ${error.message}`);
        }
        errors++;
      }
    }
    console.log(`\n🎉 Proceso de importación de chats completado!`);
    console.log(`✅ Chats creados: ${created}`);
    console.log(`⚠️  Registros sin mensajes: ${skipped}`);
    console.log(`❌ Errores: ${errors}`);
    console.log(`📊 Total procesados: ${records.length}`);
  } catch (error) {
    console.error('❌ Error general:', error.message);
  }
}

// Función para sincronizar con chats después de la importación
async function syncWithChats() {
  try {
    console.log('🔄 Sincronizando registros con chats existentes...\n');
    
    // Obtener todos los registros de sin contestar
    const response = await axios.get('http://localhost:3001/api/records/table/quicklearning/alumnos?page=1&limit=2000');
    const records = response.data.records;
    
    console.log(`📊 Total registros de sin contestar: ${records.length}`);
    
    let updatedCount = 0;
    let chatFoundCount = 0;
    let noChatCount = 0;
    
    for (const record of records) {
      const phone = record.data?.telefono;
      const name = record.data?.nombre;
      
      if (!phone || phone === 'Sin teléfono') {
        console.log(`⚠️  Registro sin teléfono: ${name}`);
        continue;
      }
      
      try {
        // Obtener información del chat desde la API externa
        const chatInfo = await getChatInfo(phone);
        
        if (chatInfo) {
          // Actualizar registro con información del chat
          await axios.put(`http://localhost:3001/api/records/${record._id}`, {
            data: {
              ...record.data,
              ultimo_mensaje: chatInfo.ultimo_mensaje,
              lastMessageDate: chatInfo.lastMessageDate,
              chatId: chatInfo.chatId,
              status: chatInfo.status
            },
            c_name: 'quicklearning',
            updatedBy: 'admin@quicklearning.com'
          });
          
          console.log(`✅ Actualizado: ${name} (${phone}) - Chat encontrado`);
          console.log(`   💬 Mensaje: ${chatInfo.ultimo_mensaje ? chatInfo.ultimo_mensaje.substring(0, 50) + '...' : 'N/A'}`);
          console.log(`   📅 Fecha: ${chatInfo.lastMessageDate ? new Date(chatInfo.lastMessageDate).toLocaleString() : 'N/A'}`);
          chatFoundCount++;
          updatedCount++;
          
        } else {
          console.log(`⚠️  Sin chat: ${name} (${phone})`);
          noChatCount++;
        }
        
        // Pequeña pausa
        await new Promise(resolve => setTimeout(resolve, 50));
        
      } catch (error) {
        if (error.response && error.response.data) {
          console.log(`❌ Error procesando ${name}:`, JSON.stringify(error.response.data, null, 2));
        } else {
          console.log(`❌ Error procesando ${name}: ${error.message}`);
        }
      }
    }
    
    console.log(`\n🎉 Sincronización completada:`);
    console.log(`✅ Registros actualizados: ${updatedCount}`);
    console.log(`🔗 Chats encontrados: ${chatFoundCount}`);
    console.log(`⚠️  Sin chat: ${noChatCount}`);
    console.log(`📊 Total procesados: ${records.length}`);
    
  } catch (error) {
    console.error('❌ Error general:', error.message);
  }
}

async function syncChatsToDb() {
  try {
    console.log('💬 Sincronizando mensajes en la colección de chats local...');
    // Conexión a la base de datos
    const conn = await getQuickLearningConnection();
    const Chat = getQuickLearningChatModel(conn);
    // Obtener todos los registros de sin contestar
    const response = await axios.get('http://localhost:3001/api/records/table/quicklearning/alumnos?page=1&limit=2000');
    const records = response.data.records;
    console.log(`📊 Total registros de sin contestar: ${records.length}`);
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errorCount = 0;
    
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const phone = record.data?.telefono;
      const name = record.data?.nombre;
      
      console.log(`\n🔄 Procesando chat ${i + 1}/${records.length}: ${name} (${phone})`);
      
      if (!phone || phone === 'Sin teléfono') {
        console.log(`   ⚠️  Registro sin teléfono: ${name}`);
        skipped++;
        continue;
      }
      
      try {
        // Obtener mensajes del endpoint externo (sin + para la API)
        const cleanPhone = phone.replace(/\D/g, '');
        const chatResp = await axios.get(`https://api.quick-learning.virtualvoices.com.mx/api/whatsapp/chat/${cleanPhone}`);
        // Verificar si la respuesta es un error
        if (chatResp.data && chatResp.data.message && chatResp.data.message.includes('no encontrado')) {
          console.log(`   ❌ Chat no encontrado para ${name} (${phone})`);
          console.log(`   🛑 DETENIENDO TODO EL PROCESO - No se puede continuar sin chat`);
          console.log(`   📍 Último chat procesado exitosamente: ${created + updated > 0 ? 'Sí' : 'No'}`);
          console.log(`   📍 Total de chats procesados antes del error: ${created + updated}`);
          console.log(`   📍 Índice del chat problemático: ${i + 1}`);
          console.log(`   📍 Nombre del chat problemático: ${name}`);
          console.log(`   📍 Teléfono del chat problemático: ${phone}`);
          console.log(`\n🎯 RESUMEN FINAL:`);
          console.log(`✅ Chats creados: ${created}`);
          console.log(`✅ Chats actualizados: ${updated}`);
          console.log(`⚠️  Registros omitidos: ${skipped}`);
          console.log(`❌ Errores: ${errorCount}`);
          console.log(`🚫 Chats no encontrados (proceso detenido): 1`);
          console.log(`📊 Total procesados: ${i + 1}`);
          process.exit(1); // Detener todo el proceso
        }
        
        const messages = chatResp.data;
        if (!Array.isArray(messages) || messages.length === 0) {
          console.log(`   ❌ Sin mensajes para ${name} (${phone})`);
          console.log(`   🛑 DETENIENDO TODO EL PROCESO - No se puede continuar sin mensajes`);
          console.log(`   📍 Último chat procesado exitosamente: ${created + updated > 0 ? 'Sí' : 'No'}`);
          console.log(`   📍 Total de chats procesados antes del error: ${created + updated}`);
          console.log(`   📍 Índice del chat problemático: ${i + 1}`);
          console.log(`   📍 Nombre del chat problemático: ${name}`);
          console.log(`   📍 Teléfono del chat problemático: ${phone}`);
          console.log(`\n🎯 RESUMEN FINAL:`);
          console.log(`✅ Chats creados: ${created}`);
          console.log(`✅ Chats actualizados: ${updated}`);
          console.log(`⚠️  Registros omitidos: ${skipped}`);
          console.log(`❌ Errores: ${errorCount}`);
          console.log(`🚫 Chats sin mensajes (proceso detenido): 1`);
          console.log(`📊 Total procesados: ${i + 1}`);
          process.exit(1); // Detener todo el proceso
        }
        
        console.log(`   ✅ Chat encontrado con ${messages.length} mensajes`);
        
        // Buscar chat local (usando teléfono normalizado)
        const normalizedPhone = normalizePhoneNumber(phone);
        let chat = await Chat.findOne({ phone: normalizedPhone });
        if (chat) {
          // Agregar mensajes nuevos (sin duplicar por _id)
          const existingIds = new Set(chat.messages.map(m => m._id?.toString()));
          const newMessages = messages.filter(m => !existingIds.has(m._id?.toString()));
          if (newMessages.length > 0) {
            chat.messages.push(...newMessages);
            await chat.save();
            console.log(`   ✅ Mensajes agregados a chat existente para ${name} (${phone})`);
            updated++;
          } else {
            console.log(`   ⚠️  Chat ya tenía todos los mensajes para ${name} (${phone})`);
            skipped++;
          }
        } else {
          // Crear nuevo chat con estructura completa
          const firstMsg = messages[0];
          const lastMsg = messages[messages.length - 1];
          
          // Mapear mensajes al formato correcto
          const mappedMessages = messages.map(msg => ({
            direction: msg.direction || 'inbound',
            body: msg.body || '',
            dateCreated: msg.dateCreated || new Date(),
            respondedBy: msg.respondedBy || 'human',
            responseTime: msg.responseTime,
            twilioSid: msg.twilioSid,
            mediaUrl: msg.mediaUrl || [],
            messageType: msg.messageType || 'text',
            metadata: msg.metadata || {}
          }));
          
          chat = new Chat({
            phone: normalizedPhone,
            profileName: name,
            linkedTable: {
              refModel: 'Record',
              refId: record._id,
              tableSlug: 'alumnos',
            },
            conversationStart: firstMsg?.dateCreated || new Date(),
            lastMessage: {
              body: lastMsg?.body || '',
              date: lastMsg?.dateCreated || new Date(),
              respondedBy: lastMsg?.respondedBy || 'human'
            },
            messages: mappedMessages,
            status: 'active',
            aiEnabled: true,
            customerInfo: {
              name: name,
              city: record.data?.ciudad || 'CDMX',
              stage: 'prospecto'
            }
          });
          
          await chat.save();
          console.log(`   ✅ Chat creado exitosamente para ${name} (${phone}) con ${mappedMessages.length} mensajes`);
          created++;
        }
        
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        console.log(`   ❌ Error sincronizando chat para ${name}: ${error.message}`);
        errorCount++;
        
        // Si es un error crítico, detener el proceso
        if (error.message.includes('duplicate key') || error.message.includes('validation failed')) {
          console.log(`   🛑 DETENIENDO TODO EL PROCESO - Error crítico en la base de datos`);
          console.log(`   📍 Último chat procesado exitosamente: ${created + updated > 0 ? 'Sí' : 'No'}`);
          console.log(`   📍 Total de chats procesados antes del error: ${created + updated}`);
          console.log(`   📍 Índice del chat problemático: ${i + 1}`);
          console.log(`   📍 Nombre del chat problemático: ${name}`);
          console.log(`   📍 Teléfono del chat problemático: ${phone}`);
          console.log(`\n🎯 RESUMEN FINAL:`);
          console.log(`✅ Chats creados: ${created}`);
          console.log(`✅ Chats actualizados: ${updated}`);
          console.log(`⚠️  Registros omitidos: ${skipped}`);
          console.log(`❌ Errores: ${errorCount}`);
          console.log(`🚫 Error crítico (proceso detenido): 1`);
          console.log(`📊 Total procesados: ${i + 1}`);
          process.exit(1);
        }
      }
    }
    
    console.log(`\n🎉 Proceso de sincronización de chats completado!`);
    console.log(`✅ Chats creados: ${created}`);
    console.log(`✅ Chats actualizados: ${updated}`);
    console.log(`⚠️  Registros sin mensajes o sin cambios: ${skipped}`);
    console.log(`❌ Errores: ${errorCount}`);
    console.log(`📊 Total procesados: ${records.length}`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error general:', error.message);
    process.exit(1);
  }
}

// Ejecutar según el comando
const command = process.argv[2];

switch (command) {
  case '--import':
    importSinContestarFromAPI();
    break;
  case '--sync-chats':
    syncWithChats();
    break;
  case '--full':
    (async () => {
      await importSinContestarFromAPI();
      await new Promise(resolve => setTimeout(resolve, 2000));
      await syncWithChats();
    })();
    break;
  case '--import-chats':
    importChatsFromSinContestar();
    break;
  case '--sync-chats-db':
    syncChatsToDb();
    break;
  default:
    console.log('📋 Comandos disponibles:');
    console.log('  --import: Importar desde la API (con validaciones mejoradas)');
    console.log('  --sync-chats: Sincronizar con chats existentes');
    console.log('  --full: Importar y sincronizar completo');
    break;
} 