/**
 * ==============================================================================
 * STEP 5 — ONE-TIME MIGRATION SCRIPT (Node.js / Admin SDK)
 * ==============================================================================
 * Usage:
 *   node scripts/migrate-to-v2.js
 *
 * This script runs ONCE to:
 * 1. Set `nameLower` and `accountNo` on all existing customer documents in Firestore.
 * 2. Retroactively generate `installments/{installmentId}` schedule docs for all
 *    customers and loans, marking past ones paid/overdue based on existing collections.
 * 3. Calculate and write the initial `stats/summary` singleton document.
 * ==============================================================================
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin (uses GOOGLE_APPLICATION_CREDENTIALS or default app)
if (!admin.apps.length) {
  try {
    admin.initializeApp();
  } catch (e) {
    console.error('Could not initialize Firebase Admin. Please set GOOGLE_APPLICATION_CREDENTIALS or run with Firebase service account.');
    process.exit(1);
  }
}

const db = admin.firestore();

async function runMigration() {
  console.log('🚀 Starting v2 migration...');
  const todayStr = new Date().toISOString().split('T')[0];

  // 1. Fetch existing data
  console.log('📥 Reading existing collections from Firestore...');
  const [custSnap, collSnap, loanSnap, loanPaySnap] = await Promise.all([
    db.collection('customers').get(),
    db.collection('collections').get(),
    db.collection('loans').get(),
    db.collection('loanPayments').get(),
  ]);

  console.log(`Found:
  - ${custSnap.size} customers
  - ${collSnap.size} collections
  - ${loanSnap.size} loans
  - ${loanPaySnap.size} loan payments`);

  // Map collections by customerId + periodIndex
  const collectionsMap = new Map();
  let totalBishiCollected = 0;
  let todaysCollection = 0;
  let todaysPenalty = 0;

  collSnap.forEach((doc) => {
    const data = doc.data();
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
  console.log('✏️ Updating customer documents with nameLower and accountNo...');
  const custBatch = db.batch();
  custSnap.forEach((doc) => {
    const data = doc.data();
    const name = (data.name || data.customerName || '').trim();
    const acc = String(data.accountNumber || '').trim();

    custBatch.update(doc.ref, {
      nameLower: name.toLowerCase(),
      accountNo: acc,
      updatedAt: new Date().toISOString(),
    });
  });
  await custBatch.commit();
  console.log('✅ Customer documents updated.');

  // 3. Generate Installments for each customer
  console.log('📦 Generating installments collection docs...');
  const installmentsToCommit = [];
  let todaysDueAmount = 0;
  let todaysDueCount = 0;

  custSnap.forEach((doc) => {
    const cust = doc.data();
    const custId = cust.id || doc.id;
    const totalInstallments = cust.totalInstallments || (cust.modality === 'W' ? 40 : 10);
    const startDate = new Date(cust.bishiDate || Date.now());
    const amount = Number(cust.amount) || 0;

    for (let i = 1; i <= totalInstallments; i++) {
      const d = new Date(startDate);
      if (cust.modality === 'W') {
        d.setDate(d.getDate() + (i - 1) * 7);
      } else {
        d.setMonth(d.getMonth() + (i - 1));
      }
      const dueDate = d.toISOString().split('T')[0];
      const instKey = `${custId}_${i}`;
      const existingColl = collectionsMap.get(instKey);

      let status = 'pending';
      let paidAt = null;

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

  loanSnap.forEach((doc) => {
    const loan = doc.data();
    const principal = Number(loan.principalAmount) || 0;
    const remaining = Number(loan.remainingAmount) || 0;
    const loanId = loan.id || doc.id;

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

  // Commit installments in chunks of 400
  console.log(`Writing ${installmentsToCommit.length} installments to Firestore in batches...`);
  const CHUNK_SIZE = 400;
  for (let i = 0; i < installmentsToCommit.length; i += CHUNK_SIZE) {
    const chunk = installmentsToCommit.slice(i, i + CHUNK_SIZE);
    const batch = db.batch();
    for (const inst of chunk) {
      const ref = db.doc(`installments/${inst.id}`);
      batch.set(ref, inst, { merge: true });
    }
    await batch.commit();
    console.log(`  Committed batch ${Math.floor(i / CHUNK_SIZE) + 1} of ${Math.ceil(installmentsToCommit.length / CHUNK_SIZE)}`);
  }
  console.log('✅ Installments collection generated.');

  // 5. Write initial stats/summary singleton document
  console.log('📊 Writing stats/summary singleton document...');
  const statsSummary = {
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

  await db.doc('stats/summary').set(statsSummary, { merge: true });
  console.log('✅ stats/summary initialized with values:', statsSummary);

  console.log('\n🎉 Migration to v2 completed successfully!');
}

runMigration().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
