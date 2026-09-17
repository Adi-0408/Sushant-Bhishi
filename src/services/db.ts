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
} from '../types';

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
        if (!existing || (c.status === 'PAID' && existing.status !== 'PAID')) {
          dedupMap.set(c.periodIndex, c);
        }
      });
      const custColls = Array.from(dedupMap.values()).sort((a, b) => a.periodIndex - b.periodIndex);

      if (custColls.length > 0) {
        const totalExpected = custColls.reduce((acc, c) => acc + (c.expectedAmount || 0), 0);
        const totalCollected = custColls.reduce((acc, c) => acc + (c.collectedAmount || 0), 0);
        const totalPenalty = custColls.reduce((acc, c) => acc + (c.penaltyAmount || 0), 0);
        data.summary = {
          totalExpected,
          totalCollected,
          totalPenalty,
          totalCollectedWithPenalty: totalCollected + totalPenalty,
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
          remainingAmount: c.remainingAmount,
          penaltyAmount: c.penaltyAmount || 0,
          totalWithPenalty: (c.collectedAmount || 0) + (c.penaltyAmount || 0),
          status: c.status,
        }));
      }

      const allLoans = getStoredData<Loan[]>(STORAGE_KEYS.LOANS, []);
      const custLoan = allLoans.find(
        (l) =>
          (l.customerId === data.id || (data.accountNumber && l.accountNumber === data.accountNumber)) &&
          l.status === 'ACTIVE'
      );
      if (custLoan) {
        data.loanDetails = {
          principalAmount: custLoan.principalAmount,
          interestRate: custLoan.interestRate,
          totalInterest: custLoan.totalInterest,
          totalPayable: custLoan.totalPayable,
          paidAmount: custLoan.paidAmount,
          remainingAmount: custLoan.remainingAmount,
          status: custLoan.status,
        };
      }
    } catch (e) {
      // Ignore enrichment lookup issues
    }
  } else if (collectionName === 'collections') {
    if (!data.customerName) {
      try {
        const customers = getStoredData<Customer[]>(STORAGE_KEYS.CUSTOMERS, []);
        const cust = customers.find(
          (c) => c.id === data.customerId || (data.accountNumber && c.accountNumber === data.accountNumber)
        );
        if (cust) {
          data.customerName = cust.name;
        }
      } catch (e) {}
    }
    data.penaltyAmount = Number(data.penaltyAmount) || 0;
    data.totalWithPenalty = (Number(data.collectedAmount) || 0) + data.penaltyAmount;
  } else if (
    collectionName === 'loans' ||
    collectionName === 'loanPayments'
  ) {
    if (!data.customerName) {
      try {
        const customers = getStoredData<Customer[]>(STORAGE_KEYS.CUSTOMERS, []);
        const cust = customers.find(
          (c) => c.id === data.customerId || (data.accountNumber && c.accountNumber === data.accountNumber)
        );
        if (cust) {
          data.customerName = cust.name;
        }
      } catch (e) {}
    }
  }

  return data;
};

// Firestore sync helpers (silent sync when Firestore is online)
const syncToFirestore = async (collectionName: string, docId: string, data: any) => {
  try {
    const enrichedData = enrichFirestoreData(collectionName, data);
    const readableDocId = getFirestoreDocId(collectionName, docId, enrichedData);
    const cleanData = sanitizeForFirestore(enrichedData);
    const ref = doc(db, collectionName, readableDocId);
    await setDoc(ref, cleanData, { merge: true });
    console.log(`[Firestore Sync] Saved to ${collectionName}/${readableDocId}`);
  } catch (e: any) {
    console.warn(`Firestore sync note for ${collectionName}/${docId}:`, e?.message || e);
  }
};

const deleteFromFirestore = async (collectionName: string, docId: string, data?: any) => {
  try {
    const readableDocId = data ? getFirestoreDocId(collectionName, docId, data) : docId;
    const ref = doc(db, collectionName, readableDocId);
    await deleteDoc(ref);
    if (readableDocId !== docId) {
      const fallbackRef = doc(db, collectionName, docId);
      await deleteDoc(fallbackRef).catch(() => {});
    }
    console.log(`[Firestore Delete] Removed ${collectionName}/${readableDocId}`);
  } catch (e: any) {
    console.warn(`Firestore delete note for ${collectionName}/${docId}:`, e?.message || e);
  }
};

// Initialize default configs if empty
const initializeDefaultConfigs = () => {
  const currentBishi = getStoredData<BishiConfig[]>(STORAGE_KEYS.BISHI_CONFIGS, []);
  if (currentBishi.length === 0) {
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
      },
      {
        id: '26_JANUARY',
        name: '२६ जानेवारी भिशी',
        startDate: `${currentYear}-01-26`,
        endDate: `${currentYear + 1}-01-25`,
        totalInstallments: 10,
        modality: 'M',
        officeId: 'MAIN',
      },
      {
        id: 'DASARA',
        name: 'दसरा भिशी',
        startDate: `${currentYear}-10-15`,
        endDate: `${currentYear + 1}-10-14`,
        totalInstallments: 40,
        modality: 'W',
        officeId: 'MAIN',
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
};

initializeDefaultConfigs();

export const StorageService = {
  // Admin Operations
  getAdmins: (): Admin[] => getStoredData<Admin[]>(STORAGE_KEYS.ADMINS, []),

  hasAdmin: (): boolean => {
    const admins = getStoredData<Admin[]>(STORAGE_KEYS.ADMINS, []);
    return admins.length > 0;
  },

  createAdmin: (admin: Omit<Admin, 'id' | 'createdAt'>): Admin => {
    const admins = StorageService.getAdmins();
    if (admins.length > 0) {
      throw new Error('प्रशासक खाते आधीच अस्तित्वात आहे. फक्त एकच प्रशासक तयार करता येतो.');
    }
    const newAdmin: Admin = {
      ...admin,
      id: 'admin_' + Date.now(),
      createdAt: new Date().toISOString(),
    };
    setStoredData(STORAGE_KEYS.ADMINS, [newAdmin]);
    syncToFirestore('admins', newAdmin.id, newAdmin);
    return newAdmin;
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
  getCustomers: (): Customer[] => getStoredData<Customer[]>(STORAGE_KEYS.CUSTOMERS, []),

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

  // Collection Entries Operations
  getCollections: (): CollectionEntry[] => getStoredData<CollectionEntry[]>(STORAGE_KEYS.COLLECTIONS, []),

  saveCollectionsBatch: (newEntries: CollectionEntry[]): void => {
    const collections = StorageService.getCollections();
    const newIds = new Set(newEntries.map((e) => e.id));
    const filtered = collections.filter((c) => !newIds.has(c.id));
    setStoredData(STORAGE_KEYS.COLLECTIONS, [...newEntries, ...filtered]);
    newEntries.forEach((entry) => syncToFirestore('collections', entry.id, entry));
  },

  updateCollectionEntry: (id: string, updates: Partial<CollectionEntry>): CollectionEntry => {
    const collections = StorageService.getCollections();
    const index = collections.findIndex((c) => c.id === id);
    if (index === -1) throw new Error('जमा नोंद सापडली नाही.');

    collections[index] = { ...collections[index], ...updates, updatedAt: new Date().toISOString() };
    setStoredData(STORAGE_KEYS.COLLECTIONS, collections);
    syncToFirestore('collections', id, collections[index]);

    // Re-sync customer document so summary and installments in Firestore update immediately
    const custId = collections[index].customerId;
    if (custId) {
      const cust = StorageService.getCustomerById(custId);
      if (cust) {
        syncToFirestore('customers', cust.id, cust);
      }
    }

    return collections[index];
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
  getLoans: (): Loan[] => getStoredData<Loan[]>(STORAGE_KEYS.LOANS, []),

  getLoanByCustomerId: (customerId: string): Loan | undefined => {
    return StorageService.getLoans().find((l) => l.customerId === customerId && l.status === 'ACTIVE');
  },

  saveLoan: (loanData: Omit<Loan, 'id' | 'updatedAt'>): Loan => {
    const loans = StorageService.getLoans();
    const existingIndex = loans.findIndex((l) => l.customerId === loanData.customerId && l.status === 'ACTIVE');

    const newLoan: Loan = {
      ...loanData,
      id: existingIndex >= 0 ? loans[existingIndex].id : 'loan_' + Date.now(),
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
  getLoanPayments: (): LoanPayment[] => getStoredData<LoanPayment[]>(STORAGE_KEYS.LOAN_PAYMENTS, []),

  addLoanPayment: (payment: Omit<LoanPayment, 'id'>): LoanPayment => {
    const payments = StorageService.getLoanPayments();
    const newPayment: LoanPayment = {
      ...payment,
      id: 'lpay_' + Date.now(),
    };
    payments.unshift(newPayment);
    setStoredData(STORAGE_KEYS.LOAN_PAYMENTS, payments);
    syncToFirestore('loanPayments', newPayment.id, newPayment);

    const loan = StorageService.getLoans().find((l) => l.id === payment.loanId);
    if (loan) {
      const newPaid = (loan.paidAmount || 0) + payment.paidAmount;
      const newDiscount = (loan.discountAmount || 0) + (payment.discountAmount || 0);
      const newPenalty = (loan.penaltyAmount || 0) + (payment.penaltyPaid || 0);
      const newTotalPayable = (loan.principalAmount || 0) + (loan.totalInterest || 0) + newPenalty;
      const newRemaining = Math.max(0, newTotalPayable - newPaid - newDiscount);
      const isClosed = newRemaining <= 0;

      StorageService.saveLoan({
        ...loan,
        totalPayable: newTotalPayable,
        paidAmount: newPaid,
        discountAmount: newDiscount,
        remainingAmount: newRemaining,
        penaltyAmount: newPenalty,
        status: isClosed ? 'CLOSED' : 'ACTIVE',
      });
    }

    return newPayment;
  },

  // Interest & Penalty Settings
  getInterestRates: (): InterestRateConfig[] => getStoredData<InterestRateConfig[]>(STORAGE_KEYS.INTEREST_RATES, []),

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
    setStoredData(STORAGE_KEYS.INTEREST_RATES, rates);
    syncToFirestore('interestRates', newRate.id, newRate);
    return newRate;
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

    // Sync full restoration to Firestore
    (backup.customers || []).forEach((c) => syncToFirestore('customers', c.id, c));
    (backup.collections || []).forEach((c) => syncToFirestore('collections', c.id, c));
    (backup.loans || []).forEach((l) => syncToFirestore('loans', l.id, l));
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
      console.log('[Firestore] Complete synchronization finished.');
    } catch (err) {
      console.warn('[Firestore] Sync all error:', err);
    }
  },

  // Real-time synchronization listeners with Firebase Firestore
  setupFirestoreListeners: (onUpdate: () => void): (() => void) => {
    const unsubscribes: (() => void)[] = [];

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
          // Cloud Firestore is the authoritative source of truth.
          // Setting remoteList directly ensures that when a record is deleted from Firestore,
          // it immediately disappears locally and never gets resurrected.
          setStoredData(STORAGE_KEYS.CUSTOMERS, remoteList);
          onUpdate();
        },
        (err: any) => {
          console.warn('Firestore customers listener error:', err?.message || err);
        }
      );
      unsubscribes.push(unsubCust);
    } catch (e) {
      console.warn('Could not setup customers listener:', e);
    }

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
          setStoredData(STORAGE_KEYS.LOANS, remoteList);
          onUpdate();
        },
        (err: any) => console.warn('Firestore loans listener error:', err?.message || err)
      );
      unsubscribes.push(unsubLoans);
    } catch (e) {}

    // 3. Listen for collections in Firestore
    try {
      const unsubColls = onSnapshot(
        collection(db, 'collections'),
        (snapshot: any) => {
          if (!snapshot.empty) {
            const currentCustomers = getStoredData<Customer[]>(STORAGE_KEYS.CUSTOMERS, []);
            const validCustIds = new Set(currentCustomers.map((c) => c.id));
            const validAccNums = new Set(currentCustomers.map((c) => String(c.accountNumber)));

            const remoteList: CollectionEntry[] = [];
            snapshot.forEach((d: any) => {
              const raw = d.data();
              const matchesCust =
                (raw.customerId && validCustIds.has(raw.customerId)) ||
                (raw.accountNumber && validAccNums.has(String(raw.accountNumber)));
              if (matchesCust || currentCustomers.length === 0) {
                const fullColl: CollectionEntry = {
                  ...raw,
                  id: raw.id || d.id,
                  customerName: raw.customerName || '',
                };
                remoteList.push(fullColl);
              }
            });
            setStoredData(STORAGE_KEYS.COLLECTIONS, remoteList);
            onUpdate();
          }
        },
        (err: any) => console.warn('Firestore collections listener error:', err?.message || err)
      );
      unsubscribes.push(unsubColls);
    } catch (e) {}

    return () => {
      unsubscribes.forEach((fn) => {
        try {
          fn();
        } catch (e) {}
      });
    };
  },
};
