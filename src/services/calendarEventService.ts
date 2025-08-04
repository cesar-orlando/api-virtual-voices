import { Connection } from 'mongoose';
import getCalendarEventModel, { ICalendarEvent } from '../models/calendarEvent.model';
import { getConnectionByCompanySlug } from '../config/connectionManager';

export class CalendarEventService {
  private connection: Connection;
  private CalendarEvent: any;

  constructor(connection: Connection) {
    this.connection = connection;
    this.CalendarEvent = getCalendarEventModel(connection);
  }

  /**
   * Save a calendar event to database after successful Google Calendar creation
   */
  async saveCalendarEvent(eventData: {
    phoneUser: string;
    company: string;
    googleEventId: string;
    calendarId?: string;
    title: string;
    description?: string;
    startDateTime: Date;
    endDateTime: Date;
    location?: string;
    attendees?: string[];
    timeZone?: string;
    googleCalendarUrl?: string;
    userReference?: string;
  }): Promise<ICalendarEvent> {
    try {
      const calendarEvent = new this.CalendarEvent({
        ...eventData,
        status: 'active',
        createdVia: 'whatsapp'
      });
      console.log(eventData.company)

      await calendarEvent.save();
      console.log(`📅 Saved calendar event to database: ${eventData.title} (ID: ${eventData.googleEventId})`);
      
      return calendarEvent;
    } catch (error) {
      console.error('❌ Error saving calendar event to database:', error);
      throw error;
    }
  }

  /**
   * Get user's calendar events for listing/reference
   */
  async getUserCalendarEvents(phoneUser: string, company: string, options: any = {}): Promise<any[]> {
    try {
      const limit = options.limit || 10;
      const status = options.status || 'active';
      
      let query: any = { 
        phoneUser, 
        company, 
        status: status 
      };
      
      // Add date filtering if provided
      if (options.fromDate || options.toDate) {
        query.startDateTime = {};
        if (options.fromDate) {
          query.startDateTime.$gte = options.fromDate;
        }
        if (options.toDate) {
          query.startDateTime.$lte = options.toDate;
        }
      }

      const events = await this.CalendarEvent
        .find(query)
        .sort({ startDateTime: 1 })
        .limit(limit)
        .lean();

      return events.map((event: any, index: number) => ({
        ...event,
        dbId: event._id,
        reference: `${index + 1}. ${event.title}`,
        date: new Date(event.startDateTime).toLocaleDateString('es-MX'),
        time: new Date(event.startDateTime).toLocaleTimeString('es-MX', { 
          hour: '2-digit', 
          minute: '2-digit' 
        })
      }));
    } catch (error) {
      console.error('❌ Error getting user calendar events:', error);
      return [];
    }
  }

  /**
   * Get all calendar events for a company (for front page display)
   */
  async getAllCompanyCalendarEvents(company: string, options: any = {}): Promise<any[]> {
    try {
      const limit = options.limit || 50;
      const status = options.status || 'active';
      
      let query: any = { 
        company, 
        status: status 
      };
      
      // Add date filtering if provided
      if (options.fromDate || options.toDate) {
        query.startDateTime = {};
        if (options.fromDate) {
          query.startDateTime.$gte = options.fromDate;
        }
        if (options.toDate) {
          query.startDateTime.$lte = options.toDate;
        }
      }

      const events = await this.CalendarEvent
        .find(query)
        .sort({ startDateTime: 1 })
        .limit(limit)
        .lean();

      return events.map((event: any, index: number) => ({
        ...event,
        dbId: event._id,
        reference: `${index + 1}. ${event.title}`,
        date: new Date(event.startDateTime).toLocaleDateString('es-MX'),
        time: new Date(event.startDateTime).toLocaleTimeString('es-MX', { 
          hour: '2-digit', 
          minute: '2-digit' 
        }),
        // Add user-friendly display for phone user
        userDisplay: event.phoneUser.replace(/^\+?1?/, '').replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3')
      }));
    } catch (error) {
      console.error('❌ Error getting company calendar events:', error);
      return [];
    }
  }

  /**
   * Find event by user-friendly reference (title or number)
   */
  async findEventByReference(phoneUser: string, company: string, reference: string): Promise<ICalendarEvent | null> {
    try {
      // Try to find by exact title match first
      let event = await this.CalendarEvent.findOne({
        phoneUser,
        company,
        status: 'active',
        title: { $regex: reference, $options: 'i' }
      });

      // If not found and reference is a number, try to find by position
      if (!event && /^\d+$/.test(reference)) {
        const eventNumber = parseInt(reference) - 1;
        const events = await this.getUserCalendarEvents(phoneUser, company, 20);
        if (events[eventNumber]) {
          event = await this.CalendarEvent.findById(events[eventNumber].dbId);
        }
      }

      // Try to find by Google Event ID if it looks like one
      if (!event && reference.length > 10) {
        event = await this.CalendarEvent.findOne({
          phoneUser,
          company,
          status: 'active',
          googleEventId: reference
        });
      }

      return event;
    } catch (error) {
      console.error('❌ Error finding event by reference:', error);
      return null;
    }
  }

  /**
   * Update event status (for deletion or cancellation)
   */
  async updateEventStatus(googleEventId: string, status: 'cancelled' | 'deleted'): Promise<boolean> {
    try {
      const result = await this.CalendarEvent.updateOne(
        { googleEventId },
        { status, updatedAt: new Date() }
      );

      return result.modifiedCount > 0;
    } catch (error) {
      console.error('❌ Error updating event status:', error);
      return false;
    }
  }

  /**
   * Get event by Google Calendar ID
   */
  async getEventByGoogleId(googleEventId: string): Promise<ICalendarEvent | null> {
    try {
      return await this.CalendarEvent.findOne({ googleEventId, status: 'active' });
    } catch (error) {
      console.error('❌ Error getting event by Google ID:', error);
      return null;
    }
  }
}

/**
 * Factory function to get CalendarEventService for a company
 */
export async function getCalendarEventService(company: string): Promise<CalendarEventService> {
  const connection = await getConnectionByCompanySlug(company);
  return new CalendarEventService(connection);
}