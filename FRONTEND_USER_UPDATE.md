# Actualización de Usuarios desde el Frontend

## Estado actual de la API
- **No existe un endpoint para actualizar usuarios por ID** (ejemplo: `PUT /api/core/users/:id`).
- **Solo se puede actualizar el perfil del usuario autenticado** usando:
  ```
  PUT /api/core/users/me/update
  ```

## ¿Qué puede hacer el frontend?
- Permitir que cada usuario actualice su propio nombre y/o contraseña desde su perfil.
- No es posible (por ahora) que un administrador actualice a otros usuarios desde el frontend.

## Ejemplo de uso
```http
PUT /api/core/users/me/update
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "Nuevo Nombre",
  "password": "nuevapassword123"
}
```

## Notas
- Si se requiere actualizar usuarios por ID (como admin), se debe implementar un endpoint adicional en el backend.
- Si tienes dudas o necesitas este endpoint, avisa al equipo backend. 