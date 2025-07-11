const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

// Conectar directamente a MongoDB
const quicklearningUri = process.env.MONGO_URI_QUICKLEARNING;
if (!quicklearningUri) {
  console.error('❌ MONGO_URI_QUICKLEARNING no configurado');
  process.exit(1);
}

// Esquema simple para el chat
const chatSchema = new mongoose.Schema({
  phone: { type: String, required: true, index: true },
  profileName: String,
  messages: [{
    direction: { type: String, required: true }, // Removido enum para aceptar cualquier valor
    body: { type: String, required: true },
    dateCreated: { type: Date, required: true },
    respondedBy: { type: String, required: true }, // Removido enum para aceptar 'asesor', 'human', 'bot', etc.
    twilioSid: String,
    _id: mongoose.Schema.Types.ObjectId
  }],
  status: { type: String, default: 'active' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Función para obtener conexión
async function getQuickLearningConnection() {
  return mongoose.createConnection(quicklearningUri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    bufferCommands: false,
    ssl: true,
    tls: true,
    retryWrites: true,
    w: 'majority'
  });
}

// Función para obtener el modelo
function getQuickLearningChatModel(conn) {
  return conn.model('QuickLearningChat', chatSchema);
}

// Mapeo de ladas a ciudades (mismo que alumnos)
const LADA_TO_CITY = {
  '521': 'CDMX', '522': 'Guadalajara, Jalisco', '523': 'Morelia, Michoacán', '524': 'Aguascalientes',
  '525': 'CDMX', '526': 'Durango', '527': 'Zacatecas', '528': 'San Luis Potosí', '529': 'Querétaro',
  '531': 'Guanajuato', '532': 'Colima', '533': 'Zacatecas', '534': 'Aguascalientes', '535': 'Jalisco',
  '536': 'Michoacán', '537': 'Hidalgo', '538': 'Tlaxcala', '539': 'Puebla', '540': 'Veracruz',
  '541': 'Oaxaca', '542': 'Chiapas', '543': 'Tabasco', '544': 'Guerrero', '545': 'Morelos',
  '546': 'Tamaulipas', '547': 'Nuevo León', '548': 'Coahuila', '549': 'Chihuahua', '550': 'Sonora',
  '551': 'Baja California', '552': 'Baja California Sur', '553': 'Sinaloa', '554': 'Nayarit',
  '555': 'CDMX', '556': 'CDMX', '557': 'CDMX', '558': 'CDMX', '559': 'CDMX',
  '560': 'Estado de México', '561': 'Estado de México', '562': 'Estado de México', '563': 'Estado de México',
  '564': 'Estado de México', '565': 'Estado de México', '566': 'Estado de México', '567': 'Estado de México',
  '568': 'Estado de México', '569': 'Estado de México', '570': 'Hidalgo', '571': 'Hidalgo', '572': 'Hidalgo',
  '573': 'Hidalgo', '574': 'Hidalgo', '575': 'Hidalgo', '576': 'Hidalgo', '577': 'Hidalgo', '578': 'Hidalgo',
  '579': 'Hidalgo', '580': 'Veracruz', '581': 'Veracruz', '582': 'Veracruz', '583': 'Veracruz', '584': 'Veracruz',
  '585': 'Veracruz', '586': 'Veracruz', '587': 'Veracruz', '588': 'Veracruz', '589': 'Veracruz',
  '590': 'Oaxaca', '591': 'Oaxaca', '592': 'Oaxaca', '593': 'Oaxaca', '594': 'Oaxaca', '595': 'Oaxaca',
  '596': 'Oaxaca', '597': 'Oaxaca', '598': 'Oaxaca', '599': 'Oaxaca', '600': 'Chiapas', '601': 'Chiapas',
  '602': 'Chiapas', '603': 'Chiapas', '604': 'Chiapas', '605': 'Chiapas', '606': 'Chiapas', '607': 'Chiapas',
  '608': 'Chiapas', '609': 'Chiapas', '610': 'Tabasco', '611': 'Tabasco', '612': 'Tabasco', '613': 'Tabasco',
  '614': 'Tabasco', '615': 'Tabasco', '616': 'Tabasco', '617': 'Tabasco', '618': 'Tabasco', '619': 'Tabasco',
  '620': 'Guerrero', '621': 'Guerrero', '622': 'Guerrero', '623': 'Guerrero', '624': 'Guerrero',
  '625': 'Guerrero', '626': 'Guerrero', '627': 'Guerrero', '628': 'Guerrero', '629': 'Guerrero',
  '630': 'Morelos', '631': 'Morelos', '632': 'Morelos', '633': 'Morelos', '634': 'Morelos', '635': 'Morelos',
  '636': 'Morelos', '637': 'Morelos', '638': 'Morelos', '639': 'Morelos', '640': 'Tamaulipas', '641': 'Tamaulipas',
  '642': 'Tamaulipas', '643': 'Tamaulipas', '644': 'Tamaulipas', '645': 'Tamaulipas', '646': 'Tamaulipas',
  '647': 'Tamaulipas', '648': 'Tamaulipas', '649': 'Tamaulipas', '650': 'Nuevo León', '651': 'Nuevo León',
  '652': 'Nuevo León', '653': 'Nuevo León', '654': 'Nuevo León', '655': 'Nuevo León', '656': 'Nuevo León',
  '657': 'Nuevo León', '658': 'Nuevo León', '659': 'Nuevo León', '660': 'Coahuila', '661': 'Coahuila',
  '662': 'Coahuila', '663': 'Coahuila', '664': 'Coahuila', '665': 'Coahuila', '666': 'Coahuila',
  '667': 'Coahuila', '668': 'Coahuila', '669': 'Coahuila', '670': 'Chihuahua', '671': 'Chihuahua',
  '672': 'Chihuahua', '673': 'Chihuahua', '674': 'Chihuahua', '675': 'Chihuahua', '676': 'Chihuahua',
  '677': 'Chihuahua', '678': 'Chihuahua', '679': 'Chihuahua', '680': 'Sonora', '681': 'Sonora',
  '682': 'Sonora', '683': 'Sonora', '684': 'Sonora', '685': 'Sonora', '686': 'Sonora', '687': 'Sonora',
  '688': 'Sonora', '689': 'Sonora', '690': 'Baja California', '691': 'Baja California', '692': 'Baja California',
  '693': 'Baja California', '694': 'Baja California', '695': 'Baja California', '696': 'Baja California',
  '697': 'Baja California', '698': 'Baja California', '699': 'Baja California', '700': 'Baja California Sur',
  '701': 'Baja California Sur', '702': 'Baja California Sur', '703': 'Baja California Sur', '704': 'Baja California Sur',
  '705': 'Baja California Sur', '706': 'Baja California Sur', '707': 'Baja California Sur', '708': 'Baja California Sur',
  '709': 'Baja California Sur', '710': 'Sinaloa', '711': 'Sinaloa', '712': 'Sinaloa', '713': 'Sinaloa',
  '714': 'Sinaloa', '715': 'Sinaloa', '716': 'Sinaloa', '717': 'Sinaloa', '718': 'Sinaloa', '719': 'Sinaloa',
  '720': 'Nayarit', '721': 'Nayarit', '722': 'Nayarit', '723': 'Nayarit', '724': 'Nayarit', '725': 'Nayarit',
  '726': 'Nayarit', '727': 'Nayarit', '728': 'Nayarit', '729': 'Nayarit', '730': 'Jalisco', '731': 'Jalisco',
  '732': 'Jalisco', '733': 'Jalisco', '734': 'Jalisco', '735': 'Jalisco', '736': 'Jalisco', '737': 'Jalisco',
  '738': 'Jalisco', '739': 'Jalisco', '740': 'Michoacán', '741': 'Michoacán', '742': 'Michoacán', '743': 'Michoacán',
  '744': 'Michoacán', '745': 'Michoacán', '746': 'Michoacán', '747': 'Michoacán', '748': 'Michoacán', '749': 'Michoacán',
  '750': 'Guanajuato', '751': 'Guanajuato', '752': 'Guanajuato', '753': 'Guanajuato', '754': 'Guanajuato',
  '755': 'Guanajuato', '756': 'Guanajuato', '757': 'Guanajuato', '758': 'Guanajuato', '759': 'Guanajuato',
  '760': 'Querétaro', '761': 'Querétaro', '762': 'Querétaro', '763': 'Querétaro', '764': 'Querétaro',
  '765': 'Querétaro', '766': 'Querétaro', '767': 'Querétaro', '768': 'Querétaro', '769': 'Querétaro',
  '770': 'Colima', '771': 'Colima', '772': 'Colima', '773': 'Colima', '774': 'Colima', '775': 'Colima',
  '776': 'Colima', '777': 'Colima', '778': 'Colima', '779': 'Colima', '780': 'Zacatecas', '781': 'Zacatecas',
  '782': 'Zacatecas', '783': 'Zacatecas', '784': 'Zacatecas', '785': 'Zacatecas', '786': 'Zacatecas',
  '787': 'Zacatecas', '788': 'Zacatecas', '789': 'Zacatecas', '790': 'Aguascalientes', '791': 'Aguascalientes',
  '792': 'Aguascalientes', '793': 'Aguascalientes', '794': 'Aguascalientes', '795': 'Aguascalientes',
  '796': 'Aguascalientes', '797': 'Aguascalientes', '798': 'Aguascalientes', '799': 'Aguascalientes',
  '800': 'San Luis Potosí', '801': 'San Luis Potosí', '802': 'San Luis Potosí', '803': 'San Luis Potosí',
  '804': 'San Luis Potosí', '805': 'San Luis Potosí', '806': 'San Luis Potosí', '807': 'San Luis Potosí',
  '808': 'San Luis Potosí', '809': 'San Luis Potosí', '810': 'Durango', '811': 'Durango', '812': 'Durango',
  '813': 'Durango', '814': 'Durango', '815': 'Durango', '816': 'Durango', '817': 'Durango', '818': 'Durango',
  '819': 'Durango', '820': 'Tlaxcala', '821': 'Tlaxcala', '822': 'Tlaxcala', '823': 'Tlaxcala', '824': 'Tlaxcala',
  '825': 'Tlaxcala', '826': 'Tlaxcala', '827': 'Tlaxcala', '828': 'Tlaxcala', '829': 'Tlaxcala', '830': 'Puebla',
  '831': 'Puebla', '832': 'Puebla', '833': 'Puebla', '834': 'Puebla', '835': 'Puebla', '836': 'Puebla',
  '837': 'Puebla', '838': 'Puebla', '839': 'Puebla', '840': 'Hidalgo', '841': 'Hidalgo', '842': 'Hidalgo',
  '843': 'Hidalgo', '844': 'Hidalgo', '845': 'Hidalgo', '846': 'Hidalgo', '847': 'Hidalgo', '848': 'Hidalgo',
  '849': 'Hidalgo', '850': 'Veracruz', '851': 'Veracruz', '852': 'Veracruz', '853': 'Veracruz', '854': 'Veracruz',
  '855': 'Veracruz', '856': 'Veracruz', '857': 'Veracruz', '858': 'Veracruz', '859': 'Veracruz', '860': 'Oaxaca',
  '861': 'Oaxaca', '862': 'Oaxaca', '863': 'Oaxaca', '864': 'Oaxaca', '865': 'Oaxaca', '866': 'Oaxaca',
  '867': 'Oaxaca', '868': 'Oaxaca', '869': 'Oaxaca', '870': 'Chiapas', '871': 'Chiapas', '872': 'Chiapas',
  '873': 'Chiapas', '874': 'Chiapas', '875': 'Chiapas', '876': 'Chiapas', '877': 'Chiapas', '878': 'Chiapas',
  '879': 'Chiapas', '880': 'Tabasco', '881': 'Tabasco', '882': 'Tabasco', '883': 'Tabasco', '884': 'Tabasco',
  '885': 'Tabasco', '886': 'Tabasco', '887': 'Tabasco', '888': 'Tabasco', '889': 'Tabasco', '890': 'Guerrero',
  '891': 'Guerrero', '892': 'Guerrero', '893': 'Guerrero', '894': 'Guerrero', '895': 'Guerrero', '896': 'Guerrero',
  '897': 'Guerrero', '898': 'Guerrero', '899': 'Guerrero', '900': 'Morelos', '901': 'Morelos', '902': 'Morelos',
  '903': 'Morelos', '904': 'Morelos', '905': 'Morelos', '906': 'Morelos', '907': 'Morelos', '908': 'Morelos',
  '909': 'Morelos', '910': 'Tamaulipas', '911': 'Tamaulipas', '912': 'Tamaulipas', '913': 'Tamaulipas',
  '914': 'Tamaulipas', '915': 'Tamaulipas', '916': 'Tamaulipas', '917': 'Tamaulipas', '918': 'Tamaulipas',
  '919': 'Tamaulipas', '920': 'Nuevo León', '921': 'Nuevo León', '922': 'Nuevo León', '923': 'Nuevo León',
  '924': 'Nuevo León', '925': 'Nuevo León', '926': 'Nuevo León', '927': 'Nuevo León', '928': 'Nuevo León',
  '929': 'Nuevo León', '930': 'Coahuila', '931': 'Coahuila', '932': 'Coahuila', '933': 'Coahuila',
  '934': 'Coahuila', '935': 'Coahuila', '936': 'Coahuila', '937': 'Coahuila', '938': 'Coahuila',
  '939': 'Coahuila', '940': 'Chihuahua', '941': 'Chihuahua', '942': 'Chihuahua', '943': 'Chihuahua',
  '944': 'Chihuahua', '945': 'Chihuahua', '946': 'Chihuahua', '947': 'Chihuahua', '948': 'Chihuahua',
  '949': 'Chihuahua', '950': 'Sonora', '951': 'Sonora', '952': 'Sonora', '953': 'Sonora', '954': 'Sonora',
  '955': 'Sonora', '956': 'Sonora', '957': 'Sonora', '958': 'Sonora', '959': 'Sonora', '960': 'Baja California',
  '961': 'Baja California', '962': 'Baja California', '963': 'Baja California', '964': 'Baja California',
  '965': 'Baja California', '966': 'Baja California', '967': 'Baja California', '968': 'Baja California',
  '969': 'Baja California', '970': 'Baja California Sur', '971': 'Baja California Sur', '972': 'Baja California Sur',
  '973': 'Baja California Sur', '974': 'Baja California Sur', '975': 'Baja California Sur', '976': 'Baja California Sur',
  '977': 'Baja California Sur', '978': 'Baja California Sur', '979': 'Baja California Sur', '980': 'Sinaloa',
  '981': 'Sinaloa', '982': 'Sinaloa', '983': 'Sinaloa', '984': 'Sinaloa', '985': 'Sinaloa', '986': 'Sinaloa',
  '987': 'Sinaloa', '988': 'Sinaloa', '989': 'Sinaloa', '990': 'Nayarit', '991': 'Nayarit', '992': 'Nayarit',
  '993': 'Nayarit', '994': 'Nayarit', '995': 'Nayarit', '996': 'Nayarit', '997': 'Nayarit', '998': 'Nayarit',
  '999': 'Nayarit'
};

function getCityByLada(phone) {
  // Extraer la lada del número (primeros 3 dígitos después del 52)
  const cleanPhone = phone.replace(/\D/g, ''); // Solo números
  if (cleanPhone.startsWith('52') && cleanPhone.length >= 5) {
    const lada = cleanPhone.substring(2, 5); // Tomar dígitos 3, 4 y 5
    return LADA_TO_CITY[lada] || 'CDMX'; // Default a CDMX
  }
  return 'CDMX'; // Default a CDMX
}

function mapSinContestar(record) {
  // Inicializar con valores por defecto
  const mappedData = {
    nombre: null,
    telefono: null,
    email: null,
    clasificacion: null,
    medio: 'Google', // Valor fijo
    curso: null,
    ciudad: null,
    campana: 'RMKT', // Valor fijo
    comentario: null,
    asesor: null,
    ultimo_mensaje: null,
    aiEnabled: false,
    lastMessageDate: null
  };
  
  // Mapear campos desde customFields
  for (const field of record.customFields) {
    switch (field.key) {
      case 'name': 
        mappedData.nombre = field.value || 'Sin nombre'; 
        break;
      case 'phone': 
        mappedData.telefono = field.value || 'Sin teléfono';
        mappedData.ciudad = getCityByLada(field.value);
        break;
      case 'email': 
        mappedData.email = field.value || null; 
        break;
      case 'classification': 
        mappedData.clasificacion = field.value || null; 
        break;
      case 'asesor': 
        mappedData.asesor = field.value || null; 
        break;
      case 'ai': 
        mappedData.aiEnabled = field.value === true || field.value === 'true'; 
        break;
      case 'lastMessage': 
        mappedData.ultimo_mensaje = field.value || null; 
        break;
      case 'lastMessageTime': 
        mappedData.lastMessageDate = field.value || null; 
        break;
    }
  }
  
  // Valores por defecto obligatorios
  if (!mappedData.nombre) mappedData.nombre = 'Sin nombre';
  if (!mappedData.telefono) mappedData.telefono = 'Sin teléfono';
  if (!mappedData.ciudad) mappedData.ciudad = 'CDMX';
  
  return mappedData;
}

async function getChatInfo(phone) {
  try {
    // Limpiar número de teléfono
    const cleanPhone = phone.replace(/\D/g, '');
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
        lastMessageDate: lastMsg.dateCreated || null
      };
    }
    return null;
  } catch (error) {
    // Si no se encuentra el chat, retornar null
    return null;
  }
}

async function importSinContestarFromAPI() {
  try {
    console.log('📖 Obteniendo datos de sin contestar desde la API...');
    
    // Obtener datos desde la API
    const response = await axios.get('https://api.quick-learning.virtualvoices.com.mx/api/records/sin-contestar');
    const data = response.data;
    const records = data.records;
    
    console.log(`📊 Total de registros a importar: ${records.length}`);
    
    let successCount = 0;
    let errorCount = 0;
    let chatUpdatedCount = 0;
    
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const mappedRecord = mapSinContestar(record);
      
      console.log(`\n🔄 Importando registro ${i + 1}/${records.length}: ${mappedRecord.nombre}`);
      console.log(`   📱 Teléfono: ${mappedRecord.telefono}`);
      console.log(`   🏙️  Ciudad: ${mappedRecord.ciudad}`);
      
      try {
        // Obtener información del chat antes de crear el registro
        const chatInfo = await getChatInfo(mappedRecord.telefono);
        
        if (chatInfo) {
          // Actualizar con información del chat
          mappedRecord.ultimo_mensaje = chatInfo.ultimo_mensaje || mappedRecord.ultimo_mensaje;
          mappedRecord.lastMessageDate = chatInfo.lastMessageDate || mappedRecord.lastMessageDate;
          console.log(`   📅 Último mensaje: ${chatInfo.lastMessageDate ? new Date(chatInfo.lastMessageDate).toLocaleString() : 'N/A'}`);
          console.log(`   💬 Mensaje: ${chatInfo.ultimo_mensaje ? chatInfo.ultimo_mensaje.substring(0, 50) + '...' : 'N/A'}`);
          chatUpdatedCount++;
        } else {
          console.log(`   📅 Último mensaje: ${mappedRecord.lastMessageDate ? new Date(mappedRecord.lastMessageDate).toLocaleString() : 'N/A'}`);
        }
        
        // Crear el registro
        const createResponse = await axios.post('http://localhost:3001/api/records', {
          tableSlug: 'sin_contestar',
          c_name: 'quicklearning',
          createdBy: 'admin@quicklearning.com',
          data: mappedRecord
        });
        
        console.log(`   ✅ Registro creado exitosamente`);
        successCount++;
        
        // Pequeña pausa para no sobrecargar el servidor
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.log(`   ❌ Error: ${error.response?.data?.message || error.message}`);
        errorCount++;
      }
    }
    
    console.log(`\n🎉 Importación completada!`);
    console.log(`✅ Registros creados: ${successCount}`);
    console.log(`💬 Chats actualizados: ${chatUpdatedCount}`);
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
    const response = await axios.get('http://localhost:3001/api/records/table/quicklearning/sin_contestar?page=1&limit=1000');
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
        // Obtener mensajes del endpoint externo
        const chatResp = await axios.get(`https://api.quick-learning.virtualvoices.com.mx/api/whatsapp/chat/${phone.replace(/\D/g, '')}`);
        const messages = chatResp.data;
        if (!Array.isArray(messages) || messages.length === 0) {
          console.log(`⚠️  Sin mensajes para ${name} (${phone})`);
          skipped++;
          continue;
        }
        // Crear chat local
        const chatData = {
          phone: phone,
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
    const response = await axios.get('http://localhost:3001/api/records/table/quicklearning/sin_contestar?page=1&limit=1000');
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
    const response = await axios.get('http://localhost:3001/api/records/table/quicklearning/sin_contestar?page=1&limit=1000');
    const records = response.data.records;
    console.log(`📊 Total registros de sin contestar: ${records.length}`);
    let created = 0;
    let updated = 0;
    let skipped = 0;
    for (const record of records) {
      const phone = record.data?.telefono;
      const name = record.data?.nombre;
      if (!phone || phone === 'Sin teléfono') {
        console.log(`⚠️  Registro sin teléfono: ${name}`);
        skipped++;
        continue;
      }
      try {
        // Obtener mensajes del endpoint externo
        const chatResp = await axios.get(`https://api.quick-learning.virtualvoices.com.mx/api/whatsapp/chat/${phone.replace(/\D/g, '')}`);
        // Verificar si la respuesta es un error
        if (chatResp.data && chatResp.data.message && chatResp.data.message.includes('no encontrado')) {
          console.log(`⚠️  Chat no encontrado para ${name} (${phone})`);
          skipped++;
          continue;
        }
        const messages = chatResp.data;
        if (!Array.isArray(messages) || messages.length === 0) {
          console.log(`⚠️  Sin mensajes para ${name} (${phone})`);
          skipped++;
          continue;
        }
        // Buscar chat local
        let chat = await Chat.findOne({ phone });
        if (chat) {
          // Agregar mensajes nuevos (sin duplicar por _id)
          const existingIds = new Set(chat.messages.map(m => m._id?.toString()));
          const newMessages = messages.filter(m => !existingIds.has(m._id?.toString()));
          if (newMessages.length > 0) {
            chat.messages.push(...newMessages);
            await chat.save();
            console.log(`✅ Mensajes agregados a chat existente para ${name} (${phone})`);
            updated++;
          } else {
            console.log(`⚠️  Chat ya tenía todos los mensajes para ${name} (${phone})`);
            skipped++;
          }
        } else {
          // Crear nuevo chat idéntico a alumnos
          const lastMsg = messages[messages.length - 1];
          chat = new Chat({
            phone,
            profileName: name,
            linkedTable: {
              refModel: 'Record',
              refId: record._id,
              tableSlug: 'sin_contestar',
            },
            conversationStart: messages[0]?.dateCreated || new Date(),
            lastMessage: lastMsg?.body || '',
            lastMessageDate: lastMsg?.dateCreated || new Date(),
            messages,
            status: 'active',
            createdAt: messages[0]?.dateCreated || new Date(),
            updatedAt: lastMsg?.dateCreated || new Date(),
          });
          await chat.save();
          console.log(`✅ Chat creado para ${name} (${phone})`);
          created++;
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        if (error.response && error.response.data) {
          console.log(`❌ Error sincronizando chat para ${name}:`, JSON.stringify(error.response.data, null, 2));
        } else {
          console.log(`❌ Error sincronizando chat para ${name}: ${error.message}`);
        }
        skipped++;
      }
    }
    console.log(`\n🎉 Proceso de sincronización de chats completado!`);
    console.log(`✅ Chats creados: ${created}`);
    console.log(`✅ Chats actualizados: ${updated}`);
    console.log(`⚠️  Registros sin mensajes o sin cambios: ${skipped}`);
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
    console.log('  --import: Importar desde la API');
    console.log('  --sync-chats: Sincronizar con chats existentes');
    console.log('  --full: Importar y sincronizar completo');
    break;
} 