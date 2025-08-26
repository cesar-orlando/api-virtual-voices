import { Connection } from 'mongoose';
import getCalendarEventModel, { ICalendarEvent } from '../../models/calendarEvent.model';
import { getConnectionByCompanySlug } from '../../config/connectionManager';

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
   * Find event by user-friendly reference (title or number) with enhanced search
   */
  async findEventByReference(phoneUser: string, company: string, reference: string): Promise<ICalendarEvent | null> {
    try {
      // Early return for empty reference
      if (!reference || reference.trim() === '') {
        return null;
      }

      const trimmedRef = reference.trim();
      
      // Handle position number reference first (most specific)
      if (/^\d+$/.test(trimmedRef)) {
        const eventNumber = parseInt(trimmedRef) - 1;
        if (eventNumber >= 0) {
          const events = await this.getUserCalendarEvents(phoneUser, company, eventNumber + 1);
          return events[eventNumber] ? await this.CalendarEvent.findById(events[eventNumber].dbId) : null;
        }
      }

      // Handle date reference
      if (this.isDateLike(trimmedRef)) {
        const parsedDate = this.parseDate(trimmedRef);
        if (parsedDate) {
          return await this.CalendarEvent.findOne({
            phoneUser,
            company,
            status: 'active',
            startDateTime: {
              $gte: new Date(parsedDate.setHours(0, 0, 0, 0)),
              $lt: new Date(parsedDate.setHours(23, 59, 59, 999))
            }
          }).sort({ startDateTime: 1 });
        }
      }

      // Build a comprehensive query with OR conditions for text-based searches
      const searchQueries = [];
      
      // Exact title match (highest priority)
      searchQueries.push({ title: { $regex: `^${this.escapeRegex(trimmedRef)}$`, $options: 'i' } });
      
      // Partial title match
      searchQueries.push({ title: { $regex: this.escapeRegex(trimmedRef), $options: 'i' } });
      
      // Google Event ID match (if it looks like one)
      if (trimmedRef.length > 10) {
        searchQueries.push({ googleEventId: trimmedRef });
      }
      
      // Location match
      searchQueries.push({ location: { $regex: this.escapeRegex(trimmedRef), $options: 'i' } });

      // Execute single query with OR conditions, ordered by relevance
      const events = await this.CalendarEvent.find({
        phoneUser,
        company,
        status: 'active',
        $or: searchQueries
      }).limit(5); // Limit to prevent excessive results

      if (events.length === 0) {
        return null;
      }

      // If multiple results, prioritize by match type
      // 1. Exact title match
      for (const event of events) {
        if (event.title && event.title.toLowerCase() === trimmedRef.toLowerCase()) {
          return event;
        }
      }

      // 2. Google Event ID match
      for (const event of events) {
        if (event.googleEventId === trimmedRef) {
          return event;
        }
      }

      // 3. Title starts with reference
      for (const event of events) {
        if (event.title && event.title.toLowerCase().startsWith(trimmedRef.toLowerCase())) {
          return event;
        }
      }

      // 4. Return first partial match
      return events[0];

    } catch (error) {
      console.error('❌ Error finding event by reference:', error);
      return null;
    }
  }

  /**
   * Helper method to escape regex special characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Get the most recent event for a user (useful for "edit my event" commands)
   */
  async getMostRecentEvent(phoneUser: string): Promise<ICalendarEvent | null> {
    try {
      return await this.CalendarEvent.findOne({
        phoneUser,
        status: 'active'
      }).sort({ createdAt: -1 });
    } catch (error) {
      console.error('❌ Error getting most recent event:', error);
      return null;
    }
  }

  /**
   * Helper method to check if string looks like a date
   */
  private isDateLike(str: string): boolean {
    const datePatterns = [
      /\d{1,2}\/\d{1,2}\/\d{4}/,  // MM/DD/YYYY
      /\d{4}-\d{1,2}-\d{1,2}/,    // YYYY-MM-DD
      /(today|hoy|tomorrow|mañana|yesterday|ayer)/i
    ];
    return datePatterns.some(pattern => pattern.test(str));
  }

  /**
   * Helper method to parse natural language dates
   */
  private parseDate(str: string): Date | null {
    const today = new Date();
    
    if (str.toLowerCase().includes('today') || str.toLowerCase().includes('hoy')) {
      return today;
    }
    
    if (str.toLowerCase().includes('tomorrow') || str.toLowerCase().includes('mañana')) {
      return new Date(today.getTime() + 24 * 60 * 60 * 1000);
    }
    
    if (str.toLowerCase().includes('yesterday') || str.toLowerCase().includes('ayer')) {
      return new Date(today.getTime() - 24 * 60 * 60 * 1000);
    }
    
    // Try to parse as regular date
    const parsed = new Date(str);
    return isNaN(parsed.getTime()) ? null : parsed;
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
   * Update calendar event details in database
   */
  async updateCalendarEvent(googleEventId: string, updateData: {
    title?: string;
    description?: string;
    startDateTime?: Date;
    endDateTime?: Date;
    location?: string;
    attendees?: string[];
    timeZone?: string;
  }): Promise<boolean> {
    try {
      const updateFields: any = {
        updatedAt: new Date()
      };

      // Only update provided fields
      if (updateData.title !== undefined) updateFields.title = updateData.title;
      if (updateData.description !== undefined) updateFields.description = updateData.description;
      if (updateData.startDateTime !== undefined) updateFields.startDateTime = updateData.startDateTime;
      if (updateData.endDateTime !== undefined) updateFields.endDateTime = updateData.endDateTime;
      if (updateData.location !== undefined) updateFields.location = updateData.location;
      if (updateData.attendees !== undefined) updateFields.attendees = updateData.attendees;
      if (updateData.timeZone !== undefined) updateFields.timeZone = updateData.timeZone;

      const result = await this.CalendarEvent.updateOne(
        { googleEventId, status: 'active' },
        updateFields
      );

      return result.modifiedCount > 0;
    } catch (error) {
      console.error('❌ Error updating calendar event in database:', error);
      return false;
    }
  }

  /**
   * Get event by Google Calendar ID
   */
  async getEventByGoogleId(googleEventId: string): Promise<ICalendarEvent | null> {
    try {
      // This will automatically update expired events due to pre-find middleware
      return await this.CalendarEvent.findOne({ googleEventId, status: { $ne: 'deleted' } });
    } catch (error) {
      console.error('❌ Error getting event by Google ID:', error);
      return null;
    }
  }

  /**
   * Manually update all expired events to inactive status
   */
  async updateExpiredEvents(): Promise<number> {
    try {
      return await this.CalendarEvent.updateExpiredEvents();
    } catch (error) {
      console.error('❌ Error updating expired events:', error);
      return 0;
    }
  }

  /**
   * Get active events for a user (automatically excludes expired ones)
   */
  async getActiveEvents(phoneUser: string, company: string): Promise<ICalendarEvent[]> {
    try {
      // Pre-find middleware will automatically update expired events
      return await this.CalendarEvent.find({ 
        phoneUser, 
        company, 
        status: 'active' 
      }).sort({ startDateTime: 1 });
    } catch (error) {
      console.error('❌ Error getting active events:', error);
      return [];
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