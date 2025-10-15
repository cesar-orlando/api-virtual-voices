import { Request, Response } from 'express';
import {
  checkAndReactivateBots,
  getReactivationStatus,
  manuallyReactivateBot
} from '../services/internal/botAutoReactivation.service';
import getRecordModel from '../models/record.model';
import { getConnectionByCompanySlug } from '../config/connectionManager';

/**
 * Manually run bot reactivation check
 * GET /api/bot-reactivation/check/:c_name?dryRun=true
 */
export const runReactivationCheck = async (req: Request, res: Response) => {
  const { c_name } = req.params;
  const { dryRun = 'false' } = req.query;

  try {
    const isDryRun = String(dryRun).toLowerCase() === 'true';
    
    const stats = await checkAndReactivateBots(c_name, isDryRun);

    res.status(200).json({
      success: true,
      message: isDryRun ? 'Dry run completed' : 'Reactivation check completed',
      data: {
        company: c_name,
        dryRun: isDryRun,
        stats: {
          totalChecked: stats.totalChecked,
          reactivated: stats.reactivated,
          failed: stats.failed
        },
        results: stats.results,
        errors: stats.errors
      }
    });
  } catch (error) {
    console.error('❌ Error running reactivation check:', error);
    res.status(500).json({
      success: false,
      message: 'Error running reactivation check',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get bot reactivation status for a specific prospect by phone number
 * GET /api/bot-reactivation/status/:c_name/:phoneNumber
 */
export const getBotReactivationStatus = async (req: Request, res: Response) => {
  const { c_name, phoneNumber } = req.params;

  try {
    const status = await getReactivationStatus(phoneNumber, c_name);

    if (!status) {
      res.status(404).json({
        success: false,
        message: 'Prospect not found'
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        phoneNumber,
        company: c_name,
        ...status
      }
    });
  } catch (error) {
    console.error('❌ Error getting reactivation status:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting reactivation status',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Manually reactivate bot for a specific prospect
 * POST /api/bot-reactivation/reactivate/:c_name/:recordId
 * Body: { updatedBy: string }
 */
export const reactivateBot = async (req: Request, res: Response) => {
  const { c_name, recordId } = req.params;
  const { updatedBy = 'manual-api-reactivation' } = req.body;

  try {
    const result = await manuallyReactivateBot(recordId, c_name, updatedBy);

    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'Bot reactivated successfully',
        data: { recordId, company: c_name }
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Failed to reactivate bot',
        error: result.error
      });
    }
  } catch (error) {
    console.error('❌ Error reactivating bot:', error);
    res.status(500).json({
      success: false,
      message: 'Error reactivating bot',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Update auto-reactivation settings for a specific prospect
 * PUT /api/bot-reactivation/settings/:c_name/:recordId
 * Body: { autoReactivationEnabled?: boolean, inactivityThreshold?: number }
 */
export const updateReactivationSettings = async (req: Request, res: Response) => {
  const { c_name, recordId } = req.params;
  const { autoReactivationEnabled, inactivityThreshold } = req.body;

  try {
    const conn = await getConnectionByCompanySlug(c_name);
    const Record = getRecordModel(conn);

    const updateFields: any = {};
    if (typeof autoReactivationEnabled === 'boolean') {
      updateFields['data.autoReactivationEnabled'] = autoReactivationEnabled;
    }
    if (typeof inactivityThreshold === 'number' && inactivityThreshold > 0) {
      updateFields['data.inactivityThreshold'] = inactivityThreshold;
    }

    if (Object.keys(updateFields).length === 0) {
      res.status(400).json({
        success: false,
        message: 'No valid settings provided'
      });
      return;
    }

    updateFields.updatedBy = 'reactivation-settings-update';

    const result = await Record.updateOne(
      { _id: recordId },
      { $set: updateFields }
    );

    if (result.modifiedCount > 0) {
      res.status(200).json({
        success: true,
        message: 'Settings updated successfully',
        data: {
          recordId,
          company: c_name,
          updated: updateFields
        }
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Record not found or no changes made'
      });
    }
  } catch (error) {
    console.error('❌ Error updating settings:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating settings',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
