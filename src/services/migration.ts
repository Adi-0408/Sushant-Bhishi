import {
  collection,
  doc,
  getDocs,
  writeBatch,
  setDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Customer, Installment, StatsSummary } from '../types';
import { invalidateStatsCache } from './stats';

/**
 * Runs the v2 schema migration directly from the browser / client:
 * 1. Populates `nameLower` and `accountNo` on every customer document.
 * 2. Retroactively generates `installments/{id}` schedule docs for customers & loans.
 * 3. Calculates and writes initial `stats/summary` singleton document.
 */
export const runClientV2Migration = async (
  onProgress?: (msg: string) => void
): Promise<{ success: boolean; stats: StatsSummary }> => {
  const log = (msg: string) => {
    console.log(`[Migration] ${msg}`);
    if (onProgress) onProgress(msg);
  };

  log('स्थलांतर (Migration) सुरू करत आहे...');
  const todayStr = new Date().toISOString().split('T')[0];

  // 1. Fetch current data
  log('विद्यमान डेटा वाचत आहे (Customers, Collections, Loans)...');
  const [custSnap, collSnap, loanSnap] = await Promise.all([
    getDocs(collection(db, 'customers')),
    getDocs(collection(db, 'collections')),
    getDocs(collection(db, 'loans')),
  ]);

  log(`डेटा सापडला: ${custSnap.size} ग्राहक, ${collSnap.size} हप्ते, ${loanSnap.size} कर्जे.`);

  // Map collections
  const collectionsMap = new Map<string, any>();
  let totalBishiCollected = 0;
  let todaysCollection = 0;
  let todaysPenalty = 0;

  collSnap.forEach((d: any) => {
    const data = d.data();
    const custId = data.customerId || '';
    const period = data.periodIndex ?? 1;
    const key = `${custId}_${period}`;
    collectionsMap.set(key, data);

    const collected = Number(data.collectedAmount) || 0;
    totalBishiCollected += collected;

    if (data.paymentDate === todayStr) {
      todaysCollection += collected;
      todaysPenalty += Number(data.penaltyAmount) || 0;
    }
  });

  // 2. Update Customers: add nameLower and accountNo
  log('ग्राहकांच्या नोंदींमध्ये nameLower व accountNo जोडत आहे...');
  const CHUNK_SIZE = 400;
  const customersDocs = custSnap.docs;

  for (let i = 0; i < customersDocs.length; i += CHUNK_SIZE) {
    const chunk = customersDocs.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);

    for (const d of chunk) {
      const data = d.data() as Partial<Customer>;
      const name = (data.name || data.customerName || '').trim();
      const acc = String(data.accountNumber || '').trim();

      batch.update(d.ref, {
        nameLower: name.toLowerCase(),
        accountNo: acc,
        updatedAt: new Date().toISOString(),
      });
    }

    await batch.commit();
  }

  // 3. Generate Installments for each customer
  log('हप्त्यांचे वेळापत्रक (Installments Schedule) तयार करत आहे...');
  const installmentsToCommit: Installment[] = [];
  let todaysDueAmount = 0;
  let todaysDueCount = 0;

  custSnap.forEach((d: any) => {
    const cust = d.data() as Customer;
    const custId = cust.id || d.id;
    const totalInstallments = cust.totalInstallments || (cust.modality === 'W' ? 40 : 10);
    const startDate = new Date(cust.bishiDate || Date.now());
    const amount = Number(cust.amount) || 0;

    for (let i = 1; i <= totalInstallments; i++) {
      const dateObj = new Date(startDate);
      if (cust.modality === 'W') {
        dateObj.setDate(dateObj.getDate() + (i - 1) * 7);
      } else {
        dateObj.setMonth(dateObj.getMonth() + (i - 1));
      }
      const dueDate = dateObj.toISOString().split('T')[0];
      const instKey = `${custId}_${i}`;
      const existingColl = collectionsMap.get(instKey);

      let status: 'pending' | 'paid' | 'overdue' = 'pending';
      let paidAt: string | null = null;

      if (existingColl && (existingColl.status === 'PAID' || Number(existingColl.collectedAmount) >= amount)) {
        status = 'paid';
        paidAt = existingColl.paymentDate || dueDate;
      } else if (dueDate < todayStr) {
        status = 'overdue';
      }

      if (status === 'pending' && dueDate === todayStr) {
        todaysDueAmount += amount;
        todaysDueCount += 1;
      }

      const installmentId = `inst_bishi_${custId}_${i}`;
      installmentsToCommit.push({
        id: installmentId,
        customerId: custId,
        customerName: cust.name || '',
        accountNumber: cust.accountNumber || '',
        accountNo: cust.accountNumber || '',
        type: 'bishi',
        sourceId: cust.bishiType || 'BISHI',
        dueDate,
        amount,
        status,
        paidAt,
        periodIndex: i,
        periodLabel: cust.modality === 'W' ? `हप्ता ${i}` : `महिना ${i}`,
        officeId: cust.officeId || 'MAIN',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  });

  // 4. Generate Installments for Loans
  let totalPrincipalLoans = 0;
  let loanBalanceDue = 0;

  loanSnap.forEach((d: any) => {
    const loan = d.data();
    const principal = Number(loan.principalAmount) || 0;
    const remaining = Number(loan.remainingAmount) || 0;
    const loanId = loan.id || d.id;

    if (loan.status === 'ACTIVE') {
      totalPrincipalLoans += principal;
      loanBalanceDue += remaining;
    }

    const isPaid = loan.status === 'COMPLETED' || loan.status === 'CLOSED' || remaining <= 0;
    const installmentId = `inst_loan_${loanId}_1`;

    installmentsToCommit.push({
      id: installmentId,
      customerId: loan.customerId || '',
      customerName: loan.customerName || '',
      accountNumber: loan.accountNumber || '',
      accountNo: loan.accountNumber || '',
      type: 'loan',
      sourceId: loanId,
      dueDate: loan.issueDate || todayStr,
      amount: principal,
      status: isPaid ? 'paid' : (loan.issueDate < todayStr ? 'overdue' : 'pending'),
      paidAt: isPaid ? new Date().toISOString() : null,
      periodIndex: 1,
      periodLabel: 'कर्ज हप्ता',
      officeId: loan.officeId || 'MAIN',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  // Commit installments in chunks
  log(`एकूण ${installmentsToCommit.length} हप्ते क्लाउडवर सेव्ह करत आहे...`);
  for (let i = 0; i < installmentsToCommit.length; i += CHUNK_SIZE) {
    const chunk = installmentsToCommit.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const inst of chunk) {
      const ref = doc(db, 'installments', inst.id);
      batch.set(ref, inst, { merge: true });
    }
    await batch.commit();
  }

  // 5. Write stats/summary singleton document
  log('stats/summary दस्तऐवज तयार करत आहे...');
  const statsSummary: StatsSummary = {
    totalCustomers: custSnap.size,
    todaysCollection,
    totalBishiCollected,
    totalPrincipalLoans,
    loanBalanceDue,
    todaysPenalty,
    todaysDueAmount,
    todaysDueInstallments: todaysDueCount,
    lastUpdated: new Date().toISOString(),
  };

  await setDoc(doc(db, 'stats', 'summary'), statsSummary, { merge: true });
  invalidateStatsCache();

  log('✅ v2 स्थलांतर यशस्वीरीत्या पूर्ण झाले!');
  return { success: true, stats: statsSummary };
};
