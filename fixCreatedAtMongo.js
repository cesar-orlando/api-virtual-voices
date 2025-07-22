const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

const quicklearningUri = process.env.MONGO_URI_QUICKLEARNING;
if (!quicklearningUri) {
  console.error('❌ MONGO_URI_QUICKLEARNING no configurado');
  process.exit(1);
}

const recordSchema = new mongoose.Schema({}, { strict: false });

function normalizePhone(phone) {
  return phone ? phone.replace(/\D/g, '') : '';
}

async function processTable(tableSlug, Record) {
  // Traer todos los registros locales de la tabla
  const localRecords = await Record.find({ tableSlug, c_name: 'quicklearning' }).lean();
  console.log(`Registros locales obtenidos para ${tableSlug}: ${localRecords.length}`);

  // Indexar locales por teléfono normalizado (data.telefono)
  const localByPhone = {};
  for (const rec of localRecords) {
    const tel = normalizePhone(rec.data?.telefono);
    if (tel) localByPhone[tel] = rec;
  }
  const allLocalPhones = Object.keys(localByPhone);
  console.log('Ejemplo de teléfonos locales:', allLocalPhones.slice(0, 10));

  // Mapear nombre local a nombre externo si es necesario
  let externalTableSlug = tableSlug;
  if (tableSlug === 'sin_contestar') externalTableSlug = 'sin-contestar';

  // Descargar registros externos
  console.log(`🌐 Descargando ${externalTableSlug} externos...`);
  const externalResp = await axios.get(`https://api.quick-learning.virtualvoices.com.mx/api/records/${externalTableSlug}`);
  const externalRecords = externalResp.data.records;
  console.log(`${externalTableSlug} externos obtenidos: ${externalRecords.length}`);

  let updated = 0;
  let skipped = 0;
  let notFound = 0;
  const notFoundPhones = [];

  for (const ext of externalRecords) {
    const phoneField = ext.customFields.find(f => f.key === 'phone');
    const extPhone = normalizePhone(phoneField?.value);
    if (!extPhone) continue;
    const extCreatedAt = ext.createdAt || ext.customFields[0]?.createdAt;
    if (!extCreatedAt) continue;
    const local = localByPhone[extPhone];
    if (!local) {
      notFound++;
      notFoundPhones.push(extPhone);
      console.log(`❌ No encontrado: ${extPhone} | Ejemplo local:`, allLocalPhones.slice(0, 5));
      continue;
    }
    const localCreatedAt = local.createdAt instanceof Date ? local.createdAt.toISOString() : local.createdAt;
    if (localCreatedAt !== extCreatedAt) {
      await Record.updateOne({ _id: local._id }, { $set: { createdAt: new Date(extCreatedAt) } });
      console.log(`✅ Actualizado: ${local.data?.telefono || ''} (${extPhone}) | ${localCreatedAt} → ${extCreatedAt}`);
      updated++;
    } else {
      skipped++;
    }
  }
  console.log(`\n🎉 Corrección completada para ${tableSlug}!`);
  console.log(`✅ Registros actualizados: ${updated}`);
  console.log(`⏩ Ya estaban correctos: ${skipped}`);
  console.log(`❌ No encontrados localmente: ${notFound}`);
  if (notFoundPhones.length > 0) {
    console.log('Ejemplos de teléfonos externos no encontrados:', notFoundPhones.slice(0, 10));
  }
  return { updated, skipped, notFound };
}

async function main() {
  try {
    console.log('🔗 Conectando a MongoDB...');
    const conn = await mongoose.createConnection(quicklearningUri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      bufferCommands: false,
      ssl: true,
      tls: true,
      retryWrites: true,
      w: 'majority'
    });
    await conn.asPromise();
    const Record = conn.model('DynamicRecord', recordSchema, 'dynamicrecords');

    // Procesar las tres tablas
    const tableSlugs = ['prospectos', 'alumnos', 'sin_contestar'];
    let totalUpdated = 0, totalSkipped = 0, totalNotFound = 0;
    for (const tableSlug of tableSlugs) {
      console.log(`\n==============================\nProcesando tabla: ${tableSlug}\n==============================`);
      const result = await processTable(tableSlug, Record);
      totalUpdated += result.updated;
      totalSkipped += result.skipped;
      totalNotFound += result.notFound;
    }
    console.log(`\n==============================\nResumen global\n==============================`);
    console.log(`✅ Total registros actualizados: ${totalUpdated}`);
    console.log(`⏩ Total ya estaban correctos: ${totalSkipped}`);
    console.log(`❌ Total no encontrados localmente: ${totalNotFound}`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error general:', error.message);
    process.exit(1);
  }
}

main(); 