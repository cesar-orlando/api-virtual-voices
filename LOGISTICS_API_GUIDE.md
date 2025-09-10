# 📦 Guía de API de Logística

Esta guía te ayudará a integrar y usar la nueva funcionalidad de logística que permite a los clientes proporcionar sus propias credenciales de proveedores de envío como FedEx.

## 🚀 Características Principales

- ✅ **Credenciales por Cliente**: Los clientes proporcionan sus propias credenciales de API
- ✅ **Múltiples Proveedores**: Soporte para FedEx (UPS, DHL, USPS próximamente)
- ✅ **Cotizaciones de Envío**: Obtén cotizaciones en tiempo real
- ✅ **Creación de Envíos**: Genera etiquetas de envío automáticamente
- ✅ **Seguimiento**: Rastrea paquetes en tiempo real
- ✅ **Historial**: Almacena cotizaciones y envíos
- ✅ **Documentación Swagger**: Documentación completa en `/api/docs`

## 📋 Endpoints Disponibles

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST   | `/api/logistics/providers` | Configurar credenciales del proveedor |
| GET    | `/api/logistics/providers` | Obtener proveedores configurados |
| POST   | `/api/logistics/{provider}/quote` | Obtener cotización de envío |
| POST   | `/api/logistics/{provider}/shipment` | Crear envío |
| GET    | `/api/logistics/{provider}/track/{tracking}` | Rastrear envío |
| GET    | `/api/logistics/shipments` | Historial de envíos |
| GET    | `/api/logistics/quotes` | Cotizaciones guardadas |

## 🔧 Configuración de FedEx

### 1. Configurar Credenciales

```bash
POST /api/logistics/providers?companySlug=tu-empresa
```

```json
{
  "provider": "fedex",
  "credentials": {
    "clientId": "tu_client_id_de_fedex",
    "clientSecret": "tu_client_secret_de_fedex",
    "accountNumber": "123456789",
    "environment": "sandbox"
  }
}
```

**Respuesta:**
```json
{
  "success": true,
  "message": "FEDEX credentials configured successfully",
  "data": {
    "id": "64f1234567890abcdef123456",
    "provider": "fedex",
    "isActive": true,
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

## 📊 Obtener Cotización

### 2. Solicitar Cotización de Envío

```bash
POST /api/logistics/fedex/quote?companySlug=tu-empresa
```

```json
{
  "shipper": {
    "streetLines": ["123 Calle Remitente"],
    "city": "Los Angeles",
    "stateOrProvinceCode": "CA",
    "postalCode": "90210",
    "countryCode": "US",
    "residential": false,
    "companyName": "Mi Empresa",
    "personName": "Juan Remitente",
    "phoneNumber": "+1-555-123-4567"
  },
  "recipient": {
    "streetLines": ["456 Avenida Destinatario"],
    "city": "Nueva York",
    "stateOrProvinceCode": "NY",
    "postalCode": "10001",
    "countryCode": "US",
    "residential": true,
    "personName": "María Destinataria",
    "phoneNumber": "+1-555-987-6543"
  },
  "packages": [
    {
      "weight": {
        "value": 5,
        "units": "LB"
      },
      "dimensions": {
        "length": 12,
        "width": 8,
        "height": 6,
        "units": "IN"
      }
    }
  ],
  "pickupType": "USE_SCHEDULED_PICKUP",
  "requestedShipment": {
    "preferredCurrency": "USD"
  }
}
```

**Respuesta:**
```json
{
  "success": true,
  "quoteId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "provider": "fedex",
  "rates": [
    {
      "serviceType": "FEDEX_GROUND",
      "serviceName": "FedEx Ground",
      "totalNetCharge": 15.75,
      "totalBaseCharge": 12.50,
      "currency": "USD",
      "transitTime": "2024-01-17",
      "deliveryDayOfWeek": "WED"
    },
    {
      "serviceType": "FEDEX_EXPRESS_SAVER",
      "serviceName": "FedEx Express Saver",
      "totalNetCharge": 25.99,
      "totalBaseCharge": 22.50,
      "currency": "USD",
      "transitTime": "2024-01-16",
      "deliveryDayOfWeek": "TUE"
    }
  ],
  "timestamp": "2024-01-15T10:30:00Z",
  "expiresAt": "2024-01-16T10:30:00Z"
}
```

## 📦 Crear Envío

### 3. Crear Envío con Etiqueta

```bash
POST /api/logistics/fedex/shipment?companySlug=tu-empresa
```

```json
{
  // Mismo payload que la cotización, más:
  "serviceType": "FEDEX_GROUND",
  "labelFormat": "PDF",
  "labelSize": "4X6",
  "customerReference": "REF-12345",
  "specialInstructions": "Dejar en la puerta principal"
}
```

**Respuesta:**
```json
{
  "success": true,
  "shipmentId": "1234567890",
  "trackingNumber": "1Z999AA1234567890",
  "labelBase64": "JVBERi0xLjQKMSAwIG9iago8PC9UeXBlL...",
  "totalCost": 15.75,
  "currency": "USD",
  "serviceType": "FEDEX_GROUND",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## 🔍 Rastrear Envío

### 4. Obtener Estado del Envío

```bash
GET /api/logistics/fedex/track/1Z999AA1234567890?companySlug=tu-empresa
```

**Respuesta:**
```json
{
  "success": true,
  "trackingInfo": {
    "trackingNumber": "1Z999AA1234567890",
    "status": "IN_TRANSIT",
    "statusDescription": "Paquete en tránsito",
    "estimatedDelivery": "2024-01-17T17:00:00Z",
    "events": [
      {
        "timestamp": "2024-01-15T14:30:00Z",
        "status": "PICKED_UP",
        "description": "Paquete recolectado",
        "location": {
          "city": "Los Angeles",
          "stateOrProvinceCode": "CA",
          "countryCode": "US"
        }
      }
    ],
    "lastUpdated": "2024-01-15T16:00:00Z"
  }
}
```

## 📈 Obtener Historial

### 5. Ver Envíos Anteriores

```bash
GET /api/logistics/shipments?companySlug=tu-empresa&page=1&limit=10
```

### 6. Ver Cotizaciones Guardadas

```bash
GET /api/logistics/quotes?companySlug=tu-empresa&page=1&limit=10
```

## 🎯 Calculadora de Peso Dimensional

El sistema automáticamente calcula el peso dimensional usando:

```
Peso Dimensional (kg) = (largo × ancho × alto en cm) ÷ 5000
```

FedEx usa el mayor valor entre el peso real y el peso dimensional para determinar el costo.

## ⚙️ Configuración de Credenciales FedEx

Para obtener las credenciales de FedEx:

1. **Regístrate** en [FedEx Developer Portal](https://developer.fedex.com/)
2. **Crea una aplicación** y obtén:
   - `clientId`: ID de tu aplicación
   - `clientSecret`: Secreto de tu aplicación  
   - `accountNumber`: Tu número de cuenta FedEx
3. **Usa sandbox** para pruebas: `environment: "sandbox"`
4. **Cambia a producción** cuando estés listo: `environment: "production"`

## 🔐 Seguridad

- ✅ Las credenciales se almacenan encriptadas
- ✅ Validación automática de credenciales
- ✅ Aislamiento por empresa (companySlug)
- ✅ No se almacenan credenciales en variables de entorno

## 🚨 Códigos de Error Comunes

| Código | Descripción | Solución |
|--------|-------------|----------|
| 400 | Datos de solicitud inválidos | Verificar formato de dirección/paquete |
| 404 | Proveedor no configurado | Configurar credenciales primero |
| 401 | Credenciales inválidas | Verificar clientId/clientSecret |
| 500 | Error del proveedor | Verificar estado del servicio FedEx |

## 📚 Documentación Swagger

Visita `/api/docs` para ver la documentación interactiva completa con ejemplos y pruebas en vivo.

## 🎉 ¡Listo para usar!

Tu API de logística está configurada y lista. Los clientes ahora pueden:

1. ✅ Proporcionar sus propias credenciales FedEx
2. ✅ Obtener cotizaciones en tiempo real
3. ✅ Crear envíos automáticamente
4. ✅ Rastrear paquetes
5. ✅ Ver historial completo

¡Próximamente agregaremos soporte para UPS, DHL y USPS! 🚀

