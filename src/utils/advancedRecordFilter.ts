import { applyFuzzySearchToToolResult } from './fuzzyPropertySearch';

// Filtro avanzado universal usando fuzzy search sobre todos los datos
export default function advancedRecordFilter(records: any[], query: string, parameters: any): any {
  if (!Array.isArray(records) || !query) return records;
  // Usar fuzzy search sobre todos los datos y el mensaje completo
  const fuzzyResults = applyFuzzySearchToToolResult(records, query);
  const pageSize = 3;
  const page = parameters.page && Number(parameters.page) > 0 ? Number(parameters.page) : 1;
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  if (Array.isArray(fuzzyResults) && fuzzyResults.length > 0) return fuzzyResults.slice(startIndex, endIndex);
  // Si no hay coincidencias, devolver sugerencias con mensaje
  return {
    message: 'No encontramos propiedades exactas para tu búsqueda, pero aquí tienes algunas opciones que podrían interesarte:',
    sugerencias: records.slice(0, 3)
  };
}