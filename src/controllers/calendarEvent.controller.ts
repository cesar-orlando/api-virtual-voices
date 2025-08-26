import { Request, Response } from 'express';
import { getCalendarEventService } from '../services/google/calendarEventService';

/**
 * Get calendar events for a company
 * - If phoneUser is provided: get events for that specific user (Assistant agent use)
 * - If phoneUser is not provided: get all events for the company (front page use)
 */
export const getCalendarEvents = async (req: Request, res: Response): Promise<void> => {
  try {
    const { company } = req.params;
    const { phoneUser, limit = 50, fromDate, toDate, status = 'active' } = req.query;

    if (!company) {
      res.status(400).json({
        success: false,
        message: 'Company parameter is required'
      });
      return;
    }

    const calendarService = await getCalendarEventService(company);
    
    // Build options for filtering
    const options: any = {
      limit: parseInt(limit as string) || 50,
      status: status as string
    };
    
    if (fromDate) {
      options.fromDate = new Date(fromDate as string);
    }
    
    if (toDate) {
      options.toDate = new Date(toDate as string);
    }

    let events;
    let queryType;

    if (phoneUser) {
      // Get events for specific user (Assistant agent use case)
      events = await calendarService.getUserCalendarEvents(
        phoneUser as string,
        company,
        options
      );
      queryType = 'user-specific';
    } else {
      // Get all events for company (front page use case)
      events = await calendarService.getAllCompanyCalendarEvents(
        company,
        options
      );
      queryType = 'company-wide';
    }

    res.json({
      success: true,
      data: {
        events: events.map(event => ({
          dbId: event._id,
          googleEventId: event.googleEventId,
          phoneUser: event.phoneUser,
          title: event.title,
          description: event.description,
          startDateTime: event.startDateTime,
          endDateTime: event.endDateTime,
          location: event.location,
          attendees: event.attendees,
          status: event.status,
          userReference: event.userReference,
          googleCalendarUrl: event.googleCalendarUrl,
          createdVia: event.createdVia,
          createdAt: event.createdAt,
          updatedAt: event.updatedAt
        })),
        count: events.length,
        metadata: {
          queryType,
          company,
          phoneUser: phoneUser || 'all',
          filters: {
            status: options.status,
            fromDate: options.fromDate,
            toDate: options.toDate,
            limit: options.limit
          }
        }
      }
    });

  } catch (error: any) {
    console.error('❌ Error getting calendar events:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

/**
 * Get user's calendar events (backward compatibility)
 * @deprecated Use getCalendarEvents instead
 */
export const getUserCalendarEvents = async (req: Request, res: Response): Promise<void> => {
  // Redirect to the new unified endpoint
  return getCalendarEvents(req, res);
};

/**
 * Find event by reference
 */
export const findEventByReference = async (req: Request, res: Response): Promise<void> => {
  try {
    const { company } = req.params;
    const { phoneUser, reference } = req.query;

    if (!phoneUser || !reference) {
      res.status(400).json({
        success: false,
        message: 'Phone user and reference are required'
      });
      return;
    }

    if (!company) {
      res.status(400).json({
        success: false,
        message: 'Company parameter is required'
      });
      return;
    }

    const calendarService = await getCalendarEventService(company);
    const event = await calendarService.findEventByReference(
      phoneUser as string,
      company,
      reference as string
    );

    if (!event) {
      res.status(404).json({
        success: false,
        message: 'No event found matching the reference'
      });
      return;
    }

    res.json({
      success: true,
      data: {
        event: {
          dbId: event._id,
          googleEventId: event.googleEventId,
          title: event.title,
          description: event.description,
          startDateTime: event.startDateTime,
          endDateTime: event.endDateTime,
          location: event.location,
          attendees: event.attendees,
          status: event.status,
          userReference: event.userReference,
          googleCalendarUrl: event.googleCalendarUrl,
          createdAt: event.createdAt,
          updatedAt: event.updatedAt
        },
        searchTerm: reference
      }
    });

  } catch (error: any) {
    console.error('❌ Error finding event by reference:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};