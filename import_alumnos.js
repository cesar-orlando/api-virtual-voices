const fs = require('fs');

const HEADERS = [
  'Nombre', 'Teléfono', 'Email', 'Clasificación', 'Medio', 'Curso', 'Ciudad', 'Campaña', 'Comentario'
];

const raw = fs.readFileSync('alumnos.json', 'utf8');
const data = JSON.parse(raw);
const alumnos = data.records;

function mapAlumno(alumno) {
  const fieldMap = {};
  for (const h of HEADERS) fieldMap[h] = '';
  for (const field of alumno.customFields) {
    switch (field.key) {
      case 'name': fieldMap['Nombre'] = field.value; break;
      case 'phone': fieldMap['Teléfono'] = field.value; break;
      case 'email': fieldMap['Email'] = field.value; break;
      case 'classification': fieldMap['Clasificación'] = field.value; break;
      case 'curso': fieldMap['Curso'] = field.value; break;
      case 'comentario': fieldMap['Comentario'] = field.value; break;
      // Ciudad: buscar campo 'twilio' o 'estado'
      case 'twilio':
      case 'estado':
        if (!fieldMap['Ciudad']) fieldMap['Ciudad'] = field.value;
        break;
    }
  }
  fieldMap['Medio'] = 'Meta';
  fieldMap['Campaña'] = 'RMKT';
  return fieldMap;
}

const primerAlumno = mapAlumno(alumnos[0]);
console.log('Primer alumno transformado:', primerAlumno); 