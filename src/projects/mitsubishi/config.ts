import { ProjectConfig } from '../../shared/types';


export const mitsubishiConfig: ProjectConfig = {
  slug: "mitsubishi",
  name: "Mitsubishi Motors",
  databaseUri: process.env.MONGO_URI_MITSUBISHI || "mongodb://localhost:27017/mitsubishi",
  twilio: {
    testNumber: "+521234567890",
    productionNumber: "+529876543210"
  },
  roles: ["Administrador", "Gerente", "Asesor"],
  features: {
    controlMinutos: true,
    elevenLabs: false,
    autoAssignment: true,
    customFlows: false
  },
  customConfig: {
    // Puedes agregar configuraciones personalizadas aquí
  }
};
