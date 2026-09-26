import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  BishiConfig,
  BishiType,
  CollectionEntry,
  Customer,
  InterestRateConfig,
  Loan,
  LoanPayment,
  OfficeId,
  PenaltySetting,
  SmsLog,
  ThakbakiEntry,
} from '../types';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { StorageService } from '../services/db';
import { useAuth } from './AuthContext';
import { Language, translations } from '../utils/translations';
import { performIncrementalSync, IncrementalSyncResult } from '../services/incrementalSync';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface AppContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: typeof translations.MR;
  activeOffice: OfficeId;
  setActiveOffice: (office: OfficeId) => void;
  selectedBishiFilter: 'ALL' | BishiType;
  setSelectedBishiFilter: (bishi: 'ALL' | BishiType) => void;
  customers: Customer[];
  bishiConfigs: BishiConfig[];
  collections: CollectionEntry[];
  loans: Loan[];
  loanPayments: LoanPayment[];
  interestRates: InterestRateConfig[];
  penaltySettings: PenaltySetting;
  smsLogs: SmsLog[];
  thakbakiList: ThakbakiEntry[];
  refreshData: () => void;
  toasts: Toast[];
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'error';
  syncWithFirebase: () => Promise<void>;
  clearAllData: () => Promise<void>;
  isRefreshing: boolean;
  refreshAllData: () => Promise<IncrementalSyncResult>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentAdmin } = useAuth();
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('sushant_bishi_language');
    return saved === 'EN' ? 'EN' : 'MR';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('sushant_bishi_language', lang);
  };

  const t = translations[language] || translations.MR;

  const [activeOffice, setActiveOffice] = useState<OfficeId>('ALL');

  useEffect(() => {
    try {
      sessionStorage.removeItem('sushant_bishi_active_office');
      localStorage.removeItem('sushant_bishi_active_office');
    } catch {
      // ignore
    }
  }, []);

  const [selectedBishiFilter, setSelectedBishiFilter] = useState<'ALL' | BishiType>('ALL');

  const [customers, setCustomers] = useState<Customer[]>(StorageService.getCustomers);
  const [bishiConfigs, setBishiConfigs] = useState<BishiConfig[]>(StorageService.getBishiConfigs);
  const [collections, setCollections] = useState<CollectionEntry[]>(StorageService.getCollections);
  const [loans, setLoans] = useState<Loan[]>(StorageService.getLoans);
  const [loanPayments, setLoanPayments] = useState<LoanPayment[]>(StorageService.getLoanPayments);
  const [interestRates, setInterestRates] = useState<InterestRateConfig[]>(StorageService.getInterestRates);
  const [penaltySettings, setPenaltySettings] = useState<PenaltySetting>(StorageService.getPenaltySettings);
  const [smsLogs, setSmsLogs] = useState<SmsLog[]>(StorageService.getSmsLogs);
  const [thakbakiList, setThakbakiList] = useState<ThakbakiEntry[]>(StorageService.getThakbakiList);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');

  const [toasts, setToasts] = useState<Toast[]>([]);

  const refreshData = () => {
    setCustomers(StorageService.getCustomers());
    setBishiConfigs(StorageService.getBishiConfigs());
    setCollections(StorageService.getCollections());
    setLoans(StorageService.getLoans());
    setLoanPayments(StorageService.getLoanPayments());
    setInterestRates(StorageService.getInterestRates());
    setPenaltySettings(StorageService.getPenaltySettings());
    setSmsLogs(StorageService.getSmsLogs());
    setThakbakiList(StorageService.getThakbakiList());
  };

  const syncWithFirebase = async () => {
    setSyncStatus('syncing');
    try {
      await StorageService.syncAllToFirestore();
      setSyncStatus('synced');
      refreshData();
      showToast('Firebase डेटाबेससह यशस्वीपणे सिंक झाले!', 'success');
      setTimeout(() => setSyncStatus('idle'), 4000);
    } catch (err: any) {
      setSyncStatus('error');
      showToast('सिंक करताना त्रुटी आली: ' + (err?.message || 'अज्ञात त्रुटी'), 'error');
      setTimeout(() => setSyncStatus('idle'), 4000);
    }
  };

  useEffect(() => {
    refreshData();

    // 1. Subscribe to auto-sync status updates from StorageService for instant UI feedback
    const unsubStatus = StorageService.onSyncStatusChange((status) => {
      setSyncStatus(status);
    });

    // 2. Realtime listener on stats/summary doc (0 reads while idle, 1 read on actual remote update)
    // Guarantees all 4 devices stay 100% in sync simultaneously when customers are added, modified, or deleted!
    let unsubStats: (() => void) | null = null;
    try {
      unsubStats = onSnapshot(doc(db, 'stats', 'summary'), async (snap: any) => {
        if (!snap.exists()) return;
        const data = snap.data();
        const cloudLastUpdated = data?.lastUpdated as string | undefined;
        const lastSyncedAt = localStorage.getItem('sb_last_synced_at');

        // Immediately prune ghost/deleted customers locally using activeCustomerAccounts
        if (Array.isArray(data?.activeCustomerAccounts)) {
          const activeSet = new Set(
            data.activeCustomerAccounts.map((a: string) => String(a).trim().toLowerCase())
          );
          const localCusts = StorageService.getCustomers();
          const pruned = localCusts.filter((c) =>
            activeSet.has(String(c.accountNumber).trim().toLowerCase())
          );
          if (pruned.length !== localCusts.length) {
            localStorage.setItem('sb_customers', JSON.stringify(pruned));
            refreshData();
          }
        }

        // If cloud data is newer than this device's last sync, pull the deltas automatically
        if (cloudLastUpdated && (!lastSyncedAt || cloudLastUpdated > lastSyncedAt)) {
          await performIncrementalSync();
          refreshData();
        }
      });
    } catch (e) {
      console.warn('[AppContext] Realtime stats listener note:', e);
    }

    // 3. Low-read startup sync: If local storage has data, do a quick delta check (1 read)
    // Only perform full fetch if this device has completely empty storage (< 2 customers)
    if (currentAdmin) {
      const syncKey = 'sb_initial_sync_done';
      const hasSynced = sessionStorage.getItem(syncKey);
      const localCustCount = StorageService.getCustomers().length;

      if (!hasSynced) {
        sessionStorage.setItem(syncKey, 'true');
        if (localCustCount < 2) {
          StorageService.fetchAndSyncFromFirestore()
            .then(() => {
              refreshData();
            })
            .catch((err) => {
              console.warn('[AppContext] Startup full sync note:', err);
            });
        } else {
          performIncrementalSync()
            .then(() => {
              refreshData();
            })
            .catch((err) => {
              console.warn('[AppContext] Startup incremental sync note:', err);
            });
        }
      }
    }

    return () => {
      if (unsubStatus) unsubStatus();
      if (unsubStats) unsubStats();
    };
  }, [currentAdmin]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = 'toast_' + Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      removeToast(id);
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const clearAllData = async () => {
    try {
      await StorageService.clearAllData();
      refreshData();
      showToast(language === 'EN' ? 'All data cleared successfully.' : 'सर्व डेटा यशस्वीपणे हटवला गेला.', 'success');
    } catch (err: any) {
      showToast(language === 'EN' ? 'Error clearing data: ' + err?.message : 'डेटा हटवताना त्रुटी आली: ' + err?.message, 'error');
    }
  };

  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshAllData = async (): Promise<IncrementalSyncResult> => {
    setIsRefreshing(true);
    try {
      const res = await performIncrementalSync();
      refreshData();
      if (res.updatedCount > 0 || res.deletedCount > 0) {
        showToast(
          language === 'EN'
            ? `Data updated: ${res.updatedCount} added/modified, ${res.deletedCount} removed (${res.readsCount} reads)`
            : `डेटा अद्ययावत: ${res.updatedCount} नवीन/बदल, ${res.deletedCount} हटवले (${res.readsCount} रीड्स)`,
          'success'
        );
      } else {
        showToast(
          language === 'EN'
            ? `All data is up to date (${res.readsCount} read)`
            : `सर्व डेटा अद्ययावत आहे (${res.readsCount} रीड)`,
          'info'
        );
      }
      return res;
    } catch (err: any) {
      const errorMsg = err?.message || 'Refresh error';
      showToast(language === 'EN' ? `Refresh error: ${errorMsg}` : `रिफ्रेश करताना त्रुटी: ${errorMsg}`, 'error');
      return {
        updatedCount: 0,
        deletedCount: 0,
        readsCount: 1,
        isUpToDate: false,
        message: errorMsg,
      };
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <AppContext.Provider
      value={{
        language,
        setLanguage,
        t,
        activeOffice,
        setActiveOffice,
        selectedBishiFilter,
        setSelectedBishiFilter,
        customers,
        bishiConfigs,
        collections,
        loans,
        loanPayments,
        interestRates,
        penaltySettings,
        smsLogs,
        thakbakiList,
        refreshData,
        toasts,
        showToast,
        removeToast,
        syncStatus,
        syncWithFirebase,
        clearAllData,
        isRefreshing,
        refreshAllData,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
