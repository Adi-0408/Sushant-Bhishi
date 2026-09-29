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
import { getFirestore, collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';

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

  let backupData = null;
  let customersCount = 0;
  let collectionsCount = 0;
  let loansCount = 0;

  // ── Strategy 2: Pre-Packaged Snapshot Document (1 Single Read!) ─────────────
  console.log('🔍 Checking for Strategy 2 pre-packaged snapshot...');
  try {
    const manifestRef = doc(db, 'system_snapshots', 'manifest');
    const manifestSnap = await getDoc(manifestRef);

    if (manifestSnap.exists()) {
      const manifest = manifestSnap.data();
      let base64 = manifest.payload || '';

      if (manifest.totalChunks > 1) {
        console.log(`📦 Pre-packaged snapshot has ${manifest.totalChunks} chunks. Fetching remaining chunks...`);
        for (let i = 1; i < manifest.totalChunks; i++) {
          const chunkRef = doc(db, 'system_snapshots', `chunk_${i}`);
          const chunkSnap = await getDoc(chunkRef);
          if (chunkSnap.exists()) {
            base64 += chunkSnap.data().payload || '';
          }
        }
      }

      if (base64) {
        const buffer = Buffer.from(base64, 'base64');
        const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
        const text = await new Response(stream).text();
        const parsed = JSON.parse(text);

        if (parsed && (parsed.customers || parsed.collections)) {
          backupData = parsed;
          customersCount = backupData.customers?.length || 0;
          collectionsCount = backupData.collections?.length || 0;
          loansCount = backupData.loans?.length || 0;
          console.log(`⚡ [Strategy 2 Active] Loaded complete database snapshot in ${manifest.totalChunks || 1} Read(s)!`);
          console.log(`   - Snapshot Timestamp: ${manifest.updatedAt || 'Recent'}`);
          console.log(`   - Reads used: ${manifest.totalChunks || 1} (Saved ~${collectionsCount + customersCount} reads!)`);
        }
      }
    }
  } catch (err) {
    console.warn('⚠️ Note on pre-packaged snapshot:', err.message);
  }

  // ── Fallback: If snapshot was not found, query collections directly ──────────
  if (!backupData) {
    console.log('📥 Pre-packaged snapshot not found. Running full collection query fallback...');
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

    backupData = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
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

    customersCount = customers.length;
    collectionsCount = collections.length;
    loansCount = loans.length;

    // Save this freshly queried data into system_snapshots/manifest so subsequent runs use 1 Read!
    try {
      console.log('💾 Publishing pre-packaged snapshot to Firestore for future 1-read backups...');
      const jsonStr = JSON.stringify(backupData);
      const cStream = new Blob([jsonStr]).stream().pipeThrough(new CompressionStream('gzip'));
      const cBuffer = await new Response(cStream).arrayBuffer();
      const b64 = Buffer.from(cBuffer).toString('base64');
      const CHUNK_SIZE = 700 * 1024;
      const totalChunks = Math.ceil(b64.length / CHUNK_SIZE);
      const nowIso = new Date().toISOString();

      if (totalChunks <= 1) {
        await setDoc(doc(db, 'system_snapshots', 'manifest'), {
          version: '1.0.0',
          updatedAt: nowIso,
          totalChunks: 1,
          payload: b64,
          compressedChars: b64.length,
          rawKb: Math.round((jsonStr.length * 2) / 1024),
          recordCounts: {
            customers: customers.length,
            collections: collections.length,
            loans: loans.length,
            thakbaki: thakbaki.length,
          },
        });
      } else {
        await setDoc(doc(db, 'system_snapshots', 'manifest'), {
          version: '1.0.0',
          updatedAt: nowIso,
          totalChunks,
          payload: b64.substring(0, CHUNK_SIZE),
          compressedChars: b64.length,
          rawKb: Math.round((jsonStr.length * 2) / 1024),
          recordCounts: {
            customers: customers.length,
            collections: collections.length,
            loans: loans.length,
            thakbaki: thakbaki.length,
          },
        });
        for (let i = 1; i < totalChunks; i++) {
          await setDoc(doc(db, 'system_snapshots', `chunk_${i}`), {
            index: i,
            payload: b64.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
            updatedAt: nowIso,
          });
        }
      }
      console.log('✅ Pre-packaged snapshot saved in Firestore!');
    } catch (saveErr) {
      console.warn('⚠️ Could not cache snapshot in Firestore:', saveErr.message);
    }
  }

  console.log(`📊 Retrieved Data Summary:`);
  console.log(`   - Customers:     ${customersCount}`);
  console.log(`   - Collections:   ${collectionsCount}`);
  console.log(`   - Loans:         ${loansCount}`);
  console.log(`   - Thak Baki:     ${backupData.thakbaki?.length || 0}`);
  console.log(`   - Bishi Configs: ${backupData.bishiConfigs?.length || 0}`);
  console.log(`   - Admins:        ${backupData.admins?.length || 0}`);

  // 3. Compile SystemBackupData
  const now = new Date();
  const isoNow = now.toISOString();
  backupData.exportedAt = isoNow;

  // Determine current IST date (YYYY-MM-DD)
  const istFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const dateStr = istFormatter.format(now);
  const filename = `Sushant_Bishi_AutoBackup_11PM_${dateStr}_2300.json`;

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
    lastBackupCustomerCount: customersCount,
    lastBackupCollectionCount: collectionsCount,
    lastBackupLoanCount: loansCount,
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
