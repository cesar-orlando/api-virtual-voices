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
- `estado` (string, opcional): Estado de la factura (Vigente, Vencido, A Vencer, Pagado)
- `cliente` (string, opcional): Código o nombre del cliente
- `fechaInicio` (string, opcional): Fecha de inicio (YYYY-MM-DD)
- `fechaFin` (string, opcional): Fecha de fin (YYYY-MM-DD)
- `incluirConversiones` (boolean, opcional): Incluir conversiones USD→PESOS (default: false)
- `soloDeudas` (boolean, opcional): Mostrar SOLO facturas vencidas con saldo pendiente (default: false)

**⚠️ IMPORTANTE - Lógica de Estados (PRIORIDAD EN ORDEN):**

El sistema evalúa en este orden:

1. **"Pagado"**: Facturas que YA SE COBRARON (`pendiente = 0`)
   - ✅ Sin importar si la fecha de vencimiento pasó o no
   - ✅ Los días corrientes siempre son **0** para evitar confusión
   - ✅ Ejemplo: Factura venció hace 25 días pero ya pagó → "Pagado"

2. **"Vencido"**: Facturas que PASARON su fecha de vencimiento Y NO han pagado
   - ✅ Solo si `pendiente > 0` (aún deben dinero)
   - ✅ Días corrientes **POSITIVOS** (ej: +25, +30, etc.) - Indica días de atraso
   - ✅ Ejemplo: Factura venció hace 10 días y aún debe $5,000 → "Vencido" → diasCorrientes = **+10**

3. **"A Vencer"**: Facturas que vencen en los PRÓXIMOS 0-7 días Y NO han pagado
   - ✅ Solo si `pendiente > 0`
   - ✅ Días corrientes **NEGATIVOS** entre -7 y -1 (ej: -5, -3, -1)
   - ✅ Ejemplo: Factura vence en 3 días y debe $1,000 → "A Vencer" → diasCorrientes = **-3**

4. **"Vigente"**: Facturas que vencen en MÁS DE 7 días Y NO han pagado
   - ✅ Solo si `pendiente > 0`
   - ✅ Días corrientes **NEGATIVOS** menores a -7 (ej: -15, -20, -30)
   - ✅ Ejemplo: Factura vence en 20 días y debe $2,000 → "Vigente" → diasCorrientes = **-20**

**📋 Tabla de Estados (Ejemplos Reales - Como se ve en tu tabla):**

| Fecha Vencimiento | Días Corrientes | Pendiente | Estado | Por qué |
|-------------------|-----------------|-----------|--------|---------|
| 30/9/2025 (hace 25 días) | **+25** 🔴 | $129.36 | **Vencido** | Ya venció Y no ha pagado (25 días de atraso) |
| 1/10/2025 (hace 25 días) | **0** 🔵 | $0 | **Pagado** | Ya pagó (días siempre = 0) |
| 20/10/2025 (hace 6 días) | **+6** 🔴 | $1,000 | **Vencido** | Ya venció Y no ha pagado (6 días de atraso) |
| 28/10/2025 (hoy) | **0** 🟡 | $500 | **A Vencer** | Vence hoy Y no ha pagado |
| 2/11/2025 (en 5 días) | **-5** 🟡 | $2,000 | **A Vencer** | Vence en 5 días Y no ha pagado |
| 15/11/2025 (en 18 días) | **-18** 🟢 | $3,000 | **Vigente** | Vence en 18 días Y no ha pagado |

**💡 Recomendación para Cobranza:**
- Usar `estado=Vencido` para ver SOLO facturas atrasadas que aún deben dinero
- Usar `estado=Pagado` para ver facturas cobradas (verificación)
- Usar `soloDeudas=true` para ver TODAS las deudas vencidas (más restrictivo)

**Nota:** Sin filtros de fecha muestra TODAS las facturas históricas. Se recomienda usar filtros de fecha para datos relevantes.

**Ejemplos de uso:**
```javascript
// 🎯 CASOS DE USO RECOMENDADOS PARA COBRANZA:

// 1. Ver SOLO deudas vencidas (LO MÁS USADO)
const response = await fetch('/api/contpaq/cobranza?fechaInicio=2025-01-01&fechaFin=2025-10-26&soloDeudas=true');

// 2. Ver facturas vencidas del mes actual (sin pagadas)
const response = await fetch('/api/contpaq/cobranza?fechaInicio=2025-10-01&fechaFin=2025-10-31&estado=Vencido');

// 3. Ver deudas vencidas de un cliente específico
const response = await fetch('/api/contpaq/cobranza?cliente=CL1578&soloDeudas=true');

// 4. Ver deudas de un asesor específico
const response = await fetch('/api/contpaq/cobranza?asesor=42&estado=Vencido&fechaInicio=2025-01-01&fechaFin=2025-12-31');

// 5. Ver facturas pagadas del mes (para verificación)
const response = await fetch('/api/contpaq/cobranza?fechaInicio=2025-10-01&fechaFin=2025-10-31&estado=Pagado');

// 6. Ver todas las facturas del mes con conversiones
const response = await fetch('/api/contpaq/cobranza?fechaInicio=2025-10-01&fechaFin=2025-10-31&incluirConversiones=true');

// 7. Reporte completo de cobranza (TODAS las facturas históricas - NO RECOMENDADO)
const response = await fetch('/api/contpaq/cobranza');
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
        "factura": "10901",
        "fechaEmision": "2025-10-01T00:00:00.000Z",
        "fechaVencimiento": "2025-10-01T00:00:00.000Z",
        "diasCorrientes": 25,
        "total": 129.36,
        "pendiente": 129.36,
        "moneda": "PESOS",
        "estado": "Vencido",
        "asesor": "Juanita Fernández J.",
        "idAsesor": 56
      },
      {
        "codigoCliente": "CL9999",
        "nombreCliente": "CLIENTE PAGADO",
        "diasCredito": 30,
        "factura": "10910",
        "fechaEmision": "2025-10-01T00:00:00.000Z",
        "fechaVencimiento": "2025-10-01T00:00:00.000Z",
        "diasCorrientes": 0,
        "total": 15439.60,
        "pendiente": 0,
        "moneda": "PESOS",
        "estado": "Pagado",
        "asesor": "Patricia Guzmán T.",
        "idAsesor": 11
      }
    ],
    "estadisticas": {
      "totalFacturas": 147,
      "totalMonto": 384951.24,
      "montoPendiente": 169120.62,
      "vencidas": 118,
      "vigentes": 0,
      "aVencer": 0,
      "pagadas": 29,
      "montoVencido": 169120.62
    },
    "filtros": {
      "asesor": null,
      "estado": null,
      "cliente": null,
      "fechaInicio": "2025-10-01",
      "fechaFin": "2025-10-31",
      "incluirConversiones": false,
      "soloDeudas": false
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
- **Vigente:** Facturas con saldo pendiente y fecha de vencimiento mayor a 7 días en el futuro
- **A Vencer:** Facturas con saldo pendiente que vencen en los próximos 0-7 días
- **Vencido:** Facturas con saldo pendiente (`pendiente > 0`) Y fecha de vencimiento pasada
- **Pagado:** Facturas sin saldo pendiente (`pendiente = 0`). **Los días corrientes siempre son 0**

**💱 Conversión de Monedas:**
- **PESOS:** Se mantienen igual (`totalEnPesos = total`)
- **USD:** Se convierten usando tipos de cambio reales de Contpaq (`admTiposCambio`)
- **Tipo de cambio:** Se obtiene por fecha de emisión de la factura
- **Campos adicionales:** `totalEnPesos`, `tipoCambio`, `fechaTipoCambio`

---

## **💻 GUÍA DE IMPLEMENTACIÓN FRONTEND - COBRANZA**

### **🎯 Configuración de Filtros Recomendada:**

```jsx
import React, { useState, useEffect } from 'react';

const CobranzaPage = () => {
  const [filtros, setFiltros] = useState({
    fechaInicio: '2025-01-01',
    fechaFin: '2025-10-31',
    asesor: '',
    estado: 'Vencido',  // ← DEFAULT: Vencido (para cobranza)
    cliente: '',
    soloDeudas: false
  });
  
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchCobranza();
  }, [filtros]);

  const fetchCobranza = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      
      // Solo agregar parámetros si tienen valor
      if (filtros.fechaInicio) params.append('fechaInicio', filtros.fechaInicio);
      if (filtros.fechaFin) params.append('fechaFin', filtros.fechaFin);
      if (filtros.asesor) params.append('asesor', filtros.asesor);
      if (filtros.estado) params.append('estado', filtros.estado);
      if (filtros.cliente) params.append('cliente', filtros.cliente);
      if (filtros.soloDeudas) params.append('soloDeudas', 'true');
      
      const response = await fetch(`/api/contpaq/cobranza?${params}`);
      const result = await response.json();
      
      if (result.status === 'OK') {
        setData(result.data);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cobranza-page">
      {/* Filtros */}
      <div className="filtros-container">
        <div className="filtro-grupo">
          <label>Rango de Fechas:</label>
          <input 
            type="date" 
            value={filtros.fechaInicio}
            onChange={(e) => setFiltros({...filtros, fechaInicio: e.target.value})}
          />
          <input 
            type="date" 
            value={filtros.fechaFin}
            onChange={(e) => setFiltros({...filtros, fechaFin: e.target.value})}
          />
        </div>

        <div className="filtro-grupo">
          <label>Asesor:</label>
          <select 
            value={filtros.asesor}
            onChange={(e) => setFiltros({...filtros, asesor: e.target.value})}
          >
            <option value="">Todos los asesores</option>
            <option value="56">Juanita Fernández J.</option>
            <option value="42">Gerson Briceño T</option>
            <option value="11">Patricia Guzmán T.</option>
            {/* Agregar más asesores */}
          </select>
        </div>

        <div className="filtro-grupo">
          <label>Estado:</label>
          <select 
            value={filtros.estado}
            onChange={(e) => setFiltros({...filtros, estado: e.target.value})}
          >
            <option value="">Todos</option>
            <option value="Vencido">Vencido (Deudas)</option>
            <option value="A Vencer">A Vencer (0-7 días)</option>
            <option value="Vigente">Vigente</option>
            <option value="Pagado">Pagado</option>
          </select>
        </div>

        <div className="filtro-grupo">
          <label>Cliente:</label>
          <input 
            type="text"
            placeholder="Buscar cliente..."
            value={filtros.cliente}
            onChange={(e) => setFiltros({...filtros, cliente: e.target.value})}
          />
        </div>

        <div className="filtro-grupo">
          <label>
            <input 
              type="checkbox"
              checked={filtros.soloDeudas}
              onChange={(e) => setFiltros({...filtros, soloDeudas: e.target.checked})}
            />
            Solo Deudas Vencidas
          </label>
        </div>
      </div>

      {/* Estadísticas */}
      {data && (
        <div className="estadisticas-grid">
          <div className="stat-card">
            <h3>Total Facturas</h3>
            <p className="stat-value">{data.estadisticas.totalFacturas}</p>
          </div>
          <div className="stat-card">
            <h3>Monto Total</h3>
            <p className="stat-value">${data.estadisticas.totalMonto.toLocaleString('es-MX')}</p>
          </div>
          <div className="stat-card stat-pendiente">
            <h3>Monto Pendiente</h3>
            <p className="stat-value">${data.estadisticas.montoPendiente.toLocaleString('es-MX')}</p>
          </div>
          <div className="stat-card stat-vencidas">
            <h3>Vencidas</h3>
            <p className="stat-value">{data.estadisticas.vencidas}</p>
          </div>
          <div className="stat-card stat-vigentes">
            <h3>Vigentes</h3>
            <p className="stat-value">{data.estadisticas.vigentes}</p>
          </div>
          <div className="stat-card stat-pagadas">
            <h3>Pagadas</h3>
            <p className="stat-value">{data.estadisticas.pagadas}</p>
          </div>
        </div>
      )}

      {/* Tabla de facturas */}
      {data && (
        <div className="tabla-facturas-container">
          <table className="tabla-facturas">
            <thead>
              <tr>
                <th>Crédito</th>
                <th>Factura</th>
                <th>Emisión</th>
                <th>Vence</th>
                <th>Días Corr.</th>
                <th>Total</th>
                <th>Pendiente</th>
                <th>Moneda</th>
                <th>Estado</th>
                <th>Asesor</th>
              </tr>
            </thead>
            <tbody>
              {data.facturas.map((factura, index) => (
                <tr key={index} className={`fila-${factura.estado.toLowerCase()}`}>
                  <td>{factura.diasCredito} días</td>
                  <td className="factura-numero">{factura.factura}</td>
                  <td>{new Date(factura.fechaEmision).toLocaleDateString('es-MX')}</td>
                  <td>{new Date(factura.fechaVencimiento).toLocaleDateString('es-MX')}</td>
                  <td className={`dias-corrientes ${factura.diasCorrientes > 0 ? 'vencido' : factura.diasCorrientes === 0 ? 'pagado' : 'vigente'}`}>
                    {factura.diasCorrientes > 0 ? `-${factura.diasCorrientes}` : factura.diasCorrientes}
                  </td>
                  <td className="monto">${factura.total.toLocaleString('es-MX')}</td>
                  <td className="monto pendiente">
                    ${factura.pendiente.toLocaleString('es-MX')}
                  </td>
                  <td className={`moneda-${factura.moneda.toLowerCase().includes('peso') ? 'pesos' : 'usd'}`}>
                    {factura.moneda === 'Peso Mexicano' ? 'PESOS' : 'USD'}
                  </td>
                  <td>
                    <span className={`badge badge-${factura.estado.toLowerCase()}`}>
                      {factura.estado}
                    </span>
                  </td>
                  <td>{factura.asesor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default CobranzaPage;
```

### **🎨 Estilos CSS Recomendados:**

```css
.cobranza-page {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
}

.filtros-container {
  display: flex;
  gap: 15px;
  flex-wrap: wrap;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 10px;
  margin-bottom: 20px;
}

.filtro-grupo {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.filtro-grupo label {
  font-weight: 600;
  font-size: 0.9rem;
  color: #495057;
}

.filtro-grupo input,
.filtro-grupo select {
  padding: 8px 12px;
  border: 1px solid #dee2e6;
  border-radius: 5px;
  font-size: 0.9rem;
}

.estadisticas-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
  margin-bottom: 20px;
}

.stat-card {
  background: white;
  padding: 20px;
  border-radius: 10px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  border-left: 4px solid #007bff;
}

.stat-card h3 {
  margin: 0 0 10px 0;
  font-size: 0.9rem;
  color: #6c757d;
  text-transform: uppercase;
}

.stat-value {
  margin: 0;
  font-size: 1.8rem;
  font-weight: bold;
  color: #212529;
}

.stat-pendiente {
  border-left-color: #ffc107;
}

.stat-vencidas {
  border-left-color: #dc3545;
}

.stat-vigentes {
  border-left-color: #28a745;
}

.stat-pagadas {
  border-left-color: #17a2b8;
}

.tabla-facturas-container {
  background: white;
  border-radius: 10px;
  padding: 20px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  overflow-x: auto;
}

.tabla-facturas {
  width: 100%;
  border-collapse: collapse;
  min-width: 1200px;
}

.tabla-facturas th {
  background: #343a40;
  color: white;
  padding: 12px 10px;
  text-align: left;
  font-weight: 600;
  font-size: 0.85rem;
  text-transform: uppercase;
}

.tabla-facturas td {
  padding: 12px 10px;
  border-bottom: 1px solid #dee2e6;
  font-size: 0.9rem;
}

.fila-vencido {
  background: #fff5f5;
}

.fila-pagado {
  background: #f0f9ff;
}

.factura-numero {
  font-weight: 600;
  color: #007bff;
}

.monto {
  text-align: right;
  font-weight: 600;
}

.pendiente {
  color: #dc3545;
}

.dias-corrientes {
  text-align: center;
  font-weight: 600;
}

.dias-corrientes.vencido {
  color: #dc3545;
  background: #fff5f5;
  padding: 4px 8px;
  border-radius: 4px;
}

.dias-corrientes.pagado {
  color: #17a2b8;
  background: #e7f6f8;
  padding: 4px 8px;
  border-radius: 4px;
}

.dias-corrientes.vigente {
  color: #28a745;
}

.moneda-pesos {
  color: #28a745;
  font-weight: bold;
}

.moneda-usd {
  color: #007bff;
  font-weight: bold;
}

.badge {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  display: inline-block;
}

.badge-vencido {
  background: #f8d7da;
  color: #721c24;
}

.badge-vigente {
  background: #d4edda;
  color: #155724;
}

.badge-a-vencer {
  background: #fff3cd;
  color: #856404;
}

.badge-pagado {
  background: #d1ecf1;
  color: #0c5460;
}
```

---

### **📋 PUNTOS IMPORTANTES PARA EL FRONTEND:**

1. ✅ **Default estado = "Vencido"** - Para que cobranza vea directamente las deudas
2. ✅ **Días corrientes = 0** cuando está pagado - Para evitar confusión
3. ✅ **Color diferente** para facturas vencidas (fondo rojizo)
4. ✅ **Filtro "Solo Deudas"** como checkbox - Para uso rápido
5. ✅ **Rango de fechas obligatorio** - Evita cargar todo el historial
6. ✅ **Estadísticas visibles** - Para ver resumen rápido
7. ✅ **Colores claros** para diferenciar estados

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

## **📊 ENDPOINTS DE REPORTES DE VENTAS**

### **1. Reporte de Ventas por Vendedor**
**Endpoint:** `GET /api/contpaq/sales-report`

**Parámetros:**
- `fechaInicio` (opcional): Fecha de inicio en formato YYYY-MM-DD
- `fechaFin` (opcional): Fecha de fin en formato YYYY-MM-DD
- `vendedor` (opcional): ID del vendedor específico
- `incluirConversiones` (opcional): true/false para incluir conversiones de moneda

**Ejemplo de uso:**
```javascript
const response = await fetch('/api/contpaq/sales-report?fechaInicio=2025-01-01&fechaFin=2025-12-31&incluirConversiones=true');
const data = await response.json();
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "vendedores": [
      {
        "idVendedor": 42,
        "nombreVendedor": "Gerson Briceño T",
        "totalFacturas": 51,
        "totalVentas": 723351,
        "ventasPesos": 671393.62,
        "ventasUSD": 51957.38,
        "promedioVenta": 14183.35,
        "primeraVenta": "2025-01-07T00:00:00.000Z",
        "ultimaVenta": "2025-10-10T00:00:00.000Z",
        "ventasUSDEnPesos": 1009596.20,
        "totalEnPesos": 1680989.82,
        "tipoCambioUsado": 19.43
      }
    ],
    "resumen": {
      "totalVendedores": 8,
      "totalFacturas": 134,
      "totalVentas": 1578718.06,
      "totalVentasPesos": 1511258.02,
      "totalVentasUSD": 67460.04,
      "totalEnPesos": 2822090.09
    }
  }
}
```

### **2. Métricas Comparativas de Ventas (2024 vs 2025)**
**Endpoint:** `GET /api/contpaq/sales-metrics`

**Parámetros:**
- `incluirConversiones` (opcional): true/false para incluir conversiones de moneda

**Ejemplo de uso:**
```javascript
const response = await fetch('/api/contpaq/sales-metrics?incluirConversiones=true');
const data = await response.json();
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "metricas": [
      {
        "año": 2024,
        "totalFacturas": 219,
        "totalVentas": 2956760.63,
        "ventasPesos": 2846585.95,
        "ventasUSD": 110174.68,
        "promedioVenta": 13501.19,
        "clientesUnicos": 84,
        "vendedoresActivos": 8,
        "ventasUSDEnPesos": 2016111.37,
        "totalEnPesos": 4862697.32,
        "tipoCambioPromedio": 18.30
      },
      {
        "año": 2025,
        "totalFacturas": 134,
        "totalVentas": 1578718.06,
        "ventasPesos": 1511258.02,
        "ventasUSD": 67460.04,
        "promedioVenta": 11781.48,
        "clientesUnicos": 71,
        "vendedoresActivos": 8,
        "ventasUSDEnPesos": 1310832.07,
        "totalEnPesos": 2822090.09,
        "tipoCambioPromedio": 19.43
      }
    ],
    "crecimiento": {
      "porcentaje": -41.96,
      "diferencia": -2040607.23
    }
  }
}
```

### **3. Top Clientes por Período**
**Endpoint:** `GET /api/contpaq/top-clients`

**Parámetros:**
- `fechaInicio` (opcional): Fecha de inicio en formato YYYY-MM-DD
- `fechaFin` (opcional): Fecha de fin en formato YYYY-MM-DD
- `limit` (opcional): Número de clientes a retornar (default: 10)
- `incluirConversiones` (opcional): true/false para incluir conversiones de moneda

**Ejemplo de uso:**
```javascript
const response = await fetch('/api/contpaq/top-clients?fechaInicio=2025-01-01&fechaFin=2025-12-31&limit=5&incluirConversiones=true');
const data = await response.json();
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "clientes": [
      {
        "codigoCliente": "PRO450",
        "nombreCliente": "MAQUILADORA Y PROCESOS CESARE SA DE C.V",
        "rfc": "MPC201222349",
        "totalPedidos": 0,
        "totalFacturas": 0,
        "montoTotal": 2302277.49,
        "montoFacturas": 0,
        "montoPedidos": 0,
        "ultimaCompra": "2025-10-10T00:00:00.000Z",
        "asesor": "(Ninguno)",
        "ticketPromedio": 143892.34
      }
    ],
    "total": 847,
    "filtros": {
      "fechaInicio": "2025-01-01",
      "fechaFin": "2025-12-31"
    }
  }
}
```

### **4. Top Productos por Período**
**Endpoint:** `GET /api/contpaq/top-products`

**Parámetros:**
- `fechaInicio` (opcional): Fecha de inicio en formato YYYY-MM-DD
- `fechaFin` (opcional): Fecha de fin en formato YYYY-MM-DD
- `limit` (opcional): Número de productos a retornar (default: 10)
- `incluirConversiones` (opcional): true/false para incluir conversiones de moneda

**Ejemplo de uso:**
```javascript
const response = await fetch('/api/contpaq/top-products?fechaInicio=2025-01-01&fechaFin=2025-12-31&limit=5&incluirConversiones=true');
const data = await response.json();
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "productos": [
      {
        "codigoProducto": "0600000119055",
        "nombreProducto": "SIMPLE GREEN CRYSTAL, Tambor de 208 Litros",
        "totalPiezas": 84,
        "totalVentas": 642949.72,
        "ventasPesos": 615023.88,
        "ventasUSD": 27925.84,
        "porcentaje": 52.92,
        "porcentajeUSD": 70.47,
        "precioPromedio": 13118.48,
        "clientesUnicos": 17,
        "ventasUSDEnPesos": 542633.63,
        "totalEnPesos": 1157657.51,
        "tipoCambioUsado": 19.43
      }
    ],
    "resumen": {
      "totalProductos": 5,
      "totalVendido": 374,
      "totalVentas": 1214888.18,
      "totalVentasUSD": 39625.62,
      "totalEnPesos": 1945237.40
    }
  }
}
```

### **5. Comparativas Mensuales de Ventas**
**Endpoint:** `GET /api/contpaq/sales-comparison`

**Parámetros:**
- `año` (opcional): Año a analizar (default: 2025)
- `incluirConversiones` (opcional): true/false para incluir conversiones de moneda

**Ejemplo de uso:**
```javascript
const response = await fetch('/api/contpaq/sales-comparison?año=2025&incluirConversiones=true');
const data = await response.json();
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "meses": [
      {
        "mes": 1,
        "nombreMes": "January",
        "totalFacturas": 15,
        "totalVentas": 180000,
        "ventasPesos": 150000,
        "ventasUSD": 30000,
        "promedioVenta": 12000,
        "clientesUnicos": 12,
        "ventasUSDEnPesos": 582000,
        "totalEnPesos": 732000,
        "tipoCambioPromedio": 19.40
      }
    ],
    "totalesAnuales": {
      "totalFacturas": 134,
      "totalVentas": 1578718.06,
      "totalVentasPesos": 1511258.02,
      "totalVentasUSD": 67460.04,
      "totalEnPesos": 2822090.09
    },
    "año": 2025
  }
}
```

---

## **📊 NUEVO: DASHBOARD DE VENTAS COMPLETO**

### **9. 🎯 Dashboard de Ventas (Sales Dashboard)**
```http
GET /api/contpaq/sales-dashboard
```

**Descripción:** Dashboard completo que replica el Excel del director de ventas, con ventas por vendedor, desglose semanal, comparativas anuales, top clientes y productos.

**⚠️ IMPORTANTE:** Este endpoint **siempre muestra datos del mes ANTERIOR** a la fecha especificada en `fechaInicio`. Por ejemplo:
- `fechaInicio=2025-07-01` → Muestra datos de **JUNIO 2025**
- `fechaInicio=2025-06-01` → Muestra datos de **MAYO 2025**

**Parámetros:**
- `fechaInicio` (string, requerido): Fecha de referencia (YYYY-MM-DD). Los datos serán del mes anterior
- `fechaFin` (string, requerido): Fecha de fin (YYYY-MM-DD). Puede ser cualquier valor, no afecta el resultado
- `año1` (number, opcional): Primer año para comparación (default: 2024)
- `año2` (number, opcional): Segundo año para comparación (default: 2025)

**Ejemplos de uso:**
```javascript
// Dashboard de Mayo 2025 (comparando 2024 vs 2025)
const response = await fetch('/api/contpaq/sales-dashboard?fechaInicio=2025-06-01&fechaFin=2025-06-30');

// Dashboard de Junio 2025
const response = await fetch('/api/contpaq/sales-dashboard?fechaInicio=2025-07-01&fechaFin=2025-07-31');

// Dashboard con años personalizados (2023 vs 2024)
const response = await fetch('/api/contpaq/sales-dashboard?fechaInicio=2024-07-01&fechaFin=2024-07-31&año1=2023&año2=2024');
```

**Respuesta exitosa:**
```json
{
  "status": "OK",
  "data": {
    "vendedores": [
      {
        "nombre": "Gerson Briceño T",
        "idVendedor": 42,
        "ventasMes": {
          "sem1": {
            "usd": 14079.65,
            "mxn": 13961.41
          },
          "sem2": {
            "usd": 20318.24,
            "mxn": 5474.02
          },
          "sem3": {
            "usd": 23668.64,
            "mxn": 559
          },
          "sem4": {
            "usd": 1700.39,
            "mxn": 120975.05
          },
          "totalUsd": 59766.92,
          "totalMxn": 140969.48
        },
        "refacturado": 0,
        "totalUsd": 59766.92,
        "totalMxn": 140969.48,
        "totalConvertido": 1336307.88,
        "meta": 27000,
        "porcentajeMeta": 4949.3,
        "comision": 5,
        "ventas2024": {
          "usd": 104568.14,
          "mxn": 973384.35
        },
        "ventas2025": {
          "usd": 238824.22,
          "mxn": 1036950.8
        },
        "ventas2025Total": 5813435.2,
        "porcentajeTotal": "89.7",
        "meta2025": 300000,
        "porcentajeMeta2025": 1937.8
      }
    ],
    "comparativas": {
      "mxn": [
        {
          "mes": "ENE",
          "año2024": 120,
          "año2025": 107,
          "porcentaje": "-10.83"
        }
      ],
      "usd": [
        {
          "mes": "ENE",
          "año2024": 120,
          "año2025": 107,
          "porcentaje": "-10.83"
        }
      ]
    },
    "topClientes": [
      {
        "nombre": "INDUSTRIAS JOHN CRANE DE MEXICO",
        "monto": 116216.02,
        "porcentaje": 21.31
      }
    ],
    "topProductos": [
      {
        "nombre": "SIMPLE GREEN CRYSTAL, Tambor de 208 Litros",
        "usd": 58235.58
      }
    ],
    "periodo": {
      "fechaInicio": "2025-06-01",
      "fechaFin": "2025-06-30"
    },
    "añosComparados": {
      "año1": 2024,
      "año2": 2025
    },
    "tipoCambio": 20
  }
}
```

**Estructura de datos detallada:**

### **vendedores[] (Array de vendedores)**
Cada vendedor contiene:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `nombre` | string | Nombre completo del vendedor |
| `idVendedor` | number | ID del vendedor en Contpaq |
| `ventasMes.sem1` | object | Ventas de la semana 1 (días 1-7) |
| `ventasMes.sem2` | object | Ventas de la semana 2 (días 8-14) |
| `ventasMes.sem3` | object | Ventas de la semana 3 (días 15-21) |
| `ventasMes.sem4` | object | Ventas de la semana 4 (días 22+) |
| `ventasMes.totalUsd` | number | Total USD del mes |
| `ventasMes.totalMxn` | number | Total MXN del mes |
| `totalUsd` | number | Total USD del mes (duplicado para facilidad) |
| `totalMxn` | number | Total MXN del mes (duplicado para facilidad) |
| `totalConvertido` | number | Total convertido: (USD * 20) + MXN |
| `meta` | number | Meta mensual del vendedor (HARDCODED: 27000) |
| `porcentajeMeta` | number | % de cumplimiento de meta mensual |
| `comision` | number | % de comisión del vendedor |
| `ventas2024` | object | Ventas acumuladas del año 2024 (hasta el mes) |
| `ventas2025` | object | Ventas acumuladas del año 2025 (hasta el mes) |
| `ventas2025Total` | number | Total 2025 convertido: (USD * 20) + MXN |
| `porcentajeTotal` | string | % de incremento 2024 vs 2025 |
| `meta2025` | number | Meta anual del vendedor (HARDCODED: 300000) |
| `porcentajeMeta2025` | number | % de cumplimiento de meta anual |
| `refacturado` | number | Monto refacturado (actualmente siempre 0) |

**Estructura de semanas:**
```json
{
  "usd": 14079.65,  // Ventas en USD de esa semana
  "mxn": 13961.41   // Ventas en MXN de esa semana
}
```

### **comparativas (Comparativas mensuales)**
Contiene dos arrays: `mxn` y `usd`, cada uno con 12 objetos (uno por mes):

```json
{
  "mes": "ENE",          // Nombre del mes
  "año2024": 120,        // Total en miles para 2024
  "año2025": 107,        // Total en miles para 2025
  "porcentaje": "-10.83" // % de variación
}
```

### **topClientes[] (Top 6 clientes del mes)**
```json
{
  "nombre": "INDUSTRIAS JOHN CRANE DE MEXICO",
  "monto": 116216.02,     // Monto total convertido
  "porcentaje": 21.31     // % del total
}
```

### **topProductos[] (Top 5 productos en USD del mes)**
```json
{
  "nombre": "SIMPLE GREEN CRYSTAL, Tambor de 208 Litros",
  "usd": 58235.58  // Total vendido en USD
}
```

---

## **💻 IMPLEMENTACIÓN EN REACT - SALES DASHBOARD**

### **Hook personalizado:**
```jsx
import { useState, useEffect } from 'react';

const useSalesDashboard = (fechaInicio, fechaFin, año1 = 2024, año2 = 2025) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDashboard = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          fechaInicio,
          fechaFin,
          año1: año1.toString(),
          año2: año2.toString()
        });
        
        const response = await fetch(`/api/contpaq/sales-dashboard?${params}`);
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

    if (fechaInicio && fechaFin) {
      fetchDashboard();
    }
  }, [fechaInicio, fechaFin, año1, año2]);

  return { data, loading, error };
};

export default useSalesDashboard;
```

### **Componente de Dashboard:**
```jsx
import React, { useState } from 'react';
import useSalesDashboard from './hooks/useSalesDashboard';

const SalesDashboard = () => {
  // Para ver mayo 2025, usamos junio como fecha de inicio
  const [fechaInicio, setFechaInicio] = useState('2025-06-01');
  const [fechaFin, setFechaFin] = useState('2025-06-30');
  
  const { data, loading, error } = useSalesDashboard(fechaInicio, fechaFin);

  if (loading) return <div className="loading">Cargando dashboard...</div>;
  if (error) return <div className="error">Error: {error}</div>;
  if (!data) return null;

  return (
    <div className="sales-dashboard">
      <div className="dashboard-header">
        <h1>Dashboard de Ventas</h1>
        <div className="period-info">
          <p>Período: {new Date(data.periodo.fechaInicio).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}</p>
          <p>Tipo de cambio: ${data.tipoCambio} MXN/USD</p>
        </div>
      </div>

      {/* Tabla de vendedores */}
      <div className="vendedores-table">
        <h2>Ventas por Vendedor</h2>
        <table>
          <thead>
            <tr>
              <th>Vendedor</th>
              <th>Sem 1 USD</th>
              <th>Sem 2 USD</th>
              <th>Sem 3 USD</th>
              <th>Sem 4 USD</th>
              <th>Total USD</th>
              <th>Total MXN</th>
              <th>Total Convertido</th>
              <th>Meta</th>
              <th>% Meta</th>
              <th>Comisión</th>
            </tr>
          </thead>
          <tbody>
            {data.vendedores.map((vendedor) => (
              <tr key={vendedor.idVendedor}>
                <td className="vendedor-nombre">{vendedor.nombre}</td>
                <td>${vendedor.ventasMes.sem1.usd.toLocaleString('en-US')}</td>
                <td>${vendedor.ventasMes.sem2.usd.toLocaleString('en-US')}</td>
                <td>${vendedor.ventasMes.sem3.usd.toLocaleString('en-US')}</td>
                <td>${vendedor.ventasMes.sem4.usd.toLocaleString('en-US')}</td>
                <td className="total-usd">${vendedor.totalUsd.toLocaleString('en-US')}</td>
                <td className="total-mxn">${vendedor.totalMxn.toLocaleString('es-MX')}</td>
                <td className="total-convertido">${vendedor.totalConvertido.toLocaleString('es-MX')}</td>
                <td>${vendedor.meta.toLocaleString('es-MX')}</td>
                <td className={vendedor.porcentajeMeta >= 100 ? 'meta-alcanzada' : 'meta-pendiente'}>
                  {vendedor.porcentajeMeta.toFixed(1)}%
                </td>
                <td>{vendedor.comision}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Comparativa anual */}
      <div className="comparativa-anual">
        <h2>Comparativa Anual ({data.añosComparados.año1} vs {data.añosComparados.año2})</h2>
        <table>
          <thead>
            <tr>
              <th>Vendedor</th>
              <th>{data.añosComparados.año1} USD</th>
              <th>{data.añosComparados.año1} MXN</th>
              <th>{data.añosComparados.año2} USD</th>
              <th>{data.añosComparados.año2} MXN</th>
              <th>Total {data.añosComparados.año2}</th>
              <th>% Incremento</th>
              <th>Meta {data.añosComparados.año2}</th>
              <th>% Meta</th>
            </tr>
          </thead>
          <tbody>
            {data.vendedores.map((vendedor) => (
              <tr key={vendedor.idVendedor}>
                <td>{vendedor.nombre}</td>
                <td>${vendedor.ventas2024.usd.toLocaleString('en-US')}</td>
                <td>${vendedor.ventas2024.mxn.toLocaleString('es-MX')}</td>
                <td>${vendedor.ventas2025.usd.toLocaleString('en-US')}</td>
                <td>${vendedor.ventas2025.mxn.toLocaleString('es-MX')}</td>
                <td>${vendedor.ventas2025Total.toLocaleString('es-MX')}</td>
                <td className={parseFloat(vendedor.porcentajeTotal) >= 0 ? 'positive' : 'negative'}>
                  {vendedor.porcentajeTotal}%
                </td>
                <td>${vendedor.meta2025.toLocaleString('es-MX')}</td>
                <td>{vendedor.porcentajeMeta2025.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Gráficos de comparativas mensuales */}
      <div className="comparativas-mensuales">
        <div className="chart-container">
          <h3>Ventas MXN por Mes ({data.añosComparados.año1} vs {data.añosComparados.año2})</h3>
          {/* Aquí puedes usar Chart.js, Recharts, etc. */}
          <table className="monthly-comparison">
            <thead>
              <tr>
                <th>Mes</th>
                <th>{data.añosComparados.año1}</th>
                <th>{data.añosComparados.año2}</th>
                <th>Variación</th>
              </tr>
            </thead>
            <tbody>
              {data.comparativas.mxn.map((mes, index) => (
                <tr key={index}>
                  <td>{mes.mes}</td>
                  <td>{mes.año2024}K</td>
                  <td>{mes.año2025}K</td>
                  <td className={parseFloat(mes.porcentaje) >= 0 ? 'positive' : 'negative'}>
                    {mes.porcentaje}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="chart-container">
          <h3>Ventas USD por Mes ({data.añosComparados.año1} vs {data.añosComparados.año2})</h3>
          <table className="monthly-comparison">
            <thead>
              <tr>
                <th>Mes</th>
                <th>{data.añosComparados.año1}</th>
                <th>{data.añosComparados.año2}</th>
                <th>Variación</th>
              </tr>
            </thead>
            <tbody>
              {data.comparativas.usd.map((mes, index) => (
                <tr key={index}>
                  <td>{mes.mes}</td>
                  <td>{mes.año2024}K</td>
                  <td>{mes.año2025}K</td>
                  <td className={parseFloat(mes.porcentaje) >= 0 ? 'positive' : 'negative'}>
                    {mes.porcentaje}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top clientes y productos */}
      <div className="top-section">
        <div className="top-clientes">
          <h3>Top 6 Clientes del Mes</h3>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Cliente</th>
                <th>Monto</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              {data.topClientes.map((cliente, index) => (
                <tr key={index}>
                  <td>{index + 1}</td>
                  <td>{cliente.nombre}</td>
                  <td>${cliente.monto.toLocaleString('es-MX')}</td>
                  <td>{cliente.porcentaje}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="top-productos">
          <h3>Top 5 Productos (USD)</h3>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Producto</th>
                <th>USD</th>
              </tr>
            </thead>
            <tbody>
              {data.topProductos.map((producto, index) => (
                <tr key={index}>
                  <td>{index + 1}</td>
                  <td>{producto.nombre}</td>
                  <td>${producto.usd.toLocaleString('en-US')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selector de mes */}
      <div className="month-selector">
        <label>
          Seleccionar mes:
          <input 
            type="month" 
            value={fechaInicio.substring(0, 7)}
            onChange={(e) => {
              // Para ver mayo, necesitamos poner junio
              const date = new Date(e.target.value + '-01');
              date.setMonth(date.getMonth() + 1);
              const nextMonth = date.toISOString().substring(0, 10);
              setFechaInicio(nextMonth);
              
              // Fecha fin al último día del mes siguiente
              const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0);
              setFechaFin(endDate.toISOString().substring(0, 10));
            }}
          />
        </label>
      </div>
    </div>
  );
};

export default SalesDashboard;
```

### **Estilos CSS:**
```css
.sales-dashboard {
  padding: 20px;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  max-width: 1400px;
  margin: 0 auto;
}

.dashboard-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 30px;
  border-radius: 15px;
  margin-bottom: 30px;
  text-align: center;
}

.dashboard-header h1 {
  margin: 0 0 10px 0;
  font-size: 2rem;
}

.period-info {
  display: flex;
  justify-content: center;
  gap: 30px;
  margin-top: 15px;
}

.period-info p {
  margin: 0;
  font-size: 1.1rem;
}

.vendedores-table,
.comparativa-anual {
  background: white;
  border-radius: 10px;
  padding: 20px;
  margin-bottom: 30px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  overflow-x: auto;
}

.vendedores-table h2,
.comparativa-anual h2 {
  margin: 0 0 20px 0;
  color: #333;
}

.vendedores-table table,
.comparativa-anual table {
  width: 100%;
  border-collapse: collapse;
  min-width: 1200px;
}

.vendedores-table th,
.comparativa-anual th {
  background: #f8f9fa;
  padding: 12px 10px;
  text-align: left;
  font-weight: 600;
  color: #495057;
  border-bottom: 2px solid #dee2e6;
  font-size: 0.9rem;
}

.vendedores-table td,
.comparativa-anual td {
  padding: 10px;
  border-bottom: 1px solid #dee2e6;
  font-size: 0.9rem;
}

.vendedor-nombre {
  font-weight: 600;
  color: #333;
}

.total-usd {
  color: #007bff;
  font-weight: bold;
}

.total-mxn {
  color: #28a745;
  font-weight: bold;
}

.total-convertido {
  background: #f8f9fa;
  font-weight: bold;
  color: #333;
}

.meta-alcanzada {
  color: #28a745;
  font-weight: bold;
}

.meta-pendiente {
  color: #ffc107;
  font-weight: bold;
}

.positive {
  color: #28a745;
  font-weight: bold;
}

.negative {
  color: #dc3545;
  font-weight: bold;
}

.comparativas-mensuales {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 30px;
}

.chart-container {
  background: white;
  border-radius: 10px;
  padding: 20px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.chart-container h3 {
  margin: 0 0 15px 0;
  color: #333;
  font-size: 1.2rem;
}

.monthly-comparison {
  width: 100%;
  border-collapse: collapse;
}

.monthly-comparison th,
.monthly-comparison td {
  padding: 8px;
  text-align: right;
  border-bottom: 1px solid #dee2e6;
}

.monthly-comparison th:first-child,
.monthly-comparison td:first-child {
  text-align: left;
  font-weight: 600;
}

.top-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 30px;
}

.top-clientes,
.top-productos {
  background: white;
  border-radius: 10px;
  padding: 20px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.top-clientes h3,
.top-productos h3 {
  margin: 0 0 15px 0;
  color: #333;
}

.top-clientes table,
.top-productos table {
  width: 100%;
  border-collapse: collapse;
}

.top-clientes th,
.top-productos th {
  background: #f8f9fa;
  padding: 10px;
  text-align: left;
  font-weight: 600;
  color: #495057;
  border-bottom: 2px solid #dee2e6;
}

.top-clientes td,
.top-productos td {
  padding: 10px;
  border-bottom: 1px solid #dee2e6;
}

.month-selector {
  background: white;
  border-radius: 10px;
  padding: 20px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.month-selector label {
  display: flex;
  align-items: center;
  gap: 15px;
  font-weight: 600;
}

.month-selector input[type="month"] {
  padding: 10px;
  border: 2px solid #dee2e6;
  border-radius: 5px;
  font-size: 1rem;
}

.loading,
.error {
  text-align: center;
  padding: 40px;
  font-size: 1.2rem;
}

.error {
  color: #dc3545;
}
```

---

## **📋 NOTAS IMPORTANTES PARA EL FRONTEND:**

### **🗓️ Lógica de fechas:**
```javascript
// Para ver datos de MAYO 2025:
fechaInicio = '2025-06-01'  // ← Junio

// Para ver datos de JUNIO 2025:
fechaInicio = '2025-07-01'  // ← Julio

// El endpoint automáticamente retrocede un mes
```

### **💰 Tipos de cambio:**
- **Tipo de cambio fijo:** 20 MXN/USD (hardcodeado actualmente)
- **Conversión:** `totalConvertido = (totalUsd * 20) + totalMxn`

### **🎯 Metas (HARDCODED - se cambiará mañana):**
- **Meta mensual:** $27,000
- **Meta anual:** $300,000

### **📊 Desglose semanal:**
- **Semana 1:** Días 1-7 del mes
- **Semana 2:** Días 8-14 del mes
- **Semana 3:** Días 15-21 del mes
- **Semana 4:** Días 22+ del mes

---

## 📞 **SOPORTE**

Para cualquier duda o problema con la API, contactar al equipo de desarrollo.

**Versión:** 7.0.0  
**Última actualización:** Octubre 2025  
**Estado:** ✅ Producción