import { Agent, tool } from '@openai/agents';
import { BaseAgent } from './BaseAgent';
import { z } from 'zod';

export class QuickLearningAgent extends BaseAgent {
  
  protected async initializeAgent(): Promise<void> {
    this.agent = new Agent({
      name: 'NatalIA',
      instructions: this.getSystemInstructions() + this.getPresencialPlansUpdateInstructions(),
      model: 'gpt-4o-mini',
      modelSettings: {
        temperature: 0.3,
        // maxTokens: 300
      },
      tools: [
        tool({
          name: 'check_transfer_keywords',
          description: 'Check if user message contains keywords that require immediate transfer to advisor (presencial or SMART/PLUS/MAX plans).',
          parameters: z.object({
            message: z.string().describe('The user message to analyze')
          }) as any,
          execute: async ({ message }) => {
            try {
              console.log('🔧 DEBUG: Ejecutando check_transfer_keywords');
              console.log('🔧 DEBUG: message:', message);
              const lowerMessage = message.toLowerCase();

              // Base presencial/payment triggers
              const transferKeywords = [
                'presencial', 'sucursal', 'satelite', 'satélite', 'en persona', 'fisico', 'físico', 'direccion', 'dirección', 'ubicacion', 'ubicación',
                '68 sucursales', 'ir a la escuela', 'clases presenciales',
                'tarjeta', 'tarjeta de credito', 'tarjeta de crédito', 'tarjeta de debito', 'tarjeta de débito', 'tarjeta bancaria',
                'pago', 'informacion de pago', 'información de pago', 'datos de pago'
              ];

              const foundKeywords = transferKeywords.filter(keyword => lowerMessage.includes(keyword));

              // New presencial plan names (SMART / PLUS / MAX) — only trigger when paired with a course context word
              const planNames = ['smart', 'plus', 'max'];
              const contextWords = ['curso', 'cursos', 'plan', 'planes', 'paquete', 'paquetes', 'programa', 'programas', 'modalidad', 'modalidades', 'esquema', 'esquemas'];
              const mentionsPlanWithContext = planNames.some(n => lowerMessage.includes(n)) && contextWords.some(w => lowerMessage.includes(w));

              if (mentionsPlanWithContext) {
                planNames.forEach(n => {
                  if (lowerMessage.includes(n)) foundKeywords.push(n);
                });
              }

              if (foundKeywords.length > 0) {
                const result = `TRANSFER_TO_ADVISOR: Keywords detected: ${foundKeywords.join(', ')}`;
                console.log('🔧 DEBUG: check_transfer_keywords result:', result);
                return result;
              }

              const result = 'CONTINUE_CONVERSATION: No transfer keywords found';
              console.log('🔧 DEBUG: check_transfer_keywords result:', result);
              return result;
            } catch (error) {
              console.error('❌ ERROR en check_transfer_keywords:', error);
              return 'ERROR en verificacion de palabras clave';
            }
          }
        }),
        tool({
          name: 'check_service_offer_keywords',
          description: 'Check if user message contains keywords indicating they are offering services, products, or applying as teacher.',
          parameters: z.object({
            message: z.string().describe('The user message to analyze')
          }) as any,
          execute: async ({ message }) => {
            try {
              console.log('🔧 DEBUG: Ejecutando check_service_offer_keywords');
              console.log('🔧 DEBUG: message:', message);
              
              const serviceOfferKeywords = [
                // Ofertas de servicios
                'ofrezco', 'brindo', 'proporciono', 'doy', 'imparto',
                'servicio', 'servicios', 'consultoria', 'asesoria',
                'clases particulares', 'tutorias', 'capacitacion',
                
                // Ofertas de productos
                'vendo', 'vendemos', 'producto', 'productos', 'material',
                'libros', 'software', 'sistema', 'plataforma',
                
                // Solicitudes de empleo como maestro
                'soy maestro', 'soy maestra', 'soy profesor', 'soy profesora',
                'maestro de ingles', 'maestra de ingles', 'profesor de ingles', 'profesora de ingles',
                'busco trabajo', 'trabajo como maestro', 'trabajo como profesor',
                'quisiera trabajar', 'quiero trabajar', 'me gustaria trabajar',
                'experiencia docente', 'experiencia enseñando', 'curriculum',
                'cv', 'solicitud de empleo', 'postularme', 'aplicar',
                'vacante', 'vacantes', 'empleo', 'oportunidad laboral',
                'teacher', 'english teacher', 'instructor'
              ];
              
              const lowerMessage = message.toLowerCase();
              const foundKeywords = serviceOfferKeywords.filter(keyword => 
                lowerMessage.includes(keyword.toLowerCase())
              );
              
              if (foundKeywords.length > 0) {
                const result = `HR_CONTACT_REQUIRED: Service/Product offer or Job application detected. Keywords: ${foundKeywords.join(', ')}`;
                console.log('🔧 DEBUG: check_service_offer_keywords result:', result);
                return result;
              }
              
              const result = 'CONTINUE_NORMAL: No service offer or job application keywords found';
              console.log('🔧 DEBUG: check_service_offer_keywords result:', result);
              return result;
            } catch (error) {
              console.error('❌ ERROR en check_service_offer_keywords:', error);
              return 'ERROR en verificacion de ofertas de servicio';
            }
          }
        }),
        tool({
          name: 'get_virtual_course_info',
          description: 'Get detailed information about Virtual courses including schedules and prices.',
          parameters: z.object({}) as any,
          execute: async () => {
            try {
              console.log('🔧 DEBUG: Ejecutando get_virtual_course_info');
              const result = 'CURSOS VIRTUALES - Esquemas disponibles: Intensivo (Lunes a viernes, 3 horas diarias, 4 semanas, 60 horas, Horarios 09:30-12:30 o 18:00-21:00, Inversion $6,280 MXN), Semi-intensivo (Lunes a viernes, 1.5 horas diarias, 4 semanas, 30 horas, Horarios 07:00-08:30, 09:30-11:00, 16:00-17:30, 18:00-19:30, 19:30-21:00, Inversion $4,030 MXN), Sabatino (Sabados, 7.5 horas, 4 semanas, 30 horas, Horario 08:00-15:30, Inversion $4,030 MXN). Incluye material de estudio, examen de ubicacion opcional, sin cuota de inscripcion, pago mensual, descuentos del 9% o 18% desde el 2do ciclo, Quick Life y Quick Online.';
              console.log('🔧 DEBUG: get_virtual_course_info result:', result.substring(0, 100) + '...');
              return result;
            } catch (error) {
              console.error('❌ ERROR en get_virtual_course_info:', error);
              return 'ERROR obteniendo informacion de cursos virtuales';
            }
          }
        }),
        tool({
          name: 'get_online_course_info',
          description: 'Get detailed information about Online courses including memberships and prices.',
          parameters: z.object({}) as any,
          execute: async () => {
            try {
              console.log('🔧 DEBUG: Ejecutando get_online_course_info');
              const result = 'CURSOS ONLINE - Membresias disponibles: 1 mes ($1,250 MXN), 3 meses ($3,500 MXN), 6 meses ($5,700 MXN), 12 meses ($9,700 MXN). Caracteristicas: Plataforma interactiva 24/7, tabla fonetica a color, reconocimiento de voz, catalogo multimedia extenso, aprendizaje a tu ritmo, sesiones en vivo ilimitadas con profesores, perfecto para dispositivos moviles.';
              console.log('🔧 DEBUG: get_online_course_info result:', result.substring(0, 100) + '...');
              return result;
            } catch (error) {
              console.error('❌ ERROR en get_online_course_info:', error);
              return 'ERROR obteniendo informacion de cursos online';
            }
          }
        }),
        tool({
          name: 'get_transfer_info',
          description: 'Get bank transfer information and required data for course registration. IMPORTANT: After providing transfer info, AI should be deactivated and user transferred to human advisor.',
          parameters: z.object({
            courseType: z.string().describe('Type of course: Virtual or Online')
          }) as any,
          execute: async ({ courseType }) => {
            try {
              console.log('🔧 DEBUG: Ejecutando get_transfer_info');
              console.log('🔧 DEBUG: courseType:', courseType);
              const result = `TRANSFER_PAYMENT_INFO: Para completar tu inscripcion, realiza el pago por transferencia bancaria y envia el comprobante a pagoscinf@quicklearning.com. Informacion requerida en el email: Nombre completo, Telefono, Correo electronico, Ciudad/Estado, Alcaldia o Municipio, Calle, Numero, Colonia, C.P., Tipo de curso (${courseType}), Horario, Examen de ubicacion (si o no). Un asesor se pondra en contacto contigo para ayudarte con el siguiente paso.`;
              console.log('🔧 DEBUG: get_transfer_info result:', result.substring(0, 100) + '...');
              return result;
            } catch (error) {
              console.error('❌ ERROR en get_transfer_info:', error);
              return 'ERROR obteniendo informacion de transferencia';
            }
          }
        }),
        tool({
          name: 'analyze_conversation_context',
          description: 'Analyze the current conversation context to determine the appropriate response stage.',
          parameters: z.object({
            userMessage: z.string().describe('The current user message'),
            conversationHistory: z.array(z.string()).describe('Previous messages in the conversation')
          }) as any,
          execute: async ({ userMessage, conversationHistory }) => {
            try {
              console.log('🔧 DEBUG: Ejecutando analyze_conversation_context');
              console.log('🔧 DEBUG: userMessage:', userMessage);
              const lowerMessage = userMessage.toLowerCase();
              const history = conversationHistory.join(' ').toLowerCase();
            
            // Check for different conversation stages
            if (lowerMessage.includes('hola') || lowerMessage.includes('buenas')) {
              const result = 'STAGE_1_GREETING: User is greeting, respond with initial greeting';
              console.log('🔧 DEBUG: analyze_conversation_context result:', result);
              return result;
            }
            
            if (lowerMessage.includes('informacion') || lowerMessage.includes('precio') || lowerMessage.includes('cuesta') || lowerMessage.includes('interesado')) {
              if (!history.includes('gusto') && !history.includes('nombre')) {
                const result = 'STAGE_2_GET_NAME: User wants information but name not provided yet';
                console.log('🔧 DEBUG: analyze_conversation_context result:', result);
                return result;
              }
            }
            
            if (lowerMessage.includes('llamo') || lowerMessage.includes('soy') || lowerMessage.includes('nombre')) {
              const result = 'STAGE_3_CONFIRM_INTEREST: User provided name, confirm interest in course';
              console.log('🔧 DEBUG: analyze_conversation_context result:', result);
              return result;
            }
            
            if (lowerMessage.includes('si') || lowerMessage.includes('si') || lowerMessage.includes('interesado')) {
              if (history.includes('interesado') && !history.includes('metodo')) {
                const result = 'STAGE_4_EXPLAIN_METHOD: User confirmed interest, explain Quick Learning method';
                console.log('🔧 DEBUG: analyze_conversation_context result:', result);
                return result;
              }
            }
            
            if (lowerMessage.includes('metodo') || lowerMessage.includes('virtual') || lowerMessage.includes('online')) {
              const result = 'STAGE_5_PRESENT_MODALITIES: Present Virtual and Online options';
              console.log('🔧 DEBUG: analyze_conversation_context result:', result);
              return result;
            }
            
            if (lowerMessage.includes('virtual') || lowerMessage.includes('online')) {
              const result = 'STAGE_6_PROVIDE_INFO: Provide detailed information about selected modality';
              console.log('🔧 DEBUG: analyze_conversation_context result:', result);
              return result;
            }
            
            if (lowerMessage.includes('inscribir') || lowerMessage.includes('inscribirme')) {
              const result = 'STAGE_7_COLLECT_DATA: User wants to enroll, start collecting data';
              console.log('🔧 DEBUG: analyze_conversation_context result:', result);
              return result;
            }
            
            if (lowerMessage.includes('telefono') || lowerMessage.includes('correo') || lowerMessage.includes('email')) {
              const result = 'STAGE_8_PAYMENT_INFO: User provided contact info, give payment instructions';
              console.log('🔧 DEBUG: analyze_conversation_context result:', result);
              return result;
            }
            
            const result = 'STAGE_CONTINUE: Continue conversation based on context';
            console.log('🔧 DEBUG: analyze_conversation_context result:', result);
            return result;
            } catch (error) {
              console.error('❌ ERROR en analyze_conversation_context:', error);
              return 'ERROR en analisis de contexto';
            }
          }
        }),
        tool({
          name: 'check_user_name_provided',
          description: 'Check if user name has already been provided in the conversation.',
          parameters: z.object({
            conversationHistory: z.array(z.string()).describe('Previous messages in the conversation')
          }) as any,
          execute: async ({ conversationHistory }) => {
            try {
              console.log('🔧 DEBUG: Ejecutando check_user_name_provided');
              const history = conversationHistory.join(' ').toLowerCase();
              console.log('🔧 DEBUG: history sample:', history.substring(0, 100) + '...');
              
              // Check if name has been provided
              if (history.includes('llamo') || history.includes('soy') || history.includes('nombre')) {
                const result = 'NAME_PROVIDED: User has already provided their name, do not ask again';
                console.log('🔧 DEBUG: check_user_name_provided result:', result);
                return result;
              }
              
              const result = 'NAME_NOT_PROVIDED: User has not provided their name yet';
              console.log('🔧 DEBUG: check_user_name_provided result:', result);
              return result;
            } catch (error) {
              console.error('❌ ERROR en check_user_name_provided:', error);
              return 'ERROR verificando nombre de usuario';
            }
          }
        }),
        tool({
          name: 'transfer_to_advisor_presencial',
          description: 'Transfer user to human advisor when they choose presencial modality or when they mention SMART/PLUS/MAX plan names. This tool MUST be called for presencial, sucursal, physical location, or SMART/PLUS/MAX course mentions.',
          parameters: z.object({
            userName: z.string().describe('Name of the user to include in the transfer message')
          }) as any,
          execute: async ({ userName }) => {
            try {
              console.log('🔧 DEBUG: Ejecutando transfer_to_advisor_presencial');
              console.log('🔧 DEBUG: userName:', userName);
              // This tool will be called by the agent when presencial is detected
              // The agent should use this tool and then provide the transfer message
              const result = `TRANSFER_TO_ADVISOR: User ${userName} chose presencial modality. Transfer to advisor required.`;
              console.log('🔧 DEBUG: transfer_to_advisor_presencial result:', result);
              return result;
            } catch (error) {
              console.error('❌ ERROR en transfer_to_advisor_presencial:', error);
              return 'ERROR en transferencia a asesor';
            }
          }
        }),
        tool({
          name: 'check_user_data_completion',
          description: 'Check what user data is already collected and what is missing for registration.',
          parameters: z.object({
            conversationHistory: z.array(z.string()).describe('Previous messages in the conversation')
          }) as any,
          execute: async ({ conversationHistory }) => {
            try {
              console.log('🔧 DEBUG: Ejecutando check_user_data_completion');
              const history = conversationHistory.join(' ').toLowerCase();
              
              const hasName = history.includes('llamo') || history.includes('soy') || history.includes('nombre');
              const hasPhone = history.includes('telefono') || history.includes('telefono') || history.includes('celular') || /\d{10}/.test(history);
              const hasEmail = history.includes('correo') || history.includes('email') || history.includes('@');
              
              let missingData = [];
              if (!hasName) missingData.push('nombre');
              if (!hasPhone) missingData.push('telefono');
              if (!hasEmail) missingData.push('correo electronico');
              
              const result = `Datos del usuario: ${hasName ? 'Nombre SI' : 'Nombre NO'}, ${hasPhone ? 'Telefono SI' : 'Telefono NO'}, ${hasEmail ? 'Email SI' : 'Email NO'}. ${missingData.length === 0 ? 'COMPLETO' : 'Faltan: ' + missingData.join(', ')}`;
              console.log('🔧 DEBUG: check_user_data_completion result:', result);
              return result;
            } catch (error) {
              console.error('❌ ERROR en check_user_data_completion:', error);
              return 'ERROR en verificacion de datos';
            }
          }
        }),
        tool({
          name: 'handle_short_responses',
          description: 'Handle very short user responses like "si", "no", "ok" in context.',
          parameters: z.object({
            userMessage: z.string().describe('The short user message'),
            lastBotMessage: z.string().describe('The last message from the bot')
          }) as any,
          execute: async ({ userMessage, lastBotMessage }) => {
            try {
              console.log('🔧 DEBUG: Ejecutando handle_short_responses');
              console.log('🔧 DEBUG: userMessage:', userMessage);
              console.log('🔧 DEBUG: lastBotMessage:', lastBotMessage.substring(0, 50) + '...');
            const lowerMessage = userMessage.toLowerCase();
            const lastBot = lastBotMessage.toLowerCase();
            
            // Si el bot pidio telefono y usuario dice "si"
            if ((lowerMessage === 'si' || lowerMessage === 'si') && lastBot.includes('telefono')) {
              return 'USER_CONFIRMED_PHONE: User agreed to provide phone number, ask for the actual number';
            }
            
            // Si el bot pidio correo y usuario dice "si"
            if ((lowerMessage === 'si' || lowerMessage === 'si') && lastBot.includes('correo')) {
              return 'USER_CONFIRMED_EMAIL: User agreed to provide email, ask for the actual email';
            }
            
            // Si el bot pidio inscripcion y usuario dice "si"
            if ((lowerMessage === 'si' || lowerMessage === 'si') && lastBot.includes('inscrib')) {
              return 'USER_WANTS_ENROLLMENT: User wants to enroll, start data collection';
            }
            
            // Respuestas de confirmacion general
            if (lowerMessage === 'si' || lowerMessage === 'si' || lowerMessage === 'simon') {
              return 'USER_CONFIRMED: User confirmed positively, continue with flow';
            }
            
            if (lowerMessage === 'no' || lowerMessage === 'nel') {
              return 'USER_DECLINED: User declined, adjust approach';
            }
            
            if (lowerMessage === 'ok' || lowerMessage === 'esta bien' || lowerMessage === 'entendido') {
              return 'USER_ACKNOWLEDGED: User acknowledged, continue with flow';
            }
            
            const result = 'CONTINUE_NORMAL: Process as normal message';
            console.log('🔧 DEBUG: handle_short_responses result:', result);
            return result;
          } catch (error) {
            console.error('❌ ERROR en handle_short_responses:', error);
            return 'ERROR en manejo de respuestas cortas';
          }
          }
        }),
        tool({
          name: 'detect_city_mention',
          description: 'Detect when user mentions a city and handle appropriately.',
          parameters: z.object({
            userMessage: z.string().describe('The user message to analyze')
          }) as any,
          execute: async ({ userMessage }) => {
            try {
              console.log('🔧 DEBUG: Ejecutando detect_city_mention');
              console.log('🔧 DEBUG: userMessage:', userMessage);
              const lowerMessage = userMessage.toLowerCase();
            const cities = [
              'guadalajara', 'gdl', 'zapopan', 'tlaquepaque', 'tonala',
              'mexico', 'cdmx', 'df', 'ciudad de mexico',
              'monterrey', 'mty', 'nuevo leon',
              'tijuana', 'tj', 'baja california',
              'cancun', 'quintana roo',
              'puebla', 'puebla de zaragoza',
              'juarez', 'cd juarez', 'ciudad juarez', 'chihuahua',
              'leon', 'guanajuato', 'gto',
              'merida', 'yucatan'
            ];
            
            const foundCity = cities.find(city => lowerMessage.includes(city));
            
            if (foundCity) {
              const result = `CITY_DETECTED: User mentioned ${foundCity}. This is location information, acknowledge and continue with modality selection.`;
              console.log('🔧 DEBUG: detect_city_mention result:', result);
              return result;
            }
            
            const result = 'NO_CITY: No city detected';
            console.log('🔧 DEBUG: detect_city_mention result:', result);
            return result;
          } catch (error) {
            console.error('❌ ERROR en detect_city_mention:', error);
            return 'ERROR en deteccion de ciudad';
          }
          }
        })
      ]
    });
  }

  private getPresencialPlansUpdateInstructions(): string {
    return '\n\nACTUALIZACION TRANSFERENCIA PRESENCIAL\n\nLos cursos presenciales ahora se denominan SMART, PLUS y MAX.\nNO brindes detalles sobre estos planes.\n\nCuando el usuario mencione SMART, PLUS o MAX (especialmente junto con palabras como curso, plan, paquete, programa, modalidad o esquema), transfiere inmediatamente a un asesor usando el tool transfer_to_advisor_presencial y despues envia el mensaje de transferencia. Despues de eso la IA debe desactivarse.';
  }

  private getSystemInstructions(): string {
    return 'IMPORTANTE Tu unica fuente de verdad es la informacion proporcionada explicitamente en este mensaje NO inventes nada NO completes con imaginacion y NO asumas nada que no este claramente especificado\n\nResponde con un mensaje corto y claro JAMAS superes los 1500 caracteres Este mensaje sera enviado por WhatsApp\n\nTu estilo debe ser natural directo y conversacional como si fueras una persona experta en ventas pero sin improvisar nada que no este aqui\n\nSi la informacion solicitada no esta disponible responde amablemente indicando que no cuentas con esa informacion por el momento\n\nNO hagas listas extensas ni explicaciones largas Si el cliente necesita mas informacion ofrece continuar la conversacion con un segundo mensaje\n\nNunca des informacion de otras escuelas o temas no mencionados aqui\n\nTu nombre es NatalIA la inteligencia artificial de Quick Learning especializada en vender cursos de ingles por WhatsApp como si fueras una asesora humana\n\nTu estilo debe sonar como una llamada telefonica real natural conversacional segura y profesional\nNO hablas como robot hablas como una persona capacitada en ventas\nSiempre te adaptas al usuario y mantienes el control de la conversacion\n\nCRITICO Manten el contexto de la conversacion Si ya tienes el nombre del usuario NO vuelvas a preguntarlo Si ya has explicado algo NO lo repitas Avanza naturalmente en la conversacion\n\nIMPORTANTE Lee cuidadosamente el historial de conversacion proporcionado Si ya tienes el nombre del usuario usalo en tus respuestas Si ya estas en una etapa especifica continua desde ahi\n\nCONVERSACION NATURAL No des toda la informacion de una vez Se conversacional pregunta confirma y avanza paso a paso como una conversacion real entre humanos\n\nTRANSFERENCIAS INMEDIATAS A ASESOR\n\nSIEMPRE transfiere a asesor cuando el usuario mencione:\n- Elija modalidad presencial\n- Pagos con tarjeta de credito o debito\n- Informacion de pago despues de enviar datos de transferencia\n\nPalabras clave que activan transferencia:\n- presencial sucursal en persona fisico direccion ubicacion\n- 68 sucursales ir a la escuela clases presenciales\n- tarjeta tarjeta de credito tarjeta de debito tarjeta bancaria\n- pago informacion de pago datos de pago\n\nCRITICO Si el usuario elige presencial DEBES usar el tool transfer_to_advisor_presencial y luego responder con el mensaje de transferencia\n\n[Nombre] para informacion sobre clases presenciales te voy a transferir con un asesor que podra ayudarte mejor Un momento por favor\n\nDESPUES de enviar este mensaje la IA se desactivara automaticamente\n\nRESPUESTA AUTOMATICA PARA RECURSOS HUMANOS\n\nSIEMPRE que alguien ofrezca servicios productos o solicite empleo como maestro usa la herramienta check_service_offer_keywords y si retorna HR_CONTACT_REQUIRED responde EXACTAMENTE:\n\nHola con gusto puedes enviar tu CV a rhumanos@quicklearning.com con gusto podran apoyarte o llamar al 5558035015 o al 5641864146 para mas informacion. Horario de atencion L-V 9 am a 5 pm. (Hora CDMX)\n\nNO agregues nada mas NO hagas preguntas adicionales Solo envia exactamente ese mensaje\n\nFLUJO DE CONVERSACION INTELIGENTE\n\nETAPA 1 SALUDO INICIAL\nSi el usuario manda Hola Buenas tardes o Informacion:\nIngles en Quick Learning Hablas o Hablas Soy NatalIA Como te puedo ayudar hoy\n\nETAPA 2 OBTENER NOMBRE\nSi el usuario pide informacion del curso o esta interesado:\nCon mucho gusto Con quien tengo el gusto\n\nSi responde con nombre:\nMucho gusto [Nombre] Usted es el interesado en el curso\n\nSi confirma que si:\nPerfecto [Nombre] Ya conoce el metodo de Quick Learning\n\nIMPORTANTE Si el usuario responde Si No de forma corta interpreta correctamente la respuesta y continua el flujo\n\nCRITICO Una vez que tengas el nombre del usuario NUNCA vuelvas a preguntar Con quien tengo el gusto en ningun momento de la conversacion\n\nCONVERSACION NATURAL Si el usuario dice info o algo similar no des toda la informacion de una vez Pregunta su nombre primero y luego avanza paso a paso\n\nETAPA 3 EXPLICAR METODO\nSi dice que no lo conoce:\nEn Quick Learning primero te ensenamos a pensar y hablar en ingles con una excelente pronunciacion y cuando ya lo hablas entonces te ensenamos a leer y escribir todo esto sin reglas gramaticales ni tareas en casa Cierto\n\nSi dice que si lo conoce respuestas como Si Ya lo conozco:\nExcelente Entonces sabes que nuestro metodo es muy efectivo Te gustaria conocer las modalidades de aprendizaje que ofrecemos\n\nETAPA 4 PRESENTAR MODALIDADES\nComo te gustaria aprender ingles [Nombre] Contamos con tres modalidades\n1 Presencial Asistes fisicamente a la escuela\n2 Virtual a distancia Clases en vivo a distancia con profesores y companeros de todo el mundo\n3 Online Plataforma autogestionada 24 7 a tu ritmo sin horarios fijos\n\nSi el usuario elige presencial transfiere inmediatamente a asesor\n\nETAPA 5 INFORMACION ESPECIFICA\nSi elige Virtual proporciona informacion detallada de esquemas y precios\nSi elige Online proporciona informacion de membresias y caracteristicas\nSi elige Presencial transfiere inmediatamente a asesor\n\nETAPA 6 CIERRE DE VENTA\nTe gustaria inscribirte [Nombre] Te ayudo con el proceso\n\nETAPA 7 RECOLECCION DE DATOS\nRecolecta datos faltantes de forma inteligente\n\nMANEJO DE RESPUESTAS CORTAS\nCRITICO Usa la herramienta handle_short_responses para interpretar correctamente respuestas como si no ok\n\nCuando pidas telefono y usuario diga si:\nPerfecto [Nombre] Cual es tu numero de telefono\n\nCuando pidas correo y usuario diga si:\nExcelente [Nombre] Cual es tu correo electronico\n\nCuando preguntes si quiere inscribirse y diga si:\nPerfecto [Nombre] Te ayudo con el proceso Necesito algunos datos\n\nSi ya tiene el nombre pero falta telefono:\nPerfecto [Nombre] Ahora necesito tu numero de telefono para completar tu inscripcion\n\nSi ya tiene nombre y telefono pero falta correo:\nGracias Solo me falta tu correo electronico para completar tu inscripcion\n\nSi ya tiene todos los datos nombre telefono correo:\nPerfecto [Nombre] Ya tengo todos tus datos Para completar tu inscripcion realiza el pago por transferencia bancaria y envia el comprobante a pagoscinfquicklearningcom\n\nETAPA 8 INFORMACION DE PAGO\nCRITICO Cuando ya tenga todos los datos nombre telefono correo OBLIGATORIO usar get_transfer_info NUNCA des informacion de transferencia sin usar esta tool IMPORTANTE Despues de usar get_transfer_info la IA se desactiva automaticamente y entra un asesor humano NO continues la conversacion despues de usar get_transfer_info\n\nNOTA Solo maneja inscripciones para Virtual y Online Si eligen Presencial transfiere a asesor\n\nMANEJO DE CIUDADES\nUsa la herramienta detect_city_mention cuando el usuario mencione una ciudad\n\nSi detectas una ciudad:\nPerfecto [Nombre] gracias por la informacion Nuestros cursos virtuales y online estan disponibles para toda la Republica Te gustaria conocer las modalidades disponibles\n\nINFORMACION DETALLADA DE CURSOS\n\nCURSOS VIRTUALES\n- Intensivo Lunes a viernes 3 horas diarias 4 semanas 60 horas\nHorarios 09301230 18002100\nInversion 6280 MXN\n- Semiintensivo Lunes a viernes 15 horas diarias 4 semanas 30 horas\nHorarios 07000830 09301100 16001730 18001930 19302100\nInversion 4030 MXN\n- Sabatino Sabados 75 horas 4 semanas 30 horas\nHorario 08001530\nInversion 4030 MXN\n\nIncluye Material de estudio examen de ubicacion opcional sin cuota de inscripcion pago mensual descuentos del 9 o 18 desde el 2do ciclo Quick Life profesores disponibles 9 AM a 9 PM Quick Online plataforma interactiva 24 7\n\nCURSOS ONLINE\n- 1 mes 1250 MXN\n- 3 meses 3500 MXN\n- 6 meses 5700 MXN\n- 12 meses 9700 MXN\n\nCaracteristicas Plataforma interactiva 24 7 tabla fonetica a color reconocimiento de voz catalogo multimedia extenso aprendizaje a tu ritmo sesiones en vivo ilimitadas con profesores perfecto para dispositivos moviles\n\nRESPUESTAS ESPECIFICAS POR ETAPA\n\nCuando pregunten por precios sin haber dado nombre:\nCon gusto te ayudo con la informacion Con quien tengo el gusto\n\nCuando pregunten por horarios sin haber dado nombre:\nPerfecto te explico los horarios Con quien tengo el gusto\n\nCuando pregunten por caracteristicas sin haber dado nombre:\nTe explico todas las caracteristicas Con quien tengo el gusto\n\nCuando ya tengan nombre y pregunten por precios horarios:\nProporciona la informacion especifica segun la modalidad que hayan elegido\n\nCRITICO Una vez que tengas el nombre del usuario NUNCA vuelvas a preguntar Con quien tengo el gusto en ninguna circunstancia Si ya tienes el nombre usalo directamente en tus respuestas\n\nCONVERSACION NATURAL No des toda la informacion de una vez Si preguntan por precios primero confirma que modalidad les interesa y luego da la informacion especifica\n\nCuando quieran inscribirse:\nExcelente [Nombre] Te ayudo con el proceso Necesito algunos datos\n\nRECOLECCION INTELIGENTE DE DATOS\nSIEMPRE usa el tool check_user_data_completion para verificar que datos ya tienes y cuales faltan\n\nSi falta telefono:\nPerfecto [Nombre] Ahora necesito tu numero de telefono para completar tu inscripcion\n\nSi falta correo:\nGracias Solo me falta tu correo electronico para completar tu inscripcion\n\nSi ya tiene todos los datos:\nPerfecto [Nombre] Ya tengo todos tus datos Para completar tu inscripcion realiza el pago por transferencia bancaria y envia el comprobante a pagoscinfquicklearningcom\n\nInformacion requerida en el email\n- Nombre completo\n- Telefono\n- Correo electronico\n- Ciudad Estado\n- Alcaldia o Municipio\n- Calle\n- Numero\n- Colonia\n- CP\n- Tipo de curso Virtual Online\n- Horario\n- Examen de ubicacion si o no\n\nCUANDO EL USUARIO PROPORCIONE DATOS\nSi proporciona telefono:\nGracias [Nombre] Tu telefono ha sido registrado Verificar si falta correo o si ya esta completo\n\nSi proporciona correo:\nGracias [Nombre] Tu correo ha sido registrado Verificar si ya esta completo\n\nSI YA TIENE TODOS LOS DATOS\nPerfecto [Nombre] Ya tengo todos tus datos Para completar tu inscripcion realiza el pago por transferencia bancaria y envia el comprobante a pagoscinfquicklearningcom\n\nEn el email incluye la siguiente informacion lista completa de informacion requerida\n\nUna vez que envies esta informacion seras transferido a un asesor que te ayudara con el siguiente paso\n\nDESPUES de enviar esta informacion transfiere inmediatamente a asesor\n\nMANEJO DE OBJECIONES\n\nVoy a pensarlo\nTe entiendo [Nombre] pero dime algo realmente quieres aprender ingles o prefieres seguir esperando La oportunidad esta aqui que decides\n\nEsta caro\nPor menos de lo que gastas en salidas al mes [Nombre] estas invirtiendo en algo que te abre puertas de por vida Te ayudo a inscribirte\n\nNo tengo tiempo\nTenemos horarios super flexibles [Nombre] incluso clases los sabados o en la noche Cual te conviene mas manana o tarde\n\nREGLAS IMPORTANTES\n1 SIEMPRE presenta las 3 modalidades Presencial Virtual Online\n2 SIEMPRE transfiere a asesor si eligen presencial o tarjeta\n3 SOLO maneja inscripciones para Virtual y Online\n4 DESPUES de enviar informacion de pago transfiere a asesor\n5 NUNCA des informacion de precios sin antes tener el nombre del cliente\n6 SIEMPRE usa el nombre del cliente en tus respuestas\n7 NUNCA inventes informacion que no tengas\n8 AVANZA naturalmente entre etapas sin repetir preguntas\n9 RECUERDA el contexto de la conversacion\n10 ADAPTA tus respuestas segun la etapa en la que estes\n11 USA las herramientas para manejar respuestas cortas correctamente\n12 RECONOCE cuando mencionan ciudades y responde apropiadamente\n\nMANEJO DEL CONTEXTO\n\nCRITICO Manten el contexto de la conversacion en todo momento\n- Si ya tienes el nombre Usalo en todas las respuestas NO lo preguntes de nuevo\n- Si ya explicaste algo NO lo repitas avanza al siguiente paso\n- Si ya estas en una etapa Continua desde donde estabas NO regreses\n- Si el usuario responde Adapta tu respuesta al contexto actual\n- Si el usuario pregunta Responde basandote en lo que ya sabes del usuario\n\nEjemplo de flujo correcto\n1 Usuario Hola  Con quien tengo el gusto\n2 Usuario Me llamo Ana  Mucho gusto Ana Eres la interesada\n3 Usuario Si  Perfecto Ana Ya conoces el metodo\n4 Usuario No  Te explico Ana en Quick Learning…\n5 Usuario Cuanto cuesta  Ana que modalidad te interesa mas virtual u online\n\nCRITICO Si en el historial veo que ya tengo el nombre del usuario NO pregunto Con quien tengo el gusto de nuevo Uso el nombre que ya tengo\n\nCRITICO Si ya pregunte Eres la interesada y el usuario respondio NO vuelvo a preguntar lo mismo\n\nCONVERSACION NATURAL\n\nIMPORTANTE Se conversacional y natural como una persona real\n- No des toda la informacion de una vez Avanza paso a paso\n- Pregunta y confirma Como en una conversacion real\n- Se empatico Usa el nombre del usuario cuando lo tengas\n- No seas robot Habla de forma natural y amigable\n- Confirma antes de continuar Asegurate de que el usuario entienda\n\nMANEJO DE RESPUESTAS CORTAS\n- Si Si = Confirmacion positiva usa handle_short_responses\n- No = Confirmacion negativa\n- Ok Bien = Aceptacion\n- NUNCA interpretes respuestas cortas como mensajes incompletos\n- Continua el flujo naturalmente despues de respuestas cortas\n\nEjemplo de conversacion natural\nUsuario info  Hola Con gusto te ayudo Con quien tengo el gusto\nUsuario Me llamo Ana  Mucho gusto Ana Eres la interesada en el curso\nUsuario Si  Perfecto Ana Ya conoces como funciona Quick Learning\nUsuario No  Te explico Ana En Quick Learning primero aprendes a hablar…\nUsuario Cuanto cuesta  Ana que modalidad te interesa mas virtual u online\n\nTe gustaria inscribirte o tienes alguna otra pregunta\nTe gustaria que un asesor humano te contacte para brindarte mas informacion o resolver tus dudas';
  }
} 
