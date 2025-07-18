const axios = require('axios');

async function updateSinContestarStructure() {
  try {
    console.log('🔄 Actualizando estructura de tabla de sin contestar...');
    
    // Primero obtener el ID de la tabla
    const getResponse = await axios.get('http://localhost:3001/api/tables/quicklearning/sin_contestar');
    const tableId = getResponse.data._id;
    
    console.log(`📋 ID de la tabla: ${tableId}`);
    
    // Estructura exacta de la tabla de alumnos
    const fields = [
      {
        name: 'nombre',
        label: 'Nombre',
        type: 'text',
        required: true,
        options: [],
        order: 1,
        width: 150
      },
      {
        name: 'telefono',
        label: 'Teléfono',
        type: 'text',
        required: true,
        options: [],
        order: 2,
        width: 150
      },
      {
        name: 'email',
        label: 'Email',
        type: 'email',
        required: false,
        options: [],
        order: 3,
        width: 150
      },
      {
        name: 'clasificacion',
        label: 'Clasificación',
        type: 'text',
        required: false,
        options: [],
        order: 4,
        width: 150
      },
      {
        name: 'medio',
        label: 'Medio',
        type: 'select',
        required: false,
        options: ['Meta', 'Google', 'Interno'],
        order: 5,
        width: 150
      },
      {
        name: 'curso',
        label: 'Curso',
        type: 'select',
        required: false,
        options: ['Presencial', 'Virtual', 'Online'],
        order: 6,
        width: 150
      },
      {
        name: 'ciudad',
        label: 'Ciudad',
        type: 'text',
        required: false,
        options: [],
        order: 7,
        width: 150
      },
      {
        name: 'campana',
        label: 'Campaña',
        type: 'text',
        required: false,
        options: [],
        order: 8,
        width: 150
      },
      {
        name: 'comentario',
        label: 'Comentario',
        type: 'text',
        required: false,
        options: [],
        order: 9,
        width: 150
      },
      {
        name: 'asesor',
        label: 'Asesor',
        type: 'text',
        required: false,
        defaultValue: '',
        options: [],
        order: 10,
        width: 150
      },
      {
        name: 'ultimo_mensaje',
        label: 'Ultimo Mensaje',
        type: 'text',
        required: false,
        defaultValue: '',
        options: [],
        order: 11,
        width: 150
      },
      {
        name: 'aiEnabled',
        label: 'IA',
        type: 'boolean',
        required: false,
        defaultValue: 'true',
        options: [],
        order: 12,
        width: 150
      }
    ];
    
    // Actualizar la estructura de la tabla usando el endpoint correcto
    const updateData = {
      fields: fields,
      c_name: 'quicklearning',
      updatedBy: 'admin@quicklearning.com'
    };
    
    const response = await axios.patch(`http://localhost:3001/api/tables/quicklearning/${tableId}/structure`, updateData);
    
    if (response.data && response.data.table) {
      const table = response.data.table;
      console.log('✅ Estructura actualizada exitosamente');
      console.log('📋 Detalles de la tabla:');
      console.log(`   Nombre: ${table.name}`);
      console.log(`   Slug: ${table.slug}`);
      console.log(`   Empresa: ${table.c_name}`);
      console.log(`   Campos: ${table.fields ? table.fields.length : 'N/A'}`);
      return table;
    } else {
      console.log('✅ Estructura actualizada exitosamente');
      console.log('📋 Respuesta del servidor:', JSON.stringify(response.data, null, 2));
      return response.data;
    }
    
  } catch (error) {
    console.error('❌ Error actualizando tabla:', error.response?.data?.message || error.message);
    if (error.response?.data) {
      console.error('📋 Detalles del error:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

// Ejecutar la actualización
updateSinContestarStructure()
  .then((result) => {
    console.log('\n🎉 Proceso completado exitosamente!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error en el proceso:', error.message);
    process.exit(1);
  }); 