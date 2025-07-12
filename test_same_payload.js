const fs = require('fs');
const axios = require('axios');

async function testSamePayload() {
  try {
    console.log('🔍 Probando el mismo payload que funcionó en debug...\n');
    
    // Usar exactamente el mismo payload que funcionó
    const payload = {
      tableSlug: 'alumnos',
      c_name: 'quicklearning',
      createdBy: 'admin@quicklearning.com',
      data: {
        Nombre: 'Karina Ledesma Mañon ',
        Teléfono: '5215641025787',
        Email: null,
        Clasificación: 'alumno',
        Medio: 'Meta',
        Curso: null,
        Ciudad: 'CDMX',
        Campaña: 'RMKT',
        Comentario: null
      }
    };
    
    console.log('📤 Payload exacto:');
    console.log(JSON.stringify(payload, null, 2));
    
    console.log('\n🚀 Enviando petición...');
    
    try {
      const response = await axios.post('http://localhost:3001/api/records', payload);
      console.log('✅ Respuesta exitosa:');
      console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.log('❌ Error completo:');
      console.log('Status:', error.response?.status);
      console.log('Status Text:', error.response?.statusText);
      console.log('Data:', JSON.stringify(error.response?.data, null, 2));
      console.log('Message:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Error general:', error.message);
  }
}

testSamePayload(); 