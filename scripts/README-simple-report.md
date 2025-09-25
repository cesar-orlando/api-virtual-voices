# 📊 Reporte Simple de Tiempos de Respuesta de Asesores

Este script genera un reporte simple y directo de los tiempos de respuesta de los asesores en QuickLearning.

## 🎯 Formato del Reporte

El script genera exactamente lo que necesitas:

```
Cesar | Tiempo de respuesta: 5 minutos
María | Tiempo de respuesta: 3 minutos
Juan | Tiempo de respuesta: 8 minutos
```

## 🚀 Cómo Usar

### 1. Primero, prueba la conexión:
```bash
node scripts/test-connection.js
```

### 2. Si la conexión funciona, genera el reporte:
```bash
node scripts/quick-advisor-report.js
```

### 3. Si necesitas configurar la URI de MongoDB:
```bash
MONGO_URI="tu_uri_mongodb" node scripts/quick-advisor-report.js
```

## 📋 Requisitos

- Node.js instalado
- Acceso a la base de datos de QuickLearning
- Variable de entorno `MONGO_URI` configurada (opcional)

## 🔧 Configuración

### Opción 1: Usar archivo .env
Crea un archivo `.env` en la raíz del proyecto:
```
MONGO_URI=mongodb://localhost:27017/quicklearning
```

### Opción 2: Pasar como parámetro
```bash
MONGO_URI="mongodb://localhost:27017/quicklearning" node scripts/quick-advisor-report.js
```

### Opción 3: Usar MongoDB Atlas
```bash
MONGO_URI="mongodb+srv://usuario:password@cluster.mongodb.net/quicklearning" node scripts/quick-advisor-report.js
```

## 📊 Qué Mide el Script

El script calcula el tiempo entre:
- **Mensaje del cliente** → **Respuesta del asesor**
- Solo considera respuestas marcadas como `respondedBy: "asesor"`
- Excluye respuestas automáticas del bot
- Solo cuenta tiempos positivos y menores a 24 horas

## 🎨 Formato del Output

```
📈 TIEMPOS DE RESPUESTA DE ASESORES - QUICKLEARNING
============================================================

👥 REPORTE DE ASESORES:
------------------------------------------------------------
Cesar | Tiempo de respuesta: 5 minutos
María | Tiempo de respuesta: 3 minutos
Juan | Tiempo de respuesta: 8 minutos

📊 RESUMEN:
Total asesores: 3
Total respuestas: 45
Tiempo promedio general: 5 minutos
```

## 🖼️ Para Screenshot

El formato está diseñado para ser fácil de capturar en screenshot:
- Formato limpio y directo
- Información clara por asesor
- Resumen estadístico al final
- Fácil de leer para el cliente

## ❌ Solución de Problemas

### Error de conexión:
```
❌ Error generando reporte: connect ECONNREFUSED
```
**Solución:** Verifica que MongoDB esté corriendo y la URI sea correcta.

### No se encuentran asesores:
```
❌ No se encontraron asesores con respuestas registradas
```
**Solución:** Verifica que:
- Existan chats con asesores asignados
- Los mensajes tengan `respondedBy: "asesor"`
- Los asesores hayan respondido mensajes

### Error de módulos:
```
❌ Cannot find module
```
**Solución:** Asegúrate de estar en el directorio correcto del proyecto.

## 🎉 Resultado Final

Una vez que funcione, obtendrás un reporte limpio que puedes capturar en screenshot y enviar directamente al cliente, mostrando exactamente:

**Nombre del Asesor | Tiempo de respuesta promedio**

¡Perfecto para reportes rápidos y profesionales! 🚀
