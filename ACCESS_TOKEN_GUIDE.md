/**
 * QUICK ACCESS TOKEN GUIDE
 * 
 * Follow these steps to get an access token for testing the Google Calendar API
 */

// =====================================
// STEP 1: Add Environment Variables
// =====================================

/*
Add these to your .env file (you already have the values):

GOOGLE_CLIENT_ID=384713865984-kngspnhsj1ssmvtmijdi0qdoqjbjad5r.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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
GOOGLE_REDIRECT_URI=http://localhost:3001/auth/google/callback
*/

// =====================================
// STEP 2: Start Your Server
// =====================================

/*
npm run dev
# or
npm start

Make sure your server is running on http://localhost:3001
*/

// =====================================
// STEP 3: Get Authorization URL
// =====================================

/*
Make a GET request to get the OAuth URL:

Method: GET
URL: http://localhost:3001/api/google-calendar/auth-url

Response will contain an authUrl like:
https://accounts.google.com/oauth2/v2/auth?access_type=offline&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar...

Copy this URL and paste it in your browser.
*/

// =====================================
// STEP 4: Authorize in Browser
// =====================================

/*
1. Open the authUrl in your browser
2. Sign in with your Google account
3. Grant calendar permissions
4. You'll be redirected to: http://localhost:3001/auth/google/callback?code=AUTHORIZATION_CODE
5. Copy the "code" parameter from the URL
*/

// =====================================
// STEP 5: Exchange Code for Token
// =====================================

/*
Use the authorization code to get an access token:

Method: POST
URL: http://localhost:3001/api/google-calendar/exchange-token
Content-Type: application/json

Body:
{
  "code": "4/0AVG7fiQ-PASTE_YOUR_CODE_HERE"
}

Response will contain:
{
  "success": true,
  "tokens": {
    "access_token": "ya29.a0AcM612x...",  // ← This is what you need!
    "refresh_token": "1//0GWThP...",
    "scope": "https://www.googleapis.com/auth/calendar",
    "token_type": "Bearer",
    "expiry_date": 1738234567890
  }
}

Save the access_token - this is what you'll use in the accessToken header!
*/

// =====================================
// STEP 6: Test Creating an Event
// =====================================

/*
Now you can test the POST endpoint:

Method: POST
URL: http://localhost:3001/api/google-calendar/events
Content-Type: application/json
accessToken: ya29.a0AcM612x...  // ← Use your actual access token here

Body:
{
  "summary": "Test Event",
  "description": "Testing the API",
  "startDateTime": "2024-07-26T10:00:00.000Z",
  "endDateTime": "2024-07-26T11:00:00.000Z",
  "timeZone": "America/Mexico_City"
}
*/

// =====================================
// QUICK CURL COMMANDS
// =====================================

/*
# Step 3: Get auth URL
curl -X GET http://localhost:3001/api/google-calendar/auth-url

# Step 5: Exchange code for token (replace YOUR_CODE with actual code)
curl -X POST http://localhost:3001/api/google-calendar/exchange-token \
  -H "Content-Type: application/json" \
  -d '{"code":"YOUR_CODE_HERE"}'

# Step 6: Create event (replace YOUR_ACCESS_TOKEN with actual token)
curl -X POST http://localhost:3001/api/google-calendar/events \
  -H "Content-Type: application/json" \
  -H "accessToken: YOUR_ACCESS_TOKEN" \
  -d '{
    "summary": "API Test Event",
    "startDateTime": "2024-07-26T14:00:00.000Z",
    "endDateTime": "2024-07-26T15:00:00.000Z"
  }'
*/

// =====================================
// TROUBLESHOOTING
// =====================================

/*
Common Issues:

1. "redirect_uri_mismatch" error:
   - Make sure GOOGLE_REDIRECT_URI matches exactly what's configured in Google Cloud Console
   - Add http://localhost:3001/auth/google/callback to authorized redirect URIs

2. "invalid_client" error:
   - Check that GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are correct
   - Make sure the credentials are for a "Web application" type

3. "invalid_grant" error:
   - The authorization code has expired (they're single-use and short-lived)
   - Get a new authorization code by repeating steps 3-4

4. "insufficient_scope" error:
   - The token doesn't have calendar permissions
   - Re-authorize with the correct scopes

5. Server not responding:
   - Make sure your server is running on port 3001
   - Check that the Google Calendar routes are properly loaded
*/
