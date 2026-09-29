import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { AutoBackupConfig, LocalBackupSnapshot, SystemBackupData } from '../types';
import { StorageService } from './db';

const BACKUP_STORAGE_KEYS = {
  CONFIG: 'sb_auto_backup_config',
  SNAPSHOTS: 'sb_local_backup_snapshots',
};

export const DEFAULT_DRIVE_WEBHOOK_URL =
  'https://script.google.com/macros/s/AKfycbzzOpsGVm-NuTwdQapw0OcOx9O64mALEAEzX3z1_wZ_rb12zmtDd98-IO97wE2PMSCK/exec';

/**
 * Pushes backup metadata (timestamp, filename, record counts) to Firestore stats/summary
 * so all other devices (Laptop, Phone, Tablet) immediately update their backup display in real time!
 */
export const syncBackupMetadataToCloud = async (info: {
  timestamp: number;
  filename: string;
  customerCount?: number;
  collectionCount?: number;
  loanCount?: number;
  sizeKb?: number;
  lastDaily11pmDate?: string;
  lastDaily11pmTimestamp?: number;
  lastDaily11pmFilename?: string;
}): Promise<void> => {
  try {
    const isoDate = new Date(info.timestamp).toISOString();
    const statsRef = doc(db, 'stats', 'summary');
    const payload: Record<string, any> = {
      lastDriveBackupTimestamp: info.timestamp,
      lastDriveBackupDate: isoDate,
      lastDriveBackupFilename: info.filename,
      lastBackupTimestamp: info.timestamp,
      lastBackupDate: isoDate,
      lastBackupFilename: info.filename,
      lastBackupCustomerCount: info.customerCount,
      lastBackupCollectionCount: info.collectionCount,
      lastBackupLoanCount: info.loanCount,
      lastBackupSizeKb: info.sizeKb,
      lastUpdated: isoDate,
    };
    if (info.lastDaily11pmDate) {
      payload.lastDaily11pmDate = info.lastDaily11pmDate;
      payload.lastDaily11pmTimestamp = info.lastDaily11pmTimestamp || info.timestamp;
      payload.lastDaily11pmFilename = info.lastDaily11pmFilename || info.filename;
    }
    await updateDoc(statsRef, payload).catch(async () => {
      await setDoc(statsRef, payload, { merge: true });
    });
  } catch (err) {
    console.warn('[Backup] syncBackupMetadataToCloud notice:', err);
  }
};

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

// ── Native IndexedDB Helper for Large Snapshot Storage (> 500MB, no 5MB quota errors) ──
const IDB_NAME = 'SB_Snapshots_DB';
const IDB_STORE = 'snapshots';
const IDB_VERSION = 1;

let inMemorySnapshots: LocalBackupSnapshot[] | null = null;

function openSnapshotsDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB unavailable'));
    }
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveIDBSnapshot(snapshot: LocalBackupSnapshot): Promise<void> {
  try {
    const db = await openSnapshotsDB();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    store.put(snapshot);
  } catch (err) {
    console.warn('IndexedDB save snapshot notice:', err);
  }
}

async function deleteIDBSnapshot(id: string): Promise<void> {
  try {
    const db = await openSnapshotsDB();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    store.delete(id);
  } catch (err) {
    console.warn('IndexedDB delete snapshot notice:', err);
  }
}

async function loadSnapshotsFromIDB(): Promise<LocalBackupSnapshot[]> {
  try {
    const db = await openSnapshotsDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const list: LocalBackupSnapshot[] = req.result || [];
        resolve(list);
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export const AutoBackupService = {
  // Get Auto Backup Settings
  getConfig: (): AutoBackupConfig => {
    try {
      const raw = localStorage.getItem(BACKUP_STORAGE_KEYS.CONFIG);
      if (!raw) return DEFAULT_CONFIG;
      const parsed = JSON.parse(raw);
      const config: AutoBackupConfig = { ...DEFAULT_CONFIG, ...parsed };
      // Migrate existing configurations
      if (config.backupHour === undefined) config.backupHour = 23;
      if (config.backupMinute === undefined) config.backupMinute = 0;
      if (parsed.intervalDays === 2 || !parsed.intervalDays) config.intervalDays = 1;
      if (parsed.lastDaily11pmDate) config.lastDaily11pmDate = parsed.lastDaily11pmDate;
      if (parsed.lastDaily11pmTimestamp) config.lastDaily11pmTimestamp = parsed.lastDaily11pmTimestamp;
      if (parsed.lastDaily11pmFilename) config.lastDaily11pmFilename = parsed.lastDaily11pmFilename;
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
    if (inMemorySnapshots && inMemorySnapshots.length > 0) {
      return inMemorySnapshots;
    }

    try {
      const raw = localStorage.getItem(BACKUP_STORAGE_KEYS.SNAPSHOTS);
      const parsed = raw ? JSON.parse(raw) : [];
      let list: LocalBackupSnapshot[] = Array.isArray(parsed) ? parsed : [];

      // Filter out empty 0-customer test snapshots if valid data exists
      const hasValid = list.some((s) => (s.customerCount || 0) > 0);
      let cleaned = hasValid ? list.filter((s) => (s.customerCount || 0) > 0) : list;

      cleaned.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      inMemorySnapshots = cleaned;

      // Asynchronously sync with IndexedDB in background
      loadSnapshotsFromIDB()
        .then((idbList) => {
          if (idbList && idbList.length > 0) {
            const map = new Map<string, LocalBackupSnapshot>();
            cleaned.forEach((s) => map.set(s.id, s));
            idbList.forEach((s) => {
              if ((s.customerCount || 0) > 0) map.set(s.id, s);
            });
            const merged = Array.from(map.values());
            merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            inMemorySnapshots = merged.slice(0, 10);
          }
        })
        .catch(() => {});

      return cleaned;
    } catch {
      return [];
    }
  },

  // Save snapshot to local device storage (retaining up to 10 latest restore points)
  saveSnapshotLocally: (
    data: SystemBackupData,
    filename: string,
    exactTimestamp?: number
  ): LocalBackupSnapshot => {
    const custCount = data.customers?.length || 0;
    const existing = AutoBackupService.getLocalSnapshots();

    // Prevent overwriting or adding empty snapshots if we already have valid data with customers
    if (custCount === 0 && existing.some((s) => (s.customerCount || 0) > 0)) {
      return existing[0];
    }

    const timeMs = exactTimestamp || Date.now();
    const createdAt = new Date(timeMs).toISOString();
    const jsonStr = JSON.stringify(data);
    const sizeKb = Math.round((jsonStr.length * 2) / 1024);

    const snapshot: LocalBackupSnapshot = {
      id: 'snap_' + timeMs,
      createdAt,
      filename,
      customerCount: custCount,
      collectionCount: data.collections?.length || 0,
      loanCount: data.loans?.length || 0,
      loanPaymentCount: data.loanPayments?.length || 0,
      sizeKb,
      data,
    };

    // Filter out duplicates within 2 seconds
    const filteredExisting = existing.filter(
      (s) => (s.customerCount || 0) > 0 && Math.abs(new Date(s.createdAt).getTime() - timeMs) > 2000
    );

    const updated = [snapshot, ...filteredExisting].slice(0, 10);
    updated.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Update in-memory cache immediately
    inMemorySnapshots = updated;

    // Save to IndexedDB (asynchronous, virtually unlimited quota)
    saveIDBSnapshot(snapshot);

    // Save to localStorage safely (if quota is tight, keep only top 2 in localStorage)
    try {
      localStorage.setItem(BACKUP_STORAGE_KEYS.SNAPSHOTS, JSON.stringify(updated));
    } catch (err) {
      console.warn('LocalStorage quota tight, trimming local storage cache:', err);
      try {
        const minimal = updated.slice(0, 2);
        localStorage.setItem(BACKUP_STORAGE_KEYS.SNAPSHOTS, JSON.stringify(minimal));
      } catch (e2) {
        console.warn('Could not save to localStorage, using IndexedDB & memory:', e2);
      }
    }

    return snapshot;
  },

  // Delete a local snapshot
  deleteSnapshot: (id: string): void => {
    const existing = AutoBackupService.getLocalSnapshots();
    const filtered = existing.filter((s) => s.id !== id);
    inMemorySnapshots = filtered;
    deleteIDBSnapshot(id);
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
  generateBackupFilename: (prefix: string = 'Sushant_Bishi_AutoBackup', exactDate?: Date): string => {
    const now = exactDate || new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    return `${prefix}_${yyyy}-${mm}-${dd}_${hh}${min}.json`;
  },

  // Run a manual or instant backup
  performBackupNow: (): { snapshot: LocalBackupSnapshot; filename: string } => {
    const now = Date.now();
    const data = StorageService.exportBackup();
    const filename = AutoBackupService.generateBackupFilename('Sushant_Bishi_Backup', new Date(now));

    // 1. Save snapshot to local device storage
    const snapshot = AutoBackupService.saveSnapshotLocally(data, filename, now);

    // 2. Download directly to device filesystem
    AutoBackupService.downloadBackupFile(data, filename);

    // 3. Update auto-backup timestamp
    const config = AutoBackupService.getConfig();
    config.lastBackupTimestamp = now;
    config.lastBackupDate = new Date(now).toISOString();
    config.lastBackupFilename = filename;
    config.lastDriveBackupTimestamp = now;
    config.lastDriveBackupDate = new Date(now).toISOString();
    config.lastDriveBackupFilename = filename;
    AutoBackupService.saveConfig(config);

    // 4. Broadcast backup metadata to Firestore so all devices see the updated backup time
    syncBackupMetadataToCloud({
      timestamp: now,
      filename,
      customerCount: data.customers?.length || 0,
      collectionCount: data.collections?.length || 0,
      loanCount: data.loans?.length || 0,
      sizeKb: Math.round((JSON.stringify(data).length * 2) / 1024),
    });

    return { snapshot, filename };
  },

  // Upload complete system backup directly to Google Drive via Google Apps Script (Zero Firestore Reads)
  uploadToGoogleDrive: async (
    customUrl?: string,
    providedData?: SystemBackupData,
    customFilename?: string,
    exactTimestamp?: number
  ): Promise<{ success: boolean; message: string; filename?: string; fileId?: string }> => {
    const config = AutoBackupService.getConfig();
    const webhookUrl = (customUrl || config.driveWebhookUrl || DEFAULT_DRIVE_WEBHOOK_URL).trim();

    if (!webhookUrl) {
      return { success: false, message: 'Google Drive Webhook URL is missing.' };
    }

    try {
      const now = exactTimestamp || Date.now();
      const data = providedData || StorageService.exportBackup();
      const filename = customFilename || AutoBackupService.generateBackupFilename('Sushant_Bishi_CloudDriveBackup', new Date(now));

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
        config.lastDriveBackupTimestamp = now;
        config.lastDriveBackupDate = new Date(now).toISOString();
        config.lastDriveBackupFilename = result.fileName || filename;
        config.lastBackupTimestamp = now;
        config.lastBackupDate = new Date(now).toISOString();
        config.lastBackupFilename = result.fileName || filename;
        config.lastDriveBackupStatus = 'success';
        if (customUrl) config.driveWebhookUrl = customUrl;
        AutoBackupService.saveConfig(config);

        // Broadcast to Firestore so all devices (Laptop, Phone) update backup time in real time!
        syncBackupMetadataToCloud({
          timestamp: now,
          filename: result.fileName || filename,
          customerCount: data.customers?.length || 0,
          collectionCount: data.collections?.length || 0,
          loanCount: data.loans?.length || 0,
          sizeKb: Math.round((JSON.stringify(data).length * 2) / 1024),
        });

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

  // Synchronizes cloud backup metadata from Firestore into local device storage
  syncCloudBackup: (cloudData: Record<string, any>): boolean => {
    if (!cloudData) return false;
    const cloudTimestamp = Number(cloudData.lastDriveBackupTimestamp || cloudData.lastBackupTimestamp) || 0;

    const config = AutoBackupService.getConfig();
    let hasChanged = false;

    // Sync daily 11 PM backup status across devices
    if (cloudData.lastDaily11pmDate && cloudData.lastDaily11pmDate !== config.lastDaily11pmDate) {
      config.lastDaily11pmDate = cloudData.lastDaily11pmDate;
      config.lastDaily11pmTimestamp = Number(cloudData.lastDaily11pmTimestamp) || config.lastDaily11pmTimestamp;
      config.lastDaily11pmFilename = cloudData.lastDaily11pmFilename || config.lastDaily11pmFilename;
      hasChanged = true;
    }

    const localTime = Math.max(config.lastDriveBackupTimestamp || 0, config.lastBackupTimestamp || 0);

    if (cloudTimestamp > localTime) {
      const isoDate =
        cloudData.lastDriveBackupDate || cloudData.lastBackupDate || new Date(cloudTimestamp).toISOString();
      const filename =
        cloudData.lastDriveBackupFilename || cloudData.lastBackupFilename || 'Sushant_Bishi_CloudDriveBackup.json';
      config.lastDriveBackupTimestamp = cloudTimestamp;
      config.lastDriveBackupDate = isoDate;
      config.lastDriveBackupFilename = filename;
      config.lastBackupTimestamp = cloudTimestamp;
      config.lastBackupDate = isoDate;
      config.lastBackupFilename = filename;
      config.lastDriveBackupStatus = 'success';
      hasChanged = true;

      // Also ensure a snapshot exists locally matching this cloud backup
      const existing = AutoBackupService.getLocalSnapshots();
      const alreadyHas = existing.some((s) => Math.abs(new Date(s.createdAt).getTime() - cloudTimestamp) < 60000);
      if (!alreadyHas) {
        try {
          const currentData = StorageService.exportBackup();
          const snapshot: LocalBackupSnapshot = {
            id: 'snap_' + cloudTimestamp,
            createdAt: isoDate,
            filename,
            customerCount: Number(cloudData.lastBackupCustomerCount) || currentData.customers?.length || 0,
            collectionCount: Number(cloudData.lastBackupCollectionCount) || currentData.collections?.length || 0,
            loanCount: Number(cloudData.lastBackupLoanCount) || currentData.loans?.length || 0,
            loanPaymentCount: currentData.loanPayments?.length || 0,
            sizeKb: Number(cloudData.lastBackupSizeKb) || Math.round((JSON.stringify(currentData).length * 2) / 1024),
            data: currentData,
          };
          const updated = [snapshot, ...existing].slice(0, 10);
          inMemorySnapshots = updated;
          saveIDBSnapshot(snapshot);
          try {
            localStorage.setItem(BACKUP_STORAGE_KEYS.SNAPSHOTS, JSON.stringify(updated.slice(0, 3)));
          } catch {}
        } catch (e) {}
      }
    }

    if (hasChanged) {
      AutoBackupService.saveConfig(config);
      return true;
    }
    return false;
  },

  // Pulls cloud backup metadata directly from Firestore
  fetchCloudBackupMetadata: async (): Promise<boolean> => {
    try {
      const statsRef = doc(db, 'stats', 'summary');
      const snap = await getDoc(statsRef);
      if (snap.exists()) {
        return AutoBackupService.syncCloudBackup(snap.data());
      }
    } catch (e) {
      console.warn('[Backup] fetchCloudBackupMetadata notice:', e);
    }
    return false;
  },

  // Determines which calendar day (YYYY-MM-DD) is currently due for the 11:00 PM backup
  getTargetDailySlotDate: (config: AutoBackupConfig, now: Date = new Date()): string => {
    const targetHour = config.backupHour ?? 23;
    const targetMinute = config.backupMinute ?? 0;

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const targetMinutes = targetHour * 60 + targetMinute;

    const slotDate = new Date(now);
    // If we haven't reached target 11 PM today, the due slot is yesterday's date
    if (currentMinutes < targetMinutes) {
      slotDate.setDate(slotDate.getDate() - 1);
    }

    const yyyy = slotDate.getFullYear();
    const mm = String(slotDate.getMonth() + 1).padStart(2, '0');
    const dd = String(slotDate.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  },

  // Helper to determine if the 11:00 PM daily backup is due
  // CRITICAL REQUIREMENT: The 11:00 PM backup MUST run every day even if manual backups were performed that day!
  isBackupDue: (config: AutoBackupConfig): boolean => {
    if (!config.enabled && config.driveBackupEnabled === false) return false;

    // 1. Identify which calendar day's 11:00 PM slot is currently due
    const targetSlotDate = AutoBackupService.getTargetDailySlotDate(config);

    // 2. If the 11 PM backup for that target date has already been completed, it is NOT due
    if (config.lastDaily11pmDate === targetSlotDate) {
      return false;
    }

    // 3. Otherwise, today's (or yesterday's missed) 11:00 PM backup has NOT been performed yet.
    // It is DUE now, regardless of how many manual backups were taken today!
    return true;
  },

  // Checks and runs auto-backup silently to Google Drive and local snapshot (no annoying download popups)
  checkAndRunAutoBackup: async (
    onSuccess?: (snapshot: LocalBackupSnapshot, filename: string) => void
  ): Promise<boolean> => {
    const config = AutoBackupService.getConfig();
    if (!config.enabled && config.driveBackupEnabled === false) return false;

    if (AutoBackupService.isBackupDue(config)) {
      try {
        const data = StorageService.exportBackup();
        const hasData = (data.customers && data.customers.length > 0) || (data.collections && data.collections.length > 0);
        const targetSlotDate = AutoBackupService.getTargetDailySlotDate(config);

        if (!hasData && config.lastBackupTimestamp === 0) {
          config.lastBackupTimestamp = Date.now();
          config.lastDaily11pmDate = targetSlotDate;
          AutoBackupService.saveConfig(config);
          return false;
        }

        const now = Date.now();
        // Distinct filename clearly indicating the scheduled daily 11 PM backup
        const filename = AutoBackupService.generateBackupFilename('Sushant_Bishi_AutoBackup_11PM', new Date(now));

        // 1. Store snapshot in local memory for instant 1-click restore without needing files
        const snapshot = AutoBackupService.saveSnapshotLocally(data, filename, now);

        // 2. Mark the 11 PM backup for targetSlotDate as COMPLETED
        config.lastDaily11pmDate = targetSlotDate;
        config.lastDaily11pmTimestamp = now;
        config.lastDaily11pmFilename = filename;
        config.lastBackupTimestamp = now;
        config.lastBackupDate = new Date(now).toISOString();
        config.lastBackupFilename = filename;
        config.lastDriveBackupTimestamp = now;
        config.lastDriveBackupDate = new Date(now).toISOString();
        config.lastDriveBackupFilename = filename;
        AutoBackupService.saveConfig(config);

        // 3. Automatically push directly to Google Drive in background (0 Firestore reads, zero effort for client)
        if (config.driveBackupEnabled !== false) {
          await AutoBackupService.uploadToGoogleDrive(config.driveWebhookUrl, data, filename, now).catch((err) => {
            console.warn('Silent auto drive backup background upload notice:', err);
          });
        }

        // 4. Sync metadata to Firestore cloud so all other devices (Laptop, Phone) update instantly
        syncBackupMetadataToCloud({
          timestamp: now,
          filename,
          customerCount: data.customers?.length || 0,
          collectionCount: data.collections?.length || 0,
          loanCount: data.loans?.length || 0,
          sizeKb: Math.round((JSON.stringify(data).length * 2) / 1024),
          lastDaily11pmDate: targetSlotDate,
          lastDaily11pmTimestamp: now,
          lastDaily11pmFilename: filename,
        });

        if (onSuccess) {
          onSuccess(snapshot, filename);
        }
        return true;
      } catch (err) {
        console.error('Silent auto backup execution failed:', err);
        return false;
      }
    }

    return false;
  },

  // Calculate next scheduled backup date (Today at 11:00 PM or Tomorrow at 11:00 PM)
  getNextBackupDate: (config: AutoBackupConfig): Date | null => {
    if (!config.enabled && config.driveBackupEnabled === false) return null;
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
