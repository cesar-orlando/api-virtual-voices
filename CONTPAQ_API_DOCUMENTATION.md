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
  "version": "5.0.0",
  "endpoints": {
    "test": "GET /api/contpaq/test",
    "cobranza": "GET /api/contpaq/cobranza?asesor=ID&estado=ESTADO&cliente=CLIENTE&fechaInicio=YYYY-MM-DD&fechaFin=YYYY-MM-DD",
    "clientOrders": "GET /api/contpaq/client-orders/:cliente?limit=50&offset=0&fechaInicio=YYYY-MM-DD&fechaFin=YYYY-MM-DD",
    "clientInvoices": "GET /api/contpaq/client-invoices/:cliente?limit=50&offset=0&fechaInicio=YYYY-MM-DD&fechaFin=YYYY-MM-DD",
    "productOrders": "GET /api/contpaq/product-orders/:codigo?limit=50&offset=0&fechaInicio=YYYY-MM-DD&fechaFin=YYYY-MM-DD",
    "productInvoices": "GET /api/contpaq/product-invoices/:codigo?limit=50&offset=0&fechaInicio=YYYY-MM-DD&fechaFin=YYYY-MM-DD",
    "topClients": "GET /api/contpaq/top-clients?limit=20&fechaInicio=YYYY-MM-DD&fechaFin=YYYY-MM-DD"
  }
}
```

---

### **2. 🔧 Prueba de Conexión**
```http
GET /api/contpaq/test
```

**Descripción:** Verificar que la conexión con Contpaq esté funcionando

**Respuesta:**
```json
{
  "status": "OK",
  "message": "Conexión a Contpaq exitosa",
  "data": {
    "test": 1
  }
}
```

---

### **3. 💰 Reporte de Cobranza por Asesor**
```http
GET /api/contpaq/cobranza
```

**Descripción:** Reporte completo de cobranza con datos reales de asesores desde `admAgentes` y conversión automática de monedas

**Parámetros:**
- `asesor` (number, opcional): ID del asesor (ej: 1, 2, 4, 42)
- `estado` (string, opcional): Estado de la factura (Vigente, Vencido, A Vencer)
- `cliente` (string, opcional): Código o nombre del cliente
- `fechaInicio` (string, opcional): Fecha de inicio (YYYY-MM-DD)
- `fechaFin` (string, opcional): Fecha de fin (YYYY-MM-DD)
- `incluirConversiones` (boolean, opcional): Incluir conversiones USD→PESOS (default: false)

**Nota:** Sin filtros de fecha muestra TODAS las facturas históricas. Se recomienda usar filtros de fecha para datos relevantes.

**Ejemplos de uso:**
```javascript
// Reporte completo de cobranza (TODAS las facturas históricas)
const response = await fetch('/api/contpaq/cobranza');

// Reporte de 2025 con conversiones de moneda
const response = await fetch('/api/contpaq/cobranza?fechaInicio=2025-01-01&fechaFin=2025-12-31&incluirConversiones=true');

// Reporte por asesor específico con conversiones
const response = await fetch('/api/contpaq/cobranza?asesor=1&incluirConversiones=true');

// Reporte por estado con conversiones
const response = await fetch('/api/contpaq/cobranza?estado=Vencido&incluirConversiones=true');

// Reporte por cliente con conversiones
const response = await fetch('/api/contpaq/cobranza?cliente=CL1578&incluirConversiones=true');

// Reporte de últimos 6 meses con conversiones
const sixMonthsAgo = new Date();
sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
const response = await fetch(`/api/contpaq/cobranza?fechaInicio=${sixMonthsAgo.toISOString().split('T')[0]}&fechaFin=${new Date().toISOString().split('T')[0]}&incluirConversiones=true`);

// Combinación de filtros con conversiones
const response = await fetch('/api/contpaq/cobranza?asesor=1&estado=Vencido&fechaInicio=2025-01-01&incluirConversiones=true');
```

**Respuesta exitosa (sin conversiones):**
```json
{
  "status": "OK",
  "data": {
    "facturas": [
      {
        "codigoCliente": "CL1578",
        "nombreCliente": "COLORWELL",
        "diasCredito": 30,
        "factura": "652",
        "fechaEmision": "2025-04-22T00:00:00.000Z",
        "fechaVencimiento": "2025-04-22T00:00:00.000Z",
        "diasCorrientes": -174,
        "total": 3730.56,
        "moneda": "PESOS",
        "estado": "Vencido",
        "asesor": "NO TIENE AGENTE",
        "idAsesor": null,
        "observaciones": ""
      }
    ],
    "estadisticas": {
      "totalFacturas": 59,
      "totalMonto": 566073.85,
      "vencidas": 53,
      "vigentes": 5,
      "aVencer": 1,
      "montoVencido": 519095.01
    },
    "filtros": {
      "asesor": null,
      "estado": null,
      "cliente": null,
      "fechaInicio": null,
      "fechaFin": null
    }
  }
}
```

**Respuesta exitosa (con conversiones):**
```json
{
  "status": "OK",
  "data": {
    "facturas": [
      {
        "codigoCliente": "CL1578",
        "nombreCliente": "COLORWELL",
        "diasCredito": 30,
        "factura": "652",
        "fechaEmision": "2025-04-22T00:00:00.000Z",
        "fechaVencimiento": "2025-04-22T00:00:00.000Z",
        "diasCorrientes": -174,
        "total": 3730.56,
        "moneda": "PESOS",
        "totalEnPesos": 3730.56,
        "tipoCambio": 1,
        "fechaTipoCambio": "2025-04-22T00:00:00.000Z",
        "estado": "Vencido",
        "asesor": "NO TIENE AGENTE",
        "idAsesor": null,
        "observaciones": ""
      },
      {
        "codigoCliente": "CL002",
        "nombreCliente": "PERMADUCTO",
        "diasCredito": 30,
        "factura": "653",
        "fechaEmision": "2025-01-10T00:00:00.000Z",
        "fechaVencimiento": "2025-02-09T00:00:00.000Z",
        "diasCorrientes": 20,
        "total": 822.44,
        "moneda": "USD",
        "totalEnPesos": 16448.80,
        "tipoCambio": 20.0,
        "fechaTipoCambio": "2025-01-10T00:00:00.000Z",
        "estado": "Vigente",
        "asesor": "María González",
        "idAsesor": 2,
        "observaciones": ""
      }
    ],
    "estadisticas": {
      "totalFacturas": 60,
      "totalMonto": 566896.29,
      "vencidas": 53,
      "vigentes": 6,
      "aVencer": 1,
      "montoVencido": 519095.01,
      "porMoneda": {
        "pesos": {
          "facturas": 59,
          "monto": 566073.85,
          "montoVencido": 519095.01
        },
        "usd": {
          "facturas": 1,
          "monto": 822.44,
          "montoVencido": 0.00
        }
      },
      "totalesConvertidos": {
        "totalEnPesos": 582522.65,
        "totalEnUSD": 822.44,
        "totalEnPesosOriginal": 566073.85
      }
    },
    "filtros": {
      "asesor": null,
      "estado": null,
      "cliente": null,
      "fechaInicio": null,
      "fechaFin": null,
      "incluirConversiones": true
    }
  }
}
```

**Asesores disponibles (IDs reales):**
- ID 1: Guillermo Besserer A.
- ID 2: Juanita Fernández J.
- ID 4: (Otros asesores disponibles)
- ID 42: (Otros asesores disponibles)

**Estados calculados automáticamente:**
- **Vigente:** Facturas con fecha de vencimiento futura
- **A Vencer:** Facturas que vencen en los próximos 7 días
- **Vencido:** Facturas con fecha de vencimiento pasada

**💱 Conversión de Monedas:**
- **PESOS:** Se mantienen igual (`totalEnPesos = total`)
- **USD:** Se convierten usando tipos de cambio reales de Contpaq (`admTiposCambio`)
- **Tipo de cambio:** Se obtiene por fecha de emisión de la factura
- **Campos adicionales:** `totalEnPesos`, `tipoCambio`, `fechaTipoCambio`

---

### **4. 📋 Historial de Pedidos por Cliente**
```http
GET /api/contpaq/client-orders/:cliente
```

**Descripción:** Obtener historial completo de pedidos de un cliente específico

**Parámetros:**
- `cliente` (string, requerido): Código de cliente (CL1578) o nombre (COLORWELL) o búsqueda parcial (COLOR)
- `limit` (number, opcional): Número de registros por página (default: 50)
- `offset` (number, opcional): Número de registros a saltar (default: 0)
- `fechaInicio` (string, opcional): Fecha de inicio (YYYY-MM-DD)
- `fechaFin` (string, opcional): Fecha de fin (YYYY-MM-DD)

**Ejemplos de uso:**
```javascript
// Por código de cliente
const response = await fetch('/api/contpaq/client-orders/CL1578');

// Por nombre de cliente
const response = await fetch('/api/contpaq/client-orders/COLORWELL');

// Búsqueda parcial
const response = await fetch('/api/contpaq/client-orders/COLOR');

// Con filtros de fecha
const response = await fetch('/api/contpaq/client-orders/CL1578?fechaInicio=2025-01-01&fechaFin=2025-12-31');

// Con paginación
const response = await fetch('/api/contpaq/client-orders/CL1578?limit=10&offset=0');
```

**Respuesta exitosa:**
```json
{
  "status": "OK",
  "data": {
    "cliente": "CL1578",
    "pedidos": [
      {
        "documentId": 89715,
        "folio": 12381,
        "fecha": "2025-04-22T00:00:00.000Z",
        "total": 3730.56,
        "moneda": "PESOS",
        "asesor": "NO TIENE AGENTE",
        "productos": "2700000113006 - SIMPLE GREEN REGULAR, Bidón de 18.9 Litros (x2)"
      }
    ],
    "paginacion": {
      "total": 6,
      "limit": 50,
      "offset": 0,
      "hasMore": false
    }
  }
}
```

---

### **5. 🧾 Historial de Facturas por Cliente**
```http
GET /api/contpaq/client-invoices/:cliente
```

**Descripción:** Obtener historial completo de facturas de un cliente específico

**Parámetros:**
- `cliente` (string, requerido): Código de cliente (CL1578) o nombre (COLORWELL) o búsqueda parcial (COLOR)
- `limit` (number, opcional): Número de registros por página (default: 50)
- `offset` (number, opcional): Número de registros a saltar (default: 0)
- `fechaInicio` (string, opcional): Fecha de inicio (YYYY-MM-DD)
- `fechaFin` (string, opcional): Fecha de fin (YYYY-MM-DD)

**Ejemplos de uso:**
```javascript
// Por código de cliente
const response = await fetch('/api/contpaq/client-invoices/CL1578');

// Por nombre de cliente
const response = await fetch('/api/contpaq/client-invoices/COLORWELL');

// Búsqueda parcial
const response = await fetch('/api/contpaq/client-invoices/COLOR');

// Con filtros de fecha
const response = await fetch('/api/contpaq/client-invoices/CL1578?fechaInicio=2025-01-01&fechaFin=2025-12-31');
```

**Respuesta exitosa:**
```json
{
  "status": "OK",
  "data": {
    "cliente": "CL1578",
    "facturas": [
      {
        "documentId": 89696,
        "folio": 652,
        "fecha": "2025-04-22T00:00:00.000Z",
        "fechaVencimiento": "2025-04-22T00:00:00.000Z",
        "diasCorrientes": -174,
        "total": 3730.56,
        "moneda": "PESOS",
        "estado": "Vencido",
        "asesor": "NO TIENE AGENTE",
        "productos": "2700000113006 - SIMPLE GREEN REGULAR, Bidón de 18.9 Litros (x2)"
      }
    ],
    "paginacion": {
      "total": 1,
      "limit": 50,
      "offset": 0,
      "hasMore": false
    }
  }
}
```

---

### **6. 📦 Historial de Pedidos por Producto**
```http
GET /api/contpaq/product-orders/:codigo
```

**Descripción:** Obtener historial completo de pedidos de un producto específico

**Parámetros:**
- `codigo` (string, requerido): Código del producto (ej: G01006)
- `limit` (number, opcional): Número de registros por página (default: 50)
- `offset` (number, opcional): Número de registros a saltar (default: 0)
- `fechaInicio` (string, opcional): Fecha de inicio (YYYY-MM-DD)
- `fechaFin` (string, opcional): Fecha de fin (YYYY-MM-DD)

**Ejemplos de uso:**
```javascript
// Historial completo
const response = await fetch('/api/contpaq/product-orders/G01006');

// Con filtros de fecha
const response = await fetch('/api/contpaq/product-orders/G01006?fechaInicio=2025-01-01&fechaFin=2025-12-31');

// Con paginación
const response = await fetch('/api/contpaq/product-orders/G01006?limit=20&offset=0');
```

**Respuesta exitosa:**
```json
{
  "status": "OK",
  "data": {
    "producto": {
      "id": 123,
      "codigo": "G01006",
      "nombre": "CORKSORB CORCHO ABSORBENTE EN SACO DE 75 LTS"
    },
    "pedidos": [
      {
        "documentId": 95055,
        "folio": 13141,
        "fecha": "2025-10-10T00:00:00.000Z",
        "cliente": "MARIA ANGELICA GONZALEZ HERNANDEZ",
        "codigoCliente": "CL1737",
        "cantidad": 1,
        "precio": 1000,
        "importe": 1160,
        "total": 1160,
        "moneda": "PESOS",
        "asesor": "Guillermo Besserer A."
      }
    ],
    "paginacion": {
      "total": 132,
      "limit": 50,
      "offset": 0,
      "hasMore": true
    }
  }
}
```

---

### **7. 🧾 Historial de Facturas por Producto**
```http
GET /api/contpaq/product-invoices/:codigo
```

**Descripción:** Obtener historial completo de facturas de un producto específico

**Parámetros:**
- `codigo` (string, requerido): Código del producto (ej: G01006)
- `limit` (number, opcional): Número de registros por página (default: 50)
- `offset` (number, opcional): Número de registros a saltar (default: 0)
- `fechaInicio` (string, opcional): Fecha de inicio (YYYY-MM-DD)
- `fechaFin` (string, opcional): Fecha de fin (YYYY-MM-DD)

**Ejemplos de uso:**
```javascript
// Historial completo
const response = await fetch('/api/contpaq/product-invoices/G01006');

// Con filtros de fecha
const response = await fetch('/api/contpaq/product-invoices/G01006?fechaInicio=2025-01-01&fechaFin=2025-12-31');
```

**Respuesta exitosa:**
```json
{
  "status": "OK",
  "data": {
    "producto": {
      "id": 123,
      "codigo": "G01006",
      "nombre": "CORKSORB CORCHO ABSORBENTE EN SACO DE 75 LTS"
    },
    "facturas": [
      {
        "documentId": 94297,
        "folio": 708,
        "fecha": "2025-09-23T00:00:00.000Z",
        "fechaVencimiento": "2025-10-23T00:00:00.000Z",
        "diasCorrientes": 10,
        "cliente": "L C TERMINAL PORTUARIA DE CONTENEDORES",
        "codigoCliente": "CL0156",
        "cantidad": 10,
        "precio": 1400,
        "importe": 16240,
        "total": 16240,
        "moneda": "PESOS",
        "estado": "Vigente",
        "asesor": "Juanita Fernández J."
      }
    ],
    "paginacion": {
      "total": 45,
      "limit": 50,
      "offset": 0,
      "hasMore": false
    }
  }
}
```

---

### **8. 🏆 Top de Clientes**
```http
GET /api/contpaq/top-clients
```

**Descripción:** Obtener ranking de clientes por monto total de compras

**Parámetros:**
- `limit` (number, opcional): Número de clientes a mostrar (default: 20)
- `fechaInicio` (string, opcional): Fecha de inicio (YYYY-MM-DD)
- `fechaFin` (string, opcional): Fecha de fin (YYYY-MM-DD)

**Ejemplos de uso:**
```javascript
// Top 20 clientes
const response = await fetch('/api/contpaq/top-clients');

// Top 10 clientes
const response = await fetch('/api/contpaq/top-clients?limit=10');

// Top clientes por período
const response = await fetch('/api/contpaq/top-clients?fechaInicio=2025-01-01&fechaFin=2025-12-31');
```

**Respuesta exitosa:**
```json
{
  "status": "OK",
  "data": {
    "clientes": [
      {
        "codigoCliente": "CL1578",
        "nombreCliente": "COLORWELL",
        "rfc": "COL123456789",
        "totalPedidos": 6,
        "totalFacturas": 1,
        "montoTotal": 3730.56,
        "montoFacturas": 3730.56,
        "montoPedidos": 0,
        "ultimaCompra": "2025-04-22T00:00:00.000Z",
        "asesor": "NO TIENE AGENTE",
        "ticketPromedio": 621.76
      }
    ],
    "total": 150,
    "filtros": {
      "fechaInicio": null,
      "fechaFin": null
    }
  }
}
```

---

## 🚀 **CASOS DE USO PARA FRONTEND**

### **Dashboard Principal:**
- Mostrar estadísticas generales de cobranza
- Gráficos de facturas por estado
- Top asesores por monto de cobranza
- **💱 Conversiones de moneda automáticas**
- **📊 Totales separados por moneda (PESOS/USD)**
- **🔄 Tipos de cambio reales de Contpaq**

### **Análisis de Cliente:**
- Click en cliente → mostrar historial de pedidos y facturas
- Filtros por fecha y asesor
- Búsqueda por código o nombre

### **Análisis de Producto:**
- Click en producto → mostrar historial de pedidos y facturas
- Filtros por fecha y cliente
- Estadísticas de ventas

### **Reporte de Cobranza por Asesor:**
- Vista de tabla con filtros dinámicos
- Estadísticas por asesor
- Estados de facturas con colores
- Búsqueda por cliente
- Filtros de fecha

### **Top de Clientes:**
- Ranking ordenable por diferentes métricas
- Filtros por período
- Click para ver historial detallado

---

## **💻 IMPLEMENTACIÓN EN REACT - CONVERSIONES DE MONEDA**

### **Hook personalizado para Cobranza:**
```javascript
import { useState, useEffect } from 'react';

const useCobranzaReport = (filters = {}) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchCobranza = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          ...filters,
          incluirConversiones: 'true' // Siempre incluir conversiones
        });
        
        const response = await fetch(`/api/contpaq/cobranza?${params}`);
        const result = await response.json();
        
        if (result.status === 'OK') {
          setData(result.data);
        } else {
          setError(result.message);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchCobranza();
  }, [filters]);

  return { data, loading, error };
};

export default useCobranzaReport;
```

### **Componente de Dashboard con Conversiones:**
```javascript
import React from 'react';
import useCobranzaReport from './hooks/useCobranzaReport';

const CobranzaDashboard = () => {
  const { data, loading, error } = useCobranzaReport({
    fechaInicio: '2025-01-01',
    fechaFin: '2025-12-31'
  });

  if (loading) return <div>Cargando...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!data) return null;

  const { estadisticas } = data;

  return (
    <div className="cobranza-dashboard">
      {/* Totales principales */}
      <div className="totales-principales">
        <div className="total-convertido">
          <h3>Total Convertido</h3>
          <p className="monto-principal">
            ${estadisticas.totalesConvertidos.totalEnPesos.toLocaleString('es-MX')} MXN
          </p>
        </div>
        
        <div className="desglose-monedas">
          <div className="moneda-pesos">
            <h4>Pesos Originales</h4>
            <p>${estadisticas.totalesConvertidos.totalEnPesosOriginal.toLocaleString('es-MX')}</p>
          </div>
          
          <div className="moneda-usd">
            <h4>USD Convertidos</h4>
            <p>${estadisticas.totalesConvertidos.totalEnUSD.toLocaleString('en-US')} USD</p>
          </div>
        </div>
      </div>

      {/* Estadísticas por moneda */}
      <div className="estadisticas-por-moneda">
        <div className="pesos-stats">
          <h4>Facturas en Pesos</h4>
          <p>Facturas: {estadisticas.porMoneda.pesos.facturas}</p>
          <p>Monto: ${estadisticas.porMoneda.pesos.monto.toLocaleString('es-MX')}</p>
        </div>
        
        <div className="usd-stats">
          <h4>Facturas en USD</h4>
          <p>Facturas: {estadisticas.porMoneda.usd.facturas}</p>
          <p>Monto: ${estadisticas.porMoneda.usd.monto.toLocaleString('en-US')}</p>
        </div>
      </div>

      {/* Tabla de facturas */}
      <div className="tabla-facturas">
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Total Original</th>
              <th>Moneda</th>
              <th>Total en Pesos</th>
              <th>Tipo de Cambio</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {data.facturas.map((factura, index) => (
              <tr key={index}>
                <td>{factura.nombreCliente}</td>
                <td>${factura.total.toLocaleString('es-MX')}</td>
                <td className={`moneda-${factura.moneda.toLowerCase()}`}>
                  {factura.moneda}
                </td>
                <td>${factura.totalEnPesos.toLocaleString('es-MX')}</td>
                <td>{factura.tipoCambio}</td>
                <td className={`estado-${factura.estado.toLowerCase().replace(' ', '-')}`}>
                  {factura.estado}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CobranzaDashboard;
```

### **Estilos CSS para Conversiones:**
```css
.cobranza-dashboard {
  padding: 20px;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.totales-principales {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 20px;
  margin-bottom: 30px;
}

.total-convertido {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 30px;
  border-radius: 15px;
  text-align: center;
}

.monto-principal {
  font-size: 2.5rem;
  font-weight: bold;
  margin: 10px 0;
}

.desglose-monedas {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.moneda-pesos, .moneda-usd {
  background: #f8f9fa;
  padding: 20px;
  border-radius: 10px;
  border-left: 4px solid #28a745;
}

.moneda-usd {
  border-left-color: #007bff;
}

.estadisticas-por-moneda {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 30px;
}

.pesos-stats, .usd-stats {
  background: white;
  padding: 20px;
  border-radius: 10px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.tabla-facturas {
  background: white;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.tabla-facturas table {
  width: 100%;
  border-collapse: collapse;
}

.tabla-facturas th {
  background: #f8f9fa;
  padding: 15px;
  text-align: left;
  font-weight: 600;
  color: #495057;
}

.tabla-facturas td {
  padding: 15px;
  border-bottom: 1px solid #dee2e6;
}

.moneda-pesos {
  color: #28a745;
  font-weight: bold;
}

.moneda-usd {
  color: #007bff;
  font-weight: bold;
}

.estado-vencido {
  color: #dc3545;
  font-weight: bold;
}

.estado-vigente {
  color: #28a745;
  font-weight: bold;
}

.estado-a-vencer {
  color: #ffc107;
  font-weight: bold;
}
```

---

## **📋 RESUMEN PARA FRONTEND - CONVERSIONES DE MONEDA**

### **🎯 Puntos Clave:**
1. **Parámetro `incluirConversiones=true`** - Siempre usar para obtener datos convertidos
2. **Tipos de cambio reales** - Se obtienen automáticamente de Contpaq por fecha
3. **Totales separados** - PESOS y USD se muestran por separado + total convertido
4. **Campos adicionales** - `totalEnPesos`, `tipoCambio`, `fechaTipoCambio`

### **📊 Estructura de Datos:**
```javascript
// Respuesta con conversiones
{
  "data": {
    "facturas": [
      {
        "total": 15000.00,           // Monto original
        "moneda": "PESOS",           // Moneda original
        "totalEnPesos": 15000.00,    // Convertido a pesos
        "tipoCambio": 1,             // Tipo de cambio usado
        "fechaTipoCambio": "2025-01-15T00:00:00.000Z"
      }
    ],
    "estadisticas": {
      "porMoneda": {
        "pesos": { "facturas": 97, "monto": 1508420.64 },
        "usd": { "facturas": 34, "monto": 67460.04 }
      },
      "totalesConvertidos": {
        "totalEnPesos": 2857621.44,      // Total real convertido
        "totalEnUSD": 67460.04,          // Total en USD
        "totalEnPesosOriginal": 1508420.64 // Total original en pesos
      }
    }
  }
}
```

### **🚀 Implementación Rápida:**
```javascript
// 1. Obtener datos con conversiones
const response = await fetch('/api/contpaq/cobranza?incluirConversiones=true');
const data = await response.json();

// 2. Mostrar total convertido
const totalReal = data.data.estadisticas.totalesConvertidos.totalEnPesos;

// 3. Mostrar desglose por moneda
const pesos = data.data.estadisticas.porMoneda.pesos;
const usd = data.data.estadisticas.porMoneda.usd;

// 4. Mostrar facturas con conversiones
data.data.facturas.forEach(factura => {
  console.log(`${factura.nombreCliente}: ${factura.total} ${factura.moneda} = ${factura.totalEnPesos} MXN`);
});
```

---

## 📋 **IMPLEMENTACIÓN EN REACT**

### **Hook para Historial de Cliente:**
```jsx
import { useState, useEffect } from 'react';

function useClientHistory(cliente, type = 'orders') {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchHistory() {
      try {
        const endpoint = type === 'orders' ? 'client-orders' : 'client-invoices';
        const response = await fetch(`/api/contpaq/${endpoint}/${cliente}`);
        const result = await response.json();
        
        if (result.status === 'OK') {
          setData(result.data);
        } else {
          setError(result.message);
        }
      } catch (err) {
        setError('Error de conexión');
      } finally {
        setLoading(false);
      }
    }

    if (cliente) {
      fetchHistory();
    }
  }, [cliente, type]);

  return { data, loading, error };
}

// Componente de historial de cliente
function ClientHistory({ cliente }) {
  const [activeTab, setActiveTab] = useState('orders');
  const { data: ordersData, loading: ordersLoading } = useClientHistory(cliente, 'orders');
  const { data: invoicesData, loading: invoicesLoading } = useClientHistory(cliente, 'invoices');

  return (
    <div className="client-history">
      <h2>Historial de {cliente}</h2>
      
      <div className="tabs">
        <button 
          className={activeTab === 'orders' ? 'active' : ''}
          onClick={() => setActiveTab('orders')}
        >
          Pedidos ({ordersData?.paginacion?.total || 0})
        </button>
        <button 
          className={activeTab === 'invoices' ? 'active' : ''}
          onClick={() => setActiveTab('invoices')}
        >
          Facturas ({invoicesData?.paginacion?.total || 0})
        </button>
      </div>
      
      {activeTab === 'orders' && (
        <div className="tab-content">
          {ordersLoading ? (
            <div>Cargando pedidos...</div>
          ) : (
            <table className="history-table">
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Fecha</th>
                  <th>Total</th>
                  <th>Asesor</th>
                  <th>Productos</th>
                </tr>
              </thead>
              <tbody>
                {ordersData?.pedidos?.map((pedido, index) => (
                  <tr key={index}>
                    <td>{pedido.folio}</td>
                    <td>{new Date(pedido.fecha).toLocaleDateString()}</td>
                    <td>${pedido.total.toLocaleString()}</td>
                    <td>{pedido.asesor}</td>
                    <td>{pedido.productos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      
      {activeTab === 'invoices' && (
        <div className="tab-content">
          {invoicesLoading ? (
            <div>Cargando facturas...</div>
          ) : (
            <table className="history-table">
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Fecha</th>
                  <th>Vencimiento</th>
                  <th>Días</th>
                  <th>Total</th>
                  <th>Estado</th>
                  <th>Asesor</th>
                </tr>
              </thead>
              <tbody>
                {invoicesData?.facturas?.map((factura, index) => (
                  <tr key={index} className={`estado-${factura.estado.toLowerCase().replace(' ', '-')}`}>
                    <td>{factura.folio}</td>
                    <td>{new Date(factura.fecha).toLocaleDateString()}</td>
                    <td>{new Date(factura.fechaVencimiento).toLocaleDateString()}</td>
                    <td className={factura.diasCorrientes < 0 ? 'vencido' : factura.diasCorrientes <= 7 ? 'a-vencer' : 'vigente'}>
                      {factura.diasCorrientes}
                    </td>
                    <td>${factura.total.toLocaleString()}</td>
                    <td>
                      <span className={`estado-badge estado-${factura.estado.toLowerCase().replace(' ', '-')}`}>
                        {factura.estado}
                      </span>
                    </td>
                    <td>{factura.asesor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default ClientHistory;
```

### **Hook para Historial de Producto:**
```jsx
function useProductHistory(codigo, type = 'orders') {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchHistory() {
      try {
        const endpoint = type === 'orders' ? 'product-orders' : 'product-invoices';
        const response = await fetch(`/api/contpaq/${endpoint}/${codigo}`);
        const result = await response.json();
        
        if (result.status === 'OK') {
          setData(result.data);
        } else {
          setError(result.message);
        }
      } catch (err) {
        setError('Error de conexión');
      } finally {
        setLoading(false);
      }
    }

    if (codigo) {
      fetchHistory();
    }
  }, [codigo, type]);

  return { data, loading, error };
}

// Componente de historial de producto
function ProductHistory({ codigo }) {
  const [activeTab, setActiveTab] = useState('orders');
  const { data: ordersData, loading: ordersLoading } = useProductHistory(codigo, 'orders');
  const { data: invoicesData, loading: invoicesLoading } = useProductHistory(codigo, 'invoices');

  return (
    <div className="product-history">
      <h2>Historial de {ordersData?.producto?.nombre || codigo}</h2>
      
      <div className="tabs">
        <button 
          className={activeTab === 'orders' ? 'active' : ''}
          onClick={() => setActiveTab('orders')}
        >
          Pedidos ({ordersData?.paginacion?.total || 0})
        </button>
        <button 
          className={activeTab === 'invoices' ? 'active' : ''}
          onClick={() => setActiveTab('invoices')}
        >
          Facturas ({invoicesData?.paginacion?.total || 0})
        </button>
      </div>
      
      {activeTab === 'orders' && (
        <div className="tab-content">
          {ordersLoading ? (
            <div>Cargando pedidos...</div>
          ) : (
            <table className="history-table">
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Cantidad</th>
                  <th>Precio</th>
                  <th>Total</th>
                  <th>Asesor</th>
                </tr>
              </thead>
              <tbody>
                {ordersData?.pedidos?.map((pedido, index) => (
                  <tr key={index}>
                    <td>{pedido.folio}</td>
                    <td>{new Date(pedido.fecha).toLocaleDateString()}</td>
                    <td>{pedido.cliente}</td>
                    <td>{pedido.cantidad}</td>
                    <td>${pedido.precio.toLocaleString()}</td>
                    <td>${pedido.total.toLocaleString()}</td>
                    <td>{pedido.asesor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      
      {activeTab === 'invoices' && (
        <div className="tab-content">
          {invoicesLoading ? (
            <div>Cargando facturas...</div>
          ) : (
            <table className="history-table">
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Cantidad</th>
                  <th>Precio</th>
                  <th>Total</th>
                  <th>Estado</th>
                  <th>Asesor</th>
                </tr>
              </thead>
              <tbody>
                {invoicesData?.facturas?.map((factura, index) => (
                  <tr key={index} className={`estado-${factura.estado.toLowerCase().replace(' ', '-')}`}>
                    <td>{factura.folio}</td>
                    <td>{new Date(factura.fecha).toLocaleDateString()}</td>
                    <td>{factura.cliente}</td>
                    <td>{factura.cantidad}</td>
                    <td>${factura.precio.toLocaleString()}</td>
                    <td>${factura.total.toLocaleString()}</td>
                    <td>
                      <span className={`estado-badge estado-${factura.estado.toLowerCase().replace(' ', '-')}`}>
                        {factura.estado}
                      </span>
                    </td>
                    <td>{factura.asesor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default ProductHistory;
```

### **Hook para Reporte de Cobranza:**
```jsx
function useCobranzaReport(filters = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchCobranza() {
      try {
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
          if (value) params.append(key, value);
        });
        
        const response = await fetch(`/api/contpaq/cobranza?${params}`);
        const result = await response.json();
        
        if (result.status === 'OK') {
          setData(result.data);
        } else {
          setError(result.message);
        }
      } catch (err) {
        setError('Error de conexión');
      } finally {
        setLoading(false);
      }
    }

    fetchCobranza();
  }, [filters]);

  return { data, loading, error };
}

// Componente de filtros
function CobranzaFilters({ onFiltersChange }) {
  const [filters, setFilters] = useState({
    asesor: '',
    estado: '',
    cliente: '',
    fechaInicio: '',
    fechaFin: ''
  });

  const handleChange = (field, value) => {
    const newFilters = { ...filters, [field]: value };
    setFilters(newFilters);
    onFiltersChange(newFilters);
  };

  return (
    <div className="cobranza-filters">
      <select 
        value={filters.asesor} 
        onChange={(e) => handleChange('asesor', e.target.value)}
      >
        <option value="">Todos los asesores</option>
        <option value="1">Guillermo Besserer A.</option>
        <option value="2">Juanita Fernández J.</option>
        <option value="4">Asesor 4</option>
        <option value="42">Asesor 42</option>
      </select>
      
      <select 
        value={filters.estado} 
        onChange={(e) => handleChange('estado', e.target.value)}
      >
        <option value="">Todos los estados</option>
        <option value="Vigente">Vigente</option>
        <option value="A Vencer">A Vencer</option>
        <option value="Vencido">Vencido</option>
      </select>
      
      <input 
        type="text" 
        placeholder="Cliente (código o nombre)"
        value={filters.cliente}
        onChange={(e) => handleChange('cliente', e.target.value)}
      />
      
      <input 
        type="date" 
        value={filters.fechaInicio}
        onChange={(e) => handleChange('fechaInicio', e.target.value)}
      />
      
      <input 
        type="date" 
        value={filters.fechaFin}
        onChange={(e) => handleChange('fechaFin', e.target.value)}
      />
    </div>
  );
}

// Componente principal
function CobranzaReport() {
  const [filters, setFilters] = useState({});
  const { data, loading, error } = useCobranzaReport(filters);

  if (loading) return <div>Cargando reporte de cobranza...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="cobranza-report">
      <h2>Reporte de Cobranza por Asesor</h2>
      
      <CobranzaFilters onFiltersChange={setFilters} />
      
      {data && (
        <>
          <div className="estadisticas">
            <div className="stat-card">
              <h3>Total Facturas</h3>
              <p>{data.estadisticas.totalFacturas}</p>
            </div>
            <div className="stat-card">
              <h3>Monto Total</h3>
              <p>${data.estadisticas.totalMonto.toLocaleString()}</p>
            </div>
            <div className="stat-card vencidas">
              <h3>Vencidas</h3>
              <p>{data.estadisticas.vencidas}</p>
            </div>
            <div className="stat-card vigentes">
              <h3>Vigentes</h3>
              <p>{data.estadisticas.vigentes}</p>
            </div>
            <div className="stat-card a-vencer">
              <h3>A Vencer</h3>
              <p>{data.estadisticas.aVencer}</p>
            </div>
          </div>
          
          <table className="facturas-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Factura</th>
                <th>Fecha Emisión</th>
                <th>Fecha Vencimiento</th>
                <th>Días Corrientes</th>
                <th>Total</th>
                <th>Estado</th>
                <th>Asesor</th>
              </tr>
            </thead>
            <tbody>
              {data.facturas.map((factura, index) => (
                <tr key={index} className={`estado-${factura.estado.toLowerCase().replace(' ', '-')}`}>
                  <td>{factura.nombreCliente}</td>
                  <td>{factura.factura}</td>
                  <td>{new Date(factura.fechaEmision).toLocaleDateString()}</td>
                  <td>{new Date(factura.fechaVencimiento).toLocaleDateString()}</td>
                  <td className={factura.diasCorrientes < 0 ? 'vencido' : factura.diasCorrientes <= 7 ? 'a-vencer' : 'vigente'}>
                    {factura.diasCorrientes}
                  </td>
                  <td>${factura.total.toLocaleString()}</td>
                  <td>
                    <span className={`estado-badge estado-${factura.estado.toLowerCase().replace(' ', '-')}`}>
                      {factura.estado}
                    </span>
                  </td>
                  <td>{factura.asesor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

export default CobranzaReport;
```

---

## 📋 **ESTÁNDARES DE RESPUESTA**

### **✅ Respuestas Estándar**
Todas las respuestas siguen el formato:
```json
{
  "status": "OK" | "ERROR",
  "data": { ... },
  "message": "Descripción opcional"
}
```

### **🔄 Auto-refresh Recomendado**
Para datos en tiempo real, se recomienda actualizar cada 30 segundos:
```javascript
setInterval(() => {
  // Actualizar datos
}, 30000);
```

### **📊 Datos en Tiempo Real**
Los datos se actualizan automáticamente desde Contpaq cada vez que se hace una petición.

---

## ⚠️ **MANEJO DE ERRORES**

### **Errores Comunes**
- `500` - Error interno del servidor
- `404` - Endpoint no encontrado
- `400` - Parámetros inválidos

### **Códigos de Estado**
- `200` - Éxito
- `400` - Solicitud incorrecta
- `404` - No encontrado
- `500` - Error interno

---

## 🎯 **ENDPOINTS PRIORITARIOS PARA UI**

1. **Cobranza** - Vista principal de facturas
2. **Client Orders/Invoices** - Historial por cliente
3. **Product Orders/Invoices** - Historial por producto
4. **Top Clients** - Ranking de clientes
5. **Test** - Verificación de conexión

---

## 🎨 **ESTILOS CSS RECOMENDADOS**

```css
/* Estilos para tabs */
.tabs {
  display: flex;
  border-bottom: 2px solid #e0e0e0;
  margin-bottom: 20px;
}

.tabs button {
  padding: 10px 20px;
  border: none;
  background: none;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.3s ease;
}

.tabs button.active {
  border-bottom-color: #3498db;
  color: #3498db;
  font-weight: 600;
}

/* Estilos para tablas */
.history-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.history-table th {
  background: #34495e;
  color: white;
  padding: 15px;
  text-align: left;
  font-weight: 600;
}

.history-table td {
  padding: 12px 15px;
  border-bottom: 1px solid #eee;
}

.history-table tr:hover {
  background: #f8f9fa;
}

/* Estados de facturas */
.estado-badge {
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
}

.estado-vigente {
  background: #d4edda;
  color: #155724;
}

.estado-a-vencer {
  background: #fff3cd;
  color: #856404;
}

.estado-vencido {
  background: #f8d7da;
  color: #721c24;
}

.vencido {
  color: #e74c3c;
  font-weight: bold;
}

.a-vencer {
  color: #f39c12;
  font-weight: bold;
}

.vigente {
  color: #27ae60;
  font-weight: bold;
}

/* Filtros */
.cobranza-filters {
  display: flex;
  gap: 15px;
  margin-bottom: 30px;
  padding: 20px;
  background: #f5f5f5;
  border-radius: 8px;
  flex-wrap: wrap;
}

.cobranza-filters select,
.cobranza-filters input {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

/* Estadísticas */
.estadisticas {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.stat-card {
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  text-align: center;
}

.stat-card h3 {
  margin: 0 0 10px 0;
  color: #666;
  font-size: 14px;
  text-transform: uppercase;
}

.stat-card p {
  margin: 0;
  font-size: 24px;
  font-weight: bold;
  color: #333;
}

.stat-card.vencidas {
  border-left: 4px solid #e74c3c;
}

.stat-card.vigentes {
  border-left: 4px solid #27ae60;
}

.stat-card.a-vencer {
  border-left: 4px solid #f39c12;
}
```

---

## 📞 **SOPORTE**

Para cualquier duda o problema con la API, contactar al equipo de desarrollo.

**Versión:** 5.0.0  
**Última actualización:** Octubre 2025  
**Estado:** ✅ Producción