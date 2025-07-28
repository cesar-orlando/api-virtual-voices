
import axios from "axios";

export const create_google_calendar_event = async (
  summary: string,
  startDateTime: string,
  endDateTime: string,
  description?: string,
  location?: string,
  attendeeEmails?: string[],
  timeZone: string = "America/Mexico_City"
): Promise<string> => {
  try {
    // Validar parámetros requeridos
    if (!summary || !startDateTime || !endDateTime) {
      console.log(`❌ Missing required parameters`);
      return "❌ Error: Se requiere al menos un título, fecha y hora de inicio y fin para crear el evento.";
    }

    // Validar formato de fechas
    const startDate = new Date(startDateTime);
    const endDate = new Date(endDateTime);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      console.log(`❌ Invalid date format`);
      return "❌ Error: Las fechas proporcionadas no tienen un formato válido. Usa formato ISO como '2025-07-25T10:00:00.000Z'.";
    }

    if (startDate >= endDate) {
      console.log(`❌ End date before start date`);
      return "❌ Error: La fecha de fin debe ser posterior a la fecha de inicio.";
    }

    // PASO 1: Obtener un access token fresco
    console.log('🔑 Step 1: Getting fresh access token...');
    
    let accessToken: string;
    try {
      const tokenResponse = await axios.post(
        'http://localhost:3001/api/google-calendar/get-access-token',
        {},
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      if (!tokenResponse.data.success) {
        throw new Error(`Token request failed: ${tokenResponse.data.message}`);
      }

      accessToken = tokenResponse.data.data.access_token;
      console.log(`✅ Fresh access token obtained: ${accessToken.substring(0, 30)}...`);
      
    } catch (tokenError: any) {
      console.error('❌ Failed to get fresh access token:', tokenError.message);
      return `❌ Error: No se pudo obtener un token de acceso válido. ${tokenError.message}`;
    }

    // PASO 2: Crear el evento en Google Calendar
    console.log('📅 Step 2: Creating event in Google Calendar...');
    
    const eventData = {
      summary,
      description: description || `Evento creado automáticamente: ${summary}`,
      start: {
        dateTime: startDate.toISOString(),
        timeZone
      },
      end: {
        dateTime: endDate.toISOString(),
        timeZone
      },
      location: location || "",
      attendees: attendeeEmails ? attendeeEmails.map(email => ({ email })) : []
    };

    console.log(`📤 Sending direct request to Google Calendar API:`, {
      url: 'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      headers: {
        'Authorization': `Bearer ${accessToken.substring(0, 30)}...`,
        'Content-Type': 'application/json'
      },
      data: eventData
    });

    // Crear evento directamente en Google Calendar API
    const calendarResponse = await axios.post(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      eventData,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    console.log(`📥 Response from Google Calendar API:`, {
      status: calendarResponse.status,
      eventId: calendarResponse.data.id,
      summary: calendarResponse.data.summary,
      htmlLink: calendarResponse.data.htmlLink
    });

    const event = calendarResponse.data;
    const startDateFormatted = new Date(event.start.dateTime).toLocaleString('es-MX', { 
      timeZone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    const endTimeFormatted = new Date(event.end.dateTime).toLocaleString('es-MX', { 
      timeZone,
      hour: '2-digit',
      minute: '2-digit'
    });

    return `✅ *¡Evento agendado exitosamente!*

📅 *${event.summary}*
📆 ${startDateFormatted}
⏰ Hasta las ${endTimeFormatted}
${event.location ? `📍 ${event.location}` : ''}
${event.description ? `📝 ${event.description}` : ''}

🔗 *Ver en Google Calendar:*
${event.htmlLink}

¡El evento ha sido añadido a tu calendario y recibirás recordatorios automáticamente! 📲`;

  } catch (error: any) {
    console.error("Error al crear evento en Google Calendar:", error);

    if (error.response?.status === 401) {
      return "❌ Error de autorización: El token de acceso no es válido o ha expirado.";
    }

    if (error.response?.status === 403) {
      return "❌ Error de permisos: No tienes acceso para crear eventos en este calendario.";
    }

    if (error.code === 'ECONNREFUSED') {
      return "❌ Error: No se pudo conectar al servicio de Google Calendar. Verifica la conexión.";
    }

    if (error.response?.data?.error?.message) {
      return `❌ Error de Google Calendar: ${error.response.data.error.message}`;
    }

    return `❌ Error inesperado al crear el evento: ${error.message}`;
  }
};