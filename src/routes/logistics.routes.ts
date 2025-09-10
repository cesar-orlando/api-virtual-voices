import { Router } from 'express';
import {
  setupLogisticsProvider,
  getLogisticsProviders,
  getShippingQuote,
  createShipment,
  trackShipment,
  getShipmentHistory,
  getSavedQuotes
} from '../controllers/logistics.controller';

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Address:
 *       type: object
 *       required:
 *         - streetLines
 *         - city
 *         - stateOrProvinceCode
 *         - postalCode
 *         - countryCode
 *       properties:
 *         streetLines:
 *           type: array
 *           items:
 *             type: string
 *           description: Array of street address lines
 *           example: ["123 Main St", "Suite 100"]
 *         city:
 *           type: string
 *           description: City name
 *           example: "New York"
 *         stateOrProvinceCode:
 *           type: string
 *           description: State or province code
 *           example: "NY"
 *         postalCode:
 *           type: string
 *           description: Postal or ZIP code
 *           example: "10001"
 *         countryCode:
 *           type: string
 *           description: Two-letter country code (ISO 3166-1 alpha-2)
 *           example: "US"
 *         residential:
 *           type: boolean
 *           description: Whether the address is residential
 *           example: false
 *         companyName:
 *           type: string
 *           description: Company name
 *           example: "Acme Corp"
 *         personName:
 *           type: string
 *           description: Contact person name
 *           example: "John Doe"
 *         phoneNumber:
 *           type: string
 *           description: Contact phone number
 *           example: "+1-555-123-4567"
 *         emailAddress:
 *           type: string
 *           description: Contact email address
 *           example: "john@example.com"
 *
 *     PackageWeight:
 *       type: object
 *       required:
 *         - value
 *         - units
 *       properties:
 *         value:
 *           type: number
 *           description: Weight value
 *           example: 5.5
 *         units:
 *           type: string
 *           enum: [LB, KG]
 *           description: Weight units
 *           example: "LB"
 *
 *     PackageDimensions:
 *       type: object
 *       required:
 *         - length
 *         - width
 *         - height
 *         - units
 *       properties:
 *         length:
 *           type: number
 *           description: Package length
 *           example: 12
 *         width:
 *           type: number
 *           description: Package width
 *           example: 8
 *         height:
 *           type: number
 *           description: Package height
 *           example: 6
 *         units:
 *           type: string
 *           enum: [IN, CM]
 *           description: Dimension units
 *           example: "IN"
 *
 *     Package:
 *       type: object
 *       required:
 *         - weight
 *         - dimensions
 *       properties:
 *         weight:
 *           $ref: '#/components/schemas/PackageWeight'
 *         dimensions:
 *           $ref: '#/components/schemas/PackageDimensions'
 *         packagingType:
 *           type: string
 *           description: Type of packaging
 *           example: "YOUR_PACKAGING"
 *         declaredValue:
 *           type: object
 *           properties:
 *             amount:
 *               type: number
 *               example: 100
 *             currency:
 *               type: string
 *               example: "USD"
 *
 *     FedExCredentials:
 *       type: object
 *       required:
 *         - clientId
 *         - clientSecret
 *         - accountNumber
 *         - environment
 *       properties:
 *         clientId:
 *           type: string
 *           description: FedEx API Client ID
 *           example: "l7c1234567890abcdef"
 *         clientSecret:
 *           type: string
 *           description: FedEx API Client Secret
 *           example: "1234567890abcdef1234567890abcdef"
 *         accountNumber:
 *           type: string
 *           description: FedEx Account Number
 *           example: "123456789"
 *         meterNumber:
 *           type: string
 *           description: FedEx Meter Number (optional)
 *           example: "987654321"
 *         environment:
 *           type: string
 *           enum: [sandbox, production]
 *           description: API environment
 *           example: "sandbox"
 *
 *     ShipmentRateRequest:
 *       type: object
 *       required:
 *         - shipper
 *         - recipient
 *         - packages
 *       properties:
 *         shipper:
 *           $ref: '#/components/schemas/Address'
 *         recipient:
 *           $ref: '#/components/schemas/Address'
 *         packages:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Package'
 *         serviceType:
 *           type: string
 *           description: Specific service type (optional)
 *           example: "FEDEX_GROUND"
 *         pickupType:
 *           type: string
 *           enum: [DROPOFF_AT_FEDEX_LOCATION, CONTACT_FEDEX_TO_SCHEDULE, USE_SCHEDULED_PICKUP]
 *           description: Pickup type
 *           example: "USE_SCHEDULED_PICKUP"
 *         requestedShipment:
 *           type: object
 *           properties:
 *             shipDatestamp:
 *               type: string
 *               format: date
 *               description: Shipping date (YYYY-MM-DD)
 *               example: "2024-01-15"
 *             preferredCurrency:
 *               type: string
 *               description: Preferred currency for rates
 *               example: "USD"
 *
 *     ShipmentRate:
 *       type: object
 *       properties:
 *         serviceType:
 *           type: string
 *           example: "FEDEX_GROUND"
 *         serviceName:
 *           type: string
 *           example: "FedEx Ground"
 *         totalNetCharge:
 *           type: number
 *           example: 15.75
 *         totalBaseCharge:
 *           type: number
 *           example: 12.50
 *         currency:
 *           type: string
 *           example: "USD"
 *         transitTime:
 *           type: string
 *           example: "2024-01-17"
 *         deliveryTimestamp:
 *           type: string
 *           example: "2024-01-17T17:00:00Z"
 *         deliveryDayOfWeek:
 *           type: string
 *           example: "WED"
 */

/**
 * @swagger
 * /api/logistics/providers:
 *   post:
 *     summary: Configure logistics provider credentials
 *     tags: [Logistics]
 *     parameters:
 *       - in: query
 *         name: companySlug
 *         required: true
 *         schema:
 *           type: string
 *         description: Company identifier
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - provider
 *               - credentials
 *             properties:
 *               provider:
 *                 type: string
 *                 enum: [fedex, ups, dhl, usps]
 *                 description: Logistics provider name
 *                 example: "fedex"
 *               credentials:
 *                 oneOf:
 *                   - $ref: '#/components/schemas/FedExCredentials'
 *                 description: Provider-specific credentials
 *           examples:
 *             fedex:
 *               summary: FedEx credentials example
 *               value:
 *                 provider: "fedex"
 *                 credentials:
 *                   clientId: "l7c1234567890abcdef"
 *                   clientSecret: "1234567890abcdef1234567890abcdef"
 *                   accountNumber: "123456789"
 *                   environment: "sandbox"
 *     responses:
 *       200:
 *         description: Provider configured successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "FEDEX credentials configured successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     provider:
 *                       type: string
 *                     isActive:
 *                       type: boolean
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid request or credentials
 *       500:
 *         description: Internal server error
 */
router.post('/providers', setupLogisticsProvider);

/**
 * @swagger
 * /api/logistics/providers:
 *   get:
 *     summary: Get configured logistics providers
 *     tags: [Logistics]
 *     parameters:
 *       - in: query
 *         name: companySlug
 *         required: true
 *         schema:
 *           type: string
 *         description: Company identifier
 *     responses:
 *       200:
 *         description: List of configured providers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       provider:
 *                         type: string
 *                         example: "fedex"
 *                       isActive:
 *                         type: boolean
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 */
router.get('/providers', getLogisticsProviders);

/**
 * @swagger
 * /api/logistics/{provider}/quote:
 *   post:
 *     summary: Get shipping rate quote
 *     tags: [Logistics]
 *     parameters:
 *       - in: path
 *         name: provider
 *         required: true
 *         schema:
 *           type: string
 *           enum: [fedex, ups, dhl, usps]
 *         description: Logistics provider
 *       - in: query
 *         name: companySlug
 *         required: true
 *         schema:
 *           type: string
 *         description: Company identifier
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ShipmentRateRequest'
 *           example:
 *             shipper:
 *               streetLines: ["123 Shipper St"]
 *               city: "Los Angeles"
 *               stateOrProvinceCode: "CA"
 *               postalCode: "90210"
 *               countryCode: "US"
 *               residential: false
 *               companyName: "Shipper Corp"
 *               personName: "Jane Shipper"
 *               phoneNumber: "+1-555-123-4567"
 *             recipient:
 *               streetLines: ["456 Recipient Ave"]
 *               city: "New York"
 *               stateOrProvinceCode: "NY"
 *               postalCode: "10001"
 *               countryCode: "US"
 *               residential: true
 *               personName: "John Recipient"
 *               phoneNumber: "+1-555-987-6543"
 *             packages:
 *               - weight:
 *                   value: 5
 *                   units: "LB"
 *                 dimensions:
 *                   length: 12
 *                   width: 8
 *                   height: 6
 *                   units: "IN"
 *             pickupType: "USE_SCHEDULED_PICKUP"
 *             requestedShipment:
 *               preferredCurrency: "USD"
 *     responses:
 *       200:
 *         description: Rate quote retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 quoteId:
 *                   type: string
 *                   example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                 provider:
 *                   type: string
 *                   example: "fedex"
 *                 rates:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ShipmentRate'
 *                 transactionId:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 expiresAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid request data
 *       404:
 *         description: Provider not configured
 *       500:
 *         description: Internal server error
 */
router.post('/:provider/quote', getShippingQuote);

/**
 * @swagger
 * /api/logistics/{provider}/shipment:
 *   post:
 *     summary: Create a shipment
 *     tags: [Logistics]
 *     parameters:
 *       - in: path
 *         name: provider
 *         required: true
 *         schema:
 *           type: string
 *           enum: [fedex, ups, dhl, usps]
 *         description: Logistics provider
 *       - in: query
 *         name: companySlug
 *         required: true
 *         schema:
 *           type: string
 *         description: Company identifier
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/ShipmentRateRequest'
 *               - type: object
 *                 properties:
 *                   labelFormat:
 *                     type: string
 *                     enum: [PDF, PNG, ZPL]
 *                     description: Shipping label format
 *                     example: "PDF"
 *                   labelSize:
 *                     type: string
 *                     enum: [4X6, 4X8, 8.5X11]
 *                     description: Label size
 *                     example: "4X6"
 *                   customerReference:
 *                     type: string
 *                     description: Customer reference number
 *                     example: "REF-12345"
 *                   invoiceNumber:
 *                     type: string
 *                     description: Invoice number
 *                     example: "INV-67890"
 *                   specialInstructions:
 *                     type: string
 *                     description: Special delivery instructions
 *                     example: "Leave at front door"
 *     responses:
 *       200:
 *         description: Shipment created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 shipmentId:
 *                   type: string
 *                   example: "1234567890"
 *                 trackingNumber:
 *                   type: string
 *                   example: "1Z999AA1234567890"
 *                 labelBase64:
 *                   type: string
 *                   description: Base64 encoded shipping label
 *                 totalCost:
 *                   type: number
 *                   example: 15.75
 *                 currency:
 *                   type: string
 *                   example: "USD"
 *                 serviceType:
 *                   type: string
 *                   example: "FEDEX_GROUND"
 *                 transactionId:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid request data
 *       404:
 *         description: Provider not configured
 *       500:
 *         description: Internal server error
 */
router.post('/:provider/shipment', createShipment);

/**
 * @swagger
 * /api/logistics/{provider}/track/{trackingNumber}:
 *   get:
 *     summary: Track a shipment
 *     tags: [Logistics]
 *     parameters:
 *       - in: path
 *         name: provider
 *         required: true
 *         schema:
 *           type: string
 *           enum: [fedex, ups, dhl, usps]
 *         description: Logistics provider
 *       - in: path
 *         name: trackingNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Tracking number
 *       - in: query
 *         name: companySlug
 *         required: true
 *         schema:
 *           type: string
 *         description: Company identifier
 *     responses:
 *       200:
 *         description: Tracking information retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 trackingInfo:
 *                   type: object
 *                   properties:
 *                     trackingNumber:
 *                       type: string
 *                       example: "1Z999AA1234567890"
 *                     status:
 *                       type: string
 *                       example: "IN_TRANSIT"
 *                     statusDescription:
 *                       type: string
 *                       example: "Package is in transit"
 *                     estimatedDelivery:
 *                       type: string
 *                       format: date-time
 *                     actualDelivery:
 *                       type: string
 *                       format: date-time
 *                     events:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           timestamp:
 *                             type: string
 *                             format: date-time
 *                           status:
 *                             type: string
 *                           description:
 *                             type: string
 *                           location:
 *                             type: object
 *                             properties:
 *                               city:
 *                                 type: string
 *                               stateOrProvinceCode:
 *                                 type: string
 *                               countryCode:
 *                                 type: string
 *                     lastUpdated:
 *                       type: string
 *                       format: date-time
 *       404:
 *         description: Tracking information not found
 *       500:
 *         description: Internal server error
 */
router.get('/:provider/track/:trackingNumber', trackShipment);

/**
 * @swagger
 * /api/logistics/shipments:
 *   get:
 *     summary: Get shipment history
 *     tags: [Logistics]
 *     parameters:
 *       - in: query
 *         name: companySlug
 *         required: true
 *         schema:
 *           type: string
 *         description: Company identifier
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Items per page
 *       - in: query
 *         name: provider
 *         schema:
 *           type: string
 *         description: Filter by provider
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: Shipment history retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     pages:
 *                       type: integer
 */
router.get('/shipments', getShipmentHistory);

/**
 * @swagger
 * /api/logistics/quotes:
 *   get:
 *     summary: Get saved shipping quotes
 *     tags: [Logistics]
 *     parameters:
 *       - in: query
 *         name: companySlug
 *         required: true
 *         schema:
 *           type: string
 *         description: Company identifier
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Items per page
 *       - in: query
 *         name: provider
 *         schema:
 *           type: string
 *         description: Filter by provider
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: Saved quotes retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     pages:
 *                       type: integer
 */
router.get('/quotes', getSavedQuotes);

export default router;

