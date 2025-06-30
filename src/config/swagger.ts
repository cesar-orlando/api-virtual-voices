import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Virtual Voices API',
      version: '2.4.0',
      description: 'API para el sistema de Virtual Voices con soporte multi-empresa incluyendo Quick Learning Enterprise',
      contact: {
        name: 'Virtual Voices Team',
        email: 'dev@virtualvoices.com'
      }
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: 'Servidor de Desarrollo'
      },
      {
        url: 'https://api.virtualvoices.com',
        description: 'Servidor de Producción'
      }
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'ID único del usuario'
            },
            name: {
              type: 'string',
              description: 'Nombre completo del usuario'
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'Email del usuario'
            },
            role: {
              type: 'string',
              enum: ['Admin', 'Usuario'],
              description: 'Rol del usuario'
            },
            companySlug: {
              type: 'string',
              description: 'Identificador de la empresa (quicklearning, test, etc.)'
            },
            status: {
              type: 'number',
              description: 'Estado del usuario (1=activo, 0=inactivo)'
            }
          }
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              description: 'Email del usuario',
              example: 'admin@quicklearning.com'
            },
            password: {
              type: 'string',
              description: 'Contraseña del usuario',
              example: 'QuickLearning2024!'
            },
            companySlug: {
              type: 'string',
              description: 'Slug de la empresa (quicklearning, test)',
              example: 'quicklearning'
            }
          }
        },
        RegisterRequest: {
          type: 'object',
          required: ['name', 'email', 'password', 'role'],
          properties: {
            name: {
              type: 'string',
              description: 'Nombre completo del usuario',
              example: 'Quick Learning Admin'
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'Email del usuario',
              example: 'admin@quicklearning.com'
            },
            password: {
              type: 'string',
              description: 'Contraseña del usuario',
              example: 'QuickLearning2024!'
            },
            role: {
              type: 'string',
              enum: ['Admin', 'Usuario'],
              description: 'Rol del usuario',
              example: 'Admin'
            },
            companySlug: {
              type: 'string',
              description: 'Slug de la empresa',
              example: 'quicklearning'
            }
          }
        },
        LoginResponse: {
          type: 'object',
          properties: {
            token: {
              type: 'string',
              description: 'JWT token para autenticación'
            },
            user: {
              $ref: '#/components/schemas/User'
            }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Mensaje de error'
            },
            error: {
              type: 'string',
              description: 'Detalles del error (opcional)'
            }
          }
        }
      }
    }
  },
  apis: ['./src/core/users/*.ts', './src/routes/*.ts', './src/controllers/*.ts']
};

const specs = swaggerJSDoc(options);

export { swaggerUi, specs };