import {
  collection,
  doc,
  getDocs,
  query,
  where,
  limit,
  writeBatch,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Customer, Installment, Loan, Modality } from '../types';

/**
 * Generates the full bishi installment schedule for a new customer upfront.
 * This ensures that "Today's Due" and "Due Installments" queries only hit a real schedule
 * instead of having to loop over all customers client-side.
 */
export const generateBishiInstallmentSchedule = (
  customer: Customer,
  bishiDate: string,
  totalInstallments: number,
  modality: Modality
): Installment[] => {
  const installments: Installment[] = [];
  const startDate = new Date(bishiDate || Date.now());
  const amount = Number(customer.amount) || 0;

  for (let i = 1; i <= totalInstallments; i++) {
    const d = new Date(startDate);
    if (modality === 'W') {
      d.setDate(d.getDate() + (i - 1) * 7);
    } else {
      d.setMonth(d.getMonth() + (i - 1));
    }

    const dueDate = d.toISOString().split('T')[0];
    const installmentId = `inst_bishi_${customer.id}_${i}`;

    installments.push({
      id: installmentId,
      customerId: customer.id,
      customerName: customer.name,
      accountNumber: customer.accountNumber,
      accountNo: customer.accountNumber,
      type: 'bishi',
      sourceId: customer.bishiType || 'BISHI',
      dueDate,
      amount,
      status: 'pending',
      paidAt: null,
      periodIndex: i,
      periodLabel: modality === 'W' ? `हप्ता ${i}` : `महिना ${i}`,
      officeId: customer.officeId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  return installments;
};

/**
 * Generates an installment schedule for a loan upfront.
 */
export const generateLoanInstallmentSchedule = (loan: Loan): Installment[] => {
  const installments: Installment[] = [];
  const installmentId = `inst_loan_${loan.id}_1`;

  installments.push({
    id: installmentId,
    customerId: loan.customerId,
    customerName: loan.customerName || '',
    accountNumber: loan.accountNumber || '',
    accountNo: loan.accountNumber || '',
    type: 'loan',
    sourceId: loan.id,
    dueDate: loan.issueDate || new Date().toISOString().split('T')[0],
    amount: loan.principalAmount || 0,
    status: loan.status === 'COMPLETED' || loan.status === 'CLOSED' ? 'paid' : 'pending',
    paidAt: loan.status === 'COMPLETED' || loan.status === 'CLOSED' ? new Date().toISOString() : null,
    periodIndex: 1,
    periodLabel: 'कर्ज हप्ता',
    officeId: loan.officeId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return installments;
};

/**
 * Saves a schedule of installments into Firestore using atomic writeBatch.
 * (One-time write cost per enrollment/loan).
 */
export const saveInstallmentsBatchToFirestore = async (installments: Installment[]): Promise<void> => {
  if (!installments || installments.length === 0) return;

  const CHUNK_SIZE = 400;
  for (let i = 0; i < installments.length; i += CHUNK_SIZE) {
    const chunk = installments.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);

    for (const inst of chunk) {
      const ref = doc(db, 'installments', inst.id);
      batch.set(ref, inst, { merge: true });
    }

    await batch.commit();
  }
};

/**
 * Marks a matching installment as "paid" when a payment is recorded.
 */
export const markInstallmentAsPaid = async (
  customerId: string,
  periodIndex: number,
  type: 'bishi' | 'loan' = 'bishi',
  paidAtIso: string = new Date().toISOString()
): Promise<void> => {
  try {
    const installmentId = type === 'bishi'
      ? `inst_bishi_${customerId}_${periodIndex}`
      : `inst_loan_${customerId}_${periodIndex}`;

    const ref = doc(db, 'installments', installmentId);
    await updateDoc(ref, {
      status: 'paid',
      paidAt: paidAtIso,
      updatedAt: new Date().toISOString(),
    }).catch(() => {
      // If doc doesn't exist by constructed ID, skip quietly
    });
  } catch (err) {
    console.warn('[Installments] Note updating installment status:', err);
  }
};

/**
 * Queries installments due today that are pending.
 * Limited to avoid unbounded reads.
 */
export const fetchTodayPendingInstallments = async (
  todayStr: string = new Date().toISOString().split('T')[0],
  limitCount: number = 20
): Promise<Installment[]> => {
  try {
    const q = query(
      collection(db, 'installments'),
      where('dueDate', '==', todayStr),
      where('status', '==', 'pending'),
      limit(limitCount)
    );
    const snap = await getDocs(q);
    const results: Installment[] = [];
    snap.forEach((d: any) => results.push({ ...(d.data() as Installment), id: d.id }));
    return results;
  } catch (err) {
    console.warn('[Installments] fetchTodayPendingInstallments note:', err);
    return [];
  }
};
