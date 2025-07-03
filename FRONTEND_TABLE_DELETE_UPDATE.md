# Actualización: Eliminación de Tablas y Registros Asociados

## Cambios en la API
- **Al eliminar una tabla:**
  - Se eliminan automáticamente **todos los registros asociados** a esa tabla (por `tableSlug` y `c_name`).
  - Se registra **quién eliminó la tabla** y **la fecha de eliminación**.

## ¿Qué debe hacer el frontend?
- Al hacer la petición de eliminación de tabla (`DELETE /api/tables/:c_name/:id`),
  - Enviar en el body el campo:
    ```json
    { "deletedBy": "usuario@dominio.com" }
    ```
  - El backend responderá con:
    - El usuario que eliminó la tabla (`deletedBy`)
    - La fecha de eliminación (`deletedAt`)
    - El número de registros eliminados (`recordsDeleted`)

## Ejemplo de uso
```http
DELETE /api/tables/quicklearning/ID_DE_LA_TABLA
Content-Type: application/json

{
  "deletedBy": "admin@quicklearning.com"
}
```

---

**¡Importante!**
- El frontend debe pedir confirmación al usuario antes de eliminar, ya que esta acción borra todos los registros de la tabla. 