import { Agent, tool } from '@openai/agents';
import { BaseAgent } from './BaseAgent';
import { z } from 'zod';
import axios from 'axios';

interface AgentContext {
  company: string;
  phoneUser?: string;
  chatHistory?: any[];
}

export class Assistant extends BaseAgent {
  // Add context property
  protected context?: {
    phoneUser?: string;
    company?: string;
    chatHistory?: any[];
    [key: string]: any;
  };

  constructor(company: string, context?: any) {
    super(company);
    this.context = context;
  }

  // Update the setContext method
  public setContext(context: any): void {
    this.context = { ...this.context, ...context };
  }

  protected async initializeAgent(): Promise<void> {
    this.agent = new Agent({
      name: 'CalendarAssistant',
      instructions: this.getSystemInstructions(),
      model: 'gpt-4o-mini',
      modelSettings: {
        temperature: 0.3,
        maxTokens: 500
      },
      tools: [
        tool({
          name: 'create_calendar_event',
          description: 'Create a new Google Calendar event with specified details.',
          parameters: z.object({
            summary: z.string().describe('The title/summary of the event'),
            description: z.string().nullable().describe('Detailed description of the event'),
            startDateTime: z.string().describe('Start date and time in ISO format (YYYY-MM-DDTHH:mm:ss)'),
            endDateTime: z.string().describe('End date and time in ISO format (YYYY-MM-DDTHH:mm:ss)'),
            location: z.string().nullable().describe('Location of the event'),
            attendees: z.array(z.string()).nullable().describe('Array of email addresses to invite'),
            timeZone: z.string().default('America/Mexico_City').describe('Timezone for the event')
          }) as any,
          execute: async ({ summary, description, startDateTime, endDateTime, location, attendees, timeZone }) => {
            try {
              console.log('📅 Creating calendar event:', summary);
              
              const eventData = {
                summary,
                description: description || '',
                startDateTime,
                endDateTime,
                location: location || '',
                attendees: attendees || [],
                timeZone
              };

              const response = await fetch('http://localhost:3001/api/google-calendar/events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(eventData)
              });

              const responseData = await response.json();

              if (response.ok && responseData.success) {
                console.log('✅ Google Calendar event created successfully');
                
                // Save to database
                try {
                  const { getCalendarEventService } = await import('../calendarEventService');
                  const calendarService = await getCalendarEventService(this.company);
                  const savedEvent = await calendarService.saveCalendarEvent({
                    phoneUser: this.context?.phoneUser || 'unknown',
                    company: this.company,
                    googleEventId: responseData.data.eventId,
                    calendarId: 'primary',
                    title: summary,
                    description: description || '',
                    startDateTime: new Date(startDateTime),
                    endDateTime: new Date(endDateTime),
                    location: location || '',
                    attendees: attendees || [],
                    timeZone,
                    googleCalendarUrl: responseData.data.htmlLink
                  });

                  console.log('💾 Event saved to database with ID:', savedEvent._id);
                  
                  return `✅ ¡Evento creado exitosamente!

📝 **Título:** ${summary}
📅 **Fecha:** ${new Date(startDateTime).toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
🕐 **Hora:** ${new Date(startDateTime).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} - ${new Date(endDateTime).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
${location ? `📍 **Lugar:** ${location}` : ''}
${attendees && attendees.length > 0 ? `👥 **Invitados:** ${attendees.join(', ')}` : ''}

🆔 Para editar o eliminar este evento, puedes referirte a él como:
• "${summary}"
• ID: ${responseData.data.eventId}...

🔗 [Ver en Google Calendar](${responseData.data.htmlLink || responseData.data.alternativeUrl})

✨ El evento ha sido agregado a tu calendario de Google. Si necesitas algo más, ¡dímelo! 😊`;

                } catch (dbError) {
                  console.error('❌ Database save failed:', dbError);
                  // Still return success since Google Calendar event was created
                  return `✅ ¡Evento creado exitosamente en Google Calendar!

📝 **Título:** ${summary}
🆔 **ID:** ${responseData.data.eventId}
🔗 [Ver en Google Calendar](${responseData.data.htmlLink || responseData.data.alternativeUrl})

⚠️ Nota: El evento se creó correctamente pero no se pudo guardar en la base de datos local para referencias futuras.`;
                }
                
              } else {
                throw new Error(responseData.message || 'Failed to create event');
              }
            } catch (error: any) {
              console.error('❌ ERROR in create_calendar_event:', error);
              const errorMessage = error.response?.data?.message || error.message || 'Unknown error occurred';
              return `❌ Error creando evento en el calendario: ${errorMessage}`;
            }
          }
        }),

        tool({
          name: 'edit_calendar_event',
          description: 'Edit an existing Google Calendar event by its ID.',
          parameters: z.object({
            eventId: z.string().describe('The ID of the event to edit'),
            summary: z.string().nullable().describe('New title/summary of the event'),
            description: z.string().nullable().describe('New description of the event'),
            startDateTime: z.string().nullable().describe('New start date and time in ISO format'),
            endDateTime: z.string().nullable().describe('New end date and time in ISO format'),
            location: z.string().nullable().describe('New location of the event'),
            attendees: z.array(z.string()).nullable().describe('New array of email addresses'),
            timeZone: z.string().default('America/Mexico_City').describe('Timezone for the event')
          }) as any,
          execute: async ({ eventId, summary, description, startDateTime, endDateTime, location, attendees, timeZone }) => {
            try {
              console.log('📝 Editing calendar event:', eventId);
              
              // Get current event details to preserve existing fields when not updating them
              const currentEventResponse = await fetch(`http://localhost:3001/api/google-calendar/events/${eventId}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
              });
              
              let currentEventData: any = {};
              if (currentEventResponse.ok) {
                const currentEvent = await currentEventResponse.json();
                if (currentEvent.success) {
                  currentEventData = currentEvent.data;
                }
              }
              
              const updateData: any = { timeZone };
              
              if (summary !== null) updateData.summary = summary;
              if (description !== null) updateData.description = description;
              if (startDateTime !== null) updateData.startDateTime = startDateTime;
              if (endDateTime !== null) updateData.endDateTime = endDateTime;
              if (location !== null) updateData.location = location;
              if (attendees !== null) updateData.attendees = attendees;
              
              // Merge with current data to preserve fields not being updated
              const completeUpdateData = {
                ...currentEventData,
                ...updateData,
                // Preserve existing attendees if not explicitly updating them
                attendees: updateData.attendees !== undefined ? updateData.attendees : (currentEventData.attendees || [])
              };

              const response = await fetch(`http://localhost:3001/api/google-calendar/events/${eventId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(completeUpdateData)
              });

              const responseData = await response.json();

              if (response.ok && responseData.success) {
                return `✅ ¡Evento actualizado exitosamente!

📝 Título: ${responseData.data.summary}
🆔 ID: ${eventId}
🔗 Ver en Google Calendar: ${responseData.data.htmlLink}

✨ Los cambios se han guardado en tu calendario de Google.`;
              } else {
                throw new Error(responseData.message || 'Failed to update event');
              }
            } catch (error: any) {
              console.error('❌ ERROR in edit_calendar_event:', error);
              const errorMessage = error.response?.data?.message || error.message || 'Unknown error occurred';
              return `❌ Error editando evento: ${errorMessage}`;
            }
          }
        }),

        tool({
          name: 'delete_calendar_event',
          description: 'Delete a Google Calendar event by its ID.',
          parameters: z.object({
            eventId: z.string().describe('The ID of the event to delete'),
            calendarId: z.string().optional().default('primary').describe('The calendar ID (default: primary)')
          }) as any,
          execute: async ({ eventId, calendarId }) => {
            try {
              console.log('🗑️ Deleting calendar event:', eventId);
              
              const response = await fetch(`http://localhost:3001/api/google-calendar/events/${eventId}?calendarId=${calendarId}`, {
                method: 'DELETE'
              });

              const responseData = await response.json();

              if (response.ok && responseData.success) {
                // Update database status
                try {
                  const { getCalendarEventService } = await import('../calendarEventService');
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
          name: 'check_token_status',
          description: 'Check the current Google Calendar access token status and validity.',
          parameters: z.object({}) as any,
          execute: async () => {
            try {
              const response = await axios.get(
                'http://localhost:3001/api/google-calendar/token-status',
                {
                  headers: {
                    'Content-Type': 'application/json'
                  }
                }
              );

              if (response.data.success) {
                const tokenInfo = response.data.data;
                const result = `📊 Token Status:
Status: ${tokenInfo.status}
Valid: ${tokenInfo.is_valid ? 'Yes' : 'No'}
Expires: ${tokenInfo.expires_at || 'Unknown'}
${tokenInfo.expires_in_minutes ? `Expires in: ${tokenInfo.expires_in_minutes} minutes` : ''}
${tokenInfo.message || ''}`;
                return result;
              } else {
                throw new Error(response.data.message || 'Failed to check token status');
              }
            } catch (error: any) {
              console.error('❌ ERROR in check_token_status:', error);
              const errorMessage = error.response?.data?.message || error.message || 'Unknown error occurred';
              return `❌ Error checking token status: ${errorMessage}`;
            }
          }
        }),

        tool({
          name: 'parse_natural_datetime',
          description: 'Parse natural language date/time expressions into ISO format.',
          parameters: z.object({
            naturalDateTime: z.string().describe('Natural language date/time like "tomorrow at 2pm", "next Monday 10:00 AM", etc.'),
            referenceDate: z.string().nullable().describe('Reference date for relative expressions (defaults to now)')
          }) as any,
          execute: async ({ naturalDateTime, referenceDate }) => {
            try {
              // Use current date as reference (2025)
              const now = referenceDate ? new Date(referenceDate) : new Date();
              const timezone = 'America/Mexico_City';
              
              let targetDate = new Date(now);
              let targetTime = { hours: 9, minutes: 0 }; // Default to 9 AM

              // Parse relative days
              if (naturalDateTime.toLowerCase().includes('today') || naturalDateTime.toLowerCase().includes('hoy')) {
                // Keep current date
              } else if (naturalDateTime.toLowerCase().includes('tomorrow') || naturalDateTime.toLowerCase().includes('mañana')) {
                targetDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Add 1 day in milliseconds
              } else if (naturalDateTime.toLowerCase().includes('next week') || naturalDateTime.toLowerCase().includes('próxima semana')) {
                targetDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // Add 7 days in milliseconds
              } else if (naturalDateTime.toLowerCase().includes('monday') || naturalDateTime.toLowerCase().includes('lunes')) {
                const daysUntilMonday = (1 - targetDate.getDay() + 7) % 7;
                targetDate = new Date(now.getTime() + (daysUntilMonday || 7) * 24 * 60 * 60 * 1000);
              } else if (naturalDateTime.toLowerCase().includes('tuesday') || naturalDateTime.toLowerCase().includes('martes')) {
                const daysUntilTuesday = (2 - targetDate.getDay() + 7) % 7;
                targetDate = new Date(now.getTime() + (daysUntilTuesday || 7) * 24 * 60 * 60 * 1000);
              } else if (naturalDateTime.toLowerCase().includes('wednesday') || naturalDateTime.toLowerCase().includes('miércoles')) {
                const daysUntilWednesday = (3 - targetDate.getDay() + 7) % 7;
                targetDate = new Date(now.getTime() + (daysUntilWednesday || 7) * 24 * 60 * 60 * 1000);
              } else if (naturalDateTime.toLowerCase().includes('thursday') || naturalDateTime.toLowerCase().includes('jueves')) {
                const daysUntilThursday = (4 - targetDate.getDay() + 7) % 7;
                targetDate = new Date(now.getTime() + (daysUntilThursday || 7) * 24 * 60 * 60 * 1000);
              } else if (naturalDateTime.toLowerCase().includes('friday') || naturalDateTime.toLowerCase().includes('viernes')) {
                const daysUntilFriday = (5 - targetDate.getDay() + 7) % 7;
                targetDate = new Date(now.getTime() + (daysUntilFriday || 7) * 24 * 60 * 60 * 1000);
              } else if (naturalDateTime.toLowerCase().includes('saturday') || naturalDateTime.toLowerCase().includes('sábado')) {
                const daysUntilSaturday = (6 - targetDate.getDay() + 7) % 7;
                targetDate = new Date(now.getTime() + (daysUntilSaturday || 7) * 24 * 60 * 60 * 1000);
              } else if (naturalDateTime.toLowerCase().includes('sunday') || naturalDateTime.toLowerCase().includes('domingo')) {
                const daysUntilSunday = (0 - targetDate.getDay() + 7) % 7;
                targetDate = new Date(now.getTime() + (daysUntilSunday || 7) * 24 * 60 * 60 * 1000);
              }

              // Validate targetDate after calculations
              if (isNaN(targetDate.getTime())) {
                console.error('❌ Invalid date after day calculation:', targetDate);
                targetDate = new Date(now); // Fallback to current date
              }

              // Parse time patterns
              const timePatterns = [
                /(\d{1,2}):(\d{2})\s*(am|pm)/i,
                /(\d{1,2})\s*(am|pm)/i,
                /(\d{1,2}):(\d{2})/,
              ];

              for (const pattern of timePatterns) {
                const match = naturalDateTime.match(pattern);
                if (match) {
                  let hours = parseInt(match[1]);
                  const minutes = parseInt(match[2] || '0');
                  const period = match[3]?.toLowerCase();

                  // Validate hours and minutes
                  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
                    console.error('❌ Invalid time values:', { hours, minutes });
                    continue; // Try next pattern
                  }

                  if (period === 'pm' && hours !== 12) hours += 12;
                  if (period === 'am' && hours === 12) hours = 0;

                  // Final validation after period conversion
                  if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
                    targetTime = { hours, minutes };
                    break;
                  }
                }
              }

              // Construct final datetime
              targetDate.setHours(targetTime.hours, targetTime.minutes, 0, 0);
              
              // Validate the target date before using it
              if (isNaN(targetDate.getTime())) {
                console.error('❌ Invalid date created:', targetDate);
                throw new Error(`Invalid date created from natural expression: "${naturalDateTime}"`);
              }
              
              const isoDateTime = targetDate.toISOString().slice(0, 19);

              const result = `✅ Parsed datetime successfully!
Natural expression: "${naturalDateTime}"
ISO format: ${isoDateTime}
Human readable: ${targetDate.toLocaleString('en-US', { 
  timeZone: timezone,
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short'
})}`;

              return { isoDateTime, result };
            } catch (error: any) {
              console.error('❌ ERROR in parse_natural_datetime:', error);
              return `❌ Error parsing datetime: ${error.message}`;
            }
          }
        }),

        tool({
          name: 'smart_edit_event',
          description: 'IMMEDIATELY edit the user\'s most recent event based on natural language instructions. Always assumes most recent event if no specific event mentioned.',
          parameters: z.object({
            editInstruction: z.string().describe('Natural language editing instruction like "change time to 3pm", "move to tomorrow", "update location to office"'),
            eventReference: z.string().nullable().describe('Optional event reference. If not provided, will automatically use the user\'s most recent event.')
          }) as any,
          execute: async ({ editInstruction, eventReference }) => {
            try {
              console.log('🔧 Smart editing event immediately:', editInstruction);
              
              // If no event reference provided, get user's most recent event
              if (!eventReference) {
                console.log('🔍 No event reference - finding most recent event');
                const { getCalendarEventService } = await import('../calendarEventService');
                const calendarService = await getCalendarEventService(this.company);
                const recentEvents = await calendarService.getUserCalendarEvents(
                  this.context?.phoneUser || 'unknown',
                  this.company,
                  1 // Just get the most recent one
                );
                
                if (recentEvents.length === 0) {
                  return `❌ No tienes eventos en tu calendario para editar. ¿Quieres crear un evento nuevo?`;
                }
                
                eventReference = recentEvents[0].title; // Use the most recent event
                console.log(`🎯 Using most recent event: "${eventReference}"`);
              }
              
              // Extract what to edit from the instruction
              const instruction = editInstruction.toLowerCase();
              let updateData: any = { timeZone: 'America/Mexico_City' };
              
              // Find the event to edit
              const { getCalendarEventService } = await import('../calendarEventService');
              const calendarService = await getCalendarEventService(this.company);
              const event = await calendarService.findEventByReference(
                this.context?.phoneUser || 'unknown',
                this.company,
                eventReference
              );
              
              if (!event) {
                return `❌ No encontré el evento para editar. Tus eventos recientes: ${eventReference}`;
              }

              console.log(`📝 Found event to edit: "${event.title}"`);

              // Parse the editing instruction and apply immediately
              if (instruction.includes('time') || instruction.includes('hora') || /\d{1,2}(:\d{2})?\s*(am|pm|AM|PM)/.test(instruction)) {
                // Extract time from instruction
                const timeMatch = editInstruction.match(/(\d{1,2}):?(\d{2})?\s*(am|pm|AM|PM)?|\d{1,2}\s*(am|pm|AM|PM)/);
                if (timeMatch) {
                  let hours = parseInt(timeMatch[1] || timeMatch[0]);
                  const minutes = parseInt(timeMatch[2] || '0');
                  const period = (timeMatch[3] || timeMatch[4] || '').toLowerCase();
                  
                  if (period === 'pm' && hours !== 12) hours += 12;
                  if (period === 'am' && hours === 12) hours = 0;
                  
                  // We need to find the event first to get its current date
                  const event = await calendarService.findEventByReference(
                    this.context?.phoneUser || 'unknown',
                    this.company,
                    eventReference
                  );
                  
                  if (!event) {
                    return `❌ No encontré el evento para editar. Referencia usada: "${eventReference}"`;
                  }
                  
                  // Update the time while keeping the same date
                  const newStart = new Date(event.startDateTime);
                  newStart.setHours(hours, minutes, 0, 0);
                  
                  // Calculate new end time (maintain duration)
                  const duration = event.endDateTime.getTime() - event.startDateTime.getTime();
                  const newEnd = new Date(newStart.getTime() + duration);
                  
                  updateData.startDateTime = newStart.toISOString().slice(0, 19);
                  updateData.endDateTime = newEnd.toISOString().slice(0, 19);
                  
                  // Get current event details to preserve existing fields
                  const currentEventResponse = await fetch(`http://localhost:3001/api/google-calendar/events/${event.googleEventId}`, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
                  });
                  
                  let currentEventData: any = {};
                  if (currentEventResponse.ok) {
                    const currentEvent = await currentEventResponse.json();
                    if (currentEvent.success) {
                      currentEventData = currentEvent.data;
                    }
                  }
                  
                  // Merge update data with current event data to preserve existing fields
                  const completeUpdateData = {
                    ...currentEventData,
                    ...updateData,
                    // Ensure we preserve attendees if not being updated
                    attendees: updateData.attendees || currentEventData.attendees || []
                  };
                  
                  // Apply the update
                  const response = await fetch(`http://localhost:3001/api/google-calendar/events/${event.googleEventId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(completeUpdateData)
                  });
                  
                  const responseData = await response.json();
                  
                  if (response.ok && responseData.success) {
                    return `✅ ¡Hora del evento actualizada!

📝 Evento: ${event.title}
🕐 Nueva hora: ${newStart.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} - ${newEnd.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
📅 Fecha: ${newStart.toLocaleDateString('es-MX')}

✨ Cambio aplicado exitosamente.`;
                  } else {
                    throw new Error(responseData.message || 'Failed to update event');
                  }
                }
              } else if (instruction.includes('location') || instruction.includes('lugar') || instruction.includes('ubicación')) {
                // Extract location from instruction
                const locationWords = ['to', 'a', 'en', 'location', 'lugar', 'ubicación'];
                const words = editInstruction.split(' ');
                const locationIndex = words.findIndex(word => locationWords.includes(word.toLowerCase()));
                
                if (locationIndex !== -1 && locationIndex < words.length - 1) {
                  const location = words.slice(locationIndex + 1).join(' ');
                  updateData.location = location;
                  
                  // Find and update event - removed duplicate service import
                  const event = await calendarService.findEventByReference(
                    this.context?.phoneUser || 'unknown',
                    this.company,
                    eventReference
                  );
                  
                  if (!event) {
                    return `❌ No encontré el evento para editar. Referencia usada: "${eventReference}"`;
                  }
                  
                  // Get current event details to preserve existing fields
                  const currentEventResponse = await fetch(`http://localhost:3001/api/google-calendar/events/${event.googleEventId}`, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
                  });
                  
                  let currentEventData: any = {};
                  if (currentEventResponse.ok) {
                    const currentEvent = await currentEventResponse.json();
                    if (currentEvent.success) {
                      currentEventData = currentEvent.data;
                    }
                  }
                  
                  // Merge update data with current event data to preserve existing fields
                  const completeUpdateData = {
                    ...currentEventData,
                    ...updateData,
                    // Ensure we preserve attendees if not being updated
                    attendees: updateData.attendees || currentEventData.attendees || []
                  };
                  
                  const response = await fetch(`http://localhost:3001/api/google-calendar/events/${event.googleEventId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(completeUpdateData)
                  });
                  
                  const responseData = await response.json();
                  
                  if (response.ok && responseData.success) {
                    return `✅ ¡Ubicación del evento actualizada!

📝 Evento: ${event.title}
📍 Nueva ubicación: ${location}
📅 ${event.startDateTime.toLocaleDateString('es-MX')} - ${event.startDateTime.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}

✨ Cambio aplicado exitosamente.`;
                  } else {
                    throw new Error(responseData.message || 'Failed to update event');
                  }
                }
              } else if (instruction.includes('title') || instruction.includes('name') || instruction.includes('título') || instruction.includes('nombre')) {
                // Extract new title from instruction
                const titleWords = ['to', 'a', 'title', 'name', 'título', 'nombre'];
                const words = editInstruction.split(' ');
                const titleIndex = words.findIndex(word => titleWords.includes(word.toLowerCase()));
                
                if (titleIndex !== -1 && titleIndex < words.length - 1) {
                  const title = words.slice(titleIndex + 1).join(' ');
                  updateData.summary = title;
                  
                  // Find and update event - removed duplicate service import  
                  const event = await calendarService.findEventByReference(
                    this.context?.phoneUser || 'unknown',
                    this.company,
                    eventReference
                  );
                  
                  if (!event) {
                    return `❌ No encontré el evento para editar. Referencia usada: "${eventReference}"`;
                  }
                  
                  // Get current event details to preserve existing fields
                  const currentEventResponse = await fetch(`http://localhost:3001/api/google-calendar/events/${event.googleEventId}`, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
                  });
                  
                  let currentEventData: any = {};
                  if (currentEventResponse.ok) {
                    const currentEvent = await currentEventResponse.json();
                    if (currentEvent.success) {
                      currentEventData = currentEvent.data;
                    }
                  }
                  
                  // Merge update data with current event data to preserve existing fields
                  const completeUpdateData = {
                    ...currentEventData,
                    ...updateData,
                    // Ensure we preserve attendees if not being updated
                    attendees: updateData.attendees || currentEventData.attendees || []
                  };
                  
                  const response = await fetch(`http://localhost:3001/api/google-calendar/events/${event.googleEventId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(completeUpdateData)
                  });
                  
                  const responseData = await response.json();
                  
                  if (response.ok && responseData.success) {
                    return `✅ ¡Título del evento actualizado!

📝 Nuevo título: ${title}
📅 ${event.startDateTime.toLocaleDateString('es-MX')} - ${event.startDateTime.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
📍 ${event.location || 'Sin ubicación'}

✨ Cambio aplicado exitosamente.`;
                  } else {
                    throw new Error(responseData.message || 'Failed to update event');
                  }
                }
              } else if (instruction.includes('tomorrow') || instruction.includes('mañana') || instruction.includes('move')) {
                // Handle date changes
                const currentDate = new Date();
                let targetDate: Date;
                
                if (instruction.includes('tomorrow') || instruction.includes('mañana')) {
                  targetDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);
                } else {
                  return `❌ No pude entender qué fecha quieres para el evento. Especifica "mañana" o una fecha específica.`;
                }
                
                // Find event and update date - removed duplicate service import
                const event = await calendarService.findEventByReference(
                  this.context?.phoneUser || 'unknown',
                  this.company,
                  eventReference
                );
                
                if (!event) {
                  return `❌ No encontré el evento para editar. Referencia usada: "${eventReference}"`;
                }
                
                // Keep the same time, change the date
                const newStart = new Date(targetDate);
                newStart.setHours(event.startDateTime.getHours(), event.startDateTime.getMinutes(), 0, 0);
                
                const duration = event.endDateTime.getTime() - event.startDateTime.getTime();
                const newEnd = new Date(newStart.getTime() + duration);
                
                updateData.startDateTime = newStart.toISOString().slice(0, 19);
                updateData.endDateTime = newEnd.toISOString().slice(0, 19);
                
                // Get current event details to preserve existing fields
                const currentEventResponse = await fetch(`http://localhost:3001/api/google-calendar/events/${event.googleEventId}`, {
                  method: 'GET',
                  headers: { 'Content-Type': 'application/json' }
                });
                
                let currentEventData: any = {};
                if (currentEventResponse.ok) {
                  const currentEvent = await currentEventResponse.json();
                  if (currentEvent.success) {
                    currentEventData = currentEvent.data;
                  }
                }
                
                // Merge update data with current event data to preserve existing fields
                const completeUpdateData = {
                  ...currentEventData,
                  ...updateData,
                  // Ensure we preserve attendees if not being updated
                  attendees: updateData.attendees || currentEventData.attendees || []
                };
                
                const response = await fetch(`http://localhost:3001/api/google-calendar/events/${event.googleEventId}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(completeUpdateData)
                });
                
                const responseData = await response.json();
                
                if (response.ok && responseData.success) {
                  return `✅ ¡Fecha del evento actualizada!

📝 Evento: ${event.title}
📅 Nueva fecha: ${newStart.toLocaleDateString('es-MX')}
🕐 Hora: ${newStart.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} - ${newEnd.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}

✨ Cambio aplicado exitosamente.`;
                } else {
                  throw new Error(responseData.message || 'Failed to update event');
                }
              } else {
                return `❌ No pude entender qué quieres cambiar del evento.

💡 Ejemplos de ediciones que puedo hacer:
• "Change time to 3pm"
• "Move to tomorrow"  
• "Update location to office"
• "Change title to Client Meeting"

¿Podrías ser más específico sobre qué quieres cambiar?`;
              }
              
            } catch (error: any) {
              console.error('❌ ERROR in smart_edit_event:', error);
              const errorMessage = error.response?.data?.message || error.message || 'Unknown error occurred';
              return `❌ Error editando evento: ${errorMessage}`;
            }
          }
        }),

        // Add new tools for event management
        tool({
          name: 'list_user_events',
          description: 'List user\'s calendar events for reference when editing or deleting.',
          parameters: z.object({
            limit: z.number().optional().default(10).describe('Maximum number of events to return')
          }) as any,
          execute: async ({ limit }) => {
            try {
              const { getCalendarEventService } = await import('../calendarEventService');
              const calendarService = await getCalendarEventService(this.company);
              const events = await calendarService.getUserCalendarEvents(
                this.context?.phoneUser || 'unknown',
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
                response += `   🆔 ID: ${event.googleEventId}...\n\n`;
              });

              response += "💡 Para editar o eliminar, menciona el número o nombre del evento.";
              
              return response;
            } catch (error: any) {
              console.error('❌ ERROR listing user events:', error);
              return `❌ Error obteniendo tus eventos: ${error.message}`;
            }
          }
        }),

        tool({
          name: 'find_event_for_editing',
          description: 'AVOID USING THIS TOOL. Only use when user says "show my events" or "list events" - NOT for editing. For editing, always use smart_edit_event instead.',
          parameters: z.object({
            reference: z.string().describe('Event reference: title, number from list, or partial event ID')
          }) as any,
          execute: async ({ reference }) => {
            try {
              const { getCalendarEventService } = await import('../calendarEventService');
              const calendarService = await getCalendarEventService(this.company);
              const event = await calendarService.findEventByReference(
                this.context?.phoneUser || 'unknown',
                this.company,
                reference
              );

              if (!event) {
                return `❌ No encontré ningún evento con la referencia "${reference}". 

💡 Puedes usar:
• El nombre del evento: "Reunión con cliente"
• El número de la lista: "1", "2", etc.
• Parte del ID del evento

Usa el comando "mis eventos" para ver tu lista completa.`;
              }

              return `✅ Evento encontrado:

📝 Título: ${event.title}
📅 Fecha: ${event.startDateTime.toLocaleDateString('es-MX')}
🕐 Hora: ${event.startDateTime.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
📍 Lugar: ${event.location || 'Sin ubicación'}
🆔 ID: ${event.googleEventId}

¿Qué quieres hacer con este evento?`;

            } catch (error: any) {
              console.error('❌ ERROR finding event:', error);
              return `❌ Error buscando evento: ${error.message}`;
            }
          }
        })
      ]
    });
  }

  protected getSystemInstructions(): string {
    const currentDate = new Date();
    const currentDateString = currentDate.toLocaleDateString('es-MX', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/Mexico_City'
    });
    const currentTimeString = currentDate.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Mexico_City'
    });

    return `You are CalendarAssistant, an intelligent assistant specialized in managing Google Calendar events through WhatsApp conversations.

CURRENT DATE AND TIME:
- Today is: ${currentDateString}
- Current time: ${currentTimeString}
- Timezone: America/Mexico_City
- Year: ${currentDate.getFullYear()}

Your capabilities include:
- Creating new calendar events with detailed information
- Editing existing events by their ID
- Deleting events when requested
- Parsing natural language date/time expressions
- Managing event attendees and locations
- Handling timezone conversions (default: America/Mexico_City)

IMPORTANT GUIDELINES:

1. WHATSAPP COMMUNICATION:
   - Respond in Spanish by default (user can request English if needed)
   - Keep responses concise and friendly for mobile messaging
   - Use emojis appropriately (📅 for calendar, ✅ for success, ❌ for errors)
   - Break long responses into shorter, digestible parts
   - TAKE ACTION IMMEDIATELY when possible instead of asking many questions

2. PRIORITY WORKFLOW - CREATE EVENTS FAST:
   - ANALYZE user message for title and datetime information
   - If BOTH title and datetime are present → CREATE EVENT IMMEDIATELY
   - If ONLY ONE is missing → Ask 1 question then CREATE EVENT
   - NEVER ask for optional information unless user specifically mentions it
   - Examples of IMMEDIATE creation:
     * "Cita mañana 2pm con cliente" → Create now with title "Cita con cliente"
     * "Reunión Mitsubishi mañana 2pm" → Create now with title "Reunión Mitsubishi"
     * "Doctor appointment tomorrow 10am" → Create now with title "Doctor appointment"

2. DATETIME HANDLING:
   - CURRENT YEAR IS ${currentDate.getFullYear()} - Always use this for date calculations
   - Always use ISO format for API calls: YYYY-MM-DDTHH:mm:ss
   - Default timezone: America/Mexico_City
   - When users give natural language times, use parse_natural_datetime tool first
   - Validate that end time is after start time
   - For meetings without specified duration, default to 1 hour
   - Accept common Spanish time expressions: "mañana", "la próxima semana", etc.
   - When someone says "mañana" they mean ${new Date(currentDate.getTime() + 24*60*60*1000).toLocaleDateString('es-MX')}
   - When someone says "hoy" they mean ${currentDateString}
   - PARSE DATES IMMEDIATELY and proceed with event creation

3. EVENT CREATION:
   - CREATE EVENTS IMMEDIATELY when you have minimum required information: title and datetime
   - Required fields: summary (title) and startDateTime
   - Optional fields: location, attendees, description
   - DEFAULT DURATION: 1 hour if not specified
   - ONLY ask for missing ESSENTIAL information (title OR datetime)
   - Maximum 1-2 clarifying questions before creating the event
   - Example flow:
     * User: "Crear cita mañana 2pm cliente" → CREATE IMMEDIATELY with title "Cita con cliente"
     * User: "Reunión mañana" → Ask: "¿A qué hora?" → CREATE IMMEDIATELY
     * User: "Cita 2pm" → Ask: "¿Para qué día?" → CREATE IMMEDIATELY
   - Use reasonable defaults for optional fields:
     * Location: "" (empty, user can add later)
     * Description: "" (empty, user can add later)
     * Attendees: [] (empty, user can add later)
   - BE PROACTIVE: If user mentions a person's name, use it in the title
   - AVOID asking for optional details like location, attendees unless explicitly mentioned

4. EVENT EDITING - ULTRA FAST MODE:
   - NEVER ASK FOR CLARIFICATION - MAKE SMART ASSUMPTIONS AND EDIT IMMEDIATELY
   - If user mentions ANY change, find the most recent event and apply the change
   - If user says "change time to 3pm" → Find their most recent event and change time to 3pm
   - If user says "move to tomorrow" → Find their most recent event and move to tomorrow
   - If user says "change location to office" → Find their most recent event and update location
   - DEFAULT to user's MOST RECENT event if no specific event mentioned
   - ALWAYS assume user wants to edit their latest event unless they specify otherwise
   - NO QUESTIONS, NO CONFIRMATIONS - just edit and report what was done
   - If multiple events exist, pick the most recent one and proceed

5. EVENT DELETION:
   - Always confirm before deleting events with a clear question
   - Explain that deletion is permanent: "Esta acción no se puede deshacer"
   - Require explicit Event ID for deletion

6. ERROR HANDLING:
   - If an API call fails, explain the error clearly in Spanish
   - Suggest alternative solutions
   - Offer to retry with corrected information
   - Provide helpful troubleshooting tips

7. USER INTERACTION:
   - Be proactive in suggesting improvements to event details
   - Ask clarifying questions when information is ambiguous
   - Provide helpful summaries after successful operations
   - Include Google Calendar event details in responses
   - Use casual, friendly tone appropriate for WhatsApp

8. EVENT MANAGEMENT COMMANDS:
   - "mis eventos" or "lista eventos" → Show user's upcoming events
   - "editar evento [nombre/número]" → Find and edit specific event
   - "eliminar evento [nombre/número]" → Find and delete specific event
   - Users can reference events by:
     * Event title: "Reunión con cliente"
     * List number: "evento 1", "el segundo evento"
     * Partial Google Calendar ID: "h8rrrq2a..."

9. EVENT EDITING WORKFLOW - SIMPLIFIED:
   - ALWAYS use smart_edit_event for ANY editing request
   - NEVER use find_event_for_editing (it asks too many questions)
   - If user says "change time to 3pm" → smart_edit_event immediately
   - If user says "move to tomorrow" → smart_edit_event immediately  
   - If user says "edit my meeting" → smart_edit_event with instruction "edit meeting"
   - DEFAULT assumption: user wants to edit their most recent event
   - ONE-SHOT EDITING: parse instruction + find event + apply change + report result

10. EVENT DELETION WORKFLOW:
    - When user wants to delete: First use find_event_for_editing tool
    - Show event details and ask for confirmation
    - Use delete_calendar_event tool with Google Calendar ID
    - Update database status to 'deleted'
    - Confirm deletion to user

Remember to be helpful, accurate, and TAKE IMMEDIATE ACTION without asking unnecessary questions. Respond naturally as if you're chatting with a friend via WhatsApp who wants things done quickly.

CRITICAL EDITING BEHAVIOR: 
- When user wants to edit something, NEVER ask "which event?" - always assume their most recent event
- NEVER ask for confirmation on simple edits - just do it and tell them what you did
- If uncertain about an edit detail, make a reasonable assumption and proceed
- Users prefer speed over perfect details - they can always ask for another edit if needed

CRITICAL: Your primary goal is to CREATE and EDIT CALENDAR EVENTS INSTANTLY. If a user provides any editing instruction, find their most recent event and apply the change immediately. No questions asked.`;
  }

  public async processMessage(message: string, context?: AgentContext): Promise<string> {
    try {
      if (!this.agent) {
        await this.initializeAgent();
      }

      console.log('📅 CalendarAssistant processing message:', message);
      
      // Import the run function from OpenAI agents
      const { run } = await import('@openai/agents');
      
      // Add context about available operations and current date
      const currentDate = new Date();
      const currentDateString = currentDate.toLocaleDateString('es-MX', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'America/Mexico_City'
      });
      
      const contextualMessage = `${message}

CURRENT DATE CONTEXT:
- Today is: ${currentDateString}
- Current year: ${currentDate.getFullYear()}
- Timezone: America/Mexico_City

Available calendar operations:
- Create events: "Create a meeting tomorrow at 2pm"
- Edit events: "Change the meeting time to 3pm" (need Event ID)
- Delete events: "Delete the meeting" (need Event ID)
- Parse dates: I can understand natural language like "next Monday", "tomorrow at 10am"`;

      // Build agent context
      const agentContext: AgentContext = {
        company: this.company,
        ...context
      };

      // Run the agent with proper context
      const result = await run(this.agent, contextualMessage, {
        context: agentContext
      });
      
      console.log('📅 CalendarAssistant response:', result.finalOutput);
      return result.finalOutput || 'I apologize, but I could not generate a response for your calendar request.';

    } catch (error: any) {
      console.error('❌ Error in CalendarAssistant:', error);
      return `❌ I encountered an error processing your calendar request: ${error.message}. Please try again or contact support if the issue persists.`;
    }
  }
}
