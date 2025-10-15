# 📊 Guía de Descarga de Excel - Prospectos QuickLearning

## 🚀 Endpoints Disponibles

### 1. Descargar Excel de Prospectos
**URL:** `GET /api/quicklearning/excel/prospectos`

**Descripción:** Descarga un archivo Excel con todos los prospectos de QuickLearning.

#### Parámetros de Consulta (Query Parameters)

| Parámetro | Tipo | Requerido | Descripción | Ejemplo |
|-----------|------|-----------|-------------|---------|
| `startDate` | string | No | Fecha de inicio (YYYY-MM-DD) | `2025-01-01` |
| `endDate` | string | No | Fecha de fin (YYYY-MM-DD) | `2025-01-31` |
| `medio` | string | No | Filtrar por medio específico | `META`, `GOOGLE`, `ORGANICO` |
| `campana` | string | No | Filtrar por campaña específica | `General`, `Virtual`, `Google` |
| `limit` | number | No | Límite de registros (default: 10000) | `5000` |

#### Ejemplos de Uso

```bash
# Descargar todos los prospectos
GET /api/quicklearning/excel/prospectos

# Filtrar por rango de fechas
GET /api/quicklearning/excel/prospectos?startDate=2025-01-01&endDate=2025-01-31

# Filtrar por medio específico
GET /api/quicklearning/excel/prospectos?medio=META

# Filtrar por campaña específica
GET /api/quicklearning/excel/prospectos?campana=Virtual

# Combinar filtros
GET /api/quicklearning/excel/prospectos?startDate=2025-01-01&endDate=2025-01-31&medio=META&campana=Virtual&limit=1000
```

#### Respuesta
- **Content-Type:** `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- **Content-Disposition:** `attachment; filename="prospectos-quicklearning-YYYY-MM-DD.xlsx"`
- **Archivo:** Excel con las siguientes columnas:
  - **Número:** Número de teléfono del prospecto
  - **Medio:** Medio de contacto (META, GOOGLE, ORGANICO, etc.)
  - **Campaña:** Campaña específica
  - **Nombre:** Nombre del prospecto
  - **Fecha Creación:** Fecha cuando se creó el registro
  - **Fecha Actualización:** Fecha de la última actualización

### 2. Obtener Estadísticas
**URL:** `GET /api/quicklearning/excel/stats`

**Descripción:** Obtiene estadísticas de prospectos en formato JSON.

#### Parámetros de Consulta

| Parámetro | Tipo | Requerido | Descripción | Ejemplo |
|-----------|------|-----------|-------------|---------|
| `startDate` | string | No | Fecha de inicio (YYYY-MM-DD) | `2025-01-01` |
| `endDate` | string | No | Fecha de fin (YYYY-MM-DD) | `2025-01-31` |

#### Ejemplo de Respuesta

```json
{
  "success": true,
  "data": {
    "totalProspectos": 8579,
    "porMedio": [
      {
        "medio": "META",
        "count": 4500,
        "percentage": "52.4"
      },
      {
        "medio": "GOOGLE",
        "count": 2500,
        "percentage": "29.1"
      }
    ],
    "porCampana": [
      {
        "campana": "General",
        "count": 3000,
        "percentage": "35.0"
      },
      {
        "campana": "Virtual",
        "count": 2000,
        "percentage": "23.3"
      }
    ],
    "porMes": [
      {
        "mes": "enero 2025",
        "count": 4000,
        "percentage": "46.6"
      }
    ],
    "fechaGeneracion": "2025-01-15T10:30:00.000Z"
  }
}
```

## 🌐 Uso desde el Navegador

### Opción 1: Enlace Directo
```html
<a href="/api/quicklearning/excel/prospectos" download>
  📊 Descargar Excel de Prospectos
</a>
```

### Opción 2: Con Filtros
```html
<a href="/api/quicklearning/excel/prospectos?startDate=2025-01-01&endDate=2025-01-31&medio=META" download>
  📊 Descargar Prospectos META de Enero
</a>
```

### Opción 3: JavaScript (Fetch)
```javascript
async function downloadExcel(filters = {}) {
  const params = new URLSearchParams(filters);
  const url = `/api/quicklearning/excel/prospectos?${params}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Error descargando archivo');
    
    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `prospectos-${new Date().toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);
  } catch (error) {
    console.error('Error:', error);
  }
}

// Ejemplos de uso
downloadExcel(); // Todos los prospectos
downloadExcel({ startDate: '2025-01-01', endDate: '2025-01-31' }); // Por fechas
downloadExcel({ medio: 'META', campana: 'Virtual' }); // Por medio y campaña
```

## 📱 Uso desde Aplicaciones Móviles

### React Native
```javascript
import { Linking } from 'react-native';

const downloadExcel = async () => {
  const url = 'https://tu-api.com/api/quicklearning/excel/prospectos';
  await Linking.openURL(url);
};
```

### Flutter
```dart
import 'package:url_launcher/url_launcher.dart';

Future<void> downloadExcel() async {
  final url = 'https://tu-api.com/api/quicklearning/excel/prospectos';
  if (await canLaunch(url)) {
    await launch(url);
  }
}
```

## 🔧 Configuración del Servidor

### Variables de Entorno Requeridas
```bash
MONGO_URI_QUICKLEARNING=mongodb://...
```

### Dependencias Instaladas
```json
{
  "xlsx": "^0.18.5"
}
```

## 📊 Límites y Consideraciones

- **Límite por defecto:** 10,000 registros
- **Límite máximo:** Configurable via parámetro `limit`
- **Formato de fechas:** YYYY-MM-DD
- **Zona horaria:** UTC
- **Compresión:** Habilitada para archivos grandes

## 🚨 Manejo de Errores

### Errores Comunes

| Error | Código | Descripción | Solución |
|-------|--------|-------------|----------|
| `Invalid date format` | 400 | Formato de fecha inválido | Usar formato YYYY-MM-DD |
| `Database connection error` | 500 | Error de conexión a BD | Verificar MONGO_URI_QUICKLEARNING |
| `Too many records` | 400 | Límite excedido | Reducir rango de fechas o usar filtros |

### Respuesta de Error
```json
{
  "success": false,
  "message": "Error generando archivo Excel",
  "error": "Descripción del error específico"
}
```

## 🎯 Casos de Uso Comunes

### 1. Reporte Mensual para Jefes
```bash
GET /api/quicklearning/excel/prospectos?startDate=2025-01-01&endDate=2025-01-31
```

### 2. Análisis por Medio
```bash
GET /api/quicklearning/excel/prospectos?medio=META
```

### 3. Campaña Específica
```bash
GET /api/quicklearning/excel/prospectos?campana=Virtual&startDate=2025-01-01
```

### 4. Muestra Pequeña para Pruebas
```bash
GET /api/quicklearning/excel/prospectos?limit=100
```

## 📈 Próximas Mejoras

- [ ] Filtros adicionales por nombre, email, etc.
- [ ] Exportación a otros formatos (CSV, PDF)
- [ ] Programación de reportes automáticos
- [ ] Dashboard con gráficos interactivos
- [ ] Comparativas entre períodos

---

**💡 Tip:** Para obtener el mejor rendimiento, usa filtros específicos en lugar de descargar todos los registros.
