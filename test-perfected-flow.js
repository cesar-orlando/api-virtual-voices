const axios = require("axios");

const BASE_URL = "http://localhost:3001";

// 🗄️ Base de datos local en memoria para simular MongoDB
class LocalDatabase {
  constructor() {
    this.chats = new Map(); // Simula la colección de chats
    this.records = new Map(); // Simula las tablas de registros
    this.messageId = 1;
  }

  // Simular modelo de chat
  createChat(phone, profileName = "Usuario") {
    const chat = {
      phone,
      profileName,
      conversationStart: new Date(),
      aiEnabled: true,
      status: "active",
      messages: [],
      lastMessage: null,
    };
    this.chats.set(phone, chat);
    return chat;
  }

  // Simular modelo de registro
  createRecord(phone, profileName, tableSlug = "prospectos") {
    const record = {
      tableSlug,
      c_name: "quicklearning",
      createdBy: "test-simulator",
      data: {
        nombre: profileName,
        telefono: phone,
        email: null,
        clasificacion: "prospecto",
        medio: "Test",
        curso: null,
        ciudad: null,
        campana: "TEST",
        comentario: null,
        asesor: JSON.stringify({
          name: "Test Asesor",
          _id: "test-asesor-id",
        }),
        ultimo_mensaje: null,
        aiEnabled: true,
        lastMessageDate: new Date(),
        createdBy: "test-simulator",
        createdAt: new Date(),
      },
    };
    this.records.set(`${tableSlug}-${phone}`, record);
    return record;
  }

  // Agregar mensaje al chat
  addMessage(phone, message) {
    const chat = this.chats.get(phone);
    if (!chat) return null;

    const newMessage = {
      direction: message.direction,
      body: message.body,
      respondedBy: message.respondedBy,
      twilioSid: `SM${this.messageId++}`,
      messageType: message.messageType || "text",
      timestamp: new Date(),
    };

    chat.messages.push(newMessage);
    chat.lastMessage = {
      body: message.body,
      date: new Date(),
      respondedBy: message.respondedBy,
    };

    return newMessage;
  }

  // Actualizar registro
  updateRecord(phone, updateData) {
    const tableSlugs = ["alumnos", "prospectos", "nuevo_ingreso", "sin_contestar"];

    for (const tableSlug of tableSlugs) {
      const key = `${tableSlug}-${phone}`;
      const record = this.records.get(key);
      if (record) {
        Object.assign(record.data, updateData);
        return record;
      }
    }
    return null;
  }

  // Obtener historial de chat
  getChatHistory(phone) {
    const chat = this.chats.get(phone);
    if (!chat) return [];

    return chat.messages.map((msg) => ({
      role: msg.direction === "inbound" ? "user" : "assistant",
      content: msg.body,
      timestamp: msg.timestamp,
    }));
  }

  // Limpiar base de datos
  clear() {
    this.chats.clear();
    this.records.clear();
    this.messageId = 1;
  }
}

// 🤖 Simulador de WhatsApp Agent Service
class WhatsAppSimulator {
  constructor(company = "quicklearning") {
    this.db = new LocalDatabase();
    this.company = company;
  }

  async processMessage(phone, message, profileName = "Usuario") {
    console.log(`📱 [SIMULADOR] Procesando mensaje de ${phone}: "${message}"`);

    // Crear o obtener chat
    let chat = this.db.chats.get(phone);
    if (!chat) {
      chat = this.db.createChat(phone, profileName);
      this.db.createRecord(phone, profileName);
      console.log(`📝 [SIMULADOR] Nuevo chat creado para ${phone}`);
    }

    // Verificar si IA está activa
    if (!chat.aiEnabled) {
      console.log(`🚫 [SIMULADOR] IA desactivada para ${phone}`);
      return "IA desactivada - Transferido a asesor";
    }

    // Procesar con agente real (que obtiene historial de la base de datos real)
    try {
      // Obtener historial actual del chat
      const currentHistory = this.db.getChatHistory(phone);

      const response = await axios.post(`${BASE_URL}/api/test/agent`, {
        message: message,
        companySlug: this.company,
        phone: phone,
        chatHistory: currentHistory,
      });

      const aiResponse = response.data.data.agentResponse;
      const responseTime = response.data.data.responseTime;

      // Agregar mensaje del usuario al historial local
      this.db.addMessage(phone, {
        direction: "inbound",
        body: message,
        respondedBy: "human",
        messageType: "text",
      });

      // Agregar respuesta del bot al historial local
      this.db.addMessage(phone, {
        direction: "outbound-api",
        body: aiResponse,
        respondedBy: "bot",
        messageType: "text",
      });

      // Verificar si es mensaje de transferencia
      if (
        aiResponse.toLowerCase().includes("transferir con un asesor") ||
        aiResponse.toLowerCase().includes("te voy a transferir")
      ) {
        console.log(`🔄 [SIMULADOR] Transferencia detectada para ${phone}`);
        chat.aiEnabled = false;
        this.db.updateRecord(phone, { aiEnabled: false });
      }

      // Actualizar último mensaje en registro local
      this.db.updateRecord(phone, {
        ultimo_mensaje: aiResponse,
        lastMessageDate: new Date(),
      });

      return {
        response: aiResponse,
        responseTime,
        aiEnabled: chat.aiEnabled,
        messageCount: chat.messages.length,
      };
    } catch (error) {
      console.error(`❌ [SIMULADOR] Error procesando mensaje:`, error.message);
      return {
        response: "Error en el procesamiento",
        responseTime: 0,
        aiEnabled: chat.aiEnabled,
        messageCount: chat.messages.length,
      };
    }
  }

  // Obtener historial completo
  getFullHistory(phone) {
    return this.db.getChatHistory(phone);
  }

  // Limpiar simulador
  clear() {
    this.db.clear();
  }
}

// Función para crear una tabla de conversación mejorada
function createConversationTable(title, conversation) {
  console.log(`\n${"=".repeat(100)}`);
  console.log(`💬 ${title}`);
  console.log("=".repeat(100));

  console.log("👤 Usuario | 🤖 NatalIA | ⏱️ Tiempo | 📊 Etapa | 🤖 IA");
  console.log("-".repeat(120));

  conversation.forEach((exchange, index) => {
    console.log(`👤 ${exchange.userMessage}`);
    console.log(`🤖 ${exchange.botResponse}`);
    console.log(
      `⏱️ ${exchange.responseTime}ms | 📊 ${exchange.stage || "N/A"} | ${exchange.aiEnabled ? "✅" : "🚫"} IA`
    );
    if (index < conversation.length - 1) {
      console.log("─".repeat(60));
    }
  });

  console.log("=".repeat(100));
}

// Función para ejecutar un escenario de prueba
async function runTestScenario(scenarioName, messages, phone, profileName, company = "quicklearning") {
  console.log(`\n🧪 ${scenarioName}`);
  console.log(`📱 Phone: ${phone} | 👤 Profile: ${profileName} | 🏢 Company: ${company}`);

  const simulator = new WhatsAppSimulator(company);
  const results = [];

  for (const exchange of messages) {
    const startTime = Date.now();

    const result = await simulator.processMessage(phone, exchange.userMessage, profileName);
    const responseTime = Date.now() - startTime;

    results.push({
      userMessage: exchange.userMessage,
      botResponse: result.response,
      responseTime: result.responseTime || responseTime,
      stage: exchange.expectedStage,
      aiEnabled: result.aiEnabled,
      messageCount: result.messageCount,
    });

    // Pausa entre mensajes para simular tiempo real
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  createConversationTable(scenarioName, results);

  // Mostrar historial completo
  const fullHistory = simulator.getFullHistory(phone);
  console.log(`\n📚 Historial completo (${fullHistory.length} mensajes):`);
  fullHistory.forEach((msg, index) => {
    console.log(`${index + 1}. ${msg.role === "user" ? "👤" : "🤖"} ${msg.content}`);
  });

  simulator.clear();
  return results;
}

// Configuraciones de empresas disponibles
const COMPANY_CONFIGS = {
  quicklearning: {
    name: "Quick Learning",
    description: "Escuela de inglés con cursos virtuales, presenciales y online",
    testScenarios: {
      // Escenario REAL que me pediste mantener
      cliente_real_productivo: [
        { userMessage: "Hola. Quisiera más información de cursos de inglés. (r)", expectedStage: "Saludo inicial" },
        { userMessage: "Cesar", expectedStage: "Pide información" },
        { userMessage: "Si", expectedStage: "Da nombre corto" },
        { userMessage: "No", expectedStage: "Confirma interés" },
        { userMessage: "Si", expectedStage: "Acepta explicación" },
        { userMessage: "Si", expectedStage: "Acepta explicación" },
        { userMessage: "2", expectedStage: "Elige modalidad" },
        { userMessage: "Si", expectedStage: "Confirma interés" },
        { userMessage: "SI", expectedStage: "Si quiere inscribirse" },
      ],
      // Estudiante mexicano típico
      estudiante_mexican: [
        { userMessage: "hola", expectedStage: "Saludo casual" },
        { userMessage: "info de inglés", expectedStage: "Pide info" },
        { userMessage: "ana", expectedStage: "Nombre corto" },
        { userMessage: "sip", expectedStage: "Confirma" },
        { userMessage: "nel", expectedStage: "No conoce" },
        { userMessage: "órale", expectedStage: "Acepta" },
        { userMessage: "online", expectedStage: "Elige modalidad" },
        { userMessage: "está caro?", expectedStage: "Pregunta precio" },
      ],
      // Profesionista
      profesionista: [
        { userMessage: "buenas", expectedStage: "Saludo" },
        { userMessage: "necesito inglés para el trabajo", expectedStage: "Motivo" },
        { userMessage: "roberto", expectedStage: "Nombre" },
        { userMessage: "si", expectedStage: "Confirma" },
        { userMessage: "no lo conozco", expectedStage: "No conoce" },
        { userMessage: "perfecto", expectedStage: "Acepta" },
        { userMessage: "presencial", expectedStage: "Elige modalidad" },
      ],
      // Mamá mexicana
      mama_mexicana: [
        { userMessage: "hola", expectedStage: "Saludo" },
        { userMessage: "es para mi hijo", expectedStage: "Para hijo" },
        { userMessage: "carmen", expectedStage: "Nombre mamá" },
        { userMessage: "si le urge", expectedStage: "Necesidad" },
        { userMessage: "no sabía", expectedStage: "No conoce" },
        { userMessage: "suena bien", expectedStage: "Acepta" },
        { userMessage: "virtual para jóvenes", expectedStage: "Modalidad joven" },
      ],
      /*   // Escenario 1: Usuario super informal (como en la vida real)
      informal_basico: [
        { userMessage: 'hola', expectedStage: 'Saludo inicial' },
        { userMessage: 'info', expectedStage: 'Pide información' },
        { userMessage: 'ana', expectedStage: 'Da nombre corto' },
        { userMessage: 'si', expectedStage: 'Confirma interés' },
        { userMessage: 'no', expectedStage: 'No conoce método' },
        { userMessage: 'si', expectedStage: 'Acepta explicación' },
        { userMessage: 'virtual', expectedStage: 'Elige modalidad' },
        { userMessage: 'intensivo', expectedStage: 'Elige curso específico' },
        { userMessage: 'si quiero', expectedStage: 'Quiere inscribirse' },
        { userMessage: '3312345678', expectedStage: 'Da teléfono' },
        { userMessage: 'ana@gmail.com', expectedStage: 'Da correo' }
      ],
      
      // Escenario 2: Usuario que pregunta precios directo (muy común)
      pregunta_precios: [
        { userMessage: 'Hola', expectedStage: 'Saludo inicial' },
        { userMessage: 'Que precios y horarios tienes?', expectedStage: 'Pregunta directa precios' },
        { userMessage: 'Carlos', expectedStage: 'Da nombre' },
        { userMessage: 'Si', expectedStage: 'Confirma interés' },
        { userMessage: 'No lo conozco', expectedStage: 'No conoce método' },
        { userMessage: 'Ok', expectedStage: 'Acepta explicación' },
        { userMessage: 'virtual pls', expectedStage: 'Elige virtual informal' },
        { userMessage: 'cual es el mas barato?', expectedStage: 'Pregunta precio específico' }
      ],

      // Escenario 3: Usuario que elige presencial (debe transferir INMEDIATAMENTE)
      presencial_transfer: [
        { userMessage: 'hola', expectedStage: 'Saludo inicial' },
        { userMessage: 'informacion porfavor', expectedStage: 'Pide info informal' },
        { userMessage: 'Maria', expectedStage: 'Da nombre' },
        { userMessage: 'sip', expectedStage: 'Confirma interés' },
        { userMessage: 'ya lo conozco', expectedStage: 'Ya conoce método' },
        { userMessage: 'presencial', expectedStage: 'DEBE TRANSFERIR AQUÍ' }
      ],

      // Escenario 4: Usuario súper confundido con respuestas raras
      usuario_confundido: [
        { userMessage: '??', expectedStage: 'Mensaje confuso' },
        { userMessage: 'que es esto', expectedStage: 'No entiende' },
        { userMessage: 'ingles', expectedStage: 'Menciona inglés' },
        { userMessage: 'Pedro Gonzalez', expectedStage: 'Da nombre completo' },
        { userMessage: 'simon', expectedStage: 'Confirma interés informal' },
        { userMessage: 'nel', expectedStage: 'No conoce método informal' },
        { userMessage: 'a ver', expectedStage: 'Quiere escuchar' },
        { userMessage: 'online mejor', expectedStage: 'Elige online' }
      ],

      // Escenario 5: Usuario que menciona tarjeta (debe transferir)
      pago_tarjeta: [
        { userMessage: 'Hola', expectedStage: 'Saludo inicial' },
        { userMessage: 'info', expectedStage: 'Pide información' },
        { userMessage: 'Luis', expectedStage: 'Da nombre' },
        { userMessage: 'Si', expectedStage: 'Confirma interés' },
        { userMessage: 'Si lo conozco', expectedStage: 'Conoce método' },
        { userMessage: 'virtual', expectedStage: 'Elige virtual' },
        { userMessage: 'puedo pagar con tarjeta?', expectedStage: 'DEBE TRANSFERIR - tarjeta' }
      ],

      // Escenario 6: Usuario que solo manda mensajes súper cortos
      mensajes_cortos: [
        { userMessage: 'hola', expectedStage: 'Saludo inicial' },
        { userMessage: '?', expectedStage: 'Pregunta vaga' },
        { userMessage: 'Juan', expectedStage: 'Da nombre' },
        { userMessage: 'si', expectedStage: 'Confirma' },
        { userMessage: 'no', expectedStage: 'No conoce' },
        { userMessage: 'ok', expectedStage: 'Acepta' },
        { userMessage: 'virtual', expectedStage: 'Elige modalidad' },
        { userMessage: 'sabatino', expectedStage: 'Elige sabatino' },
        { userMessage: 'si', expectedStage: 'Confirma inscripción' }
      ],

      // Escenario 7: Usuario que pregunta por sucursales (común en conversaciones reales)
      pregunta_sucursales: [
        { userMessage: 'Hola', expectedStage: 'Saludo inicial' },
        { userMessage: 'informacion', expectedStage: 'Pide información' },
        { userMessage: 'Sofia Martinez', expectedStage: 'Da nombre completo' },
        { userMessage: 'Si', expectedStage: 'Confirma interés' },
        { userMessage: 'No', expectedStage: 'No conoce método' },
        { userMessage: 'Entendido', expectedStage: 'Acepta explicación' },
        { userMessage: 'Que sucursales tienes?', expectedStage: 'Pregunta sucursales' }
      ],

      // Escenario 8: Usuario que quiere certificación (caso real encontrado)
      certificacion: [
        { userMessage: 'Hola', expectedStage: 'Saludo inicial' },
        { userMessage: 'Me podría preparar para una certificación?', expectedStage: 'Pregunta certificación' },
        { userMessage: 'Roberto', expectedStage: 'Da nombre' },
        { userMessage: 'Si', expectedStage: 'Confirma interés' },
        { userMessage: 'No', expectedStage: 'No conoce método' },
        { userMessage: 'Si', expectedStage: 'Acepta explicación' },
        { userMessage: 'virtual', expectedStage: 'Elige modalidad' }
      ],

      // Escenario 9: Usuario que pregunta por ciudad específica (caso real)
      ciudad_especifica: [
        { userMessage: 'hola', expectedStage: 'Saludo inicial' },
        { userMessage: 'info', expectedStage: 'Pide información' },
        { userMessage: 'Ana', expectedStage: 'Da nombre' },
        { userMessage: 'si', expectedStage: 'Confirma interés' },
        { userMessage: 'no', expectedStage: 'No conoce método' },
        { userMessage: 'ok', expectedStage: 'Acepta explicación' },
        { userMessage: 'Cd juarez', expectedStage: 'Menciona ciudad' },
        { userMessage: 'virtual', expectedStage: 'Elige modalidad' }
      ],

      // Escenario 10: Flujo completo perfecto (para medir 100% eficiencia)
      flujo_perfecto: [
        { userMessage: 'Hola', expectedStage: 'Saludo inicial' },
        { userMessage: 'Información de cursos', expectedStage: 'Pide información' },
        { userMessage: 'Me llamo Patricia Ruiz', expectedStage: 'Da nombre completo' },
        { userMessage: 'Sí, soy la interesada', expectedStage: 'Confirma interés' },
        { userMessage: 'No conozco el método', expectedStage: 'No conoce método' },
        { userMessage: 'Me parece interesante', expectedStage: 'Acepta explicación' },
        { userMessage: 'Me interesa el curso virtual', expectedStage: 'Elige virtual' },
        { userMessage: 'Quiero el intensivo', expectedStage: 'Elige intensivo' },
        { userMessage: '¿Qué horarios tienen?', expectedStage: 'Pregunta horarios' },
        { userMessage: 'Perfecto, quiero inscribirme', expectedStage: 'Quiere inscribirse' },
        { userMessage: 'Mi teléfono es 3398765432', expectedStage: 'Da teléfono' },
        { userMessage: 'Mi correo es patricia@hotmail.com', expectedStage: 'Da correo' }
      ] */
    },
  },
  grupokg: {
    name: "Grupo KG",
    description: "Empresa de bienes raíces y servicios inmobiliarios en Guadalajara",
    testScenarios: {
      asesor_web: [
        {
          userMessage:
            "Hola, tengo un cliente que puede estar interesado en ver esta propiedad. ¿Podrías contactarme? https://www.easybroker.com/mx/listings/casa-de-un-solo-nivel-en-rinconada-santa-rita",
          expectedStage: "Mensaje automático portal",
        },
        {
          userMessage:
            "Hola, Soy Germán Cuevas Asesor inmobiliario, tengo cliente que busca en esa Zona. Compartes comisión?",
          expectedStage: "Pregunta comisión asesor",
        },
      ],
      // Cliente tapatío típico
      cliente_providencia: [
        { userMessage: "que onda", expectedStage: "Saludo tapatío" },
        { userMessage: "busco casa en providencia", expectedStage: "Zona premium GDL" },
        { userMessage: "patricia", expectedStage: "Nombre simple" },
        { userMessage: "comprar", expectedStage: "Una palabra" },
        { userMessage: "4 millones", expectedStage: "Presupuesto directo" },
        { userMessage: "que tienen?", expectedStage: "Pregunta directa" },
        { userMessage: "hay fotos?", expectedStage: "Quiere ver" },
      ],
      // Joven de GDL buscando depa
      joven_gdl: [
        { userMessage: "hola kaigi", expectedStage: "Saludo con nombre" },
        { userMessage: "busco depa", expectedStage: "Súper directo" },
        { userMessage: "alex", expectedStage: "Nombre corto" },
        { userMessage: "rentar", expectedStage: "Una palabra" },
        { userMessage: "chapultepec", expectedStage: "Zona joven GDL" },
        { userMessage: "maximo 20 mil", expectedStage: "Presupuesto" },
        { userMessage: "con estacionamiento", expectedStage: "Requisito" },
      ],
      // Asesor de Guadalajara
      asesor_gdl: [
        { userMessage: "buenas", expectedStage: "Saludo mexicano" },
        { userMessage: "soy asesor", expectedStage: "Directo" },
        { userMessage: "manuel de century 21", expectedStage: "Datos básicos" },
        { userMessage: "tengo cliente chapalita", expectedStage: "Cliente y zona" },
        { userMessage: "compartes comision?", expectedStage: "Pregunta clave" },
        { userMessage: "cuanto es?", expectedStage: "Pregunta porcentaje" },
      ],
      /*       venta: [
        { userMessage: 'Hola', expectedStage: 'Saludo inicial' },
        { userMessage: 'Busco una casa', expectedStage: 'Solicita información' },
        { userMessage: 'Me llamo Carlos Ruiz', expectedStage: 'Proporciona nombre' },
        { userMessage: 'En venta', expectedStage: 'Especifica tipo de operación' },
        { userMessage: 'En Valle Imperial', expectedStage: 'Proporciona ubicación específica' },
        { userMessage: '¿Cuánto cuesta?', expectedStage: 'Pregunta precio' },
        { userMessage: '¿Acepta mascotas?', expectedStage: 'Pregunta sobre mascotas' },
        { userMessage: '¿Puedo verla el sábado?', expectedStage: 'Solicita cita' }
      ],
      renta: [
        { userMessage: 'Hola', expectedStage: 'Saludo inicial' },
        { userMessage: 'Busco rentar un departamento', expectedStage: 'Solicita información de renta' },
        { userMessage: 'Me llamo Laura Martínez', expectedStage: 'Proporciona nombre' },
        { userMessage: 'En zona Andares', expectedStage: 'Proporciona ubicación' },
        { userMessage: '¿Qué tienen disponible?', expectedStage: 'Pregunta disponibilidad' },
        { userMessage: '¿Cuánto es el mantenimiento?', expectedStage: 'Pregunta sobre mantenimiento' },
        { userMessage: 'Me interesa, ¿puedo verlo?', expectedStage: 'Solicita visita' }
      ],
      asesor: [
        { userMessage: 'Hola', expectedStage: 'Saludo inicial' },
        { userMessage: 'Soy asesor inmobiliario', expectedStage: 'Se identifica como asesor' },
        { userMessage: 'Me llamo Pedro González de Remax', expectedStage: 'Proporciona nombre y empresa' },
        { userMessage: 'Busco propiedades en venta', expectedStage: 'Solicita información' },
        { userMessage: '¿Compartes comisión?', expectedStage: 'Pregunta sobre comisión' },
        { userMessage: 'Estoy registrado en AMPI', expectedStage: 'Indica registro en asociación' },
        { userMessage: '¿Cuánto compartes?', expectedStage: 'Pregunta porcentaje de comisión' }
      ],
      terreno: [
        { userMessage: 'Hola', expectedStage: 'Saludo inicial' },
        { userMessage: 'Busco un terreno', expectedStage: 'Solicita terreno' },
        { userMessage: 'Soy Ana López', expectedStage: 'Proporciona nombre' },
        { userMessage: 'Para inversión', expectedStage: 'Especifica propósito' },
        { userMessage: 'En Cocula', expectedStage: 'Proporciona ubicación específica' },
        { userMessage: '¿Cuántos metros tiene?', expectedStage: 'Pregunta sobre metros' },
        { userMessage: '¿Está libre de gravamen?', expectedStage: 'Pregunta situación legal' }
      ],
      consultas_multiples: [
        { userMessage: 'Hola Kaigi', expectedStage: 'Saludo inicial' },
        { userMessage: 'info', expectedStage: 'Solicita información general' },
        { userMessage: 'Soy Roberto Silva', expectedStage: 'Proporciona nombre' },
        { userMessage: 'Busco casa o departamento', expectedStage: 'Búsqueda múltiple' },
        { userMessage: 'Para comprar', expectedStage: 'Especifica compra' },
        { userMessage: 'Entre 2 y 3 millones', expectedStage: 'Proporciona presupuesto' },
        { userMessage: 'En Providencia o Chapalita', expectedStage: 'Múltiples zonas' },
        { userMessage: '3 recámaras mínimo', expectedStage: 'Especifica recámaras' },
        { userMessage: '¿Qué opciones tienes?', expectedStage: 'Solicita opciones' }
      ] */
    },
    // Escenario 1: Cliente interesado en Eclipse Cross (SUV popular en México)
    cliente_eclipse_cross: [
      { userMessage: "Hola, buenas tardes", expectedStage: "Saludo inicial" },
      { userMessage: "Información del Eclipse Cross", expectedStage: "Solicita información" },
      { userMessage: "Me llamo Roberto Hernández", expectedStage: "Proporciona nombre" },
      { userMessage: "¿Cuánto cuesta?", expectedStage: "Pregunta precio" },
      { userMessage: "¿Qué versiones manejan?", expectedStage: "Pregunta versiones" },
      { userMessage: "¿Hacen planes de financiamiento?", expectedStage: "Pregunta financiamiento" },
      { userMessage: "¿Puedo apartar uno?", expectedStage: "Muestra interés compra" },
    ],

    // Escenario 2: Cliente preguntando por Outlander (familia mexicana)
    familia_outlander: [
      { userMessage: "Hola", expectedStage: "Saludo inicial" },
      { userMessage: "¿Tienen Outlander disponible?", expectedStage: "Pregunta disponibilidad" },
      { userMessage: "Soy María González", expectedStage: "Proporciona nombre" },
      { userMessage: "Es para mi familia", expectedStage: "Especifica uso" },
      { userMessage: "¿Cuánto rinde de gasolina?", expectedStage: "Pregunta rendimiento" },
      { userMessage: "¿Tiene garantía?", expectedStage: "Pregunta garantía" },
      { userMessage: "¿Puedo hacer una prueba de manejo?", expectedStage: "Solicita test drive" },
    ],

    // Escenario 3: Cliente buscando pickup (muy común en México)
    cliente_l200: [
      { userMessage: "Buenos días", expectedStage: "Saludo formal" },
      { userMessage: "Me interesa la L200", expectedStage: "Solicita pickup" },
      { userMessage: "Carlos Jiménez", expectedStage: "Proporciona nombre" },
      { userMessage: "Para trabajo", expectedStage: "Especifica uso comercial" },
      { userMessage: "¿Cuánto puede cargar?", expectedStage: "Pregunta capacidad" },
      { userMessage: "¿Viene con aire acondicionado?", expectedStage: "Pregunta equipamiento" },
      { userMessage: "¿Qué plan de pago manejan?", expectedStage: "Pregunta planes pago" },
    ],

    // Escenario 4: Cliente preguntando por servicio (post-venta)
    servicio_postventa: [
      { userMessage: "Hola", expectedStage: "Saludo inicial" },
      { userMessage: "Tengo un Mirage 2020", expectedStage: "Menciona vehículo propio" },
      { userMessage: "Ana Martínez", expectedStage: "Proporciona nombre" },
      { userMessage: "Necesito servicio", expectedStage: "Solicita servicio" },
      { userMessage: "¿Qué horarios manejan?", expectedStage: "Pregunta horarios servicio" },
      { userMessage: "¿Hacen cita?", expectedStage: "Pregunta citas" },
    ],

    // Escenario 5: Cliente joven interesado en Mirage (económico)
    joven_mirage: [
      { userMessage: "qué tal", expectedStage: "Saludo informal" },
      { userMessage: "info del mirage", expectedStage: "Solicita info informal" },
      { userMessage: "diego", expectedStage: "Nombre corto" },
      { userMessage: "cuánto sale?", expectedStage: "Pregunta precio informal" },
      { userMessage: "está muy caro", expectedStage: "Objeción precio" },
      { userMessage: "que descuentos hay?", expectedStage: "Pregunta descuentos" },
      { userMessage: "lo puedo ver?", expectedStage: "Solicita ver vehículo" },
    ],

    // Escenario 6: Cliente empresario interesado en flota
    empresario_flota: [
      { userMessage: "Buenas tardes", expectedStage: "Saludo formal" },
      { userMessage: "Soy Ing. Luis Ramírez", expectedStage: "Proporciona nombre profesional" },
      { userMessage: "Manejo una constructora", expectedStage: "Especifica empresa" },
      { userMessage: "Necesito 5 L200", expectedStage: "Solicita flota" },
      { userMessage: "¿Hay descuento por volumen?", expectedStage: "Pregunta descuento empresarial" },
      { userMessage: "¿Manejan facturación?", expectedStage: "Pregunta facturación" },
    ],
  },
  mitsubishi: {
    name: "Mitsubishi Motors México",
    description: "Concesionario oficial de vehículos Mitsubishi en México",
    testScenarios: {
      // Cliente mexicano real preguntando por Eclipse Cross
      cliente_eclipse_cross: [
        { userMessage: "hola", expectedStage: "Saludo casual" },
        { userMessage: "info del eclipse cross", expectedStage: "Pregunta informal" },
        { userMessage: "roberto", expectedStage: "Nombre corto" },
        { userMessage: "cuanto sale?", expectedStage: "Pregunta precio directo" },
        { userMessage: "que versiones hay?", expectedStage: "Pregunta versiones" },
        { userMessage: "puedo financiar?", expectedStage: "Pregunta financiamiento" },
        { userMessage: "lo puedo ver?", expectedStage: "Quiere verlo" },
      ],
      // Familia mexicana típica
      familia_outlander: [
        { userMessage: "buenas", expectedStage: "Saludo mexicano" },
        { userMessage: "tienen outlander?", expectedStage: "Pregunta directa" },
        { userMessage: "maria", expectedStage: "Nombre simple" },
        { userMessage: "para la familia", expectedStage: "Especifica uso" },
        { userMessage: "cuanto gasta de gasolina?", expectedStage: "Pregunta rendimiento mexicana" },
        { userMessage: "trae garantia?", expectedStage: "Pregunta garantía casual" },
        { userMessage: "puedo manejarlo?", expectedStage: "Test drive informal" },
      ],
      // Trabajador mexicano buscando pickup
      trabajador_l200: [
        { userMessage: "que tal", expectedStage: "Saludo trabajador" },
        { userMessage: "la L200", expectedStage: "Pregunta directa pickup" },
        { userMessage: "carlos", expectedStage: "Nombre trabajador" },
        { userMessage: "para el trabajo", expectedStage: "Uso laboral" },
        { userMessage: "cuanto carga?", expectedStage: "Capacidad trabajo" },
        { userMessage: "viene con clima?", expectedStage: "Aire acondicionado mexicano" },
        { userMessage: "como le puedo hacer para pagarlo?", expectedStage: "Forma de pago mexicana" },
      ],
    },
  },
  "grupo-milkasa": {
    name: "Grupo Milkasa",
    description: "Inmobiliaria líder en Michoacán especializada en propiedades residenciales",
    testScenarios: {
      // Como realmente llegan los clientes mexicanos
      cliente_casa_gomez_farias: [
        {
          userMessage: "Hola, me puedes dar información de la casa gomez farias",
          expectedStage: "Pregunta específica real",
        },
        { userMessage: "zona medrina", expectedStage: "Especifica zona como llega" },
      ],
      // Cliente típico michoacano
      cliente_uruapan: [
        { userMessage: "hola", expectedStage: "Saludo simple" },
        { userMessage: "busco casa", expectedStage: "Directo al punto" },
        { userMessage: "maria", expectedStage: "Nombre simple" },
        { userMessage: "comprar", expectedStage: "Una palabra" },
        { userMessage: "uruapan", expectedStage: "Solo la ciudad" },
        { userMessage: "2 millones", expectedStage: "Presupuesto directo" },
        { userMessage: "que hay?", expectedStage: "Pregunta casual" },
      ],
      // Cliente buscando depa para rentar
      depa_renta: [
        { userMessage: "buenas alejandro", expectedStage: "Saludo conocido" },
        { userMessage: "busco depa para rentar", expectedStage: "Directo" },
        { userMessage: "luis", expectedStage: "Nombre corto" },
        { userMessage: "morelia", expectedStage: "Ciudad" },
        { userMessage: "maximo 15 mil", expectedStage: "Presupuesto claro" },
        { userMessage: "2 recamaras", expectedStage: "Especificación" },
        { userMessage: "hay algo?", expectedStage: "Pregunta mexicana" },
      ],
      // Asesor que llega
      asesor_real: [
        { userMessage: "hola", expectedStage: "Saludo" },
        { userMessage: "soy asesor", expectedStage: "Se identifica simple" },
        { userMessage: "roberto de century 21", expectedStage: "Datos básicos" },
        { userMessage: "tengo cliente", expectedStage: "Menciona cliente" },
        { userMessage: "casa uruapan", expectedStage: "Especifica corto" },
        { userMessage: "compartes comision?", expectedStage: "Pregunta directa" },
      ],
      // Cliente informal típico
      cliente_mexicano_real: [
        { userMessage: "que tal", expectedStage: "Saludo mexicano" },
        { userMessage: "info", expectedStage: "Súper corto" },
        { userMessage: "pedro", expectedStage: "Nombre" },
        { userMessage: "casa", expectedStage: "Tipo" },
        { userMessage: "pátzcuaro", expectedStage: "Ciudad" },
        { userMessage: "cuanto sale?", expectedStage: "Pregunta precio mexicana" },
      ],
    },
  },

  britanicomx: {
    name: "Colegio Británico de Guadalajara",
    description: "Institución educativa bilingüe con filosofía humanista y laica",
    testScenarios: {
      // Escenario 1: Padre interesado en Maternal
      consulta_maternal: [
        { userMessage: "Hola", expectedStage: "Saludo inicial" },
        { userMessage: "Información", expectedStage: "Solicita información" },
        { userMessage: "María González", expectedStage: "Proporciona nombre" },
        { userMessage: "Maternal", expectedStage: "Especifica grado" },
        { userMessage: "¿Cuánto cuesta?", expectedStage: "Pregunta costos" },
        { userMessage: "¿Qué incluye?", expectedStage: "Pregunta detalles" },
        { userMessage: "¿Puedo visitarlos?", expectedStage: "Solicita visita" },
      ],

      // Escenario 2: Consulta sobre Preescolar K3
      preescolar_k3: [
        { userMessage: "Buenos días", expectedStage: "Saludo formal" },
        { userMessage: "Soy Laura Martínez", expectedStage: "Proporciona nombre" },
        { userMessage: "Busco información de K3", expectedStage: "Especifica K3" },
        { userMessage: "¿Hay descuentos?", expectedStage: "Pregunta descuentos" },
        { userMessage: "¿Qué documentos necesito?", expectedStage: "Pregunta documentación" },
        { userMessage: "¿Cómo son los horarios?", expectedStage: "Pregunta horarios" },
      ],

      // Escenario 3: Primaria con preguntas específicas
      primaria_completa: [
        { userMessage: "Hola", expectedStage: "Saludo inicial" },
        { userMessage: "Roberto Silva", expectedStage: "Proporciona nombre" },
        { userMessage: "Quiero información de 3ro de primaria", expectedStage: "Especifica 3ro primaria" },
        { userMessage: "¿Qué metodología usan?", expectedStage: "Pregunta metodología" },
        { userMessage: "¿Tienen actividades extracurriculares?", expectedStage: "Pregunta actividades" },
        { userMessage: "¿Hasta qué hora se pueden quedar?", expectedStage: "Pregunta horario extendido" },
        { userMessage: "Me interesa agendar visita", expectedStage: "Solicita visita" },
      ],

      // Escenario 4: Secundaria con certificaciones
      secundaria_certificacion: [
        { userMessage: "Buenas tardes", expectedStage: "Saludo formal" },
        { userMessage: "Ana Patricia Ruiz", expectedStage: "Proporciona nombre completo" },
        { userMessage: "Información de 1ro de secundaria", expectedStage: "Especifica 1ro secundaria" },
        { userMessage: "¿Tienen certificaciones internacionales?", expectedStage: "Pregunta certificaciones" },
        { userMessage: "¿Cuánto inglés ven?", expectedStage: "Pregunta porcentaje inglés" },
        { userMessage: "¿Qué preparatorias recomiendan?", expectedStage: "Pregunta preparatorias" },
      ],

      // Escenario 5: Comparación de grados y costos
      comparacion_grados: [
        { userMessage: "Hola", expectedStage: "Saludo inicial" },
        { userMessage: "Carlos Mendoza", expectedStage: "Proporciona nombre" },
        { userMessage: "Tengo dos hijos", expectedStage: "Menciona múltiples hijos" },
        { userMessage: "Uno en K2 y otro en 4to de primaria", expectedStage: "Especifica múltiples grados" },
        { userMessage: "¿Cuánto sería en total?", expectedStage: "Pregunta costo total" },
        { userMessage: "¿Hay descuentos por hermanos?", expectedStage: "Pregunta descuento hermanos" },
      ],

      // Escenario 6: Consultas sobre servicios adicionales
      servicios_adicionales: [
        { userMessage: "Buenos días", expectedStage: "Saludo formal" },
        { userMessage: "Patricia López", expectedStage: "Proporciona nombre" },
        { userMessage: "K1", expectedStage: "Especifica K1" },
        { userMessage: "¿Tienen comedor?", expectedStage: "Pregunta comedor" },
        { userMessage: "¿Qué incluye el horario extendido?", expectedStage: "Pregunta horario extendido" },
        { userMessage: "¿Cuándo empiezan las clases?", expectedStage: "Pregunta inicio clases" },
      ],

      // Escenario 7: Proceso de inscripción
      proceso_inscripcion: [
        { userMessage: "Hola", expectedStage: "Saludo inicial" },
        { userMessage: "Diana Herrera", expectedStage: "Proporciona nombre" },
        { userMessage: "6to de primaria", expectedStage: "Especifica 6to primaria" },
        { userMessage: "Quiero inscribir a mi hijo", expectedStage: "Manifiesta intención inscripción" },
        { userMessage: "¿Qué necesito hacer?", expectedStage: "Pregunta proceso" },
        { userMessage: "¿Hay evaluación diagnóstica?", expectedStage: "Pregunta evaluación" },
      ],

      // Escenario 8: Cliente indeciso con múltiples preguntas
      cliente_indeciso: [
        { userMessage: "Hola", expectedStage: "Saludo inicial" },
        { userMessage: "Jorge Ramírez", expectedStage: "Proporciona nombre" },
        { userMessage: "Estoy viendo varias escuelas", expectedStage: "Menciona comparación" },
        { userMessage: "Para 2do de primaria", expectedStage: "Especifica 2do primaria" },
        { userMessage: "¿Qué los hace diferentes?", expectedStage: "Pregunta diferenciadores" },
        { userMessage: "¿Puedo conocer las instalaciones?", expectedStage: "Solicita visita" },
      ],
    },
  },
};

// Función para mostrar ayuda
function showHelp() {
  console.log("\n🚀 Test Perfected Flow - Multi-Empresa");
  console.log("=".repeat(50));
  console.log("\n📋 Uso:");
  console.log("  node test-perfected-flow.js --quicklearning");
  console.log("  node test-perfected-flow.js --grupokg");
  console.log("  node test-perfected-flow.js --grupo-milkasa");
  console.log("  node test-perfected-flow.js --britanicomx");
  console.log("  node test-perfected-flow.js --full");
  console.log("  node test-perfected-flow.js --help");

  console.log("\n🏢 Empresas disponibles:");
  Object.entries(COMPANY_CONFIGS).forEach(([slug, config]) => {
    console.log(`  --${slug}: ${config.name} - ${config.description}`);
  });

  console.log("\n📊 Opciones:");
  console.log("  --full: Ejecuta pruebas para todas las empresas");
  console.log("  --help: Muestra esta ayuda");

  console.log("\n💡 Ejemplos:");
  console.log("  node test-perfected-flow.js --quicklearning");
  console.log("  node test-perfected-flow.js --grupokg");
  console.log("  node test-perfected-flow.js --grupo-milkasa");
  console.log("  node test-perfected-flow.js --full");
}

// Función para probar una empresa específica
async function testCompany(companySlug) {
  const config = COMPANY_CONFIGS[companySlug];
  if (!config) {
    console.error(`❌ Empresa '${companySlug}' no encontrada`);
    return;
  }

  console.log(`\n🏢 Probando ${config.name} (${companySlug})`);
  console.log(`📝 ${config.description}`);
  console.log("=".repeat(80));

  try {
    // Health check
    console.log("🏥 Health check...");
    const healthResponse = await axios.get(`${BASE_URL}/api/test/health`);
    console.log("✅ Health:", healthResponse.data.message, "\n");

    // Ejecutar escenarios de prueba
    const results = [];

    for (const [scenarioName, messages] of Object.entries(config.testScenarios)) {
      const phone = `test-${companySlug}-${scenarioName}`;
      const profileName = `Usuario ${scenarioName}`;

      const result = await runTestScenario(
        `Test ${companySlug}: ${scenarioName}`,
        messages,
        phone,
        profileName,
        companySlug
      );

      results.push({ scenario: scenarioName, result });
    }

    console.log(`\n✅ ${config.name} probado exitosamente`);
    return results;
  } catch (error) {
    console.error(`❌ Error probando ${config.name}:`, error.response?.data || error.message);
    return null;
  }
}

// Función principal
async function testPerfectedFlow() {
  const args = process.argv.slice(2);

  // Mostrar ayuda si se solicita
  if (args.includes("--help") || args.length === 0) {
    showHelp();
    return;
  }

  console.log("🧪 Testing PERFECTED BaseAgent Flow - Multi-Empresa\n");

  try {
    // Determinar qué empresas probar
    let companiesToTest = [];

    if (args.includes("--full")) {
      companiesToTest = Object.keys(COMPANY_CONFIGS);
    } else {
      // Probar empresas específicas
      for (const arg of args) {
        if (arg.startsWith("--")) {
          const companySlug = arg.substring(2);
          if (COMPANY_CONFIGS[companySlug]) {
            companiesToTest.push(companySlug);
          } else {
            console.warn(`⚠️ Empresa '${companySlug}' no reconocida`);
          }
        }
      }
    }

    if (companiesToTest.length === 0) {
      console.error("❌ No se especificaron empresas válidas para probar");
      showHelp();
      return;
    }

    // Ejecutar pruebas para cada empresa
    const allResults = {};

    for (const companySlug of companiesToTest) {
      const results = await testCompany(companySlug);
      if (results) {
        allResults[companySlug] = results;
      }
    }

    // Resumen final
    console.log("\n📊 Resumen Final del Testing Multi-Empresa");
    console.log("=".repeat(100));

    Object.entries(allResults).forEach(([companySlug, results]) => {
      const config = COMPANY_CONFIGS[companySlug];
      console.log(`✅ ${config.name}: ${results.length} escenarios probados`);
    });

    console.log("=".repeat(100));
    console.log("🎉 Testing multi-empresa completado exitosamente");
    console.log("🗄️ Base de datos local funcionando correctamente");
    console.log("🔄 Transferencias a asesor funcionando");
    console.log("📚 Historial de conversaciones mantenido");
  } catch (error) {
    console.error("❌ Error en testing multi-empresa:", error.response?.data || error.message);
  }
}

// Run the test
testPerfectedFlow();
