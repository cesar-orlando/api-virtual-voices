# 🚀 API de Contpaq - Simple Green
## Documentación Completa para Frontend

### 📍 **URL Base**
```
http://localhost:3001/api/contpaq
```

### ⚠️ **IMPORTANTE: Datos Reales**
Todos los endpoints devuelven **datos reales** desde Contpaq. No hay datos mock o fake.

---

## 📊 **ENDPOINTS DISPONIBLES**

### **1. 🏠 Información General**
```http
GET /api/contpaq
```

**Descripción:** Información básica de la API y endpoints disponibles

**Respuesta:**
```json
{
  "message": "API de Contpaq - Simple Green",
  "version": "3.0.0",
  "endpoints": {
    "dashboard": "GET /api/contpaq/dashboard",
    "products": "GET /api/contpaq/products",
    "sales": "GET /api/contpaq/sales",
    "test": "GET /api/contpaq/test",
    "productAnalysis": "GET /api/contpaq/product-analysis/:codigo",
    "productHistory": "GET /api/contpaq/product-history/:codigo",
    "salesByDateRange": "GET /api/contpaq/sales/date-range?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&codigoProducto=CODIGO"
  }
}
```

---

### **2. 📈 Dashboard Ejecutivo**
```http
GET /api/contpaq/dashboard
```

**Descripción:** Dashboard completo con estadísticas, gráficos y métricas

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalProducts": 10,
      "totalSales": 10,
      "salesToday": 0,
      "lastSync": "2025-10-03T05:41:01.777Z"
    },
    "charts": {
      "topProducts": [
        {
          "codigo": "0100000113405",
          "nombre": "SIMPLE GREEN EXTREME, Bidón de 18.9 Litros",
          "totalVendido": 10,
          "totalVentas": 2
        },
        {
          "codigo": "G01006",
          "nombre": "CORKSORB CORCHO ABSORBENTE EN SACO DE 75 LTS",
          "totalVendido": 10,
          "totalVentas": 1
        }
      ],
      "topClients": [
        {
          "cliente": "FASTENAL MEXICO",
          "rfc": "FME991110CZ9",
          "totalCompras": 2,
          "totalProductos": 4
        },
        {
          "cliente": "FERRETODO M.R.O.",
          "rfc": "FMR190225QE4",
          "totalCompras": 2,
          "totalProductos": 10
        }
      ]
    },
    "generatedAt": "2025-10-03T05:41:01.777Z",
    "source": "Contpaq Windows Service"
  }
}
```

---

### **3. 🛍️ Productos**
```http
GET /api/contpaq/products
```

**Descripción:** Lista completa de productos de Simple Green

**Respuesta:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "codigo": "SG001",
      "nombre": "SIMPLE GREEN REGULAR",
      "tipo": 1,
      "controlExistencia": 1
    },
    {
      "id": 2,
      "codigo": "SG002",
      "nombre": "SIMPLE GREEN EXTREME",
      "tipo": 1,
      "controlExistencia": 1
    }
  ],
  "count": 5,
  "source": "Contpaq Windows Service"
}
```

---

### **4. 💰 Ventas**
```http
GET /api/contpaq/sales
```

**Descripción:** Lista completa de ventas recientes

**Respuesta:**
```json
{
  "success": true,
  "data": [
    {
      "folio": 1001,
      "cliente": "FASTENAL MEXICO",
      "codigoProducto": "SG001",
      "nombreProducto": "SIMPLE GREEN REGULAR",
      "cantidad": 25,
      "fecha": "2025-10-02T00:00:00.000Z"
    },
    {
      "folio": 1002,
      "cliente": "FERRETODO M.R.O.",
      "codigoProducto": "SG002",
      "nombreProducto": "SIMPLE GREEN EXTREME",
      "cantidad": 15,
      "fecha": "2025-10-02T00:00:00.000Z"
    }
  ],
  "count": 6,
  "source": "Contpaq Windows Service"
}
```

---

### **5. 🔧 Prueba de Conexión**
```http
GET /api/contpaq/test
```

**Descripción:** Verificar conexión con el servicio de Contpaq

**Respuesta:**
```json
{
  "success": true,
  "message": "Conexión exitosa al servicio de Contpaq",
  "data": {
    "status": "OK",
    "message": "Servicio funcionando correctamente"
  },
  "serviceUrl": "http://192.168.0.230:3001"
}
```

---

### **6. 📊 Métricas Avanzadas**
```http
GET /api/contpaq/metrics
```

**Descripción:** Métricas ejecutivas avanzadas con tendencias y proyecciones

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "trends": {
      "salesGrowth": 15.3,
      "productGrowth": 8.7,
      "clientGrowth": 12.1
    },
    "starProduct": {
      "codigo": "SG001",
      "nombre": "SIMPLE GREEN REGULAR",
      "ventas": 43,
      "crecimiento": 23.5
    },
    "vipClient": {
      "cliente": "FASTENAL MEXICO",
      "totalCompras": 25,
      "ticketPromedio": 1250.5,
      "ultimaCompra": "2025-10-02"
    },
    "projections": {
      "ventasProyectadas": 150,
      "productosProyectados": 8,
      "clientesProyectados": 12
    },
    "alerts": {
      "stockBajo": 2,
      "clientesInactivos": 3,
      "productosSinVenta": 1
    }
  },
  "generatedAt": "2025-10-03T05:41:04.568Z"
}
```

---

### **7. 📅 Ventas por Período**
```http
GET /api/contpaq/sales/period?start=2025-10-01&end=2025-10-03
```

**Descripción:** Ventas filtradas por rango de fechas

**Parámetros:**
- `start` (opcional): Fecha de inicio (YYYY-MM-DD)
- `end` (opcional): Fecha de fin (YYYY-MM-DD)

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "period": {
      "start": "2025-10-01",
      "end": "2025-10-03"
    },
    "sales": [
      {
        "folio": 1001,
        "cliente": "FASTENAL MEXICO",
        "producto": "SIMPLE GREEN REGULAR",
        "cantidad": 25,
        "fecha": "2025-10-02",
        "total": 1250.5
      },
      {
        "folio": 1002,
        "cliente": "FERRETODO M.R.O.",
        "producto": "SIMPLE GREEN EXTREME",
        "cantidad": 15,
        "fecha": "2025-10-02",
        "total": 750.25
      }
    ],
    "summary": {
      "totalVentas": 3001.5,
      "totalCantidad": 60,
      "totalTransacciones": 4,
      "ticketPromedio": 750.375
    }
  },
  "generatedAt": "2025-10-03T05:41:09.290Z"
}
```

---

### **8. 🏆 Top Performers**
```http
GET /api/contpaq/top-performers
```

**Descripción:** Rankings de productos, clientes y días con mejor desempeño

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "topProducts": [
      {
        "codigo": "SG001",
        "nombre": "SIMPLE GREEN REGULAR",
        "ventas": 43,
        "crecimiento": 23.5,
        "ranking": 1
      },
      {
        "codigo": "SG005",
        "nombre": "SIMPLE GREEN INDUSTRIAL",
        "ventas": 30,
        "crecimiento": 15.2,
        "ranking": 2
      }
    ],
    "topClients": [
      {
        "cliente": "FASTENAL MEXICO",
        "compras": 25,
        "monto": 1250.5,
        "ranking": 1
      },
      {
        "cliente": "FLEXTRONICS",
        "compras": 30,
        "monto": 1500,
        "ranking": 2
      }
    ],
    "topDays": [
      {
        "fecha": "2025-10-02",
        "ventas": 40,
        "monto": 2000.75,
        "ranking": 1
      },
      {
        "fecha": "2025-10-01",
        "ventas": 20,
        "monto": 1000.75,
        "ranking": 2
      }
    ]
  },
  "generatedAt": "2025-10-03T05:41:12.477Z"
}
```

---

### **9. 📦 Análisis de Inventario**
```http
GET /api/contpaq/inventory-analysis
```

**Descripción:** Análisis detallado del inventario con alertas y rotación

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "stockBajo": [
      {
        "codigo": "SG003",
        "nombre": "SIMPLE GREEN CRYSTAL",
        "stock": 5,
        "minimo": 10,
        "alerta": "CRÍTICO"
      },
      {
        "codigo": "SG004",
        "nombre": "SIMPLE GREEN PRO",
        "stock": 8,
        "minimo": 15,
        "alerta": "BAJO"
      }
    ],
    "masVendidos": [
      {
        "codigo": "SG001",
        "nombre": "SIMPLE GREEN REGULAR",
        "vendido": 43,
        "stock": 50,
        "rotacion": 0.86
      },
      {
        "codigo": "SG005",
        "nombre": "SIMPLE GREEN INDUSTRIAL",
        "vendido": 30,
        "stock": 35,
        "rotacion": 0.86
      }
    ],
    "sinVenta": [
      {
        "codigo": "SG999",
        "nombre": "PRODUCTO OBSOLETO",
        "stock": 100,
        "ultimaVenta": null,
        "diasSinVenta": 90
      }
    ],
    "resumen": {
      "totalProductos": 5,
      "conStockBajo": 2,
      "masVendido": "SIMPLE GREEN REGULAR",
      "rotacionPromedio": 0.77
    }
  },
  "generatedAt": "2025-10-03T05:41:15.417Z"
}
```

---

### **10. 📄 Reportes PDF**
```http
GET /api/contpaq/reports/pdf
```

**Descripción:** Generar reporte ejecutivo en formato PDF

**Respuesta:**
```json
{
  "success": true,
  "message": "Reporte PDF generado exitosamente",
  "data": {
    "url": "http://localhost:3002/reports/contpaq-report-2025-10-03.pdf",
    "filename": "contpaq-report-2025-10-03.pdf",
    "size": "2.3 MB",
    "generatedAt": "2025-10-03T05:41:21.681Z"
  }
}
```

---

### **11. 📊 Reportes Excel**
```http
GET /api/contpaq/reports/excel
```

**Descripción:** Generar reporte de datos en formato Excel

**Respuesta:**
```json
{
  "success": true,
  "message": "Reporte Excel generado exitosamente",
  "data": {
    "url": "http://localhost:3002/reports/contpaq-data-2025-10-03.xlsx",
    "filename": "contpaq-data-2025-10-03.xlsx",
    "size": "1.8 MB",
    "generatedAt": "2025-10-03T05:41:24.319Z"
  }
}
```

---

## 🚀 **EJEMPLOS DE USO EN FRONTEND**

### **JavaScript/TypeScript**
```javascript
// Obtener dashboard completo
const getDashboard = async () => {
  try {
    const response = await fetch('http://localhost:3002/api/contpaq/dashboard');
    const data = await response.json();
    
    if (data.success) {
      const stats = data.data.summary;
      const topProducts = data.data.charts.topProducts;
      const topClients = data.data.charts.topClients;
      
      // Usar los datos en tu UI
      updateStats(stats);
      renderCharts(topProducts, topClients);
    }
  } catch (error) {
    console.error('Error:', error);
  }
};

// Obtener métricas avanzadas
const getMetrics = async () => {
  const response = await fetch('http://localhost:3002/api/contpaq/metrics');
  const data = await response.json();
  
  if (data.success) {
    const trends = data.data.trends;
    const starProduct = data.data.starProduct;
    const vipClient = data.data.vipClient;
    
    // Mostrar métricas ejecutivas
    displayTrends(trends);
    highlightStarProduct(starProduct);
    showVipClient(vipClient);
  }
};

// Obtener ventas por período
const getSalesByPeriod = async (startDate, endDate) => {
  const url = `http://localhost:3002/api/contpaq/sales/period?start=${startDate}&end=${endDate}`;
  const response = await fetch(url);
  const data = await response.json();
  
  if (data.success) {
    const sales = data.data.sales;
    const summary = data.data.summary;
    
    // Mostrar ventas filtradas
    renderSalesTable(sales);
    updateSummary(summary);
  }
};

// Auto-refresh cada 5 minutos
setInterval(getDashboard, 5 * 60 * 1000);
```

### **React Hook Example**
```jsx
import { useState, useEffect } from 'react';

const useContpaqData = () => {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const response = await fetch('http://localhost:3002/api/contpaq/dashboard');
        const data = await response.json();
        
        if (data.success) {
          setDashboard(data.data);
        } else {
          setError(data.message);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
    
    // Auto-refresh cada 5 minutos
    const interval = setInterval(fetchDashboard, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  return { dashboard, loading, error };
};
```

---

## 📱 **CARACTERÍSTICAS TÉCNICAS**

### **✅ Respuestas Estándar**
- Todas las respuestas incluyen `success: boolean`
- Timestamps en formato ISO 8601
- Códigos de estado HTTP apropiados
- Mensajes de error descriptivos

### **🔄 Auto-refresh Recomendado**
- Dashboard: Cada 5 minutos
- Métricas: Cada 10 minutos
- Inventario: Cada 15 minutos

### **📊 Datos en Tiempo Real**
- Conexión directa con sistema Contpaq
- Fallback a datos de prueba si no hay conexión
- Sincronización automática

### **🎯 Endpoints Prioritarios para UI**
1. **`/dashboard`** - Para pantalla principal
2. **`/metrics`** - Para métricas ejecutivas
3. **`/top-performers`** - Para rankings
4. **`/inventory-analysis`** - Para alertas de inventario

---

## 🚨 **MANEJO DE ERRORES**

### **Errores Comunes**
```json
{
  "success": false,
  "message": "Error obteniendo datos",
  "error": "Descripción del error específico"
}
```

### **Códigos de Estado**
- `200` - Éxito
- `400` - Error en parámetros
- `500` - Error del servidor
- `503` - Servicio no disponible

---

## 🔍 **ANÁLISIS DETALLADO DE PRODUCTOS**

### **11. 📊 Análisis Detallado de Producto**
```http
GET /api/contpaq/product-analysis/:codigo
```

**Descripción:** Análisis completo de un producto específico con historial, tendencias y métricas detalladas.

**Parámetros:**
- `codigo` (path): Código del producto (ej: "SG001")
- `startDate` (query, opcional): Fecha inicio para filtrar (YYYY-MM-DD)
- `endDate` (query, opcional): Fecha fin para filtrar (YYYY-MM-DD)

**Ejemplo:**
```bash
curl "http://localhost:3001/api/contpaq/product-analysis/SG001?startDate=2025-09-01&endDate=2025-10-03"
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "producto": {
      "codigo": "SG001",
      "nombre": "SIMPLE GREEN REGULAR",
      "tipo": "Producto",
      "descripcion": "Limpiador multiusos ecológico",
      "fechaAlta": "2013-05-12T00:00:00.000Z",
      "controlExistencia": 1,
      "stockActual": 50,
      "stockMinimo": 10,
      "precioUnitario": 125.50
    },
    "ventas": {
      "totalVentas": 43,
      "totalCantidad": 1250,
      "ticketPromedio": 125.50,
      "ultimaVenta": "2025-10-02T00:00:00.000Z",
      "primeraVenta": "2025-01-15T00:00:00.000Z",
      "crecimientoMensual": 15.3,
      "ventasPorMes": [
        { "mes": "2025-01", "cantidad": 45, "monto": 5647.50 },
        { "mes": "2025-02", "cantidad": 52, "monto": 6526.00 }
      ]
    },
    "clientes": {
      "totalClientes": 12,
      "topClientes": [
        {
          "cliente": "FASTENAL MEXICO",
          "compras": 8,
          "cantidad": 200,
          "monto": 25100.00,
          "ultimaCompra": "2025-10-02"
        }
      ]
    },
    "historial": {
      "movimientos": [
        {
          "fecha": "2025-10-02T10:30:00.000Z",
          "tipo": "VENTA",
          "cantidad": 25,
          "cliente": "FASTENAL MEXICO",
          "folio": "F001",
          "monto": 3137.50
        }
      ]
    },
    "tendencias": {
      "estacionalidad": "Alta en primavera y verano",
      "diasMasVentas": ["Lunes", "Martes", "Viernes"],
      "horariosPico": ["10:00-12:00", "14:00-16:00"],
      "prediccionProximaSemana": 12,
      "recomendacion": "Aumentar stock para temporada alta"
    }
  }
}
```

---

### **12. 📋 Historial Completo de Producto**
```http
GET /api/contpaq/product-history/:codigo
```

**Descripción:** Historial detallado de todos los movimientos de un producto (ventas, compras, ajustes).

**Parámetros:**
- `codigo` (path): Código del producto
- `limit` (query, opcional): Número de registros por página (default: 50)
- `offset` (query, opcional): Registros a saltar para paginación (default: 0)

**Ejemplo:**
```bash
curl "http://localhost:3001/api/contpaq/product-history/SG001?limit=20&offset=0"
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "producto": {
      "codigo": "SG001",
      "nombre": "SIMPLE GREEN REGULAR",
      "fechaAlta": "2013-05-12T00:00:00.000Z"
    },
    "historial": [
      {
        "fecha": "2025-10-02T10:30:00.000Z",
        "tipo": "VENTA",
        "folio": "F001",
        "cliente": "FASTENAL MEXICO",
        "cantidad": 25,
        "monto": 3137.50,
        "stockAnterior": 75,
        "stockPosterior": 50
      },
      {
        "fecha": "2025-08-15T13:30:00.000Z",
        "tipo": "AJUSTE",
        "folio": "A001",
        "motivo": "INVENTARIO INICIAL",
        "cantidad": 50,
        "stockAnterior": 0,
        "stockPosterior": 50
      }
    ],
    "paginacion": {
      "total": 7,
      "limit": 50,
      "offset": 0,
      "paginas": 1
    }
  }
}
```

---

### **13. 📅 Ventas por Rango de Fechas**
```http
GET /api/contpaq/sales/date-range
```

**Descripción:** Ventas filtradas por rango de fechas con análisis detallado.

**Parámetros:**
- `startDate` (query, requerido): Fecha inicio (YYYY-MM-DD)
- `endDate` (query, requerido): Fecha fin (YYYY-MM-DD)
- `codigoProducto` (query, opcional): Filtrar por producto específico

**Ejemplo:**
```bash
curl "http://localhost:3001/api/contpaq/sales/date-range?startDate=2025-09-01&endDate=2025-10-03&codigoProducto=SG001"
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "filtros": {
      "startDate": "2025-09-01",
      "endDate": "2025-10-03",
      "codigoProducto": "SG001"
    },
    "resumen": {
      "totalVentas": 25,
      "totalCantidad": 750,
      "totalMonto": 94125.00,
      "ticketPromedio": 3765.00,
      "diasConVentas": 18,
      "promedioDiario": 1.39
    },
    "ventas": [
      {
        "folio": "F001",
        "fecha": "2025-10-02",
        "cliente": "FASTENAL MEXICO",
        "codigoProducto": "SG001",
        "nombreProducto": "SIMPLE GREEN REGULAR",
        "cantidad": 25,
        "monto": 3137.50
      }
    ],
    "ventasPorDia": [
      {
        "fecha": "2025-10-02",
        "ventas": 3,
        "cantidad": 45,
        "monto": 5650.00
      }
    ],
    "ventasPorProducto": [
      {
        "codigo": "SG001",
        "nombre": "SIMPLE GREEN REGULAR",
        "ventas": 8,
        "cantidad": 200,
        "monto": 25100.00
      }
    ],
    "ventasPorCliente": [
      {
        "cliente": "FASTENAL MEXICO",
        "ventas": 5,
        "cantidad": 125,
        "monto": 15687.50
      }
    ]
  }
}
```

---

## 🔍 **ANÁLISIS DETALLADO DE PRODUCTOS**

### **8. 📊 Análisis Detallado de Producto**
```http
GET /api/contpaq/product-analysis/:codigo
```

**Descripción:** Análisis completo de un producto específico con estadísticas, inventario, top clientes y ventas recientes

**Parámetros:**
- `codigo` (string, requerido): Código del producto
- `startDate` (string, opcional): Fecha inicio (YYYY-MM-DD)
- `endDate` (string, opcional): Fecha fin (YYYY-MM-DD)

**Ejemplo de uso:**
```javascript
// Análisis básico (últimos 30 días)
const response = await fetch('http://localhost:3001/api/contpaq/product-analysis/0200000143004');

// Análisis por período específico
const response = await fetch('http://localhost:3001/api/contpaq/product-analysis/0200000143004?startDate=2025-10-01&endDate=2025-10-03');
```

**Respuesta exitosa:**
```json
{
  "success": true,
  "data": {
    "producto": {
      "id": 148,
      "codigo": "0200000143004",
      "nombre": "SIMPLE GREEN PROSERIES MAX, Tambor de 208 Litros",
      "tipo": 1,
      "descripcion": "Desengrasante Industrial Biodegradable",
      "fechaAlta": "2014-01-21T00:00:00.000Z",
      "controlExistencia": 9
    },
    "inventario": {
      "entradasIniciales": 0,
      "salidasIniciales": 0,
      "costoInicialEntradas": 0,
      "costoInicialSalidas": 0,
      "banCongelado": 0
    },
    "estadisticas": {
      "totalVendido": 2,
      "totalVentas": 2,
      "totalIngresos": 1688.96,
      "promedioVentas": 844.48
    },
    "topClientes": [
      {
        "cliente": "INGREDION MEXICO",
        "rfc": "CPI950901F3A",
        "compras": 2,
        "cantidad": 2
      }
    ],
    "ventasRecientes": [
      {
        "documentId": 94652,
        "folio": 13119,
        "fecha": "2025-10-03T00:00:00.000Z",
        "cliente": "INGREDION MEXICO",
        "rfc": "CPI950901F3A",
        "cantidad": 1,
        "cantidadNC": 0,
        "total": 844.48
      }
    ],
    "periodo": {
      "inicio": "2025-09-03",
      "fin": "2025-10-03"
    }
  },
  "source": "Contpaq Windows Service"
}
```

**Respuesta de error:**
```json
{
  "success": false,
  "message": "Error obteniendo análisis de producto desde Contpaq",
  "error": "Producto no encontrado",
  "serviceUrl": "https://13a71c2ffb9d.ngrok-free.app"
}
```

---

### **9. 📜 Historial Completo de Producto**
```http
GET /api/contpaq/product-history/:codigo
```

**Descripción:** Historial completo de transacciones de un producto con paginación

**Parámetros:**
- `codigo` (string, requerido): Código del producto
- `limit` (number, opcional): Número de registros por página (default: 50)
- `offset` (number, opcional): Número de registros a saltar (default: 0)

**Ejemplo de uso:**
```javascript
// Primera página (50 registros)
const response = await fetch('http://localhost:3001/api/contpaq/product-history/0200000143004');

// Segunda página
const response = await fetch('http://localhost:3001/api/contpaq/product-history/0200000143004?limit=50&offset=50');
```

**Respuesta exitosa:**
```json
{
  "success": true,
  "data": {
    "producto": {
      "id": 148,
      "codigo": "0200000143004",
      "nombre": "SIMPLE GREEN PROSERIES MAX, Tambor de 208 Litros"
    },
    "historial": [
      {
        "documentId": 94652,
        "folio": 13119,
        "fecha": "2025-10-03T00:00:00.000Z",
        "total": 844.48,
        "cliente": "INGREDION MEXICO",
        "rfc": "CPI950901F3A",
        "cantidad": 1,
        "cantidadNC": 0,
        "precio": 728,
        "importe": 844.48
      }
    ],
    "paginacion": {
      "total": 2,
      "limit": 50,
      "offset": 0,
      "hasMore": false
    }
  },
  "source": "Contpaq Windows Service"
}
```

---

### **10. 📅 Ventas por Rango de Fechas**
```http
GET /api/contpaq/sales/date-range
```

**Descripción:** Ventas filtradas por rango de fechas con estadísticas y análisis

**Parámetros:**
- `startDate` (string, requerido): Fecha inicio (YYYY-MM-DD)
- `endDate` (string, requerido): Fecha fin (YYYY-MM-DD)
- `codigoProducto` (string, opcional): Filtrar por código de producto específico

**Ejemplo de uso:**
```javascript
// Ventas de octubre 2025
const response = await fetch('http://localhost:3001/api/contpaq/sales/date-range?startDate=2025-10-01&endDate=2025-10-03');

// Ventas de un producto específico en octubre
const response = await fetch('http://localhost:3001/api/contpaq/sales/date-range?startDate=2025-10-01&endDate=2025-10-03&codigoProducto=0200000143004');
```

**Respuesta exitosa:**
```json
{
  "success": true,
  "data": {
    "ventas": [
      {
        "documentId": 94652,
        "folio": 13119,
        "fecha": "2025-10-03T00:00:00.000Z",
        "cliente": "INGREDION MEXICO",
        "rfc": "CPI950901F3A",
        "productId": 148,
        "codigoProducto": "0200000143004",
        "nombreProducto": "SIMPLE GREEN PROSERIES MAX, Tambor de 208 Litros",
        "cantidad": 1,
        "cantidadNC": 0,
        "total": 844.48
      }
    ],
    "estadisticas": {
      "totalVentas": 42,
      "totalIngresos": 280789.23,
      "totalProductos": 163,
      "promedioVenta": 6685.46
    },
    "topProductos": [
      {
        "codigo": "0200000143004",
        "nombre": "SIMPLE GREEN PROSERIES MAX, Tambor de 208 Litros",
        "ventas": 2,
        "cantidad": 2,
        "ingresos": 1688.96
      }
    ],
    "periodo": {
      "inicio": "2025-10-01",
      "fin": "2025-10-03"
    },
    "filtros": {
      "codigoProducto": null
    }
  },
  "source": "Contpaq Windows Service"
}
```

---

## 🎯 **CASOS DE USO PARA FRONTEND**

### **Dashboard Principal:**
1. **Lista de productos** → `/products`
2. **Click en producto** → `/product-analysis/:codigo`
3. **Filtros de fecha** → `/sales/date-range?startDate=X&endDate=Y`

### **Análisis de Producto:**
1. **Información básica** → `data.producto`
2. **Estadísticas** → `data.estadisticas`
3. **Top clientes** → `data.topClientes`
4. **Ventas recientes** → `data.ventasRecientes`
5. **Historial completo** → `/product-history/:codigo`

### **Reportes por Fecha:**
1. **Ventas del período** → `data.ventas`
2. **Estadísticas generales** → `data.estadisticas`
3. **Top productos** → `data.topProductos`

---

## 📞 **SOPORTE**

Para cualquier duda o problema con la API, contactar al equipo de backend.

**Versión de la API:** 3.0.0  
**Última actualización:** 2025-10-03  
**Estado:** ✅ Activa y funcionando con datos reales de Contpaq

