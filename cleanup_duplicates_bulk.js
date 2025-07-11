const axios = require('axios');

async function cleanupDuplicatesBulk() {
  try {
    console.log('🧹 Limpiando duplicados de alumnos (bulk delete)...\n');
    
    // Obtener todos los registros de alumnos
    const response = await axios.get('http://localhost:3001/api/records/table/quicklearning/alumnos?page=1&limit=1000');
    const records = response.data.records;
    
    console.log(`📊 Total de registros encontrados: ${records.length}`);
    
    // Agrupar por teléfono
    const phoneGroups = {};
    records.forEach(record => {
      const phone = record.data.Teléfono;
      if (!phoneGroups[phone]) {
        phoneGroups[phone] = [];
      }
      phoneGroups[phone].push(record);
    });
    
    // Identificar duplicados
    const duplicates = [];
    const keepRecords = [];
    
    Object.entries(phoneGroups).forEach(([phone, groupRecords]) => {
      if (groupRecords.length > 1) {
        // Ordenar por fecha de creación (más reciente primero)
        groupRecords.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        // Mantener el más reciente
        keepRecords.push(groupRecords[0]);
        
        // Marcar los demás como duplicados para eliminar
        groupRecords.slice(1).forEach(record => {
          duplicates.push(record._id);
        });
        
        console.log(`📱 Teléfono ${phone}: ${groupRecords.length} registros → mantener 1, eliminar ${groupRecords.length - 1}`);
      } else {
        // Solo un registro, mantenerlo
        keepRecords.push(groupRecords[0]);
      }
    });
    
    console.log(`\n📋 Resumen:`);
    console.log(`✅ Registros únicos: ${keepRecords.length}`);
    console.log(`🗑️  Duplicados a eliminar: ${duplicates.length}`);
    
    if (duplicates.length === 0) {
      console.log('🎉 No hay duplicados que eliminar');
      return;
    }
    
    // Eliminar duplicados usando bulk delete
    console.log('\n🗑️  Eliminando duplicados con bulk delete...');
    
    try {
      const deleteResponse = await axios.delete('http://localhost:3001/api/records/quicklearning/alumnos/bulk', {
        data: {
          recordIds: duplicates
        }
      });
      
      console.log(`\n🎉 Limpieza completada:`);
      console.log(`✅ Registros únicos mantenidos: ${keepRecords.length}`);
      console.log(`🗑️  Duplicados eliminados: ${deleteResponse.data.summary?.successful || 'N/A'}`);
      console.log(`❌ Errores: ${deleteResponse.data.summary?.failed || 'N/A'}`);
      
      if (deleteResponse.data.errors && deleteResponse.data.errors.length > 0) {
        console.log('\n⚠️  Errores detallados:');
        deleteResponse.data.errors.forEach(error => {
          console.log(`   - ${error.id}: ${error.error}`);
        });
      }
      
    } catch (error) {
      console.error('❌ Error en bulk delete:', error.response?.data || error.message);
    }
    
  } catch (error) {
    console.error('❌ Error en la limpieza:', error.message);
  }
}

cleanupDuplicatesBulk(); 