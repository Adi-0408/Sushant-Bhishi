import { AutoBackupConfig, LocalBackupSnapshot, SystemBackupData } from '../types';
import { StorageService } from './db';

const BACKUP_STORAGE_KEYS = {
  CONFIG: 'sb_auto_backup_config',
  SNAPSHOTS: 'sb_local_backup_snapshots',
};

export const DEFAULT_DRIVE_WEBHOOK_URL =
  'https://script.google.com/macros/s/AKfycbzzOpsGVm-NuTwdQapw0OcOx9O64mALEAEzX3z1_wZ_rb12zmtDd98-IO97wE2PMSCK/exec';

const DEFAULT_CONFIG: AutoBackupConfig = {
  enabled: true,
  intervalDays: 1, // Daily backup
  backupHour: 23, // 11:00 PM
  backupMinute: 0,
  lastBackupTimestamp: 0,
  driveBackupEnabled: true,
  driveWebhookUrl: DEFAULT_DRIVE_WEBHOOK_URL,
  lastDriveBackupTimestamp: 0,
};

export const AutoBackupService = {
  // Get Auto Backup Settings
  getConfig: (): AutoBackupConfig => {
    try {
      const raw = localStorage.getItem(BACKUP_STORAGE_KEYS.CONFIG);
      if (!raw) return DEFAULT_CONFIG;
      const parsed = JSON.parse(raw);
      const config: AutoBackupConfig = { ...DEFAULT_CONFIG, ...parsed };
      // Migrate existing 2-day configurations to daily at 11:00 PM
      if (config.backupHour === undefined) config.backupHour = 23;
      if (config.backupMinute === undefined) config.backupMinute = 0;
      if (parsed.intervalDays === 2 || !parsed.intervalDays) config.intervalDays = 1;
      return config;
    } catch {
      return DEFAULT_CONFIG;
    }
  },

  // Save Auto Backup Settings
  saveConfig: (config: AutoBackupConfig): void => {
    try {
      localStorage.setItem(BACKUP_STORAGE_KEYS.CONFIG, JSON.stringify(config));
    } catch (err) {
      console.error('Failed to save auto backup config:', err);
    }
  },

  // Get list of local snapshot restore points stored on this device
  getLocalSnapshots: (): LocalBackupSnapshot[] => {
    try {
      const raw = localStorage.getItem(BACKUP_STORAGE_KEYS.SNAPSHOTS);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  // Save snapshot to local device storage (retaining up to 10 latest restore points)
  saveSnapshotLocally: (data: SystemBackupData, filename: string): LocalBackupSnapshot => {
    const jsonStr = JSON.stringify(data);
    const sizeKb = Math.round((jsonStr.length * 2) / 1024); // approx UTF-16 bytes to KB

    const snapshot: LocalBackupSnapshot = {
      id: 'snap_' + Date.now(),
      createdAt: new Date().toISOString(),
      filename,
      customerCount: data.customers?.length || 0,
      collectionCount: data.collections?.length || 0,
      loanCount: data.loans?.length || 0,
      sizeKb,
      data,
    };

    const existing = AutoBackupService.getLocalSnapshots();
    // Keep 10 most recent snapshots on device
    const updated = [snapshot, ...existing].slice(0, 10);

    try {
      localStorage.setItem(BACKUP_STORAGE_KEYS.SNAPSHOTS, JSON.stringify(updated));
    } catch (err) {
      console.warn('LocalStorage full, trimming older snapshots:', err);
      try {
        const minimal = [snapshot, ...existing.slice(0, 3)];
        localStorage.setItem(BACKUP_STORAGE_KEYS.SNAPSHOTS, JSON.stringify(minimal));
      } catch (e2) {
        console.error('Could not save local snapshot to localStorage:', e2);
      }
    }

    return snapshot;
  },

  // Delete a local snapshot
  deleteSnapshot: (id: string): void => {
    const existing = AutoBackupService.getLocalSnapshots();
    const filtered = existing.filter((s) => s.id !== id);
    try {
      localStorage.setItem(BACKUP_STORAGE_KEYS.SNAPSHOTS, JSON.stringify(filtered));
    } catch (err) {
      console.error('Failed to delete snapshot:', err);
    }
  },

  // Trigger download of JSON backup file directly to the local device filesystem
  downloadBackupFile: (data: SystemBackupData, filename: string): void => {
    try {
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);
    } catch (err) {
      console.error('Failed to trigger local file download:', err);
    }
  },

  // Formats human-readable filename with current date and time
  generateBackupFilename: (prefix: string = 'Sushant_Bishi_AutoBackup'): string => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    return `${prefix}_${yyyy}-${mm}-${dd}_${hh}${min}.json`;
  },

  // Run a manual or instant backup
  performBackupNow: (): { snapshot: LocalBackupSnapshot; filename: string } => {
    const data = StorageService.exportBackup();
    const filename = AutoBackupService.generateBackupFilename('Sushant_Bishi_Backup');

    // 1. Save snapshot to local device storage
    const snapshot = AutoBackupService.saveSnapshotLocally(data, filename);

    // 2. Download directly to device filesystem
    AutoBackupService.downloadBackupFile(data, filename);

    // 3. Update auto-backup timestamp
    const config = AutoBackupService.getConfig();
    config.lastBackupTimestamp = Date.now();
    config.lastBackupDate = new Date().toISOString();
    config.lastBackupFilename = filename;
    AutoBackupService.saveConfig(config);

    return { snapshot, filename };
  },

  // Upload complete system backup directly to Google Drive via Google Apps Script (Zero Firestore Reads)
  uploadToGoogleDrive: async (
    customUrl?: string,
    providedData?: SystemBackupData
  ): Promise<{ success: boolean; message: string; filename?: string; fileId?: string }> => {
    const config = AutoBackupService.getConfig();
    const webhookUrl = (customUrl || config.driveWebhookUrl || DEFAULT_DRIVE_WEBHOOK_URL).trim();

    if (!webhookUrl) {
      return { success: false, message: 'Google Drive Webhook URL is missing.' };
    }

    try {
      const data = providedData || StorageService.exportBackup();
      const filename = AutoBackupService.generateBackupFilename('Sushant_Bishi_CloudDriveBackup');

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify({
          filename,
          data,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.status === 'success' || result.success) {
        const now = Date.now();
        config.lastDriveBackupTimestamp = now;
        config.lastDriveBackupDate = new Date().toISOString();
        config.lastDriveBackupFilename = result.fileName || filename;
        config.lastDriveBackupStatus = 'success';
        if (customUrl) config.driveWebhookUrl = customUrl;
        AutoBackupService.saveConfig(config);

        return {
          success: true,
          message: result.message || 'Backup saved to Google Drive successfully!',
          filename: result.fileName || filename,
          fileId: result.fileId,
        };
      } else {
        throw new Error(result.message || 'Google Drive webhook returned an error');
      }
    } catch (err: any) {
      console.error('Google Drive backup upload failed:', err);
      config.lastDriveBackupStatus = 'error';
      AutoBackupService.saveConfig(config);
      return {
        success: false,
        message: err?.message || 'Failed to upload backup to Google Drive.',
      };
    }
  },

  // Helper to determine if scheduled daily backup at 11:00 PM is due
  isBackupDue: (config: AutoBackupConfig): boolean => {
    if (!config.enabled) return false;

    const now = new Date();
    const targetHour = config.backupHour ?? 23;
    const targetMinute = config.backupMinute ?? 0;

    // Most recent scheduled slot (today at 11 PM or yesterday at 11 PM)
    const mostRecentSlot = new Date(now);
    mostRecentSlot.setHours(targetHour, targetMinute, 0, 0);

    if (now.getTime() < mostRecentSlot.getTime()) {
      mostRecentSlot.setDate(mostRecentSlot.getDate() - 1);
    }

    const lastBackup = config.lastBackupTimestamp || 0;
    return lastBackup < mostRecentSlot.getTime();
  },

  // Checks and runs auto-backup if daily 11:00 PM slot is due
  checkAndRunAutoBackup: (
    onSuccess?: (snapshot: LocalBackupSnapshot, filename: string) => void
  ): boolean => {
    const config = AutoBackupService.getConfig();
    if (!config.enabled) return false;

    if (AutoBackupService.isBackupDue(config)) {
      try {
        const data = StorageService.exportBackup();
        // Only run if there is some data (e.g. customers or bishi)
        const hasData = (data.customers && data.customers.length > 0) || (data.collections && data.collections.length > 0);
        if (!hasData && config.lastBackupTimestamp === 0) {
          // New installation with no data yet, record timestamp so we don't dump empty backups
          config.lastBackupTimestamp = Date.now();
          AutoBackupService.saveConfig(config);
          return false;
        }

        const filename = AutoBackupService.generateBackupFilename('Sushant_Bishi_DailyBackup_11PM');

        // 1. Store snapshot in local device storage
        const snapshot = AutoBackupService.saveSnapshotLocally(data, filename);

        // 2. Automatically save file to device filesystem (Downloads)
        AutoBackupService.downloadBackupFile(data, filename);

        // 3. Update configuration
        const now = Date.now();
        config.lastBackupTimestamp = now;
        config.lastBackupDate = new Date().toISOString();
        config.lastBackupFilename = filename;
        AutoBackupService.saveConfig(config);

        // 4. Automatically push to Google Drive in background if enabled (0 reads)
        if (config.driveBackupEnabled !== false) {
          AutoBackupService.uploadToGoogleDrive(config.driveWebhookUrl, data).catch((err) => {
            console.warn('Auto drive backup background upload notice:', err);
          });
        }

        if (onSuccess) {
          onSuccess(snapshot, filename);
        }
        return true;
      } catch (err) {
        console.error('Daily 11 PM auto backup execution failed:', err);
        return false;
      }
    }

    return false;
  },

  // Calculate next scheduled backup date (Today at 11:00 PM or Tomorrow at 11:00 PM)
  getNextBackupDate: (config: AutoBackupConfig): Date | null => {
    if (!config.enabled) return null;
    const now = new Date();
    const targetHour = config.backupHour ?? 23;
    const targetMinute = config.backupMinute ?? 0;

    const next = new Date(now);
    next.setHours(targetHour, targetMinute, 0, 0);

    // If today's 11:00 PM has already passed, next scheduled backup is tomorrow at 11:00 PM
    if (now.getTime() >= next.getTime()) {
      next.setDate(next.getDate() + 1);
    }
    return next;
  },
};
