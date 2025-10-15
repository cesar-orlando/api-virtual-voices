import { getConnectionByCompanySlug } from '../../config/connectionManager';
import getRecordModel from '../../models/record.model';

/**
 * Auto-Reactivation Bot Service
 * 
 * Automatically reactivates the AI bot for prospects (DynamicRecords) that have been 
 * transferred to human advisors after a period of inactivity.
 * 
 * Business Logic:
 * 1. Bot state controlled by data.ia field in prospectos table
 * 2. When data.ia = false (bot deactivated), track deactivation time in data.iaDeactivatedAt
 * 3. Monitor last message timestamp (data.lastmessagedate)
 * 4. After inactivity threshold (default 60 minutes), reactivate bot (data.ia = true)
 * 
 * Key Fields in DynamicRecord (tableSlug: 'prospectos'):
 * - data.ia: boolean - Controls if bot is active for this prospect
 * - data.iaDeactivatedAt: Date - Timestamp when bot was deactivated
 * - data.lastmessagedate: Date - Timestamp of last message in conversation
 * - data.inactivityThreshold: number - Minutes of inactivity before auto-reactivation (default 60)
 * - data.autoReactivationEnabled: boolean - Toggle auto-reactivation per prospect (default true)
 * - data.asesor: { id, name } - Assigned human advisor
 * - data.number: number - WhatsApp number identifier
 */

interface ReactivationResult {
  recordId: string;
  number: string;
  reactivatedAt: Date;
  inactiveMinutes: number;
  success: boolean;
  error?: string;
}

interface ReactivationStats {
  totalChecked: number;
  reactivated: number;
  failed: number;
  results: ReactivationResult[];
  errors: Array<{ number: string; error: string }>;
}

/**
 * Check and reactivate bots for inactive prospects
 * @param c_name Company slug
 * @param dryRun If true, only simulate without making changes
 * @returns Statistics about the reactivation process
 */
export async function checkAndReactivateBots(
  c_name: string,
  dryRun: boolean = false
): Promise<ReactivationStats> {
  const stats: ReactivationStats = {
    totalChecked: 0,
    reactivated: 0,
    failed: 0,
    results: [],
    errors: []
  };

  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const Record = getRecordModel(conn);

    // Find prospects where:
    // 1. Bot is deactivated (data.ia = false)
    // 2. Auto-reactivation is enabled or not explicitly disabled
    // 3. Has deactivation tracking timestamp
    const deactivatedProspects = await Record.find({
      tableSlug: 'prospectos',
      'data.ia': false,
      'data.iaDeactivatedAt': { $exists: true },
      $or: [
        { 'data.autoReactivationEnabled': { $exists: false } }, // Default to enabled
        { 'data.autoReactivationEnabled': true }
      ]
    });

    stats.totalChecked = deactivatedProspects.length;
    console.log(`🔍 [Bot Reactivation] Checking ${stats.totalChecked} deactivated prospects for ${c_name}...`);

    for (const prospecto of deactivatedProspects) {
      const number = prospecto.data.number?.toString() || 'unknown';
      
      try {
        // Get inactivity threshold (default 60 minutes)
        const thresholdMinutes = prospecto.data.inactivityThreshold || 60;
        const deactivatedAt = new Date(prospecto.data.iaDeactivatedAt);
        
        // Determine last activity time (most recent of: deactivation or last message)
        let lastActivityTime = deactivatedAt;
        if (prospecto.data.lastmessagedate) {
          const lastMessageDate = new Date(prospecto.data.lastmessagedate);
          if (lastMessageDate > lastActivityTime) {
            lastActivityTime = lastMessageDate;
          }
        }

        // Calculate inactive time in minutes
        const now = new Date();
        const inactiveMs = now.getTime() - lastActivityTime.getTime();
        const inactiveMinutes = Math.floor(inactiveMs / (1000 * 60));

        // Check if threshold exceeded
        if (inactiveMinutes >= thresholdMinutes) {
          console.log(`✅ [Bot Reactivation] Prospect ${number}: ${inactiveMinutes}min inactive (threshold: ${thresholdMinutes}min)`);

          if (!dryRun) {
            // Reactivate bot
            const updateResult = await Record.updateOne(
              { _id: prospecto._id },
              {
                $set: {
                  'data.ia': true,
                  updatedBy: 'bot-auto-reactivation'
                },
                $unset: {
                  'data.iaDeactivatedAt': '' // Remove tracking field
                }
              }
            );

            const success = updateResult.modifiedCount > 0;
            
            if (success) {
              console.log(`✅ [Bot Reactivation] Successfully reactivated bot for ${number}`);
              stats.reactivated++;
            } else {
              console.warn(`⚠️ [Bot Reactivation] Failed to update record for ${number}`);
              stats.failed++;
              stats.errors.push({ number, error: 'Update returned 0 modified count' });
            }

            stats.results.push({
              recordId: prospecto._id.toString(),
              number,
              reactivatedAt: now,
              inactiveMinutes,
              success,
              error: success ? undefined : 'Update failed'
            });
          } else {
            // Dry run mode
            console.log(`[DRY RUN] Would reactivate bot for ${number} (${inactiveMinutes}min inactive)`);
            stats.reactivated++;
            stats.results.push({
              recordId: prospecto._id.toString(),
              number,
              reactivatedAt: now,
              inactiveMinutes,
              success: true
            });
          }
        } else {
          const remainingMinutes = thresholdMinutes - inactiveMinutes;
          console.log(`⏳ [Bot Reactivation] Prospect ${number}: ${inactiveMinutes}min inactive, needs ${remainingMinutes}min more`);
        }

      } catch (error: any) {
        console.error(`❌ [Bot Reactivation] Error processing prospect ${number}:`, error);
        stats.failed++;
        stats.errors.push({ number, error: error.message });
      }
    }

    console.log(`✅ [Bot Reactivation] Completed for ${c_name}: ${stats.reactivated} reactivated, ${stats.failed} failed`);

  } catch (error: any) {
    console.error(`❌ [Bot Reactivation] Fatal error for ${c_name}:`, error);
    stats.errors.push({ number: 'SYSTEM', error: error.message });
  }

  return stats;
}

/**
 * Track bot deactivation when transferring to human advisor
 * Call this when setting data.ia = false
 * 
 * @param recordId DynamicRecord _id
 * @param c_name Company slug
 * @param options Configuration options
 */
export async function trackBotDeactivation(
  recordId: string,
  c_name: string,
  options?: {
    inactivityThreshold?: number; // Minutes (default 60)
    autoReactivationEnabled?: boolean; // Default true
  }
): Promise<void> {
  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const Record = getRecordModel(conn);

    await Record.updateOne(
      { _id: recordId },
      {
        $set: {
          'data.iaDeactivatedAt': new Date(),
          'data.inactivityThreshold': options?.inactivityThreshold || 60,
          'data.autoReactivationEnabled': options?.autoReactivationEnabled !== false,
          updatedBy: 'bot-deactivation-tracker'
        }
      }
    );

    console.log(`📝 [Bot Reactivation] Tracked deactivation for record ${recordId}`);
  } catch (error) {
    console.error(`❌ [Bot Reactivation] Failed to track deactivation:`, error);
  }
}

/**
 * Update last message timestamp to reset inactivity timer
 * Call this on every incoming/outgoing message
 * 
 * @param phoneNumber Prospect phone number
 * @param c_name Company slug
 */
export async function updateLastMessageTimestamp(
  phoneNumber: string | number,
  c_name: string
): Promise<void> {
  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const Record = getRecordModel(conn);

    await Record.updateOne(
      {
        tableSlug: 'prospectos',
        'data.number': phoneNumber
      },
      {
        $set: {
          'data.lastmessagedate': new Date()
        }
      }
    );

    // Note: Silent update, no console log to avoid spam
  } catch (error) {
    console.error(`❌ [Bot Reactivation] Failed to update last message timestamp:`, error);
  }
}

/**
 * Manually reactivate bot and cancel auto-reactivation tracking
 * 
 * @param recordId DynamicRecord _id
 * @param c_name Company slug
 * @param updatedBy User who triggered manual reactivation
 */
export async function manuallyReactivateBot(
  recordId: string,
  c_name: string,
  updatedBy: string = 'manual-reactivation'
): Promise<{ success: boolean; error?: string }> {
  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const Record = getRecordModel(conn);

    const updateResult = await Record.updateOne(
      { _id: recordId },
      {
        $set: {
          'data.ia': true,
          updatedBy
        },
        $unset: {
          'data.iaDeactivatedAt': '',
          'data.inactivityThreshold': '',
          'data.autoReactivationEnabled': ''
        }
      }
    );

    if (updateResult.modifiedCount > 0) {
      console.log(`✅ [Bot Reactivation] Manually reactivated bot for record ${recordId}`);
      return { success: true };
    } else {
      console.warn(`⚠️ [Bot Reactivation] Manual reactivation found no record to update`);
      return { success: false, error: 'Record not found or already active' };
    }

  } catch (error: any) {
    console.error(`❌ [Bot Reactivation] Manual reactivation failed:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Get reactivation status for a specific prospect
 * 
 * @param phoneNumber Prospect phone number
 * @param c_name Company slug
 */
export async function getReactivationStatus(
  phoneNumber: string | number,
  c_name: string
): Promise<{
  botActive: boolean;
  deactivatedAt?: Date;
  lastMessageDate?: Date;
  inactiveMinutes?: number;
  thresholdMinutes?: number;
  minutesUntilReactivation?: number;
  autoReactivationEnabled?: boolean;
} | null> {
  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const Record = getRecordModel(conn);

    const prospecto = await Record.findOne({
      tableSlug: 'prospectos',
      'data.number': phoneNumber
    }).lean();

    if (!prospecto) {
      return null;
    }

    const botActive = prospecto.data.ia !== false;
    
    if (botActive) {
      return { botActive: true };
    }

    // Bot is deactivated, calculate inactivity
    const deactivatedAt = prospecto.data.iaDeactivatedAt ? new Date(prospecto.data.iaDeactivatedAt) : undefined;
    const lastMessageDate = prospecto.data.lastmessagedate ? new Date(prospecto.data.lastmessagedate) : undefined;
    
    let inactiveMinutes: number | undefined;
    let minutesUntilReactivation: number | undefined;
    
    if (deactivatedAt) {
      const lastActivity = lastMessageDate && lastMessageDate > deactivatedAt ? lastMessageDate : deactivatedAt;
      const now = new Date();
      inactiveMinutes = Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60));
      
      const thresholdMinutes = prospecto.data.inactivityThreshold || 60;
      minutesUntilReactivation = Math.max(0, thresholdMinutes - inactiveMinutes);
    }

    return {
      botActive: false,
      deactivatedAt,
      lastMessageDate,
      inactiveMinutes,
      thresholdMinutes: prospecto.data.inactivityThreshold || 60,
      minutesUntilReactivation,
      autoReactivationEnabled: prospecto.data.autoReactivationEnabled !== false
    };

  } catch (error) {
    console.error(`❌ [Bot Reactivation] Failed to get status:`, error);
    return null;
  }
}
