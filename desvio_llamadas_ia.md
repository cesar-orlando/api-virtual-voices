# ✨ Nuevo Proceso de Desvío de Llamadas con IA (Ejemplo de Implementación)

## Contexto

Actualmente, en ElevenLabs, durante el **desvío de llamadas**, el control de la llamada pasa temporalmente a **Twilio**, lo que provoca que se escuche una voz operativa o tonos de sistema.

El siguiente ejemplo muestra un **nuevo proceso propuesto** para mantener la voz de la **IA de ElevenLabs** activa durante todo el flujo, agregar **música de espera personalizada** y manejar el **fallback (no contesta)** de manera inteligente.

> ⚠️ **Nota:** Este documento es un **ejemplo de referencia**, no es obligatorio implementarlo tal cual. La idea es que sirva como **guía técnica y conceptual** para el equipo backend.

---

## 🔹 Objetivo

- Mantener la **voz IA (ElevenLabs)** durante el desvío.
- Reproducir **música de espera** mientras se conecta con el asesor.
- Si el asesor **no contesta**, la IA vuelve a la llamada y ofrece dejar un recado.
- Todo dentro de un flujo controlado por el backend (sin que Twilio interrumpa con su voz operativa).

---

## 🔹 Arquitectura General

### Componentes principales

- **Leg A:** Cliente (llamante) + IA ElevenLabs.
- **Leg B:** Asesor o agente de destino.
- **Conference Room (Twilio):** conecta A y B bajo control del backend.

### Flujo simplificado

```text
Cliente llama → /voice/incoming
  → IA contesta (ElevenLabs streaming)
  → Usuario pide hablar con asesor → /voice/transfer/init
      ↳ Twilio marca al asesor (Leg B)
      ↳ Cliente escucha música + IA
      ↳ Si B contesta → unir a conference
      ↳ Si B no contesta → IA vuelve: “No contestó, ¿quieres dejar recado?”
```

---

## 🔹 Variables de entorno

```bash
PORT=3001
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_NUMBER=+52XXXXXXXXXX

ELEVENLABS_API_KEY=...
ELEVENLABS_AGENT_ID=agent_01jw2vkb3pf9w8jx85daq02mae
ELEVENLABS_BASE_URL=https://api.elevenlabs.io/v1

CALL_TIMEOUT_SECONDS=25
HOLD_MUSIC_URL=https://cdn.tuempresa.com/audio/hold-loop.mp3
BASE_PUBLIC_URL=https://api.tuempresa.com
```

---

## 🔹 Rutas Clave (Node.js + Express)

### 1️⃣ `/voice/incoming`

- Twilio recibe la llamada.
- Crea una **conference** controlada (no un dial directo).
- Envía al usuario música de espera personalizada (`waitUrl`).

```js
app.post('/voice/incoming', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const conferenceName = `conf_${req.body.CallSid}`;

  const dial = twiml.dial();
  dial.conference({
    startConferenceOnEnter: true,
    endConferenceOnExit: true,
    waitUrl: `${BASE_PUBLIC_URL}/voice/hold-music`
  }, conferenceName);

  res.type('text/xml').send(twiml.toString());
});
```

### 2️⃣ `/voice/transfer/init`

- Se invoca cuando la IA detecta que el usuario quiere hablar con un asesor.
- Crea el **Leg B** (llamada al asesor).

```js
const callB = await client.calls.create({
  to: toNumber,
  from: TWILIO_NUMBER,
  url: `${BASE_PUBLIC_URL}/voice/transfer/connect?conf=${conferenceName}`,
  statusCallback: `${BASE_PUBLIC_URL}/voice/transfer/status`,
  timeout: CALL_TIMEOUT_SECONDS,
});
```

### 3️⃣ `/voice/transfer/status`

- Monitorea el estado del Leg B (`ringing`, `answered`, `no-answer`).
- Si **no contesta**, vuelve a la IA con el mensaje de recado.

```js
if (['no-answer', 'busy', 'failed'].includes(callStatus)) {
  // Fallback: IA ofrece dejar recado
  await handleNoAnswerFallback(callSidA);
}
```

### 4️⃣ `/voice/voicemail`

- La IA o Twilio permiten dejar un recado grabado.
- Guarda el audio o lo transcribe.

```js
app.post('/voice/voicemail', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say({ language: 'es-MX', voice: 'alice' },
    'El asesor no contestó. Deja tu recado después del tono.');
  twiml.record({
    maxLength: 60,
    playBeep: true,
    recordingStatusCallback: `${BASE_PUBLIC_URL}/voice/voicemail/saved`,
  });
  res.type('text/xml').send(twiml.toString());
});
```

---

## 🔹 Flujo con IA de ElevenLabs

1. Durante la marcación, la IA puede decir:
   > “Estoy comunicándote con Jesús, espera un momento mientras verifico su disponibilidad.”
2. Si no contesta:
   > “No logró contestar, ¿quieres que le deje tu recado?”
3. El backend redirige a `/voice/voicemail` o guarda el recado con transcripción.

> 💡 Si ya tienen la integración de ElevenLabs en otra parte del sistema, simplemente **actualicen el flujo de llamadas para seguir esta estructura**.

---

## 🔹 Consideraciones

- No usar `Dial` plano de Twilio (pierde control de la llamada).
- Mantener `Conference` bajo el backend.
- IA siempre mantiene el contexto (stream activo).
- Música y voz IA pueden coexistir si se mezclan o se alternan.

---

## 🔹 Beneficios

✅ El cliente nunca escucha voz operativa de Twilio.\
✅ Se puede personalizar la música y los mensajes IA.\
✅ Fallback natural: la IA retoma la conversación.\
✅ Experiencia profesional y fluida para el usuario.

---

## 🔹 Próximos pasos sugeridos

1. Integrar este flujo como **prueba de concepto (POC)**.
2. Validar latencias y manejo de eventos.
3. Unificar el control de Leg A y Leg B dentro del **call controller** existente.
4. Extenderlo a escenarios multiagente (routing inteligente, colas, etc.).

---

## 🧠 Frases de ejemplo para la IA

- **Durante el desvío:** “Estoy contactando al asesor, por favor espera un momento. Te dejo una melodía mientras tanto.”
- **Si no contesta:** “Parece que no pudo responder, ¿quieres que le deje tu recado o te devuelva la llamada más tarde?”
- **Al dejar recado:** “Deja tu mensaje después del tono y con gusto se lo haré llegar.”

---

> 📘 Este documento puede compartirse internamente con el equipo backend de Virtual Voices / ElevenLabs para revisar la propuesta de flujo y adaptar el código según la arquitectura actual.

