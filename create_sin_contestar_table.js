const axios = require('axios');

async function createSinContestarTable() {
  try {
    console.log('🏗️  Creando tabla de sin contestar...');
    
    const tableData = {
      name: 'Sin Contestar',
      slug: 'sin_contestar',
      icon: '📞',
      c_name: 'quicklearning',
      createdBy: 'admin@quicklearning.com',
      isActive: true,
      fields: [
        {
          name: 'nombre',
          label: 'Nombre',
          type: 'text',
          required: true,
          order: 1,
          width: 200
        },
        {
          name: 'telefono',
          label: 'Teléfono',
          type: 'text',
          required: true,
          order: 2,
          width: 150
        },
        {
          name: 'email',
          label: 'Email',
          type: 'email',
          required: false,
          order: 3,
          width: 250
        },
        {
          name: 'clasificacion',
          label: 'Clasificación',
          type: 'select',
          required: true,
          options: ['prospecto', 'cliente', 'alumno', 'exalumno'],
          defaultValue: 'prospecto',
          order: 4,
          width: 150
        },
        {
          name: 'medio',
          label: 'Medio',
          type: 'text',
          required: true,
          defaultValue: 'Meta',
          order: 5,
          width: 120
        },
        {
          name: 'curso',
          label: 'Curso',
          type: 'text',
          required: false,
          order: 6,
          width: 150
        },
        {
          name: 'ciudad',
          label: 'Ciudad',
          type: 'text',
          required: false,
          order: 7,
          width: 150
        },
        {
          name: 'campana',
          label: 'Campaña',
          type: 'text',
          required: true,
          defaultValue: 'RMKT',
          order: 8,
          width: 120
        },
        {
          name: 'comentario',
          label: 'Comentario',
          type: 'text',
          required: false,
          order: 9,
          width: 200
        },
        {
          name: 'ultimo_mensaje',
          label: 'Último mensaje',
          type: 'text',
          required: false,
          order: 10,
          width: 200
        },
        {
          name: 'lastMessageDate',
          label: 'Fecha último mensaje',
          type: 'date',
          required: false,
          order: 11,
          width: 150
        },
        {
          name: 'asesor',
          label: 'Asesor',
          type: 'text',
          required: false,
          order: 12,
          width: 150
        },
        {
          name: 'status',
          label: 'Status',
          type: 'select',
          required: false,
          options: ['nuevo', 'en negociación', 'alumno activo', 'alumno inactivo', 'sin interés', 'sin contestar'],
          defaultValue: 'sin contestar',
          order: 13,
          width: 150
        },
        {
          name: 'ai_enabled',
          label: 'AI',
          type: 'boolean',
          required: false,
          defaultValue: true,
          order: 14,
          width: 80
        },
        {
          name: 'consecutivo',
          label: 'Consecutivo',
          type: 'number',
          required: false,
          order: 15,
          width: 120
        },
        {
          name: 'juntas',
          label: 'Juntas',
          type: 'text',
          required: false,
          order: 16,
          width: 150
        },
        {
          name: 'chatId',
          label: 'Chat ID',
          type: 'text',
          required: false,
          order: 17,
          width: 200
        }
      ]
    };
    
    const response = await axios.post('http://localhost:3001/api/tables', tableData);
    
    if (response.data && response.data.table) {
      const table = response.data.table;
      console.log('✅ Tabla creada exitosamente');
      console.log('📋 Detalles de la tabla:');
      console.log(`   Nombre: ${table.name}`);
      console.log(`   Slug: ${table.slug}`);
      console.log(`   Empresa: ${table.c_name}`);
      console.log(`   Campos: ${table.fields ? table.fields.length : 'N/A'}`);
      return table;
    } else {
      console.log('✅ Tabla creada exitosamente');
      console.log('📋 Respuesta del servidor:', JSON.stringify(response.data, null, 2));
      return response.data;
    }
    
  } catch (error) {
    if (error.response?.status === 409) {
      console.log('ℹ️  La tabla ya existe');
      return null;
    } else {
      console.error('❌ Error creando tabla:', error.response?.data?.message || error.message);
      if (error.response?.data) {
        console.error('📋 Detalles del error:', JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  }
}

// Ejecutar la creación
createSinContestarTable()
  .then((result) => {
    if (result) {
      console.log('\n🎉 Proceso completado exitosamente!');
    } else {
      console.log('\nℹ️  La tabla ya existía');
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error en el proceso:', error.message);
    process.exit(1);
  }); 