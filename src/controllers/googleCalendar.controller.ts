import { Request, Response } from "express";
import { getValidGoogleToken, forceRefreshGoogleToken, tokenManager } from "../services/google/tokenManager";

/**
 * Get Google OAuth authorization URL
 */
export const getAuthUrl = async (req: Request, res: Response): Promise<void> => {
  try {
    const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/auth/google/callback';
    
    if (!clientId) {
      res.status(500).json({
        success: false,
        message: "Google Calendar client ID not configured",
        error: "Missing GOOGLE_CALENDAR_CLIENT_ID environment variable"
      });
      return;
    }

    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events'
    ].join(' ');

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);

    res.status(200).json({
      success: true,
      message: "Google OAuth URL generated successfully",
      authUrl: authUrl.toString(),
      instructions: [
        "1. Open the authUrl in your browser",
        "2. Sign in with your Google account",
        "3. Grant calendar permissions",
        "4. Copy the 'code' parameter from the callback URL",
        "5. Use the code with POST /api/google/calendar/exchange-token"
      ]
    });

  } catch (error: any) {
    console.error('🚨 Error generating auth URL:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error while generating auth URL",
      error: error.message
    });
  }
};

/**
 * Exchange authorization code for access and refresh tokens
 */
export const exchangeCodeForTokens = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code } = req.body;
    
    if (!code) {
      res.status(400).json({
        success: false,
        message: "Authorization code is required",
        required: ["code"]
      });
      return;
    }

    const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/auth/google/callback';

    if (!clientId || !clientSecret) {
      res.status(500).json({
        success: false,
        message: "Google Calendar credentials not configured",
        error: "Missing GOOGLE_CALENDAR_CLIENT_ID or GOOGLE_CALENDAR_CLIENT_SECRET environment variables"
      });
      return;
    }

    const tokenRequestBody = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    });

    console.log('📤 Exchanging authorization code for tokens...');

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: tokenRequestBody.toString()
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error('❌ Google OAuth API Error:', responseData);
      res.status(response.status).json({
        success: false,
        message: "Failed to exchange authorization code for tokens",
        error: responseData.error_description || responseData.error || 'Unknown error',
        details: responseData
      });
      return;
    }

    // Calculate expiry time
    const expiresAt = Date.now() + (responseData.expires_in * 1000);
    const expiresAtDate = new Date(expiresAt);

    res.status(200).json({
      success: true,
      message: "Access token obtained successfully",
      tokens: {
        access_token: responseData.access_token,
        refresh_token: responseData.refresh_token,
        scope: responseData.scope,
        token_type: responseData.token_type,
        expires_in: responseData.expires_in,
        expiry_date: expiresAt,
        expires_at: expiresAtDate.toISOString()
      },
      instructions: {
        access_token_usage: "Use the access_token in the 'accessToken' header for API requests",
        refresh_token_usage: "Save the refresh_token to environment variable GOOGLE_CALENDAR_REFRESH_TOKEN for automatic token refresh",
        expiry: `Access token expires at ${expiresAtDate.toISOString()}`
      }
    });

  } catch (error: any) {
    console.error('🚨 Error exchanging code for tokens:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error while exchanging code for tokens",
      error: error.message
    });
  }
};

/**
 * Get fresh access token using client credentials from environment
 * This endpoint uses the token manager to get a fresh access token
 */
export const getAccessTokenWithCredentials = async (req: Request, res: Response): Promise<void> => {
  try {
    // Use the token manager to get a fresh token
    const accessToken = await forceRefreshGoogleToken();
    const tokenInfo = tokenManager.getTokenInfo();

    res.status(200).json({
      success: true,
      message: "Successfully obtained new access token",
      data: {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_at: tokenInfo.expires_at,
        expires_in_seconds: tokenInfo.expires_in_seconds,
        expires_in_minutes: tokenInfo.expires_in_minutes,
        status: tokenInfo.status
      },
      instructions: {
        usage: "Use the access_token in Authorization header as 'Bearer YOUR_ACCESS_TOKEN'",
        expiry: `Token expires at ${tokenInfo.expires_at}`,
        autoRefresh: "Token is automatically managed and refreshed when needed by calendar operations"
      }
    });

  } catch (error: any) {
    console.error('🚨 Error getting access token:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error while getting access token",
      error: error.message
    });
  }
};

/**
 * Get current token status and information
 */
export const getTokenStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const tokenInfo = tokenManager.getTokenInfo();
    
    res.status(200).json({
      success: true,
      message: "Token status retrieved successfully",
      data: tokenInfo
    });

  } catch (error: any) {
    console.error('🚨 Error getting token status:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error while getting token status",
      error: error.message
    });
  }
};

/**
 * Ensure we have a valid token, refreshing if necessary
 */
export const ensureValidToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const accessToken = await getValidGoogleToken();
    const tokenInfo = tokenManager.getTokenInfo();
    
    res.status(200).json({
      success: true,
      message: "Valid token ensured",
      data: {
        has_valid_token: true,
        token_info: tokenInfo,
        access_token: accessToken.substring(0, 20) + '...' // Partial token for verification
      }
    });

  } catch (error: any) {
    console.error('🚨 Error ensuring valid token:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error while ensuring valid token",
      error: error.message
    });
  }
};

/**
 * Create a new Google Calendar event
 */
export const createCalendarEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      summary, 
      description, 
      startDateTime, 
      endDateTime, 
      //timeZone = 'America/Mexico_City',
      attendees = [],
      location,
      calendarId = 'primary'
    } = req.body;

    // Validate required fields
    if (!summary || !startDateTime || !endDateTime) {
      res.status(400).json({
        success: false,
        message: "Missing required fields",
        required: ["summary", "startDateTime", "endDateTime"]
      });
      return;
    }

    // Validate date format
    const isValidDate = (dateString: string) => {
      try {
        const date = new Date(dateString);
        return !isNaN(date.getTime());
      } catch {
        return false;
      }
    };

    if (!isValidDate(startDateTime) || !isValidDate(endDateTime)) {
      res.status(400).json({
        success: false,
        message: "Invalid date format. Use ISO 8601 format (YYYY-MM-DDTHH:mm:ss or YYYY-MM-DD HH:mm:ss)",
        example: "2025-07-29T10:00:00 or 2025-07-29 10:00:00"
      });
      return;
    }

    // Validate that end time is after start time
    if (new Date(startDateTime) >= new Date(endDateTime)) {
      res.status(400).json({
        success: false,
        message: "End time must be after start time"
      });
      return;
    }

    // Get access token using token manager
    const accessToken = await getValidGoogleToken();

    console.log(`📅 Creating calendar event: ${summary} with start ${startDateTime} and end ${endDateTime}`);

    // Prepare event data
    const eventData: any = {
      summary,
      start: {
        dateTime: startDateTime,
        timeZone: 'America/Mexico_City'
      },
      end: {
        dateTime: endDateTime,
        timeZone: 'America/Mexico_City'
      }
    };

    // Only add optional fields if they have values
    if (description) eventData.description = description;
    if (location) eventData.location = location;
    if (attendees && attendees.length > 0) {
      // Validate email addresses before adding them
      const validEmails = attendees.filter((email: string) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
      });
      
      if (validEmails.length > 0) {
        eventData.attendees = validEmails.map((email: string) => ({ 
          email: email.trim(),
          responseStatus: 'needsAction'
        }));
      }
    }

    // Ensure proper visibility and transparency settings
    eventData.visibility = 'default';
    eventData.transparency = 'opaque';

    console.log('📅 Creating Google Calendar event:', summary);

    // Create the event
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(eventData)
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error('❌ Google Calendar API Error:', responseData);
      res.status(response.status).json({
        success: false,
        message: "Failed to create calendar event",
        error: responseData.error?.message || 'Unknown error',
        details: responseData,
        sentData: eventData
      });
      return;
    }

    // Generate alternative URL formats for better compatibility
    const primaryUrl = responseData.htmlLink;
    const alternativeUrl = `https://calendar.google.com/calendar/event?eid=${responseData.id}`;
    const calendarUrl = `https://calendar.google.com/calendar/u/0/r/eventedit/${responseData.id}`;

    res.status(201).json({
      success: true,
      message: "Calendar event created successfully",
      data: {
        eventId: responseData.id,
        htmlLink: primaryUrl,
        alternativeUrl: alternativeUrl,
        editUrl: calendarUrl,
        summary: responseData.summary,
        start: responseData.start,
        end: responseData.end,
        created: responseData.created,
        status: responseData.status,
        attendees: responseData.attendees || [],
        visibility: responseData.visibility,
        transparency: responseData.transparency
      },
      debug: {
        calendarId: calendarId,
        originalRequest: {
          summary,
          startDateTime,
          endDateTime,
          attendees: attendees || []
        }
      }
    });

  } catch (error: any) {
    console.error('🚨 Error creating calendar event:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error while creating calendar event",
      error: error.message
    });
  }
};

/**
 * Edit an existing Google Calendar event
 */
export const editCalendarEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { eventId } = req.params;
    const { 
      summary, 
      description, 
      startDateTime, 
      endDateTime, 
      timeZone = 'America/Mexico_City',
      attendees = [],
      location,
      calendarId = 'primary'
    } = req.body;

    if (!eventId) {
      res.status(400).json({
        success: false,
        message: "Event ID is required"
      });
      return;
    }

    // Get access token using token manager
    const accessToken = await getValidGoogleToken();

    // Robust date time formatting function (same as create function)
    const formatDateTime = (dateTime: string, defaultTimeZone: string = 'America/Mexico_City') => {
      try {
        // Check if the input already has timezone information
        const hasTimezone = dateTime.includes('Z') || dateTime.includes('+') || dateTime.includes('-', 10);
        
        if (hasTimezone) {
          // Input already has timezone, use as-is
          const date = new Date(dateTime);
          if (isNaN(date.getTime())) {
            throw new Error(`Invalid date: ${dateTime}`);
          }
          return date.toISOString();
        }
        
        // Input is timezone-naive, treat as local time in the specified timezone
        let dateTimeForParsing = dateTime;
        
        // Normalize the format for parsing
        if (dateTime.includes(' ')) {
          // Convert "2025-08-03 23:00:00" to "2025-08-03T23:00:00"
          dateTimeForParsing = dateTime.replace(' ', 'T');
        } else if (dateTime.match(/^\d{4}-\d{2}-\d{2}$/)) {
          // Date only format: 2025-08-03 (default to noon to avoid timezone issues)
          dateTimeForParsing = dateTime + 'T12:00:00';
        }
        
        // Parse the date components
        const match = dateTimeForParsing.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
        if (!match) {
          throw new Error(`Invalid date format: ${dateTimeForParsing}`);
        }
        
        const [, year, month, day, hour, minute, second] = match;
        
        // Create a date in the target timezone using local interpretation
        // This approach treats the input as if it's already in the target timezone
        const localDate = new Date(
          parseInt(year), 
          parseInt(month) - 1, // JavaScript months are 0-indexed
          parseInt(day), 
          parseInt(hour), 
          parseInt(minute), 
          parseInt(second)
        );
        
        // Convert to ISO string (this will be in the local system timezone)
        return localDate.toISOString();
        
      } catch (error) {
        console.error(`❌ Error formatting date "${dateTime}":`, error);
        throw new Error(`Invalid date format: ${dateTime}. Please use YYYY-MM-DD HH:mm:ss or ISO 8601 format.`);
      }
    };

    // Prepare updated event data (only include fields that are provided)
    const eventData: any = {};
    
    if (summary) eventData.summary = summary;
    if (description) eventData.description = description;
    if (location) eventData.location = location;
    if (startDateTime) eventData.start = { dateTime: formatDateTime(startDateTime, timeZone), timeZone };
    if (endDateTime) eventData.end = { dateTime: formatDateTime(endDateTime, timeZone), timeZone };
    if (attendees && attendees.length > 0) {
      eventData.attendees = attendees.map((email: string) => ({ email }));
    }

    // Update the event
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(eventData)
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error('❌ Google Calendar API Error:', responseData);
      res.status(response.status).json({
        success: false,
        message: "Failed to update calendar event",
        error: responseData.error?.message || 'Unknown error',
        details: responseData
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Calendar event updated successfully",
      data: {
        eventId: responseData.id,
        htmlLink: responseData.htmlLink,
        summary: responseData.summary,
        start: responseData.start,
        end: responseData.end,
        updated: responseData.updated,
        status: responseData.status
      }
    });

  } catch (error: any) {
    console.error('🚨 Error updating calendar event:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error while updating calendar event",
      error: error.message
    });
  }
};

/**
 * Delete a Google Calendar event
 */
export const deleteCalendarEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { eventId } = req.params;
    const { calendarId = 'primary' } = req.query;

    if (!eventId) {
      res.status(400).json({
        success: false,
        message: "Event ID is required"
      });
      return;
    }

    // Get access token using token manager
    const accessToken = await getValidGoogleToken();

    // Delete the event
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const responseData = await response.json().catch(() => ({}));
      console.error('❌ Google Calendar API Error:', responseData);
      res.status(response.status).json({
        success: false,
        message: "Failed to delete calendar event",
        error: responseData.error?.message || 'Unknown error',
        details: responseData
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Calendar event deleted successfully",
      data: {
        eventId,
        deleted: true
      }
    });

  } catch (error: any) {
    console.error('🚨 Error deleting calendar event:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error while deleting calendar event",
      error: error.message
    });
  }
}
