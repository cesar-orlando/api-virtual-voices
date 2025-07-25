/**
 * Google Calendar API Test Examples
 * 
 * This file contains example requests for testing the Google Calendar integration.
 * Use tools like Postman, curl, or any HTTP client to test these endpoints.
 */

// =====================================
// 1. GET AUTHORIZATION URL
// =====================================

/*
GET http://localhost:3001/api/google-calendar/auth-url

Expected Response:
{
  "success": true,
  "message": "Google OAuth URL generated successfully",
  "authUrl": "https://accounts.google.com/oauth2/v2/auth?..."
}
*/

// =====================================
// 2. EXCHANGE CODE FOR TOKEN
// =====================================

/*
POST http://localhost:3001/api/google-calendar/exchange-token
Content-Type: application/json

{
  "code": "4/0AVG7fiQ..."
}

Expected Response:
{
  "success": true,
  "message": "Access token obtained successfully",
  "tokens": {
    "access_token": "ya29...",
    "refresh_token": "1//...",
    "scope": "https://www.googleapis.com/auth/calendar",
    "token_type": "Bearer",
    "expiry_date": 1627123456789
  }
}
*/

// =====================================
// 3. CREATE CALENDAR EVENT
// =====================================

/*
POST http://localhost:3001/api/google-calendar/events
Content-Type: application/json
accessToken: ya29.your-access-token-here

{
  "summary": "Team Meeting",
  "description": "Weekly team sync meeting to discuss project progress",
  "startDateTime": "2024-07-25T14:00:00.000Z",
  "endDateTime": "2024-07-25T15:00:00.000Z",
  "timeZone": "America/Mexico_City",
  "attendeeEmails": ["colleague@example.com", "manager@example.com"],
  "location": "Conference Room A"
}

Expected Response:
{
  "success": true,
  "message": "Calendar event created successfully",
  "event": {
    "id": "unique-event-id",
    "htmlLink": "https://calendar.google.com/event?eid=...",
    "summary": "Team Meeting",
    "description": "Weekly team sync meeting to discuss project progress",
    "location": "Conference Room A",
    "start": {
      "dateTime": "2024-07-25T14:00:00.000Z",
      "timeZone": "America/Mexico_City"
    },
    "end": {
      "dateTime": "2024-07-25T15:00:00.000Z",
      "timeZone": "America/Mexico_City"
    },
    "attendees": [
      {"email": "colleague@example.com"},
      {"email": "manager@example.com"}
    ],
    "status": "confirmed"
  }
}
*/

// =====================================
// 4. GET CALENDAR EVENTS
// =====================================

/*
GET http://localhost:3001/api/google-calendar/events?timeMin=2024-07-25T00:00:00.000Z&timeMax=2024-07-26T00:00:00.000Z&maxResults=10
accessToken: ya29.your-access-token-here

Expected Response:
{
  "success": true,
  "message": "Calendar events retrieved successfully",
  "events": [
    {
      "id": "event-id-1",
      "summary": "Meeting 1",
      "start": {
        "dateTime": "2024-07-25T10:00:00.000Z"
      },
      "end": {
        "dateTime": "2024-07-25T11:00:00.000Z"
      }
    }
  ],
  "summary": "primary",
  "timeZone": "America/Mexico_City"
}
*/

// =====================================
// 5. UPDATE CALENDAR EVENT
// =====================================

/*
PUT http://localhost:3001/api/google-calendar/events/your-event-id-here
Content-Type: application/json
accessToken: ya29.your-access-token-here

{
  "summary": "Updated Team Meeting",
  "description": "Updated description for the meeting",
  "location": "Conference Room B"
}

Expected Response:
{
  "success": true,
  "message": "Calendar event updated successfully",
  "event": {
    "id": "your-event-id-here",
    "summary": "Updated Team Meeting",
    "description": "Updated description for the meeting",
    "location": "Conference Room B"
  }
}
*/

// =====================================
// 6. DELETE CALENDAR EVENT
// =====================================

/*
DELETE http://localhost:3001/api/google-calendar/events/your-event-id-here
accessToken: ya29.your-access-token-here

Expected Response:
{
  "success": true,
  "message": "Calendar event deleted successfully"
}
*/

// =====================================
// CURL EXAMPLES
// =====================================

/*
# Get authorization URL
curl -X GET http://localhost:3001/api/google-calendar/auth-url

# Exchange code for token
curl -X POST http://localhost:3001/api/google-calendar/exchange-token \
  -H "Content-Type: application/json" \
  -d '{"code":"your-authorization-code-here"}'

# Create event
curl -X POST http://localhost:3001/api/google-calendar/events \
  -H "Content-Type: application/json" \
  -H "accessToken: your-access-token-here" \
  -d '{
    "summary": "Test Event",
    "startDateTime": "2024-07-25T14:00:00.000Z",
    "endDateTime": "2024-07-25T15:00:00.000Z",
    "description": "This is a test event created via API"
  }'

# Get events
curl -X GET "http://localhost:3001/api/google-calendar/events?timeMin=2024-07-25T00:00:00.000Z&timeMax=2024-07-26T00:00:00.000Z" \
  -H "accessToken: your-access-token-here"

# Update event
curl -X PUT http://localhost:3001/api/google-calendar/events/your-event-id \
  -H "Content-Type: application/json" \
  -H "accessToken: your-access-token-here" \
  -d '{"summary": "Updated Test Event"}'

# Delete event
curl -X DELETE http://localhost:3001/api/google-calendar/events/your-event-id \
  -H "accessToken: your-access-token-here"
*/

// =====================================
// COMMON ERROR RESPONSES
// =====================================

/*
400 Bad Request:
{
  "success": false,
  "message": "Summary, startDateTime, and endDateTime are required"
}

401 Unauthorized:
{
  "success": false,
  "message": "Invalid or expired access token"
}

403 Forbidden:
{
  "success": false,
  "message": "Insufficient permissions to create calendar events"
}

404 Not Found:
{
  "success": false,
  "message": "Calendar event not found"
}

500 Internal Server Error:
{
  "success": false,
  "message": "Error creating calendar event",
  "error": "Detailed error message"
}
*/
