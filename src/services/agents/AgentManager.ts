import { BaseAgent } from './BaseAgent';
import { GeneralAgent } from './GeneralAgent';
import { MessageSchedulerService } from '../internal/messageSchedulerService';
import { getConnectionByCompanySlug } from '../../config/connectionManager';

export class AgentManager {
  private static instance: AgentManager;
  // Almacena agente y fecha de último uso
  private agents: Map<string, { agent: BaseAgent; lastUsed: number }> = new Map();
  private schedulerServices: Map<string, MessageSchedulerService> = new Map(); // Per-company scheduler services
  private isSchedulerRunning: boolean = false;

  private constructor() {}

  /**
   * Initialize the scheduler service for a specific company
   */
  private async initializeSchedulerService(company: string): Promise<MessageSchedulerService> {
    if (this.schedulerServices.has(company)) {
      return this.schedulerServices.get(company)!;
    }

    try {
      const schedulerService = new MessageSchedulerService(company);
      this.schedulerServices.set(company, schedulerService);
      
      // Auto-start the scheduler service when first initialized
      //schedulerService.start();
      console.log(`🚀 Auto-started scheduler service for ${company}`);
      
      // Mark global scheduler as running if not already
      if (!this.isSchedulerRunning) {
        this.isSchedulerRunning = true;
        console.log(`� Global scheduler status set to running`);
      }
      
      console.log(`✅ MessageSchedulerService initialized for ${company}`);
      return schedulerService;
    } catch (error) {
      console.error(`❌ Error initializing scheduler service for ${company}:`, error);
      throw error;
    }
  }

  public static getInstance(): AgentManager {
    if (!AgentManager.instance) {
      AgentManager.instance = new AgentManager();
    }
    return AgentManager.instance;
  }

  /**
   * Get or create an agent for a specific company
   * Uses database configuration to determine agent type
   */
  public async getAgent(company: string, agentContext: Record<string, any> = {}): Promise<BaseAgent> {
    const agentKey = `${company}:${agentContext.sessionId || ''}:${agentContext.phoneUser || ''}`;
    if (this.agents.has(agentKey)) {
      // Actualiza la fecha de último uso
      const entry = this.agents.get(agentKey)!;
      entry.lastUsed = Date.now();
      return entry.agent;
    }

    // Initialize scheduler service for this company
    const schedulerService = await this.initializeSchedulerService(company);

    let agent: BaseAgent;

    // Todas las empresas usan GeneralAgent para máxima flexibilidad
    try {
      agent = new GeneralAgent(company, agentContext);
      await agent.initialize();
      console.log(`🔧 AgentManager: GeneralAgent created successfully for ${company}`);
    } catch (error) {
      console.error(`❌ Error creating GeneralAgent for ${company}:`, error);
      throw error;
    }

    this.agents.set(agentKey, { agent, lastUsed: Date.now() });
    return agent;
  }

  /**
   * Limpia agentes inactivos según el TTL (en milisegundos)
   */
  public cleanupInactiveAgents(ttlMs: number = 1000 * 60 * 10): void { // 10 minutos por defecto
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.agents.entries()) {
      if (now - entry.lastUsed > ttlMs) {
        this.agents.delete(key);
        removed++;
      }
    }
    if (removed > 0) {
      console.log(`🧹 Limpieza automática: ${removed} agentes eliminados por inactividad.`);
    }
  }

  /**
   * Process a message using the appropriate company agent
   */
  public async processMessage(company: string, message: string, context?: any): Promise<string> {
    try {
      this.cleanupInactiveAgents();
      const agent = await this.getAgent(company, context);
      return await agent.processMessage(message, context);
    } catch (error) {
      console.error(`❌ Error processing message for ${company}:`, error);
      throw error;
    }
  }

  /**
   * Remove agent by key pattern 
   * This method is used for debugging and cleanup
   */
  public static removeAgentsForCompany(company: string): void {
    const manager = AgentManager.getInstance();
    let removed = 0;
    for (const key of Array.from(manager.agents.keys())) {
      if (key.startsWith(company + ':')) {
        manager.agents.delete(key);
        removed++;
      }
    }
    console.log(`🗑️ Agent(s) removed for company: ${company} (${removed} eliminados)`);
  }

  /**
   * Clear all agents
   */
  public clearAllAgents(): void {
    this.agents.clear();
    console.log('🗑️ All agents cleared');
  }

  /**
   * Start the message scheduler service for all companies
   */
  public startScheduler(): void {
    if (this.isSchedulerRunning) {
      console.log('📅 Scheduler is already running globally');
      return;
    }

    this.isSchedulerRunning = true;
    
    // Start all existing scheduler services
    for (const [company, schedulerService] of this.schedulerServices.entries()) {
      try {
        schedulerService.start();
        console.log(`📅 Started scheduler for ${company}`);
      } catch (error) {
        console.error(`❌ Error starting scheduler for ${company}:`, error);
      }
    }

    console.log(`📅 Global message scheduler started. Active services: ${this.schedulerServices.size}`);
  }

  /**
   * Stop the message scheduler service for all companies
   */
  public stopScheduler(): void {
    if (!this.isSchedulerRunning) {
      console.log('📅 Scheduler is not running');
      return;
    }

    this.isSchedulerRunning = false;

    // Stop all scheduler services
    for (const [company, schedulerService] of this.schedulerServices.entries()) {
      try {
        schedulerService.stop();
        console.log(`📅 Stopped scheduler for ${company}`);
      } catch (error) {
        console.error(`❌ Error stopping scheduler for ${company}:`, error);
      }
    }

    console.log('📅 Message scheduler stopped for all companies');
  }

  /**
   * Get scheduler service for a specific company
   */
  public getSchedulerService(company: string): MessageSchedulerService | null {
    return this.schedulerServices.get(company) || null;
  }

  /**
   * Get scheduler status for all companies
   */
  public async getSchedulerStatus(): Promise<{
    isRunning: boolean;
    companies: string[];
    totalServices: number;
    servicesStatus: { company: string; status: any }[];
  }> {
    const servicesStatus = [];
    
    for (const [company, schedulerService] of this.schedulerServices.entries()) {
      try {
        const status = await schedulerService.getScheduleStatus();
        servicesStatus.push({ company, status });
      } catch (error) {
        servicesStatus.push({ 
          company, 
          status: { error: error.message } 
        });
      }
    }

    return {
      isRunning: this.isSchedulerRunning,
      companies: Array.from(this.schedulerServices.keys()),
      totalServices: this.schedulerServices.size,
      servicesStatus
    };
  }
}