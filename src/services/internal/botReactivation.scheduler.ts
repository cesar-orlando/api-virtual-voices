import * as cron from 'node-cron';
import { checkAndReactivateBots } from './botAutoReactivation.service';

/**
 * Bot Auto-Reactivation Scheduler
 * 
 * Runs periodically to check for inactive conversations and reactivate bots
 * Default: Every 15 minutes
 */

const CRON_SCHEDULE = process.env.BOT_REACTIVATION_CRON || '*/15 * * * *'; // Every 15 minutes
const ENABLED = process.env.BOT_REACTIVATION_ENABLED !== 'false'; // Enabled by default

let scheduledTask: ReturnType<typeof cron.schedule> | null = null;

/**
 * Start the auto-reactivation scheduler
 */
export function startBotReactivationScheduler(): void {
  if (!ENABLED) {
    console.log('🚫 Bot auto-reactivation scheduler is disabled');
    return;
  }

  if (scheduledTask) {
    console.log('⚠️  Bot auto-reactivation scheduler is already running');
    return;
  }

  console.log(`🤖 Starting bot auto-reactivation scheduler (${CRON_SCHEDULE})`);

  scheduledTask = cron.schedule(CRON_SCHEDULE, async () => {
    const startTime = new Date();
    console.log(`\n⏰ Running bot auto-reactivation check at ${startTime.toISOString()}`);

    try {
      // Get list of companies to process
      // You can customize this based on your multi-tenant setup
      const companies = getActiveCompanies();

      for (const c_name of companies) {
        try {
          console.log(`\n📋 Processing ${c_name}...`);
          const stats = await checkAndReactivateBots(c_name, false);

          console.log(`✅ ${c_name} completed:`);
          console.log(`   - Checked: ${stats.totalChecked} chats`);
          console.log(`   - Reactivated: ${stats.reactivated} bots`);
          console.log(`   - Failed: ${stats.failed} errors`);

          if (stats.errors.length > 0) {
            console.log(`   - Errors:`);
            stats.errors.forEach(err => {
              console.log(`     • ${err.number}: ${err.error}`);
            });
          }
        } catch (companyError) {
          console.error(`❌ Error processing ${c_name}:`, companyError);
        }
      }

      const endTime = new Date();
      const duration = (endTime.getTime() - startTime.getTime()) / 1000;
      console.log(`\n✅ Bot reactivation check completed in ${duration.toFixed(2)}s\n`);
    } catch (error) {
      console.error('❌ Fatal error in bot reactivation scheduler:', error);
    }
  });

  console.log('✅ Bot auto-reactivation scheduler started successfully');
}

/**
 * Stop the auto-reactivation scheduler
 */
export function stopBotReactivationScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log('🛑 Bot auto-reactivation scheduler stopped');
  }
}

/**
 * Get list of active companies to process
 * Customize this based on your setup
 */
function getActiveCompanies(): string[] {
  // Option 1: From environment variable
  const companiesEnv = process.env.AUTO_REACTIVATION_COMPANIES;
  if (companiesEnv) {
    return companiesEnv.split(',').map(c => c.trim());
  }

  // Option 2: Hardcoded list (update as needed)
  return [
    'quicklearning',
    // Add more companies here
  ];
}

/**
 * Run scheduler once manually (for testing)
 */
export async function runBotReactivationOnce(c_name: string, dryRun: boolean = false): Promise<void> {
  console.log(`🧪 Running bot reactivation check manually for ${c_name} (dryRun: ${dryRun})`);
  
  try {
    const stats = await checkAndReactivateBots(c_name, dryRun);

    console.log(`\n📊 Results for ${c_name}:`);
    console.log(`   - Checked: ${stats.totalChecked} chats`);
    console.log(`   - Reactivated: ${stats.reactivated} bots`);
    console.log(`   - Failed: ${stats.failed} errors`);

    if (stats.results.length > 0) {
      console.log(`\n📝 Reactivated prospects:`);
      stats.results.forEach(result => {
        console.log(`   • ${result.number}: inactive for ${result.inactiveMinutes} minutes, success: ${result.success}`);
      });
    }

    if (stats.errors.length > 0) {
      console.log(`\n❌ Errors:`);
      stats.errors.forEach(err => {
        console.log(`   • ${err.number}: ${err.error}`);
      });
    }
  } catch (error) {
    console.error('❌ Error running bot reactivation:', error);
    throw error;
  }
}
