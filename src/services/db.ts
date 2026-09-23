import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  getDoc,
  onSnapshot,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  Admin,
  BishiConfig,
  CollectionEntry,
  Customer,
  InterestRateConfig,
  Loan,
  LoanPayment,
  PenaltySetting,
  SmsLog,
  SystemBackupData,
  ThakbakiEntry,
  ThakbakiPayment,
} from '../types';
import { calculateLoanTotalAccruedInterest } from '../utils/calculations';

const STORAGE_KEYS = {
  ADMINS: 'sb_admins',
  CUSTOMERS: 'sb_customers',
  BISHI_CONFIGS: 'sb_bishi_configs',
  COLLECTIONS: 'sb_collections',
  LOANS: 'sb_loans',
  LOAN_PAYMENTS: 'sb_loan_payments',
  INTEREST_RATES: 'sb_interest_rates',
  PENALTY_SETTINGS: 'sb_penalty_settings',
  SMS_LOGS: 'sb_sms_logs',
  THAKBAKI: 'sb_thakbaki',
};

// Local storage helper
const getStoredData = <T>(key: string, defaultValue: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : defaultValue;
  } catch (err) {
    console.error(`Error reading ${key} from storage:`, err);
    return defaultValue;
  }
};

const setStoredData = <T>(key: string, data: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.error(`Error saving ${key} to storage:`, err);
  }
};

// Sanitize object for Firestore to eliminate undefined keys
const sanitizeForFirestore = <T>(data: T): T => {
  return JSON.parse(JSON.stringify(data));
};

// Helper to clean strings for Firestore document keys
const cleanDocString = (val: any): string => {
  return String(val || '')
    .trim()
    .replace(/[\/\\#?%*:[\]]/g, '_')
    .replace(/\s+/g, '_');
};

// Generates neat, readable document IDs for Firebase Console with Customer Name and Account Number
export const getFirestoreDocId = (collectionName: string, docId: string, data: any): string => {
  if (!data) return docId;

  const acc = cleanDocString(data.accountNumber);
  const name = cleanDocString(data.customerName || data.name);

  if (collectionName === 'customers') {
    if (acc && name) return `${acc}_${name}`;
    if (name) return name;
  } else if (collectionName === 'collections') {
    const period = String(data.periodIndex || 1).padStart(2, '0');
    if (acc && name) return `${acc}_${name}_हप्ता_${period}`;
    if (acc) return `${acc}_हप्ता_${period}`;
  } else if (collectionName === 'loans') {
    if (acc && name) return `कर्ज_${acc}_${name}`;
    if (acc) return `कर्ज_${acc}`;
  } else if (collectionName === 'loanPayments') {
    const dateStr = cleanDocString(data.paymentDate || docId);
    if (acc && name) return `पावती_${acc}_${name}_${dateStr}`;
    if (acc) return `पावती_${acc}_${dateStr}`;
  }

  return docId;
};

// Enrich data with human-readable customer information before pushing to cloud
const enrichFirestoreData = (collectionName: string, rawData: any): any => {
  const data = { ...rawData };

  if (collectionName === 'customers') {
    data.customerName = data.customerName || data.name;
    data.name = data.name || data.customerName;

    // Attach summary and installments if available locally so customer document in Firebase is rich and neatly arranged
    try {
      const allColls = getStoredData<CollectionEntry[]>(STORAGE_KEYS.COLLECTIONS, []);
      const rawCustColls = allColls.filter(
        (c) => c.customerId === data.id || (data.accountNumber && String(c.accountNumber) === String(data.accountNumber))
      );
      // Deduplicate by periodIndex to prevent duplicate installments inflating summary
      const dedupMap = new Map<number, CollectionEntry>();
      rawCustColls.forEach((c) => {
        const existing = dedupMap.get(c.periodIndex);
        if (!existing || (c.updatedAt && (!existing.updatedAt || c.updatedAt >= existing.updatedAt))) {
          dedupMap.set(c.periodIndex, c);
        }
      });
      const custColls = Array.from(dedupMap.values()).sort((a, b) => a.periodIndex - b.periodIndex);

      if (custColls.length > 0) {
        const totalExpected = custColls.reduce((acc, c) => acc + (c.expectedAmount || 0), 0);
        const totalCollected = custColls.reduce((acc, c) => acc + (c.collectedAmount || 0), 0);
        const totalExtraAmount = custColls.reduce((acc, c) => acc + (c.extraAmount || 0), 0);
        const totalPenalty = custColls.reduce((acc, c) => acc + (c.penaltyAmount || 0), 0);
        data.summary = {
          totalExpected,
          totalCollected,
          totalExtraAmount,
          totalPenalty,
          totalCollectedWithPenalty: totalCollected + totalExtraAmount + totalPenalty,
          totalRemaining: Math.max(0, totalExpected - totalCollected),
          totalInstallments: custColls.length,
          paidInstallments: custColls.filter((c) => c.status === 'PAID').length,
          pendingInstallments: custColls.filter((c) => c.status !== 'PAID').length,
        };
        data.installments = custColls.map((c) => ({
          periodIndex: c.periodIndex,
          periodLabel: c.periodLabel,
          dueDate: c.dueDate,
          paymentDate: c.paymentDate || null,
          expectedAmount: c.expectedAmount,
          collectedAmount: c.collectedAmount,
          extraAmount: c.extraAmount || 0,
          remainingAmount: c.remainingAmount,
          penaltyAmount: c.penaltyAmount || 0,
          totalWithPenalty: (c.collectedAmount || 0) + (c.extraAmount || 0) + (c.penaltyAmount || 0),
          status: c.status,
        }));
      }

      const allLoans = getStoredData<Loan[]>(STORAGE_KEYS.LOANS, []);
      const custLoans = allLoans.filter(
        (l) => l.customerId === data.id || (data.accountNumber && l.accountNumber === data.accountNumber)
      );
      const custLoan = custLoans.find((l) => l.status === 'ACTIVE')
        || [...custLoans].sort((a, b) => (b.updatedAt || b.issueDate || '').localeCompare(a.updatedAt || a.issueDate || ''))[0];
      if (custLoan) {
        const allLoanPayments = getStoredData<LoanPayment[]>(STORAGE_KEYS.LOAN_PAYMENTS, []);
        const paymentsForLoan = allLoanPayments.filter(
          (lp) => (lp.loanId && lp.loanId === custLoan.id) || lp.customerId === data.id
        );
        const totalInterestPaid = paymentsForLoan.reduce(
          (sum, p) => sum + (Number(p.interestPaid) || 0),
          0
        );
        const principal = Number(custLoan.principalAmount) || 0;
        const rate = Number(custLoan.interestRate) || 0;
        const calculatedInitialInterest = Math.round((principal * rate) / 100);
        data.loanDetails = {
          principalAmount: principal,
          interestRate: rate,
          totalInterest: Number(custLoan.totalInterest) > 0 ? Number(custLoan.totalInterest) : calculatedInitialInterest,
          totalInterestPaid: totalInterestPaid,
          totalPayable: custLoan.totalPayable || (principal + calculatedInitialInterest),
          paidAmount: custLoan.paidAmount || 0,
          remainingAmount: custLoan.remainingAmount || 0,
          status: custLoan.status,
        };
      }
    } catch (e) {
      // Ignore enrichment lookup issues
    }
  } else if (collectionName === 'collections') {
    try {
      const customers = getStoredData<Customer[]>(STORAGE_KEYS.CUSTOMERS, []);
      const cust = customers.find(
        (c) => c.id === data.customerId || (data.accountNumber && c.accountNumber === data.accountNumber)
      );
      if (cust) {
        data.customerName = data.customerName || cust.name;
        data.accountNumber = data.accountNumber || cust.accountNumber;
        data.officeId = data.officeId || cust.officeId || 'MAIN';
        data.customerMobile = data.customerMobile || cust.mobile || '';
      }
    } catch (e) {}
    data.penaltyAmount = Number(data.penaltyAmount) || 0;
    data.extraAmount = Number(data.extraAmount) || 0;
    data.totalWithPenalty = (Number(data.collectedAmount) || 0) + data.extraAmount + data.penaltyAmount;
  } else if (collectionName === 'loanPayments') {
    try {
      const customers = getStoredData<Customer[]>(STORAGE_KEYS.CUSTOMERS, []);
      const cust = customers.find(
        (c) => c.id === data.customerId || (data.accountNumber && c.accountNumber === data.accountNumber)
      );
      const allLoans = getStoredData<Loan[]>(STORAGE_KEYS.LOANS, []);
      const loan = allLoans.find((l) => (data.loanId && l.id === data.loanId) || l.customerId === data.customerId);

      if (cust || loan) {
        data.customerName = data.customerName || cust?.name || loan?.customerName || '';
        data.accountNumber = data.accountNumber || cust?.accountNumber || loan?.accountNumber || '';
        data.officeId = data.officeId || cust?.officeId || loan?.officeId || 'MAIN';
        data.customerMobile = data.customerMobile || cust?.mobile || (loan as any)?.customerMobile || '';
      }

      // Calculate cumulative total interest paid on this loan
      const allLoanPayments = getStoredData<LoanPayment[]>(STORAGE_KEYS.LOAN_PAYMENTS, []);
      const paymentsForLoan = allLoanPayments.filter(
        (lp) => (lp.loanId && lp.loanId === data.loanId) || lp.customerId === data.customerId
      );
      const totalInterest = paymentsForLoan.reduce(
        (sum, p) => sum + (Number(p.interestPaid) || 0),
        0
      );
      data.totalInterest = totalInterest;
      data.totalInterestPaid = totalInterest;
      data.totalPaid = (Number(data.paidAmount) || 0) + (Number(data.interestPaid) || 0) + (Number(data.penaltyPaid) || 0);
    } catch (e) {}
  } else if (collectionName === 'loans') {
    try {
      const customers = getStoredData<Customer[]>(STORAGE_KEYS.CUSTOMERS, []);
      const cust = customers.find(
        (c) => c.id === data.customerId || (data.accountNumber && c.accountNumber === data.accountNumber)
      );
      if (cust) {
        data.customerName = data.customerName || cust.name;
        data.accountNumber = data.accountNumber || cust.accountNumber;
        data.officeId = data.officeId || cust.officeId || 'MAIN';
        data.customerMobile = data.customerMobile || cust.mobile || '';
      }

      const allLoanPayments = getStoredData<LoanPayment[]>(STORAGE_KEYS.LOAN_PAYMENTS, []);
      const paymentsForLoan = allLoanPayments.filter(
        (lp) => (lp.loanId && lp.loanId === data.id) || lp.customerId === data.customerId
      );
      const totalInterestPaid = paymentsForLoan.reduce(
        (sum, p) => sum + (Number(p.interestPaid) || 0),
        0
      );
      data.totalInterestPaid = totalInterestPaid;

      const principal = Number(data.principalAmount) || 0;
      const rate = Number(data.interestRate) || 0;
      const calculatedInterest = Math.round((principal * rate) / 100);
      data.totalInterest = Number(data.totalInterest) > 0 ? Number(data.totalInterest) : calculatedInterest;
      data.totalPayable = principal + data.totalInterest;
    } catch (e) {}
  }

  return data;
};

// Sync Status Tracking for instant UI feedback
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';
type SyncStatusListener = (status: SyncStatus) => void;
const syncStatusListeners: Set<SyncStatusListener> = new Set();
let resetTimer: any = null;
let activeSyncOperations = 0;

export const notifySyncStatus = (status: SyncStatus) => {
  if (resetTimer) {
    clearTimeout(resetTimer);
    resetTimer = null;
  }
  syncStatusListeners.forEach((listener) => {
    try {
      listener(status);
    } catch (e) {}
  });

  if (status === 'synced' || status === 'error') {
    resetTimer = setTimeout(() => {
      syncStatusListeners.forEach((listener) => {
        try {
          listener('idle');
        } catch (e) {}
      });
    }, 2500);
  }
};

export const onSyncStatusChange = (listener: SyncStatusListener) => {
  syncStatusListeners.add(listener);
  return () => {
    syncStatusListeners.delete(listener);
  };
};

const startSyncOp = () => {
  activeSyncOperations++;
  notifySyncStatus('syncing');
};

const endSyncOp = (success: boolean = true) => {
  activeSyncOperations = Math.max(0, activeSyncOperations - 1);
  if (activeSyncOperations === 0) {
    notifySyncStatus(success ? 'synced' : 'error');
  }
};

// Firestore sync helpers with auto sync status tracking
const syncToFirestore = async (collectionName: string, docId: string, data: any) => {
  startSyncOp();
  try {
    const enrichedData = enrichFirestoreData(collectionName, data);
    const readableDocId = getFirestoreDocId(collectionName, docId, enrichedData);
    const cleanData = sanitizeForFirestore(enrichedData);
    const ref = doc(db, collectionName, readableDocId);
    await setDoc(ref, cleanData);
    if (readableDocId !== docId) {
      deleteDoc(doc(db, collectionName, docId)).catch(() => {});
    }
    console.log(`[Firestore Sync] Saved to ${collectionName}/${readableDocId}`);
    endSyncOp(true);
  } catch (e: any) {
    console.warn(`Firestore sync note for ${collectionName}/${docId}:`, e?.message || e);
    endSyncOp(false);
  }
};

// Fast atomic batch sync for multiple entries (up to 400 per commit)
const syncBatchToFirestore = async (
  collectionName: string,
  items: { docId: string; data: any }[]
) => {
  if (!items || items.length === 0) return;
  startSyncOp();
  try {
    const CHUNK_SIZE = 400;
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const item of chunk) {
        const enrichedData = enrichFirestoreData(collectionName, item.data);
        const readableDocId = getFirestoreDocId(collectionName, item.docId, enrichedData);
        const cleanData = sanitizeForFirestore(enrichedData);
        const ref = doc(db, collectionName, readableDocId);
        batch.set(ref, cleanData, { merge: true });
      }
      await batch.commit();
    }
    console.log(`[Firestore Batch Sync] Committed ${items.length} items to ${collectionName}`);
    endSyncOp(true);
  } catch (e: any) {
    console.warn(`Firestore batch sync error for ${collectionName}:`, e?.message || e);
    endSyncOp(false);
  }
};

const deleteFromFirestore = async (collectionName: string, docId: string, data?: any) => {
  startSyncOp();
  try {
    const readableDocId = data ? getFirestoreDocId(collectionName, docId, data) : docId;
    const ref = doc(db, collectionName, readableDocId);
    await deleteDoc(ref);
    if (readableDocId !== docId) {
      const fallbackRef = doc(db, collectionName, docId);
      await deleteDoc(fallbackRef).catch(() => {});
    }
    console.log(`[Firestore Delete] Removed ${collectionName}/${readableDocId}`);
    endSyncOp(true);
  } catch (e: any) {
    console.warn(`Firestore delete note for ${collectionName}/${docId}:`, e?.message || e);
    endSyncOp(false);
  }
};

const sortInterestRatesHelper = (rates: InterestRateConfig[]): InterestRateConfig[] => {
  return [...rates].sort((a, b) => {
    const timeA = a.id?.startsWith('ir_') ? Number(a.id.replace('ir_', '')) : 0;
    const timeB = b.id?.startsWith('ir_') ? Number(b.id.replace('ir_', '')) : 0;
    if (timeA && timeB) return timeB - timeA;
    if (timeA && !timeB) return -1;
    if (!timeA && timeB) return 1;
    return (b.effectiveDate || '').localeCompare(a.effectiveDate || '');
  });
};

// Deduplicates collection entries so each customer has strictly ONE installment entry per periodIndex
export const deduplicateCollections = (entries: CollectionEntry[]): CollectionEntry[] => {
  if (!entries || !Array.isArray(entries) || entries.length === 0) return [];

  const map = new Map<string, CollectionEntry>();

  entries.forEach((entry) => {
    if (!entry) return;
    const custId = String(entry.customerId || '').trim();
    const acc = String(entry.accountNumber || '').trim().toLowerCase();
    const bishi = String(entry.bishiType || '').trim();
    const period = String(entry.periodIndex ?? '');

    // Canonical key: customer (acc or custId) + periodIndex
    const primaryKey = acc ? `${acc}_${period}` : `${custId}_${period}`;
    const key = bishi ? `${primaryKey}_${bishi}` : primaryKey;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, entry);
    } else {
      // Strictly pick the newest record based on updatedAt timestamp
      const existingTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
      const entryTime = entry.updatedAt ? new Date(entry.updatedAt).getTime() : 0;

      if (entryTime > existingTime) {
        map.set(key, entry);
      } else if (existingTime > entryTime) {
        // Keep existing
      } else {
        // When timestamps are identical, pick the canonical readable doc ID if one matches
        const readableId = getFirestoreDocId('collections', entry.id, entry);
        if (entry.id === readableId && existing.id !== readableId) {
          map.set(key, entry);
        }
      }
    }
  });

  return Array.from(map.values()).sort((a, b) => (a.periodIndex || 0) - (b.periodIndex || 0));
};

// Deduplicates customers by accountNumber (or ID)
export const deduplicateCustomers = (custs: Customer[]): Customer[] => {
  if (!custs || !Array.isArray(custs) || custs.length === 0) return [];

  const map = new Map<string, Customer>();
  custs.forEach((c) => {
    if (!c) return;
    const acc = String(c.accountNumber || '').trim().toLowerCase();
    const key = acc || c.id;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, c);
    } else {
      const existingTime = existing.updatedAt || existing.createdAt || '';
      const entryTime = c.updatedAt || c.createdAt || '';
      if (entryTime && (!existingTime || entryTime > existingTime)) {
        map.set(key, c);
      }
    }
  });

  return Array.from(map.values());
};

// Deduplicates loans by ID or account + issueDate + principal
export const deduplicateLoans = (loans: Loan[]): Loan[] => {
  if (!loans || !Array.isArray(loans) || loans.length === 0) return [];

  const map = new Map<string, Loan>();
  loans.forEach((l) => {
    if (!l) return;
    const acc = String(l.accountNumber || '').trim().toLowerCase();
    const key = l.id || (acc ? `${acc}_${l.issueDate || ''}_${l.principalAmount || 0}` : (l.customerId || Math.random().toString()));

    const existing = map.get(key);
    if (!existing) {
      map.set(key, l);
    } else {
      const existingTime = existing.updatedAt || existing.issueDate || '';
      const entryTime = l.updatedAt || l.issueDate || '';
      if (entryTime && (!existingTime || entryTime > existingTime)) {
        map.set(key, l);
      }
    }
  });

  return Array.from(map.values());
};

// Deduplicates loan payments
export const deduplicateLoanPayments = (payments: LoanPayment[]): LoanPayment[] => {
  if (!payments || payments.length === 0) return [];

  const map = new Map<string, LoanPayment>();
  payments.forEach((p) => {
    if (!p) return;
    const key = p.id || `${p.loanId || p.customerId}_${p.paymentDate}_${p.paidAmount}_${p.interestPaid}`;
    if (!map.has(key)) {
      map.set(key, p);
    }
  });

  return Array.from(map.values()).sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || ''));
};


// Initialize default configs if empty
const initializeDefaultConfigs = () => {
  const isInitialized = localStorage.getItem(STORAGE_KEYS.BISHI_CONFIGS) !== null;
  if (!isInitialized) {
    const currentYear = new Date().getFullYear();
    const defaults: BishiConfig[] = [
      {
        id: '15_AUGUST',
        name: '१५ ऑगस्ट भिशी',
        startDate: `${currentYear}-08-15`,
        endDate: `${currentYear + 1}-08-14`,
        totalInstallments: 40,
        modality: 'W',
        officeId: 'MAIN',
        color: 'bg-emerald-600',
        bgPastel: 'bg-pastel-green/30',
      },
      {
        id: '26_JANUARY',
        name: '२६ जानेवारी भिशी',
        startDate: `${currentYear}-01-26`,
        endDate: `${currentYear + 1}-01-25`,
        totalInstallments: 10,
        modality: 'M',
        officeId: 'MAIN',
        color: 'bg-brand-600',
        bgPastel: 'bg-pastel-blue/30',
      },
      {
        id: 'DASARA',
        name: 'दसरा भिशी',
        startDate: `${currentYear}-10-15`,
        endDate: `${currentYear + 1}-10-14`,
        totalInstallments: 40,
        modality: 'W',
        officeId: 'MAIN',
        color: 'bg-amber-600',
        bgPastel: 'bg-pastel-yellow/30',
      },
    ];
    setStoredData(STORAGE_KEYS.BISHI_CONFIGS, defaults);
    defaults.forEach((d) => syncToFirestore('bishi', d.id, d));
  }

  const penalty = getStoredData<PenaltySetting | null>(STORAGE_KEYS.PENALTY_SETTINGS, null);
  if (!penalty) {
    const defaultPenalty: PenaltySetting = {
      id: 'default',
      weeklyPenalty: 50,
      monthlyPenalty: 200,
      graceDays: 2,
    };
    setStoredData<PenaltySetting>(STORAGE_KEYS.PENALTY_SETTINGS, defaultPenalty);
    syncToFirestore('penaltySettings', 'default', defaultPenalty);
  }

  const interest = getStoredData<InterestRateConfig[]>(STORAGE_KEYS.INTEREST_RATES, []);
  if (interest.length === 0) {
    const defaultInterest: InterestRateConfig[] = [
      {
        id: 'default_m',
        rate: 10,
        rateType: 'MONTHLY',
        effectiveDate: new Date().toISOString().split('T')[0],
        note: 'प्राथमिक मासिक व्याजदर',
      },
      {
        id: 'default_w',
        rate: 2.5,
        rateType: 'WEEKLY',
        effectiveDate: new Date().toISOString().split('T')[0],
        note: 'प्राथमिक साप्ताहिक व्याजदर',
      },
    ];
    setStoredData<InterestRateConfig[]>(STORAGE_KEYS.INTEREST_RATES, defaultInterest);
    defaultInterest.forEach((d) => syncToFirestore('interestRates', d.id, d));
  }

  // Delete all previous admin records and create single new admin (9876543210 / 123456)
  const PRIMARY_ADMIN: Admin = {
    id: 'admin_primary',
    name: 'सुषांत भिशी व्यवस्थापक',
    mobile: '9876543210',
    email: 'sushant@gmail.com',
    createdAt: new Date().toISOString(),
  };

  try {
    const admins = getStoredData<Admin[]>(STORAGE_KEYS.ADMINS, []);
    const hasOnlyPrimaryAdmin =
      Array.isArray(admins) &&
      admins.length === 1 &&
      admins[0]?.mobile &&
      String(admins[0].mobile).trim() === '9876543210' &&
      admins[0].id === 'admin_primary';

    if (!hasOnlyPrimaryAdmin) {
      // Delete any previous admin records locally and in Firestore
      if (Array.isArray(admins)) {
        admins.forEach((oldAdmin) => {
          if (oldAdmin?.id && oldAdmin.id !== 'admin_primary') {
            deleteFromFirestore('admins', oldAdmin.id);
          }
        });
      }
      deleteFromFirestore('admins', 'admin_default');

      const currentPass = localStorage.getItem('sb_admin_pass') || '123456';
      const adminWithPass = { ...PRIMARY_ADMIN, password: currentPass };
      setStoredData(STORAGE_KEYS.ADMINS, [adminWithPass]);
      localStorage.setItem('sb_admin_pass', currentPass);
      localStorage.removeItem('sb_active_session'); // Clear old session so user logs in with new credentials
      syncToFirestore('admins', PRIMARY_ADMIN.id, adminWithPass);
    } else if (!localStorage.getItem('sb_admin_pass')) {
      localStorage.setItem('sb_admin_pass', '123456');
      syncToFirestore('admins', PRIMARY_ADMIN.id, { ...PRIMARY_ADMIN, password: '123456' });
    }
  } catch (err) {
    console.warn('initializeDefaultConfigs admin setup note:', err);
  }
};

initializeDefaultConfigs();

export const StorageService = {
  // Sync Status listener subscriptions
  onSyncStatusChange,
  notifySyncStatus,

  // Admin Operations
  updateAdminPassword: async (newPassword: string): Promise<void> => {
    localStorage.setItem('sb_admin_pass', newPassword);
    const admins = StorageService.getAdmins();
    const primary = admins[0] || {
      id: 'admin_primary',
      name: 'सुषांत भिशी व्यवस्थापक',
      mobile: '9876543210',
      email: 'sushant@gmail.com',
      createdAt: new Date().toISOString(),
    };
    const updatedAdmin: Admin = {
      ...primary,
      password: newPassword,
      updatedAt: new Date().toISOString(),
    };
    setStoredData(STORAGE_KEYS.ADMINS, [updatedAdmin]);
    await syncToFirestore('admins', 'admin_primary', updatedAdmin);
  },
  getAdmins: (): Admin[] => {
    const admins = getStoredData<Admin[]>(STORAGE_KEYS.ADMINS, []);
    const hasOnlyPrimaryAdmin =
      Array.isArray(admins) &&
      admins.length === 1 &&
      admins[0]?.mobile &&
      String(admins[0].mobile).trim() === '9876543210' &&
      admins[0].id === 'admin_primary';

    if (!hasOnlyPrimaryAdmin) {
      const PRIMARY_ADMIN: Admin = {
        id: 'admin_primary',
        name: 'सुषांत भिशी व्यवस्थापक',
        mobile: '9876543210',
        email: 'sushant@gmail.com',
        createdAt: new Date().toISOString(),
      };
      setStoredData(STORAGE_KEYS.ADMINS, [PRIMARY_ADMIN]);
      localStorage.setItem('sb_admin_pass', '123456');
      return [PRIMARY_ADMIN];
    }
    return admins;
  },

  hasAdmin: (): boolean => true,

  createAdmin: (_admin: Omit<Admin, 'id' | 'createdAt'>): Admin => {
    throw new Error('नवीन प्रशासक नोंदणी बंद करण्यात आलेली आहे. थेट लॉगिन करा.');
  },

  updateAdmin: (id: string, updates: Partial<Admin>): Admin => {
    const admins = StorageService.getAdmins();
    const index = admins.findIndex((a) => a.id === id);
    if (index === -1) throw new Error('प्रशासक सापडला नाही.');

    admins[index] = { ...admins[index], ...updates };
    setStoredData(STORAGE_KEYS.ADMINS, admins);
    syncToFirestore('admins', id, admins[index]);
    return admins[index];
  },

  // Customer Operations
  getCustomers: (): Customer[] => {
    const raw = getStoredData<Customer[]>(STORAGE_KEYS.CUSTOMERS, []);
    const deduped = deduplicateCustomers(raw);
    if (deduped.length !== raw.length) {
      setStoredData(STORAGE_KEYS.CUSTOMERS, deduped);
    }
    return deduped;
  },

  getCustomerById: (id: string): Customer | undefined => {
    return StorageService.getCustomers().find((c) => c.id === id);
  },

  getCustomerByAccountNumber: (accountNumber: string): Customer | undefined => {
    return StorageService.getCustomers().find(
      (c) => c.accountNumber.trim().toLowerCase() === accountNumber.trim().toLowerCase()
    );
  },

  addCustomer: (customerData: Omit<Customer, 'id' | 'createdAt'>): Customer => {
    const customers = StorageService.getCustomers();

    const exists = customers.some(
      (c) => c.accountNumber.trim().toLowerCase() === customerData.accountNumber.trim().toLowerCase()
    );
    if (exists) {
      throw new Error('हा खाते क्रमांक आधीपासून वापरामध्ये आहे. कृपया वेगळा खाते क्रमांक वापरा.');
    }

    const newCustomer: Customer = {
      ...customerData,
      id: 'cust_' + Date.now(),
      createdAt: new Date().toISOString(),
    };

    setStoredData(STORAGE_KEYS.CUSTOMERS, [newCustomer, ...customers]);
    syncToFirestore('customers', newCustomer.id, newCustomer);
    return newCustomer;
  },

  updateCustomer: (id: string, updates: Partial<Customer>): Customer => {
    const customers = StorageService.getCustomers();
    const index = customers.findIndex((c) => c.id === id);
    if (index === -1) throw new Error('खातेदार सापडला नाही.');

    if (updates.accountNumber && updates.accountNumber !== customers[index].accountNumber) {
      const exists = customers.some(
        (c) => c.id !== id && c.accountNumber.trim().toLowerCase() === updates.accountNumber!.trim().toLowerCase()
      );
      if (exists) {
        throw new Error('हा खाते क्रमांक आधीपासून वापरात आहे.');
      }
    }

    const oldCustomer = { ...customers[index] };
    customers[index] = { ...customers[index], ...updates };
    if (updates.name && !updates.customerName) {
      customers[index].customerName = updates.name;
    }
    setStoredData(STORAGE_KEYS.CUSTOMERS, customers);

    // Clean up old Firestore doc ID if account number or name changed
    const oldDocId = getFirestoreDocId('customers', id, oldCustomer);
    const newDocId = getFirestoreDocId('customers', id, customers[index]);
    if (oldDocId !== newDocId) {
      deleteFromFirestore('customers', id, oldCustomer);
    }

    // Synchronize customer changes across collections, loans, and loan payments
    try {
      const allColls = getStoredData<CollectionEntry[]>(STORAGE_KEYS.COLLECTIONS, []);
      let collsChanged = false;
      const updatedColls = allColls.map((c) => {
        if (c.customerId === id || (oldCustomer.accountNumber && c.accountNumber === oldCustomer.accountNumber)) {
          collsChanged = true;
          return {
            ...c,
            customerId: id,
            customerName: customers[index].name,
            accountNumber: customers[index].accountNumber,
            officeId: customers[index].officeId,
            bishiType: customers[index].bishiType,
          };
        }
        return c;
      });
      if (collsChanged) {
        setStoredData(STORAGE_KEYS.COLLECTIONS, updatedColls);
      }

      const allLoans = getStoredData<Loan[]>(STORAGE_KEYS.LOANS, []);
      let loansChanged = false;
      const updatedLoans = allLoans.map((l) => {
        if (l.customerId === id || (oldCustomer.accountNumber && l.accountNumber === oldCustomer.accountNumber)) {
          loansChanged = true;
          return {
            ...l,
            customerId: id,
            customerName: customers[index].name,
            accountNumber: customers[index].accountNumber,
            officeId: customers[index].officeId,
            customerMobile: customers[index].mobile,
          };
        }
        return l;
      });
      if (loansChanged) {
        setStoredData(STORAGE_KEYS.LOANS, updatedLoans);
      }

      const allLoanPayments = getStoredData<LoanPayment[]>(STORAGE_KEYS.LOAN_PAYMENTS, []);
      let paymentsChanged = false;
      const updatedPayments = allLoanPayments.map((p) => {
        if (p.customerId === id || (oldCustomer.accountNumber && p.accountNumber === oldCustomer.accountNumber)) {
          paymentsChanged = true;
          return {
            ...p,
            customerId: id,
            customerName: customers[index].name,
            accountNumber: customers[index].accountNumber,
            officeId: customers[index].officeId,
            customerMobile: customers[index].mobile,
          };
        }
        return p;
      });
      if (paymentsChanged) {
        setStoredData(STORAGE_KEYS.LOAN_PAYMENTS, updatedPayments);
      }
    } catch (e) {}

    syncToFirestore('customers', id, customers[index]);
    return customers[index];
  },

  deleteCustomer: async (id: string): Promise<void> => {
    const customers = StorageService.getCustomers();
    const customerToDelete = customers.find((c) => c.id === id);
    const remainingCustomers = customers.filter((c) => c.id !== id);
    setStoredData(STORAGE_KEYS.CUSTOMERS, remainingCustomers);

    // Delete associated collections and loans locally
    const collections = StorageService.getCollections();
    const toDeleteColls = collections.filter(
      (c) => c.customerId === id || (customerToDelete && String(c.accountNumber) === String(customerToDelete.accountNumber))
    );
    const remainingColls = collections.filter(
      (c) => c.customerId !== id && (!customerToDelete || String(c.accountNumber) !== String(customerToDelete.accountNumber))
    );
    setStoredData(STORAGE_KEYS.COLLECTIONS, remainingColls);

    const loans = StorageService.getLoans();
    const toDeleteLoans = loans.filter((l) => l.customerId === id);
    const remainingLoans = loans.filter((l) => l.customerId !== id);
    setStoredData(STORAGE_KEYS.LOANS, remainingLoans);

    const payments = StorageService.getLoanPayments().filter((p) => p.customerId !== id);
    setStoredData(STORAGE_KEYS.LOAN_PAYMENTS, payments);

    // Completely and immediately purge from Firestore
    try {
      const deletePromises: Promise<any>[] = [];

      // 1. Delete customer document by ID and readable doc ID
      deletePromises.push(deleteDoc(doc(db, 'customers', id)).catch(() => {}));
      if (customerToDelete) {
        const readableDocId = getFirestoreDocId('customers', id, customerToDelete);
        if (readableDocId !== id) {
          deletePromises.push(deleteDoc(doc(db, 'customers', readableDocId)).catch(() => {}));
        }
        if (customerToDelete.accountNumber) {
          const qAcc = query(collection(db, 'customers'), where('accountNumber', '==', String(customerToDelete.accountNumber)));
          const snapAcc = await getDocs(qAcc);
          snapAcc.forEach((d: any) => deletePromises.push(deleteDoc(d.ref).catch(() => {})));
        }
      }
      const qCustId = query(collection(db, 'customers'), where('id', '==', id));
      const snapCustId = await getDocs(qCustId);
      snapCustId.forEach((d: any) => deletePromises.push(deleteDoc(d.ref).catch(() => {})));

      // 2. Delete all collections for this customer from Firestore
      for (const c of toDeleteColls) {
        const enriched = {
          ...c,
          customerName: c.customerName || customerToDelete?.name,
          accountNumber: c.accountNumber || customerToDelete?.accountNumber,
        };
        const readableCollId = getFirestoreDocId('collections', c.id, enriched);
        deletePromises.push(deleteDoc(doc(db, 'collections', readableCollId)).catch(() => {}));
        if (readableCollId !== c.id) {
          deletePromises.push(deleteDoc(doc(db, 'collections', c.id)).catch(() => {}));
        }
      }
      const qColCust = query(collection(db, 'collections'), where('customerId', '==', id));
      const snapColCust = await getDocs(qColCust);
      snapColCust.forEach((d: any) => deletePromises.push(deleteDoc(d.ref).catch(() => {})));

      if (customerToDelete?.accountNumber) {
        const qColAcc = query(collection(db, 'collections'), where('accountNumber', '==', String(customerToDelete.accountNumber)));
        const snapColAcc = await getDocs(qColAcc);
        snapColAcc.forEach((d: any) => deletePromises.push(deleteDoc(d.ref).catch(() => {})));
      }

      // 3. Delete loans and loan payments from Firestore
      for (const l of toDeleteLoans) {
        const enriched = {
          ...l,
          customerName: l.customerName || customerToDelete?.name,
          accountNumber: l.accountNumber || customerToDelete?.accountNumber,
        };
        const readableLoanId = getFirestoreDocId('loans', l.id, enriched);
        deletePromises.push(deleteDoc(doc(db, 'loans', readableLoanId)).catch(() => {}));
        if (readableLoanId !== l.id) {
          deletePromises.push(deleteDoc(doc(db, 'loans', l.id)).catch(() => {}));
        }
      }
      const qLoan = query(collection(db, 'loans'), where('customerId', '==', id));
      const snapLoan = await getDocs(qLoan);
      snapLoan.forEach((d: any) => deletePromises.push(deleteDoc(d.ref).catch(() => {})));

      const qPay = query(collection(db, 'loanPayments'), where('customerId', '==', id));
      const snapPay = await getDocs(qPay);
      snapPay.forEach((d: any) => deletePromises.push(deleteDoc(d.ref).catch(() => {})));

      await Promise.all(deletePromises);
      console.log(`[Firestore] Successfully purged customer ${id} and all related records from cloud database.`);
    } catch (err) {
      console.warn('Firestore customer purge note:', err);
    }
  },

  // Bishi Config Operations
  getBishiConfigs: (): BishiConfig[] => getStoredData<BishiConfig[]>(STORAGE_KEYS.BISHI_CONFIGS, []),

  saveBishiConfigs: (configs: BishiConfig[]): void => {
    setStoredData(STORAGE_KEYS.BISHI_CONFIGS, configs);
    configs.forEach((c) => syncToFirestore('bishi', c.id, c));
  },

  deleteBishiConfig: async (id: string): Promise<void> => {
    const configs = StorageService.getBishiConfigs();
    const toDelete = configs.find((c) => c.id === id);
    const updated = configs.filter((c) => c.id !== id);
    setStoredData(STORAGE_KEYS.BISHI_CONFIGS, updated);
    await deleteFromFirestore('bishi', id, toDelete);
  },

  // Collection Entries Operations
  getCollections: (): CollectionEntry[] => {
    const raw = getStoredData<CollectionEntry[]>(STORAGE_KEYS.COLLECTIONS, []);
    const deduped = deduplicateCollections(raw);
    if (deduped.length !== raw.length) {
      setStoredData(STORAGE_KEYS.COLLECTIONS, deduped);
    }
    return deduped;
  },

  saveCollectionsBatch: (newEntries: CollectionEntry[]): void => {
    const collections = StorageService.getCollections();
    const newEntryKeys = new Set(
      newEntries.map((e) => {
        const acc = String(e.accountNumber || '').trim().toLowerCase();
        const custId = String(e.customerId || '').trim();
        const bishi = String(e.bishiType || '').trim();
        const period = String(e.periodIndex ?? '');
        const primaryKey = acc ? `${acc}_${period}` : `${custId}_${period}`;
        return bishi ? `${primaryKey}_${bishi}` : primaryKey;
      })
    );
    const filtered = collections.filter((c) => {
      const acc = String(c.accountNumber || '').trim().toLowerCase();
      const custId = String(c.customerId || '').trim();
      const bishi = String(c.bishiType || '').trim();
      const period = String(c.periodIndex ?? '');
      const primaryKey = acc ? `${acc}_${period}` : `${custId}_${period}`;
      const key = bishi ? `${primaryKey}_${bishi}` : primaryKey;
      return !newEntryKeys.has(key);
    });
    const combined = deduplicateCollections([...newEntries, ...filtered]);
    setStoredData(STORAGE_KEYS.COLLECTIONS, combined);
    syncBatchToFirestore(
      'collections',
      newEntries.map((entry) => ({ docId: entry.id, data: entry }))
    );
  },

  updateCollectionEntry: (id: string, updates: Partial<CollectionEntry>): CollectionEntry => {
    const collections = StorageService.getCollections();
    let index = collections.findIndex((c) => c.id === id);

    // If ID not found directly, look up by customerId/accountNumber and periodIndex
    if (index === -1 && updates.periodIndex !== undefined) {
      const targetAcc = String(updates.accountNumber || '').trim().toLowerCase();
      const targetCustId = updates.customerId;
      index = collections.findIndex((c) => {
        const cAcc = String(c.accountNumber || '').trim().toLowerCase();
        const isSameCust = (targetCustId && c.customerId === targetCustId) || (targetAcc && cAcc === targetAcc);
        return isSameCust && c.periodIndex === updates.periodIndex;
      });
    }

    if (index === -1) {
      console.warn(`[StorageService] Collection entry ${id} not found to update, inserting new.`);
      const nowIso = new Date().toISOString();
      const newEntry: CollectionEntry = {
        id,
        customerId: updates.customerId || '',
        customerName: updates.customerName || '',
        accountNumber: updates.accountNumber || '',
        officeId: updates.officeId || 'MAIN',
        bishiType: (updates.bishiType || '15_AUGUST') as any,
        periodIndex: updates.periodIndex || 1,
        periodLabel: updates.periodLabel || `हप्ता ${updates.periodIndex || 1}`,
        dueDate: updates.dueDate || new Date().toISOString().split('T')[0],
        expectedAmount: updates.expectedAmount || 0,
        collectedAmount: updates.collectedAmount || 0,
        remainingAmount: updates.remainingAmount || 0,
        interestAmount: updates.interestAmount || 0,
        historicalInterestRate: updates.historicalInterestRate || 0,
        penaltyAmount: updates.penaltyAmount || 0,
        historicalPenaltyRate: updates.historicalPenaltyRate || 0,
        totalPaid: updates.totalPaid || 0,
        totalWithPenalty: updates.totalWithPenalty || 0,
        status: updates.status || 'PENDING',
        ...updates,
        updatedAt: nowIso,
      };
      const combined = deduplicateCollections([...collections, newEntry]);
      setStoredData(STORAGE_KEYS.COLLECTIONS, combined);
      syncToFirestore('collections', id, newEntry);
      return newEntry;
    }

    const target = collections[index];
    const targetPeriod = updates.periodIndex ?? target.periodIndex;
    const targetCustId = updates.customerId || target.customerId;
    const targetAcc = String(updates.accountNumber || target.accountNumber || '').trim().toLowerCase();
    const nowIso = new Date().toISOString();

    const updatedEntry: CollectionEntry = {
      ...target,
      ...updates,
      updatedAt: nowIso,
    };

    // Update the target and also clean up any duplicate records for this customer and period
    const updatedList = collections.map((c) => {
      const cCustId = c.customerId;
      const cAcc = String(c.accountNumber || '').trim().toLowerCase();
      const isSamePeriod = c.periodIndex === targetPeriod;
      const isSameCustomer = (cCustId && cCustId === targetCustId) || (targetAcc && cAcc === targetAcc);
      if (c.id === id || (isSameCustomer && isSamePeriod)) {
        return { ...c, ...updates, updatedAt: nowIso };
      }
      return c;
    });

    const dedupedList = deduplicateCollections(updatedList);
    setStoredData(STORAGE_KEYS.COLLECTIONS, dedupedList);

    syncToFirestore('collections', target.id || id, updatedEntry);

    // Re-sync customer document so summary and installments in Firestore update immediately
    const custId = updatedEntry.customerId;
    if (custId) {
      const cust = StorageService.getCustomerById(custId);
      if (cust) {
        syncToFirestore('customers', cust.id, cust);
      }
    }

    return updatedEntry;
  },

  deleteCollectionEntry: async (id: string): Promise<void> => {
    const collections = StorageService.getCollections();
    const entryToDelete = collections.find((c) => c.id === id);
    const filtered = collections.filter((c) => c.id !== id);
    setStoredData(STORAGE_KEYS.COLLECTIONS, filtered);
    await deleteFromFirestore('collections', id, entryToDelete);

    if (entryToDelete?.customerId) {
      const cust = StorageService.getCustomerById(entryToDelete.customerId);
      if (cust) {
        await syncToFirestore('customers', cust.id, cust);
      }
    }
  },

  // Loan Operations
  getLoans: (): Loan[] => {
    const rawLoans = deduplicateLoans(getStoredData<Loan[]>(STORAGE_KEYS.LOANS, []));
    const rawCustomers = StorageService.getCustomers();
    const rawPayments = deduplicateLoanPayments(getStoredData<LoanPayment[]>(STORAGE_KEYS.LOAN_PAYMENTS, []));
    let hasChanges = false;

    const sanitized = rawLoans.map((loan) => {
      let loanChanged = false;
      const principal = Number(loan.principalAmount) || 0;
      const discount = Number(loan.discountAmount) || 0;
      const penalty = Number(loan.penaltyAmount) || 0;

      const cust = rawCustomers.find(
        (c) => c.id === loan.customerId || (loan.accountNumber && c.accountNumber === loan.accountNumber)
      );

      const customerId = cust?.id || loan.customerId || '';
      const customerName = loan.customerName || cust?.name || '';
      const accountNumber = loan.accountNumber || cust?.accountNumber || '';
      const officeId = loan.officeId || cust?.officeId || 'MAIN';
      const customerMobile = loan.customerMobile || cust?.mobile || '';

      const paymentsForLoan = rawPayments.filter(
        (lp) => (lp.loanId && lp.loanId === loan.id) ||
                (loan.customerId && lp.customerId === loan.customerId) ||
                (loan.accountNumber && lp.accountNumber === loan.accountNumber)
      );

      const paymentsInterestSum = paymentsForLoan.reduce(
        (sum, p) => sum + (Number(p.interestPaid) || 0),
        0
      );
      // Ensure interest paid is never wiped to 0 if tracked directly on the loan
      const totalInterestPaid = paymentsForLoan.length > 0 ? paymentsInterestSum : (Number(loan.totalInterestPaid) || 0);

      const paymentsPrincipalSum = paymentsForLoan.reduce(
        (sum, p) => sum + (Number(p.paidAmount) || 0),
        0
      );
      const paid = paymentsForLoan.length > 0 ? Math.max(paymentsPrincipalSum, Number(loan.paidAmount) || 0) : (Number(loan.paidAmount) || 0);

      const remainingPrincipal = Math.max(0, principal - paid - discount);
      const expectedRemaining = remainingPrincipal + penalty;

      const accruedInterest = calculateLoanTotalAccruedInterest(loan);
      const initialInterest = Math.round((principal * (loan.interestRate || 0)) / 100);
      const totalInterest = Math.max(Number(loan.totalInterest) || 0, accruedInterest, initialInterest);
      const dueInterest = Math.max(0, totalInterest - totalInterestPaid);

      let status = loan.status;
      let remainingAmount = loan.remainingAmount;
      let totalPayable = loan.totalPayable;

      // Auto-mark loans as COMPLETED if fully paid or previously marked CLOSED
      if ((status as string) === 'CLOSED' || (status === 'ACTIVE' && expectedRemaining <= 0 && dueInterest <= 0)) {
        status = 'COMPLETED';
        remainingAmount = 0;
        totalPayable = principal + totalInterest;
      } else if (status === 'ACTIVE') {
        remainingAmount = expectedRemaining + dueInterest;
        totalPayable = principal + totalInterest;
      }

      if (
        loan.status !== status ||
        loan.remainingAmount !== remainingAmount ||
        loan.totalInterest !== totalInterest ||
        loan.totalInterestPaid !== totalInterestPaid ||
        loan.paidAmount !== paid ||
        loan.customerId !== customerId ||
        loan.customerName !== customerName ||
        loan.accountNumber !== accountNumber ||
        loan.officeId !== officeId ||
        loan.customerMobile !== customerMobile ||
        loan.totalPayable !== totalPayable
      ) {
        loanChanged = true;
        hasChanges = true;
      }

      const updatedLoan: Loan = {
        ...loan,
        customerId,
        customerName,
        accountNumber,
        officeId,
        customerMobile,
        totalInterest,
        totalInterestPaid,
        paidAmount: paid,
        totalPayable,
        remainingAmount,
        status,
      };

      return updatedLoan;
    });

    if (hasChanges) {
      setStoredData(STORAGE_KEYS.LOANS, sanitized);
    }
    return sanitized;
  },

  getLoanByCustomerId: (customerId: string): Loan | undefined => {
    const cust = StorageService.getCustomerById(customerId);
    const custLoans = StorageService.getLoans().filter(
      (l) => l.customerId === customerId || (cust && cust.accountNumber && l.accountNumber === cust.accountNumber)
    );
    return custLoans.find((l) => l.status === 'ACTIVE') || [...custLoans].sort((a, b) => (b.updatedAt || b.issueDate || '').localeCompare(a.updatedAt || a.issueDate || ''))[0];
  },

  saveLoan: (loanData: Omit<Loan, 'id' | 'updatedAt'> & { id?: string }): Loan => {
    const loans = StorageService.getLoans();
    const existingIndex = loans.findIndex(
      (l) => (loanData.id && l.id === loanData.id) ||
             (loanData.customerId && l.customerId === loanData.customerId && l.status === 'ACTIVE') ||
             (loanData.accountNumber && l.accountNumber === loanData.accountNumber && l.status === 'ACTIVE') ||
             (loanData.customerId && l.customerId === loanData.customerId) ||
             (loanData.accountNumber && l.accountNumber === loanData.accountNumber)
    );

    const customers = getStoredData<Customer[]>(STORAGE_KEYS.CUSTOMERS, []);
    const custIndex = customers.findIndex(
      (c) => (loanData.customerId && c.id === loanData.customerId) ||
             (loanData.accountNumber && c.accountNumber === loanData.accountNumber)
    );
    const cust = custIndex >= 0 ? customers[custIndex] : undefined;

    // Ensure customer has hasLoan flag set to true if loan is active
    if (custIndex >= 0 && loanData.status !== 'COMPLETED' && loanData.status !== 'CLOSED') {
      if (!customers[custIndex].hasLoan) {
        customers[custIndex].hasLoan = true;
        setStoredData(STORAGE_KEYS.CUSTOMERS, customers);
        syncToFirestore('customers', customers[custIndex].id, customers[custIndex]);
      }
    }

    const principal = Number(loanData.principalAmount) || 0;
    const rate = Number(loanData.interestRate) || 0;
    const initialInterest = Math.round((principal * rate) / 100);
    const totalInterest = Number(loanData.totalInterest) > 0 ? Number(loanData.totalInterest) : initialInterest;

    const allLoanPayments = getStoredData<LoanPayment[]>(STORAGE_KEYS.LOAN_PAYMENTS, []);
    const paymentsForLoan = allLoanPayments.filter(
      (lp) => (loanData.id && lp.loanId === loanData.id) ||
              (loanData.customerId && lp.customerId === loanData.customerId) ||
              (loanData.accountNumber && lp.accountNumber === loanData.accountNumber)
    );
    const paymentsInterestSum = paymentsForLoan.reduce(
      (sum, p) => sum + (Number(p.interestPaid) || 0),
      0
    );
    // Explicitly preserve and prioritize user-entered paid interest
    const totalInterestPaid = paymentsForLoan.length > 0
      ? paymentsInterestSum
      : (loanData.totalInterestPaid !== undefined ? Number(loanData.totalInterestPaid) || 0 : 0);

    const paymentsPrincipalSum = paymentsForLoan.reduce(
      (sum, p) => sum + (Number(p.paidAmount) || 0),
      0
    );
    const paidAmount = paymentsForLoan.length > 0
      ? Math.max(paymentsPrincipalSum, Number(loanData.paidAmount) || 0)
      : (Number(loanData.paidAmount) || 0);

    const targetId = loanData.id || (existingIndex >= 0 ? loans[existingIndex].id : 'loan_' + Date.now());

    const newLoan: Loan = {
      ...loanData,
      id: targetId,
      customerId: loanData.customerId || cust?.id || '',
      customerName: loanData.customerName || cust?.name || '',
      accountNumber: loanData.accountNumber || cust?.accountNumber || '',
      officeId: loanData.officeId || cust?.officeId || 'MAIN',
      customerMobile: loanData.customerMobile || cust?.mobile || '',
      totalInterest,
      totalInterestPaid,
      paidAmount,
      updatedAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      loans[existingIndex] = newLoan;
    } else {
      loans.push(newLoan);
    }

    setStoredData(STORAGE_KEYS.LOANS, loans);
    syncToFirestore('loans', newLoan.id, newLoan);
    return newLoan;
  },

  // Loan Payment History Operations
  getLoanPayments: (): LoanPayment[] => {
    const rawPayments = deduplicateLoanPayments(getStoredData<LoanPayment[]>(STORAGE_KEYS.LOAN_PAYMENTS, []));
    const rawCustomers = StorageService.getCustomers();
    const rawLoans = deduplicateLoans(getStoredData<Loan[]>(STORAGE_KEYS.LOANS, []));
    let hasChanges = false;

    const sanitized = rawPayments.map((p) => {
      let changed = false;
      const cust = rawCustomers.find(
        (c) => c.id === p.customerId || (p.accountNumber && c.accountNumber === p.accountNumber)
      );
      const loan = rawLoans.find((l) => (p.loanId && l.id === p.loanId) || (p.customerId && l.customerId === p.customerId) || (p.accountNumber && l.accountNumber === p.accountNumber));

      const customerName = p.customerName || cust?.name || loan?.customerName || '';
      const accountNumber = p.accountNumber || cust?.accountNumber || loan?.accountNumber || '';
      const officeId = p.officeId || cust?.officeId || loan?.officeId || 'MAIN';
      const customerMobile = p.customerMobile || cust?.mobile || (loan as any)?.customerMobile || '';

      const paymentsForLoan = rawPayments.filter(
        (lp) => (p.loanId && lp.loanId === p.loanId) || (p.customerId && lp.customerId === p.customerId) || (p.accountNumber && lp.accountNumber === p.accountNumber)
      );
      const totalInterestPaid = paymentsForLoan.reduce(
        (sum, item) => sum + (Number(item.interestPaid) || 0),
        0
      );

      const principal = Number(loan?.principalAmount) || 0;
      const rate = Number(loan?.interestRate) || 0;
      const calculatedInterest = Math.round((principal * rate) / 100);
      const totalInterest = loan && Number(loan.totalInterest) > 0
        ? Number(loan.totalInterest)
        : (calculatedInterest > 0 ? calculatedInterest : totalInterestPaid);

      const totalPaid = (Number(p.paidAmount) || 0) + (Number(p.interestPaid) || 0) + (Number(p.penaltyPaid) || 0);

      if (
        p.customerName !== customerName ||
        p.accountNumber !== accountNumber ||
        p.officeId !== officeId ||
        p.customerMobile !== customerMobile ||
        p.totalInterest !== totalInterest ||
        p.totalInterestPaid !== totalInterestPaid ||
        p.totalPaid !== totalPaid
      ) {
        changed = true;
        hasChanges = true;
      }

      const updatedPayment: LoanPayment = {
        ...p,
        customerName,
        accountNumber,
        officeId,
        customerMobile,
        totalInterest,
        totalInterestPaid,
        totalPaid,
      };

      return updatedPayment;
    });

    if (hasChanges) {
      setStoredData(STORAGE_KEYS.LOAN_PAYMENTS, sanitized);
    }
    return sanitized;
  },

  saveLoanPaymentsBatch: (updatedPayments: LoanPayment[]): void => {
    const deduped = deduplicateLoanPayments(updatedPayments);
    setStoredData(STORAGE_KEYS.LOAN_PAYMENTS, deduped);
    deduped.forEach((p) => syncToFirestore('loanPayments', p.id, p));
  },

  addLoanPayment: (payment: Omit<LoanPayment, 'id'>): LoanPayment => {
    const payments = StorageService.getLoanPayments();
    const customers = getStoredData<Customer[]>(STORAGE_KEYS.CUSTOMERS, []);
    const cust = customers.find(
      (c) => c.id === payment.customerId || (payment.accountNumber && c.accountNumber === payment.accountNumber)
    );
    const allLoans = StorageService.getLoans();
    const loan = allLoans.find((l) => (payment.loanId && l.id === payment.loanId) || (payment.customerId && l.customerId === payment.customerId) || (payment.accountNumber && l.accountNumber === payment.accountNumber));

    const customerName = payment.customerName || cust?.name || loan?.customerName || '';
    const accountNumber = payment.accountNumber || cust?.accountNumber || loan?.accountNumber || '';
    const officeId = payment.officeId || cust?.officeId || loan?.officeId || 'MAIN';
    const customerMobile = payment.customerMobile || cust?.mobile || (loan as any)?.customerMobile || '';

    const prevPaymentsForLoan = payments.filter(
      (lp) => (payment.loanId && lp.loanId === payment.loanId) || (payment.customerId && lp.customerId === payment.customerId) || (payment.accountNumber && lp.accountNumber === payment.accountNumber)
    );
    const totalInterestPaid = prevPaymentsForLoan.reduce(
      (sum, p) => sum + (Number(p.interestPaid) || 0),
      0
    ) + (Number(payment.interestPaid) || 0);

    const principal = Number(loan?.principalAmount) || 0;
    const rate = Number(loan?.interestRate) || 0;
    const initialInterest = Math.round((principal * rate) / 100);
    const totalInterest = loan && Number(loan.totalInterest) > 0 ? Number(loan.totalInterest) : initialInterest;
    const totalPaid = (Number(payment.paidAmount) || 0) + (Number(payment.interestPaid) || 0) + (Number(payment.penaltyPaid) || 0);

    const newPayment: LoanPayment = {
      ...payment,
      customerName,
      accountNumber,
      officeId,
      customerMobile,
      totalInterest,
      totalInterestPaid,
      totalPaid,
      id: 'lpay_' + Date.now(),
    };
    payments.unshift(newPayment);
    setStoredData(STORAGE_KEYS.LOAN_PAYMENTS, payments);
    syncToFirestore('loanPayments', newPayment.id, newPayment);

    if (loan) {
      const allLoanPayments = [newPayment, ...prevPaymentsForLoan];
      const newPaid = allLoanPayments.reduce((sum, p) => sum + (Number(p.paidAmount) || 0), 0);
      const newDiscount = allLoanPayments.reduce((sum, p) => sum + (Number(p.discountAmount) || 0), 0);
      const newPenalty = (loan.penaltyAmount || 0) + (Number(payment.penaltyPaid) || 0);
      const remainingPrincipal = Math.max(0, principal - newPaid - newDiscount);
      const dueInterest = Math.max(0, totalInterest - totalInterestPaid);
      const newRemaining = remainingPrincipal + newPenalty + dueInterest;
      const isClosed = newRemaining <= 0;
      const newTotalPayable = principal + totalInterest;

      StorageService.saveLoan({
        ...loan,
        customerName,
        accountNumber,
        officeId,
        customerMobile,
        totalPayable: newTotalPayable,
        totalInterest,
        totalInterestPaid,
        paidAmount: newPaid,
        discountAmount: newDiscount,
        remainingAmount: newRemaining,
        penaltyAmount: newPenalty,
        status: isClosed ? 'COMPLETED' : 'ACTIVE',
      });
    }

    return newPayment;
  },

  // Interest & Penalty Settings
  getInterestRates: (): InterestRateConfig[] => {
    const rates = getStoredData<InterestRateConfig[]>(STORAGE_KEYS.INTEREST_RATES, []);
    return sortInterestRatesHelper(rates);
  },

  addInterestRate: (rate: number, rateType: 'MONTHLY' | 'WEEKLY' = 'MONTHLY', note?: string): InterestRateConfig => {
    const rates = StorageService.getInterestRates();
    const newRate: InterestRateConfig = {
      id: 'ir_' + Date.now(),
      rate,
      rateType,
      effectiveDate: new Date().toISOString().split('T')[0],
      note: note || 'नवीन लागू केलेला व्याजदर',
    };
    rates.unshift(newRate);
    const sorted = sortInterestRatesHelper(rates);
    setStoredData(STORAGE_KEYS.INTEREST_RATES, sorted);
    syncToFirestore('interestRates', newRate.id, newRate);
    return newRate;
  },

  deleteInterestRate: (id: string): void => {
    const rates = StorageService.getInterestRates().filter((r) => r.id !== id);
    setStoredData(STORAGE_KEYS.INTEREST_RATES, rates);
    deleteFromFirestore('interestRates', id);
  },

  getPenaltySettings: (): PenaltySetting => {
    return getStoredData<PenaltySetting>(STORAGE_KEYS.PENALTY_SETTINGS, {
      id: 'default',
      weeklyPenalty: 50,
      monthlyPenalty: 200,
      graceDays: 2,
    });
  },

  savePenaltySettings: (settings: PenaltySetting): void => {
    setStoredData(STORAGE_KEYS.PENALTY_SETTINGS, settings);
    syncToFirestore('penaltySettings', 'default', settings);
  },

  // SMS Logs Operations
  getSmsLogs: (): SmsLog[] => getStoredData<SmsLog[]>(STORAGE_KEYS.SMS_LOGS, []),

  addSmsLog: (log: Omit<SmsLog, 'id' | 'sentAt'>): SmsLog => {
    const logs = StorageService.getSmsLogs();
    const newLog: SmsLog = {
      ...log,
      id: 'sms_' + Date.now(),
      sentAt: new Date().toISOString(),
    };
    logs.unshift(newLog);
    setStoredData(STORAGE_KEYS.SMS_LOGS, logs);
    // Note: smsLogs are kept local only and not synced to Firestore database as requested
    return newLog;
  },

  // ── Thakbaki (थकबाकी) Operations ──────────────────────────────────────────
  getThakbakiList: (): ThakbakiEntry[] => {
    return getStoredData<ThakbakiEntry[]>(STORAGE_KEYS.THAKBAKI, []);
  },

  getThakbakiById: (id: string): ThakbakiEntry | undefined => {
    return StorageService.getThakbakiList().find((e) => e.id === id);
  },

  addThakbaki: (data: Omit<ThakbakiEntry, 'id' | 'createdAt' | 'updatedAt' | 'payments' | 'paidAmount' | 'remainingAmount' | 'status'>): ThakbakiEntry => {
    const list = StorageService.getThakbakiList();
    const entry: ThakbakiEntry = {
      ...data,
      id: 'tb_' + Date.now(),
      paidAmount: 0,
      remainingAmount: data.initialAmount,
      status: 'PENDING',
      payments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setStoredData(STORAGE_KEYS.THAKBAKI, [entry, ...list]);
    syncToFirestore('thakbaki', entry.id, entry);
    return entry;
  },

  updateThakbaki: (id: string, updates: Partial<Omit<ThakbakiEntry, 'id' | 'createdAt' | 'payments'>>): ThakbakiEntry => {
    const list = StorageService.getThakbakiList();
    const index = list.findIndex((e) => e.id === id);
    if (index === -1) throw new Error('थकबाकी नोंद सापडली नाही.');
    list[index] = { ...list[index], ...updates, updatedAt: new Date().toISOString() };
    setStoredData(STORAGE_KEYS.THAKBAKI, list);
    syncToFirestore('thakbaki', id, list[index]);
    return list[index];
  },

  recordThakbakiPayment: (id: string, paymentData: { paymentDate: string; paidAmount: number; paymentMode: 'CASH' | 'ONLINE' | 'BANK'; note?: string }): ThakbakiEntry => {
    const list = StorageService.getThakbakiList();
    const index = list.findIndex((e) => e.id === id);
    if (index === -1) throw new Error('थकबाकी नोंद सापडली नाही.');

    const entry = list[index];
    const payment: ThakbakiPayment = {
      id: 'tbp_' + Date.now(),
      paymentDate: paymentData.paymentDate,
      paidAmount: paymentData.paidAmount,
      paymentMode: paymentData.paymentMode,
      note: paymentData.note,
      createdAt: new Date().toISOString(),
    };

    const newPaidAmount = (entry.paidAmount || 0) + paymentData.paidAmount;
    const newRemainingAmount = Math.max(0, entry.initialAmount - newPaidAmount);

    const updatedEntry: ThakbakiEntry = {
      ...entry,
      payments: [...(entry.payments || []), payment],
      paidAmount: newPaidAmount,
      remainingAmount: newRemainingAmount,
      status: newRemainingAmount <= 0 ? 'CLEARED' : 'PENDING',
      lastPaymentDate: paymentData.paymentDate,
      updatedAt: new Date().toISOString(),
    };

    list[index] = updatedEntry;
    setStoredData(STORAGE_KEYS.THAKBAKI, list);
    syncToFirestore('thakbaki', id, updatedEntry);
    return updatedEntry;
  },

  deleteThakbakiPayment: (thakbakiId: string, paymentId: string): ThakbakiEntry => {
    const list = StorageService.getThakbakiList();
    const index = list.findIndex((e) => e.id === thakbakiId);
    if (index === -1) throw new Error('थकबाकी नोंद सापडली नाही.');

    const entry = list[index];
    const paymentToDelete = (entry.payments || []).find((p) => p.id === paymentId);
    if (!paymentToDelete) throw new Error('जमा नोंद सापडली नाही.');

    const newPayments = (entry.payments || []).filter((p) => p.id !== paymentId);
    const newPaidAmount = Math.max(0, (entry.paidAmount || 0) - paymentToDelete.paidAmount);
    const newRemainingAmount = Math.max(0, entry.initialAmount - newPaidAmount);
    const lastPayment = newPayments.length > 0 ? newPayments[newPayments.length - 1].paymentDate : undefined;

    const updatedEntry: ThakbakiEntry = {
      ...entry,
      payments: newPayments,
      paidAmount: newPaidAmount,
      remainingAmount: newRemainingAmount,
      status: newRemainingAmount <= 0 ? 'CLEARED' : 'PENDING',
      lastPaymentDate: lastPayment,
      updatedAt: new Date().toISOString(),
    };

    list[index] = updatedEntry;
    setStoredData(STORAGE_KEYS.THAKBAKI, list);
    syncToFirestore('thakbaki', thakbakiId, updatedEntry);
    return updatedEntry;
  },

  deleteThakbaki: (id: string): void => {
    const list = StorageService.getThakbakiList();
    const entry = list.find((e) => e.id === id);
    const filtered = list.filter((e) => e.id !== id);
    setStoredData(STORAGE_KEYS.THAKBAKI, filtered);
    if (entry) deleteFromFirestore('thakbaki', id, entry);
  },
  // ─────────────────────────────────────────────────────────────────────────────

  // Backup & Restore Operations
  exportBackup: (): SystemBackupData => {
    return {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      admins: StorageService.getAdmins(),
      customers: StorageService.getCustomers(),
      bishiConfigs: StorageService.getBishiConfigs(),
      collections: StorageService.getCollections(),
      loans: StorageService.getLoans(),
      loanPayments: StorageService.getLoanPayments(),
      interestRates: StorageService.getInterestRates(),
      penaltySettings: [StorageService.getPenaltySettings()],
      smsLogs: StorageService.getSmsLogs(),
      thakbaki: StorageService.getThakbakiList(),
    };
  },

  importBackup: (backup: SystemBackupData): void => {
    if (!backup || !backup.version) {
      throw new Error('अवैध बॅकअप फाईल. कृपया योग्य JSON फाईल निवडा.');
    }
    setStoredData(STORAGE_KEYS.ADMINS, backup.admins || []);
    setStoredData(STORAGE_KEYS.CUSTOMERS, backup.customers || []);
    setStoredData(STORAGE_KEYS.BISHI_CONFIGS, backup.bishiConfigs || []);
    setStoredData(STORAGE_KEYS.COLLECTIONS, backup.collections || []);
    setStoredData(STORAGE_KEYS.LOANS, backup.loans || []);
    setStoredData(STORAGE_KEYS.LOAN_PAYMENTS, backup.loanPayments || []);
    setStoredData(STORAGE_KEYS.INTEREST_RATES, backup.interestRates || []);
    if (backup.penaltySettings && backup.penaltySettings[0]) {
      setStoredData(STORAGE_KEYS.PENALTY_SETTINGS, backup.penaltySettings[0]);
    }
    setStoredData(STORAGE_KEYS.SMS_LOGS, backup.smsLogs || []);
    if (backup.thakbaki) {
      setStoredData(STORAGE_KEYS.THAKBAKI, backup.thakbaki);
    }

    // Sync full restoration to Firestore
    (backup.customers || []).forEach((c) => syncToFirestore('customers', c.id, c));
    (backup.collections || []).forEach((c) => syncToFirestore('collections', c.id, c));
    (backup.loans || []).forEach((l) => syncToFirestore('loans', l.id, l));
    (backup.thakbaki || []).forEach((tb) => syncToFirestore('thakbaki', tb.id, tb));
  },

  clearAllData: async (): Promise<void> => {
    setStoredData(STORAGE_KEYS.CUSTOMERS, []);
    setStoredData(STORAGE_KEYS.COLLECTIONS, []);
    setStoredData(STORAGE_KEYS.LOANS, []);
    setStoredData(STORAGE_KEYS.LOAN_PAYMENTS, []);
    setStoredData(STORAGE_KEYS.SMS_LOGS, []);

    try {
      const collectionsToWipe = ['customers', 'collections', 'loans', 'loanPayments', 'smsLogs'];
      for (const colName of collectionsToWipe) {
        const snap = await getDocs(collection(db, colName));
        for (const d of snap.docs) {
          await deleteDoc(d.ref).catch(() => {});
        }
      }
      console.log('[Firestore] All customer and transaction records wiped cleanly.');
    } catch (err) {
      console.warn('Error wiping cloud database:', err);
    }
  },

  // Complete Cloud Database Sync: Uploads all local data to Firebase Firestore
  syncAllToFirestore: async (): Promise<void> => {
    try {
      const customers = StorageService.getCustomers();
      for (const c of customers) {
        await syncToFirestore('customers', c.id, c);
      }
      const loans = StorageService.getLoans();
      for (const l of loans) {
        await syncToFirestore('loans', l.id, l);
      }
      const loanPayments = StorageService.getLoanPayments();
      for (const p of loanPayments) {
        await syncToFirestore('loanPayments', p.id, p);
      }
      const collections = StorageService.getCollections();
      for (const col of collections) {
        await syncToFirestore('collections', col.id, col);
      }
      const bishi = StorageService.getBishiConfigs();
      for (const b of bishi) {
        await syncToFirestore('bishi', b.id, b);
      }
      const interest = StorageService.getInterestRates();
      for (const i of interest) {
        await syncToFirestore('interestRates', i.id, i);
      }
      const penalty = StorageService.getPenaltySettings();
      if (penalty) {
        await syncToFirestore('penaltySettings', penalty.id || 'default', penalty);
      }
      const thakbakiList = StorageService.getThakbakiList();
      for (const tb of thakbakiList) {
        await syncToFirestore('thakbaki', tb.id, tb);
      }
      console.log('[Firestore] Complete synchronization finished.');
    } catch (err) {
      console.warn('[Firestore] Sync all error:', err);
    }
  },

  // Proactive startup cloud pull: fetches all 8 collections from Firestore to immediately populate or sync local storage
  fetchAndSyncFromFirestore: async (): Promise<void> => {
    try {
      startSyncOp();
      const [
        custSnap,
        collSnap,
        loanSnap,
        loanPaySnap,
        bishiSnap,
        rateSnap,
        penaltySnap,
        adminSnap,
      ] = await Promise.all([
        getDocs(collection(db, 'customers')),
        getDocs(collection(db, 'collections')),
        getDocs(collection(db, 'loans')),
        getDocs(collection(db, 'loanPayments')),
        getDocs(collection(db, 'bishi')),
        getDocs(collection(db, 'interestRates')),
        getDocs(collection(db, 'penaltySettings')),
        getDocs(collection(db, 'admins')),
      ]);

      let hadRemoteData = false;

      if (!custSnap.empty) {
        hadRemoteData = true;
        const remoteCusts: Customer[] = [];
        const seenCustDocs = new Map<string, any>();
        custSnap.forEach((d: any) => {
          const raw = d.data();
          const acc = String(raw.accountNumber || '').trim().toLowerCase();
          const key = acc || raw.id || d.id;
          if (seenCustDocs.has(key)) {
            const oldDoc = seenCustDocs.get(key);
            const readableId = getFirestoreDocId('customers', d.id, raw);
            const toDeleteId = d.id === readableId ? oldDoc.id : d.id;
            deleteDoc(doc(db, 'customers', toDeleteId)).catch(() => {});
            if (d.id === readableId) seenCustDocs.set(key, d);
          } else {
            seenCustDocs.set(key, d);
          }
          remoteCusts.push({
            ...raw,
            id: raw.id || d.id,
            name: raw.name || raw.customerName || '',
            customerName: raw.customerName || raw.name || '',
          });
        });
        setStoredData(STORAGE_KEYS.CUSTOMERS, deduplicateCustomers(remoteCusts));
      }

      if (!collSnap.empty) {
        hadRemoteData = true;
        const remoteColls: CollectionEntry[] = [];
        const seenCollDocs = new Map<string, any>();
        collSnap.forEach((d: any) => {
          const raw = d.data();
          const acc = String(raw.accountNumber || '').trim().toLowerCase();
          const custId = String(raw.customerId || '').trim();
          const bishi = String(raw.bishiType || '').trim();
          const period = String(raw.periodIndex ?? '');
          const primaryKey = acc ? `${acc}_${period}` : `${custId}_${period}`;
          const key = bishi ? `${primaryKey}_${bishi}` : primaryKey;

          if (seenCollDocs.has(key)) {
            const oldDoc = seenCollDocs.get(key);
            const readableId = getFirestoreDocId('collections', d.id, raw);
            const toDeleteId = d.id === readableId ? oldDoc.id : d.id;
            deleteDoc(doc(db, 'collections', toDeleteId)).catch(() => {});
            if (d.id === readableId) seenCollDocs.set(key, d);
          } else {
            seenCollDocs.set(key, d);
          }

          remoteColls.push({
            ...raw,
            id: raw.id || d.id,
            customerName: raw.customerName || '',
          });
        });
        setStoredData(STORAGE_KEYS.COLLECTIONS, deduplicateCollections(remoteColls));
      }

      if (!loanSnap.empty) {
        hadRemoteData = true;
        const remoteLoans: Loan[] = [];
        const seenLoanDocs = new Map<string, any>();
        loanSnap.forEach((d: any) => {
          const raw = d.data();
          const acc = String(raw.accountNumber || '').trim().toLowerCase();
          const key = raw.id || d.id || (acc ? `${acc}_${raw.issueDate || ''}_${raw.principalAmount || 0}` : (raw.customerId || Math.random().toString()));
          if (seenLoanDocs.has(key)) {
            const oldDoc = seenLoanDocs.get(key);
            const readableId = getFirestoreDocId('loans', d.id, raw);
            const toDeleteId = d.id === readableId ? oldDoc.id : d.id;
            deleteDoc(doc(db, 'loans', toDeleteId)).catch(() => {});
            if (d.id === readableId) seenLoanDocs.set(key, d);
          } else {
            seenLoanDocs.set(key, d);
          }
          remoteLoans.push({
            ...raw,
            id: raw.id || d.id,
            customerName: raw.customerName || '',
          });
        });
        setStoredData(STORAGE_KEYS.LOANS, deduplicateLoans(remoteLoans));
      }

      if (!loanPaySnap.empty) {
        hadRemoteData = true;
        const remotePayments: LoanPayment[] = [];
        loanPaySnap.forEach((d: any) => {
          const raw = d.data();
          remotePayments.push({
            ...raw,
            id: raw.id || d.id,
          });
        });
        setStoredData(STORAGE_KEYS.LOAN_PAYMENTS, deduplicateLoanPayments(remotePayments));
      }

      if (!bishiSnap.empty) {
        hadRemoteData = true;
        const remoteBishi: BishiConfig[] = [];
        bishiSnap.forEach((d: any) => {
          const raw = d.data();
          remoteBishi.push({
            ...raw,
            id: raw.id || d.id,
          });
        });
        setStoredData(STORAGE_KEYS.BISHI_CONFIGS, remoteBishi);
      }

      if (!rateSnap.empty) {
        hadRemoteData = true;
        const remoteRates: InterestRateConfig[] = [];
        rateSnap.forEach((d: any) => {
          const raw = d.data();
          remoteRates.push({
            ...raw,
            id: raw.id || d.id,
          });
        });
        setStoredData(STORAGE_KEYS.INTEREST_RATES, sortInterestRatesHelper(remoteRates));
      }

      if (!penaltySnap.empty) {
        hadRemoteData = true;
        let remotePenalty: PenaltySetting | null = null;
        penaltySnap.forEach((d: any) => {
          remotePenalty = d.data() as PenaltySetting;
        });
        if (remotePenalty) {
          setStoredData(STORAGE_KEYS.PENALTY_SETTINGS, remotePenalty);
        }
      }

      if (!adminSnap.empty) {
        hadRemoteData = true;
        const remoteAdmins: Admin[] = [];
        adminSnap.forEach((d: any) => {
          const raw = d.data();
          remoteAdmins.push({
            ...raw,
            id: raw.id || d.id,
          });
          if (raw.password) {
            localStorage.setItem('sb_admin_pass', String(raw.password));
          }
        });
        if (remoteAdmins.length > 0) {
          setStoredData(STORAGE_KEYS.ADMINS, remoteAdmins);
        }
      }

      // If Firestore is completely fresh and empty, upload local data to seed cloud database
      if (!hadRemoteData) {
        await StorageService.syncAllToFirestore();
      }

      endSyncOp(true);
    } catch (err) {
      console.warn('[Firestore] Proactive pull note:', err);
      endSyncOp(false);
    }
  },

  // Real-time synchronization listeners with Firebase Firestore across all 8 collections
  setupFirestoreListeners: (onUpdate: () => void): (() => void) => {
    const unsubscribes: (() => void)[] = [];
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedUpdate = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        onUpdate();
      }, 150);
    };

    // 1. Listen for customers in Firestore
    try {
      const unsubCust = onSnapshot(
        collection(db, 'customers'),
        (snapshot: any) => {
          const remoteList: Customer[] = [];
          snapshot.forEach((d: any) => {
            const raw = d.data();
            const fullCustomer: Customer = {
              ...raw,
              id: raw.id || d.id,
              name: raw.name || raw.customerName || '',
              customerName: raw.customerName || raw.name || '',
            };
            remoteList.push(fullCustomer);
          });
          setStoredData(STORAGE_KEYS.CUSTOMERS, deduplicateCustomers(remoteList));
          debouncedUpdate();
        },
        (err: any) => console.warn('Firestore customers listener error:', err?.message || err)
      );
      unsubscribes.push(unsubCust);
    } catch (e) {}

    // 2. Listen for loans in Firestore
    try {
      const unsubLoans = onSnapshot(
        collection(db, 'loans'),
        (snapshot: any) => {
          const remoteList: Loan[] = [];
          snapshot.forEach((d: any) => {
            const raw = d.data();
            const fullLoan: Loan = {
              ...raw,
              id: raw.id || d.id,
              customerName: raw.customerName || '',
            };
            remoteList.push(fullLoan);
          });
          setStoredData(STORAGE_KEYS.LOANS, deduplicateLoans(remoteList));
          debouncedUpdate();
        },
        (err: any) => console.warn('Firestore loans listener error:', err?.message || err)
      );
      unsubscribes.push(unsubLoans);
    } catch (e) {}

    // 3. Listen for collections in Firestore (all entries saved without filtering)
    try {
      const unsubColls = onSnapshot(
        collection(db, 'collections'),
        (snapshot: any) => {
          const remoteList: CollectionEntry[] = [];
          snapshot.forEach((d: any) => {
            const raw = d.data();
            const fullColl: CollectionEntry = {
              ...raw,
              id: raw.id || d.id,
              customerName: raw.customerName || '',
            };
            remoteList.push(fullColl);
          });
          setStoredData(STORAGE_KEYS.COLLECTIONS, deduplicateCollections(remoteList));
          debouncedUpdate();
        },
        (err: any) => console.warn('Firestore collections listener error:', err?.message || err)
      );
      unsubscribes.push(unsubColls);
    } catch (e) {}

    // 4. Listen for loanPayments in Firestore
    try {
      const unsubLoanPay = onSnapshot(
        collection(db, 'loanPayments'),
        (snapshot: any) => {
          const remoteList: LoanPayment[] = [];
          snapshot.forEach((d: any) => {
            const raw = d.data();
            remoteList.push({
              ...raw,
              id: raw.id || d.id,
            });
          });
          setStoredData(STORAGE_KEYS.LOAN_PAYMENTS, deduplicateLoanPayments(remoteList));
          debouncedUpdate();
        },
        (err: any) => console.warn('Firestore loanPayments listener error:', err?.message || err)
      );
      unsubscribes.push(unsubLoanPay);
    } catch (e) {}

    // 5. Listen for bishi configs in Firestore
    try {
      const unsubBishi = onSnapshot(
        collection(db, 'bishi'),
        (snapshot: any) => {
          if (!snapshot.empty) {
            const remoteList: BishiConfig[] = [];
            snapshot.forEach((d: any) => {
              const raw = d.data();
              remoteList.push({
                ...raw,
                id: raw.id || d.id,
              });
            });
            setStoredData(STORAGE_KEYS.BISHI_CONFIGS, remoteList);
            debouncedUpdate();
          }
        },
        (err: any) => console.warn('Firestore bishi listener error:', err?.message || err)
      );
      unsubscribes.push(unsubBishi);
    } catch (e) {}

    // 6. Listen for interestRates in Firestore
    try {
      const unsubRates = onSnapshot(
        collection(db, 'interestRates'),
        (snapshot: any) => {
          if (!snapshot.empty) {
            const remoteList: InterestRateConfig[] = [];
            snapshot.forEach((d: any) => {
              const raw = d.data();
              remoteList.push({
                ...raw,
                id: raw.id || d.id,
              });
            });
            setStoredData(STORAGE_KEYS.INTEREST_RATES, sortInterestRatesHelper(remoteList));
            debouncedUpdate();
          }
        },
        (err: any) => console.warn('Firestore interestRates listener error:', err?.message || err)
      );
      unsubscribes.push(unsubRates);
    } catch (e) {}

    // 7. Listen for penaltySettings in Firestore
    try {
      const unsubPenalty = onSnapshot(
        collection(db, 'penaltySettings'),
        (snapshot: any) => {
          if (!snapshot.empty) {
            let remotePenalty: PenaltySetting | null = null;
            snapshot.forEach((d: any) => {
              remotePenalty = d.data() as PenaltySetting;
            });
            if (remotePenalty) {
              setStoredData(STORAGE_KEYS.PENALTY_SETTINGS, remotePenalty);
              debouncedUpdate();
            }
          }
        },
        (err: any) => console.warn('Firestore penaltySettings listener error:', err?.message || err)
      );
      unsubscribes.push(unsubPenalty);
    } catch (e) {}

    // 8. Listen for admins & password in Firestore
    try {
      const unsubAdmins = onSnapshot(
        collection(db, 'admins'),
        (snapshot: any) => {
          if (!snapshot.empty) {
            const remoteList: Admin[] = [];
            snapshot.forEach((d: any) => {
              const raw = d.data();
              remoteList.push({
                ...raw,
                id: raw.id || d.id,
              });
              if (raw.password) {
                localStorage.setItem('sb_admin_pass', String(raw.password));
              }
            });
            setStoredData(STORAGE_KEYS.ADMINS, remoteList);
            debouncedUpdate();
          }
        },
        (err: any) => console.warn('Firestore admins listener error:', err?.message || err)
      );
      unsubscribes.push(unsubAdmins);
    } catch (e) {}

    // 9. Listen for thakbaki in Firestore
    try {
      const unsubThakbaki = onSnapshot(
        collection(db, 'thakbaki'),
        (snapshot: any) => {
          if (!snapshot.empty) {
            const remoteList: ThakbakiEntry[] = [];
            snapshot.forEach((d: any) => {
              const raw = d.data();
              remoteList.push({
                ...raw,
                id: raw.id || d.id,
                payments: raw.payments || [],
              });
            });
            setStoredData(STORAGE_KEYS.THAKBAKI, remoteList);
            debouncedUpdate();
          }
        },
        (err: any) => console.warn('Firestore thakbaki listener error:', err?.message || err)
      );
      unsubscribes.push(unsubThakbaki);
    } catch (e) {}

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubscribes.forEach((fn) => {
        try {
          fn();
        } catch (e) {}
      });
    };
  },
};
