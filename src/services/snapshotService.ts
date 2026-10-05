import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { StorageService } from './db';
import { SystemBackupData } from '../types';

const SNAPSHOT_COLLECTION = 'system_snapshots';
const MANIFEST_DOC_ID = 'manifest';
const CHUNK_SIZE = 700 * 1024; // 700 KB per chunk (safe limit for 1MB Firestore doc)

/**
 * Compresses a string using native browser/Node CompressionStream (gzip)
 * and returns a standard base64 string.
 */
export async function compressStringToBase64(str: string): Promise<string> {
  const blob = new Blob([str]);
  const stream = blob.stream().pipeThrough(new CompressionStream('gzip'));
  const buffer = await new Response(stream).arrayBuffer();
  
  // Safe ArrayBuffer to base64 conversion in browser & Node
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Decompresses a base64 gzip string back into the original object.
 */
export async function decompressBase64ToObject<T = any>(base64: string): Promise<T> {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  const stream = new Blob([bytes.buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  const text = await new Response(stream).text();
  return JSON.parse(text) as T;
}

/**
 * Strategy 2: Bundles the entire system database into a highly compressed,
 * single-read Firestore snapshot document so cloud backups take only 1 Read!
 */
export async function publishBackupSnapshotToFirestore(providedData?: SystemBackupData): Promise<void> {
  try {
    const data = providedData || StorageService.exportBackup();
    const hasData = (data.customers && data.customers.length > 0) || (data.collections && data.collections.length > 0);
    if (!hasData) return;

    const jsonString = JSON.stringify(data);
    const base64 = await compressStringToBase64(jsonString);
    const totalChunks = Math.ceil(base64.length / CHUNK_SIZE);
    const nowIso = new Date().toISOString();

    const recordCounts = {
      customers: data.customers?.length || 0,
      collections: data.collections?.length || 0,
      loans: data.loans?.length || 0,
      loanPayments: data.loanPayments?.length || 0,
      thakbaki: data.thakbaki?.length || 0,
      bishiConfigs: data.bishiConfigs?.length || 0,
    };

    if (totalChunks <= 1) {
      // Fits in 1 single document = Exactly 1 Read for the 11 PM backup!
      const manifestRef = doc(db, SNAPSHOT_COLLECTION, MANIFEST_DOC_ID);
      await setDoc(manifestRef, {
        version: '1.0.0',
        updatedAt: nowIso,
        totalChunks: 1,
        payload: base64,
        compressedChars: base64.length,
        rawKb: Math.round((jsonString.length * 2) / 1024),
        recordCounts,
      });
    } else {
      // Chunked across multiple docs if payload is large
      const manifestRef = doc(db, SNAPSHOT_COLLECTION, MANIFEST_DOC_ID);
      const firstChunk = base64.substring(0, CHUNK_SIZE);
      await setDoc(manifestRef, {
        version: '1.0.0',
        updatedAt: nowIso,
        totalChunks,
        payload: firstChunk,
        compressedChars: base64.length,
        rawKb: Math.round((jsonString.length * 2) / 1024),
        recordCounts,
      });

      for (let i = 1; i < totalChunks; i++) {
        const chunkPart = base64.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const chunkRef = doc(db, SNAPSHOT_COLLECTION, `chunk_${i}`);
        await setDoc(chunkRef, {
          index: i,
          payload: chunkPart,
          updatedAt: nowIso,
        });
      }
    }
  } catch (err: any) {
    console.warn('[SnapshotService] publishBackupSnapshot error:', err?.message || err);
  }
}

// Debounce timer so continuous typing or multiple rapid updates only publish once
let debounceTimer: any = null;

export function queueSnapshotPublishDebounced(delayMs: number = 60000): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    publishBackupSnapshotToFirestore().catch((err) => {
      console.warn('[SnapshotService] Debounced publish note:', err);
    });
  }, delayMs);
}

/**
 * Strategy 2 / Fix 1: Fetches the pre-packaged compressed database snapshot
 * from Firestore so that new device setup or clear-cache recovery takes
 * ONLY 1 READ instead of 40,000 reads!
 */
export async function fetchBackupSnapshotFromFirestore(): Promise<SystemBackupData | null> {
  try {
    const manifestRef = doc(db, SNAPSHOT_COLLECTION, MANIFEST_DOC_ID);
    const manifestSnap = await getDoc(manifestRef);
    if (!manifestSnap.exists()) return null;

    const manifest = manifestSnap.data();
    let base64 = manifest.payload || '';

    if (manifest.totalChunks > 1) {
      for (let i = 1; i < manifest.totalChunks; i++) {
        const chunkRef = doc(db, SNAPSHOT_COLLECTION, `chunk_${i}`);
        const chunkSnap = await getDoc(chunkRef);
        if (chunkSnap.exists()) {
          base64 += chunkSnap.data().payload || '';
        }
      }
    }

    if (!base64) return null;

    const data = await decompressBase64ToObject<SystemBackupData>(base64);
    if (data && (data.customers || data.collections)) {
      return data;
    }
    return null;
  } catch (err: any) {
    console.warn('[SnapshotService] fetchBackupSnapshot error:', err?.message || err);
    return null;
  }
}

