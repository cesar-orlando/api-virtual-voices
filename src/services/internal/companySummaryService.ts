import { GeneralAgent } from '../agents/GeneralAgent';
import { getAllDbNames } from '../../config/database';

/**
 * Enhanced service for managing company-wide conversation summaries
 * Works alongside BaseAgent to provide superior business intelligence
 * Uses direct OpenAI calls for better quality and performance
 */
export class CompanySummaryService {

  public static async updateCompanySummary(companyName: string): Promise<boolean> {
    let agent: GeneralAgent | null = null;
    
    try {

      const agentContext = { sessionId: 'company_summary_update', phoneUser: null };

      agent = new GeneralAgent(companyName, agentContext);

      await agent.initialize();

      await agent.updateCompanySummary();

      return true;
    } catch (error) {
      console.error(`❌ Error updating company summary for ${companyName}:`, error);
      return false;
    } finally {
      // Clean up agent instance to free memory
      if (agent) {
        agent = null;
      }
    }
  }

  public static async updateAllCompanySummaries(): Promise<{ success: string[], failed: string[] }> {
    const results = { success: [] as string[], failed: [] as string[] };
    
    try {
      const companies = await getAllDbNames();
      
      console.log(`🚀 Starting company analysis for ${companies.length} companies...`);
      
      for (const companyName of companies) {
        const success = await this.updateCompanySummary(companyName);
        if (success) {
          results.success.push(companyName);
        } else {
          results.failed.push(companyName);
        }
        
        // Brief delay between companies
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
    } catch (error) {
      console.error(`❌ Error updating all company summaries:`, error);
    }
    
    return results;
  }

  /**
   * Schedule automatic company summary updates
   */
  public static async scheduleAutomaticUpdates(): Promise<void> {
    // Analysis every 6 hours (to allow for deeper processing)
    const updateInterval = 6 * 60 * 60 * 1000; // 6 hours in milliseconds

    await this.updateAllCompanySummaries();
    
    setInterval(async () => {
      const result = await this.updateAllCompanySummaries();
    }, updateInterval);

  }

  /**
   * Force immediate analysis for specific company
   */
  public static async forceUpdate(companyName: string): Promise<boolean> {
    console.log(`🚀 Force enhanced analysis for: ${companyName}`);
    return await this.updateCompanySummary(companyName);
  }
}