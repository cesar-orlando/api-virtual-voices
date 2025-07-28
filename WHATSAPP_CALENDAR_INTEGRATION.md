# 📱 WhatsApp + Google Calendar Integration Guide

## 🎯 **What This Does**
When users send WhatsApp messages with calendar-related content, the AI automatically:
1. **Detects scheduling intent** (agendar, programar, recordar, etc.)
2. **Creates Google Calendar events** with auto-refresh tokens
3. **Responds with confirmation** including the calendar URL
4. **Sends WhatsApp message** with event details

## ✅ **Current Status**
Your system is **already configured** and ready! Here's what's working:

### 🔧 **Existing Components:**
- ✅ **OpenAI Tool**: `create_google_calendar_event` configured
- ✅ **Auto-Refresh**: Tokens refresh automatically  
- ✅ **WhatsApp Integration**: Uses QuickLearning AI service
- ✅ **Spanish Responses**: Formatted for Mexican users

### 🤖 **AI Detection Keywords:**
The AI automatically detects these phrases and triggers calendar creation:
- "Agéndame..."
- "Recuérdame..."
- "Programa..."
- "Reserva..."
- "Apartar..."
- "Separa fecha..."
- "Bloquea tiempo..."
- "Cita", "reunión", "clase", "examen"

## 🚀 **Setup Process**

### **Step 1: Complete Google Calendar OAuth (One-Time)**

#### Get Authorization URL:
```bash
curl http://localhost:3001/api/google-calendar/auth-url
```

#### Complete OAuth Flow:
1. **Copy the authUrl** from response
2. **Open in browser** and sign in with Google
3. **Grant calendar permissions**
4. **Copy authorization code** from redirect URL

#### Store Tokens Automatically:
```bash
curl -X POST http://localhost:3001/api/google-calendar/exchange-token \
  -H "Content-Type: application/json" \
  -d '{
    "code": "YOUR_AUTHORIZATION_CODE",
    "email": "blueage888@gmail.com"
  }'
```

### **Step 2: Verify Integration**

#### Check Token Status:
```bash
curl "http://localhost:3001/api/google-calendar/token-info?email=blueage888@gmail.com"
```

#### Test Calendar Creation:
```bash
curl -X POST http://localhost:3001/api/google-calendar/events-with-auto-token \
  -H "X-User-Email: blueage888@gmail.com" \
  -H "Content-Type: application/json" \
  -d '{
    "summary": "Test WhatsApp Event",
    "startDateTime": "2024-07-25T14:00:00.000Z",
    "endDateTime": "2024-07-25T15:00:00.000Z"
  }'
```

## 💬 **WhatsApp Examples**

### **Example 1: Simple Appointment**
**User sends:** "Agéndame una cita con el doctor mañana a las 3 PM"

**AI Response:**
```
✅ *¡Evento agendado exitosamente!*

📅 *Cita con el doctor*
📆 viernes, 25 de julio de 2024, 15:00
⏰ Hasta las 16:00

🔗 *Ver en Google Calendar:*
https://calendar.google.com/calendar/event?eid=...

¡El evento ha sido añadido a tu calendario y recibirás recordatorios automáticamente! 📲
```

### **Example 2: Class Scheduling**
**User sends:** "Recuérdame mi clase de inglés el lunes a las 4 de la tarde en Quick Learning"

**AI Response:**
```
✅ *¡Evento agendado exitosamente!*

📅 *Clase de inglés*
📆 lunes, 28 de julio de 2024, 16:00
⏰ Hasta las 17:00
📍 Quick Learning

🔗 *Ver en Google Calendar:*
https://calendar.google.com/calendar/event?eid=...

¡El evento ha sido añadido a tu calendario y recibirás recordatorios automáticamente! 📲
```

### **Example 3: Meeting with Details**
**User sends:** "Programa una reunión con el equipo para el miércoles de 2 a 3 PM en la oficina"

**AI Response:**
```
✅ *¡Evento agendado exitosamente!*

📅 *Reunión con el equipo*
📆 miércoles, 30 de julio de 2024, 14:00
⏰ Hasta las 15:00
📍 Oficina
📝 Reunión con el equipo

🔗 *Ver en Google Calendar:*
https://calendar.google.com/calendar/event?eid=...

¡El evento ha sido añadido a tu calendario y recibirás recordatorios automáticamente! 📲
```

## 🔧 **Testing**

### **Run WhatsApp Test Script:**
```bash
node test-whatsapp-calendar.js
```

This will simulate various WhatsApp messages and show how the AI responds.

### **Test Specific Messages:**
Send these via WhatsApp to your QuickLearning number:
- "Agéndame una reunión para mañana a las 2 PM"
- "Recuérdame mi examen el viernes a las 10"
- "Programa mi clase de inglés para el lunes"

## 🎯 **Flow Diagram**

```
WhatsApp Message → Twilio Webhook → QuickLearning AI Service
                                          ↓
                                    OpenAI Analysis
                                          ↓
                              Calendar Intent Detected?
                                          ↓ YES
                                Google Calendar Tool
                                          ↓
                              Auto-Refresh Token Check
                                          ↓
                                 Create Calendar Event
                                          ↓
                               Return Formatted Response
                                          ↓
                               Send WhatsApp Message
```

## 🛠️ **Troubleshooting**

### **No Calendar Events Created:**
1. Check token status: `curl "http://localhost:3001/api/google-calendar/token-info?email=blueage888@gmail.com"`
2. If no tokens: Complete OAuth flow (Step 1)
3. Check server logs for errors

### **AI Not Detecting Calendar Intent:**
- Use clearer keywords: "agendar", "programar", "recuérdame"
- Include specific dates and times
- Mention "calendario" or "cita" explicitly

### **Wrong Time Zone:**
- Events default to `America/Mexico_City`
- Modify in `openaiTools.ts` if needed

## 🎉 **You're Ready!**

Your WhatsApp + Google Calendar integration is **fully configured**! Just complete the OAuth flow once, and your users can create calendar events by simply sending WhatsApp messages.

**The AI will automatically detect scheduling intent and create calendar events with confirmation messages including the Google Calendar URL!** 📅✨
