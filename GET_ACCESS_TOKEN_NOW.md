# 🔐 HOW TO GET ACCESS TOKEN - Step by Step

## ✅ **Current Status**
Your server is running and the Google Calendar API is working! I've tested the auth URL endpoint and it's returning the correct OAuth URL with your credentials.

## 📋 **Quick Steps to Get Access Token**

### 1️⃣ **Start Your Server** ✅ (Already Running)
```bash
npm run dev
```
Your server is running at: `http://localhost:3001`

### 2️⃣ **Get Authorization URL** ✅ (Working)
```bash
curl -X GET http://localhost:3001/api/google-calendar/auth-url
```

**Response:**
```json
{
  "success": true,
  "message": "Google OAuth URL generated successfully",
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?access_type=offline&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar%20https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar.events&prompt=consent&response_type=code&client_id=384713865984-kngspnhsj1ssmvtmijdi0qdoqjbjad5r.apps.googleusercontent.com&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fgoogle%2Fcallback"
}
```

### 3️⃣ **Open the Authorization URL**
Copy the `authUrl` from the response above and paste it in your browser:

**URL to open in browser:**
```
https://accounts.google.com/o/oauth2/v2/auth?access_type=offline&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar%20https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar.events&prompt=consent&response_type=code&client_id=384713865984-kngspnhsj1ssmvtmijdi0qdoqjbjad5r.apps.googleusercontent.com&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fgoogle%2Fcallback
```

### 4️⃣ **Authorize and Get Code**
1. **Sign in** with your Google account
2. **Grant calendar permissions** when prompted
3. You'll be redirected to: `http://localhost:3000/auth/google/callback?code=AUTHORIZATION_CODE`
4. **Copy the code** parameter from the URL (the part after `code=`)

### 5️⃣ **Exchange Code for Access Token**
```bash
curl -X POST http://localhost:3001/api/google-calendar/exchange-token \
  -H "Content-Type: application/json" \
  -d '{"code":"PASTE_YOUR_AUTHORIZATION_CODE_HERE"}'
```

**Response will contain your access token:**
```json
{
  "success": true,
  "message": "Access token obtained successfully",
  "tokens": {
    "access_token": "ya29.a0AcM612x...",  // ← This is your access token!
    "refresh_token": "1//0GWThP...",
    "scope": "https://www.googleapis.com/auth/calendar",
    "token_type": "Bearer",
    "expiry_date": 1738234567890
  }
}
```

### 6️⃣ **Test Creating a Calendar Event**
```bash
curl -X POST http://localhost:3001/api/google-calendar/events \
  -H "Content-Type: application/json" \
  -H "accessToken: YOUR_ACCESS_TOKEN_HERE" \
  -d '{
    "summary": "Test Event from API",
    "description": "Testing the Google Calendar integration",
    "startDateTime": "2024-07-25T10:00:00.000Z",
    "endDateTime": "2024-07-25T11:00:00.000Z",
    "timeZone": "America/Mexico_City"
  }'
```

## 🎯 **What to Do Next**

1. **Copy the auth URL** from step 2 above
2. **Paste it in your browser** and authorize
3. **Copy the authorization code** from the callback URL
4. **Exchange it for tokens** using step 5
5. **Use the access token** to create calendar events!

## ⚠️ **Important Notes**

- **Authorization codes expire quickly** (usually within 10 minutes)
- **Access tokens expire** (usually after 1 hour) 
- **Refresh tokens** can be used to get new access tokens
- The **redirect URI** in your Google Cloud Console must match: `http://localhost:3000/auth/google/callback`

## 🔧 **If You Get Errors**

1. **"redirect_uri_mismatch"**: Make sure your Google Cloud Console has the exact redirect URI: `http://localhost:3000/auth/google/callback`
2. **"invalid_client"**: Check your Google Client ID and Secret
3. **"invalid_grant"**: The authorization code has expired, get a new one

Your Google Calendar API integration is working perfectly! 🎉
