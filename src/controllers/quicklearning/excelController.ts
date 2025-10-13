import { Request, Response } from "express";
import { getConnectionByCompanySlug } from "../../config/connectionManager";
import getRecordModel from "../../models/record.model";
import * as XLSX from 'xlsx';

/**
 * Descargar Excel con datos de prospectos de QuickLearning
 * GET /api/quicklearning/excel/prospectos
 */
export const downloadProspectosExcel = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('📊 Generando Excel de prospectos...');
    
    // Obtener conexión a la base de datos de QuickLearning
    const companyConn = await getConnectionByCompanySlug('quicklearning');
    const Record = getRecordModel(companyConn);
    
    // Obtener parámetros de consulta
    const { 
      startDate, 
      endDate, 
      medio, 
      campana,
      limit = 10000 
    } = req.query;
    
    // Construir filtros
    const filters: any = {
      tableSlug: 'prospectos',
      c_name: 'quicklearning',
      'data.number': { $exists: true, $nin: [null, ''] }
    };
    
    // Agregar filtro de fechas si se proporciona
    if (startDate || endDate) {
      const dateFilter: any = {};
      if (startDate) {
        dateFilter.$gte = new Date(startDate as string);
      }
      if (endDate) {
        dateFilter.$lte = new Date(endDate as string);
      }
      filters.createdAt = dateFilter;
    }
    
    // Agregar filtro de medio si se proporciona
    if (medio) {
      filters['data.medio'] = medio;
    }
    
    // Agregar filtro de campaña si se proporciona
    if (campana) {
      filters['data.campana'] = campana;
    }
    
    console.log('🔍 Filtros aplicados:', JSON.stringify(filters, null, 2));
    
    // Obtener prospectos
    const prospectos = await Record.find(filters)
      .select('data.number data.medio data.campana data.nombre createdAt updatedAt')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit as string))
      .lean();
    
    console.log(`📊 Total de prospectos encontrados: ${prospectos.length}`);
    
    // Preparar datos para Excel
    const excelData = prospectos.map((prospecto: any) => ({
      'Número': prospecto.data?.number || 'Sin número',
      'Medio': prospecto.data?.medio || 'No especificado',
      'Campaña': prospecto.data?.campana || 'No especificado',
      'Nombre': prospecto.data?.nombre || 'Sin nombre',
      'Fecha Creación': prospecto.createdAt ? new Date(prospecto.createdAt).toLocaleDateString('es-MX') : 'Sin fecha',
      'Fecha Actualización': prospecto.updatedAt ? new Date(prospecto.updatedAt).toLocaleDateString('es-MX') : 'Sin actualización'
    }));
    
    // Crear libro de trabajo
    const workbook = XLSX.utils.book_new();
    
    // Crear hoja de trabajo
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    
    // Configurar ancho de columnas
    const columnWidths = [
      { wch: 20 }, // Número
      { wch: 15 }, // Medio
      { wch: 20 }, // Campaña
      { wch: 25 }, // Nombre
      { wch: 15 }, // Fecha Creación
      { wch: 15 }  // Fecha Actualización
    ];
    worksheet['!cols'] = columnWidths;
    
    // Agregar hoja al libro
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Prospectos');
    
    // Generar buffer del archivo Excel
    const excelBuffer = XLSX.write(workbook, { 
      type: 'buffer', 
      bookType: 'xlsx',
      compression: true 
    });
    
    // Configurar headers para descarga
    const filename = `prospectos-quicklearning-${new Date().toISOString().split('T')[0]}.xlsx`;
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', excelBuffer.length);
    
    // Enviar archivo
    res.send(excelBuffer);
    
    console.log(`✅ Excel generado exitosamente: ${filename} (${prospectos.length} registros)`);
    
  } catch (error) {
    console.error('❌ Error generando Excel:', error);
    res.status(500).json({
      success: false,
      message: 'Error generando archivo Excel',
      error: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
};

/**
 * Obtener estadísticas de prospectos para dashboard
 * GET /api/quicklearning/excel/stats
 */
export const getProspectosStats = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('📊 Obteniendo estadísticas de prospectos...');
    
    // Obtener conexión a la base de datos de QuickLearning
    const companyConn = await getConnectionByCompanySlug('quicklearning');
    const Record = getRecordModel(companyConn);
    
    // Obtener parámetros de consulta
    const { 
      startDate, 
      endDate 
    } = req.query;
    
    // Construir filtros
    const filters: any = {
      tableSlug: 'prospectos',
      c_name: 'quicklearning',
      'data.number': { $exists: true, $nin: [null, ''] }
    };
    
    // Agregar filtro de fechas si se proporciona
    if (startDate || endDate) {
      const dateFilter: any = {};
      if (startDate) {
        dateFilter.$gte = new Date(startDate as string);
      }
      if (endDate) {
        dateFilter.$lte = new Date(endDate as string);
      }
      filters.createdAt = dateFilter;
    }
    
    // Obtener prospectos
    const prospectos = await Record.find(filters)
      .select('data.medio data.campana createdAt')
      .lean();
    
    // Calcular estadísticas
    const totalProspectos = prospectos.length;
    
    // Estadísticas por medio
    const statsByMedio: { [key: string]: number } = {};
    const statsByCampana: { [key: string]: number } = {};
    const statsByMes: { [key: string]: number } = {};
    
    prospectos.forEach((prospecto: any) => {
      const medio = prospecto.data?.medio || 'No especificado';
      const campana = prospecto.data?.campana || 'No especificado';
      const mes = new Date(prospecto.createdAt).toLocaleDateString('es-MX', { 
        year: 'numeric', 
        month: 'long' 
      });
      
      statsByMedio[medio] = (statsByMedio[medio] || 0) + 1;
      statsByCampana[campana] = (statsByCampana[campana] || 0) + 1;
      statsByMes[mes] = (statsByMes[mes] || 0) + 1;
    });
    
    // Ordenar estadísticas
    const sortedStatsByMedio = Object.entries(statsByMedio)
      .sort(([,a], [,b]) => b - a)
      .map(([medio, count]) => ({ medio, count, percentage: ((count / totalProspectos) * 100).toFixed(1) }));
    
    const sortedStatsByCampana = Object.entries(statsByCampana)
      .sort(([,a], [,b]) => b - a)
      .map(([campana, count]) => ({ campana, count, percentage: ((count / totalProspectos) * 100).toFixed(1) }));
    
    const sortedStatsByMes = Object.entries(statsByMes)
      .sort(([,a], [,b]) => b - a)
      .map(([mes, count]) => ({ mes, count, percentage: ((count / totalProspectos) * 100).toFixed(1) }));
    
    res.json({
      success: true,
      data: {
        totalProspectos,
        porMedio: sortedStatsByMedio,
        porCampana: sortedStatsByCampana,
        porMes: sortedStatsByMes,
        fechaGeneracion: new Date().toISOString()
      }
    });
    
    console.log(`✅ Estadísticas generadas: ${totalProspectos} prospectos`);
    
  } catch (error) {
    console.error('❌ Error obteniendo estadísticas:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo estadísticas',
      error: error instanceof Error ? error.message : 'Error desconocido'
    });
  }
};