const fs = require('fs');
const axios = require('axios');

// Mapeo de ladas a ciudades (solo las que necesitamos)
const LADA_TO_CITY = {
  '521': 'CDMX', '522': 'Guadalajara, Jalisco', '523': 'Morelia, Michoacán', '524': 'Aguascalientes',
  '525': 'CDMX', '526': 'Durango', '527': 'Zacatecas', '528': 'San Luis Potosí', '529': 'Querétaro',
  '531': 'Guanajuato', '532': 'Colima', '533': 'Zacatecas', '534': 'Aguascalientes', '535': 'Jalisco',
  '536': 'Michoacán', '537': 'Hidalgo', '538': 'Tlaxcala', '539': 'Puebla', '540': 'Veracruz',
  '541': 'Oaxaca', '542': 'Chiapas', '543': 'Tabasco', '544': 'Guerrero', '545': 'Morelos',
  '546': 'Tamaulipas', '547': 'Nuevo León', '548': 'Coahuila', '549': 'Chihuahua', '550': 'Sonora',
  '551': 'Baja California', '552': 'Baja California Sur', '553': 'Zacatecas', '554': 'Estado de México',
  '555': 'CDMX', '556': 'CDMX', '557': 'CDMX', '558': 'Hidalgo', '559': 'San Luis Potosí',
  '561': 'Guanajuato', '562': 'Querétaro', '563': 'Michoacán', '564': 'CDMX', '565': 'CDMX',
  '566': 'CDMX', '567': 'CDMX', '568': 'CDMX', '569': 'CDMX', '571': 'CDMX', '572': 'CDMX',
  '573': 'CDMX', '574': 'CDMX', '575': 'CDMX', '576': 'CDMX', '577': 'CDMX', '578': 'CDMX',
  '579': 'CDMX', '581': 'Guanajuato', '582': 'Querétaro', '583': 'Michoacán', '584': 'CDMX',
  '585': 'CDMX', '586': 'CDMX', '587': 'CDMX', '588': 'CDMX', '589': 'CDMX', '591': 'CDMX',
  '592': 'CDMX', '593': 'CDMX', '594': 'CDMX', '595': 'CDMX', '596': 'CDMX', '597': 'CDMX',
  '598': 'CDMX', '599': 'CDMX', '612': 'Baja California', '614': 'Chihuahua', '615': 'Durango',
  '616': 'Guanajuato', '618': 'Sinaloa', '619': 'Baja California', '621': 'Sonora', '622': 'Sonora',
  '624': 'Baja California Sur', '625': 'Sinaloa', '626': 'Chihuahua', '627': 'Coahuila',
  '628': 'Coahuila', '629': 'Coahuila', '631': 'Sonora', '632': 'Sonora', '633': 'Sinaloa',
  '634': 'Sinaloa', '635': 'Sinaloa', '636': 'Chihuahua', '637': 'Chihuahua', '638': 'Chihuahua',
  '639': 'Chihuahua', '641': 'Coahuila', '642': 'Coahuila', '643': 'Coahuila', '644': 'Coahuila',
  '645': 'Coahuila', '646': 'Coahuila', '647': 'Coahuila', '648': 'Coahuila', '649': 'Coahuila',
  '651': 'Nuevo León', '652': 'Nuevo León', '653': 'Nuevo León', '654': 'Nuevo León',
  '655': 'Nuevo León', '656': 'Nuevo León', '657': 'Nuevo León', '658': 'Nuevo León',
  '659': 'Nuevo León', '661': 'Tamaulipas', '662': 'Tamaulipas', '663': 'Tamaulipas',
  '664': 'Tamaulipas', '665': 'Tamaulipas', '666': 'Tamaulipas', '667': 'Tamaulipas',
  '668': 'Tamaulipas', '669': 'Tamaulipas', '671': 'Nuevo León', '672': 'Nuevo León',
  '673': 'Nuevo León', '674': 'Nuevo León', '675': 'Nuevo León', '676': 'Nuevo León',
  '677': 'Nuevo León', '678': 'Nuevo León', '679': 'Nuevo León', '681': 'Tamaulipas',
  '682': 'Tamaulipas', '683': 'Tamaulipas', '684': 'Tamaulipas', '685': 'Tamaulipas',
  '686': 'Tamaulipas', '687': 'Tamaulipas', '688': 'Tamaulipas', '689': 'Tamaulipas',
  '691': 'Nuevo León', '692': 'Nuevo León', '693': 'Nuevo León', '694': 'Nuevo León',
  '695': 'Nuevo León', '696': 'Nuevo León', '697': 'Nuevo León', '698': 'Nuevo León',
  '699': 'Nuevo León', '711': 'Guerrero', '712': 'Guerrero', '713': 'Guerrero', '714': 'Guerrero',
  '715': 'Guerrero', '716': 'Guerrero', '717': 'Guerrero', '718': 'Guerrero', '719': 'Guerrero',
  '721': 'Puebla', '722': 'Puebla', '723': 'Puebla', '724': 'Puebla', '725': 'Puebla',
  '726': 'Puebla', '727': 'Puebla', '728': 'Puebla', '729': 'Puebla', '731': 'Veracruz',
  '732': 'Veracruz', '733': 'Veracruz', '734': 'Veracruz', '735': 'Veracruz', '736': 'Veracruz',
  '737': 'Veracruz', '738': 'Veracruz', '739': 'Veracruz', '741': 'Puebla', '742': 'Puebla',
  '743': 'Puebla', '744': 'Puebla', '745': 'Puebla', '746': 'Puebla', '747': 'Puebla',
  '748': 'Puebla', '749': 'Puebla', '751': 'Veracruz', '752': 'Veracruz', '753': 'Veracruz',
  '754': 'Veracruz', '755': 'Veracruz', '756': 'Veracruz', '757': 'Veracruz', '758': 'Veracruz',
  '759': 'Veracruz', '761': 'Puebla', '762': 'Puebla', '763': 'Puebla', '764': 'Puebla',
  '765': 'Puebla', '766': 'Puebla', '767': 'Puebla', '768': 'Puebla', '769': 'Puebla',
  '771': 'Veracruz', '772': 'Veracruz', '773': 'Veracruz', '774': 'Veracruz', '775': 'Veracruz',
  '776': 'Veracruz', '777': 'Veracruz', '778': 'Veracruz', '779': 'Veracruz', '781': 'Puebla',
  '782': 'Puebla', '783': 'Puebla', '784': 'Puebla', '785': 'Puebla', '786': 'Puebla',
  '787': 'Puebla', '788': 'Puebla', '789': 'Puebla', '791': 'Veracruz', '792': 'Veracruz',
  '793': 'Veracruz', '794': 'Veracruz', '795': 'Veracruz', '796': 'Veracruz', '797': 'Veracruz',
  '798': 'Veracruz', '799': 'Veracruz', '811': 'Nuevo León', '812': 'Nuevo León', '813': 'Nuevo León',
  '814': 'Nuevo León', '815': 'Nuevo León', '816': 'Nuevo León', '817': 'Nuevo León',
  '818': 'Nuevo León', '819': 'Nuevo León', '821': 'Tamaulipas', '822': 'Tamaulipas',
  '823': 'Tamaulipas', '824': 'Tamaulipas', '825': 'Tamaulipas', '826': 'Tamaulipas',
  '827': 'Tamaulipas', '828': 'Tamaulipas', '829': 'Tamaulipas', '831': 'Nuevo León',
  '832': 'Nuevo León', '833': 'Nuevo León', '834': 'Nuevo León', '835': 'Nuevo León',
  '836': 'Nuevo León', '837': 'Nuevo León', '838': 'Nuevo León', '839': 'Nuevo León',
  '841': 'Tamaulipas', '842': 'Tamaulipas', '843': 'Tamaulipas', '844': 'Tamaulipas',
  '845': 'Tamaulipas', '846': 'Tamaulipas', '847': 'Tamaulipas', '848': 'Tamaulipas',
  '849': 'Tamaulipas', '851': 'Nuevo León', '852': 'Nuevo León', '853': 'Nuevo León',
  '854': 'Nuevo León', '855': 'Nuevo León', '856': 'Nuevo León', '857': 'Nuevo León',
  '858': 'Nuevo León', '859': 'Nuevo León', '861': 'Tamaulipas', '862': 'Tamaulipas',
  '863': 'Tamaulipas', '864': 'Tamaulipas', '865': 'Tamaulipas', '866': 'Tamaulipas',
  '867': 'Tamaulipas', '868': 'Tamaulipas', '869': 'Tamaulipas', '871': 'Nuevo León',
  '872': 'Nuevo León', '873': 'Nuevo León', '874': 'Nuevo León', '875': 'Nuevo León',
  '876': 'Nuevo León', '877': 'Nuevo León', '878': 'Nuevo León', '879': 'Nuevo León',
  '881': 'Tamaulipas', '882': 'Tamaulipas', '883': 'Tamaulipas', '884': 'Tamaulipas',
  '885': 'Tamaulipas', '886': 'Tamaulipas', '887': 'Tamaulipas', '888': 'Tamaulipas',
  '889': 'Tamaulipas', '891': 'Nuevo León', '892': 'Nuevo León', '893': 'Nuevo León',
  '894': 'Nuevo León', '895': 'Nuevo León', '896': 'Nuevo León', '897': 'Nuevo León',
  '898': 'Nuevo León', '899': 'Nuevo León', '911': 'CDMX', '912': 'CDMX', '913': 'CDMX',
  '914': 'CDMX', '915': 'CDMX', '916': 'CDMX', '917': 'CDMX', '918': 'CDMX', '919': 'CDMX',
  '921': 'CDMX', '922': 'CDMX', '923': 'CDMX', '924': 'CDMX', '925': 'CDMX', '926': 'CDMX',
  '927': 'CDMX', '928': 'CDMX', '929': 'CDMX', '931': 'CDMX', '932': 'CDMX', '933': 'CDMX',
  '934': 'CDMX', '935': 'CDMX', '936': 'CDMX', '937': 'CDMX', '938': 'CDMX', '939': 'CDMX',
  '941': 'CDMX', '942': 'CDMX', '943': 'CDMX', '944': 'CDMX', '945': 'CDMX', '946': 'CDMX',
  '947': 'CDMX', '948': 'CDMX', '949': 'CDMX', '951': 'CDMX', '952': 'CDMX', '953': 'CDMX',
  '954': 'CDMX', '955': 'CDMX', '956': 'CDMX', '957': 'CDMX', '958': 'CDMX', '959': 'CDMX',
  '961': 'CDMX', '962': 'CDMX', '963': 'CDMX', '964': 'CDMX', '965': 'CDMX', '966': 'CDMX',
  '967': 'CDMX', '968': 'CDMX', '969': 'CDMX', '971': 'CDMX', '972': 'CDMX', '973': 'CDMX',
  '974': 'CDMX', '975': 'CDMX', '976': 'CDMX', '977': 'CDMX', '978': 'CDMX', '979': 'CDMX',
  '981': 'CDMX', '982': 'CDMX', '983': 'CDMX', '984': 'CDMX', '985': 'CDMX', '986': 'CDMX',
  '987': 'CDMX', '988': 'CDMX', '989': 'CDMX', '991': 'CDMX', '992': 'CDMX', '993': 'CDMX',
  '994': 'CDMX', '995': 'CDMX', '996': 'CDMX', '997': 'CDMX', '998': 'CDMX', '999': 'CDMX'
};

const HEADERS = ['Nombre', 'Teléfono', 'Email', 'Clasificación', 'Medio', 'Curso', 'Ciudad', 'Campaña', 'Comentario'];

function getCityByLada(phone) {
  // Extraer la lada del número (primeros 3 dígitos después del 52)
  const cleanPhone = phone.replace(/\D/g, ''); // Solo números
  if (cleanPhone.startsWith('52') && cleanPhone.length >= 5) {
    const lada = cleanPhone.substring(2, 5); // Tomar dígitos 3, 4 y 5
    return LADA_TO_CITY[lada] || 'CDMX'; // Default a CDMX en lugar de Desconocido
  }
  return 'CDMX'; // Default a CDMX
}

function mapAlumno(alumno) {
  const fieldMap = {};
  for (const h of HEADERS) fieldMap[h] = null; // Inicializar con null
  
  for (const field of alumno.customFields) {
    switch (field.key) {
      case 'name': fieldMap['Nombre'] = field.value || 'Sin nombre'; break;
      case 'phone': 
        fieldMap['Teléfono'] = field.value || 'Sin teléfono';
        fieldMap['Ciudad'] = getCityByLada(field.value);
        break;
      case 'email': fieldMap['Email'] = field.value || null; break;
      case 'classification': fieldMap['Clasificación'] = field.value || null; break;
      case 'medio': fieldMap['Medio'] = field.value || 'Meta'; break;
      case 'modalidad': fieldMap['Curso'] = field.value || null; break; // Usar modalidad para Curso
      case 'campaña': fieldMap['Campaña'] = field.value || 'RMKT'; break;
      case 'comentario': fieldMap['Comentario'] = field.value || null; break;
    }
  }
  // Valores por defecto obligatorios
  if (!fieldMap['Nombre']) fieldMap['Nombre'] = 'Sin nombre';
  if (!fieldMap['Teléfono']) fieldMap['Teléfono'] = 'Sin teléfono';
  if (!fieldMap['Medio']) fieldMap['Medio'] = 'Meta';
  if (!fieldMap['Campaña']) fieldMap['Campaña'] = 'RMKT';
  if (!fieldMap['Ciudad']) fieldMap['Ciudad'] = 'CDMX';
  
  return fieldMap;
}

async function updateAlumnos() {
  try {
    console.log('🔄 Actualizando registros de alumnos con información correcta...\n');
    
    // Leer datos originales
    const alumnosData = JSON.parse(fs.readFileSync('alumnos.json', 'utf8')).records;
    console.log(`📊 Total de alumnos a procesar: ${alumnosData.length}\n`);
    
    // Obtener registros existentes
    const response = await axios.get('http://localhost:3001/api/records/table/quicklearning/alumnos?page=1&limit=1000');
    const existingRecords = response.data.records;
    
    console.log(`📋 Registros existentes en BD: ${existingRecords.length}`);
    
    // Crear mapa de teléfonos a registros existentes
    const phoneToRecord = {};
    existingRecords.forEach(record => {
      phoneToRecord[record.data.Teléfono] = record;
    });
    
    let updatedCount = 0;
    let errorCount = 0;
    
    for (const alumno of alumnosData) {
      try {
        const mappedData = mapAlumno(alumno);
        const phone = mappedData.Teléfono;
        
        // Buscar registro existente por teléfono
        const existingRecord = phoneToRecord[phone];
        
        if (existingRecord) {
          // Actualizar registro existente
          const updatePayload = {
            data: mappedData
          };
          
          await axios.put(`http://localhost:3001/api/records/${existingRecord._id}`, updatePayload);
          
          console.log(`✅ Actualizado: ${mappedData.Nombre} (${phone}) - Curso: ${mappedData.Curso || 'N/A'}`);
          updatedCount++;
        } else {
          console.log(`⚠️  No encontrado: ${mappedData.Nombre} (${phone})`);
          errorCount++;
        }
        
      } catch (error) {
        console.log(`❌ Error procesando alumno: ${error.message}`);
        errorCount++;
      }
    }
    
    console.log(`\n🎉 Actualización completada:`);
    console.log(`✅ Registros actualizados: ${updatedCount}`);
    console.log(`❌ Errores: ${errorCount}`);
    
  } catch (error) {
    console.error('❌ Error en la actualización:', error.message);
  }
}

updateAlumnos(); 