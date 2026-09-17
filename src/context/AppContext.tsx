import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  BishiConfig,
  BishiType,
  CollectionEntry,
  Customer,
  InterestRateConfig,
  Loan,
  OfficeId,
  PenaltySetting,
  SmsLog,
} from '../types';
import { StorageService } from '../services/db';

import { Language, translations } from '../utils/translations';

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
  interestRates: InterestRateConfig[];
  penaltySettings: PenaltySetting;
  smsLogs: SmsLog[];
  refreshData: () => void;
  toasts: Toast[];
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'error';
  syncWithFirebase: () => Promise<void>;
  clearAllData: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('sushant_bishi_language');
    return saved === 'EN' ? 'EN' : 'MR';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('sushant_bishi_language', lang);
  };

  const t = translations[language] || translations.MR;

  const [activeOffice, setActiveOffice] = useState<OfficeId>('MAIN');
  const [selectedBishiFilter, setSelectedBishiFilter] = useState<'ALL' | BishiType>('ALL');

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [bishiConfigs, setBishiConfigs] = useState<BishiConfig[]>([]);
  const [collections, setCollections] = useState<CollectionEntry[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [interestRates, setInterestRates] = useState<InterestRateConfig[]>([]);
  const [penaltySettings, setPenaltySettings] = useState<PenaltySetting>(
    StorageService.getPenaltySettings()
  );
  const [smsLogs, setSmsLogs] = useState<SmsLog[]>([]);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');

  const [toasts, setToasts] = useState<Toast[]>([]);

  const refreshData = () => {
    setCustomers(StorageService.getCustomers());
    setBishiConfigs(StorageService.getBishiConfigs());
    setCollections(StorageService.getCollections());
    setLoans(StorageService.getLoans());
    setInterestRates(StorageService.getInterestRates());
    setPenaltySettings(StorageService.getPenaltySettings());
    setSmsLogs(StorageService.getSmsLogs());
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

    // Attach real-time listeners for updates from Firebase Firestore
    const unsubscribe = StorageService.setupFirestoreListeners(() => {
      refreshData();
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

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
        interestRates,
        penaltySettings,
        smsLogs,
        refreshData,
        toasts,
        showToast,
        removeToast,
        syncStatus,
        syncWithFirebase,
        clearAllData,
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
