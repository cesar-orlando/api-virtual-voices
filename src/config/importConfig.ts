// Configuración para importaciones masivas
export const IMPORT_CONFIG = {
  // Límites de tamaño
  MAX_PAYLOAD_SIZE: '50mb',
  MAX_RECORDS_PER_BATCH: 5000,
  MAX_FILE_SIZE_MB: 50,
  
  // Timeouts
  IMPORT_TIMEOUT_MS: 300000, // 5 minutos
  
  // Configuraciones de validación
  VALIDATION_OPTIONS: {
    skipInvalidRecords: true,
    continueOnError: true,
    validateBeforeInsert: true
  },
  
  // Configuraciones de logging
  LOGGING: {
    logImportProgress: true,
    logValidationErrors: true,
    logPerformanceMetrics: true
  },
  
  // Configuraciones de rendimiento
  PERFORMANCE: {
    batchSize: 1000,
    concurrentBatches: 1,
    memoryLimit: '100mb'
  }
};

// Función para validar el tamaño de datos
export const validateImportSize = (contentLength: string | undefined, recordCount: number): { isValid: boolean; error?: string } => {
  if (!contentLength) {
    return { isValid: false, error: 'Content-Length header is required' };
  }
  
  const sizeInMB = parseInt(contentLength) / (1024 * 1024);
  const maxSizeMB = parseInt(IMPORT_CONFIG.MAX_FILE_SIZE_MB.toString());
  
  if (sizeInMB > maxSizeMB) {
    return { 
      isValid: false, 
      error: `File size (${sizeInMB.toFixed(2)}MB) exceeds maximum allowed size (${maxSizeMB}MB)` 
    };
  }
  
  if (recordCount > IMPORT_CONFIG.MAX_RECORDS_PER_BATCH) {
    return { 
      isValid: false, 
      error: `Record count (${recordCount}) exceeds maximum allowed per batch (${IMPORT_CONFIG.MAX_RECORDS_PER_BATCH})` 
    };
  }
  
  return { isValid: true };
};

// Función para calcular el tamaño estimado de datos
export const estimateDataSize = (records: any[]): number => {
  const sampleSize = Math.min(10, records.length);
  const sampleRecords = records.slice(0, sampleSize);
  
  const totalSampleSize = sampleRecords.reduce((total, record) => {
    return total + JSON.stringify(record).length;
  }, 0);
  
  const averageRecordSize = totalSampleSize / sampleSize;
  return Math.ceil(averageRecordSize * records.length);
};

// Función para dividir registros en lotes
export const splitRecordsIntoBatches = (records: any[], batchSize: number = IMPORT_CONFIG.PERFORMANCE.batchSize): any[][] => {
  const batches = [];
  for (let i = 0; i < records.length; i += batchSize) {
    batches.push(records.slice(i, i + batchSize));
  }
  return batches;
};

// Función para generar reporte de importación
export const generateImportReport = (totalRecords: number, successfulRecords: number, failedRecords: number, errors: any[]): any => {
  const successRate = totalRecords > 0 ? ((successfulRecords / totalRecords) * 100).toFixed(2) : '0.00';
  
  return {
    summary: {
      total: totalRecords,
      successful: successfulRecords,
      failed: failedRecords,
      successRate: `${successRate}%`
    },
    errors: errors.slice(0, 10), // Solo mostrar los primeros 10 errores
    recommendations: failedRecords > 0 ? [
      'Review the error details above',
      'Check data format and required fields',
      'Consider splitting data into smaller batches'
    ] : [
      'All records imported successfully!'
    ]
  };
}; 