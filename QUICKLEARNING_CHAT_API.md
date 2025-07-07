# Endpoints de Chat para Quick Learning (Frontend)

Estos son los endpoints principales para el diseño del inbox/chat en el frontend. Todos requieren el parámetro `companySlug=quicklearning`.

---

## 1. Listar usuarios/prospectos con su último mensaje

**GET** `/api/quicklearning/twilio/usuarios?companySlug=quicklearning&tableSlugs=prospectos,clientes`

- Devuelve una lista de usuarios (prospectos, clientes, etc.) de las tablas indicadas.
- Cada usuario incluye su nombre, teléfono, último mensaje y de qué tabla viene.

**Ejemplo de respuesta:**
```json
[
  {
    "_id": "...",
    "name": "Cesar Orlando Magaña",
    "phone": "5214521311888",
    "lastMessage": {
      "body": "Hola!",
      "date": "2025-05-18T04:33:00.326Z",
      "respondedBy": "human"
    },
    "tableSlug": "prospectos"
  },
  ...
]
```

---

## 2. Obtener historial de chat de un usuario

**GET** `/api/quicklearning/twilio/chat?companySlug=quicklearning&phone=5214521311888`

- Devuelve el historial completo de mensajes del chat para el teléfono indicado.
- El teléfono debe ser exactamente igual al guardado en la base de datos (ej: `5214521311888`).

**Ejemplo de respuesta:**
```json
[
  {
    "direction": "inbound",
    "body": "hola!",
    "respondedBy": "human",
    "_id": "68242156534d273327baaf80",
    "dateCreated": "2025-05-14T04:51:34.266Z"
  },
  {
    "direction": "outbound-api",
    "body": "Inglés en Quick Learning, ¡Hablas o Hablas! Soy NatalIA, ¿Cómo te puedo ayudar hoy?",
    "respondedBy": "bot",
    "_id": "68242158534d273327baaf86",
    "dateCreated": "2025-05-14T04:51:36.979Z"
  }
]
```

---

## Notas importantes
- Siempre usa `companySlug=quicklearning` en todos los endpoints.
- El campo `phone` debe coincidir exactamente con el guardado en la base de datos.
- Si el chat no existe, la respuesta será `{ "error": "Chat not found" }`.

---

Cualquier duda sobre los endpoints, consulta Swagger en `/api-docs` o pregunta al backend. 