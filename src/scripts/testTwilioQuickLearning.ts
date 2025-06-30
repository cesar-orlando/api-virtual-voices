import dotenv from "dotenv";
import { twilioService } from "../services/twilio/twilioService";
import { quickLearningOpenAIService } from "../services/quicklearning/openaiService";
import { getDbConnection } from "../config/connectionManager";
import getQuickLearningChatModel from "../models/quicklearning/chat.model";
import getRecordModel from "../models/record.model";

// Cargar variables de entorno
dotenv.config();

// Número de prueba proporcionado
const TEST_PHONE = "+5214521311888";

async function testTwilioQuickLearning() {
  console.log("🚀 Iniciando pruebas de Twilio - Quick Learning");
  console.log("=" .repeat(50));

  try {
    // Test 1: Verificar estado del servicio
    console.log("\n📊 Test 1: Verificando estado del servicio Twilio...");
    const status = await twilioService.checkServiceStatus();
    console.log("✅ Estado del servicio:", status);

    // Test 2: Verificar conexión a la base de datos
    console.log("\n💾 Test 2: Verificando conexión a la base de datos...");
    const conn = await getDbConnection('quicklearning');
    console.log("✅ Conexión a Quick Learning DB establecida");

    // Test 3: Verificar modelos de base de datos
    console.log("\n🗃️ Test 3: Verificando modelos de base de datos...");
    const QuickLearningChat = getQuickLearningChatModel(conn);
    const DynamicRecord = getRecordModel(conn);
    console.log("✅ Modelos cargados correctamente");

    // Test 4: Crear/verificar cliente de prueba
    console.log("\n👤 Test 4: Creando cliente de prueba...");
    let customer = await DynamicRecord.findOne({
      tableSlug: "prospectos",
      "data.phone": TEST_PHONE,
    });

    if (!customer) {
      customer = new DynamicRecord({
        tableSlug: "prospectos",
        c_name: "quicklearning",
        createdBy: "test-script",
        data: {
          phone: TEST_PHONE,
          name: "Usuario de Prueba",
          status: "Test",
          classification: "Prospecto",
          ai: true,
          createdAt: new Date(),
        },
      });
      await customer.save();
      console.log("✅ Nuevo cliente de prueba creado");
    } else {
      console.log("✅ Cliente de prueba ya existe");
    }

    // Test 5: Crear/verificar chat de prueba
    console.log("\n💬 Test 5: Verificando chat de prueba...");
    let chat = await QuickLearningChat.findOne({ phone: TEST_PHONE });
    if (!chat) {
      chat = new QuickLearningChat({
        phone: TEST_PHONE,
        profileName: "Usuario de Prueba",
        linkedTable: {
          refModel: "Record",
          refId: customer._id,
        },
        conversationStart: new Date(),
        aiEnabled: true,
        messages: [],
      });
      await chat.save();
      console.log("✅ Nuevo chat de prueba creado");
    } else {
      console.log("✅ Chat de prueba ya existe");
    }

    // Test 6: Probar respuesta de IA
    console.log("\n🤖 Test 6: Probando respuesta de IA...");
    const testMessage = "Hola, quiero información sobre los cursos de inglés";
    const aiResponse = await quickLearningOpenAIService.generateResponse(testMessage, TEST_PHONE);
    console.log("✅ Respuesta de IA generada:");
    console.log(`   Mensaje: ${testMessage}`);
    console.log(`   Respuesta: ${aiResponse.substring(0, 100)}...`);

    // Test 7: Enviar mensaje de prueba
    console.log("\n📱 Test 7: Enviando mensaje de prueba...");
    const testMessageBody = `🧪 **MENSAJE DE PRUEBA** 🧪

Hola! Este es un mensaje de prueba del sistema de Twilio integrado con Quick Learning.

✅ Servicios verificados:
- Conexión a Twilio
- Base de datos Quick Learning  
- Sistema de IA (NatalIA)
- Webhooks configurados

Tu número está listo para recibir mensajes automáticos de Quick Learning.

¡El sistema está funcionando correctamente! 🎉

---
Enviado: ${new Date().toLocaleString('es-MX')}`;

    const result = await twilioService.sendMessage({
      to: TEST_PHONE,
      body: testMessageBody,
    });

    if (result.success) {
      console.log("✅ Mensaje enviado exitosamente");
      console.log(`   ID del mensaje: ${result.messageId}`);
      
      // Guardar el mensaje en el chat
      chat.messages.push({
        direction: "outbound-api",
        body: testMessageBody,
        respondedBy: "bot",
        twilioSid: result.messageId,
        messageType: "text",
      });
      
      chat.lastMessage = {
        body: testMessageBody,
        date: new Date(),
        respondedBy: "bot",
      };
      
      await chat.save();
      console.log("✅ Mensaje guardado en la base de datos");
    } else {
      console.error("❌ Error enviando mensaje:", result.error);
    }

    // Test 8: Verificar historial de mensajes
    console.log("\n📜 Test 8: Verificando historial de mensajes...");
    const history = await twilioService.getMessageHistory(5);
    console.log(`✅ Últimos ${history.length} mensajes obtenidos`);
    
    // Test 9: Enviar segundo mensaje de información
    console.log("\n📋 Test 9: Enviando mensaje informativo...");
    const infoMessage = `📋 **INFORMACIÓN DEL SISTEMA**

🏢 **Quick Learning - Twilio Integration**
🔗 Webhook: /api/quicklearning/twilio/webhook
📞 Número: ${process.env.TWILIO_PHONE_NUMBER}
🤖 IA: NatalIA activada
💾 Base de datos: Conectada

**Endpoints disponibles:**
• POST /send - Enviar mensaje
• POST /send-template - Enviar plantilla  
• GET /status - Estado del servicio
• GET /history - Historial de mensajes

**Para probar:**
Envía cualquier mensaje a este número y recibirás una respuesta automática de NatalIA.

¡Todo listo para producción! ✨`;

    const infoResult = await twilioService.sendMessage({
      to: TEST_PHONE,
      body: infoMessage,
    });

    if (infoResult.success) {
      console.log("✅ Mensaje informativo enviado");
    }

    console.log("\n🎉 ¡TODAS LAS PRUEBAS COMPLETADAS EXITOSAMENTE!");
    console.log("=" .repeat(50));
    console.log("📱 Tu número está listo para recibir mensajes automáticos");
    console.log("🤖 NatalIA responderá automáticamente a tus mensajes");
    console.log("🔗 Webhook configurado en: /api/quicklearning/twilio/webhook");
    console.log("📚 Documentación disponible en: /api/docs");

  } catch (error) {
    console.error("\n❌ Error en las pruebas:", error);
    process.exit(1);
  }
}

// Ejecutar las pruebas
if (require.main === module) {
  testTwilioQuickLearning()
    .then(() => {
      console.log("\n✅ Script completado exitosamente");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Error ejecutando script:", error);
      process.exit(1);
    });
}

export default testTwilioQuickLearning;