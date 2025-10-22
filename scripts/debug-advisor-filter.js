#!/usr/bin/env node

const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');

dotenv.config();

const MONGODB_URI = process.env.MONGO_URI_QUICKLEARNING || process.env.MONGO_URI_DEV || process.env.MONGO_URI || 'mongodb://localhost:27017/virtualvoices';

async function debugAdvisorFilter() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log('🔗 Conectado a MongoDB');
    
    const db = client.db();
    const collection = db.collection('dynamicrecords');
    
    // Buscar algunos registros para ver el formato del campo asesor
    console.log('🔍 Buscando registros con campo asesor...');
    const records = await collection.find({ 
      tableSlug: 'prospectos', 
      c_name: 'quicklearning',
      'data.asesor': { $exists: true }
    }).limit(3).toArray();
    
    console.log(`📊 Encontrados ${records.length} registros con campo asesor:`);
    
    records.forEach((record, index) => {
      console.log(`\n--- Registro ${index + 1} ---`);
      console.log('ID:', record._id);
      console.log('Nombre:', record.data.nombre);
      console.log('Asesor:', record.data.asesor);
      console.log('Tipo de asesor:', typeof record.data.asesor);
    });
    
    // Probar filtro específico
    const advisorId = '686eaa90cb5c849172b31e89';
    console.log(`\n🔍 Probando filtro para asesor: ${advisorId}`);
    
    const filteredRecords = await collection.find({
      tableSlug: 'prospectos',
      c_name: 'quicklearning',
      'data.asesor': { $regex: advisorId, $options: 'i' }
    }).limit(5).toArray();
    
    console.log(`📊 Filtro encontró ${filteredRecords.length} registros`);
    
    if (filteredRecords.length > 0) {
      console.log('✅ Filtro funciona correctamente');
      filteredRecords.forEach((record, index) => {
        console.log(`\n--- Registro filtrado ${index + 1} ---`);
        console.log('ID:', record._id);
        console.log('Nombre:', record.data.nombre);
        console.log('Asesor:', record.data.asesor);
      });
    } else {
      console.log('❌ Filtro no encontró registros');
      
      // Buscar registros que contengan el ID en cualquier parte
      const anyMatch = await collection.find({
        tableSlug: 'prospectos',
        c_name: 'quicklearning',
        'data.asesor': { $regex: '686eaa90', $options: 'i' }
      }).limit(3).toArray();
      
      console.log(`🔍 Búsqueda parcial encontró ${anyMatch.length} registros`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

debugAdvisorFilter().catch(console.error);
