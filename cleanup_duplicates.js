const axios = require('axios');

async function cleanupDuplicates() {
  try {
    console.log('🧹 Limpiando duplicados de alumnos...\n');
    
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
    
    // Eliminar duplicados
    console.log('\n🗑️  Eliminando duplicados...');
    let deletedCount = 0;
    
    for (const recordId of duplicates) {
      try {
        await axios.delete(`http://localhost:3001/api/records/${recordId}/quicklearning`);
        deletedCount++;
        console.log(`   ✅ Eliminado: ${recordId}`);
      } catch (error) {
        console.log(`   ❌ Error eliminando ${recordId}: ${error.response?.data?.message || error.message}`);
      }
    }
    
    console.log(`\n🎉 Limpieza completada:`);
    console.log(`✅ Registros únicos mantenidos: ${keepRecords.length}`);
    console.log(`🗑️  Duplicados eliminados: ${deletedCount}`);
    
  } catch (error) {
    console.error('❌ Error en la limpieza:', error.message);
  }
}

cleanupDuplicates(); 