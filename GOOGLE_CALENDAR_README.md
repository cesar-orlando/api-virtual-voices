# Google Calendar Integration

This API provides endpoints to integrate with Google Calendar, allowing you to create, read, update, and delete calendar events programmatically.

## Setup

### 1. Google Cloud Console Configuration

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Calendar API:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Google Calendar API"
   - Click on it and press "Enable"

### 2. OAuth 2.0 Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth 2.0 Client IDs"
3. Choose "Web application"
4. Add authorized redirect URIs:
   - For development: `http://localhost:3000/auth/google/callback`
   - For production: `https://yourdomain.com/auth/google/callback`
5. Copy the Client ID and Client Secret

### 3. Environment Variables

Copy `google-calendar.env.example` to your main `.env` file and fill in the values:

```env
GOOGLE_CLIENT_ID=your-google-client-id-here.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret-here
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
```

## API Endpoints

### Authentication

#### Get OAuth URL
```http
GET /api/google-calendar/auth-url
```

Returns the Google OAuth URL where users should be redirected to authorize your application.

**Response:**
```json
{
  "success": true,
  "message": "Google OAuth URL generated successfully",
  "authUrl": "https://accounts.google.com/oauth2/v2/auth?..."
}
```

#### Exchange Authorization Code for Access Token
```http
POST /api/google-calendar/exchange-token
```

**Request Body:**
```json
{
  "code": "authorization_code_from_google"
}
```

**Response:**
```json
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
```

### Calendar Events

#### Create Event
```http
POST /api/google-calendar/events
```

**Headers:**
```
accessToken: your-google-access-token
```

**Request Body:**
```json
{
  "summary": "Team Meeting",
  "description": "Weekly team sync meeting",
  "startDateTime": "2024-07-24T14:00:00.000Z",
  "endDateTime": "2024-07-24T15:00:00.000Z",
  "timeZone": "America/Mexico_City",
  "attendeeEmails": ["user1@example.com", "user2@example.com"],
  "location": "Conference Room A"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Calendar event created successfully",
  "event": {
    "id": "event_id",
    "htmlLink": "https://calendar.google.com/event?eid=...",
    "summary": "Team Meeting",
    "start": {
      "dateTime": "2024-07-24T14:00:00.000Z",
      "timeZone": "America/Mexico_City"
    },
    "end": {
      "dateTime": "2024-07-24T15:00:00.000Z",
      "timeZone": "America/Mexico_City"
    }
  }
}
```

#### Get Events
```http
GET /api/google-calendar/events?timeMin=2024-07-24T00:00:00.000Z&timeMax=2024-07-25T00:00:00.000Z
```

**Headers:**
```
accessToken: your-google-access-token
```

**Query Parameters:**
- `timeMin` (optional): Lower bound for event start time (ISO 8601)
- `timeMax` (optional): Upper bound for event start time (ISO 8601)
- `maxResults` (optional): Maximum number of events (default: 50)
- `orderBy` (optional): Order of events - `startTime` or `updated` (default: `startTime`)
- `singleEvents` (optional): Whether to expand recurring events (default: `true`)

#### Update Event
```http
PUT /api/google-calendar/events/{eventId}
```

**Headers:**
```
accessToken: your-google-access-token
```

**Request Body:** (partial update allowed)
```json
{
  "summary": "Updated Meeting Title",
  "description": "Updated description"
}
```

#### Delete Event
```http
DELETE /api/google-calendar/events/{eventId}
```

**Headers:**
```
accessToken: your-google-access-token
```

## Authentication Flow

1. **Get Authorization URL**: Call `GET /api/google-calendar/auth-url` to get the OAuth URL
2. **Redirect User**: Redirect the user to the OAuth URL
3. **Handle Callback**: Google will redirect back to your redirect URI with an authorization code
4. **Exchange Code**: Call `POST /api/google-calendar/exchange-token` with the authorization code
5. **Store Tokens**: Store the access token (and refresh token) securely
6. **Use API**: Include the access token in the `accessToken` header for subsequent API calls

## Error Handling

The API returns standard HTTP status codes:

- `200`: Success
- `201`: Created (for event creation)
- `400`: Bad Request (missing parameters, invalid data)
- `401`: Unauthorized (invalid or expired access token)
- `403`: Forbidden (insufficient permissions)
- `404`: Not Found (event not found)
- `500`: Internal Server Error

Error responses include a descriptive message:

```json
{
  "success": false,
  "message": "Invalid or expired access token",
  "error": "Error details"
}
```

## Permissions Required

The application requests the following Google Calendar scopes:
- `https://www.googleapis.com/auth/calendar`: Full access to calendars
- `https://www.googleapis.com/auth/calendar.events`: Access to calendar events

## Security Considerations

1. **Token Storage**: Store access tokens securely (encrypted database, secure session storage)
2. **Token Refresh**: Implement token refresh logic for long-term access
3. **HTTPS**: Always use HTTPS in production
4. **Validate Input**: Validate all input data before processing
5. **Rate Limiting**: Implement rate limiting to prevent API abuse

## Example Client Implementation

```javascript
// 1. Get authorization URL
const authResponse = await fetch('/api/google-calendar/auth-url');
const { authUrl } = await authResponse.json();

// 2. Redirect user to authUrl
window.location.href = authUrl;

// 3. After user authorization, exchange code for token
const tokenResponse = await fetch('/api/google-calendar/exchange-token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code: authorizationCode })
});
const { tokens } = await tokenResponse.json();

// 4. Store access token and use it for API calls
const accessToken = tokens.access_token;

// 5. Create an event
const eventResponse = await fetch('/api/google-calendar/events', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'accessToken': accessToken
  },
  body: JSON.stringify({
    summary: 'My Event',
    startDateTime: '2024-07-24T14:00:00.000Z',
    endDateTime: '2024-07-24T15:00:00.000Z'
  })
});
```
