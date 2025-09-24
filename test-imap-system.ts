import { EmailReaderManager } from './src/services/emailReader.service';
import { getConnectionByCompanySlug } from './src/config/connectionManager';
import getEmailModel from './src/models/email.model';

/**
 * 🧪 SCRIPT DE PRUEBA DEL SISTEMA IMAP
 * 
 * Este script demuestra cómo usar el nuevo sistema de lectura de emails
 */

async function testEmailSystem() {
  console.log('🧪 Iniciando pruebas del sistema IMAP...\n');

  // Configuración de prueba - CAMBIAR ESTOS VALORES
  const companySlug = 'tu-empresa'; // Reemplazar con slug real
  const userId = '64f7b8a9e12345678901234a'; // Reemplazar con ID de usuario real que tenga email configurado

  try {
    console.log('📧 1. Obteniendo manager de email...');
    const manager = EmailReaderManager.getInstance();

    console.log('🔌 2. Intentando conectar IMAP...');
    const reader = await manager.getReader(companySlug, userId);
    console.log('✅ Conexión IMAP exitosa');

    console.log('📥 3. Iniciando monitoreo...');
    await reader.startMonitoring();
    console.log('✅ Monitoreo iniciado');

    // Configurar listeners
    reader.on('newEmail', (email) => {
      console.log(`📬 Nuevo email recibido: "${email.subject}" de ${email.from}`);
    });

    reader.on('monitoringStarted', () => {
      console.log('🎯 Monitoreo activo - esperando emails...');
    });

    console.log('📚 4. Sincronizando emails históricos (últimos 2 días)...');
    const historicalEmails = await reader.getHistoricalEmails(2);
    console.log(`📊 Encontrados ${historicalEmails.length} emails históricos`);

    // Guardar emails históricos en la base de datos
    if (historicalEmails.length > 0) {
      console.log('💾 5. Guardando emails históricos en BD...');
      const connection = await getConnectionByCompanySlug(companySlug);
      const EmailModel = getEmailModel(connection);

      let saved = 0;
      for (const email of historicalEmails) {
        try {
          const existing = await EmailModel.findOne({ messageId: email.messageId });
          if (!existing) {
            const newEmail = new EmailModel({
              messageId: email.messageId,
              direction: 'incoming',
              from: email.from,
              to: email.to,
              subject: email.subject,
              textContent: email.text,
              htmlContent: email.html,
              receivedDate: email.date,
              status: 'recibido',
              companySlug,
              attachments: email.attachments
            });
            await newEmail.save();
            saved++;
          }
        } catch (error) {
          console.error(`❌ Error guardando email: ${error.message}`);
        }
      }
      console.log(`✅ Guardados ${saved} emails nuevos`);
    }

    console.log('📊 6. Obteniendo estadísticas...');
    const status = reader.getStatus();
    console.log('Estado del reader:', status);

    console.log('\n🎉 Pruebas completadas exitosamente!');
    console.log('⏰ El monitoreo seguirá activo por 30 segundos para pruebas...');

    // Mantener activo por 30 segundos para probar recepción en tiempo real
    setTimeout(async () => {
      console.log('\n🛑 Deteniendo monitoreo...');
      await reader.stopMonitoring();
      console.log('✅ Monitoreo detenido');
      process.exit(0);
    }, 30000);

  } catch (error) {
    console.error('❌ Error en las pruebas:', error);
    console.error('\n🔧 Posibles soluciones:');
    console.error('- Verificar que el userId tenga configuración de email activa');
    console.error('- Revisar credenciales de email (especialmente Gmail app passwords)');
    console.error('- Verificar conectividad de red');
    console.error('- Comprobar que el company slug existe');
    process.exit(1);
  }
}

// Función auxiliar para mostrar emails de ejemplo
async function showRecentEmails(companySlug: string) {
  try {
    const connection = await getConnectionByCompanySlug(companySlug);
    const EmailModel = getEmailModel(connection);

    const recentEmails = await EmailModel.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('direction from to subject createdAt status');

    console.log('\n📧 Últimos 5 emails en la BD:');
    recentEmails.forEach((email, index) => {
      const arrow = email.direction === 'incoming' ? '📩' : '📤';
      console.log(`${index + 1}. ${arrow} ${email.direction}: "${email.subject}" (${email.status})`);
      console.log(`   De: ${email.from} → Para: ${email.to}`);
      console.log(`   Fecha: ${email.createdAt}\n`);
    });
  } catch (error) {
    console.error('❌ Error obteniendo emails recientes:', error);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  testEmailSystem().catch(console.error);
}

export { testEmailSystem, showRecentEmails };