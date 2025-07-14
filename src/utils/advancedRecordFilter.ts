import { applyFuzzySearchToToolResult } from './fuzzyPropertySearch';

// Filtro avanzado universal usando fuzzy search sobre todos los datos
export default function advancedRecordFilter(records: any[], query: string): any {
  if (!Array.isArray(records) || !query) return records;
  // Usar fuzzy search sobre todos los datos y el mensaje completo
  const fuzzyResults = applyFuzzySearchToToolResult(records, query);
  if (Array.isArray(fuzzyResults) && fuzzyResults.length > 0) return fuzzyResults;
  // Si no hay coincidencias, devolver sugerencias con mensaje
  return {
    message: 'No encontramos propiedades exactas para tu búsqueda, pero aquí tienes algunas opciones que podrían interesarte:',
    sugerencias: records.slice(0, 3)
  };
} 