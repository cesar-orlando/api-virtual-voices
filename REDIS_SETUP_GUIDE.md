# Redis Setup - Guía Rápida

## ¿Necesitas Redis?

### SIN Redis (Básico):
✅ **Funciona**: Endpoints HTTP, WhatsApp, DB queries  
⚠️ **Limitación**: Notificaciones en tiempo real pueden no llegar a todos los usuarios

### CON Redis (Completo):
✅ **Funciona TODO**: Endpoints HTTP, WhatsApp, DB queries  
✅ **Notificaciones reales**: Funcionan entre todos los workers

---

## Setup en Render.com

### Opción 1: Sin Redis (Más simple)
No hagas nada. El servidor funcionará sin Redis.

### Opción 2: Con Redis (Recomendado)

1. **Crear Redis en Render:**
   - Ve a dashboard de Render
   - Click "New +" → "Redis"
   - Nombre: `virtual-voices-redis` (o como quieras)
   - Plan: Free tier está bien
   - Click "Create Redis"

2. **Copiar la URL de Redis:**
   - Render te dará una URL como: `redis://red-xxx-xxx:6379`

3. **Agregar al .env del servidor:**
   ```env
   REDIS_URL=redis://red-xxx-xxx:6379
   ```

4. **Variables de entorno en Render:**
   - Ve a tu servicio de API
   - "Environment" tab
   - Click "Add Environment Variable"
   - Key: `REDIS_URL`
   - Value: `redis://red-xxx-xxx:6379`

---

## Revisión: Código Actual

El código ya está configurado para usar Redis **si está disponible**:

```typescript
// src/server.ts
async function setupRedisAdapter() {
  if (process.env.REDIS_URL) {
    // Usa Redis si está configurado
  } else {
    // Funciona sin Redis (con limitaciones)
  }
}
```

**Traducción**: Si tienes `REDIS_URL` configurado → usa Redis. Si NO → funciona igual pero sin notificaciones cross-worker.

---

## Recomendación

### Para empezar:
**NO configures Redis**. Prueba el servidor sin Redis primero.

Si ves que las notificaciones en tiempo real NO funcionan bien → configura Redis.

Si las notificaciones funcionan bien → no necesitas Redis.

---

## Cómo saber si necesitas Redis

Si tus usuarios usan mucho:
- Notificaciones push en tiempo real
- Chat en vivo
- Actualizaciones instantáneas de status

→ **SÍ necesitas Redis**

Si tus usuarios solo hacen:
- Requests HTTP normales
- Consultas a la DB
- Subida de archivos

→ **NO necesitas Redis**

