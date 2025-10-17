import { BaseAgent } from './BaseAgent';
import { tool } from '@openai/agents';
import { z } from 'zod';
import { getConnectionByCompanySlug } from '../../config/connectionManager';
import getIaConfigModel, { IIaConfig } from '../../models/iaConfig.model';
import getToolModel from '../../models/tool.model';
import { ToolExecutor } from './toolExecutor';
import { ITool } from '../../types/tool.types';
import getRecordModel from '../../models/record.model';
import getCompanyModel from '../../models/company.model';
import { getCalendarEventService } from '../google/calendarEventService';
import getUserModel from '../../core/users/user.model';

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
    } catch (error) {
      console.error(`❌ Error initializing GeneralAgent for ${this.company}:`, error);
      throw error;
    }
  }

  private async loadCustomPrompt(): Promise<void> {
    try {
      const conn = await this.getConnection();
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
        this.customPrompt = null;
        this.agentContext.timezone = 'America/Mexico_City';
        this.agentContext.type = null;
      }
    } catch (error) {
      console.error(`❌ Error loading custom prompt for ${this.company}:`, error);
      this.customPrompt = null;
    }
  }

  private async loadCompanyTools(): Promise<void> {
    try {
      const conn = await this.getConnection();
      const Tool = getToolModel(conn);
      
      // Buscar todas las tools activas para la empresa
      const tools = await Tool.find({ 
        c_name: this.company, 
        isActive: true 
      }).lean();
      
      // Convertir a ITool[]
      this.companyTools = tools as unknown as ITool[];
      
    } catch (error) {
      console.error(`❌ Error loading tools for ${this.company}:`, error);
      this.companyTools = [];
    }
  }

  private buildDynamicTools(): any[] {
    const dynamicTools = [];
    
    // Add scheduling tools if scheduler service is available
    if (this.schedulerService) {
      dynamicTools.push(this.createScheduleFollowUpTool());
      dynamicTools.push(this.createCancelFollowUpTool());
    }
    
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
      }),

      tool({
        name: 'create_calendar_event',
        description: 'Crear nuevo evento en Google Calendar',
          parameters: z.object({
            summary: z.string().describe('Titulo del evento'),
            description: z.string().nullable().describe('Descripción detallada del evento'),
            startDateTime: z.string().describe('Fecha y hora de inicio en formato ISO (YYYY-MM-DDTHH:mm:ss)'),
            endDateTime: z.string().describe('Fecha y hora de finalización en formato ISO (YYYY-MM-DDTHH:mm:ss)'),
            location: z.string().nullable().describe('Ubicación del evento'),
            attendees: z.array(z.string()).nullable().describe('Array de direcciones de correo electrónico para invitar'),
          }) as any,
        execute: async ({ summary, description, startDateTime, endDateTime, location, attendees }) => {

          console.log(`📅 Creating calendar event: ${summary} with start ${startDateTime} and end ${endDateTime}`);

          const conn = await this.getConnection();

          const Record = getRecordModel(conn);
          const prospecto = await Record.findOne({ 'data.number': Number(this.agentContext.phoneUser.replace('@c.us','')) });

          const User = getUserModel(conn);
          const asesor = await User.findById(prospecto.data.asesor.id);

          description += `\n\nConsultado por: ${this.agentContext.phoneUser.replace('@c.us','')}`;
          attendees.push(asesor.email);

          if (this.agentContext.company === 'mitsubishi') attendees.push('coordinacion.bdc@mitsubishi-country.mx');

          const eventData = {
            summary,
            description: description,
            startDateTime,
            endDateTime,
            location: location || '',
            attendees: attendees,
            timeZone: this.agentContext.timezone || 'America/Mexico_City'
          };

          const response = await fetch('http://localhost:3001/api/google/calendar/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(eventData)
          });

          const responseData = await response.json();

          if (response.ok && responseData.success) {
            
            // Save to database
            try {
              const calendarService = await getCalendarEventService(this.company);
              const savedEvent = await calendarService.saveCalendarEvent({
                phoneUser: this.agentContext?.phoneUser || 'unknown',
                company: this.company,
                googleEventId: responseData.data.eventId,
                calendarId: 'primary',
                title: summary,
                description: description || '',
                startDateTime: new Date(startDateTime),
                endDateTime: new Date(endDateTime),
                location: location || '',
                attendees: attendees || [],
                timeZone: this.agentContext.timezone || 'America/Mexico_City',
                googleCalendarUrl: responseData.data.htmlLink
              });
              
              return `✅ ¡Evento creado exitosamente!

              📝 **Título:** ${summary}
              📅 **Fecha:** ${new Date(startDateTime).toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              🕐 **Hora:** ${new Date(startDateTime).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} - ${new Date(endDateTime).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
              ${location ? `📍 **Lugar:** ${location}` : ''}
              ${attendees && attendees.length > 0 ? `👥 **Invitados:** ${attendees.join(', ')}` : ''}

              🆔 Para editar o eliminar este evento, puedes referirte a él como:
              • "${summary}"

              🔗 [Ver en Google Calendar](${responseData.data.htmlLink || responseData.data.alternativeUrl})

              ✨ El evento ha sido agregado a tu calendario de Google. Si necesitas algo más, ¡dímelo! 😊`;

              console.log('✅ Google Calendar event created successfully');

            } catch (dbError) {
              console.error('❌ Database save failed:', dbError);
              // Still return success since Google Calendar event was created
              return `✅ ¡Evento creado exitosamente en Google Calendar!

              📝 **Título:** ${summary}
              🔗 [Ver en Google Calendar](${responseData.data.htmlLink || responseData.data.alternativeUrl})

              ⚠️ Nota: El evento se creó correctamente pero no se pudo guardar en la base de datos local para referencias futuras.`;
            }
            
          } else {
            throw new Error(responseData.message || 'Failed to create event');
          }
        }
      }),

      tool({
        name: 'edit_calendar_event',
        description: 'Edita el evento en Google Calendar con parámetros específicos',
        parameters: z.object({
          eventId: z.string().nullable().describe('ID del evento en Google Calendar'),
          eventReference: z.string().nullable().describe('Referencia de evento opcional. Si no se proporciona, se utilizará automáticamente el evento más reciente del usuario.'),
          summary: z.string().nullable().describe('Nuevo título del evento'),
          description: z.string().nullable().describe('Nueva descripción del evento'),
          startDateTime: z.string().nullable().describe('Nueva fecha y hora de inicio en formato ISO (YYYY-MM-DDTHH:mm:ss)'),
          endDateTime: z.string().nullable().describe('Nueva fecha y hora de finalización en formato ISO (YYYY-MM-DDTHH:mm:ss)'),
          location: z.string().nullable().describe('Nueva ubicación del evento'),
          attendees: z.array(z.string()).nullable().describe('Nueva lista de direcciones de correo electrónico para invitar'),
        }) as any,
        execute: async ({ eventId,eventReference, summary, description, startDateTime, endDateTime, location, attendees }) => {
          try {
            console.log(`✏️ Editing calendar event. Reference: ${eventReference || 'most recent'}, Summary: ${summary}, Start: ${startDateTime}, End: ${endDateTime} with: ${attendees}`);
            const calendarService = await getCalendarEventService(this.company);
            
            // Find the event to edit
            let event;
            if (eventId) {
              // Use explicit eventId if provided
            } else if (eventReference) {
              // Find by reference if provided
              event = await calendarService.findEventByReference(
                this.agentContext?.phoneUser || 'unknown',
                this.company,
                eventReference
              );
              eventId = event?.googleEventId;
              if (!event) {
                return `❌ No encontré el evento para eliminar. Referencia: "${eventReference}"`;
              }
            } else {
              // Fall back to most recent event
              event = await calendarService.getMostRecentEvent(
                this.agentContext?.phoneUser || 'unknown'
              );
              eventId = event?.googleEventId;
              if (!event) {
                return `❌ No tienes eventos en tu calendario para eliminar.`;
              }
            }

            // Build update data with only provided parameters
            const updateData: any = {
              timeZone: this.agentContext.timezone || 'America/Mexico_City'
            };

            const conn = await this.getConnection();

            const Record = getRecordModel(conn);
            const prospecto = await Record.findOne({ 'data.number': Number(this.agentContext.phoneUser.replace('@c.us','')) });

            const User = getUserModel(conn);
            const asesor = await User.findById(prospecto.data.asesor.id);

            // Update fields with provided values or fallback to current event values
            updateData.summary = (summary !== null && summary !== undefined) ? summary : event.title;
            updateData.description = (description !== null && description !== undefined) ? description : event.description;
            updateData.startDateTime = (startDateTime !== null && startDateTime !== undefined) ? startDateTime : event.startDateTime;
            updateData.endDateTime = (endDateTime !== null && endDateTime !== undefined) ? endDateTime : event.endDateTime;
            updateData.location = (location !== null && location !== undefined) ? location : event.location;
            updateData.attendees = (attendees !== null && attendees !== undefined && (!Array.isArray(attendees) || attendees.length > 0)) ? [...attendees, asesor.email] : event.attendees;

            // Apply the update
            const response = await fetch(`http://localhost:3001/api/google/calendar/events/${eventId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updateData)
            });

            let responseData;
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
              responseData = await response.json();
            } else {
              const text = await response.text();
              throw new Error(`Unexpected response from calendar API: ${text.substring(0, 200)}`);
            }

            if (!response.ok || !responseData.success) {
              throw new Error(responseData.message || 'Failed to update event');
            }

            // Build success message with updated information
            const updatedEvent = {
              title: updateData.summary || event.title,
              startDateTime: updateData.startDateTime ? new Date(updateData.startDateTime) : event.startDateTime,
              endDateTime: updateData.endDateTime ? new Date(updateData.endDateTime) : event.endDateTime,
              location: updateData.location || event.location || '',
              attendees: updateData.attendees || event.attendees || []
            };

            // Update internal database with the changes
            try {
              await calendarService.updateCalendarEvent(eventId, {
                title: updatedEvent.title,
                description: updateData.description,
                startDateTime: updatedEvent.startDateTime,
                endDateTime: updatedEvent.endDateTime,
                location: updatedEvent.location,
                attendees: updatedEvent.attendees,
                timeZone: updateData.timeZone || this.agentContext.timezone || 'America/Mexico_City'
              });
              console.log('💾 Internal database updated successfully');
            } catch (dbError) {
              console.error('❌ Failed to update internal database:', dbError);
              // Continue execution - Google Calendar was updated successfully
            }
            

            return `✅ ¡Evento actualizado exitosamente!

            📝 **Título:** ${updatedEvent.title}
            📅 **Fecha:** ${updatedEvent.startDateTime.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            🕐 **Hora:** ${updatedEvent.startDateTime.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} - ${updatedEvent.endDateTime.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
            ${updatedEvent.location ? `📍 **Lugar:** ${updatedEvent.location}` : ''}
            ${updatedEvent.attendees && updatedEvent.attendees.length > 0 ? `👥 **Invitados:** ${updatedEvent.attendees.join(', ')}` : ''}

            ✨ Los cambios han sido aplicados exitosamente.`;
            
          } catch (error: any) {
            console.error('❌ ERROR in edit_calendar_event:', error);
            const errorMessage = error.response?.data?.message || error.message || 'Unknown error occurred';
            return `❌ Error editando evento: ${errorMessage}`;
          }
        }
      }),

      tool({
        name: 'delete_calendar_event',
        description: 'Borrar un evento de Google Calendar por su ID o titulo/descripcion.',
        parameters: z.object({
          eventId: z.string().nullable().describe('El ID del evento a borrar'),
          eventReference: z.string().nullable().describe('Referencia opcional del evento. Si no se proporciona, se utilizará automáticamente el evento más reciente del usuario.'),
          calendarId: z.string().optional().default('primary').describe('El ID del calendario (predeterminado: primary)')
        }) as any,
        execute: async ({ eventId, calendarId, eventReference }) => {
          try {
            console.log(`🗑️ Deleting calendar event: ${eventId} / ${eventReference} for user: ${this.agentContext?.phoneUser || 'unknown'}`);

            const calendarService = await getCalendarEventService(this.company);

            let event;
            if (eventId) {
              // Use explicit eventId if provided
            } else if (eventReference) {
              // Find by reference if provided
              event = await calendarService.findEventByReference(
                this.agentContext?.phoneUser || 'unknown',
                this.company,
                eventReference
              );
              eventId = event?.googleEventId;
              if (!event) {
                return `❌ No encontré el evento para eliminar. Referencia: "${eventReference}"`;
              }
            } else {
              // Fall back to most recent event
              event = await calendarService.getMostRecentEvent(
                this.agentContext?.phoneUser || 'unknown'
              );
              eventId = event?.googleEventId;
              if (!event) {
                return `❌ No tienes eventos en tu calendario para eliminar.`;
              }
            }

            const response = await fetch(`http://localhost:3001/api/google/calendar/events/${eventId}?calendarId=${calendarId}`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' }
            });

            const responseData = await response.json();

            if (response.ok && responseData.success) {
              // Update database status
              try {
                const calendarService = await getCalendarEventService(this.company);
                await calendarService.updateEventStatus(eventId, 'deleted');
                console.log('💾 Updated event status to deleted in database');
              } catch (dbError) {
                console.error('❌ Failed to update database status:', dbError);
              }

              return `✅ ¡Evento eliminado exitosamente!

              🗑️ El evento ha sido eliminado de tu calendario de Google.
              🆔 ID eliminado: ${eventId}`;
            } else {
              throw new Error(responseData.message || 'Failed to delete event');
            }
          } catch (error: any) {
            console.error('❌ ERROR in delete_calendar_event:', error);
            const errorMessage = error.response?.data?.message || error.message || 'Unknown error occurred';
            return `❌ Error eliminando evento: ${errorMessage}`;
          }
        }
      }),

      tool({
        name: 'list_user_events',
        description: 'Enlista eventos del calendario del usuario',
        parameters: z.object({
          limit: z.number().optional().default(10).describe('Cantidad máxima de eventos a retornar')
        }) as any,
        execute: async ({ limit }) => {
          try {
            console.log(`📅 Listing up to ${limit} calendar events for user: ${this.agentContext?.phoneUser || 'unknown'}`);
            const calendarService = await getCalendarEventService(this.company);
            const events = await calendarService.getUserCalendarEvents(
              this.agentContext?.phoneUser || 'unknown',
              this.company,
              limit
            );

            if (events.length === 0) {
              return "📅 No tienes eventos próximos en tu calendario.";
            }

            let response = "📅 Tus próximos eventos:\n\n";
            events.forEach((event, index) => {
              response += `${index + 1}. ${event.title}\n`;
              response += `   📅 ${event.date} a las ${event.time}\n`;
              if (event.location) response += `   📍 ${event.location}\n`;
              response += `   🆔 ID: ${event.googleEventId}\n\n`;
              response += `   👥 Asistentes: ${event.attendees.join(', ')}`;
            });

            response += "💡 Para editar o eliminar, menciona el número o nombre del evento.";
            
            return response;
          } catch (error: any) {
            console.error('❌ ERROR listing user events:', error);
            return `❌ Error obteniendo tus eventos: ${error.message}`;
          }
        }
      }),
    );

    return dynamicTools;
  }

  /**
   * Create the follow-up scheduling tool
   */
  private createScheduleFollowUpTool() {
    return tool({
      name: 'schedule_follow_up',
      description: 'Schedule a follow-up message to be sent automatically after a specified delay. Use this when you want to continue the conversation later, remind about something, or nurture the relationship.',
      parameters: z.object({
        delayHours: z.number().min(1).max(72).nullable().describe('Hours to wait before sending the follow-up (use for same-day follow-ups)'),
        delayDays: z.number().min(1).max(30).nullable().describe('Days to wait before sending the follow-up (use for longer-term nurturing)'),
        messageType: z.enum(['follow_up', 'reminder', 'nurture', 'appointment', 'motivation', 'offer']).describe('Type of follow-up message to schedule'),
        reason: z.string().describe('Brief explanation of why this follow-up is being scheduled (for context)'),
        messageContent: z.string().max(300).describe('Message content to include in the follow-up (keep it concise)'),
        priority: z.enum(['low', 'medium', 'high']).default('medium').describe('Priority level of this follow-up')
      }) as any,
      execute: async ({ delayHours, delayDays, messageType, reason, messageContent, priority = 'medium' }) => {
        try {
          if (!this.schedulerService) {
            return 'Scheduler service not available. Follow-up not scheduled.';
          }

          if (!this.agentContext.chatHistory) {
            return 'Chat context not available. Follow-up not scheduled.';
          }

          const chat = this.agentContext.chatHistory;
          
          // Create trigger event from reason
          const triggerEvent = `ai_scheduled_${messageType}_${reason.toLowerCase().replace(/\s+/g, '_')}`;

          const scheduledMessage = await this.schedulerService.scheduleFollowUp({
            chatId: chat._id.toString(),
            phone: chat.phone,
            company: this.company,
            messageType,
            delayHours,
            delayDays,
            triggerEvent,
            messageContent,
            customData: {
              scheduledByAI: true,
              reason,
              priority,
              conversationStage: chat.conversationSummary?.conversationStage,
              scheduledAt: new Date().toISOString()
            }
          });

          const timeUnit = delayHours ? `${delayHours} horas` : `${delayDays} días`;
          const scheduledTime = new Date(scheduledMessage.scheduledFor).toLocaleString('es-MX');

          console.log(`🤖 AI scheduled ${messageType} follow-up for ${chat.phone} in ${timeUnit} (${scheduledTime}) with reason: ${reason}`);
          
          return `✅ Follow-up programado exitosamente para ${timeUnit} (${scheduledTime}). Tipo: ${messageType}. Motivo: ${reason}`;
          
        } catch (error) {
          console.error('❌ Error scheduling follow-up via AI tool:', error);
          return `❌ Error al programar seguimiento: ${(error as Error).message}`;
        }
      }
    });
  }

  /**
   * Create the cancel follow-up tool
   */
  private createCancelFollowUpTool() {
    return tool({
      name: 'cancel_follow_ups',
      description: 'Cancel pending follow-up messages for this conversation. Use when the conversation is resolved, the customer is no longer interested, or when follow-ups are no longer needed.',
      parameters: z.object({
        messageType: z.enum(['follow_up', 'reminder', 'nurture', 'appointment', 'motivation', 'offer']).nullable().describe('Specific type of follow-up to cancel (optional - if not provided, cancels all pending follow-ups)'),
        reason: z.string().describe('Brief explanation of why follow-ups are being cancelled')
      }) as any,
      execute: async ({ messageType, reason }) => {
        try {
          if (!this.schedulerService) {
            return 'Scheduler service not available.';
          }

          if (!this.agentContext.chatHistory) {
            return 'Chat context not available.';
          }

          const chat = this.agentContext.chatHistory;
          
          const cancelledCount = await this.schedulerService.cancelScheduledMessages(
            chat._id.toString(),
            messageType
          );

          console.log(`🤖 AI cancelled ${cancelledCount} follow-ups for ${chat.phone}`);
          console.log(`📝 Reason: ${reason}`);
          
          const typeText = messageType ? ` de tipo ${messageType}` : '';
          return `✅ Se cancelaron ${cancelledCount} seguimientos${typeText} pendientes. Motivo: ${reason}`;
          
        } catch (error) {
          console.error('❌ Error cancelling follow-ups via AI tool:', error);
          return `❌ Error al cancelar seguimientos: ${(error as Error).message}`;
        }
      }
    });
  }

  /**
   * Get scheduling instructions to append to system prompts
   */
  private getSchedulingInstructions(): string {
    if (!this.schedulerService) {
      return '';
    }

    return `

## SEGUIMIENTO INTELIGENTE DE CONVERSACIONES

Tienes acceso a herramientas para programar seguimientos automáticos:

### ⏰ Cuándo usar schedule_follow_up:
- **Nutrición de leads**: Cuando el usuario muestra interés pero no está listo para comprar
- **Recordatorios**: Para citas, eventos o información prometida  
- **Re-engagement**: Cuando la conversación se enfría o el usuario no responde
- **Follow-up de ventas**: Después de enviar propuestas o cotizaciones
- **Motivación**: Para mantener el interés en procesos largos

### 📝 Tipos de seguimiento disponibles:
- \`follow_up\`: Seguimiento general para continuar conversación
- \`reminder\`: Recordatorio específico (citas, deadlines, etc.)
- \`nurture\`: Nutrir relación con contenido de valor
- \`appointment\`: Confirmar o recordar citas programadas
- \`motivation\`: Motivar en procesos de decisión largos
- \`offer\`: Seguimiento de ofertas o promociones

### ⏱️ Programación inteligente:
- **Mismo día (1-24 horas)**: Para respuestas rápidas o confirmaciones urgentes
- **Corto plazo (1-3 días)**: Para seguimiento de interés o propuestas
- **Mediano plazo (4-7 días)**: Para nutrir leads o recordatorios importantes  
- **Largo plazo (1-4 semanas)**: Para mantenimiento de relaciones

### 🎯 Usa tu criterio para:
- **Evaluar el contexto** de la conversación y nivel de interés
- **Determinar el momento óptimo** para el seguimiento
- **Elegir el tipo de mensaje** más apropiado
- **Decidir la prioridad** basada en la oportunidad de negocio

### ❌ Cancela seguimientos cuando:
- El usuario compra o se convierte
- Solicita explícitamente no ser contactado
- La conversación se resuelve completamente
- El usuario pierde interés definitivamente

**Importante**: Úsa estas herramientas de forma natural e inteligente, como lo haría un vendedor experto que sabe cuándo dar seguimiento para maximizar oportunidades sin ser invasivo.`;
  }

  private getSystemInstructions(): string {
    // Si hay un prompt personalizado, usarlo; si no, usar el fallback
    if (this.customPrompt) {
      console.log(`🔧 Using custom prompt for ${this.company}`);
      
      return this.customPrompt + this.getSchedulingInstructions();
    }
        
    // Prompt genérico para otras empresas
    return `Eres un asistente virtual que ayuda a los clientes con sus consultas. Proporciona respuestas claras y útiles. Si no sabes la respuesta, di que no lo sabes y que lo vas a redirigir a un asesor. Usa las herramientas disponibles para obtener información adicional si es necesario.` + this.getSchedulingInstructions();
  }
}