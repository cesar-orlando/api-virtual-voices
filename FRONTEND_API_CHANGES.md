# Cambios en la API para Soporte Multiempresa (QuickLearning y Otras Empresas)

## Resumen
La API ahora soporta múltiples empresas (por ejemplo, `quicklearning`, `test`, etc.), cada una con su propia base de datos y separación total de datos. Esto afecta la forma en que se consultan y crean tablas, registros y usuarios.

---

## Endpoints Relevantes

### 1. **Tablas Dinámicas**
- **Obtener todas las tablas de una empresa:**
  ```
  GET /api/tables/:c_name
  ```
  - Ejemplo para QuickLearning: `/api/tables/quicklearning`
  - Ejemplo para otra empresa: `/api/tables/test`

- **Crear una nueva tabla:**
  ```
  POST /api/tables/
  ```
  - Body debe incluir el campo `c_name` con el nombre de la empresa.
  - Ejemplo de body para QuickLearning:
    ```json
    {
      "name": "Mi Tabla",
      "slug": "mi-tabla",
      "icon": "📋",
      "c_name": "quicklearning",
      "createdBy": "admin@quicklearning.com",
      "fields": [
        { "name": "campo1", "label": "Campo 1", "type": "text", "order": 1 }
      ]
    }
    ```

### 2. **Registros Dinámicos**
- **Obtener todos los registros de una tabla:**
  ```
  GET /api/records/table/:c_name/:tableSlug
  ```
  - Ejemplo: `/api/records/table/quicklearning/test-tabla`

- **Crear un registro:**
  ```
  POST /api/records/
  ```
  - Body debe incluir `c_name` y `tableSlug`.

### 3. **Usuarios**
- **Obtener usuarios de una empresa:**
  ```
  GET /api/core/users/?companySlug=quicklearning
  ```

---

## Consideraciones para el Frontend
- **Siempre enviar el parámetro/campo `c_name` o `companySlug`** según corresponda para asegurar que los datos se consulten/creen en la empresa correcta.
- **Los endpoints son los mismos para todas las empresas**, solo cambia el valor de `c_name`/`companySlug`.
- **Los datos de cada empresa están completamente aislados**: no se mezclan registros, tablas ni usuarios entre empresas.
- **Si no se especifica `c_name` o se usa un valor incorrecto, la API puede devolver datos vacíos o error.**

---

## Ejemplo de flujo para QuickLearning
1. Login → obtener `companySlug` del usuario.
2. Consultar tablas: `GET /api/tables/quicklearning`
3. Crear tabla: `POST /api/tables/` con `c_name: "quicklearning"` en el body.
4. Consultar registros: `GET /api/records/table/quicklearning/:tableSlug`
5. Crear registro: `POST /api/records/` con `c_name: "quicklearning"` y `tableSlug` en el body.

---

## Notas
- Si migran datos viejos, asegúrense de que tengan el campo `c_name` correcto y `isActive: true` para que aparezcan en la API.
- Si tienen dudas sobre algún endpoint, pueden consultar la documentación de rutas o pedir ejemplos específicos.

---

¡Cualquier duda, el equipo backend está disponible para ayudarles! 