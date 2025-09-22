import { BaseAgent } from './BaseAgent';
import { GeneralAgent } from './GeneralAgent';

export class AgentManager {
  private static instance: AgentManager;
  // Almacena agente y fecha de último uso
  private agents: Map<string, { agent: BaseAgent; lastUsed: number }> = new Map();

  private constructor() {}

  public static getInstance(): AgentManager {
    if (!AgentManager.instance) {
      AgentManager.instance = new AgentManager();
    }
    return AgentManager.instance;
  }

  /**
   * Get or create an agent for a specific company
   * Change the company name to the company name in the database
   */
  public async getAgent(company: string, agentContext: Record<string, any> = {}): Promise<BaseAgent> {
    const agentKey = `${company}:${agentContext.sessionId || ''}:${agentContext.phoneUser || ''}`;
    if (this.agents.has(agentKey)) {
      // Actualiza la fecha de último uso
      const entry = this.agents.get(agentKey)!;
      entry.lastUsed = Date.now();
      return entry.agent;
    }

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
  // Limpia agentes inactivos según el TTL (en milisegundos)
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
      const result = await agent.processMessage(message, context);
      return result;
    } catch (error) {
      // console.error(`❌ Error processing message for ${company}:`, error);
      console.error(`❌ Error details:`, error.message);
      throw error;
    }
  }

  /**
   * Get all registered companies
   */
  public getRegisteredCompanies(): string[] {
    return Array.from(this.agents.keys());
  }

  /**
   * Remove an agent (useful for testing or reconfiguration)
   */
  public removeAgent(key: string): void {
    this.agents.delete(key);
    console.log(`🗑️ Agent removed: ${key}`);
  }

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
}