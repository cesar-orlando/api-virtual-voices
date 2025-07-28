import { BaseAgent } from './BaseAgent';
import { QuickLearningAgent } from './QuickLearningAgent';
import { GeneralAgent } from './GeneralAgent';

export class AgentManager {
  private static instance: AgentManager;
  private agents: Map<string, BaseAgent> = new Map();

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
  public async getAgent(company: string): Promise<BaseAgent> {
    if (this.agents.has(company)) {
      return this.agents.get(company)!;
    }

    let agent: BaseAgent;

                    // Create company-specific agent
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
                    console.log(`🔧 AgentManager: Creating GeneralAgent for ${company}`);
                    try {
                        agent = new GeneralAgent(company);
                        await agent.initialize();
                        console.log(`🔧 AgentManager: GeneralAgent created successfully for ${company}`);
                    } catch (error) {
                        console.error(`❌ Error creating GeneralAgent for ${company}:`, error);
                        throw error;
                    }
                    break;
                  default:
                    throw new Error(`❌ No agent configured for company: ${company}`);
                }

                this.agents.set(company, agent);
                console.log(`✅ Agent created for company: ${company}`);
    
    return agent;
  }

  /**
   * Process a message using the appropriate company agent
   */
  public async processMessage(company: string, message: string, context?: any): Promise<string> {
    try {
      console.log(`🔧 AgentManager: Getting agent for ${company}`);
      const agent = await this.getAgent(company);
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
    this.agents.delete(company);
    console.log(`🗑️ Agent removed for company: ${company}`);
  }

  /**
   * Clear all agents
   */
  public clearAllAgents(): void {
    this.agents.clear();
    console.log('🗑️ All agents cleared');
  }
} 