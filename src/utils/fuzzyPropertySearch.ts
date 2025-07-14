import Fuse from 'fuse.js';

export interface Propiedad {
  titulo: string;
  direccion: string;
  descripcion: string;
  precio: number;
  ciudad: string;
  tipo: string;
  operacion: string;
  recamaras?: number;
  banos?: number;
}

export interface FuzzySearchOptions {
  query: string;
  propiedades: Propiedad[];
}

// Utilidad para extraer precio de texto
function parsePrecio(text: string): number | null {
  text = text.replace(/[,\s]/g, '').toLowerCase();
  let match;
  match = text.match(/(\d+(?:\.\d+)?)(?:millon(?:es)?|m|mm)/);
  if (match) return Math.round(parseFloat(match[1]) * 1000000);
  match = text.match(/(\d+(?:\.\d+)?)mil/);
  if (match) return Math.round(parseFloat(match[1]) * 1000);
  match = text.match(/(\d{4,9})/);
  if (match) return parseInt(match[1], 10);
  return null;
}

// Utilidad para extraer recámaras del texto
function parseRecamaras(text: string): number | null {
  const match = text.match(/(\d+)\s*rec[aá]maras?/i);
  if (match) return parseInt(match[1], 10);
  return null;
}

export function fuzzyPropertySearch({ query, propiedades }: FuzzySearchOptions) {
  const precioBuscado = parsePrecio(query);
  const recamarasBuscadas = parseRecamaras(query);
  let candidatas = propiedades;
  // Filtrar por precio (±20%)
  if (precioBuscado) {
    const margen = precioBuscado * 0.2;
    candidatas = candidatas.filter(p => Math.abs(p.precio - precioBuscado) <= margen);
  }
  // Filtrar por recámaras
  if (recamarasBuscadas) {
    candidatas = candidatas.filter(p => p.recamaras === recamarasBuscadas);
  }
  // Limpiar el query de la parte de precio y recámaras
  let queryLimpio = query
    .replace(/(\d+(?:[.,]\d+)?\s*(millon(?:es)?|m|mm|mil)?)/gi, '')
    .replace(/(\d+)\s*rec[aá]maras?/gi, '')
    .replace(/de|por|en|a|la|el|una|un/gi, '')
    .trim();
  // Si el query limpio queda vacío y hay candidatas, devolver la mejor
  if (queryLimpio.length === 0 && candidatas.length > 0) {
    return { match: candidatas[0], score: 0 };
  }
  // Si hay varias candidatas, usar fuzzy search para el resto del query
  const fuse = new Fuse(candidatas, {
    keys: [
      'titulo',
      'direccion',
      'descripcion',
      'ciudad',
      'tipo',
      'operacion',
    ],
    threshold: 0.4,
    includeScore: true,
  });
  const results = fuse.search(queryLimpio.length > 0 ? queryLimpio : 'casa');
  if (results.length > 0) {
    return { match: results[0].item, score: results[0].score };
  }
  // Si no hay candidatas, buscar la más cercana por precio
  if (precioBuscado && propiedades.length > 0) {
    let masCercana = propiedades[0];
    let minDiff = Math.abs(propiedades[0].precio - precioBuscado);
    for (const p of propiedades) {
      const diff = Math.abs(p.precio - precioBuscado);
      if (diff < minDiff) {
        minDiff = diff;
        masCercana = p;
      }
    }
    const porcentaje = minDiff / precioBuscado;
    if (porcentaje <= 0.2) {
      return { match: masCercana, score: null, sugerencia: true };
    }
  }
  return null;
}

// Detectar si los datos son candidatos para fuzzy search
export function isFuzzySearchCandidate(data: any): boolean {
  if (!data || typeof data !== 'object') return false;
  
  // Si es un array, verificar si contiene objetos con propiedades típicas de propiedades inmobiliarias
  if (Array.isArray(data)) {
    if (data.length === 0) return false;
    
    const firstItem = data[0];
    if (typeof firstItem !== 'object') return false;
    
    // Verificar si tiene propiedades típicas de propiedades inmobiliarias
    const propertyKeywords = [
      'titulo', 'title', 'nombre', 'name', 'direccion', 'address', 'ubicacion', 'location',
      'precio', 'price', 'recamaras', 'bedrooms', 'baños', 'bathrooms', 'metros', 'sqft',
      'tipo', 'type', 'estado', 'status', 'ciudad', 'city', 'colonia', 'neighborhood'
    ];
    
    const itemKeys = Object.keys(firstItem).map(key => key.toLowerCase());
    const hasPropertyKeywords = propertyKeywords.some(keyword => 
      itemKeys.some(key => key.includes(keyword))
    );
    
    return hasPropertyKeywords;
  }
  
  // Si es un objeto, verificar si tiene una propiedad que contenga un array de propiedades
  const dataKeys = Object.keys(data);
  const arrayKeys = dataKeys.filter(key => Array.isArray(data[key]));
  
  for (const key of arrayKeys) {
    if (isFuzzySearchCandidate(data[key])) {
      return true;
    }
  }
  
  return false;
}

// Extraer el array de propiedades de los datos (puede estar anidado)
export function extractPropertyArray(data: any): any[] {
  if (Array.isArray(data)) {
    return data;
  }
  
  if (typeof data === 'object' && data !== null) {
    const dataKeys = Object.keys(data);
    
    // Buscar arrays que contengan propiedades
    for (const key of dataKeys) {
      if (Array.isArray(data[key])) {
        if (isFuzzySearchCandidate(data[key])) {
          return data[key];
        }
      }
    }
    
    // Buscar recursivamente en objetos anidados
    for (const key of dataKeys) {
      if (typeof data[key] === 'object' && data[key] !== null) {
        const result = extractPropertyArray(data[key]);
        if (result.length > 0) {
          return result;
        }
      }
    }
  }
  
  return [];
}

function normalize(str: string): string {
  return (str || '').normalize('NFD').replace(/[0-\u036f]/g, '').toLowerCase();
}

function registroCoincide(registro: any, query: string): boolean {
  const q = normalize(query);
  return Object.values(registro).some(val => {
    if (typeof val === 'string') return normalize(val).includes(q);
    if (Array.isArray(val)) return val.some(v => typeof v === 'string' && normalize(v).includes(q));
    if (typeof val === 'object' && val !== null) return registroCoincide(val, query);
    return false;
  });
}

function obtenerValoresUnicos(registros: any[]): Record<string, string[]> {
  const valores: Record<string, Set<string>> = {};
  registros.forEach(registro => {
    Object.entries(registro).forEach(([key, value]) => {
      if (typeof value === 'string') {
        if (!valores[key]) valores[key] = new Set();
        valores[key].add(value);
      }
    });
  });
  const result: Record<string, string[]> = {};
  Object.keys(valores).forEach(key => result[key] = Array.from(valores[key]));
  return result;
}

export function applyFuzzySearchToToolResult(data: any, query?: string): any {
  if (!query) return data;
  // Si es un array de registros
  if (Array.isArray(data)) {
    const filtrados = data.filter(r => registroCoincide(r, query));
    if (filtrados.length > 0) return filtrados;
    return { message: "No se encontraron coincidencias. Sugerencias:", sugerencias: obtenerValoresUnicos(data) };
  }
  // Si es un objeto con un array de registros (por ejemplo, { records: [...] })
  if (typeof data === 'object' && data !== null) {
    const keys = Object.keys(data);
    for (const key of keys) {
      if (Array.isArray(data[key])) {
        const filtrados = data[key].filter((r: any) => registroCoincide(r.data || r, query));
        if (filtrados.length > 0) return { ...data, [key]: filtrados };
        return { ...data, message: "No se encontraron coincidencias. Sugerencias:", sugerencias: obtenerValoresUnicos(data[key].map((r: any) => r.data || r)) };
      }
    }
  }
  return data;
} 