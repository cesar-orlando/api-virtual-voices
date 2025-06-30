import { getDbConnection } from '../../config/connectionManager';
import { getCustomConfig } from '../../shared/projectManager';

// Utilidades específicas para Quick Learning
export class QuickLearningUtils {
  private companySlug: string;

  constructor(companySlug: string) {
    this.companySlug = companySlug;
  }

  // Asignar prospecto automáticamente al mejor asesor disponible
  async assignProspectToBestAdvisor(prospectType: string, phoneNumber: string): Promise<any> {
    try {
      const conn = await getDbConnection(this.companySlug);
      
      // Obtener configuración de asignación automática
      const config = getCustomConfig(this.companySlug, 'flujoProspectos');
      if (!config?.asignacionAutomatica) {
        return null;
      }

      // Buscar asesores disponibles según el criterio
      const advisors = await this.getAvailableAdvisors(config.criterioAsignacion);
      
      if (advisors.length === 0) {
        console.log('No hay asesores disponibles para asignación automática');
        return null;
      }

      // Seleccionar el mejor asesor según el criterio
      const bestAdvisor = this.selectBestAdvisor(advisors, config.criterioAsignacion);
      
      // Crear registro de asignación
      const assignment = {
        prospectPhone: phoneNumber,
        advisorId: bestAdvisor.id,
        advisorName: bestAdvisor.name,
        prospectType,
        assignedAt: new Date(),
        priority: this.getPriority(prospectType)
      };

      console.log(`Prospecto asignado automáticamente: ${phoneNumber} -> ${bestAdvisor.name}`);
      return assignment;

    } catch (error) {
      console.error('Error en asignación automática:', error);
      return null;
    }
  }

  // Obtener asesores disponibles
  private async getAvailableAdvisors(criteria: string): Promise<any[]> {
    // Por ahora retornamos una lista mock
    // En implementación real, consultarías la base de datos
    return [
      { id: '1', name: 'Ana García', ventas: 15, tiempoRespuesta: 2.5, disponible: true },
      { id: '2', name: 'Carlos López', ventas: 12, tiempoRespuesta: 3.1, disponible: true },
      { id: '3', name: 'María Rodríguez', ventas: 18, tiempoRespuesta: 2.8, disponible: true }
    ];
  }

  // Seleccionar el mejor asesor según criterio
  private selectBestAdvisor(advisors: any[], criteria: string): any {
    if (criteria === 'mayor índice de ventas') {
      return advisors.sort((a, b) => b.ventas - a.ventas)[0];
    } else if (criteria === 'menor tiempo de respuesta') {
      return advisors.sort((a, b) => a.tiempoRespuesta - b.tiempoRespuesta)[0];
    }
    
    // Por defecto, seleccionar aleatoriamente
    return advisors[Math.floor(Math.random() * advisors.length)];
  }

  // Obtener prioridad del tipo de prospecto
  private getPriority(prospectType: string): number {
    switch (prospectType) {
      case 'inscriptos':
        return 1; // Máxima prioridad
      case 'sinRespuesta':
        return 2; // Prioridad media
      case 'noProspectos':
        return 3; // Baja prioridad
      default:
        return 2;
    }
  }

  // Mover prospecto a tabla específica
  async moveProspectToTable(phoneNumber: string, destinationTable: string): Promise<boolean> {
    try {
      const conn = await getDbConnection(this.companySlug);
      
      // Aquí implementarías la lógica para mover el prospecto
      // Por ahora solo logueamos la acción
      console.log(`Prospecto ${phoneNumber} movido a tabla: ${destinationTable}`);
      
      return true;
    } catch (error) {
      console.error('Error moviendo prospecto:', error);
      return false;
    }
  }

  // Generar reporte de prospectos por tipo
  async generateProspectsReport(): Promise<any> {
    try {
      const conn = await getDbConnection(this.companySlug);
      
      // Mock de datos para el reporte
      const report = {
        fecha: new Date(),
        totalProspectos: 150,
        porTipo: {
          inscriptos: 45,
          sinRespuesta: 78,
          noProspectos: 27
        },
        asignacionesAutomaticas: 23,
        conversionRate: 0.30
      };

      return report;
    } catch (error) {
      console.error('Error generando reporte:', error);
      return null;
    }
  }

  // Validar número de teléfono para Quick Learning
  validatePhoneNumber(phone: string): boolean {
    // Validación específica para México (Quick Learning)
    const mexicanPhoneRegex = /^(\+52|52)?[1-9][0-9]{9}$/;
    return mexicanPhoneRegex.test(phone.replace(/\s/g, ''));
  }

  // Formatear número de teléfono para Quick Learning
  formatPhoneNumber(phone: string): string {
    const cleaned = phone.replace(/\D/g, '');
    
    if (cleaned.length === 10) {
      return `+52${cleaned}`;
    } else if (cleaned.length === 12 && cleaned.startsWith('52')) {
      return `+${cleaned}`;
    }
    
    return phone; // Retornar original si no se puede formatear
  }

  // Obtener configuración de horarios de Quick Learning
  getBusinessHours(): any {
    return {
      lunes: { inicio: '09:00', fin: '18:00' },
      martes: { inicio: '09:00', fin: '18:00' },
      miercoles: { inicio: '09:00', fin: '18:00' },
      jueves: { inicio: '09:00', fin: '18:00' },
      viernes: { inicio: '09:00', fin: '18:00' },
      sabado: { inicio: '09:00', fin: '14:00' },
      domingo: { inicio: 'cerrado', fin: 'cerrado' }
    };
  }

  // Verificar si es horario de atención
  isBusinessHours(): boolean {
    const now = new Date();
    const day = now.toLocaleDateString('es-ES', { weekday: 'long' });
    const time = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    
    const hours = this.getBusinessHours();
    const todayHours = hours[day];
    
    if (!todayHours || todayHours.inicio === 'cerrado') {
      return false;
    }
    
    return time >= todayHours.inicio && time <= todayHours.fin;
  }
} 