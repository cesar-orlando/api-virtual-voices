import { BaseAgent } from './BaseAgent';
import { tool } from '@openai/agents';
import { z } from 'zod';
import { getConnectionByCompanySlug } from '../../config/connectionManager';
import getIaConfigModel, { IIaConfig } from '../../models/iaConfig.model';
import getToolModel from '../../models/tool.model';
import { ToolExecutor } from '../toolExecutor';
import { ITool } from '../../types/tool.types';
import getRecordModel from '../../models/record.model';
import getCompanyModel from '../../models/company.model';

export class GeneralAgent extends BaseAgent {
  private customPrompt: string | null = null;
  private companyTools: ITool[] = [];

  constructor(company: string, agentContext: Record<string, any> = {}) {
    super(company);
    this.agentContext = agentContext;
  }

  protected async initializeAgent() {
    try {
      // Cargar prompt personalizado desde la base de datos
      await this.loadCustomPrompt();
      
      // Cargar tools dinámicas desde la base de datos
      await this.loadCompanyTools();
      
      const { Agent } = require('@openai/agents');
      
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
      const Company = getCompanyModel(conn);
      // Fetch internal phones from the single company doc in this tenant DB
      const company = await Company.findOne({});
      const internalPhones = Array.isArray(company?.internalPhones) ? company.internalPhones : [];
      const normalize = (p: any) => (typeof p === 'string' ? p.replace('@c.us', '').trim() : '');
      const phoneUserStr = normalize(this.agentContext.phoneUser);
      const isInternalPhone = phoneUserStr && internalPhones.some(p => normalize(p) === phoneUserStr);

      let config: IIaConfig

      if (isInternalPhone){
        config = await IaConfig.findOne({ type: 'interno' });
      } else {
        config = await IaConfig.findOne({ _id: this.agentContext.iaConfigId });
      }
      
      if (config && config.customPrompt) {
        this.customPrompt = config.customPrompt;
        this.agentContext.timezone = config.timezone;
        this.agentContext.type = config.type;
      } else {
        console.log(`⚠️ No custom prompt found for ${this.company}, using fallback`);
        this.customPrompt = null;
        this.agentContext.timezone = 'America/Mexico_City';
        this.agentContext.type = config.type;
      }
    } catch (error) {
      console.error(`❌ Error loading custom prompt for ${this.company}:`, error);
      this.customPrompt = null;
    }
  }

  private async loadCompanyTools(): Promise<void> {
    try {
      const conn = await getConnectionByCompanySlug(this.company);
      const Tool = getToolModel(conn);
      
      // Buscar todas las tools activas para la empresa
      const tools = await Tool.find({ 
        c_name: this.company, 
        isActive: true 
      }).lean();
      
      // Convertir a ITool[]
      this.companyTools = tools as unknown as ITool[];
      
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

            function cleanParams(input: any) {
              const result: any = {};
              for (const [key, value] of Object.entries(input)) {
                if (
                  value !== undefined &&
                  value !== null &&
                  value !== '' &&
                  !(typeof value === 'number' && value === 0)
                ) {
                  result[key] = value;
                }
              }
              return result;
            }
            
            try {
              const result = await ToolExecutor.execute({
                toolName: companyTool.name,
                parameters: { ...cleanParams(params), 
                  number: this.agentContext.type === 'interno' && params.number ? String(params.number) : this.agentContext.phoneUser.replace('@c.us', ''), 
                  sessionId: this.agentContext.sessionId },
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

    if (this.company === 'grupo-milkasa') {
      // Agregar tool específica para crear eventos de calendario
      dynamicTools.push(
        tool({
          name: 'create_calendar_event',
          description: 'Crear un evento/cita en el calendario',
          parameters: z.object({
            query: z.string().describe('Qué información se está solicitando')
          }) as any,
        execute: async (params) => {
          const conn = await getConnectionByCompanySlug(this.company);
          const Record = getRecordModel(conn);
          await Record.updateOne(
            {
              tableSlug: 'prospectos',
              'data.number': Number(this.agentContext.phoneUser.replace('@c.us','')),
            },
            { $set: { 'data.ia': false } }
          );

          return {
            message: `Muchas gracias por tu interés en crear una cita. Te pasaremos a un asesor que te ayudará a completar el proceso.`,
            data: `Muchas gracias por tu interés en crear una cita. Te pasaremos a un asesor que te ayudará a completar el proceso.`,
            success: true
          };
        },
        })
      );
    }

    return dynamicTools;
  }

  private getSystemInstructions(): string {
    // Si hay un prompt personalizado, usarlo; si no, usar el fallback
    if (this.customPrompt) {
      console.log(`🔧 Using custom prompt for ${this.company}`);
      
      return this.customPrompt;
    }
    
    console.log(`🔧 Using fallback prompt for ${this.company}`);
    
    // Prompt genérico para otras empresas
    return `Eres un asistente virtual que ayuda a los clientes con sus consultas. Proporciona respuestas claras y útiles. Si no sabes la respuesta, di que no lo sabes y que lo vas a redirigir a un asesor. Usa las herramientas disponibles para obtener información adicional si es necesario.`;
  }
}