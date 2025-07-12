const axios = require('axios');

async function syncSinContestarChats() {
  try {
    console.log('🔄 Sincronizando registros de sin contestar con chats...\n');
    
    // Obtener todos los registros de sin contestar
    const response = await axios.get('http://localhost:3001/api/records/table/quicklearning/sin_contestar?page=1&limit=1000');
    const records = response.data.records;
    
    console.log(`📊 Total registros de sin contestar: ${records.length}`);
    
    let updatedCount = 0;
    let chatFoundCount = 0;
    let noChatCount = 0;
    
    for (const record of records) {
      const phone = record.data?.telefono || record.data?.phone;
      const name = record.data?.nombre || record.data?.name;
      
      if (!phone || phone === 'Sin teléfono') {
        console.log(`⚠️  Registro sin teléfono: ${name}`);
        continue;
      }
      
      try {
        // Limpiar número de teléfono
        const cleanPhone = phone.replace(/\D/g, '');
        
        // Buscar chat por teléfono
        const chatResponse = await axios.get(`http://localhost:3001/api/whatsapp/chat/${cleanPhone}`);
        
        if (chatResponse.data && chatResponse.data.chat) {
          const chat = chatResponse.data.chat;
          
          // Actualizar registro con información del chat
          const updateData = {
            data: {
              ...record.data,
              ultimo_mensaje: chat.lastMessage || chat.lastMessageDate,
              lastMessageDate: chat.lastMessageDate,
              chatId: chat._id,
              status: chat.status || 'activo'
            }
          };
          
          await axios.put(`http://localhost:3001/api/records/${record._id}`, updateData);
          
          console.log(`✅ Actualizado: ${name} (${phone}) - Chat encontrado`);
          chatFoundCount++;
          updatedCount++;
          
        } else {
          console.log(`⚠️  Sin chat: ${name} (${phone})`);
          noChatCount++;
        }
        
        // Pequeña pausa
        await new Promise(resolve => setTimeout(resolve, 50));
        
      } catch (error) {
        if (error.response?.status === 404) {
          console.log(`⚠️  Sin chat: ${name} (${phone})`);
          noChatCount++;
        } else {
          console.log(`❌ Error procesando ${name}: ${error.message}`);
        }
      }
    }
    
    console.log(`\n🎉 Sincronización completada:`);
    console.log(`✅ Registros actualizados: ${updatedCount}`);
    console.log(`🔗 Chats encontrados: ${chatFoundCount}`);
    console.log(`⚠️  Sin chat: ${noChatCount}`);
    console.log(`📊 Total procesados: ${records.length}`);
    
  } catch (error) {
    console.error('❌ Error general:', error.message);
  }
}

// Función para crear tabla de sin contestar si no existe
async function createSinContestarTable() {
  try {
    console.log('🏗️  Creando tabla de sin contestar...');
    
    const tableData = {
      name: 'Sin Contestar',
      slug: 'sin_contestar',
      c_name: 'quicklearning',
      fields: [
        { name: 'Nombre', type: 'text', required: true },
        { name: 'Teléfono', type: 'text', required: true },
        { name: 'Email', type: 'email', required: false },
        { name: 'Clasificación', type: 'select', options: ['prospecto', 'cliente', 'alumno', 'exalumno'], required: true },
        { name: 'Medio', type: 'text', required: true },
        { name: 'Curso', type: 'text', required: false },
        { name: 'Ciudad', type: 'text', required: false },
        { name: 'Campaña', type: 'text', required: true },
        { name: 'Comentario', type: 'text', required: false },
        { name: 'Último mensaje', type: 'text', required: false },
        { name: 'Fecha último mensaje', type: 'date', required: false },
        { name: 'Chat ID', type: 'text', required: false },
        { name: 'Status', type: 'select', options: ['activo', 'inactivo', 'sin contestar'], required: false }
      ],
      isActive: true
    };
    
    const response = await axios.post('http://localhost:3001/api/tables', tableData);
    console.log('✅ Tabla creada exitosamente');
    return response.data;
    
  } catch (error) {
    if (error.response?.status === 409) {
      console.log('ℹ️  La tabla ya existe');
      return null;
    } else {
      console.error('❌ Error creando tabla:', error.message);
      throw error;
    }
  }
}

// Función para asignar asesores automáticamente
async function assignAsesoresToSinContestar() {
  try {
    console.log('👥 Asignando asesores a registros de sin contestar...\n');
    
    // Obtener asesores disponibles
    const asesoresResponse = await axios.get('http://localhost:3001/api/users?role=Asesor');
    const asesores = asesoresResponse.data.users || [];
    
    if (asesores.length === 0) {
      console.log('❌ No hay asesores disponibles');
      return;
    }
    
    // Obtener registros sin asesor
    const recordsResponse = await axios.get('http://localhost:3001/api/records/table/quicklearning/sin_contestar?page=1&limit=1000');
    const records = recordsResponse.data.records;
    
    console.log(`📊 Total registros: ${records.length}`);
    console.log(`👥 Asesores disponibles: ${asesores.length}`);
    
    let updatedCount = 0;
    let asesorIndex = 0;
    
    for (const record of records) {
      // Verificar si ya tiene asesor
      if (record.data?.asesor) {
        continue;
      }
      
      const asesor = asesores[asesorIndex % asesores.length];
      
      const updateData = {
        data: {
          ...record.data,
          asesor: JSON.stringify({
            name: asesor.name,
            email: asesor.email,
            _id: asesor._id
          })
        }
      };
      
      await axios.put(`http://localhost:3001/api/records/${record._id}`, updateData);
      
      console.log(`✅ Asignado asesor ${asesor.name} a: ${record.data?.nombre || 'Sin nombre'}`);
      updatedCount++;
      asesorIndex++;
      
      // Pequeña pausa
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    console.log(`\n🎉 Asignación completada:`);
    console.log(`✅ Registros actualizados: ${updatedCount}`);
    
  } catch (error) {
    console.error('❌ Error asignando asesores:', error.message);
  }
}

// Ejecutar según el comando
const command = process.argv[2];

switch (command) {
  case '--create-table':
    createSinContestarTable();
    break;
  case '--assign-asesores':
    assignAsesoresToSinContestar();
    break;
  case '--sync-chats':
    syncSinContestarChats();
    break;
  case '--full-setup':
    (async () => {
      await createSinContestarTable();
      await new Promise(resolve => setTimeout(resolve, 1000));
      syncSinContestarChats();
    })();
    break;
  default:
    console.log('📋 Comandos disponibles:');
    console.log('  --create-table: Crear tabla de sin contestar');
    console.log('  --sync-chats: Sincronizar con chats existentes');
    console.log('  --assign-asesores: Asignar asesores automáticamente');
    console.log('  --full-setup: Ejecutar configuración completa');
    break;
} 