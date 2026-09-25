import * as admin from 'firebase-admin';
import { onDocumentCreated, onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const STATS_REF = db.doc('stats/summary');

/**
 * 1. onCustomerCreated (customers/{id} onCreate)
 * Increment stats/summary.totalCustomers by 1 atomically using FieldValue.increment()
 */
export const onCustomerCreated = onDocumentCreated('customers/{customerId}', async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;

  await STATS_REF.set(
    {
      totalCustomers: admin.firestore.FieldValue.increment(1),
      lastUpdated: new Date().toISOString(),
    },
    { merge: true }
  );
});

/**
 * 1b. onCustomerDeleted (customers/{id} onDelete)
 * Decrement stats/summary.totalCustomers by 1 atomically
 */
export const onCustomerDeleted = onDocumentDeleted('customers/{customerId}', async (event) => {
  await STATS_REF.set(
    {
      totalCustomers: admin.firestore.FieldValue.increment(-1),
      lastUpdated: new Date().toISOString(),
    },
    { merge: true }
  );
});

/**
 * 2. onCollectionCreated (collections/{id} onCreate — a bishi payment)
 * → stats/summary.todaysCollection += amount
 * → stats/summary.totalBishiCollected += amount
 * → mark matching installments/{id}.status = "paid", paidAt = now
 */
export const onCollectionCreated = onDocumentCreated('collections/{collectionId}', async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;

  const data = snapshot.data();
  const amount = Number(data.collectedAmount) || 0;
  const customerId = data.customerId || '';
  const periodIndex = data.periodIndex ?? 1;

  // Atomically increment stats
  if (amount > 0) {
    await STATS_REF.set(
      {
        todaysCollection: admin.firestore.FieldValue.increment(amount),
        totalBishiCollected: admin.firestore.FieldValue.increment(amount),
        lastUpdated: new Date().toISOString(),
      },
      { merge: true }
    );
  }

  // Update matching installment status to "paid"
  if (customerId && periodIndex) {
    const installmentId = `inst_bishi_${customerId}_${periodIndex}`;
    const instRef = db.doc(`installments/${installmentId}`);
    try {
      await instRef.set(
        {
          status: 'paid',
          paidAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (e) {
      console.warn('Installment status update note:', e);
    }
  }
});

/**
 * 3. onLoanCreated (loans/{id} onCreate)
 * → stats/summary.totalPrincipalLoans += principal
 * → stats/summary.loanBalanceDue += principal
 * → generate the full installments schedule for this loan
 */
export const onLoanCreated = onDocumentCreated('loans/{loanId}', async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;

  const data = snapshot.data();
  const principal = Number(data.principalAmount) || 0;
  const loanId = event.params.loanId;
  const customerId = data.customerId || '';
  const customerName = data.customerName || '';
  const accountNumber = data.accountNumber || '';
  const issueDate = data.issueDate || new Date().toISOString().split('T')[0];

  // Atomically update stats
  await STATS_REF.set(
    {
      totalPrincipalLoans: admin.firestore.FieldValue.increment(principal),
      loanBalanceDue: admin.firestore.FieldValue.increment(principal),
      lastUpdated: new Date().toISOString(),
    },
    { merge: true }
  );

  // Generate loan installment record upfront
  const installmentId = `inst_loan_${loanId}_1`;
  const instRef = db.doc(`installments/${installmentId}`);
  await instRef.set(
    {
      id: installmentId,
      customerId,
      customerName,
      accountNumber,
      accountNo: accountNumber,
      type: 'loan',
      sourceId: loanId,
      dueDate: issueDate,
      amount: principal,
      status: data.status === 'COMPLETED' ? 'paid' : 'pending',
      paidAt: data.status === 'COMPLETED' ? admin.firestore.FieldValue.serverTimestamp() : null,
      periodIndex: 1,
      periodLabel: 'कर्ज हप्ता',
      officeId: data.officeId || 'MAIN',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
});

/**
 * 4. onLoanPaymentCreated (loanPayments/{id} onCreate)
 * → stats/summary.loanBalanceDue -= paymentAmount
 * → mark matching installments/{id}.status = "paid"
 * → if a penalty/late-fee field exists, stats/summary.todaysPenalty += it
 */
export const onLoanPaymentCreated = onDocumentCreated('loanPayments/{paymentId}', async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;

  const data = snapshot.data();
  const paymentAmount = Number(data.paidAmount) || 0;
  const penalty = Number(data.penaltyPaid) || 0;
  const loanId = data.loanId;

  const updates: Record<string, any> = {
    lastUpdated: new Date().toISOString(),
  };

  if (paymentAmount > 0) {
    updates.loanBalanceDue = admin.firestore.FieldValue.increment(-paymentAmount);
  }
  if (penalty > 0) {
    updates.todaysPenalty = admin.firestore.FieldValue.increment(penalty);
  }

  await STATS_REF.set(updates, { merge: true });

  // Mark loan installment paid if fully settled
  if (loanId) {
    const instRef = db.doc(`installments/inst_loan_${loanId}_1`);
    try {
      await instRef.set(
        {
          status: 'paid',
          paidAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (e) {
      console.warn('Loan installment update note:', e);
    }
  }
});

/**
 * 5. refreshTodaysDue (scheduled, every 30 min)
 * → query installments where dueDate == today && status == "pending"
 * → compute sum(amount) and count
 * → write into stats/summary.todaysDueAmount / .todaysDueInstallments
 */
export const refreshTodaysDue = onSchedule('every 30 minutes', async () => {
  const todayStr = new Date().toISOString().split('T')[0];

  const snap = await db
    .collection('installments')
    .where('dueDate', '==', todayStr)
    .where('status', '==', 'pending')
    .get();

  let totalDue = 0;
  let count = 0;

  snap.forEach((docSnap) => {
    const data = docSnap.data();
    totalDue += Number(data.amount) || 0;
    count += 1;
  });

  await STATS_REF.set(
    {
      todaysDueAmount: totalDue,
      todaysDueInstallments: count,
      lastUpdated: new Date().toISOString(),
    },
    { merge: true }
  );

  console.log(`[refreshTodaysDue] today: ${todayStr}, due: ₹${totalDue}, count: ${count}`);
});

/**
 * 6. markOverdueInstallments (scheduled, once daily, early morning at 4 AM)
 * → batch-update installments where status == "pending" && dueDate < today to status "overdue"
 */
export const markOverdueInstallments = onSchedule('0 4 * * *', async () => {
  const todayStr = new Date().toISOString().split('T')[0];

  const snap = await db
    .collection('installments')
    .where('status', '==', 'pending')
    .where('dueDate', '<', todayStr)
    .limit(500)
    .get();

  if (snap.empty) {
    console.log('[markOverdueInstallments] No overdue installments to update.');
    return;
  }

  const batch = db.batch();
  snap.forEach((docSnap) => {
    batch.update(docSnap.ref, {
      status: 'overdue',
      updatedAt: new Date().toISOString(),
    });
  });

  await batch.commit();
  console.log(`[markOverdueInstallments] Marked ${snap.size} installments as overdue.`);
});

/**
 * 7. resetDailyStats (scheduled, midnight 00:00)
 * → stats/summary.todaysCollection = 0, todaysPenalty = 0
 */
export const resetDailyStats = onSchedule('0 0 * * *', async () => {
  await STATS_REF.set(
    {
      todaysCollection: 0,
      todaysPenalty: 0,
      lastUpdated: new Date().toISOString(),
    },
    { merge: true }
  );
  console.log('[resetDailyStats] Daily stats reset to zero for new day.');
});
