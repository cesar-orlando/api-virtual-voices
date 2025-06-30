import { ProjectConfig } from '../../shared/types';

export const quickLearningConfig: ProjectConfig = {
  slug: "quicklearning",
  name: "Quick Learning",
  databaseUri: process.env.MONGO_URI_QUICKLEARNING || "mongodb+srv://quicklearning:VV235.@quicklearning.ikdoszo.mongodb.net/?retryWrites=true&w=majority&appName=quicklearning/prod",

  twilio: {
    testNumber: "+1234567890",
    productionNumber: "+1098765432"
  },

  roles: ["admin", "gerente", "supervisor", "asesor", "marketing"],

  features: {
    controlMinutos: true,
    elevenLabs: true,
    autoAssignment: true,
    customFlows: true
  },

  customConfig: {
    flujoProspectos: {
      reglas: [
        {
          tipo: "sinRespuesta",
          criterio: "más de 3 días sin respuesta",
          destino: "tablaSinRespuesta"
        },
        {
          tipo: "inscriptos",
          criterio: "cliente envía comprobante o indica deseo de pagar con tarjeta",
          destino: "tablaInscriptos"
        },
        {
          tipo: "noProspectos",
          criterio: "desinterés explícito o mensajes en broma",
          destino: "tablaNoProspectos"
        }
      ],
      asignacionAutomatica: true,
      criterioAsignacion: "mayor índice de ventas o menor tiempo de respuesta"
    },

    controlMinutos: {
      estados: {
        activo: true,
        ocupado: true,
        desactivado: false // no acumula minutos
      },
      jerarquiaVisibilidad: {
        admin: "todos",
        supervisor: "solo su equipo"
      }
    },

    integraciones: {
      elevenLabs: true // Mostrar y registrar llamadas
    }
  }
}; 