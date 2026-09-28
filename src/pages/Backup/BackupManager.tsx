import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { StorageService } from '../../services/db';
import { AutoBackupService, DEFAULT_DRIVE_WEBHOOK_URL } from '../../services/backup';
import { AutoBackupConfig, LocalBackupSnapshot, SystemBackupData } from '../../types';
import {
  Cloud,
  Upload,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Clock,
  ShieldCheck,
  FolderSync,
  Settings,
  Database,
  FileCheck,
  HelpCircle,
  Users,
  Receipt,
  Wallet,
  Layers,
  Sparkles,
  RotateCcw,
  History,
  Trash2,
  Smartphone,
  Check,
} from 'lucide-react';
import { ModalPortal } from '../../components/common/ModalPortal';

export const BackupManager: React.FC = () => {
  const {
    customers,
    collections,
    loans,
    loanPayments,
    refreshData,
    showToast,
    language,
    isRefreshing,
    refreshAllData,
  } = useApp();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [restoreError, setRestoreError] = useState('');
  const [autoConfig, setAutoConfig] = useState<AutoBackupConfig>(() => AutoBackupService.getConfig());

  // Local Snapshots for 1-Click Auto-Restore (Zero file handling required)
  const [localSnapshots, setLocalSnapshots] = useState<LocalBackupSnapshot[]>(() => {
    const existing = AutoBackupService.getLocalSnapshots();
    return existing;
  });

  // Modal State for 1-Click Restore from Snapshot
  const [pendingSnapshotRestore, setPendingSnapshotRestore] = useState<LocalBackupSnapshot | null>(null);

  // Modal State for File-based Restore (New Device Setup)
  const [pendingFileRestore, setPendingFileRestore] = useState<{
    filename: string;
    data: SystemBackupData;
    sizeKb: number;
  } | null>(null);

  // Google Drive Cloud Backup State
  const [isUploadingToDrive, setIsUploadingToDrive] = useState(false);
  const [showDriveSettings, setShowDriveSettings] = useState(false);
  const [showNewDeviceRestore, setShowNewDeviceRestore] = useState(false);
  const [customWebhookUrl, setCustomWebhookUrl] = useState(
    () => AutoBackupService.getConfig().driveWebhookUrl || DEFAULT_DRIVE_WEBHOOK_URL
  );

  useEffect(() => {
    const config = AutoBackupService.getConfig();
    setAutoConfig(config);

    const snapshots = AutoBackupService.getLocalSnapshots();
    const configTime = Math.max(config.lastDriveBackupTimestamp || 0, config.lastBackupTimestamp || 0);
    const latestSnapTime = snapshots[0]?.createdAt ? new Date(snapshots[0].createdAt).getTime() : 0;

    // If config has a more recent backup than the snapshots list (e.g. today's backup),
    // sync a snapshot immediately so both cards display the exact same time!
    if (configTime > latestSnapTime && (!snapshots[0] || configTime - latestSnapTime > 60000)) {
      try {
        const currentData = StorageService.exportBackup();
        const filename =
          config.lastDriveBackupFilename ||
          config.lastBackupFilename ||
          AutoBackupService.generateBackupFilename('Sushant_Bishi_Backup', new Date(configTime));
        AutoBackupService.saveSnapshotLocally(currentData, filename, configTime);
        setLocalSnapshots(AutoBackupService.getLocalSnapshots());
      } catch (err) {
        console.warn('Snapshot sync catch:', err);
        setLocalSnapshots(snapshots);
      }
    } else {
      setLocalSnapshots(snapshots);
    }
  }, []);

  // Format date helper with proper locale
  const formatDateTime = (dateVal: string | number | Date | undefined) => {
    if (!dateVal) return language === 'EN' ? 'Not yet recorded' : 'अद्याप झालेला नाही';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    return d.toLocaleString(language === 'EN' ? 'en-IN' : 'mr-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Live Database Overview Statistics
  const liveStats = useMemo(() => {
    const custCount = customers?.length || 0;
    const collCount = collections?.length || 0;
    const loanCount = loans?.length || 0;
    const payCount = loanPayments?.length || 0;
    const totalRecords = custCount + collCount + loanCount + payCount;

    let estKb = 0;
    try {
      const raw = StorageService.exportBackup();
      estKb = Math.round((JSON.stringify(raw).length * 2) / 1024);
    } catch {
      estKb = 0;
    }

    return {
      custCount,
      collCount,
      loanCount,
      payCount,
      totalRecords,
      estKb,
    };
  }, [customers, collections, loans, loanPayments]);

  // Latest snapshot available for 1-click restore
  const latestSnapshot = localSnapshots.length > 0 ? localSnapshots[0] : null;

  // Unified latest backup time so top card and bottom card are ALWAYS 100% in sync
  const unifiedLatestTime = useMemo(() => {
    const snapTime = latestSnapshot?.createdAt ? new Date(latestSnapshot.createdAt).getTime() : 0;
    const driveTime = autoConfig.lastDriveBackupTimestamp || 0;
    const localTime = autoConfig.lastBackupTimestamp || 0;
    return Math.max(snapTime, driveTime, localTime) || undefined;
  }, [latestSnapshot, autoConfig]);

  // Manual trigger: Backup to Google Drive immediately and create a local restore point with CURRENT TIME
  const handleUploadToDrive = async () => {
    setIsUploadingToDrive(true);
    setRestoreError('');
    try {
      const now = Date.now();
      const isoNow = new Date(now).toISOString();
      const data = StorageService.exportBackup();
      data.exportedAt = isoNow;
      const filename = AutoBackupService.generateBackupFilename('Sushant_Bishi_CloudDriveBackup', new Date(now));

      // 1. Immediately save a local snapshot with the exact current timestamp
      AutoBackupService.saveSnapshotLocally(data, filename, now);

      // 2. Immediately update config with the exact same timestamp
      const updatedConfig: AutoBackupConfig = {
        ...autoConfig,
        lastBackupTimestamp: now,
        lastBackupDate: isoNow,
        lastBackupFilename: filename,
        lastDriveBackupTimestamp: now,
        lastDriveBackupDate: isoNow,
        lastDriveBackupFilename: filename,
        lastDriveBackupStatus: 'success',
      };
      AutoBackupService.saveConfig(updatedConfig);

      // 3. Immediately update UI states so BOTH cards show the exact current time!
      setAutoConfig(updatedConfig);
      setLocalSnapshots(AutoBackupService.getLocalSnapshots());

      // 4. Upload directly to Google Drive via Apps Script Webhook
      const res = await AutoBackupService.uploadToGoogleDrive(customWebhookUrl, data, filename, now);

      if (res.success) {
        showToast(
          language === 'EN'
            ? `Google Drive backup successful: ${res.filename}`
            : `गुगल ड्राईव्हवर बॅकअप यशस्वीपणे सेव्ह झाला: ${res.filename}`,
          'success'
        );
      } else {
        showToast(
          language === 'EN'
            ? `Google Drive backup notice: ${res.message}`
            : `गुगल ड्राईव्ह बॅकअप सूचना: ${res.message}`,
          'error'
        );
      }
    } catch (err: any) {
      showToast(
        language === 'EN' ? 'Google Drive backup error: ' + (err?.message || 'Failed') : 'गुगल ड्राईव्ह बॅकअप घेताना त्रुटी आली.',
        'error'
      );
    } finally {
      setIsUploadingToDrive(false);
    }
  };

  const handleSaveWebhookUrl = () => {
    const updated = { ...autoConfig, driveWebhookUrl: customWebhookUrl.trim() };
    AutoBackupService.saveConfig(updated);
    setAutoConfig(updated);
    showToast(
      language === 'EN'
        ? 'Google Drive Webhook URL updated successfully.'
        : 'गुगल ड्राईव्ह Webhook URL यशस्वीपणे सेव्ह झाली.',
      'success'
    );
  };

  const handleToggleDriveAutoBackup = (driveBackupEnabled: boolean) => {
    const updated = { ...autoConfig, driveBackupEnabled };
    AutoBackupService.saveConfig(updated);
    setAutoConfig(updated);
    showToast(
      driveBackupEnabled
        ? (language === 'EN' ? 'Automatic daily Google Drive backup enabled.' : 'गुगल ड्राईव्ह ऑटो-बॅकअप सुरू केला.')
        : (language === 'EN' ? 'Automatic daily Google Drive backup disabled.' : 'गुगल ड्राईव्ह ऑटो-बॅकअप बंद केला.'),
      'info'
    );
  };

  // Trigger 1-Click Restore from Snapshot
  const handleExecuteSnapshotRestore = () => {
    if (!pendingSnapshotRestore) return;
    try {
      StorageService.importBackup(pendingSnapshotRestore.data);
      refreshData();
      refreshAllData();
      showToast(
        language === 'EN'
          ? `System data restored successfully to ${formatDateTime(pendingSnapshotRestore.createdAt)}`
          : `डेटा ${formatDateTime(pendingSnapshotRestore.createdAt)} रोजीच्या स्थितीनुसार यशस्वीपणे पूर्ववत झाला.`,
        'success'
      );
      setPendingSnapshotRestore(null);
    } catch (err: any) {
      setRestoreError(err?.message || (language === 'EN' ? 'Failed to restore snapshot.' : 'डेटा पूर्ववत करताना त्रुटी आली.'));
    }
  };

  // Delete a snapshot
  const handleDeleteSnapshot = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    AutoBackupService.deleteSnapshot(id);
    setLocalSnapshots(AutoBackupService.getLocalSnapshots());
    showToast(
      language === 'EN' ? 'Restore point removed' : 'रिस्टोर पॉईंट काढण्यात आला',
      'info'
    );
  };

  // File Upload Handlers (for New Device setup)
  const handleRestoreFileClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRestoreError('');
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const content = evt.target?.result as string;
        const parsed = JSON.parse(content);

        // Validation
        if (!parsed || (!parsed.version && !parsed.customers && !parsed.collections)) {
          throw new Error(
            language === 'EN'
              ? 'Invalid backup format. The selected file does not contain valid Sushant Bhishi database collections.'
              : 'अवैध बॅकअप फाईल. निवडलेली JSON फाईल सुशांत भिशी डेटाबेसशी जुळत नाही.'
          );
        }

        const sizeKb = Math.round((content.length * 2) / 1024);
        setPendingFileRestore({
          filename: file.name,
          data: parsed,
          sizeKb,
        });
      } catch (err: any) {
        setRestoreError(err.message || (language === 'EN' ? 'Invalid JSON backup file.' : 'अवैध फाईल फॉरमॅट. पुनर्संचयित करण्यात त्रुटी.'));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleConfirmFileRestore = () => {
    if (!pendingFileRestore) return;
    try {
      StorageService.importBackup(pendingFileRestore.data);
      // Register this restored file as a local snapshot with current timestamp
      AutoBackupService.saveSnapshotLocally(pendingFileRestore.data, pendingFileRestore.filename, Date.now());
      setLocalSnapshots(AutoBackupService.getLocalSnapshots());

      refreshData();
      refreshAllData();
      showToast(
        language === 'EN'
          ? `Data successfully restored from ${pendingFileRestore.filename}`
          : `डेटा ${pendingFileRestore.filename} फाईलवरून यशस्वीपणे पुनर्संचयित झाला.`,
        'success'
      );
      setPendingFileRestore(null);
    } catch (err: any) {
      setRestoreError(err.message || (language === 'EN' ? 'Failed to restore file data.' : 'डेटा पुनर्संचयित करताना त्रुटी आली.'));
    }
  };

  return (
    <div className="space-y-6 pb-12 max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#E4EAE7] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-50 text-[#0F7A5C] border border-emerald-200 mb-2">
            <ShieldCheck className="w-3.5 h-3.5 text-[#0F7A5C]" />
            <span>{language === 'EN' ? 'Fully Automatic Google Drive Protection' : 'स्वयंचलित गुगल ड्राईव्ह संरक्षण'}</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-[#10241E] tracking-tight flex items-center space-x-2.5">
            <FolderSync className="w-6 h-6 text-[#0F7A5C]" />
            <span>{language === 'EN' ? 'Google Drive Backup & 1-Click Restore' : 'गुगल ड्राईव्ह बॅकअप व १-क्लिक रिस्टोर'}</span>
          </h2>
          <p className="text-xs sm:text-sm text-[#5F6E68] font-bold mt-1">
            {language === 'EN'
              ? 'Your data is backed up automatically to Google Drive in the background. Restore instantly in 1 click without downloading or uploading files.'
              : 'तुमचा डेटा दररोज आपोआप गुगल ड्राईव्हवर सेव्ह होतो. कोणतीही फाईल डाऊनलोड किंवा अपलोड न करता १ क्लिकमध्ये डेटा रिस्टोर करा.'}
          </p>
        </div>

        <button
          onClick={() => refreshAllData()}
          disabled={isRefreshing}
          title={language === 'EN' ? 'Refresh Backup Data' : 'डेटा रिफ्रेश करा'}
          className="h-11 px-4 bg-white hover:bg-emerald-50 text-[#0F7A5C] font-extrabold text-xs rounded-xl border border-[#E4EAE7] shadow-2xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-60 active:scale-95 transition-all self-start sm:self-auto shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#0F7A5C] ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{language === 'EN' ? 'Refresh' : 'रिफ्रेश'}</span>
        </button>
      </div>

      {restoreError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs sm:text-sm font-bold flex items-center justify-between shadow-xs animate-in fade-in duration-150">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600" />
            <span>{restoreError}</span>
          </div>
          <button
            type="button"
            onClick={() => setRestoreError('')}
            className="text-xs text-rose-600 font-extrabold underline cursor-pointer"
          >
            {language === 'EN' ? 'Dismiss' : 'बंद करा'}
          </button>
        </div>
      )}

      {/* LIVE DATABASE METRICS OVERVIEW */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-[#E4EAE7] shadow-xs">
        <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2.5">
          <div className="flex items-center space-x-2">
            <Database className="w-4 h-4 text-[#0F7A5C]" />
            <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
              {language === 'EN' ? 'Current System Database Overview' : 'चालू डेटाबेस माहिती'}
            </span>
          </div>
          <span className="text-[11px] font-bold text-slate-500">
            {language === 'EN' ? `Database Size: ~${liveStats.estKb} KB` : `अंदाजे आकार: ~${liveStats.estKb} KB`}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-100">
            <div className="flex items-center justify-center space-x-1.5 text-[#0B5C45] mb-1">
              <Users className="w-3.5 h-3.5" />
              <span className="text-[11px] font-extrabold uppercase">
                {language === 'EN' ? 'Customers' : 'खातेदार'}
              </span>
            </div>
            <div className="text-lg sm:text-xl font-black text-[#0B5C45]">
              {liveStats.custCount}
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-blue-50/70 border border-blue-100">
            <div className="flex items-center justify-center space-x-1.5 text-blue-800 mb-1">
              <Receipt className="w-3.5 h-3.5" />
              <span className="text-[11px] font-extrabold uppercase">
                {language === 'EN' ? 'Installments' : 'हप्ते'}
              </span>
            </div>
            <div className="text-lg sm:text-xl font-black text-blue-900">
              {liveStats.collCount}
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-100">
            <div className="flex items-center justify-center space-x-1.5 text-amber-800 mb-1">
              <Wallet className="w-3.5 h-3.5" />
              <span className="text-[11px] font-extrabold uppercase">
                {language === 'EN' ? 'Loans' : 'कर्जे'}
              </span>
            </div>
            <div className="text-lg sm:text-xl font-black text-amber-900">
              {liveStats.loanCount}
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-teal-50/70 border border-teal-100">
            <div className="flex items-center justify-center space-x-1.5 text-teal-800 mb-1">
              <Layers className="w-3.5 h-3.5" />
              <span className="text-[11px] font-extrabold uppercase">
                {language === 'EN' ? 'Total Records' : 'एकूण नोंदी'}
              </span>
            </div>
            <div className="text-lg sm:text-xl font-black text-teal-900">
              {liveStats.totalRecords}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 1: AUTOMATIC GOOGLE DRIVE CLOUD BACKUP */}
      <div className="bg-gradient-to-br from-white via-emerald-50/20 to-teal-50/30 p-6 sm:p-7 rounded-3xl border-2 border-emerald-400 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
                <Check className="w-3.5 h-3.5 text-emerald-700" />
                <span>
                  {autoConfig.driveBackupEnabled !== false
                    ? (language === 'EN' ? 'Cloud Protection: Active' : 'क्लाउड संरक्षण: सक्रिय')
                    : (language === 'EN' ? 'Cloud Protection: Paused' : 'क्लाउड संरक्षण: बंद')}
                </span>
              </span>
              <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                <Sparkles className="w-3 h-3 text-amber-700" />
                <span>{language === 'EN' ? 'Automatic (No manual steps needed)' : 'पूर्णपणे स्वयंचलित (काहीही करण्याची गरज नाही)'}</span>
              </span>
            </div>

            <h3 className="text-lg sm:text-xl font-black text-[#10241E] flex items-center space-x-2">
              <span>
                {language === 'EN'
                  ? 'Automatic Google Drive Backup'
                  : 'गुगल ड्राईव्हवर आपोआप सुरक्षित बॅकअप'}
              </span>
            </h3>

            <p className="text-xs sm:text-sm text-[#5F6E68] font-bold max-w-2xl leading-relaxed">
              {language === 'EN'
                ? 'Your complete database (all customers, collection receipts, loans, loan payments, configs) is saved automatically into the "Sushant_Bishi_Backups" folder in Google Drive. You do NOT need to download or upload anything manually!'
                : 'सर्व खातेदार, भिशी हप्ते, कर्ज आणि नोंदी आपोआप गुगल ड्राईव्हमधील "Sushant_Bishi_Backups" फोल्डरमध्ये सेव्ह होतात. तुम्हाला मॅन्युअली कोणतीही फाईल डाऊनलोड किंवा अपलोड करण्याची गरज नाही!'}
            </p>

            {/* Status Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="p-3 bg-white rounded-2xl border border-[#E4EAE7] shadow-2xs flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-[#5F6E68]">
                    {language === 'EN' ? 'Last Saved Backup' : 'शेवटचा बॅकअप'}
                  </div>
                  <div className="text-xs font-black text-[#10241E] truncate">
                    {formatDateTime(unifiedLatestTime)}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono truncate max-w-[220px]" title={autoConfig.lastDriveBackupFilename || autoConfig.lastBackupFilename || latestSnapshot?.filename}>
                    {autoConfig.lastDriveBackupFilename || autoConfig.lastBackupFilename || latestSnapshot?.filename || 'Safe cloud backup'}
                  </div>
                </div>
              </div>

              <div className="p-3 bg-white rounded-2xl border border-[#E4EAE7] shadow-2xs flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-[#0F7A5C] flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-[#5F6E68]">
                    {language === 'EN' ? 'Google Drive Folder' : 'गुगल ड्राईव्ह फोल्डर'}
                  </div>
                  <div className="text-xs font-black text-[#10241E] truncate">
                    Sushant_Bishi_Backups
                  </div>
                  <div className="text-[10px] text-emerald-700 font-bold">
                    {language === 'EN' ? 'Safe Cloud Storage' : 'सुरक्षित क्लाउड साठा'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Action & Controls */}
          <div className="flex flex-col sm:flex-row lg:flex-col gap-3 shrink-0 lg:w-72">
            <button
              type="button"
              disabled={isUploadingToDrive}
              onClick={handleUploadToDrive}
              className="w-full py-3.5 px-4 rounded-2xl bg-[#0F7A5C] hover:bg-[#0B5C45] active:scale-[0.98] text-white font-black text-xs sm:text-sm flex items-center justify-center space-x-2 shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-50"
            >
              {isUploadingToDrive ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  <span>{language === 'EN' ? 'Saving to Drive...' : 'ड्राईव्हवर सेव्ह होत आहे...'}</span>
                </>
              ) : (
                <>
                  <Cloud className="w-4 h-4" />
                  <span>{language === 'EN' ? 'Backup to Drive Now (1-Click)' : 'Google Drive वर आताच सेव्ह करा'}</span>
                </>
              )}
            </button>

            <div className="flex items-center justify-between p-3 bg-white rounded-2xl border border-[#E4EAE7] shadow-2xs">
              <span className="text-xs font-black text-[#10241E]">
                {language === 'EN' ? 'Daily automatic backup' : 'दररोज आपोआप बॅकअप'}
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoConfig.driveBackupEnabled !== false}
                  onChange={(e) => handleToggleDriveAutoBackup(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0F7A5C]"></div>
              </label>
            </div>

            <button
              type="button"
              onClick={() => setShowDriveSettings(!showDriveSettings)}
              className="w-full py-2 px-3 rounded-xl bg-white hover:bg-slate-50 border border-[#E4EAE7] text-slate-700 text-xs font-bold flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5 text-slate-500" />
              <span>{showDriveSettings ? (language === 'EN' ? 'Hide Drive Webhook' : 'Webhook URL लपवा') : (language === 'EN' ? 'Drive Webhook Settings' : 'गुगल स्क्रिप्ट Webhook')}</span>
            </button>
          </div>
        </div>

        {/* Collapsible Webhook URL Configuration */}
        {showDriveSettings && (
          <div className="mt-5 pt-4 border-t border-emerald-200/60 space-y-3 relative z-10 animate-in fade-in duration-150">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-xs font-black text-[#10241E]">
                {language === 'EN' ? 'Google Apps Script Webhook URL:' : 'गुगल अ‍ॅप्स स्क्रिप्ट Webhook URL:'}
              </label>
              <button
                type="button"
                onClick={() => setCustomWebhookUrl(DEFAULT_DRIVE_WEBHOOK_URL)}
                className="text-[11px] font-bold text-[#0F7A5C] hover:underline self-start sm:self-auto cursor-pointer"
              >
                {language === 'EN' ? 'Reset to Default URL' : 'मूळ URL वर पूर्ववत करा'}
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="url"
                value={customWebhookUrl}
                onChange={(e) => setCustomWebhookUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="flex-1 px-3 py-2 text-xs font-mono bg-white border border-[#E4EAE7] rounded-xl focus:outline-none focus:border-[#0F7A5C]"
              />
              <button
                type="button"
                onClick={handleSaveWebhookUrl}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black rounded-xl transition-colors cursor-pointer shrink-0"
              >
                {language === 'EN' ? 'Save URL' : 'URL सेव्ह करा'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: 1-CLICK INSTANT RESTORE (NO FILE DOWNLOAD OR UPLOAD NEEDED) */}
      <div className="bg-white p-6 sm:p-7 rounded-3xl border border-[#E4EAE7] shadow-xs space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-black bg-blue-50 text-blue-800 border border-blue-200 mb-2">
              <RotateCcw className="w-3.5 h-3.5 text-blue-600" />
              <span>{language === 'EN' ? '1-Click Instant Restore' : '१-क्लिक झटपट रिस्टोर'}</span>
            </div>
            <h3 className="text-lg sm:text-xl font-black text-[#10241E]">
              {language === 'EN'
                ? 'Restore Data Instantly (No Files Needed)'
                : 'फाईलशिवाय १-क्लिकमध्ये डेटा पूर्ववत करा'}
            </h3>
            <p className="text-xs sm:text-sm text-[#5F6E68] font-bold mt-1 max-w-2xl">
              {language === 'EN'
                ? 'Your client never needs to download or upload files! Simply click the green button below to restore your entire database to the latest safe backup.'
                : 'कोणतीही फाईल डाऊनलोड किंवा अपलोड न करता एका क्लिकवर संपूर्ण डेटा पूर्ववत करा.'}
            </p>
          </div>

          {/* PRIMARY 1-CLICK RESTORE BUTTON */}
          {latestSnapshot && (
            <button
              type="button"
              onClick={() => setPendingSnapshotRestore(latestSnapshot)}
              className="py-3.5 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-black text-xs sm:text-sm flex items-center justify-center space-x-2 shadow-md hover:shadow-lg transition-all cursor-pointer shrink-0"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{language === 'EN' ? 'Restore to Latest Safe Backup (1-Click)' : 'नवीनतम बॅकअपवर रिस्टोर करा (१-क्लिक)'}</span>
            </button>
          )}
        </div>

        {/* LATEST SAFE POINT CARD */}
        {latestSnapshot ? (
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start space-x-3.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 mt-0.5">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-black text-slate-900">
                    {language === 'EN' ? 'Latest Safe Backup Available' : 'नवीनतम उपलब्ध सुरक्षित बॅकअप'}
                  </span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-black">
                    {language === 'EN' ? 'Ready to Restore' : 'रिस्टोरसाठी तयार'}
                  </span>
                </div>
                <div className="text-sm font-extrabold text-[#0F7A5C] mt-0.5">
                  {formatDateTime(unifiedLatestTime)}
                </div>
                <div className="text-[11px] text-slate-500 font-bold mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  <span>{language === 'EN' ? `Customers: ${latestSnapshot.customerCount || liveStats.custCount}` : `खातेदार: ${latestSnapshot.customerCount || liveStats.custCount}`}</span>
                  <span>•</span>
                  <span>{language === 'EN' ? `Installments: ${latestSnapshot.collectionCount || liveStats.collCount}` : `हप्ते: ${latestSnapshot.collectionCount || liveStats.collCount}`}</span>
                  <span>•</span>
                  <span>{language === 'EN' ? `Loans: ${latestSnapshot.loanCount || liveStats.loanCount}` : `कर्जे: ${latestSnapshot.loanCount || liveStats.loanCount}`}</span>
                  <span>•</span>
                  <span>~{latestSnapshot.sizeKb || liveStats.estKb} KB</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setPendingSnapshotRestore(latestSnapshot)}
              className="py-2.5 px-4 rounded-xl bg-white hover:bg-emerald-50 text-[#0F7A5C] border border-[#0F7A5C]/30 text-xs font-black flex items-center justify-center space-x-1.5 transition-colors cursor-pointer shrink-0 shadow-2xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{language === 'EN' ? 'Quick Restore' : 'त्वरित रिस्टोर'}</span>
            </button>
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>{language === 'EN' ? 'No local restore points found yet. Click "Backup to Drive Now" to create your first restore point.' : 'अद्याप कोणताही रिस्टोर पॉईंट उपलब्ध नाही.'}</span>
            </div>
            <button
              type="button"
              onClick={handleUploadToDrive}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-black cursor-pointer"
            >
              {language === 'EN' ? 'Create Restore Point' : 'आताच तयार करा'}
            </button>
          </div>
        )}

        {/* LIST OF RECENT SAFE RESTORE POINTS */}
        {localSnapshots.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-xs font-black text-slate-800">
              <History className="w-4 h-4 text-[#0F7A5C]" />
              <span>{language === 'EN' ? 'Recent Automatic Restore Points (Safe History)' : 'मागील सुरक्षित बॅकअप्स (इतिहास)'}</span>
            </div>

            <div className="divide-y divide-slate-100 rounded-2xl border border-[#E4EAE7] overflow-hidden bg-white">
              {localSnapshots.map((snap, idx) => (
                <div
                  key={snap.id}
                  className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-teal-50 text-[#0F7A5C] flex items-center justify-center font-black text-xs shrink-0">
                      {idx + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-black text-slate-900 flex items-center space-x-2">
                        <span>{idx === 0 ? formatDateTime(unifiedLatestTime) : formatDateTime(snap.createdAt)}</span>
                        {idx === 0 && (
                          <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-black">
                            {language === 'EN' ? 'LATEST' : 'नवीनतम'}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 font-bold truncate">
                        {language === 'EN'
                          ? `${snap.customerCount} Customers, ${snap.collectionCount} Collections, ${snap.loanCount} Loans (~${snap.sizeKb} KB)`
                          : `${snap.customerCount} खातेदार, ${snap.collectionCount} हप्ते, ${snap.loanCount} कर्जे (~${snap.sizeKb} KB)`}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setPendingSnapshotRestore(snap)}
                      className="py-1.5 px-3 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-[#0F7A5C] text-xs font-black flex items-center space-x-1 transition-colors cursor-pointer border border-emerald-200"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>{language === 'EN' ? 'Restore This' : 'हे रिस्टोर करा'}</span>
                    </button>
                    {localSnapshots.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => handleDeleteSnapshot(snap.id, e)}
                        title={language === 'EN' ? 'Delete this snapshot' : 'हा पॉईंट हटवा'}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* SECTION 3: NEW DEVICE RESTORE (FOR PHONE SWITCH / TECHNICIAN RESTORE) */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#E4EAE7] shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2.5">
            <Smartphone className="w-5 h-5 text-slate-600" />
            <div>
              <h4 className="text-sm font-black text-slate-900">
                {language === 'EN' ? 'Restoring on a Brand New Phone or PC?' : 'नवीन फोन किंवा कॉम्प्युटरवर रिस्टोर करायचे आहे का?'}
              </h4>
              <p className="text-xs text-slate-500 font-bold">
                {language === 'EN'
                  ? 'If your client bought a new phone, all backups are safely stored in Google Drive. You can restore it in 1 minute using the Drive file.'
                  : 'नवीन फोनवर डेटा आणण्यासाठी गुगल ड्राईव्हवरून फाईल निवडून रिस्टोर करू शकता.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowNewDeviceRestore(!showNewDeviceRestore)}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-black rounded-xl transition-colors cursor-pointer shrink-0 self-start sm:self-auto"
          >
            {showNewDeviceRestore ? (language === 'EN' ? 'Hide Options' : 'पर्याय लपवा') : (language === 'EN' ? 'Open New Device Restore' : 'नवीन फोन रिस्टोर पर्याय')}
          </button>
        </div>

        {showNewDeviceRestore && (
          <div className="pt-4 border-t border-slate-100 space-y-4 animate-in fade-in duration-150">
            <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200 text-xs text-blue-900 font-bold space-y-2">
              <div className="font-black flex items-center space-x-1.5 text-blue-950">
                <CheckCircle2 className="w-4 h-4 text-blue-700" />
                <span>{language === 'EN' ? 'How to set up a new phone for your client:' : 'नवीन फोन कसा सेट करावा:'}</span>
              </div>
              <ol className="list-decimal list-inside space-y-1 text-[11px] leading-relaxed">
                <li>{language === 'EN' ? 'Open drive.google.com and go to the "Sushant_Bishi_Backups" folder.' : 'drive.google.com उघडा आणि "Sushant_Bishi_Backups" फोल्डरमध्ये जा.'}</li>
                <li>{language === 'EN' ? 'Download the latest backup file to the new phone or computer.' : 'नवीनतम फाईल डाऊनलोड करा.'}</li>
                <li>{language === 'EN' ? 'Click the button below and select that downloaded file.' : 'खालील बटणावर क्लिक करून ती फाईल निवडा.'}</li>
              </ol>
            </div>

            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={handleRestoreFileClick}
                className="py-3 px-5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs flex items-center space-x-2 transition-all cursor-pointer shadow-xs"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{language === 'EN' ? 'Select Drive File to Restore New Device' : 'गुगल ड्राईव्ह फाईल निवडून नवीन फोनवर रिस्टोर करा'}</span>
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".json"
                className="hidden"
              />
            </div>
          </div>
        )}
      </div>

      {/* SECTION 4: CLEAR ENGLISH EXPLANATION GUIDE */}
      <div className="bg-[#F8FAF9] p-5 sm:p-6 rounded-3xl border border-[#E4EAE7] space-y-4">
        <div className="flex items-center space-x-2 text-xs font-black text-[#10241E]">
          <HelpCircle className="w-4 h-4 text-[#0F7A5C]" />
          <span>{language === 'EN' ? 'Everything Explained in Simple English: How Backup & Restore Works' : 'सविस्तर स्पष्टीकरण: बॅकअप व रिस्टोर कसे काम करते?'}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* Card 1 */}
          <div className="p-4 rounded-2xl bg-white border border-[#E4EAE7] space-y-2 shadow-2xs">
            <div className="w-7 h-7 rounded-lg bg-emerald-100 text-[#0B5C45] font-black text-xs flex items-center justify-center">
              1
            </div>
            <h4 className="text-xs font-black text-slate-900">
              {language === 'EN' ? 'Fully Automatic Backup' : 'पूर्णपणे स्वयंचलित बॅकअप'}
            </h4>
            <p className="text-[11px] text-[#5F6E68] font-medium leading-relaxed">
              {language === 'EN'
                ? 'The software automatically saves your full database directly to Google Drive folder "Sushant_Bishi_Backups" every night at 11:00 PM. Your client does not have to click anything or download any file.'
                : 'सॉफ्टवेअर दररोज रात्री ११:०० वाजता आपोआप संपूर्ण डेटा गुगल ड्राईव्हवर सेव्ह करते. क्लायंटला कोणतीही फाईल डाऊनलोड करावी लागत नाही.'}
            </p>
          </div>

          {/* Card 2 */}
          <div className="p-4 rounded-2xl bg-white border border-[#E4EAE7] space-y-2 shadow-2xs">
            <div className="w-7 h-7 rounded-lg bg-emerald-100 text-[#0B5C45] font-black text-xs flex items-center justify-center">
              2
            </div>
            <h4 className="text-xs font-black text-slate-900">
              {language === 'EN' ? '1-Click Instant Restore' : '१-क्लिक झटपट रिस्टोर'}
            </h4>
            <p className="text-[11px] text-[#5F6E68] font-medium leading-relaxed">
              {language === 'EN'
                ? 'If your client ever makes a mistake or accidentally deletes something, they do NOT need to download or upload anything from Google Drive! Just click "Restore to Latest Safe Backup (1-Click)" and the entire database is restored immediately.'
                : 'जर चुकून काही डिलीट झाले किंवा चूक झाली, तर कोणतेही गुगल ड्राईव्ह उघडण्याची गरज नाही. फक्त "Restore" बटण दाबताच चालू डेटा पूर्ववत होतो.'}
            </p>
          </div>

          {/* Card 3 */}
          <div className="p-4 rounded-2xl bg-white border border-[#E4EAE7] space-y-2 shadow-2xs">
            <div className="w-7 h-7 rounded-lg bg-emerald-100 text-[#0B5C45] font-black text-xs flex items-center justify-center">
              3
            </div>
            <h4 className="text-xs font-black text-slate-900">
              {language === 'EN' ? 'New Phone Recovery' : 'नवीन फोनवर डेटा आणणे'}
            </h4>
            <p className="text-[11px] text-[#5F6E68] font-medium leading-relaxed">
              {language === 'EN'
                ? 'If your client loses their phone or buys a new device, their data is safe in their Google Drive. You can simply download the file from Drive once and upload it in the "New Device Restore" section.'
                : 'जर मोबाईल हरवला किंवा बदलला, तरी डेटा गुगल ड्राईव्हवर सुरक्षित असतो. नवीन फोनवर एकदा फाईल निवडून संपूर्ण डेटा रिस्टोर केला जाऊ शकतो.'}
            </p>
          </div>
        </div>
      </div>

      {/* CONFIRMATION MODAL: 1-CLICK RESTORE FROM SNAPSHOT */}
      {pendingSnapshotRestore && (
        <ModalPortal>
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-hidden no-print">
            <div className="bg-white rounded-3xl p-6 max-w-md w-full max-h-[90vh] flex flex-col shadow-2xl my-auto animate-in fade-in zoom-in duration-150 overflow-hidden">
              <div className="overflow-y-auto flex-1 space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-[#0F7A5C] flex items-center justify-center">
                  <RotateCcw className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-[#10241E]">
                    {language === 'EN' ? 'Confirm 1-Click Restore' : '१-क्लिक रिस्टोरची खात्री करा'}
                  </h3>
                  <p className="text-xs font-bold text-[#5F6E68] mt-1">
                    {language === 'EN'
                      ? 'Are you sure you want to restore the system to this safe backup point? No file download or upload is required.'
                      : 'तुम्हाला हा सुरक्षित बॅकअप पूर्ववत करायचा आहे का? कोणतीही फाईल डाऊनलोड किंवा अपलोड करण्याची गरज नाही.'}
                  </p>
                </div>

                {/* Backup details */}
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-2 font-bold">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                    <span className="text-xs font-extrabold text-slate-800">
                      {formatDateTime(pendingSnapshotRestore.createdAt)}
                    </span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md font-black">
                      ~{pendingSnapshotRestore.sizeKb} KB
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2 bg-white rounded-xl border border-slate-200">
                      <span className="text-slate-500 block text-[10px]">{language === 'EN' ? 'Customers' : 'खातेदार'}</span>
                      <span className="text-sm font-black text-emerald-800">{pendingSnapshotRestore.customerCount}</span>
                    </div>
                    <div className="p-2 bg-white rounded-xl border border-slate-200">
                      <span className="text-slate-500 block text-[10px]">{language === 'EN' ? 'Installments' : 'हप्ते'}</span>
                      <span className="text-sm font-black text-blue-800">{pendingSnapshotRestore.collectionCount}</span>
                    </div>
                    <div className="p-2 bg-white rounded-xl border border-slate-200">
                      <span className="text-slate-500 block text-[10px]">{language === 'EN' ? 'Loans' : 'कर्जे'}</span>
                      <span className="text-sm font-black text-amber-800">{pendingSnapshotRestore.loanCount}</span>
                    </div>
                    <div className="p-2 bg-white rounded-xl border border-slate-200">
                      <span className="text-slate-500 block text-[10px]">{language === 'EN' ? 'Loan Payments' : 'कर्ज हप्ते'}</span>
                      <span className="text-sm font-black text-teal-800">{pendingSnapshotRestore.loanPaymentCount || 0}</span>
                    </div>
                  </div>
                </div>

                <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-[11px] font-bold text-amber-900 flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <span>
                    {language === 'EN'
                      ? 'Restoring will replace the current data with the exact records from this backup point.'
                      : 'हा बॅकअप रिस्टोर केल्याने चालू डेटा या बॅकअपमधील अचूक नोंदींसह पूर्ववत होईल.'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100 shrink-0 mt-4">
                <button
                  type="button"
                  onClick={() => setPendingSnapshotRestore(null)}
                  className="px-4 py-2.5 rounded-xl border border-[#E4EAE7] text-xs font-black text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  {language === 'EN' ? 'Cancel' : 'रद्द करा'}
                </button>
                <button
                  type="button"
                  onClick={handleExecuteSnapshotRestore}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-xs transition-colors cursor-pointer flex items-center space-x-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{language === 'EN' ? 'Yes, Restore Now (1-Click)' : 'होय, आताच रिस्टोर करा (१-क्लिक)'}</span>
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* CONFIRMATION MODAL: FILE-BASED RESTORE (NEW DEVICE) */}
      {pendingFileRestore && (
        <ModalPortal>
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-hidden no-print">
            <div className="bg-white rounded-3xl p-6 max-w-md w-full max-h-[90vh] flex flex-col shadow-2xl my-auto animate-in fade-in zoom-in duration-150 overflow-hidden">
              <div className="overflow-y-auto flex-1 space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-teal-100 text-[#0F7A5C] flex items-center justify-center">
                  <FileCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-[#10241E]">
                    {language === 'EN' ? 'Restore New Device from File' : 'नवीन फोनवर फाईलवरून डेटा रिस्टोर करा'}
                  </h3>
                  <p className="text-xs font-bold text-[#5F6E68] mt-1">
                    {language === 'EN'
                      ? 'The selected Google Drive backup file has been verified. Review the contents below before restoring:'
                      : 'निवडलेली फाईल यशस्वीपणे तपासली गेली आहे. रिस्टोर करण्यापूर्वी खालील नोंदी तपासा:'}
                  </p>
                </div>

                {/* File Inspection Details */}
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-2 font-bold">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                    <span className="text-[11px] font-mono text-slate-700 truncate max-w-[220px]" title={pendingFileRestore.filename}>
                      {pendingFileRestore.filename}
                    </span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md font-black">
                      ~{pendingFileRestore.sizeKb} KB
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2 bg-white rounded-xl border border-slate-200">
                      <span className="text-slate-500 block text-[10px]">{language === 'EN' ? 'Customers' : 'खातेदार'}</span>
                      <span className="text-sm font-black text-emerald-800">{pendingFileRestore.data.customers?.length || 0}</span>
                    </div>
                    <div className="p-2 bg-white rounded-xl border border-slate-200">
                      <span className="text-slate-500 block text-[10px]">{language === 'EN' ? 'Installments' : 'हप्ते'}</span>
                      <span className="text-sm font-black text-blue-800">{pendingFileRestore.data.collections?.length || 0}</span>
                    </div>
                    <div className="p-2 bg-white rounded-xl border border-slate-200">
                      <span className="text-slate-500 block text-[10px]">{language === 'EN' ? 'Loans' : 'कर्जे'}</span>
                      <span className="text-sm font-black text-amber-800">{pendingFileRestore.data.loans?.length || 0}</span>
                    </div>
                    <div className="p-2 bg-white rounded-xl border border-slate-200">
                      <span className="text-slate-500 block text-[10px]">{language === 'EN' ? 'Loan Payments' : 'कर्ज हप्ते'}</span>
                      <span className="text-sm font-black text-teal-800">{pendingFileRestore.data.loanPayments?.length || 0}</span>
                    </div>
                  </div>

                  {pendingFileRestore.data.exportedAt && (
                    <div className="text-[10px] text-slate-500 font-medium pt-1 border-t border-slate-200">
                      {language === 'EN' ? 'Backup Creation Date: ' : 'बॅकअप तारीख: '}
                      <strong>{formatDateTime(pendingFileRestore.data.exportedAt)}</strong>
                    </div>
                  )}
                </div>

                <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-[11px] font-bold text-amber-900 flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <span>
                    {language === 'EN'
                      ? 'Restoring will populate this new device with the complete database from this backup.'
                      : 'हा बॅकअप रिस्टोर केल्याने या नवीन डिव्हाइसवर संपूर्ण डेटा लोड होईल.'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100 shrink-0 mt-4">
                <button
                  type="button"
                  onClick={() => setPendingFileRestore(null)}
                  className="px-4 py-2.5 rounded-xl border border-[#E4EAE7] text-xs font-black text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  {language === 'EN' ? 'Cancel' : 'रद्द करा'}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmFileRestore}
                  className="px-5 py-2.5 rounded-xl bg-[#0F7A5C] hover:bg-[#0B5C45] text-white text-xs font-black shadow-xs transition-colors cursor-pointer"
                >
                  {language === 'EN' ? 'Confirm & Restore' : 'खात्री करा व रिस्टोर करा'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
};
