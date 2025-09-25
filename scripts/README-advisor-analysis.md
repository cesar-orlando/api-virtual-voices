# Análisis de Tiempos de Respuesta de Asesores - QuickLearning

Este conjunto de scripts te permite analizar los tiempos de respuesta de los asesores en QuickLearning.

## Scripts Disponibles

### 1. `advisor-response-times.js`
Analiza los tiempos de respuesta de todos los asesores y genera un reporte completo.

**Uso:**
```bash
node scripts/advisor-response-times.js
```

**Qué hace:**
- Calcula el tiempo promedio de respuesta de cada asesor
- Muestra estadísticas como mediana, respuesta más rápida/lenta
- Categoriza respuestas (≤5s, ≤30s, >1min)
- Genera un ranking de los asesores más rápidos

### 2. `list-advisors.js`
Lista todos los asesores disponibles con sus IDs para usar en otros scripts.

**Uso:**
```bash
node scripts/list-advisors.js
```

**Qué hace:**
- Muestra todos los asesores activos de QuickLearning
- Proporciona sus IDs para usar en otros análisis
- Muestra información básica como email y fechas

### 3. `advisor-conversations.js`
Analiza las conversaciones específicas de un asesor individual.

**Uso:**
```bash
node scripts/advisor-conversations.js [ID_DEL_ASESOR]
```

**Ejemplo:**
```bash
node scripts/advisor-conversations.js 507f1f77bcf86cd799439011
```

**Qué hace:**
- Analiza todas las conversaciones de un asesor específico
- Muestra estadísticas por conversación
- Calcula tiempos de respuesta individuales
- Proporciona un resumen del desempeño del asesor

## Cómo Usar

1. **Primero, lista los asesores:**
   ```bash
   node scripts/list-advisors.js
   ```

2. **Analiza todos los asesores:**
   ```bash
   node scripts/advisor-response-times.js
   ```

3. **Analiza un asesor específico:**
   ```bash
   node scripts/advisor-conversations.js [ID_DEL_ASESOR]
   ```

## Métricas Incluidas

### Por Asesor:
- **Tiempo promedio de respuesta**: Tiempo promedio entre mensaje del cliente y respuesta del asesor
- **Tiempo mediano**: Valor medio de todos los tiempos de respuesta
- **Respuesta más rápida/lenta**: Extremos del rango de tiempos
- **Categorización**: Porcentaje de respuestas en diferentes rangos de tiempo
- **Total de respuestas**: Número total de respuestas analizadas

### Por Conversación:
- **Tiempo promedio por chat**: Tiempo promedio de respuesta en cada conversación
- **Número de mensajes**: Total de mensajes y mensajes del asesor
- **Fechas**: Inicio y último mensaje de la conversación
- **Respuestas analizadas**: Número de interacciones cliente-asesor

## Interpretación de Resultados

### Tiempos de Respuesta:
- **≤ 5 segundos**: Excelente (respuesta inmediata)
- **≤ 30 segundos**: Muy bueno (respuesta rápida)
- **> 1 minuto**: Necesita mejora (respuesta lenta)

### Rankings:
- Los asesores se ordenan por número total de respuestas
- El top 3 muestra los asesores más rápidos (mínimo 5 respuestas)
- Las estadísticas generales muestran el desempeño del equipo completo

## Requisitos

- Node.js instalado
- Acceso a la base de datos de QuickLearning
- Variables de entorno configuradas (MONGO_URI)

## Notas Técnicas

- Solo se analizan respuestas con tiempo positivo y menor a 24 horas
- Se excluyen respuestas automáticas del bot
- Los tiempos se calculan entre mensajes del cliente (inbound) y respuestas del asesor (outbound-api)
- Se requiere que el asesor esté marcado como "asesor" en el campo `respondedBy`

## Solución de Problemas

Si no encuentras datos:
1. Verifica que existan chats con asesores asignados
2. Confirma que los mensajes tengan `respondedBy: "asesor"`
3. Revisa que la conexión a la base de datos sea correcta
4. Asegúrate de que los asesores estén activos en el sistema
