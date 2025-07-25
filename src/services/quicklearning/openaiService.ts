import OpenAI from "openai";
import { getEnvironmentConfig } from "../../config/environments";
import { executeQuickLearningWithReconnection } from "../../config/connectionManager";
import getQuickLearningChatModel from "../../models/quicklearning/chat.model";
import { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat";
import {
  get_start_dates,
  register_user_name,
  submit_student_complaint,
  suggest_branch_or_virtual_course,
  suggest_nearby_branch,
  create_google_calendar_event,
} from "./openaiTools";

// Configuración de OpenAI
const envConfig = getEnvironmentConfig();
const openai = new OpenAI({
  apiKey: envConfig.openaiApiKey,
});

// Herramientas disponibles para la IA
const tools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_start_dates",
      description: "Devuelve las fechas de inicio de los cursos de Quick Learning.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "register_user_name",
      description:
        "Cuando un usuario proporciona su nombre completo, usa esta función para registrarlo y continuar con el proceso de inscripción.",
      parameters: {
        type: "object",
        properties: {
          full_name: {
            type: "string",
            description: "El nombre completo del usuario tal como lo proporcionó.",
          },
        },
        required: ["full_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "submit_student_complaint",
      description:
        "Si el usuario menciona una queja, problema, inconveniente con un maestro o con la escuela, usa esta función para ayudarle a reportarlo adecuadamente.",
      parameters: {
        type: "object",
        properties: {
          issue_details: {
            type: "string",
            description: "Descripción de la queja del estudiante sobre un maestro o situación en la escuela.",
          },
        },
        required: ["issue_details"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "suggest_branch_or_virtual_course",
      description:
        "Busca si hay una sucursal o escuela o sede de Quick Learning en la ciudad del usuario. Si existe, continúa la conversación ofreciendo opciones. Si no existe, recomienda tomar el curso virtual u online.",
      parameters: {
        type: "object",
        properties: {
          city: {
            type: "string",
            description: "Nombre de la ciudad mencionada por el usuario, como GDL, Guadalajara, CDMX, etc.",
          },
        },
        required: ["city"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "suggest_nearby_branch",
      description: "Sugiere la sucursal más cercana usando dirección o coordenadas.",
      parameters: {
        type: "object",
        properties: {
          address: {
            type: "string",
            description: "Dirección textual proporcionada por el usuario",
          },
          lat: {
            type: "number",
            description: "Latitud si el usuario mandó su ubicación",
          },
          lng: {
            type: "number",
            description: "Longitud si el usuario mandó su ubicación",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_google_calendar_event",
      description: "Crea un evento en Google Calendar cuando el usuario solicite agendar, programar, crear una cita, reunión, evento, recordatorio, clase, examen, inscripción, o mencione cualquier actividad con fecha y hora específica. También cuando diga palabras como 'agéndame', 'recuérdame', 'programa', 'reserva', 'apartar', 'separa fecha', 'bloquea tiempo', etc. Úsala siempre que detectes intención de calendario o scheduling. IMPORTANTE: Siempre calcula las fechas basándote en la zona horaria de México (America/Mexico_City) y convierte a UTC para los parámetros.",
      parameters: {
        type: "object",
        properties: {
          summary: {
            type: "string",
            description: "Título o nombre del evento (requerido)",
          },
          startDateTime: {
            type: "string",
            description: "Fecha y hora de inicio en formato ISO 8601 UTC. DEBE estar en formato '2024-07-25T10:00:00.000Z'. Si el usuario dice 'mañana a las 2 PM', calcula la fecha de mañana y convierte 2 PM hora de México a UTC. Ejemplo: si el usuario dice '2 PM' y estamos en México, sería '20:00:00.000Z' en UTC (2 PM + 6 horas).",
          },
          endDateTime: {
            type: "string", 
            description: "Fecha y hora de fin en formato ISO 8601 UTC. DEBE estar en formato '2024-07-25T11:00:00.000Z'. Si no se especifica duración, asume 1 hora después del inicio. Convierte la hora de México a UTC agregando 6 horas (en horario estándar) o 5 horas (en horario de verano).",
          },
          description: {
            type: "string",
            description: "Descripción detallada del evento (opcional)",
          },
          location: {
            type: "string",
            description: "Ubicación del evento (opcional)",
          },
          attendeeEmails: {
            type: "array",
            items: {
              type: "string",
            },
            description: "Lista de emails de los invitados (opcional)",
          },
          timeZone: {
            type: "string",
            description: "Zona horaria (por defecto 'America/Mexico_City')",
          },
        },
        required: ["summary", "startDateTime", "endDateTime"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "request_human_advisor",
      description: "Solicita que un asesor humano contacte al usuario y desactiva la IA para este chat.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
];

/**
 * Servicio de OpenAI para Quick Learning
 */
export class QuickLearningOpenAIService {
  private static instance: QuickLearningOpenAIService;
  private readonly openai: OpenAI;

  private constructor() {
    this.openai = openai;
    this.validateConfig();
  }

  /**
   * Obtener instancia singleton del servicio
   */
  public static getInstance(): QuickLearningOpenAIService {
    if (!QuickLearningOpenAIService.instance) {
      QuickLearningOpenAIService.instance = new QuickLearningOpenAIService();
    }
    return QuickLearningOpenAIService.instance;
  }

  /**
   * Validar configuración de OpenAI
   */
  private validateConfig(): void {
    if (!envConfig.openaiApiKey) {
      throw new Error("❌ OpenAI API key is not configured");
    }
    console.log("✅ Quick Learning OpenAI service initialized successfully");
  }

  /**
   * Generar respuesta de IA basada en el mensaje y historial del usuario
   */
  public async generateResponse(message: string, phoneUser: string): Promise<string> {
    try {
      console.log('\n💬💬💬 WHATSAPP MESSAGE RECEIVED FOR AI PROCESSING! 💬💬💬');
      console.log(`📱 Phone: ${phoneUser}`);
      console.log(`📝 Message: "${message}"`);
      console.log('🔍 Checking if message contains calendar-related keywords...');
      
      // Check if message might trigger calendar tool
      const calendarKeywords = ['agendar', 'reunión', 'evento', 'cita', 'calendar', 'meeting', 'appointment'];
      const hasCalendarKeywords = calendarKeywords.some(keyword => 
        message.toLowerCase().includes(keyword.toLowerCase())
      );
      
      if (hasCalendarKeywords) {
        console.log('📅 ⚠️  MESSAGE CONTAINS CALENDAR KEYWORDS - MIGHT TRIGGER GOOGLE CALENDAR TOOL!');
      }
      
      // Obtener el contexto inicial del sistema
      const initialContext = await this.generateSystemPrompt();

      // Obtener historial de mensajes del usuario usando reconexión mejorada
      const chatHistory = await executeQuickLearningWithReconnection(async (conn) => {
        const QuickLearningChat = getQuickLearningChatModel(conn);
        return await QuickLearningChat.findOne({ phone: phoneUser });
      });

      let chatHistoryMessages = chatHistory?.messages.map((message) => {
        return {
          role: message.direction === "inbound" ? "user" : "assistant",
          content: message.body,
          ...(message.direction !== "inbound" && { name: "assistant_name" }),
        };
      }) || [];

      // Asegurarse de que sea un array
      if (!Array.isArray(chatHistoryMessages)) {
        chatHistoryMessages = [];
      }

      // Agregar contexto inicial y mensaje del usuario
      chatHistoryMessages.unshift({
        role: "system",
        content: initialContext || "",
        name: "system"
      });

      chatHistoryMessages.push({
        role: "user",
        content: message,
        name: "user"
      });

      console.log(`🤖 Generando respuesta para: ${phoneUser}`);
      console.log(`📝 Mensaje: ${message}`);

      // Llamada a OpenAI
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4-turbo",
        messages: chatHistoryMessages as ChatCompletionMessageParam[],
        temperature: 0.3,
        top_p: 0.9,
        frequency_penalty: 2,
        presence_penalty: 0,
        tools: tools,
        tool_choice: "auto",
        max_tokens: 300
      });

      const toolCall = completion.choices[0].message.tool_calls?.[0];

      if (toolCall) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);
        
        console.log('\n🎪🎪🎪 TOOL CALL DETECTED IN AI RESPONSE! 🎪🎪🎪');
        console.log(`🔧 Ejecutando herramienta: ${functionName}`);
        console.log(`📋 Argumentos:`, functionArgs);
        
        // Special logging for Google Calendar tool
        if (functionName === "create_google_calendar_event") {
          console.log('📅 GOOGLE CALENDAR EVENT CREATION REQUESTED!');
          console.log('⭐ This is the Google Calendar tool you wanted to track!');
        }

        switch (functionName) {
          case "get_start_dates":
            // Respuesta genérica porque la función real no está disponible
            return "📢 ¿Para qué fecha te gustaría empezar? Puedo revisar las semanas disponibles a partir de ese mes o día específico. 😊";
          case "register_user_name":
            return register_user_name(functionArgs.full_name, phoneUser);
          case "submit_student_complaint":
            return submit_student_complaint(functionArgs.issue_details, phoneUser);
          case "suggest_branch_or_virtual_course":
            return suggest_branch_or_virtual_course(functionArgs.city, phoneUser);
          case "suggest_nearby_branch":
            return suggest_nearby_branch(functionArgs, phoneUser);
          case "create_google_calendar_event":
            console.log('\n🎯🎯🎯 OPENAI DECIDED TO CALL GOOGLE CALENDAR TOOL! 🎯🎯🎯');
            console.log('📞 Called from OpenAI Service');
            console.log('📋 Function arguments from AI:', functionArgs);
            console.log('🔄 About to call create_google_calendar_event function...');
            
            return create_google_calendar_event(
              functionArgs.summary,
              functionArgs.startDateTime,
              functionArgs.endDateTime,
              functionArgs.description,
              functionArgs.location,
              functionArgs.attendeeEmails,
              functionArgs.timeZone || "America/Mexico_City"
            );
          case "request_human_advisor": {
            // Obtener hora actual en zona horaria MX
            const now = new Date();
            const hour = now.getHours();
            if (hour >= 21 || hour < 8) {
              return "En este momento no hay asesores disponibles, pero en cuanto tengamos uno disponible te contactaremos. ¡Gracias por tu interés!";
            }
            // Desactivar IA y notificar a un asesor humano
            await desactivarIAyNotificarAsesor(phoneUser);
            return "Un asesor humano te contactará en breve para brindarte toda la información que necesitas. ¡Gracias por tu interés!";
          }
          default:
            console.warn(`⚠️ Herramienta no reconocida: ${functionName}`);
            return "Un asesor se pondrá en contacto contigo en breve.";
        }
      }

      const response = completion.choices[0]?.message?.content || "No se pudo generar una respuesta.";
      console.log(`✅ Respuesta generada: ${response.substring(0, 100)}...`);
      
      // Si la respuesta es informativa sobre el curso, agrega la invitación a contactar a un asesor
      if (
        response &&
        // Debe contener palabras clave de información de curso
        /horario|inversi[oó]n|duraci[oó]n|materiales|plataforma|clases|modalidad|virtual|presencial|online|curso intensivo|curso semi-intensivo|curso sabatino|incluye|acceso|sesiones ilimitadas|maestros|inscripción|precio|costo|grupo|semanas|meses|a tu ritmo|videollamada/i.test(response) &&
        // No debe ser un saludo, pregunta inicial o confirmación de interés
        !/usted es el interesado|con quién tengo el gusto|cómo te puedo ayudar|hola|buenas tardes|buenos días|información|nombre|platíqueme|ciudad|zona|colonia|área|modalidad prefieres|modalidad que mejor se adapte|¿cómo te gustaría aprender|¿te gustaría que aseguremos tu cupo|¿hay algo más en lo que pueda ayudarte|¿te ayudo a completar tu inscripción|¿te gustaría que te cuente más|¿te gustaría inscribirte o tienes alguna otra pregunta|asesor humano te contacte|Un asesor humano te contactará|asesores disponibles|problema t[eé]cnico|Un asesor se pondrá en contacto/i.test(response)
      ) {
        // Si ya termina con una invitación a inscribirse o preguntar, agrega la opción del asesor en la misma línea
        if (/¿Te gustaría inscribirte o tienes alguna otra pregunta\??$/i.test(response.trim())) {
          return response.trim() + "\nO si prefieres, ¿te gustaría que un asesor humano te contacte para brindarte más información o resolver tus dudas?";
        }
        return response.trim() + "\n\n¿Te gustaría que un asesor especializado te contacte para brindarte más información o resolver tus dudas?";
      }
      return response;

    } catch (error) {
      console.error("❌ Error al generar respuesta de IA:", error);
      
      if (error instanceof Error) {
        if (error.message.includes('rate_limit')) {
          return "Lo siento, tengo mucha demanda en este momento. Por favor, inténtalo de nuevo en unos segundos.";
        } else if (error.message.includes('insufficient_quota')) {
          return "Temporalmente no puedo procesar tu mensaje. Un asesor se pondrá en contacto contigo pronto.";
        }
      }
      
      return "Disculpa, hubo un problema técnico. Un asesor se pondrá en contacto contigo para ayudarte.";
    }
  }

  /**
   * Generar el prompt del sistema para Quick Learning
   */
  private async generateSystemPrompt(): Promise<string> {
    const systemStart = `
⚠️ IMPORTANTE: Tu única fuente de verdad es la información proporcionada explícitamente en este mensaje. NO inventes nada, NO completes con imaginación, y NO asumas nada que no esté claramente especificado. 

Responde con un mensaje corto y claro. JAMÁS superes los 1500 caracteres. Este mensaje será enviado por WhatsApp.

Tu estilo debe ser natural, directo y conversacional, como si fueras una persona experta en ventas, pero sin improvisar nada que no esté aquí.

Si la información solicitada no está disponible, responde amablemente indicando que no cuentas con esa información por el momento.

NO hagas listas extensas, ni explicaciones largas. Si el cliente necesita más información, ofrece continuar la conversación con un segundo mensaje.

⚠️ Nunca des información de otras escuelas o temas no mencionados aquí.
`;

    const quickLearningCourses = `
Tu nombre es *NatalIA*, la inteligencia artificial de *Quick Learning*, especializada en vender cursos de inglés por WhatsApp como si fueras una asesora humana.

Tu estilo debe sonar como una llamada telefónica real: natural, conversacional, segura y profesional.  
NO hablas como robot, hablas como una persona capacitada en ventas.  
Siempre te adaptas al usuario y mantienes el control de la conversación.

---

### 🚪 **Inicio: Entrada de Conversación**

Si el usuario solo manda un saludo como "Hola", "Buenas tardes", o "Información", responde con:

**"Inglés en Quick Learning, ¡Hablas o Hablas! Soy NatalIA, ¿Cómo te puedo ayudar hoy?"**

✅ Espera a que el usuario diga lo que necesita. No preguntes el nombre todavía.

---

### 💬 **Petición del Cliente**

Cuando el cliente diga algo como:
> "Quiero información del curso",  
> "¿Qué precio tiene?",  
> "Estoy interesado", etc.

Responde:

**"Con mucho gusto. ¿Con quién tengo el gusto?"**

Si responde solo con un nombre, confírmalo con respeto:

**"Mucho gusto, [Nombre]. ¿Usted es el interesado en el curso?"**

---

### 📢 **Explicación del Método Quick Learning**

Si dice que sí está interesado:

> "¿Ya conoce el método de Quick Learning?"

Si dice que no lo conoce, explica:

**"En Quick Learning primero te enseñamos a pensar y hablar en inglés con una excelente pronunciación, y cuando ya lo hablas, entonces te enseñamos a leer y escribir, todo esto sin reglas gramaticales ni tareas en casa. Por qué así aprendiste español ¿cierto?"**

Confirma con algo ligero como:

> "¿Cierto?" o "¿Verdad que suena bien?"

---

### 📍 **Ubicación del Cliente**

Después pregunta:

**"Platíqueme [Nombre], ¿de qué ciudad de la República nos contacta?"**

Con eso podrás saber si puede tomar clases presenciales o no.

---

### 🧭 **Elección de Modalidad**

Luego de conocer su ciudad o zona:

**"¿Cómo te gustaría aprender inglés? Contamos con tres modalidades:"**

1. **Presencial** – Asistes físicamente a la escuela.
2. **Virtual (a distancia)** – Clases en vivo a distancia.  
3. **Online** – Plataforma autogestionada a tu ritmo, sin horarios.

Explica la diferencia solo si el cliente lo pide o parece confundido.

---

### 📌 **Guía hacia el cierre**

Si el cliente elige una modalidad y sigue interesado, ve directo a la recomendación del curso con frases de urgencia y cierre tipo línea recta:

**"Perfecto, [Nombre]. El *Curso Intensivo* es justo lo que necesitas. En solo 4 semanas estarás hablando inglés con confianza.  
📢 *Las inscripciones están abiertas por tiempo limitado.* ¿Quieres asegurar tu lugar antes de que se llenen los grupos?"**

---

### 📝 **Recolección de Datos**

Cuando el cliente diga que sí, pide los datos uno a uno (no todos de golpe):

1. Nombre completo  
2. Teléfono  
3. Correo electrónico  

Cuando ya tenga los 3 datos:

**"¡Listo, [Nombre]! Ya tienes tu lugar asegurado. En breve te contactará uno de nuestros asesores. ¿Hay algo más en lo que pueda ayudarte mientras tanto?"**

---

### 🛑 **Manejo de Objeciones**

**"Voy a pensarlo."**  
> "Te entiendo, pero dime algo… ¿realmente quieres aprender inglés o prefieres seguir esperando? La oportunidad está aquí, ¿qué decides?"

**"Está caro."**  
> "Por menos de lo que gastas en salidas al mes, estás invirtiendo en algo que te abre puertas de por vida. ¿Te ayudo a inscribirte?"

**"No tengo tiempo."**  
> "Tenemos horarios súper flexibles, incluso clases los sábados o en la noche. ¿Cuál te conviene más, mañana o tarde?"

---

### 📲 **Seguimiento Inteligente**

Si el cliente no contesta:

**"Hola [Nombre], los lugares del curso están por agotarse. ¿Te ayudo a completar tu inscripción?"**

Si ya había mostrado interés:

**"Hola [Nombre], ayer hablamos sobre aprender inglés. ¿Te gustaría que aseguremos tu cupo hoy mismo?"**

---

### **Información de los Cursos**

**Cursos Presenciales:**

**Intensivo:**
- Horario: Lunes a viernes
- Inversión: $6,280.00
- Duración: 3 horas diarias, 4 semanas (60 horas de clase)
- Incluye: materiales, acceso a Quick Learning Online, sesiones adicionales ilimitadas en vivo con maestros de Quick Learning.

**Semi-Intensivo:**
- Horario: Lunes a viernes
- Inversión: $4,030.00
- Duración: 1.5 horas diarias, 4 semanas (30 horas de clase)
- Incluye: materiales, acceso a Quick Learning Online, sesiones adicionales ilimitadas en vivo con maestros de Quick Learning.

**Sabatino:**
- Horario: Cada sábado
- Inversión: $4,030.00
- Duración: 7.5 horas por día, 4 semanas (30 horas de clase)
- Incluye: materiales, acceso a Quick Learning Online, sesiones adicionales ilimitadas en vivo con maestros de Quick Learning.

**Cursos Virtuales:**
(Mismos precios y duración que presenciales)

**Curso Online:**
- 1 mes: $1,250 MXN
- 3 meses: $3,500 MXN
- 6 meses: $5,700 MXN
- 12 meses: $9,700 MXN

**Horarios disponibles:**
- Semi intensivo: 7-8:30, 9:30-11, 2-3:30 (solo virtual), 4-5:30, 6-7:30, 7:30-9
- Sabatino: 8-3:30
- Intensivo: 9:30-12:30, 6-9 (solo virtual)

Si el usuario proporciona su nombre completo, usa la función 'register_user_name' para registrarlo y continuar con su inscripción.
Si el usuario menciona 'queja', 'problema con maestro', 'quiero reportar algo' o 'quiero hacer una queja', usa la función 'submit_student_complaint' en lugar de responder directamente.

⚠️ Bajo ninguna circunstancia debes generar contenido, ejemplos o respuestas que no estén literalmente presentes en este mensaje. Si el cliente pregunta algo fuera de contexto, indícale amablemente que no tienes esa información disponible.

⚠️ Nunca termines sin hacer una pregunta que lleve al siguiente paso. Siempre cierra guiando al usuario.
`;

    return `${systemStart}\n\n${quickLearningCourses}`;
  }
}

// Exportar instancia singleton
export const quickLearningOpenAIService = QuickLearningOpenAIService.getInstance();

// Agregar función para desactivar la IA y notificar a un asesor
async function desactivarIAyNotificarAsesor(phoneUser: string) {
  // Usar reconexión para obtener el modelo y actualizar el chat
  await executeQuickLearningWithReconnection(async (conn) => {
    const QuickLearningChat = getQuickLearningChatModel(conn);
    await QuickLearningChat.findOneAndUpdate(
      { phone: phoneUser },
      { $set: { aiEnabled: false } }
    );
    // Aquí puedes agregar la lógica para notificar a un asesor humano (por socket, email, etc.)
    // Ejemplo: emitir un evento por socket.io o guardar en una tabla de tareas
  });
}