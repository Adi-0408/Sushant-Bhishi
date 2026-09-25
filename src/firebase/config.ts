import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAnalytics, isSupported } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBC_jK6bHPVfot1MzTvsFS4csOErHeu5cQ",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "sushant-bhishi.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "sushant-bhishi",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "sushant-bhishi.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "689252489431",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:689252489431:web:06c739a821b98d8ee6f892",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-CM0EQ47RF1"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);

// Initialize Firestore with persistent IndexedDB multi-tab cache to eliminate repeated cloud reads
let firestoreDb: any;
try {
  firestoreDb = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
} catch {
  firestoreDb = getFirestore(app);
}

export const db = firestoreDb;
export const storage = getStorage(app);

// Attempt anonymous sign-in if available so Firestore security rules succeed
if (typeof window !== 'undefined') {
  try {
    onAuthStateChanged(auth, (user: any) => {
      if (!user) {
        signInAnonymously(auth).catch((err: any) => {
          console.info('Firebase auth note:', err?.message || err);
        });
      }
    });
  } catch (e) {
    // Ignore if offline
  }
}

export let analytics: any = null;
if (typeof window !== 'undefined') {
  isSupported().then((supported: boolean) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  }).catch(() => {});
}

export default app;
