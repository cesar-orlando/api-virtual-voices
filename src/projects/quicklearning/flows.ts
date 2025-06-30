import { getCustomConfig } from '../../shared/projectManager';

// Flujo específico para Quick Learning
export class QuickLearningFlows {
  private companySlug: string;

  constructor(companySlug: string) {
    this.companySlug = companySlug;
  }

  // Flujo principal de prospectos
  async getProspectoFlow(message: string, chatHistory: any[]): Promise<string> {
    const config = getCustomConfig(this.companySlug, 'flujoProspectos');
    if (!config) {
      return this.getDefaultResponse();
    }

    // Analizar el mensaje para determinar el tipo de prospecto
    const prospectType = this.analyzeProspectType(message, chatHistory);
    
    switch (prospectType) {
      case 'sinRespuesta':
        return this.handleSinRespuesta(config);
      case 'inscriptos':
        return this.handleInscriptos(config);
      case 'noProspectos':
        return this.handleNoProspectos(config);
      default:
        return this.getDefaultResponse();
    }
  }

  // Analizar tipo de prospecto basado en el mensaje y historial
  private analyzeProspectType(message: string, chatHistory: any[]): string {
    const lowerMessage = message.toLowerCase();
    
    // Detectar desinterés explícito
    if (lowerMessage.includes('no me interesa') || 
        lowerMessage.includes('no quiero') ||
        lowerMessage.includes('estoy bromeando') ||
        lowerMessage.includes('es broma')) {
      return 'noProspectos';
    }

    // Detectar interés en inscripción/pago
    if (lowerMessage.includes('quiero inscribirme') ||
        lowerMessage.includes('cómo pago') ||
        lowerMessage.includes('tarjeta') ||
        lowerMessage.includes('transferencia') ||
        lowerMessage.includes('comprobante')) {
      return 'inscriptos';
    }

    // Detectar sin respuesta (basado en tiempo del último mensaje)
    const lastMessage = chatHistory[chatHistory.length - 1];
    if (lastMessage && this.isOldMessage(lastMessage.timestamp)) {
      return 'sinRespuesta';
    }

    return 'default';
  }

  // Verificar si un mensaje es antiguo (más de 3 días)
  private isOldMessage(timestamp: Date): boolean {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    return new Date(timestamp) < threeDaysAgo;
  }

  // Manejar prospectos sin respuesta
  private handleSinRespuesta(config: any): string {
    return `Entiendo que has estado ocupado. Te envío un recordatorio amigable sobre nuestros cursos de Quick Learning. 

¿Te gustaría que te contacte en un momento más conveniente o prefieres que te envíe información por WhatsApp?

${config.destino === 'tablaSinRespuesta' ? 'Te he movido a nuestra lista de seguimiento especial.' : ''}`;
  }

  // Manejar prospectos interesados en inscribirse
  private handleInscriptos(config: any): string {
    return `¡Excelente decisión! 🎉 

Para completar tu inscripción en Quick Learning, puedes:

1. **Pago con tarjeta**: Te envío el enlace seguro
2. **Transferencia bancaria**: Te proporciono los datos
3. **Pago en efectivo**: Coordinamos la entrega

¿Cuál método prefieres? También puedes enviarme el comprobante de pago cuando lo tengas listo.

${config.destino === 'tablaInscriptos' ? 'Te he movido a nuestra lista de inscripciones.' : ''}`;
  }

  // Manejar prospectos no interesados
  private handleNoProspectos(config: any): string {
    return `Entiendo perfectamente. No hay problema en absoluto.

Si en el futuro cambias de opinión o conoces a alguien que pueda estar interesado en nuestros cursos de Quick Learning, no dudes en contactarnos.

¡Que tengas un excelente día! 😊

${config.destino === 'tablaNoProspectos' ? 'Te he removido de nuestra lista de prospectos activos.' : ''}`;
  }

  // Respuesta por defecto
  private getDefaultResponse(): string {
    return `¡Hola! Soy el asistente virtual de Quick Learning. 

Estamos aquí para ayudarte con:
• Información sobre nuestros cursos
• Proceso de inscripción
• Horarios y modalidades
• Cualquier duda que tengas

¿En qué puedo ayudarte hoy? 😊`;
  }

  // Flujo de asignación automática
  async getAutoAssignmentFlow(prospectType: string): Promise<any | null> {
    const config = getCustomConfig(this.companySlug, 'flujoProspectos');
    if (!config?.asignacionAutomatica) {
      return null;
    }

    return {
      tipo: prospectType,
      criterio: config.criterioAsignacion,
      prioridad: this.getPriority(prospectType),
      timestamp: new Date()
    };
  }

  // Obtener prioridad basada en el tipo de prospecto
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

  // Flujo de control de minutos
  async getMinutosFlow(userId: string, minutos: number): Promise<string | null> {
    const config = getCustomConfig(this.companySlug, 'controlMinutos');
    if (!config) {
      return null;
    }

    if (minutos > 60) {
      return `⚠️ Has acumulado ${minutos} minutos de actividad. Te recomendamos tomar un descanso breve para mantener tu productividad.`;
    }

    return null; // No hay alerta necesaria
  }
} 