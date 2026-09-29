/**
 * ==============================================================================
 * 100% CLOUD AUTOMATIC DAILY 11:00 PM BACKUP SCRIPT
 * ==============================================================================
 * Runs autonomously in GitHub Actions cloud servers every night at 11:00 PM IST.
 * 
 * Functions:
 * 1. Pulls all current records directly from Cloud Firestore (Customers, Loans,
 *    Collections, Thak Baki, Installments, Settings).
 * 2. Compiles complete Sushant Bhishi SystemBackupData JSON.
 * 3. Uploads the backup file to Google Drive folder "Sushant_Bishi_Backups"
 *    via Google Apps Script Webhook.
 * 4. Updates Firestore stats/summary with the 11 PM completion slot so all
 *    user devices (Mobile, Laptop) show "Completed" in real time.
 * ==============================================================================
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc } from 'firebase/firestore';

const DEFAULT_WEBHOOK_URL =
  'https://script.google.com/macros/s/AKfycbzzOpsGVm-NuTwdQapw0OcOx9O64mALEAEzX3z1_wZ_rb12zmtDd98-IO97wE2PMSCK/exec';

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyBC_jK6bHPVfot1MzTvsFS4csOErHeu5cQ",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "sushant-bhishi.firebaseapp.com",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "sushant-bhishi",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "sushant-bhishi.firebasestorage.app",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "689252489431",
  appId: process.env.VITE_FIREBASE_APP_ID || "1:689252489431:web:06c739a821b98d8ee6f892",
};

async function fetchCollection(db, collectionName) {
  try {
    const snap = await getDocs(collection(db, collectionName));
    const items = [];
    snap.forEach((d) => {
      const data = d.data();
      items.push({ id: d.id, ...data });
    });
    return items;
  } catch (err) {
    console.warn(`[Backup] Warning fetching collection "${collectionName}":`, err.message);
    return [];
  }
}

async function runCloudBackup() {
  const startTime = Date.now();
  console.log('====================================================');
  console.log('🚀 Sushant Bhishi - Automated Cloud 11 PM Backup');
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
  console.log('====================================================');

  // 1. Initialize Firebase
  console.log('📡 Connecting to Cloud Firestore...');
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  // 2. Fetch all collections in parallel
  console.log('📥 Pulling database collections...');
  const [
    customers,
    collections,
    loans,
    loanPayments,
    thakbaki,
    bishiConfigs,
    interestRates,
    penaltySettings,
    admins,
    smsLogs,
  ] = await Promise.all([
    fetchCollection(db, 'customers'),
    fetchCollection(db, 'collections'),
    fetchCollection(db, 'loans'),
    fetchCollection(db, 'loanPayments'),
    fetchCollection(db, 'thakbaki'),
    fetchCollection(db, 'bishi'),
    fetchCollection(db, 'interestRates'),
    fetchCollection(db, 'penaltySettings'),
    fetchCollection(db, 'admins'),
    fetchCollection(db, 'smsLogs'),
  ]);

  console.log(`📊 Retrieved Data Summary:`);
  console.log(`   - Customers:     ${customers.length}`);
  console.log(`   - Collections:   ${collections.length}`);
  console.log(`   - Loans:         ${loans.length}`);
  console.log(`   - Loan Payments: ${loanPayments.length}`);
  console.log(`   - Thak Baki:     ${thakbaki.length}`);
  console.log(`   - Bishi Configs: ${bishiConfigs.length}`);
  console.log(`   - Admins:        ${admins.length}`);

  // 3. Compile SystemBackupData
  const now = new Date();
  const isoNow = now.toISOString();

  // Determine current IST date (YYYY-MM-DD)
  const istFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const dateStr = istFormatter.format(now);
  const filename = `Sushant_Bishi_AutoBackup_11PM_${dateStr}_2300.json`;

  const backupData = {
    version: '1.0.0',
    exportedAt: isoNow,
    admins,
    customers,
    bishiConfigs,
    collections,
    loans,
    loanPayments,
    interestRates,
    penaltySettings,
    smsLogs,
    thakbaki,
  };

  const jsonString = JSON.stringify(backupData);
  const sizeKb = Math.round((jsonString.length * 2) / 1024);
  console.log(`💾 Backup file prepared: ${filename} (~${sizeKb} KB)`);

  // 4. Upload to Google Drive via Apps Script Webhook
  const webhookUrl = (process.env.DRIVE_WEBHOOK_URL || DEFAULT_WEBHOOK_URL).trim();
  console.log(`☁️ Uploading to Google Drive webhook...`);

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify({
      filename,
      data: backupData,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google Drive webhook failed with HTTP status ${response.status}`);
  }

  const result = await response.json();
  if (!result.success && result.status !== 'success') {
    throw new Error(result.message || 'Google Drive Webhook returned unsuccessful status.');
  }

  console.log(`✅ Google Drive Upload Succeeded!`);
  console.log(`   - Drive Filename: ${result.fileName || filename}`);
  if (result.fileId) console.log(`   - Drive File ID:  ${result.fileId}`);

  // 5. Update Firestore stats/summary so all devices immediately show completed status
  console.log(`🔄 Updating Firestore stats/summary with 11 PM completion slot...`);
  const statsRef = doc(db, 'stats', 'summary');
  const nowTimestamp = Date.now();

  const updatePayload = {
    lastDaily11pmDate: dateStr,
    lastDaily11pmTimestamp: nowTimestamp,
    lastDaily11pmFilename: filename,
    lastDriveBackupTimestamp: nowTimestamp,
    lastDriveBackupDate: isoNow,
    lastDriveBackupFilename: filename,
    lastDriveBackupStatus: 'success',
    lastBackupTimestamp: nowTimestamp,
    lastBackupDate: isoNow,
    lastBackupFilename: filename,
    lastBackupCustomerCount: customers.length,
    lastBackupCollectionCount: collections.length,
    lastBackupLoanCount: loans.length,
    lastBackupSizeKb: sizeKb,
    lastUpdated: isoNow,
  };

  await setDoc(statsRef, updatePayload, { merge: true });
  console.log(`✅ stats/summary updated with lastDaily11pmDate: ${dateStr}`);

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('====================================================');
  console.log(`🎉 Automated Cloud Backup finished successfully in ${durationSec}s!`);
  console.log('====================================================');
  process.exit(0);
}

runCloudBackup().catch((err) => {
  console.error('❌ Cloud Backup Error:', err);
  process.exit(1);
});
