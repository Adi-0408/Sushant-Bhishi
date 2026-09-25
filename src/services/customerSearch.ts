import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Customer } from '../types';

/*
 * ===========================================================================
 * STEP 7 — FUTURE SCALE NOTE (FOR HIGH SCALE FUZZY SEARCH):
 * ===========================================================================
 * The prefix search queries implemented below use Firestore's native range filters:
 *   where("nameLower", ">=", term).where("nameLower", "<=", term + "\uf8ff").limit(20)
 * This guarantees strict O(limit) read costs (max 20 reads per search), completely
 * eliminating the expensive full collection scans.
 *
 * NOTE ON FUTURE SCALING:
 * Firestore prefix queries match from the START of the name string. If the customer
 * base scales significantly and users require fuzzy or mid-string/substring search
 * (e.g., searching "bhosale" matching "Vishwajit Bhosale" anywhere in the name),
 * evaluate integrating:
 *   1. Algolia (generous free tier: 10,000 search requests & records/month), OR
 *   2. Typesense / Meilisearch synced via a Firebase Cloud Function `onWrite` trigger on `customers/{id}`.
 *
 * Do NOT build third-party sync preemptively — only add it if the native prefix range
 * query proves insufficient in daily practice.
 * ===========================================================================
 */

/**
 * Searches customers by prefix matching on `nameLower`.
 * Strictly limited to `limitCount` results (default 20), ensuring read cost is
 * proportional ONLY to results returned, never to total customer count.
 */
export const searchCustomersByName = async (
  searchTerm: string,
  limitCount: number = 20
): Promise<Customer[]> => {
  const cleanTerm = searchTerm.trim().toLowerCase();
  if (!cleanTerm) return [];

  try {
    const q = query(
      collection(db, 'customers'),
      orderBy('nameLower'),
      where('nameLower', '>=', cleanTerm),
      where('nameLower', '<=', cleanTerm + '\uf8ff'),
      limit(limitCount)
    );

    const snap = await getDocs(q);
    const results: Customer[] = [];
    snap.forEach((d: any) => {
      const data = d.data();
      results.push({
        ...data,
        id: data.id || d.id,
      } as Customer);
    });

    return results;
  } catch (err) {
    console.warn('[CustomerSearch] Prefix search note:', err);
    // Fallback search from localStorage if offline
    try {
      const local = JSON.parse(localStorage.getItem('sb_customers') || '[]');
      return local
        .filter((c: Customer) => (c.nameLower || c.name.toLowerCase()).includes(cleanTerm))
        .slice(0, limitCount);
    } catch {
      return [];
    }
  }
};

/**
 * Searches customer by unique account number with limit(1).
 * Strictly costs at most 1 read!
 */
export const searchCustomerByAccountNumber = async (
  accountNumber: string
): Promise<Customer | null> => {
  const cleanAcc = accountNumber.trim();
  if (!cleanAcc) return null;

  try {
    const q = query(
      collection(db, 'customers'),
      where('accountNumber', '==', cleanAcc),
      limit(1)
    );

    const snap = await getDocs(q);
    if (!snap.empty) {
      const d = snap.docs[0];
      const data = d.data();
      return { ...data, id: data.id || d.id } as Customer;
    }
    return null;
  } catch (err) {
    console.warn('[CustomerSearch] searchCustomerByAccountNumber note:', err);
    try {
      const local = JSON.parse(localStorage.getItem('sb_customers') || '[]');
      return local.find((c: Customer) => c.accountNumber === cleanAcc) || null;
    } catch {
      return null;
    }
  }
};

/**
 * Duplicate check for account number.
 * Costs 0 or 1 read, never a full collection scan!
 */
export const checkAccountNumberExists = async (accountNumber: string): Promise<boolean> => {
  const cleanAcc = accountNumber.trim();
  if (!cleanAcc) return false;

  try {
    const q = query(
      collection(db, 'customers'),
      where('accountNumber', '==', cleanAcc),
      limit(1)
    );
    const snap = await getDocs(q);
    return !snap.empty;
  } catch (err) {
    console.warn('[CustomerSearch] checkAccountNumberExists check note:', err);
    try {
      const local = JSON.parse(localStorage.getItem('sb_customers') || '[]');
      return local.some((c: Customer) => c.accountNumber.trim().toLowerCase() === cleanAcc.toLowerCase());
    } catch {
      return false;
    }
  }
};

export interface PaginatedCustomersResult {
  customers: Customer[];
  lastDoc: any;
  hasMore: boolean;
}

/**
 * Cursor-paginated customer list query with limit(20) + startAfter().
 * Never fetches the full collection, keeping read costs strictly at 20 per page.
 */
export const fetchCustomersPaginated = async (
  pageSize: number = 20,
  lastDocSnapshot: any = null
): Promise<PaginatedCustomersResult> => {
  try {
    let q = query(
      collection(db, 'customers'),
      orderBy('nameLower'),
      limit(pageSize)
    );

    if (lastDocSnapshot) {
      q = query(
        collection(db, 'customers'),
        orderBy('nameLower'),
        startAfter(lastDocSnapshot),
        limit(pageSize)
      );
    }

    let snap = await getDocs(q);
    // If nameLower query returns empty (e.g. before migration has run on all customer docs), fallback to accountNumber
    if (snap.empty && !lastDocSnapshot) {
      const fallbackQ = query(
        collection(db, 'customers'),
        orderBy('accountNumber'),
        limit(pageSize)
      );
      snap = await getDocs(fallbackQ);
    }

    const customers: Customer[] = [];
    snap.forEach((d: any) => {
      const data = d.data();
      customers.push({ ...data, id: data.id || d.id } as Customer);
    });

    const newLastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
    const hasMore = snap.docs.length === pageSize;

    return { customers, lastDoc: newLastDoc, hasMore };
  } catch (err) {
    console.warn('[CustomerSearch] fetchCustomersPaginated note:', err);
    // Fallback to local storage
    try {
      const local = JSON.parse(localStorage.getItem('sb_customers') || '[]');
      return { customers: local.slice(0, pageSize), lastDoc: null, hasMore: false };
    } catch {
      return { customers: [], lastDoc: null, hasMore: false };
    }
  }
};
