import { applyFuzzySearchToToolResult } from './fuzzyPropertySearch';

// Filtro avanzado universal usando fuzzy search sobre todos los datos
export default function advancedRecordFilter(records: any[], query: string, parameters: any): any {
  if (!Array.isArray(records) || !query) return records;
  
  // Check if records have matchScore (from our enhanced scoring system)
  const hasMatchScores = records.length > 0 && records[0].matchScore !== undefined;
  
  if (hasMatchScores) {
    // Use our enhanced scoring system - filter records with matchScore > 0
    const matchedRecords = records.filter(record => record.matchScore > 0);
    
    if (matchedRecords.length > 0) {
      // Return matched records (already sorted by score in the controller)
      const pageSize = 5;
      const page = parameters.page && Number(parameters.page) > 0 ? Number(parameters.page) : 1;
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      
      return matchedRecords.slice(startIndex, endIndex);
    }
  }
  
  // Fallback to old fuzzy search if no enhanced scores available
  const fuzzyResults = applyFuzzySearchToToolResult(records, query);
  const pageSize = 5;
  const page = parameters.page && Number(parameters.page) > 0 ? Number(parameters.page) : 1;
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  if (Array.isArray(fuzzyResults) && fuzzyResults.length > 0) return fuzzyResults.slice(startIndex, endIndex);
  
  // Si no hay coincidencias, devolver sugerencias con mensaje
  return {
    message: 'No encontramos propiedades exactas para tu búsqueda, pero aquí tienes algunas opciones que podrían interesarte:',
    sugerencias: records.slice(0, 5)
  };
}