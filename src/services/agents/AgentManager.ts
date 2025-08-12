import { BaseAgent } from './BaseAgent';
import { QuickLearningAgent } from './QuickLearningAgent';
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

    // Create company-specific agent
    console.log(`🔧 AgentManager: Creating agent for company: "${company}" (lowercase: "${company.toLowerCase()}")`);
    switch (company.toLowerCase()) {
      case 'quicklearning':
      case 'quick-learning':
        agent = new QuickLearningAgent(company);
        await agent.initialize();
        break;
      case 'grupokg':
      case 'grupo-kg':
      case 'grupo-milkasa':
      case 'britanicomx':
      case 'mitsubishi':
      case 'simple-green':
      case 'virtualvoices':
      case 'virtual-voices':
        console.log(`🔧 AgentManager: Creating GeneralAgent for ${company}`);
        try {
          agent = new GeneralAgent(company, agentContext);
          await agent.initialize();
          console.log(`🔧 AgentManager: GeneralAgent created successfully for ${company}`);
        } catch (error) {
          console.error(`❌ Error creating GeneralAgent for ${company}:`, error);
          throw error;
        }
        break;
      default:
        console.log(`❌ No matching case found for company: "${company}" (lowercase: "${company.toLowerCase()}")`);
        throw new Error(`❌ No agent configured for company: ${company}`);
    }

    this.agents.set(agentKey, { agent, lastUsed: Date.now() });
    console.log(`✅ Agent created for company: ${company}`);
    return agent;
  }
  // Limpia agentes inactivos según el TTL (en milisegundos)
  public cleanupInactiveAgents(ttlMs: number = 1000 * 60 * 30): void { // 30 minutos por defecto
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
      console.log(`🔧 AgentManager: Getting agent for ${company}`);
      const agent = await this.getAgent(company, context);
      console.log(`🔧 AgentManager: Agent obtained, processing message`);
      const result = await agent.processMessage(message, context);
      console.log(`🔧 AgentManager: Message processed successfully`);
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
  public removeAgent(company: string): void {
    // Elimina todos los agentes de la compañía
    let removed = 0;
    for (const key of Array.from(this.agents.keys())) {
      if (key.startsWith(company + ':')) {
        this.agents.delete(key);
        removed++;
      }
    }
    console.log(`🗑️ Agent(s) removed for company: ${company} (${removed} eliminados)`);
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