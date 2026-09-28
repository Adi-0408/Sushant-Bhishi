import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { StorageService } from '../../services/db';
import { AutoBackupService, DEFAULT_DRIVE_WEBHOOK_URL } from '../../services/backup';
import { AutoBackupConfig, SystemBackupData } from '../../types';
import {
  Cloud,
  Download,
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
  ExternalLink,
  HelpCircle,
  Users,
  Receipt,
  Wallet,
  Layers,
  Sparkles,
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

  // Restore Modal State
  const [pendingFileRestore, setPendingFileRestore] = useState<{
    filename: string;
    data: SystemBackupData;
    sizeKb: number;
  } | null>(null);

  // Google Drive Cloud Backup State
  const [isUploadingToDrive, setIsUploadingToDrive] = useState(false);
  const [showDriveSettings, setShowDriveSettings] = useState(false);
  const [customWebhookUrl, setCustomWebhookUrl] = useState(
    () => AutoBackupService.getConfig().driveWebhookUrl || DEFAULT_DRIVE_WEBHOOK_URL
  );

  useEffect(() => {
    setAutoConfig(AutoBackupService.getConfig());
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

  const handleUploadToDrive = async () => {
    setIsUploadingToDrive(true);
    setRestoreError('');
    try {
      const res = await AutoBackupService.uploadToGoogleDrive(customWebhookUrl);
      setAutoConfig(AutoBackupService.getConfig());
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
            ? `Google Drive backup failed: ${res.message}`
            : `गुगल ड्राईव्ह बॅकअप अयशस्वी: ${res.message}`,
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
        ? (language === 'EN' ? 'Google Drive automatic daily backup enabled.' : 'गुगल ड्राईव्ह ऑटो-बॅकअप सुरू केला.')
        : (language === 'EN' ? 'Google Drive automatic daily backup disabled.' : 'गुगल ड्राईव्ह ऑटो-बॅकअप बंद केला.'),
      'info'
    );
  };

  const handleRestoreClick = () => {
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
      refreshData();
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
            <Cloud className="w-3.5 h-3.5 text-[#0F7A5C]" />
            <span>{language === 'EN' ? 'Google Drive Cloud Storage' : 'गुगल ड्राईव्ह क्लाउड स्टोरेज'}</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-[#10241E] tracking-tight flex items-center space-x-2.5">
            <FolderSync className="w-6 h-6 text-[#0F7A5C]" />
            <span>{language === 'EN' ? 'Google Drive Backup & Restore' : 'गुगल ड्राईव्ह बॅकअप व रिस्टोर'}</span>
          </h2>
          <p className="text-xs sm:text-sm text-[#5F6E68] font-bold mt-1">
            {language === 'EN'
              ? 'Zero-cost cloud protection: automatically saves backups directly to your Google Drive with 0 Firestore reads'
              : 'शून्य फायरस्टोअर रीड्ससह थेट तुमच्या गुगल ड्राईव्हवर सुरक्षित बॅकअप जतन व रिस्टोर करा'}
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
              {language === 'EN' ? 'Current System Database Status' : 'चालू डेटाबेस आरोग्य व आकडेवारी'}
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

      {/* PRIMARY GOOGLE DRIVE BACKUP CARD */}
      <div className="bg-gradient-to-br from-white via-emerald-50/20 to-teal-50/30 p-6 sm:p-7 rounded-3xl border-2 border-emerald-400 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-56 h-56 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
                <Cloud className="w-3.5 h-3.5 text-emerald-700" />
                <span>
                  {autoConfig.driveBackupEnabled !== false
                    ? (language === 'EN' ? 'Drive Auto-Sync: Active' : 'गुगल ड्राईव्ह ऑटो-सिंक: सक्रिय')
                    : (language === 'EN' ? 'Drive Auto-Sync: Paused' : 'गुगल ड्राईव्ह ऑटो-सिंक: बंद')}
                </span>
              </span>
              <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                <Sparkles className="w-3 h-3 text-amber-700" />
                <span>{language === 'EN' ? '0 Firestore Reads (100% Free)' : '० फायरस्टोअर रीड्स (१००% मोफत)'}</span>
              </span>
            </div>

            <h3 className="text-lg sm:text-xl font-black text-[#10241E] flex items-center space-x-2">
              <span>
                {language === 'EN'
                  ? 'Backup to Google Drive Folder'
                  : 'गुगल ड्राईव्हवर सुरक्षित बॅकअप'}
              </span>
            </h3>

            <p className="text-xs sm:text-sm text-[#5F6E68] font-bold max-w-2xl leading-relaxed">
              {language === 'EN'
                ? 'Your entire database (all customers, bishi collection receipts, loans, loan payments, configs) is saved into the "Sushant_Bishi_Backups" folder in Google Drive. Automatically keeps the newest 10 backups.'
                : 'सर्व खातेदार, भिशी हप्ते, कर्ज, व्याज आणि दंड यांचा संपूर्ण सुरक्षित बॅकअप गुगल ड्राईव्हमधील "Sushant_Bishi_Backups" फोल्डरमध्ये सेव्ह होतो. दरवेळी नवीन बॅकअप सेव्ह होऊन सर्वात जुन्या १० फाईल्स सुरक्षित ठेवल्या जातात.'}
            </p>

            {/* Status Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="p-3 bg-white rounded-2xl border border-[#E4EAE7] shadow-2xs flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-[#5F6E68]">
                    {language === 'EN' ? 'Last Saved Drive Backup' : 'शेवटचा गुगल ड्राईव्ह बॅकअप'}
                  </div>
                  <div className="text-xs font-black text-[#10241E] truncate">
                    {formatDateTime(autoConfig.lastDriveBackupTimestamp)}
                  </div>
                  {autoConfig.lastDriveBackupFilename && (
                    <div className="text-[10px] text-slate-500 font-mono truncate max-w-[220px]" title={autoConfig.lastDriveBackupFilename}>
                      {autoConfig.lastDriveBackupFilename}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-3 bg-white rounded-2xl border border-[#E4EAE7] shadow-2xs flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-[#0F7A5C] flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-[#5F6E68]">
                    {language === 'EN' ? 'Drive Folder Name' : 'ड्राईव्ह फोल्डर नाव'}
                  </div>
                  <div className="text-xs font-black text-[#10241E] truncate">
                    Sushant_Bishi_Backups
                  </div>
                  <div className="text-[10px] text-emerald-700 font-bold">
                    {language === 'EN' ? 'Auto-rotates latest 10 files' : 'फक्त नवीनतम १० फायली सुरक्षित'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Action & Toggle Controls */}
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
                  <span>{language === 'EN' ? 'Backup to Google Drive Now' : 'Google Drive वर आताच सेव्ह करा'}</span>
                </>
              )}
            </button>

            <div className="flex items-center justify-between p-3 bg-white rounded-2xl border border-[#E4EAE7] shadow-2xs">
              <span className="text-xs font-black text-[#10241E]">
                {language === 'EN' ? 'Daily automatic Drive sync' : 'दररोज रात्री आपोआप सेव्ह'}
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
              <span>{showDriveSettings ? (language === 'EN' ? 'Hide Script URL' : 'URL लपवा') : (language === 'EN' ? 'Script Webhook URL' : 'गुगल स्क्रिप्ट URL')}</span>
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

      {/* RESTORE FROM GOOGLE DRIVE BACKUP SECTION */}
      <div className="bg-white p-6 sm:p-7 rounded-3xl border border-[#E4EAE7] shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-black bg-blue-50 text-blue-800 border border-blue-200 mb-2">
              <Upload className="w-3.5 h-3.5 text-blue-600" />
              <span>{language === 'EN' ? 'Restore System Data' : 'डेटा पुनर्संचयित (Restore)'}</span>
            </div>
            <h3 className="text-lg sm:text-xl font-black text-[#10241E]">
              {language === 'EN'
                ? 'Restore from Google Drive Backup File'
                : 'गुगल ड्राईव्ह बॅकअपवरून डेटा पूर्ववत करा (Restore)'}
            </h3>
            <p className="text-xs sm:text-sm text-[#5F6E68] font-bold mt-1 max-w-2xl">
              {language === 'EN'
                ? 'Select any backup JSON file downloaded from your Google Drive folder "Sushant_Bishi_Backups" to verify and restore your complete database.'
                : 'तुमच्या गुगल ड्राईव्हमधील "Sushant_Bishi_Backups" फोल्डरमधून डाऊनलोड केलेली कोणतीही बॅकअप JSON फाईल निवडून डेटा पूर्ववत करा.'}
            </p>
          </div>

          <button
            onClick={handleRestoreClick}
            className="py-3.5 px-6 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs sm:text-sm flex items-center justify-center space-x-2 shadow-md transition-all cursor-pointer self-start sm:self-auto shrink-0"
          >
            <Upload className="w-4 h-4" />
            <span>{language === 'EN' ? 'Select Drive Backup File & Restore' : 'ड्राईव्ह फाईल निवडा व Restore करा'}</span>
          </button>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".json"
            className="hidden"
          />
        </div>

        {/* STEP-BY-STEP EXPLANATION GUIDE: HOW TO RESTORE FROM GOOGLE DRIVE */}
        <div className="bg-[#F8FAF9] p-5 sm:p-6 rounded-2xl border border-[#E4EAE7] space-y-4">
          <div className="flex items-center space-x-2 text-xs font-black text-[#10241E]">
            <HelpCircle className="w-4 h-4 text-[#0F7A5C]" />
            <span>{language === 'EN' ? 'Step-by-Step: How to Restore Your Data from Google Drive' : 'मार्गदर्शन: गुगल ड्राईव्हवरून डेटा कसा रिस्टोर करावा?'}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {/* Step 1 */}
            <div className="p-4 rounded-xl bg-white border border-[#E4EAE7] space-y-2 shadow-2xs">
              <div className="w-7 h-7 rounded-lg bg-emerald-100 text-[#0B5C45] font-black text-xs flex items-center justify-center">
                1
              </div>
              <h4 className="text-xs font-black text-slate-900">
                {language === 'EN' ? 'Open Google Drive' : 'गुगल ड्राईव्ह उघडा'}
              </h4>
              <p className="text-[11px] text-[#5F6E68] font-medium leading-relaxed">
                {language === 'EN'
                  ? 'Go to drive.google.com on your phone or PC and open the folder named "Sushant_Bishi_Backups".'
                  : 'तुमच्या फोन किंवा कॉम्प्युटरवर drive.google.com उघडा आणि "Sushant_Bishi_Backups" फोल्डरमध्ये जा.'}
              </p>
            </div>

            {/* Step 2 */}
            <div className="p-4 rounded-xl bg-white border border-[#E4EAE7] space-y-2 shadow-2xs">
              <div className="w-7 h-7 rounded-lg bg-emerald-100 text-[#0B5C45] font-black text-xs flex items-center justify-center">
                2
              </div>
              <h4 className="text-xs font-black text-slate-900">
                {language === 'EN' ? 'Download the Backup File' : 'नवीनतम फाईल डाऊनलोड करा'}
              </h4>
              <p className="text-[11px] text-[#5F6E68] font-medium leading-relaxed">
                {language === 'EN'
                  ? 'Right-click on the latest backup file (e.g. Sushant_Bishi_CloudDriveBackup_...json) and click Download.'
                  : 'फोल्डरमधील नवीनतम बॅकअप फाईलवर (उदा. Sushant_Bishi_CloudDriveBackup_...json) क्लिक करून डाऊनलोड करा.'}
              </p>
            </div>

            {/* Step 3 */}
            <div className="p-4 rounded-xl bg-white border border-[#E4EAE7] space-y-2 shadow-2xs">
              <div className="w-7 h-7 rounded-lg bg-emerald-100 text-[#0B5C45] font-black text-xs flex items-center justify-center">
                3
              </div>
              <h4 className="text-xs font-black text-slate-900">
                {language === 'EN' ? 'Upload & Confirm Restore' : 'येथे फाईल निवडून रिस्टोर करा'}
              </h4>
              <p className="text-[11px] text-[#5F6E68] font-medium leading-relaxed">
                {language === 'EN'
                  ? 'Click "Select Drive Backup File & Restore" above, choose the downloaded file, check the preview, and confirm!'
                  : 'वरील बटणावर क्लिक करा, डाऊनलोड केलेली फाईल निवडा, तपासणी पाहा आणि "Confirm & Restore" वर क्लिक करा!'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* CONFIRMATION RESTORE FROM UPLOADED JSON FILE MODAL */}
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
                    {language === 'EN' ? 'Verify & Restore Backup Data' : 'बॅकअप फाईल तपासा व पुनर्संचयित करा'}
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
                      ? 'Restoring will update your system with the exact records from this Google Drive backup.'
                      : 'हा बॅकअप रिस्टोर केल्याने चालू डेटा या फाईलमधील डेटाने पूर्ववत केला जाईल.'}
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
