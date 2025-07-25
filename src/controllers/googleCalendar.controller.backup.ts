import { Request, Response } from "express";
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { executeQuickLearningWithReconnection } from "../config/connectionManager";
import getUserModel from "../core/users/user.model";

// Interface for stored token data
interface StoredTokens {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
  token_type?: string;
  scope?: string;
}

// Enhanced Calendar Client with automatic token refresh
const getCalendarClientWithRefresh = async (email: string): Promise<{ calendar: any; oauth2Client: OAuth2Client }> => {
  const oauth2Client = new OAuth2Client(
    process.env.GOOGLE_CALENDAR_CLIENT_ID,
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  try {
    // Get stored tokens from database
    const tokens = await getStoredTokens(email);
    if (!tokens) {
      throw new Error("No tokens found for user. Please authorize first.");
    }

    // Set credentials
    oauth2Client.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date
    });

    // Check if token is expired or about to expire (within 5 minutes)
    const now = Date.now();
    const expiryTime = tokens.expiry_date || 0;
    const fiveMinutesFromNow = now + (5 * 60 * 1000);

    if (expiryTime < fiveMinutesFromNow && tokens.refresh_token) {
      console.log("🔄 Access token expired or expiring soon, refreshing...");
      
      // Refresh the token
      const { credentials } = await oauth2Client.refreshAccessToken();
      
      // Update stored tokens with new access token
      const updatedTokens: StoredTokens = {
        access_token: credentials.access_token!,
        refresh_token: credentials.refresh_token || tokens.refresh_token,
        expiry_date: credentials.expiry_date,
        token_type: credentials.token_type,
        scope: credentials.scope
      };
      
      // Save updated tokens
      await saveTokens(email, updatedTokens);
      console.log("✅ Access token refreshed successfully");
      
      // Update OAuth client with new credentials
      oauth2Client.setCredentials(credentials);
    }

    return {
      calendar: google.calendar({ version: "v3", auth: oauth2Client }),
      oauth2Client
    };

  } catch (error: any) {
    console.error("❌ Error setting up calendar client:", error);
    
    if (error.message.includes('invalid_grant') || error.message.includes('refresh_token')) {
      throw new Error("Refresh token is invalid or expired. Please re-authorize the application.");
    }
    
    throw new Error(`Failed to initialize calendar client: ${error.message}`);
  }
};

// Legacy function for backward compatibility (when using Bearer tokens)
const getCalendarClient = (accessToken: string) => {
  const oauth2Client = new OAuth2Client(
    process.env.GOOGLE_CALENDAR_CLIENT_ID,
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    access_token: accessToken,
  });

  return google.calendar({ version: "v3", auth: oauth2Client });
};

// Helper function to get stored tokens from database
const getStoredTokens = async (email: string): Promise<StoredTokens | null> => {
  try {
    // First try to get tokens from database
    const dbTokens = await executeQuickLearningWithReconnection(async (conn) => {
      const UserModel = getUserModel(conn);
      const user = await UserModel.findOne({ email: email });
      if (user && user.metadata?.googleCalendarTokens) {
        return user.metadata.googleCalendarTokens as StoredTokens;
      }
      return null;
    });

    // If found in database, return them
    if (dbTokens) {
      console.log(`🔑 Using stored tokens from database for: ${email}`);
      return dbTokens;
    }

    // Fallback to environment variables if available
    if (process.env.GOOGLE_CALENDAR_ACCESS_TOKEN && process.env.GOOGLE_CALENDAR_REFRESH_TOKEN) {
      console.log(`🔑 Using tokens from environment variables for: ${email}`);
      return {
        access_token: process.env.GOOGLE_CALENDAR_ACCESS_TOKEN,
        refresh_token: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN,
        expiry_date: Date.now() + (8 * 60 * 60 * 1000), // Set expiry to 8 hours from now as default
        token_type: 'Bearer',
        scope: 'https://www.googleapis.com/auth/calendar'
      };
    }

    console.log(`❌ No tokens found for ${email} in database or environment variables`);
    return null;
  } catch (error) {
    console.error("Error retrieving stored tokens:", error);
    return null;
  }
};

// Helper function to save tokens to database
const saveTokens = async (email: string, tokens: StoredTokens): Promise<void> => {
  try {
    await executeQuickLearningWithReconnection(async (conn) => {
      const UserModel = getUserModel(conn);
      await UserModel.findOneAndUpdate(
        { email: email },
        { 
          $set: { 
            "metadata.googleCalendarTokens": tokens,
            "metadata.googleCalendarLastRefresh": new Date()
          }
        },
        { upsert: true, new: true }
      );
    });
  } catch (error) {
    console.error("Error saving tokens:", error);
    throw error;
  }
};

// Interface for calendar event data
interface CalendarEventData {
  summary: string;
  description?: string;
  startDateTime: string;
  endDateTime: string;
  timeZone?: string;
  attendeeEmails?: string[];
  location?: string;
}

/**
 * Create a new Google Calendar event with automatic token refresh
 * Uses stored tokens and refreshes them automatically if needed
 */
export const createCalendarEventWithAutoToken = async (req: Request, res: Response) => {
  try {
    console.log('\n🎯🎯🎯 GOOGLE CALENDAR API ENDPOINT HIT! 🎯🎯🎯');
    console.log('='.repeat(60));
    console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
    console.log(`📍 Endpoint: POST /api/google-calendar/events-with-auto-token`);
    console.log(`🌐 Called from WhatsApp handler via OpenAI tool`);
    console.log('='.repeat(60));

    // Get email from header or use default
    const email = req.headers['x-user-email'] as string || 
                  process.env.GOOGLE_CALENDAR_DEFAULT_EMAIL;

    console.log(`📧 Email for calendar access: ${email}`);
    console.log(`📝 Request body:`, req.body);
    console.log(`🔑 Headers:`, {
      'x-user-email': req.headers['x-user-email'],
      'content-type': req.headers['content-type']
    });

    if (!email) {
      console.log(`❌ No email provided for Google Calendar access`);
      res.status(400).json({
        success: false,
        message: "User email is required in X-User-Email header or GOOGLE_CALENDAR_DEFAULT_EMAIL environment variable"
      });
      return;
    }

    const {
      summary,
      description,
      startDateTime,
      endDateTime,
      timeZone = "America/Mexico_City",
      attendeeEmails = [],
      location
    }: CalendarEventData = req.body;

    // Validate required fields
    if (!summary || !startDateTime || !endDateTime) {
      res.status(400).json({
        success: false,
        message: "Summary, startDateTime, and endDateTime are required"
      });
      return;
    }

    // Get calendar client with automatic token refresh
    console.log(`🔧 Getting calendar client with auto-refresh for: ${email}`);
    const { calendar } = await getCalendarClientWithRefresh(email);
    console.log(`✅ Calendar client obtained successfully`);

    // Parse dates
    const startDate = new Date(startDateTime);
    const endDate = new Date(endDateTime);

    // Validate dates
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      console.log(`❌ Invalid date format provided`);
      res.status(400).json({
        success: false,
        message: "Invalid date format. Use ISO 8601 format (e.g., '2024-07-25T10:00:00.000Z')"
      });
      return;
    }

    if (startDate >= endDate) {
      console.log(`❌ Start date is not before end date`);
      res.status(400).json({
        success: false,
        message: "Start date must be before end date"
      });
      return;
    }

    // Format attendees
    const attendees = attendeeEmails.map(email => ({ email }));

    // Create event object
    const event = {
      summary,
      description,
      location,
      start: {
        dateTime: startDate.toISOString(),
        timeZone,
      },
      end: {
        dateTime: endDate.toISOString(),
        timeZone,
      },
      attendees: attendees.length > 0 ? attendees : undefined,
      reminders: {
        useDefault: false,
        overrides: [
          { method: "email", minutes: 24 * 60 }, // 1 day before
          { method: "popup", minutes: 10 }, // 10 minutes before
        ],
      },
    };

    console.log(`📅 Creating calendar event:`, {
      summary,
      startDateTime: startDate.toISOString(),
      endDateTime: endDate.toISOString(),
      timeZone,
      location,
      attendeesCount: attendees.length
    });

    // Create the event
    console.log(`🚀 Calling Google Calendar API to create event...`);
    const response = await calendar.events.insert({
      calendarId: "primary",
      requestBody: event,
      sendUpdates: "all", // Send email notifications to attendees
    });

    console.log(`✅ Calendar event created successfully!`);
    console.log(`🔗 Event ID: ${response.data.id}`);
    console.log(`🌐 Event URL: ${response.data.htmlLink}`);

    res.status(201).json({
      success: true,
      message: "Calendar event created successfully with auto-refresh",
      event: {
        id: response.data.id,
        htmlLink: response.data.htmlLink,
        summary: response.data.summary,
        description: response.data.description,
        location: response.data.location,
        start: response.data.start,
        end: response.data.end,
        attendees: response.data.attendees,
        created: response.data.created,
        updated: response.data.updated,
        status: response.data.status
      }
    });

  } catch (error: any) {
    console.error("Error creating calendar event with auto-token:", error);

    // Handle token-related errors
    if (error.message.includes('No tokens found') || error.message.includes('authorize first')) {
      res.status(401).json({
        success: false,
        message: "No authorization found. Please complete OAuth flow first.",
        authUrl: `${req.protocol}://${req.get('host')}/api/google-calendar/auth-url`
      });
      return;
    }

    if (error.message.includes('Refresh token is invalid')) {
      res.status(401).json({
        success: false,
        message: "Refresh token expired. Please re-authorize the application.",
        authUrl: `${req.protocol}://${req.get('host')}/api/google-calendar/auth-url`
      });
      return;
    }

    if (error.code === 403) {
      res.status(403).json({
        success: false,
        message: "Insufficient permissions. Please ensure you granted calendar access."
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: "Error creating calendar event",
      error: error.message
    });
  }
};

/**
 * Get user's stored token info (without exposing the actual tokens)
 */
export const getTokenInfo = async (req: Request, res: Response) => {
  try {
    const { email } = req.query;

    if (!email) {
      res.status(400).json({
        success: false,
        message: "Email parameter is required"
      });
      return;
    }

    const tokens = await getStoredTokens(email as string);
    
    if (!tokens) {
      res.status(404).json({
        success: false,
        message: "No stored tokens found for this email",
        authUrl: `${req.protocol}://${req.get('host')}/api/google-calendar/auth-url`
      });
      return;
    }

    // Return info without exposing actual tokens
    res.status(200).json({
      success: true,
      message: "Tokens found",
      tokenInfo: {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        tokenType: tokens.token_type,
        scope: tokens.scope,
        isExpired: tokens.expiry_date ? Date.now() > tokens.expiry_date : false
      }
    });

  } catch (error: any) {
    console.error("Error getting token info:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving token information",
      error: error.message
    });
  }
};

/**
 * Create a new Google Calendar event (legacy method with Bearer token)
 */
export const createCalendarEvent = async (req: Request, res: Response) => {
  try {
    // Extract access token from Authorization header (Bearer token)
    const authHeader = req.headers.authorization;
    const accessToken = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7) // Remove 'Bearer ' prefix
      : null;

    const {
      summary,
      description,
      startDateTime,
      endDateTime,
      timeZone = "America/Mexico_City",
      attendeeEmails = [],
      location
    }: CalendarEventData = req.body;

    // Validate required fields
    if (!accessToken) {
      res.status(400).json({
        success: false,
        message: "Access token is required. Please provide it as: Authorization: Bearer YOUR_TOKEN"
      });
      return;
    }

    if (!summary || !startDateTime || !endDateTime) {
      res.status(400).json({
        success: false,
        message: "Summary, startDateTime, and endDateTime are required"
      });
      return;
    }

    // Validate date format
    const startDate = new Date(startDateTime);
    const endDate = new Date(endDateTime);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      res.status(400).json({
        success: false,
        message: "Invalid date format. Use ISO 8601 format (e.g., '2024-07-24T14:00:00.000Z')"
      });
      return;
    }

    if (startDate >= endDate) {
      res.status(400).json({
        success: false,
        message: "End time must be after start time"
      });
      return;
    }

    // Initialize Google Calendar client
    const calendar = getCalendarClient(accessToken as string);

    // Prepare attendees list
    const attendees = attendeeEmails.map(email => ({ email }));

    // Create event object
    const event = {
      summary,
      description,
      location,
      start: {
        dateTime: startDate.toISOString(),
        timeZone,
      },
      end: {
        dateTime: endDate.toISOString(),
        timeZone,
      },
      attendees: attendees.length > 0 ? attendees : undefined,
      reminders: {
        useDefault: false,
        overrides: [
          { method: "email", minutes: 24 * 60 }, // 1 day before
          { method: "popup", minutes: 10 }, // 10 minutes before
        ],
      },
    };

    // Create the event
    const response = await calendar.events.insert({
      calendarId: "primary",
      requestBody: event,
      sendUpdates: "all", // Send email notifications to attendees
    });

    res.status(201).json({
      success: true,
      message: "Calendar event created successfully",
      event: {
        id: response.data.id,
        htmlLink: response.data.htmlLink,
        summary: response.data.summary,
        description: response.data.description,
        location: response.data.location,
        start: response.data.start,
        end: response.data.end,
        attendees: response.data.attendees,
        created: response.data.created,
        updated: response.data.updated,
        status: response.data.status
      }
    });

  } catch (error: any) {
    console.error("Error creating calendar event:", error);

    // Handle specific Google API errors
    if (error.code === 401) {
      res.status(401).json({
        success: false,
        message: "Invalid or expired access token"
      });
      return;
    }

    if (error.code === 403) {
      res.status(403).json({
        success: false,
        message: "Insufficient permissions to create calendar events"
      });
      return;
    }

    if (error.code === 400) {
      res.status(400).json({
        success: false,
        message: error.message || "Bad request to Google Calendar API"
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: "Error creating calendar event",
      error: error.message
    });
  }
};

/**
 * Get user's calendar events
 */
export const getCalendarEvents = async (req: Request, res: Response) => {
  try {
    // Extract access token from Authorization header (Bearer token)
    const authHeader = req.headers.authorization;
    const accessToken = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7) // Remove 'Bearer ' prefix
      : null;
      
    const { 
      timeMin, 
      timeMax, 
      maxResults = 50,
      orderBy = "startTime",
      singleEvents = true
    } = req.query;

    if (!accessToken) {
      res.status(400).json({
        success: false,
        message: "Access token is required. Please provide it as: Authorization: Bearer YOUR_TOKEN"
      });
      return;
    }

    const calendar = getCalendarClient(accessToken as string);

    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin: timeMin as string,
      timeMax: timeMax as string,
      maxResults: parseInt(maxResults as string),
      singleEvents: singleEvents === "true",
      orderBy: orderBy as string,
    });

    res.status(200).json({
      success: true,
      message: "Calendar events retrieved successfully",
      events: response.data.items || [],
      summary: response.data.summary,
      timeZone: response.data.timeZone
    });

  } catch (error: any) {
    console.error("Error getting calendar events:", error);

    if (error.code === 401) {
      res.status(401).json({
        success: false,
        message: "Invalid or expired access token"
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: "Error retrieving calendar events",
      error: error.message
    });
  }
};

/**
 * Update an existing calendar event
 */
export const updateCalendarEvent = async (req: Request, res: Response) => {
  try {
    // Extract access token from Authorization header (Bearer token)
    const authHeader = req.headers.authorization;
    const accessToken = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7) // Remove 'Bearer ' prefix
      : null;
      
    const { eventId } = req.params;
    const updateData = req.body;

    if (!accessToken) {
      res.status(400).json({
        success: false,
        message: "Access token is required. Please provide it as: Authorization: Bearer YOUR_TOKEN"
      });
      return;
    }

    if (!eventId) {
      res.status(400).json({
        success: false,
        message: "Event ID is required"
      });
      return;
    }

    const calendar = getCalendarClient(accessToken as string);

    // Get the existing event first
    const existingEvent = await calendar.events.get({
      calendarId: "primary",
      eventId: eventId,
    });

    // Merge existing event data with update data
    const updatedEvent = {
      ...existingEvent.data,
      ...updateData,
    };

    // Update the event
    const response = await calendar.events.update({
      calendarId: "primary",
      eventId: eventId,
      requestBody: updatedEvent,
      sendUpdates: "all",
    });

    res.status(200).json({
      success: true,
      message: "Calendar event updated successfully",
      event: response.data
    });

  } catch (error: any) {
    console.error("Error updating calendar event:", error);

    if (error.code === 401) {
      res.status(401).json({
        success: false,
        message: "Invalid or expired access token"
      });
      return;
    }

    if (error.code === 404) {
      res.status(404).json({
        success: false,
        message: "Calendar event not found"
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: "Error updating calendar event",
      error: error.message
    });
  }
};

/**
 * Delete a calendar event
 */
export const deleteCalendarEvent = async (req: Request, res: Response) => {
  try {
    // Extract access token from Authorization header (Bearer token)
    const authHeader = req.headers.authorization;
    const accessToken = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7) // Remove 'Bearer ' prefix
      : null;
      
    const { eventId } = req.params;

    if (!accessToken) {
      res.status(400).json({
        success: false,
        message: "Access token is required. Please provide it as: Authorization: Bearer YOUR_TOKEN"
      });
      return;
    }

    if (!eventId) {
      res.status(400).json({
        success: false,
        message: "Event ID is required"
      });
      return;
    }

    const calendar = getCalendarClient(accessToken as string);

    await calendar.events.delete({
      calendarId: "primary",
      eventId: eventId,
      sendUpdates: "all",
    });

    res.status(200).json({
      success: true,
      message: "Calendar event deleted successfully"
    });

  } catch (error: any) {
    console.error("Error deleting calendar event:", error);

    if (error.code === 401) {
      res.status(401).json({
        success: false,
        message: "Invalid or expired access token"
      });
      return;
    }

    if (error.code === 404) {
      res.status(404).json({
        success: false,
        message: "Calendar event not found"
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: "Error deleting calendar event",
      error: error.message
    });
  }
};

/**
 * Generate Google OAuth URL for calendar access
 */
export const getAuthUrl = async (req: Request, res: Response) => {
  try {
    const oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CALENDAR_CLIENT_ID,
      process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events'
    ];

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent'
    });

    res.status(200).json({
      success: true,
      message: "Google OAuth URL generated successfully",
      authUrl: url
    });

  } catch (error: any) {
    console.error("Error generating auth URL:", error);
    res.status(500).json({
      success: false,
      message: "Error generating authentication URL",
      error: error.message
    });
  }
};

/**
 * Exchange authorization code for access token and optionally store tokens
 */
export const exchangeCodeForToken = async (req: Request, res: Response) => {
  try {
    const { code, email } = req.body;

    if (!code) {
      res.status(400).json({
        success: false,
        message: "Authorization code is required"
      });
      return;
    }

    const oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CALENDAR_CLIENT_ID,
      process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    const { tokens } = await oauth2Client.getToken(code);

    // If email is provided, store the tokens automatically
    if (email) {
      try {
        const storedTokens: StoredTokens = {
          access_token: tokens.access_token!,
          refresh_token: tokens.refresh_token,
          expiry_date: tokens.expiry_date,
          token_type: tokens.token_type,
          scope: tokens.scope
        };
        
        await saveTokens(email, storedTokens);
        console.log(`✅ Tokens stored successfully for ${email}`);
      } catch (saveError) {
        console.error("Error storing tokens:", saveError);
        // Continue without failing the request
      }
    }

    res.status(200).json({
      success: true,
      message: "Access token obtained successfully",
      stored: !!email,
      tokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        scope: tokens.scope,
        token_type: tokens.token_type,
        expiry_date: tokens.expiry_date
      }
    });

  } catch (error: any) {
    console.error("Error exchanging code for token:", error);
    res.status(500).json({
      success: false,
      message: "Error exchanging authorization code for token",
      error: error.message
    });
  }
};

/**
 * Handle Google OAuth callback redirect
 */
export const handleGoogleCallback = async (req: Request, res: Response) => {
  try {
    const { code, error } = req.query;

    // Check if user denied authorization
    if (error) {
      res.status(400).send(`
        <html>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h2 style="color: #dc3545;">Authorization Failed</h2>
            <p>You denied access to Google Calendar.</p>
            <p>Error: ${error}</p>
            <button onclick="window.close()" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer;">Close Window</button>
          </body>
        </html>
      `);
      return;
    }

    if (!code) {
      res.status(400).send(`
        <html>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h2 style="color: #dc3545;">Authorization Error</h2>
            <p>No authorization code received from Google.</p>
            <button onclick="window.close()" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer;">Close Window</button>
          </body>
        </html>
      `);
      return;
    }

    const oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CALENDAR_CLIENT_ID,
      process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    const { tokens } = await oauth2Client.getToken(code as string);

    // Return success page with tokens
    res.status(200).send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
          <div style="max-width: 800px; margin: 0 auto;">
            <h2 style="color: #28a745; text-align: center;">✅ Authorization Successful!</h2>
            <p style="text-align: center; margin-bottom: 30px;">Google Calendar access has been granted successfully.</p>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
              <h3 style="margin-top: 0;">📋 Access Token Information:</h3>
              <div style="background: white; padding: 15px; border-radius: 5px; border-left: 4px solid #007bff;">
                <p><strong>Access Token:</strong></p>
                <textarea readonly style="width: 100%; height: 80px; font-family: monospace; font-size: 12px; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">${tokens.access_token}</textarea>
                
                ${tokens.refresh_token ? `
                <p style="margin-top: 15px;"><strong>Refresh Token:</strong></p>
                <textarea readonly style="width: 100%; height: 60px; font-family: monospace; font-size: 12px; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">${tokens.refresh_token}</textarea>
                ` : ''}
                
                <p style="margin-top: 15px;"><strong>Expires:</strong> ${tokens.expiry_date ? new Date(tokens.expiry_date).toLocaleString() : 'Not specified'}</p>
                <p><strong>Scope:</strong> ${tokens.scope || 'Google Calendar access'}</p>
              </div>
            </div>

            <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
              <h3 style="margin-top: 0;">🚀 Next Steps:</h3>
              <ol style="margin: 0;">
                <li>Copy the <strong>Access Token</strong> above</li>
                <li>Use it in your API requests as: <code>Authorization: Bearer YOUR_ACCESS_TOKEN</code></li>
                <li>Test creating a calendar event with the POST endpoint</li>
              </ol>
            </div>

            <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
              <h4 style="margin-top: 0;">📝 Example curl command:</h4>
              <pre style="background: #f8f9fa; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 12px;">curl -X POST http://localhost:3001/api/google-calendar/events \\
-H "Content-Type: application/json" \\
-H "Authorization: Bearer ${tokens.access_token}" \\
-d '{
  "summary": "Test Event",
  "description": "Created via API",
  "startDateTime": "2024-07-25T10:00:00.000Z",
  "endDateTime": "2024-07-25T11:00:00.000Z"
}'</pre>
            </div>

            <div style="text-align: center;">
              <button onclick="window.close()" style="padding: 12px 30px; background: #28a745; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px;">Close Window</button>
            </div>
          </div>
        </body>
      </html>
    `);

  } catch (error: any) {
    console.error("Error in Google callback:", error);
    res.status(500).send(`
      <html>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h2 style="color: #dc3545;">Error Processing Authorization</h2>
          <p>There was an error exchanging the authorization code for tokens.</p>
          <p style="color: #6c757d; font-size: 14px;">Error: ${error.message}</p>
          <button onclick="window.close()" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer;">Close Window</button>
        </body>
      </html>
    `);
  }
};

/**
 * Manually refresh access token using stored refresh token
 */
export const refreshAccessToken = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({
        success: false,
        message: "Email is required to refresh token"
      });
      return;
    }

    // Get stored tokens
    const storedTokens = await getStoredTokens(email);
    if (!storedTokens || !storedTokens.refresh_token) {
      res.status(404).json({
        success: false,
        message: "No refresh token found for this email. Please re-authorize.",
        authUrl: `${req.protocol}://${req.get('host')}/api/google-calendar/auth-url`
      });
      return;
    }

    // Initialize OAuth client
    const oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CALENDAR_CLIENT_ID,
      process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    // Set current credentials
    oauth2Client.setCredentials({
      refresh_token: storedTokens.refresh_token,
      access_token: storedTokens.access_token
    });

    try {
      // Refresh the token
      const { credentials } = await oauth2Client.refreshAccessToken();

      // Update stored tokens
      const updatedTokens: StoredTokens = {
        access_token: credentials.access_token!,
        refresh_token: credentials.refresh_token || storedTokens.refresh_token,
        expiry_date: credentials.expiry_date,
        token_type: credentials.token_type,
        scope: credentials.scope
      };

      await saveTokens(email, updatedTokens);

      res.status(200).json({
        success: true,
        message: "Access token refreshed successfully",
        tokenInfo: {
          hasNewAccessToken: !!credentials.access_token,
          newExpiryDate: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
          refreshedAt: new Date(),
          scope: credentials.scope
        }
      });

    } catch (refreshError: any) {
      console.error("Error refreshing token:", refreshError);
      
      if (refreshError.message.includes('invalid_grant')) {
        res.status(401).json({
          success: false,
          message: "Refresh token is invalid or expired. Please re-authorize the application.",
          authUrl: `${req.protocol}://${req.get('host')}/api/google-calendar/auth-url`
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: "Failed to refresh access token",
        error: refreshError.message
      });
    }

  } catch (error: any) {
    console.error("Error in refresh token endpoint:", error);
    res.status(500).json({
      success: false,
      message: "Error processing token refresh request",
      error: error.message
    });
  }
};

/**
 * Store user tokens (for initial setup)
 */
export const storeUserTokens = async (req: Request, res: Response) => {
  try {
    const { email, access_token, refresh_token, expiry_date, token_type, scope } = req.body;

    if (!email || !access_token) {
      res.status(400).json({
        success: false,
        message: "Email and access_token are required"
      });
      return;
    }

    const tokens: StoredTokens = {
      access_token,
      refresh_token,
      expiry_date,
      token_type,
      scope
    };

    await saveTokens(email, tokens);

    res.status(200).json({
      success: true,
      message: "Tokens stored successfully",
      tokenInfo: {
        email,
        hasAccessToken: !!access_token,
        hasRefreshToken: !!refresh_token,
        expiryDate: expiry_date ? new Date(expiry_date) : null,
        storedAt: new Date()
      }
    });

  } catch (error: any) {
    console.error("Error storing tokens:", error);
    res.status(500).json({
      success: false,
      message: "Error storing tokens",
      error: error.message
    });
  }
};

/**
 * Get fresh access token using client credentials (service account style)
 * This method uses client ID and secret to get a new access token
 */
export const getAccessTokenWithCredentials = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('\n🔑🔑🔑 GETTING FRESH ACCESS TOKEN WITH CREDENTIALS! 🔑🔑🔑');
    console.log('='.repeat(60));
    console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
    console.log(`📍 Endpoint: POST /api/google-calendar/get-access-token`);
    console.log('='.repeat(60));

    const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
      console.log('❌ Missing required credentials in environment variables');
      res.status(400).json({
        success: false,
        message: "Missing required Google OAuth credentials in environment variables",
        required: ["GOOGLE_CALENDAR_CLIENT_ID", "GOOGLE_CALENDAR_CLIENT_SECRET", "GOOGLE_CALENDAR_REFRESH_TOKEN"]
      });
      return;
    }

    console.log(`🔐 Using Client ID: ${clientId.substring(0, 20)}...`);
    console.log(`🔐 Using Refresh Token: ${refreshToken.substring(0, 20)}...`);

    // Prepare the request body for Google OAuth token endpoint
    const tokenRequestBody = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    });

    console.log('🌐 Making request to Google OAuth token endpoint...');

    // Make request to Google OAuth token endpoint
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
        message: "Failed to get access token from Google",
        error: responseData.error_description || responseData.error || 'Unknown error',
        details: responseData
      });
      return;
    }

    console.log('✅ Successfully obtained new access token from Google!');
    console.log(`📝 Token type: ${responseData.token_type}`);
    console.log(`⏰ Expires in: ${responseData.expires_in} seconds`);

    // Calculate expiry date
    const expiryDate = new Date(Date.now() + (responseData.expires_in * 1000));

    const tokenData = {
      access_token: responseData.access_token,
      token_type: responseData.token_type || 'Bearer',
      expires_in: responseData.expires_in,
      expiry_date: expiryDate.toISOString(),
      scope: responseData.scope,
      // Keep the same refresh token (Google usually doesn't send a new one unless specifically requested)
      refresh_token: refreshToken
    };

    console.log('🎯 Token Data Summary:');
    console.log(`   - Access Token: ${tokenData.access_token.substring(0, 30)}...`);
    console.log(`   - Expires: ${tokenData.expiry_date}`);
    console.log(`   - Scope: ${tokenData.scope}`);

    res.status(200).json({
      success: true,
      message: "Successfully obtained new access token",
      data: tokenData,
      instructions: {
        usage: "Use the access_token in Authorization header as 'Bearer YOUR_ACCESS_TOKEN'",
        expiry: `Token expires at ${tokenData.expiry_date}`,
        autoRefresh: "You can call this endpoint again to get a fresh token when needed"
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
 * Automatic token refresh endpoint - Updates environment variable and all stored tokens
 * This endpoint is designed to be called by a cron job every 30 minutes
 */
export const autoRefreshTokens = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('\n🔄🔄🔄 AUTO TOKEN REFRESH STARTED 🔄🔄🔄');
    console.log('='.repeat(60));
    console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
    console.log(`📍 Endpoint: POST /api/google-calendar/auto-refresh-tokens`);
    console.log('='.repeat(60));

    let refreshedCount = 0;
    let failedCount = 0;
    const refreshResults: any[] = [];

    // 1. First, refresh the environment variable tokens if they exist
    if (process.env.GOOGLE_CALENDAR_ACCESS_TOKEN && process.env.GOOGLE_CALENDAR_REFRESH_TOKEN) {
      console.log('🔑 Refreshing environment variable tokens...');
      
      try {
        const oauth2Client = new OAuth2Client(
          process.env.GOOGLE_CALENDAR_CLIENT_ID,
          process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
          process.env.GOOGLE_REDIRECT_URI
        );

        oauth2Client.setCredentials({
          access_token: process.env.GOOGLE_CALENDAR_ACCESS_TOKEN,
          refresh_token: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN
        });

        const { credentials } = await oauth2Client.refreshAccessToken();
        
        // Update environment variables (this will persist for the current process)
        process.env.GOOGLE_CALENDAR_ACCESS_TOKEN = credentials.access_token!;
        if (credentials.refresh_token) {
          process.env.GOOGLE_CALENDAR_REFRESH_TOKEN = credentials.refresh_token;
        }
        
        console.log('✅ Environment variable tokens refreshed successfully');
        refreshResults.push({
          source: 'environment',
          success: true,
          expiryDate: credentials.expiry_date ? new Date(credentials.expiry_date) : null
        });
        refreshedCount++;

      } catch (envError: any) {
        console.error('❌ Failed to refresh environment variable tokens:', envError.message);
        refreshResults.push({
          source: 'environment',
          success: false,
          error: envError.message
        });
        failedCount++;
      }
    } else {
      console.log('⚠️ No environment variable tokens found to refresh');
    }

    // 2. Refresh all stored tokens in database
    console.log('🔍 Looking for stored tokens in database...');
    
    try {
      const allUsers = await executeQuickLearningWithReconnection(async (conn) => {
        const UserModel = getUserModel(conn);
        return await UserModel.find({ 
          'metadata.googleCalendarTokens': { $exists: true }
        });
      });

      console.log(`📊 Found ${allUsers.length} users with stored Google Calendar tokens`);

      for (const user of allUsers) {
        const userEmail = user.email;
        const userTokens = user.metadata.googleCalendarTokens as StoredTokens;

        if (!userTokens.refresh_token) {
          console.log(`⚠️ User ${userEmail} has no refresh token, skipping...`);
          refreshResults.push({
            source: 'database',
            email: userEmail,
            success: false,
            error: 'No refresh token available'
          });
          failedCount++;
          continue;
        }

        try {
          console.log(`🔄 Refreshing tokens for user: ${userEmail}`);
          
          const oauth2Client = new OAuth2Client(
            process.env.GOOGLE_CALENDAR_CLIENT_ID,
            process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
          );

          oauth2Client.setCredentials({
            access_token: userTokens.access_token,
            refresh_token: userTokens.refresh_token
          });

          const { credentials } = await oauth2Client.refreshAccessToken();

          // Update stored tokens
          const updatedTokens: StoredTokens = {
            access_token: credentials.access_token!,
            refresh_token: credentials.refresh_token || userTokens.refresh_token,
            expiry_date: credentials.expiry_date,
            token_type: credentials.token_type,
            scope: credentials.scope
          };

          await saveTokens(userEmail, updatedTokens);
          
          console.log(`✅ Tokens refreshed successfully for user: ${userEmail}`);
          refreshResults.push({
            source: 'database',
            email: userEmail,
            success: true,
            expiryDate: credentials.expiry_date ? new Date(credentials.expiry_date) : null
          });
          refreshedCount++;

        } catch (userError: any) {
          console.error(`❌ Failed to refresh tokens for user ${userEmail}:`, userError.message);
          refreshResults.push({
            source: 'database',
            email: userEmail,
            success: false,
            error: userError.message
          });
          failedCount++;
        }
      }

    } catch (dbError: any) {
      console.error('❌ Error accessing database for token refresh:', dbError.message);
      refreshResults.push({
        source: 'database',
        success: false,
        error: `Database access error: ${dbError.message}`
      });
      failedCount++;
    }

    // 3. Summary and response
    console.log('\n📊 AUTO REFRESH SUMMARY:');
    console.log(`✅ Successfully refreshed: ${refreshedCount}`);
    console.log(`❌ Failed to refresh: ${failedCount}`);
    console.log('='.repeat(60));

    res.status(200).json({
      success: true,
      message: "Auto token refresh completed",
      summary: {
        refreshedCount,
        failedCount,
        totalProcessed: refreshedCount + failedCount,
        completedAt: new Date().toISOString()
      },
      results: refreshResults
    });

  } catch (error: any) {
    console.error("❌ Critical error in auto token refresh:", error);
    res.status(500).json({
      success: false,
      message: "Critical error during auto token refresh",
      error: error.message
    });
  }
};
