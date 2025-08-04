import { Request, Response } from "express";
import { Assistant } from "../services/agents/Assistant";

// Store assistant instances per company
const assistantInstances = new Map<string, Assistant>();

/**
 * Get or create an assistant instance for a company
 */
async function getAssistantInstance(company: string): Promise<Assistant> {
  if (!assistantInstances.has(company)) {
    console.log(`🔄 Creating new Calendar Assistant instance for company: ${company}`);
    const assistant = new Assistant(company);
    await assistant.initialize();
    assistantInstances.set(company, assistant);
    console.log(`✅ Calendar Assistant initialized for company: ${company}`);
  }
  return assistantInstances.get(company)!;
}

/**
 * Process a natural language calendar request
 */
export const processCalendarRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const { message, company = 'VirtualVoices' } = req.body;

    if (!message) {
      res.status(400).json({
        success: false,
        message: "Message is required",
        example: {
          message: "Create a meeting tomorrow at 2pm",
          company: "VirtualVoices"
        }
      });
      return;
    }

    console.log(`📅 Processing calendar request for ${company}:`, message);

    // Get assistant instance
    const assistant = await getAssistantInstance(company);

    // Process the message
    const response = await assistant.processMessage(message);

    console.log(`✅ Calendar Assistant response for ${company}:`, response);

    res.status(200).json({
      success: true,
      message: "Calendar request processed successfully",
      data: {
        userMessage: message,
        assistantResponse: response,
        company,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('🚨 Error processing calendar request:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error while processing calendar request",
      error: error.message
    });
  }
};

/**
 * Get assistant status and capabilities
 */
export const getAssistantInfo = async (req: Request, res: Response): Promise<void> => {
  try {
    const { company = 'VirtualVoices' } = req.params;

    res.status(200).json({
      success: true,
      message: "Calendar Assistant information",
      data: {
        company,
        status: assistantInstances.has(company) ? "initialized" : "not_initialized",
        capabilities: [
          {
            name: "create_calendar_event",
            description: "Create new Google Calendar events",
            example: "Create a team meeting tomorrow at 2pm"
          },
          {
            name: "edit_calendar_event",
            description: "Edit existing calendar events",
            example: "Change the meeting time to 3pm (requires Event ID)"
          },
          {
            name: "delete_calendar_event",
            description: "Delete calendar events",
            example: "Delete the meeting with ID abc123"
          },
          {
            name: "parse_natural_datetime",
            description: "Parse natural language date/time expressions",
            example: "What is 'next Friday at 10am' in ISO format?"
          },
          {
            name: "get_access_token",
            description: "Get fresh Google Calendar access token",
            example: "Get a new access token"
          }
        ],
        supportedTimeZone: "America/Mexico_City",
        dateTimeFormat: "ISO 8601 (YYYY-MM-DDTHH:mm:ss)",
        endpoints: {
          process: "POST /api/calendar-assistant/process",
          info: "GET /api/calendar-assistant/info/:company"
        }
      }
    });

  } catch (error: any) {
    console.error('🚨 Error getting assistant info:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error while getting assistant info",
      error: error.message
    });
  }
};

/**
 * Initialize assistant for a specific company
 */
export const initializeAssistant = async (req: Request, res: Response): Promise<void> => {
  try {
    const { company = 'VirtualVoices' } = req.body;

    console.log(`🔄 Manually initializing Calendar Assistant for company: ${company}`);

    // Force create new instance
    const assistant = new Assistant(company);
    await assistant.initialize();
    assistantInstances.set(company, assistant);

    console.log(`✅ Calendar Assistant manually initialized for company: ${company}`);

    res.status(200).json({
      success: true,
      message: "Calendar Assistant initialized successfully",
      data: {
        company,
        status: "initialized",
        timestamp: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('🚨 Error initializing assistant:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error while initializing assistant",
      error: error.message
    });
  }
};
