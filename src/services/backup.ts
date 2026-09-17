import { AutoBackupConfig, LocalBackupSnapshot, SystemBackupData } from '../types';
import { StorageService } from './db';

const BACKUP_STORAGE_KEYS = {
  CONFIG: 'sb_auto_backup_config',
  SNAPSHOTS: 'sb_local_backup_snapshots',
};

const DEFAULT_CONFIG: AutoBackupConfig = {
  enabled: true,
  intervalDays: 2, // Automatically backup every 2 days
  lastBackupTimestamp: 0,
};

export const AutoBackupService = {
  // Get Auto Backup Settings
  getConfig: (): AutoBackupConfig => {
    try {
      const raw = localStorage.getItem(BACKUP_STORAGE_KEYS.CONFIG);
      if (!raw) return DEFAULT_CONFIG;
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_CONFIG, ...parsed };
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

  // Checks if 2 days have passed since last backup and runs auto-backup
  checkAndRunAutoBackup: (
    onSuccess?: (snapshot: LocalBackupSnapshot, filename: string) => void
  ): boolean => {
    const config = AutoBackupService.getConfig();
    if (!config.enabled) return false;

    const intervalMs = (config.intervalDays || 2) * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const elapsed = now - (config.lastBackupTimestamp || 0);

    // Check if 2 days have elapsed (or if it has never run)
    if (elapsed >= intervalMs) {
      try {
        const data = StorageService.exportBackup();
        // Only run if there is some data (e.g. customers or bishi)
        const hasData = (data.customers && data.customers.length > 0) || (data.collections && data.collections.length > 0);
        if (!hasData && config.lastBackupTimestamp === 0) {
          // New installation with no data yet, record timestamp so we don't dump empty backups
          config.lastBackupTimestamp = now;
          AutoBackupService.saveConfig(config);
          return false;
        }

        const filename = AutoBackupService.generateBackupFilename('Sushant_Bishi_AutoBackup_2Days');

        // 1. Store snapshot in local device storage
        const snapshot = AutoBackupService.saveSnapshotLocally(data, filename);

        // 2. Automatically save file to device filesystem (Downloads)
        AutoBackupService.downloadBackupFile(data, filename);

        // 3. Update configuration
        config.lastBackupTimestamp = now;
        config.lastBackupDate = new Date().toISOString();
        config.lastBackupFilename = filename;
        AutoBackupService.saveConfig(config);

        if (onSuccess) {
          onSuccess(snapshot, filename);
        }
        return true;
      } catch (err) {
        console.error('Auto backup execution failed:', err);
        return false;
      }
    }

    return false;
  },

  // Calculate next scheduled backup date
  getNextBackupDate: (config: AutoBackupConfig): Date | null => {
    if (!config.enabled) return null;
    const intervalMs = (config.intervalDays || 2) * 24 * 60 * 60 * 1000;
    const last = config.lastBackupTimestamp || Date.now();
    return new Date(last + intervalMs);
  },
};
