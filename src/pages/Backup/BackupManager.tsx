import React, { useRef, useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { StorageService } from '../../services/db';
import { AutoBackupService } from '../../services/backup';
import { AutoBackupConfig, LocalBackupSnapshot } from '../../types';
import {
  HardDrive,
  Download,
  Upload,
  AlertCircle,
  CheckCircle2,
  Cloud,
  RefreshCw,
  Clock,
  Calendar,
  ShieldCheck,
  FileText,
  Trash2,
  RotateCcw,
  Sparkles,
  Zap,
} from 'lucide-react';
import { formatDateMarathi } from '../../utils/formatters';
import { ModalPortal } from '../../components/common/ModalPortal';
import { runClientV2Migration } from '../../services/migration';

export const BackupManager: React.FC = () => {
  const { refreshData, showToast, syncStatus, syncWithFirebase, clearAllData, language } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [restoreError, setRestoreError] = useState('');
  const [autoConfig, setAutoConfig] = useState<AutoBackupConfig>(() => AutoBackupService.getConfig());
  const [snapshots, setSnapshots] = useState<LocalBackupSnapshot[]>(() => AutoBackupService.getLocalSnapshots());
  const [selectedSnapshotForRestore, setSelectedSnapshotForRestore] = useState<LocalBackupSnapshot | null>(null);
  const [isClearAllModalOpen, setIsClearAllModalOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // v2 Schema Migration & Read-Count Optimization State
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationLogs, setMigrationLogs] = useState<string[]>([]);
  const [migrationFinished, setMigrationFinished] = useState(false);

  useEffect(() => {
    setAutoConfig(AutoBackupService.getConfig());
    setSnapshots(AutoBackupService.getLocalSnapshots());
  }, []);

  const handleDownloadBackup = () => {
    const backupData = StorageService.exportBackup();
    const filename = AutoBackupService.generateBackupFilename('Sushant_Bishi_ManualBackup');
    AutoBackupService.downloadBackupFile(backupData, filename);
    AutoBackupService.saveSnapshotLocally(backupData, filename);
    setSnapshots(AutoBackupService.getLocalSnapshots());

    showToast(
      language === 'EN'
        ? 'Backup JSON file successfully saved to device.'
        : 'बॅकअप JSON फाईल यशस्वीपणे डिव्हाइसवर सेव्ह झाली.',
      'success'
    );
  };

  const handleInstantAutoBackup = () => {
    try {
      const { filename } = AutoBackupService.performBackupNow();
      setAutoConfig(AutoBackupService.getConfig());
      setSnapshots(AutoBackupService.getLocalSnapshots());
      showToast(
        language === 'EN'
          ? `Backup successfully downloaded and saved: ${filename}`
          : `स्थानिक बॅकअप यशस्वीपणे डाउनलोड व सेव्ह झाला: ${filename}`,
        'success'
      );
    } catch (err: any) {
      showToast(
        language === 'EN' ? 'Failed to perform backup.' : 'बॅकअप घेताना त्रुटी आली.',
        'error'
      );
    }
  };

  const handleToggleAutoBackup = (enabled: boolean) => {
    const updated = { ...autoConfig, enabled };
    AutoBackupService.saveConfig(updated);
    setAutoConfig(updated);
    showToast(
      enabled
        ? (language === 'EN' ? 'Auto-backup enabled (every 2 days).' : 'स्वयंचलित बॅकअप सुरू केला (प्रत्येक २ दिवसांनी).')
        : (language === 'EN' ? 'Auto-backup disabled.' : 'स्वयंचलित बॅकअप बंद केला.'),
      'info'
    );
  };

  const handleRestoreSnapshot = (snapshot: LocalBackupSnapshot) => {
    try {
      StorageService.importBackup(snapshot.data);
      showToast(
        language === 'EN'
          ? `Data restored from snapshot (${snapshot.filename})`
          : `डेटा रिस्टोर पॉईंटवरून यशस्वीपणे पुनर्संचयित झाला (${snapshot.filename})`,
        'success'
      );
      refreshData();
      setSelectedSnapshotForRestore(null);
    } catch (err: any) {
      setRestoreError(err.message || 'पुनर्संचयित करताना त्रुटी आली.');
    }
  };

  const handleDeleteSnapshot = (id: string) => {
    AutoBackupService.deleteSnapshot(id);
    setSnapshots(AutoBackupService.getLocalSnapshots());
    showToast(
      language === 'EN' ? 'Snapshot removed from device.' : 'रिस्टोर पॉईंट डिव्हाइसवरून हटवला.',
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

        StorageService.importBackup(parsed);
        showToast(
          language === 'EN'
            ? 'Data successfully restored from file.'
            : 'डेटा फाईलवरून यशस्वीपणे पुनर्संचयित (Restore) झाला.',
          'success'
        );
        refreshData();
        // Also save as snapshot
        AutoBackupService.saveSnapshotLocally(parsed, file.name || 'Imported_Backup.json');
        setSnapshots(AutoBackupService.getLocalSnapshots());
      } catch (err: any) {
        setRestoreError(err.message || 'अवैध फाईल फॉरमॅट. पुनर्संचयित करण्यात त्रुटी.');
      }
    };
    reader.readAsText(file);
  };

  const handleRunMigration = async () => {
    setIsMigrating(true);
    setMigrationFinished(false);
    setMigrationLogs([]);
    try {
      const res = await runClientV2Migration((msg) => {
        setMigrationLogs((prev) => [...prev, msg]);
      });
      if (res.success) {
        setMigrationFinished(true);
        showToast(
          language === 'EN'
            ? 'v2 Schema Optimization & Stats migration completed successfully!'
            : 'v2 डेटाबेस ऑप्टिमायझेशन व आकडेवारी स्थलांतर यशस्वी झाले!',
          'success'
        );
        refreshData();
      }
    } catch (err: any) {
      setMigrationLogs((prev) => [...prev, `त्रुटी: ${err?.message || err}`]);
      showToast(
        language === 'EN' ? 'Migration failed: ' + (err?.message || 'Error') : 'स्थलांतर अयशस्वी झाले.',
        'error'
      );
    } finally {
      setIsMigrating(false);
    }
  };

  const nextBackupDate = AutoBackupService.getNextBackupDate(autoConfig);

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="bg-white p-5 rounded-2xl border border-[#E4EAE7] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-[#10241E] tracking-tight flex items-center space-x-2.5">
            <HardDrive className="w-6 h-6 text-[#0F7A5C]" />
            <span>{language === 'EN' ? 'Data Backup & Recovery' : 'डेटा बॅकअप व पुनर्संचयन (Backup & Restore)'}</span>
          </h2>
          <p className="text-xs text-[#5F6E68] font-bold mt-1">
            {language === 'EN'
              ? 'Automatic 2-day local backup, local snapshots, and system restore'
              : 'स्थानिक डिव्हाइसवर दर २ दिवसांनी स्वयंचलित बॅकअप व रिस्टोर व्यवस्थापन'}
          </p>
        </div>

        <button
          onClick={handleInstantAutoBackup}
          className="h-11 px-5 rounded-xl bg-[#0F7A5C] hover:bg-[#0B5C45] text-white font-black text-xs sm:text-sm flex items-center justify-center space-x-2 shadow-sm transition-all cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>{language === 'EN' ? 'Backup & Save to Device Now' : 'आताच डिव्हाइसवर बॅकअप सेव्ह करा'}</span>
        </button>
      </div>

      {restoreError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs sm:text-sm font-bold flex items-center space-x-2 shadow-xs">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600" />
          <span>{restoreError}</span>
        </div>
      )}

      {/* FEATURED: 2-DAY AUTOMATIC LOCAL BACKUP STATUS CARD */}
      <div className="bg-gradient-to-br from-white to-[#F4F6F5] p-6 sm:p-7 rounded-3xl border-2 border-emerald-300 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-[#0F7A5C]/5 rounded-full blur-2xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-black bg-[#e6f4f0] text-[#0B5C45] border border-emerald-200">
                <ShieldCheck className="w-3.5 h-3.5 text-[#0F7A5C]" />
                <span>
                  {autoConfig.enabled
                    ? (language === 'EN' ? 'Active: Every 2 Days' : 'सक्रिय: दर २ दिवसांनी स्वयंचलित बॅकअप')
                    : (language === 'EN' ? 'Paused' : 'स्वयंचलित बॅकअप बंद आहे')}
                </span>
              </span>
              <span className="text-[11px] font-bold text-[#5F6E68]">
                {language === 'EN' ? 'Local Device Storage (Downloads + Browser Snapshots)' : 'स्थानिक डिव्हाइस स्टोरेज (डाऊनलोड + स्थानिक रिस्टोर पॉइंट्स)'}
              </span>
            </div>

            <h3 className="text-lg sm:text-xl font-black text-[#10241E]">
              {language === 'EN'
                ? 'Automatic 2-Day Local Device Backup'
                : 'दर २ दिवसांनी स्वयंचलित डेटा बॅकअप (Auto 2-Day Backup)'}
            </h3>

            <p className="text-xs sm:text-sm text-[#5F6E68] font-bold max-w-2xl leading-relaxed">
              {language === 'EN'
                ? 'Your entire database (customers, bishi accounts, weekly/monthly collections, loans, interest, penalties) is automatically compiled and saved directly onto your device every 2 days.'
                : 'सर्व खातेदार, भिशी खाती, जमा हप्ते, कर्ज, व्याज आणि दंड यांचा सुरक्षित बॅकअप दर २ दिवसांनी आपोआप तयार होऊन तुमच्या स्थानिक डिव्हाइसवर सेव्ह केला जातो.'}
            </p>

            {/* Schedule Timeline Badges */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="p-3 bg-white rounded-2xl border border-[#E4EAE7] shadow-2xs flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-[#0F7A5C] flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-[#5F6E68]">
                    {language === 'EN' ? 'Last Saved Backup' : 'शेवटचा सेव्ह झालेला बॅकअप'}
                  </div>
                  <div className="text-xs font-black text-[#10241E] truncate">
                    {autoConfig.lastBackupTimestamp
                      ? new Date(autoConfig.lastBackupTimestamp).toLocaleString('mr-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : (language === 'EN' ? 'Not yet recorded' : 'अद्याप झालेला नाही')}
                  </div>
                </div>
              </div>

              <div className="p-3 bg-white rounded-2xl border border-[#E4EAE7] shadow-2xs flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                  <Calendar className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-[#5F6E68]">
                    {language === 'EN' ? 'Next Scheduled Backup' : 'पुढील स्वयंचलित बॅकअप'}
                  </div>
                  <div className="text-xs font-black text-[#10241E] truncate">
                    {nextBackupDate
                      ? nextBackupDate.toLocaleString('mr-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : (language === 'EN' ? 'Inactive' : 'बंद आहे')}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Action & Toggle Controls */}
          <div className="flex flex-col sm:flex-row lg:flex-col gap-3 shrink-0 lg:w-64">
            <button
              type="button"
              onClick={handleInstantAutoBackup}
              className="w-full py-3 px-4 rounded-2xl bg-[#0F7A5C] hover:bg-[#0B5C45] text-white font-black text-xs sm:text-sm flex items-center justify-center space-x-2 shadow-sm transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>{language === 'EN' ? 'Backup to Device Now' : 'आताच बॅकअप सेव्ह करा'}</span>
            </button>

            <div className="flex items-center justify-between p-3 bg-white rounded-2xl border border-[#E4EAE7] shadow-2xs">
              <span className="text-xs font-black text-[#10241E]">
                {language === 'EN' ? 'Auto-backup every 2 days' : '२ दिवसांचा स्वयंचलित बॅकअप'}
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoConfig.enabled}
                  onChange={(e) => handleToggleAutoBackup(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0F7A5C]"></div>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* LOCAL SNAPSHOTS SAVED ON THIS DEVICE */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#E4EAE7] shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base sm:text-lg font-black text-[#10241E] flex items-center space-x-2">
              <ShieldCheck className="w-5 h-5 text-[#0F7A5C]" />
              <span>{language === 'EN' ? 'Local Device Restore Points (Snapshots)' : 'स्थानिक डिव्हाइसवरील बॅकअप रिस्टोर पॉइंट्स'}</span>
            </h3>
            <p className="text-xs text-[#5F6E68] font-bold">
              {language === 'EN'
                ? 'Saved snapshots stored directly in this device browser for quick 1-click restore or download'
                : 'या डिव्हाइसवर सेव्ह झालेले बॅकअप रिस्टोर पॉइंट्स — १ क्लिकमध्ये पूर्ववत किंवा पुन्हा डाउनलोड करा'}
            </p>
          </div>

          <span className="text-xs font-black px-3 py-1 bg-emerald-50 text-[#0F7A5C] rounded-full border border-emerald-200 self-start sm:self-auto">
            {snapshots.length} {language === 'EN' ? 'Snapshots' : 'रिस्टोर पॉइंट्स उपलब्ध'}
          </span>
        </div>

        {snapshots.length === 0 ? (
          <div className="p-8 text-center bg-[#F4F6F5]/60 rounded-2xl border border-dashed border-[#E4EAE7] space-y-2">
            <FileText className="w-8 h-8 mx-auto text-[#5F6E68]/60" />
            <div className="text-xs font-black text-[#5F6E68]">
              {language === 'EN' ? 'No local snapshots stored yet.' : 'या डिव्हाइसवर अद्याप कोणतेही रिस्टोर पॉइंट सेव्ह नाहीत.'}
            </div>
            <p className="text-[11px] text-[#5F6E68]">
              {language === 'EN' ? 'Click "Backup to Device Now" to create your first snapshot.' : 'पहिला रिस्टोर पॉइंट तयार करण्यासाठी "आताच डिव्हाइसवर बॅकअप सेव्ह करा" वर क्लिक करा.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-[#F4F6F5] text-[#10241E] font-black border-b border-[#E4EAE7]">
                <tr>
                  <th className="py-3 px-4 rounded-l-xl">{language === 'EN' ? 'Date & Time' : 'तारीख व वेळ'}</th>
                  <th className="py-3 px-4">{language === 'EN' ? 'File Name' : 'फाईल नाव'}</th>
                  <th className="py-3 px-4">{language === 'EN' ? 'Records' : 'नोंदी तपशील'}</th>
                  <th className="py-3 px-4">{language === 'EN' ? 'Size' : 'फाईल आकार'}</th>
                  <th className="py-3 px-4 text-right rounded-r-xl">{language === 'EN' ? 'Actions' : 'कृती'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4EAE7]/70">
                {snapshots.map((snap) => (
                  <tr key={snap.id} className="hover:bg-emerald-50/40 transition-colors font-bold">
                    <td className="py-3 px-4 text-[#10241E] whitespace-nowrap">
                      {new Date(snap.createdAt).toLocaleString('mr-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-mono text-[11px] truncate max-w-[200px]" title={snap.filename}>
                      {snap.filename}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-[#0B5C45] font-black text-[11px] mr-1.5">
                        {snap.customerCount} {language === 'EN' ? 'Cust' : 'खातेदार'}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-900 font-black text-[11px] mr-1.5">
                        {snap.collectionCount} {language === 'EN' ? 'Colls' : 'हप्ते'}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-black text-[11px]">
                        {snap.loanCount} {language === 'EN' ? 'Loans' : 'कर्ज'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[#5F6E68] whitespace-nowrap text-xs font-black">
                      ~{snap.sizeKb} KB
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap space-x-1.5">
                      <button
                        type="button"
                        onClick={() => AutoBackupService.downloadBackupFile(snap.data, snap.filename)}
                        className="px-2.5 py-1.5 rounded-lg bg-white border border-[#E4EAE7] hover:border-[#0F7A5C] text-[#0B5C45] hover:bg-[#e6f4f0] text-xs font-black transition-colors inline-flex items-center space-x-1 shadow-2xs cursor-pointer"
                        title={language === 'EN' ? 'Re-download this file' : 'ही फाईल पुन्हा डाउनलोड करा'}
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{language === 'EN' ? 'Download' : 'डाउनलोड'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedSnapshotForRestore(snap)}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black transition-colors inline-flex items-center space-x-1 shadow-2xs cursor-pointer"
                        title={language === 'EN' ? 'Restore this snapshot' : 'हा रिस्टोर पॉईंट लागू करा'}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{language === 'EN' ? 'Restore' : 'रिस्टोर'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteSnapshot(snap.id)}
                        className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors inline-flex items-center cursor-pointer"
                        title={language === 'EN' ? 'Delete snapshot' : 'हटवा'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MANUAL BACKUP & RESTORE GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Backup Download Card */}
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E4EAE7] shadow-xs flex flex-col justify-between space-y-6">
          <div>
            <div className="w-12 h-12 rounded-2xl bg-[#e6f4f0] text-[#0F7A5C] flex items-center justify-center mb-4">
              <Download className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-black text-[#10241E] mb-2">
              {language === 'EN' ? 'Manual Backup & Download' : 'मॅन्युअल बॅकअप तयार करा व डाउनलोड करा'}
            </h3>
            <p className="text-xs text-[#5F6E68] font-bold leading-relaxed">
              {language === 'EN'
                ? 'Generates a fresh, full snapshot of your current database into a JSON file and prompts browser download.'
                : 'प्रशासक, सर्व खातेदार, भिशी, जमा नोंदी, कर्ज, व्याज, दंड आणि सेटिंग्जसह सर्व डेटा एका सुरक्षित JSON फाईलमध्ये डाउनलोड होईल.'}
            </p>
          </div>

          <button
            onClick={handleDownloadBackup}
            className="w-full py-3 rounded-xl bg-[#10241E] hover:bg-[#0B5C45] text-white font-black text-sm transition-all shadow-md flex items-center justify-center space-x-2 cursor-pointer"
          >
            <Download className="w-5 h-5" />
            <span>{language === 'EN' ? 'Download JSON Backup' : 'मॅन्युअल बॅकअप डाउनलोड करा'}</span>
          </button>
        </div>

        {/* Restore Card */}
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E4EAE7] shadow-xs flex flex-col justify-between space-y-6">
          <div>
            <div className="w-12 h-12 rounded-2xl bg-[#e6f4f0] text-[#0F7A5C] flex items-center justify-center mb-4">
              <Upload className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-black text-[#10241E] mb-2">
              {language === 'EN' ? 'Restore from JSON File' : 'बॅकअप पुनर्संचयित करा (Restore from File)'}
            </h3>
            <p className="text-xs text-[#5F6E68] font-bold leading-relaxed">
              {language === 'EN'
                ? 'Select a previously downloaded backup JSON file from your device to restore the complete database.'
                : 'आधी डाउनलोड केलेली कोणतीही बॅकअप JSON फाईल निवडून सिस्टीमचा संपूर्ण डेटा पूर्ववत करा.'}
            </p>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".json"
            className="hidden"
          />

          <button
            onClick={handleRestoreClick}
            className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-sm transition-all shadow-md flex items-center justify-center space-x-2 cursor-pointer"
          >
            <Upload className="w-5 h-5" />
            <span>{language === 'EN' ? 'Select JSON File & Restore' : 'बॅकअप फाईल निवडा व Restore करा'}</span>
          </button>
        </div>
      </div>

      {/* Cloud Database Sync Card */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E4EAE7] shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="flex items-start space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
              <Cloud className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <h3 className="text-lg font-black text-[#10241E]">
                  {language === 'EN' ? 'Firebase Live Cloud Database Sync' : 'Firebase क्लाउड डेटाबेस थेट सिंक (Live Cloud Sync)'}
                </h3>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border ${
                  syncStatus === 'syncing'
                    ? 'bg-amber-50 border-amber-300 text-amber-800'
                    : syncStatus === 'synced'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                    : syncStatus === 'error'
                    ? 'bg-rose-50 border-rose-300 text-rose-800'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    syncStatus === 'syncing'
                      ? 'bg-amber-500 animate-ping'
                      : syncStatus === 'synced'
                      ? 'bg-emerald-500'
                      : syncStatus === 'error'
                      ? 'bg-rose-500'
                      : 'bg-[#0F7A5C]'
                  }`} />
                  {syncStatus === 'syncing'
                    ? (language === 'EN' ? 'Syncing...' : 'सिंक होत आहे...')
                    : syncStatus === 'synced'
                    ? (language === 'EN' ? 'Connected & Synced' : 'क्लाउड सिंक पूर्ण')
                    : syncStatus === 'error'
                    ? (language === 'EN' ? 'Sync Error' : 'सिंक त्रुटी')
                    : (language === 'EN' ? 'Live Cloud Connected' : 'क्लाउड कनेक्टेड')}
                </span>
              </div>
              <p className="text-xs text-[#5F6E68] font-bold leading-relaxed max-w-2xl">
                {language === 'EN'
                  ? 'Sync all customers, bishi accounts, weekly/monthly installments, loans, payments, and configs directly to your Google Firebase cloud database.'
                  : 'सर्व खातेदार, त्यांचे तपशील, कर्ज, हप्ते जमा नोंदी आणि सर्व भिशी डेटा तुमच्या जोडलेल्या Firebase क्लाउड डेटाबेसमध्ये थेट आणि सुरक्षित जतन करा.'}
              </p>
            </div>
          </div>

          <button
            onClick={syncWithFirebase}
            disabled={syncStatus === 'syncing'}
            className="py-3 px-6 rounded-xl bg-[#0F7A5C] hover:bg-[#0B5C45] active:scale-[0.98] text-white font-black text-sm transition-all shadow-md hover:shadow-lg flex items-center justify-center space-x-2 shrink-0 disabled:opacity-50 cursor-pointer min-h-[44px] touch-target"
          >
            {syncStatus === 'syncing' ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
                <span>{language === 'EN' ? 'Syncing to Cloud...' : 'क्लाउडवर सिंक होत आहे...'}</span>
              </>
            ) : (
              <>
                <Cloud className="w-4 h-4" />
                <span>{language === 'EN' ? 'Sync to Cloud Now' : 'सर्व डेटा क्लाउडवर सिंक करा'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* V2 Schema Optimization & Migration Card */}
      <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-emerald-950 p-6 sm:p-8 rounded-3xl border border-indigo-500/30 shadow-lg text-white">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-start space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-400/30 flex items-center justify-center shrink-0">
              <Zap className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center space-x-2 mb-1.5">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Firebase Spark Saver
                </span>
                <span className="text-xs text-indigo-200 font-bold">
                  v2 High-Performance Schema
                </span>
              </div>
              <h3 className="text-lg font-black text-white">
                {language === 'EN'
                  ? 'Firestore Read Optimizer & v2 Migration'
                  : 'फायरस्टोअर रीड ऑप्टिमायझर व v2 स्थलांतर (1-Click Run)'}
              </h3>
              <p className="text-xs text-slate-300 font-medium leading-relaxed max-w-2xl mt-1">
                {language === 'EN'
                  ? 'Generates the stats/summary singleton document, indexes customer names for instant prefix search, and creates the installments collection to slash Firestore read counts to ~1 on dashboard loads.'
                  : 'stats/summary डॉक्युमेंट तयार करते, ग्राहकांच्या नावांचे सर्च इंडेक्सिंग करते, आणि हप्त्यांचे वेळापत्रक तयार करून डॅशबोर्ड लोड रीड्स १०,००० वरून थेट १ वर आणते.'}
              </p>
            </div>
          </div>

          <button
            onClick={handleRunMigration}
            disabled={isMigrating}
            className="py-3 px-6 rounded-xl bg-gradient-to-r from-amber-400 to-emerald-400 hover:from-amber-500 hover:to-emerald-500 active:scale-95 text-slate-950 font-black text-sm transition-all shadow-lg flex items-center justify-center space-x-2 shrink-0 disabled:opacity-50 cursor-pointer min-h-[44px]"
          >
            {isMigrating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                <span>{language === 'EN' ? 'Optimizing...' : 'स्थलांतर होत आहे...'}</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-slate-950" />
                <span>{language === 'EN' ? 'Run v2 Migration Now' : 'v2 ऑप्टिमायझेशन सुरू करा'}</span>
              </>
            )}
          </button>
        </div>

        {/* Live Migration Logs */}
        {migrationLogs.length > 0 && (
          <div className="mt-4 p-4 rounded-2xl bg-black/50 border border-white/10 font-mono text-xs text-emerald-300 max-h-48 overflow-y-auto space-y-1">
            {migrationLogs.map((log, idx) => (
              <div key={idx} className="flex items-center space-x-2">
                <span className="text-slate-500">[{idx + 1}]</span>
                <span>{log}</span>
              </div>
            ))}
            {migrationFinished && (
              <div className="text-amber-300 font-bold pt-1">
                ✓ {language === 'EN' ? 'Migration finished successfully! 100% optimized.' : 'स्थलांतर यशस्वीरित्या पूर्ण झाले! १००% ऑप्टिमाइझ झाले.'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Danger Zone: Wipe All Data */}
      <div className="bg-red-50/50 p-6 sm:p-8 rounded-3xl border border-red-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-black text-red-900 mb-1">
                {language === 'EN' ? 'Wipe / Reset All Data' : 'संपूर्ण डेटा हटवा (Delete All Data)'}
              </h3>
              <p className="text-xs text-red-700 font-bold leading-relaxed max-w-2xl">
                {language === 'EN'
                  ? 'Permanently deletes all customers, collection installments, loans, payments, and SMS logs from both local storage and cloud database.'
                  : 'स्थानिक डिव्हाइस व क्लाउड डेटाबेसमधून सर्व खातेदार, जमा हप्ते, कर्जे, पावती नोंदी कायमस्वरूपी काढून टाकल्या जातील.'}
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsClearAllModalOpen(true)}
            className="py-3 px-6 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-sm transition-all shadow-md flex items-center justify-center space-x-2 shrink-0 cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>{language === 'EN' ? 'Clear All Data' : 'सर्व डेटा हटवा'}</span>
          </button>
        </div>
      </div>

      {/* CONFIRMATION CLEAR ALL DATA MODAL */}
      {isClearAllModalOpen && (
        <ModalPortal>
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-hidden no-print">
            <div className="bg-white rounded-3xl p-6 max-w-md w-full max-h-[90vh] flex flex-col shadow-2xl my-auto animate-in fade-in zoom-in duration-150 overflow-hidden">
              <div className="overflow-y-auto flex-1 space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-700 flex items-center justify-center">
                  <Trash2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">
                    {language === 'EN' ? 'Are you sure you want to delete all data?' : 'तुम्हाला खात्री आहे की सर्व डेटा हटवायचा आहे?'}
                  </h3>
                  <p className="text-xs font-bold text-slate-500 mt-2 leading-relaxed">
                    {language === 'EN'
                      ? 'This action cannot be undone. All customers, installments, loans, and cloud data will be wiped cleanly and will NOT return.'
                      : 'ही कृती पूर्ववत करता येणार नाही. सर्व खातेदार, हप्ते आणि कर्जे पूर्णपणे हटवली जातील आणि ती परत येणार नाहीत.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100 shrink-0 mt-4">
                <button
                  type="button"
                  disabled={isClearing}
                  onClick={() => setIsClearAllModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-black text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  {language === 'EN' ? 'Cancel' : 'रद्द करा'}
                </button>
                <button
                  type="button"
                  disabled={isClearing}
                  onClick={async () => {
                    setIsClearing(true);
                    try {
                      await clearAllData();
                      setIsClearAllModalOpen(false);
                    } finally {
                      setIsClearing(false);
                    }
                  }}
                  className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black shadow-xs transition-colors flex items-center space-x-2 cursor-pointer disabled:opacity-50"
                >
                  {isClearing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>{language === 'EN' ? 'Deleting...' : 'हटवत आहे...'}</span>
                    </>
                  ) : (
                    <span>{language === 'EN' ? 'Yes, Delete Everything' : 'होय, सर्व डेटा हटवा'}</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* CONFIRMATION RESTORE MODAL */}
      {selectedSnapshotForRestore && (
        <ModalPortal>
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-hidden no-print">
            <div className="bg-white rounded-3xl p-6 max-w-md w-full max-h-[90vh] flex flex-col shadow-2xl my-auto animate-in fade-in zoom-in duration-150 overflow-hidden">
            <div className="overflow-y-auto flex-1 space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-[#10241E]">
                  {language === 'EN' ? 'Confirm Restore from Snapshot?' : 'हा रिस्टोर पॉईंट लागू करायचा आहे का?'}
                </h3>
                <p className="text-xs font-bold text-[#5F6E68] mt-1">
                  {language === 'EN'
                    ? `Restoring "${selectedSnapshotForRestore.filename}" (${selectedSnapshotForRestore.customerCount} customers, ${selectedSnapshotForRestore.collectionCount} collections) will replace current database state with this backup.`
                    : `"${selectedSnapshotForRestore.filename}" मधील डेटा (${selectedSnapshotForRestore.customerCount} खातेदार, ${selectedSnapshotForRestore.collectionCount} हप्ते) पुनर्संचयित केला जाईल. चालू डेटा या बॅकअपमधील डेटाने बदलला जाईल.`}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100 shrink-0 mt-4">
              <button
                type="button"
                onClick={() => setSelectedSnapshotForRestore(null)}
                className="px-4 py-2.5 rounded-xl border border-[#E4EAE7] text-xs font-black text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                {language === 'EN' ? 'Cancel' : 'रद्द करा'}
              </button>
              <button
                type="button"
                onClick={() => handleRestoreSnapshot(selectedSnapshotForRestore)}
                className="px-5 py-2.5 rounded-xl bg-[#0F7A5C] hover:bg-[#0B5C45] text-white text-xs font-black shadow-xs transition-colors cursor-pointer"
              >
                {language === 'EN' ? 'Yes, Restore Data' : 'होय, रिस्टोर करा'}
              </button>
            </div>
          </div>
        </div>
      </ModalPortal>
      )}
    </div>
  );
};
