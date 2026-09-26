import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  increment,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Customer, CollectionEntry, Loan, LoanPayment } from '../types';
import {
  StorageService,
  deduplicateCustomers,
  deduplicateCollections,
  deduplicateLoans,
  deduplicateLoanPayments,
} from './db';
import { invalidateStatsCache } from './stats';

const LAST_SYNC_KEY = 'sb_last_synced_at';
let isSyncInProgress = false;

export interface IncrementalSyncResult {
  updatedCount: number;
  deletedCount: number;
  readsCount: number;
  isUpToDate: boolean;
  message: string;
}

/**
 * Updates the global sync version / lastUpdated timestamp in Firestore.
 * This signals to all connected devices that an update has occurred.
 */
export const touchSyncTimestamp = async (extraFields?: Record<string, any>): Promise<void> => {
  try {
    const now = new Date().toISOString();
    const statsRef = doc(db, 'stats', 'summary');
    const updatePayload: Record<string, any> = {
      lastUpdated: now,
      ...extraFields,
    };
    await updateDoc(statsRef, updatePayload).catch(async () => {
      await setDoc(statsRef, updatePayload, { merge: true });
    });
    localStorage.setItem(LAST_SYNC_KEY, now);
  } catch (err) {
    console.warn('[Sync] touchSyncTimestamp note:', err);
  }
};

/**
 * Atomic customer addition notification:
 * Updates lastUpdated, increments totalCustomers, and adds accountNumber to activeCustomerAccounts.
 */
export const touchSyncOnCustomerAdd = async (accountNumber: string): Promise<void> => {
  try {
    const now = new Date().toISOString();
    const cleanAcc = String(accountNumber || '').trim();
    const statsRef = doc(db, 'stats', 'summary');
    await updateDoc(statsRef, {
      lastUpdated: now,
      totalCustomers: increment(1),
      activeCustomerAccounts: arrayUnion(cleanAcc),
    }).catch(async () => {
      await setDoc(
        statsRef,
        {
          lastUpdated: now,
          totalCustomers: increment(1),
          activeCustomerAccounts: [cleanAcc],
        },
        { merge: true }
      );
    });
    localStorage.setItem(LAST_SYNC_KEY, now);
  } catch (err) {
    console.warn('[Sync] touchSyncOnCustomerAdd note:', err);
  }
};

/**
 * Atomic customer deletion notification:
 * Updates lastUpdated, decrements totalCustomers, and removes accountNumber from activeCustomerAccounts.
 */
export const touchSyncOnCustomerDelete = async (accountNumber?: string): Promise<void> => {
  try {
    const now = new Date().toISOString();
    const cleanAcc = accountNumber ? String(accountNumber).trim() : '';
    const statsRef = doc(db, 'stats', 'summary');
    const payload: Record<string, any> = {
      lastUpdated: now,
      totalCustomers: increment(-1),
    };
    if (cleanAcc) {
      payload.activeCustomerAccounts = arrayRemove(cleanAcc);
    }
    await updateDoc(statsRef, payload).catch(async () => {
      await setDoc(statsRef, payload, { merge: true });
    });
    localStorage.setItem(LAST_SYNC_KEY, now);
  } catch (err) {
    console.warn('[Sync] touchSyncOnCustomerDelete note:', err);
  }
};

/**
 * Records a deletion tombstone so other devices know to prune this record
 * during incremental sync without scanning the whole collection.
 */
export const recordDeletion = async (
  collectionName: 'customers' | 'collections' | 'loans' | 'loanPayments',
  docId: string,
  extra?: { accountNumber?: string; name?: string }
): Promise<void> => {
  try {
    const now = new Date().toISOString();
    const cleanAcc = extra?.accountNumber ? String(extra.accountNumber).trim() : null;
    const deletionId = `${collectionName}_${cleanAcc || docId}`;
    const delRef = doc(db, 'deletions', deletionId);
    await setDoc(delRef, {
      id: deletionId,
      collectionName,
      docId,
      accountNumber: cleanAcc,
      name: extra?.name || null,
      deletedAt: now,
    });
  } catch (err) {
    console.warn('[Sync] recordDeletion note:', err);
  }
};

/**
 * Performs an ultra-low-read incremental delta sync across all collections:
 * 1. Checks `stats/summary` singleton (strictly 1 read).
 * 2. Immediately reconciles `activeCustomerAccounts` to purge ghost/deleted customers.
 * 3. If `summary.lastUpdated <= lastSyncedAt`, 0 additional reads are incurred.
 * 4. If newer, queries ONLY documents `where('updatedAt', '>', lastSyncedAt)` and `where('deletedAt', '>', lastSyncedAt)`.
 * 5. Merges added/modified items and prunes deleted items from local storage.
 */
export const performIncrementalSync = async (): Promise<IncrementalSyncResult> => {
  if (isSyncInProgress) {
    return {
      updatedCount: 0,
      deletedCount: 0,
      readsCount: 0,
      isUpToDate: true,
      message: 'सिंक आधीपासूनच सुरू आहे (Sync already in progress)',
    };
  }

  isSyncInProgress = true;
  let readsCount = 0;
  let updatedCount = 0;
  let deletedCount = 0;

  try {
    const lastSyncedAt = localStorage.getItem(LAST_SYNC_KEY);

    // Step 1: Read stats/summary for the latest cloud timestamp & active accounts (1 read)
    const statsRef = doc(db, 'stats', 'summary');
    const statsSnap = await getDoc(statsRef);
    readsCount++;

    const statsData = statsSnap.exists() ? statsSnap.data() : null;
    const cloudLastUpdated = statsData?.lastUpdated as string | undefined;

    // Step 1.1: Immediate ghost-customer reconciliation using activeCustomerAccounts
    // This instantly cleans up any deleted customers across all 4 devices without extra reads!
    if (Array.isArray(statsData?.activeCustomerAccounts)) {
      const activeSet = new Set(
        statsData.activeCustomerAccounts.map((a: string) => String(a).trim().toLowerCase())
      );
      const localCusts = StorageService.getCustomers();
      const pruned = localCusts.filter((c) =>
        activeSet.has(String(c.accountNumber).trim().toLowerCase())
      );
      if (pruned.length !== localCusts.length) {
        deletedCount += localCusts.length - pruned.length;
        localStorage.setItem('sb_customers', JSON.stringify(pruned));
      }
    }

    // If cloud timestamp is valid and we are already synchronized with it
    if (cloudLastUpdated && lastSyncedAt && cloudLastUpdated <= lastSyncedAt) {
      invalidateStatsCache();
      return {
        updatedCount: 0,
        deletedCount,
        readsCount,
        isUpToDate: deletedCount === 0,
        message:
          deletedCount > 0
            ? `${deletedCount} हटवलेले खातेदार काढून टाकले (1 रीड)`
            : 'सर्व डेटा आधीपासूनच अद्ययावत आहे (Data is already up to date - 1 read)',
      };
    }

    const filterTimestamp = lastSyncedAt || '2000-01-01T00:00:00.000Z';

    // Step 2: Query only modified or newly created documents across collections
    const [custSnap, collSnap, loanSnap, loanPaySnap, delSnap] = await Promise.all([
      getDocs(query(collection(db, 'customers'), where('updatedAt', '>', filterTimestamp))),
      getDocs(query(collection(db, 'collections'), where('updatedAt', '>', filterTimestamp))),
      getDocs(query(collection(db, 'loans'), where('updatedAt', '>', filterTimestamp))),
      getDocs(query(collection(db, 'loanPayments'), where('updatedAt', '>', filterTimestamp))),
      getDocs(query(collection(db, 'deletions'), where('deletedAt', '>', filterTimestamp))),
    ]);

    readsCount += custSnap.size + collSnap.size + loanSnap.size + loanPaySnap.size + delSnap.size;

    // 2.1 Update Customers
    if (!custSnap.empty) {
      const incomingCusts: Customer[] = [];
      custSnap.forEach((d: any) => {
        const raw = d.data();
        const acc = String(raw.accountNumber || raw.accountNo || '').trim();
        const name = raw.name || raw.customerName || '';
        incomingCusts.push({
          ...raw,
          id: raw.id || d.id,
          name,
          customerName: raw.customerName || name,
          accountNumber: acc,
          accountNo: acc,
        });
      });
      const localCusts = StorageService.getCustomers();
      const merged = deduplicateCustomers([...incomingCusts, ...localCusts]);
      localStorage.setItem('sb_customers', JSON.stringify(merged));
      updatedCount += incomingCusts.length;
    }

    // 2.2 Update Collections
    if (!collSnap.empty) {
      const incomingColls: CollectionEntry[] = [];
      collSnap.forEach((d: any) => {
        const raw = d.data();
        incomingColls.push({ ...raw, id: raw.id || d.id });
      });
      const localColls = StorageService.getCollections();
      const merged = deduplicateCollections([...incomingColls, ...localColls]);
      localStorage.setItem('sb_collections', JSON.stringify(merged));
      updatedCount += incomingColls.length;
    }

    // 2.3 Update Loans
    if (!loanSnap.empty) {
      const incomingLoans: Loan[] = [];
      loanSnap.forEach((d: any) => {
        const raw = d.data();
        incomingLoans.push({ ...raw, id: raw.id || d.id });
      });
      const localLoans = StorageService.getLoans();
      const merged = deduplicateLoans([...incomingLoans, ...localLoans]);
      localStorage.setItem('sb_loans', JSON.stringify(merged));
      updatedCount += incomingLoans.length;
    }

    // 2.4 Update Loan Payments
    if (!loanPaySnap.empty) {
      const incomingPays: LoanPayment[] = [];
      loanPaySnap.forEach((d: any) => {
        const raw = d.data();
        incomingPays.push({ ...raw, id: raw.id || d.id });
      });
      const localPays = StorageService.getLoanPayments();
      const merged = deduplicateLoanPayments([...incomingPays, ...localPays]);
      localStorage.setItem('sb_loan_payments', JSON.stringify(merged));
      updatedCount += incomingPays.length;
    }

    // 2.5 Process Deletions
    if (!delSnap.empty) {
      const deletedCustomerIds = new Set<string>();
      const deletedCustomerAccounts = new Set<string>();
      const deletedCollIds = new Set<string>();
      const deletedLoanIds = new Set<string>();
      const deletedPayIds = new Set<string>();

      delSnap.forEach((d: any) => {
        const raw = d.data();
        if (raw.collectionName === 'customers') {
          if (raw.docId) deletedCustomerIds.add(raw.docId);
          if (raw.accountNumber) deletedCustomerAccounts.add(String(raw.accountNumber).trim().toLowerCase());
        } else if (raw.collectionName === 'collections') {
          deletedCollIds.add(raw.docId);
        } else if (raw.collectionName === 'loans') {
          deletedLoanIds.add(raw.docId);
        } else if (raw.collectionName === 'loanPayments') {
          deletedPayIds.add(raw.docId);
        }
        deletedCount++;
      });

      if (deletedCustomerIds.size > 0 || deletedCustomerAccounts.size > 0) {
        const current = StorageService.getCustomers().filter(
          (c) =>
            !deletedCustomerIds.has(c.id) &&
            (!c.accountNumber || !deletedCustomerAccounts.has(String(c.accountNumber).trim().toLowerCase()))
        );
        localStorage.setItem('sb_customers', JSON.stringify(current));
      }
      if (deletedCollIds.size > 0) {
        const current = StorageService.getCollections().filter((c) => !deletedCollIds.has(c.id));
        localStorage.setItem('sb_collections', JSON.stringify(current));
      }
      if (deletedLoanIds.size > 0) {
        const current = StorageService.getLoans().filter((l) => !deletedLoanIds.has(l.id));
        localStorage.setItem('sb_loans', JSON.stringify(current));
      }
      if (deletedPayIds.size > 0) {
        const current = StorageService.getLoanPayments().filter((p) => !deletedPayIds.has(p.id));
        localStorage.setItem('sb_loan_payments', JSON.stringify(current));
      }
    }

    // Mark current sync timestamp
    const newTimestamp = cloudLastUpdated || new Date().toISOString();
    localStorage.setItem(LAST_SYNC_KEY, newTimestamp);
    invalidateStatsCache();

    return {
      updatedCount,
      deletedCount,
      readsCount,
      isUpToDate: updatedCount === 0 && deletedCount === 0,
      message:
        updatedCount > 0 || deletedCount > 0
          ? `${updatedCount} नवीन/बदललेल्या नोंदी आणि ${deletedCount} हटवलेल्या नोंदी अद्ययावत झाल्या (${readsCount} रीड्स)`
          : `सर्व डेटा अद्ययावत आहे (${readsCount} रीड)`,
    };
  } catch (err: any) {
    console.warn('[Sync] performIncrementalSync error:', err);
    return {
      updatedCount: 0,
      deletedCount: 0,
      readsCount: Math.max(1, readsCount),
      isUpToDate: false,
      message: `रिफ्रेश करताना त्रुटी: ${err?.message || 'अज्ञात त्रुटी'}`,
    };
  } finally {
    isSyncInProgress = false;
  }
};
