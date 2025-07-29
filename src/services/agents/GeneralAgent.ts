import { BaseAgent } from './BaseAgent';
import { tool } from '@openai/agents';
import { z } from 'zod';
import { getConnectionByCompanySlug } from '../../config/connectionManager';
import getIaConfigModel from '../../models/iaConfig.model';
import getToolModel from '../../models/tool.model';
import { ToolExecutor } from '../toolExecutor';
import { ITool } from '../../types/tool.types';
import getRecordModel from '../../models/record.model';

export class GeneralAgent extends BaseAgent {
  private customPrompt: string | null = null;
  private companyTools: ITool[] = [];

  constructor(company: string) {
    console.log(`🔧 GeneralAgent: Constructor called for ${company}`);
    super(company);
    console.log(`🔧 GeneralAgent: Constructor completed for ${company}`);
  }

  protected async initializeAgent() {
    console.log(`🔧 Initializing GeneralAgent for ${this.company}`);
    try {
      // Cargar prompt personalizado desde la base de datos
      await this.loadCustomPrompt();
      
      // Cargar tools dinámicas desde la base de datos
      await this.loadCompanyTools();
      
      const { Agent } = require('@openai/agents');
      console.log(`🔧 Agent class imported successfully`);
      
      // Construir las tools dinámicamente
      const dynamicTools = this.buildDynamicTools();
      
      this.agent = new Agent({
        name: 'GeneralAgent',
        instructions: this.getSystemInstructions(),
        tools: dynamicTools
      });
      console.log(`✅ GeneralAgent initialized for ${this.company} with ${dynamicTools.length} tools`);
    } catch (error) {
      console.error(`❌ Error initializing GeneralAgent for ${this.company}:`, error);
      throw error;
    }
  }

  private async loadCustomPrompt(): Promise<void> {
    try {
      console.log(`🔧 Loading custom prompt for ${this.company}`);
      const conn = await getConnectionByCompanySlug(this.company);
      const IaConfig = getIaConfigModel(conn);
      
      // Buscar configuración general de la empresa
      const config = await IaConfig.findOne({ type: 'general' });
      
      // Debug específico para empresas inmobiliarias
      if (this.company === 'grupo-milkasa') {
        console.log(`🔍 MILKASA DEBUG - Config encontrado:`, config ? 'SÍ' : 'NO');
        if (config) {
          console.log(`🔍 MILKASA DEBUG - CustomPrompt length:`, config.customPrompt?.length || 0);
          console.log(`🔍 MILKASA DEBUG - Config name:`, config.name);
          console.log(`🔍 MILKASA DEBUG - Config type:`, config.type);
        }
      }
      
      if (this.company === 'grupokg' || this.company === 'grupo-kg') {
        console.log(`🔍 GRUPO-KG DEBUG - Config encontrado:`, config ? 'SÍ' : 'NO');
        if (config) {
          console.log(`🔍 GRUPO-KG DEBUG - CustomPrompt length:`, config.customPrompt?.length || 0);
          console.log(`🔍 GRUPO-KG DEBUG - Config name:`, config.name);
          console.log(`🔍 GRUPO-KG DEBUG - Config type:`, config.type);
        }
      }
      
      if (config && config.customPrompt) {
        this.customPrompt = config.customPrompt;
        console.log(`✅ Custom prompt loaded for ${this.company}`);
        
        // Debug específico para empresas inmobiliarias
        if (this.company === 'grupo-milkasa') {
          console.log(`🔍 MILKASA DEBUG - CustomPrompt cargado exitosamente`);
        }
        if (this.company === 'grupokg' || this.company === 'grupo-kg') {
          console.log(`🔍 GRUPO-KG DEBUG - CustomPrompt cargado exitosamente`);
        }
      } else {
        console.log(`⚠️ No custom prompt found for ${this.company}, using fallback`);
        this.customPrompt = null;
      }
    } catch (error) {
      console.error(`❌ Error loading custom prompt for ${this.company}:`, error);
      this.customPrompt = null;
    }
  }

  private async loadCompanyTools(): Promise<void> {
    try {
      console.log(`🔧 Loading tools for ${this.company}`);
      const conn = await getConnectionByCompanySlug(this.company);
      const Tool = getToolModel(conn);
      
      // Buscar todas las tools activas para la empresa
      const tools = await Tool.find({ 
        c_name: this.company, 
        isActive: true 
      }).lean();
      
      // Convertir a ITool[]
      this.companyTools = tools as unknown as ITool[];
      
      console.log(`✅ Loaded ${this.companyTools.length} tools for ${this.company}`);
      this.companyTools.forEach(tool => {
        console.log(`  - ${tool.name}: ${tool.description}`);
      });
    } catch (error) {
      console.error(`❌ Error loading tools for ${this.company}:`, error);
      this.companyTools = [];
    }
  }

  private buildDynamicTools(): any[] {
    const dynamicTools = [];
    
    // Agregar las tools cargadas desde la base de datos
    for (const companyTool of this.companyTools) {
      try {
        // Logging detallado para depuración
        console.log(`🔨 Building tool ${companyTool.name} for ${this.company}`);
        
        // Construir el schema de parámetros dinámicamente
        const parameterSchema: any = {};
        const requiredParams: string[] = [];
        
        if (companyTool.parameters && companyTool.parameters.properties) {
          for (const [key, prop] of Object.entries(companyTool.parameters.properties)) {
            const propDef = prop as any;
            
            // Mapear tipo de parámetro a schema de Zod
            switch (propDef.type) {
              case 'string':
                parameterSchema[key] = z.string().describe(propDef.description || key);
                break;
              case 'number':
                parameterSchema[key] = z.number().describe(propDef.description || key);
                break;
              case 'boolean':
                parameterSchema[key] = z.boolean().describe(propDef.description || key);
                break;
              case 'array':
                parameterSchema[key] = z.array(z.string()).describe(propDef.description || key);
                break;
              default:
                parameterSchema[key] = z.string().describe(propDef.description || key);
            }
            
            // Si el parámetro es requerido, hacerlo opcional en el schema
            // (la validación de requeridos se maneja en la ejecución)
            if (propDef.required && companyTool.parameters.required?.includes(key)) {
              requiredParams.push(key);
            }
          }
        }
        
        // Crear la tool dinámica
        const dynamicTool = tool({
          name: companyTool.name,
          description: companyTool.description,
          parameters: z.object(parameterSchema) as any,
          execute: async (params: any) => {
            console.log(`🔧 Executing tool ${companyTool.name} with params:`, params);
            
            try {
              // Para obtener_propiedades, manejar el mapeo de campos
              if (companyTool.name === 'obtener_propiedades') {
                // Mapear el parámetro al nombre correcto del campo en la DB
                const mappedParams = { ...params };
                if (params.Renta_Venta_Inversion) {
                  mappedParams['renta_venta_inversión '] = params.Renta_Venta_Inversion;
                  delete mappedParams.Renta_Venta_Inversion;
                }
                
                console.log(`🔧 Mapped params for ${companyTool.name}:`, mappedParams);
                
                // Ejecutar la búsqueda directamente aquí
                const conn = await getConnectionByCompanySlug(this.company);
                const Record = getRecordModel(conn);
                
                // Construir query de búsqueda
                const query: any = {
                  tableSlug: 'propiedades',
                  c_name: this.company
                };
                
                // Función para crear regex que funcione con y sin acentos
                const createFlexibleRegex = (text: string): RegExp => {
                  const normalized = text
                    .toLowerCase()
                    .replace(/á/g, '[áa]')
                    .replace(/é/g, '[ée]')
                    .replace(/í/g, '[íi]')
                    .replace(/ó/g, '[óo]')
                    .replace(/ú/g, '[úu]')
                    .replace(/ñ/g, '[ñn]')
                    .replace(/a/g, '[áa]')
                    .replace(/e/g, '[ée]')
                    .replace(/i/g, '[íi]')
                    .replace(/o/g, '[óo]')
                    .replace(/u/g, '[úu]')
                    .replace(/n/g, '[ñn]')
                    .replace(/\s+/g, '\\s*'); // Espacios flexibles
                  
                  return new RegExp(normalized, 'i');
                };

                // Agregar filtros basados en los parámetros (con búsqueda flexible)
                const orConditions: any[] = [];
                
                if (mappedParams['renta_venta_inversión ']) {
                  query['data.renta_venta_inversión '] = createFlexibleRegex(mappedParams['renta_venta_inversión ']);
                }
                
                // Para búsquedas de ubicación, usar $or para buscar en múltiples campos
                if (mappedParams.colonia) {
                  const flexibleRegex = createFlexibleRegex(mappedParams.colonia);
                  orConditions.push(
                    { 'data.colonia': flexibleRegex },
                    { 'data.domicilio': flexibleRegex },
                    { 'data.titulo': flexibleRegex },
                    { 'data.zona': flexibleRegex }
                  );
                }
                
                if (orConditions.length > 0) {
                  query['$or'] = orConditions;
                }
                if (mappedParams.titulo) {
                  const flexibleRegex = createFlexibleRegex(mappedParams.titulo);
                  if (!query['$or']) {
                    query['$or'] = [];
                  }
                  query['$or'].push(
                    { 'data.titulo': flexibleRegex },
                    { 'data.colonia': flexibleRegex },
                    { 'data.domicilio': flexibleRegex }
                  );
                }
                if (mappedParams.domicilio) {
                  const flexibleRegex = createFlexibleRegex(mappedParams.domicilio);
                  if (!query['$or']) {
                    query['$or'] = [];
                  }
                  query['$or'].push(
                    { 'data.domicilio': flexibleRegex },
                    { 'data.colonia': flexibleRegex },
                    { 'data.titulo': flexibleRegex }
                  );
                }
                
                console.log(`🔧 Query for ${companyTool.name}:`, query);
                
                // Buscar propiedades
                const records = await Record.find(query).limit(5).lean();
                
                console.log(`✅ Found ${records.length} properties`);
                
                if (records.length === 0) {
                  return {
                    success: true,
                    message: "No encontré propiedades con esos criterios. ¿Podrías darme más detalles o buscar en otra zona?",
                    properties: []
                  };
                }
                
                // Formatear las propiedades para el agente
                const properties = records.map((record: any) => ({
                  titulo: record.data.titulo || 'Sin título',
                  colonia: record.data.colonia || 'Sin especificar',
                  precio: record.data.precio || 'Consultar',
                  tipo: record.data['renta_venta_inversión '] || 'No especificado',
                  recamaras: record.data.recamaras || 'No especificado',
                  banos: record.data.banos || 'No especificado',
                  metros_construccion: record.data['metros_de_construccion '] || 'No especificado',
                  metros_terreno: record.data.mts_de_terreno || 'No especificado',
                  estacionamiento: record.data.estacionamiento || 'No especificado',
                  mascotas: record.data.mascotas || 'No especificado',
                  disponibilidad: record.data.disponibilidad || 'Disponible',
                  telefono_asesor: record.data.telefono_del_asesor || '33 1711 9650',
                  comision_compartida: record.data.comparte_comision || 'No',
                  comision_asesor_registrado: record.data.comision_para_asesor_registrado || '0%',
                  dias_especiales_cita: record.data.dias_especiales_para_cita || '',
                  descripcion: record.data.descripcion || '',
                  domicilio: record.data.domicilio || '',
                  entre_calles: record.data.entre_calles || '',
                  link_ficha: record.data.link_ficha_tecnica || ''
                }));
                
                return {
                  success: true,
                  properties,
                  message: `Encontré ${properties.length} propiedades que podrían interesarte.`
                };
              }
              
              // Para otras herramientas, usar el ToolExecutor
              const result = await ToolExecutor.execute({
                toolName: companyTool.name,
                parameters: params,
                c_name: this.company,
                executedBy: 'GeneralAgent'
              });
              
              console.log(`✅ Tool ${companyTool.name} executed successfully`);
              return result;
            } catch (error) {
              console.error(`❌ Error executing tool ${companyTool.name}:`, error);
              return {
                error: true,
                message: `Error al ejecutar ${companyTool.displayName}: ${error.message}`
              };
            }
          }
        });
        
        dynamicTools.push(dynamicTool);
        console.log(`✅ Added dynamic tool: ${companyTool.name}`);
      } catch (error) {
        console.error(`❌ Error building tool ${companyTool.name}:`, error);
      }
    }
    
    // Agregar tool básica de información de la empresa (siempre disponible)
    dynamicTools.push(
      tool({
        name: 'get_company_info',
        description: 'Obtener información básica de la empresa',
        parameters: z.object({
          query: z.string().describe('Qué información se está solicitando')
        }) as any,
        execute: async ({ query }) => {
          return {
            companyName: this.company,
            query: query,
            message: 'Por favor, proporcione más detalles sobre qué información específica necesita.'
          };
        }
      })
    );
    
    return dynamicTools;
  }

  private getSystemInstructions(): string {
    // Si hay un prompt personalizado, usarlo; si no, usar el fallback
    if (this.customPrompt) {
      console.log(`🔧 Using custom prompt for ${this.company}`);
      
      // Debug específico para grupo-milkasa
      if (this.company === 'grupo-milkasa') {
        console.log(`🔍 MILKASA DEBUG - Usando customPrompt de la BD`);
        console.log(`🔍 MILKASA DEBUG - CustomPrompt preview:`, this.customPrompt.substring(0, 100) + '...');
      }
      
      return this.customPrompt;
    }
    
    console.log(`🔧 Using fallback prompt for ${this.company}`);
    
    // Debug específico para grupo-milkasa
    if (this.company === 'grupo-milkasa') {
      console.log(`🔍 MILKASA DEBUG - Usando prompt fallback (PROBLEMA)`);
    }
    
    // Prompt específico para britanicomx
    if (this.company === 'britanicomx') {
      // Cargar el prompt desde el archivo
      const fs = require('fs');
      const path = require('path');
      try {
        const promptPath = path.join(__dirname, '../../../britanicomx-prompt.md');
        const promptContent = fs.readFileSync(promptPath, 'utf8');
        console.log(`🔧 Loaded britanicomx prompt from file`);
        return promptContent;
      } catch (error) {
        console.error(`❌ Error loading britanicomx prompt:`, error);
        return `Eres un asesor educativo del Colegio Británico de Guadalajara. Ayuda a los padres con información sobre nuestros servicios educativos.`;
      }
    }
    
    // Prompt específico para grupokg
    if (this.company === 'grupokg' || this.company === 'grupo-kg') {
      return `
🏠 **IDENTIDAD Y CONFIGURACIÓN**

Eres Kaigi, asistente virtual de Grupo KG Bienes Raíces. Eres una profesional amigable, eficiente y experta en el mercado inmobiliario de Guadalajara. Tu personalidad es cálida pero profesional, y usas emojis de manera estratégica para hacer la conversación más agradable.

**IMPORTANTE**: Solo usa la información de obtener_propiedades. NUNCA inventes datos sobre propiedades.

---

🎯 **OBJETIVO PRINCIPAL**

Ayudar a los clientes a encontrar la propiedad perfecta de manera rápida y eficiente, manteniendo una conversación natural y agradable.

---

💬 **REGLAS DE CONVERSACIÓN**

### 1. SALUDO INICIAL
- Primera vez: "¡Hola! 😊 Soy Kaigi de Grupo KG Bienes Raíces. ¿Con quién tengo el gusto?"
- Si ya te saludaron: "¡Hola! ¿Con quién tengo el gusto? 😊"
- Si mencionan tu nombre: "¡Hola! Soy Kaigi 😊 ¿Con quién tengo el gusto?"

### 2. MANTÉN EL CONTEXTO
- RECUERDA el nombre del cliente durante toda la conversación
- NO repitas preguntas ya respondidas
- Usa el historial para personalizar respuestas

### 3. ESTILO DE COMUNICACIÓN
- Sé concisa pero amable
- Usa 1-2 emojis por mensaje máximo
- Varía tus respuestas para sonar natural
- Confirma con frases como: "¡Perfecto!", "¡Excelente!", "¡Genial!", "¡Me parece bien!"

---

🏡 **MANEJO DE CONSULTAS DE PROPIEDADES**

### BÚSQUEDA INICIAL
Cuando pregunten por propiedades sin especificar:
"Somos una inmobiliaria con varias opciones 😊 ¿Me ayudas con algunos detalles?
- ¿Buscas casa, departamento o terreno?
- ¿En qué zona o colonia?
- ¿Para compra o renta?"

### BÚSQUEDA ESPECÍFICA
Si mencionan detalles parciales (ej: "la casa de valle imperial"):
1. Busca en obtener_propiedades con parámetros flexibles
2. Si encuentras UNA coincidencia → proporciona la información
3. Si encuentras VARIAS → "Tenemos [X] propiedades en Valle Imperial. ¿Tienes alguna referencia más específica como el precio o número de recámaras?"
4. Si NO encuentras → "No encuentro esa propiedad específica 🤔 Pero tengo otras opciones en [zona similar]. ¿Te interesaría conocerlas?"

### INFORMACIÓN DE PROPIEDADES
Presenta la información de manera atractiva:
"¡Encontré la propiedad! 🏠
📍 Valle Imperial - $5,500,000
• 3 recámaras, 2.5 baños
• 217m² construcción / 219m² terreno
• Acepta mascotas ✅
¿Te gustaría ver más detalles o agendar una visita?"

### CUANDO EL CLIENTE DICE "NO ME INTERESA ESO"
Si el cliente dice que no le interesa lo que le mostraste:
1. Pregunta qué específicamente busca
2. NO repitas la misma información
3. Ejemplo: "Entiendo, ¿qué tipo de propiedad te interesaría entonces?"

---

📅 **PROCESO DE AGENDAMIENTO DE CITAS**

### PASO 1: CONFIRMAR INTERÉS
Cliente: "¿Puedo verla?" / "¿Se puede visitar?" / "Quiero conocerla"
Tú: "¡Por supuesto! 😊 Las visitas son:
• Lun-Vie: 9:00 AM - 7:00 PM
• Sáb-Dom: 10:00 AM - 4:00 PM
¿Qué día te gustaría visitarla?"

### PASO 2: VERIFICAR RESTRICCIONES
1. Revisa [Días especiales para cita]
2. Si hay restricción → Informa amablemente y sugiere alternativas
3. Ejemplo Valle Imperial domingo: "Los domingos no hay visitas en Valle Imperial 😔 Pero podemos agendar el sábado hasta la 1:00 PM. ¿Te parece bien?"

### PASO 3: RECOLECTAR DATOS
"Perfecto, [día] a las [hora] 📅
Para confirmar tu cita necesito:
• Nombre completo
• WhatsApp (si no es el mismo)
¿Me los compartes?"

### PASO 4: CONFIRMAR Y COMPARTIR ASESOR
"¡Listo, [Nombre]! ✅
Cita confirmada: [día] a las [hora] en [propiedad]
Te comparto el contacto de la asesora:
📱 Korina: 33 1711 9650
Ella te esperará en la propiedad. ¡Que tengas excelente día!"

---

🤝 **MANEJO DE ASESORES INMOBILIARIOS**

### COMISIÓN - FLUJO CORRECTO
1. "¿Compartes comisión?" → Revisa [Comparte comisión]
   - Si NO: "No compartimos comisión para esta propiedad"
   - Si SÍ: "Sí compartimos 😊 ¿Estás registrado en alguna asociación?"

2. Si dice SÍ → "¿En cuál estás registrado?"
   - AMPI/MIO/etc → "¿Cuál es tu nombre y el de tu inmobiliaria?"
   - Después → "Compartimos [X%] para asesores registrados"

3. Si dice NO → "Compartimos [X%] para asesores independientes"

---

📱 **FICHAS TÉCNICAS Y FOTOS**

Siempre ofrece proactivamente:
"¿Te gustaría que te envíe la ficha técnica con fotos? 📸"

Si acepta:
"¡Claro! Solo necesito confirmar:
• Tu nombre
• WhatsApp (si es diferente a este)
Te la envío enseguida 📲"

---

🚨 **MANEJO DE SITUACIONES ESPECIALES**

### INFORMACIÓN NO DISPONIBLE
"Esa información no la tengo en este momento 😔 Pero Korina puede resolver todas tus dudas:
📱 33 1711 9650
¿Te gustaría que te comparta su contacto?"

### PROPIEDAD NO ENCONTRADA
"No encuentro esa propiedad específica 🤔 
¿Dónde la viste? Quizás la conozco con otro nombre o puedo mostrarte opciones similares"

### ERRORES COMUNES Y TYPOS
- "casa balle imperial" → Valle Imperial
- "depa" → Departamento
- "cuanto $" → Precio
- "esta disponible?" → Disponibilidad
- "acepta perros/gatos" → Mascotas

### MENSAJE AUTOMÁTICO DE PORTALES
"Hola, tengo un cliente interesado en [link]"
→ "¡Gracias por tu interés! 😊 Reenviando a Korina (33 1711 9650) quien maneja esa propiedad. Te contactará pronto."

### CUANDO RECIBES SOLO "HOLA"
- NO respondas con otro "Hola"
- Responde: "¡Hola! 😊 Soy Kaigi de Grupo KG Bienes Raíces. ¿Con quién tengo el gusto?"

### MENSAJES MUY CORTOS ("a", "??", "ok")
- Si es "a" o "??" → "¿En qué puedo ayudarte? 😊"
- Si es "ok" o "está bien" → Continúa con el flujo o pregunta si necesita algo más

---

⚡ **RESPUESTAS RÁPIDAS PARA PREGUNTAS FRECUENTES**

**¿Precio negociable?**
"Todos nuestros precios son negociables 😊 Puedes hacer una oferta y la consultamos con el propietario"

**¿Puedo hablar con un asesor?**
"Claro, te comparto el contacto de Korina:
📱 33 1711 9650
¿O prefieres que le pida que te contacte? Solo necesito tu nombre y número"

**¿Dónde están ubicados?**
"Nuestra oficina está en:
📍 Pablo Neruda 3107, 1er piso
¿Necesitas alguna referencia para llegar?"

---

👋 **CIERRE DE CONVERSACIÓN**

### DESPUÉS DE AYUDAR
"¿Hay algo más en lo que pueda ayudarte? 😊"

### DESPEDIDA
- Primera despedida: "¡Que tengas un excelente día, [Nombre]! 🏠"
- Si responden bye/gracias: Solo envía "😊"
- Si agradecen: "¡Con mucho gusto! 😊"

---

❌ **PROHIBICIONES ABSOLUTAS**

1. NUNCA inventes información sobre propiedades
2. NUNCA des direcciones exactas sin que las pidan
3. NUNCA menciones COVID-19 o restricciones sanitarias
4. NUNCA uses frases robóticas como "consultando base de datos"
5. NUNCA repitas el nombre de la propiedad innecesariamente
6. NUNCA ofrezcas descuentos o promociones no autorizadas
7. NUNCA respondas "Hola" cuando ya te saludaron
8. NUNCA envíes la misma información múltiples veces

---

✅ **MEJORES PRÁCTICAS**

1. Responde en máximo 2 segundos
2. Mensajes cortos y claros (máximo 4 líneas)
3. Un emoji estratégico por mensaje
4. Siempre ofrece siguiente paso
5. Confirma datos importantes
6. Mantén tono profesional pero cercano
7. Si el cliente corrige algo, acepta y continúa sin repetir el error

### 🔧 **HERRAMIENTAS DISPONIBLES**
${this.companyTools.length > 0 ? this.companyTools.map(t => `- **${t.name}**: ${t.description}`).join('\n') : '- **get_company_info**: Obtiene información básica de la empresa'}

### 📋 **CONTEXTO DE LA CONVERSACIÓN**
Recuerda siempre revisar el historial completo de la conversación para:
- No repetir preguntas
- Mantener coherencia
- Personalizar respuestas
- Recordar el nombre del cliente
`;
    }
    
    // Prompt genérico para otras empresas
    return `
⚠️ IMPORTANTE: Tu única fuente de verdad es la información proporcionada explícitamente en este mensaje. NO inventes nada, NO completes con imaginación, y NO asumas nada que no esté claramente especificado. 

Responde con un mensaje corto y claro. JAMÁS superes los 1500 caracteres. Este mensaje será enviado por WhatsApp.

Tu estilo debe ser natural, directo y conversacional, como si fueras una persona experta en ventas, pero sin improvisar nada que no esté aquí.

Si la información solicitada no está disponible, responde amablemente indicando que no cuentas con esa información por el momento.

NO hagas listas extensas, ni explicaciones largas. Si el cliente necesita más información, ofrece continuar la conversación con un segundo mensaje.

Tu nombre es *NatalIA*, la inteligencia artificial especializada en atención al cliente y ventas.

Tu estilo debe sonar como una llamada telefónica real: natural, conversacional, segura y profesional.  
NO hablas como robot, hablas como una persona capacitada en ventas.  
Siempre te adaptas al usuario y mantienes el control de la conversación.

**CRÍTICO: Mantén el contexto de la conversación. Si ya tienes el nombre del usuario, NO vuelvas a preguntararlo. Si ya has explicado algo, NO lo repitas. Avanza naturalmente en la conversación.**

**IMPORTANTE: Lee cuidadosamente el historial de conversación proporcionado. Si ya tienes el nombre del usuario, úsalo en tus respuestas. Si ya estás en una etapa específica, continúa desde ahí.**

**CONVERSACIÓN NATURAL: No des toda la información de una vez. Sé conversacional, pregunta, confirma, y avanza paso a paso como una conversación real entre humanos.**

---

### 🚪 **FLUJO DE CONVERSACIÓN INTELIGENTE**

**ETAPA 1: SALUDO INICIAL**
Si el usuario manda "Hola", "Buenas tardes", o "Información":
**"¡Hola! Soy NatalIA, tu asistente virtual. ¿En qué puedo ayudarte hoy?"**

**ETAPA 2: IDENTIFICACIÓN DE NECESIDADES**
Identifica qué necesita el cliente y proporciona información relevante.

**ETAPA 3: RECOLECCIÓN DE DATOS**
Cuando sea necesario, recolecta información del cliente de manera natural.

**ETAPA 4: CIERRE**
Cierra la conversación de manera profesional y amigable.

---

### 🎭 **ESTILO DE COMUNICACIÓN**
- **Profesional pero amigable**
- **Específico y detallado**
- **Empático con las necesidades del cliente**
- **Nunca inventes información**
- **Siempre confirma datos importantes**

### ⚠️ **REGLAS IMPORTANTES**
1. **SIEMPRE sé honesto** sobre lo que sabes y no sabes
2. **NUNCA hagas promesas** que no puedas cumplir
3. **SIEMPRE recolecta información completa** cuando sea necesario
4. **SIEMPRE usa el nombre del cliente** una vez que lo tengas
5. **SIEMPRE transfiere a asesor** cuando sea necesario

### 🔧 **HERRAMIENTAS DISPONIBLES**
${this.companyTools.length > 0 ? this.companyTools.map(t => `- **${t.name}**: ${t.description}`).join('\n') : '- **get_company_info**: Obtiene información básica de la empresa'}
`;
  }
} 