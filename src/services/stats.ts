import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { StatsSummary } from '../types';

const STATS_CACHE_KEY = 'sb_stats_summary_cache';
const STATS_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes freshness window

export const DEFAULT_STATS: StatsSummary = {
  totalCustomers: 0,
  todaysCollection: 0,
  totalBishiCollected: 0,
  totalPrincipalLoans: 0,
  loanBalanceDue: 0,
  todaysPenalty: 0,
  todaysDueAmount: 0,
  todaysDueInstallments: 0,
  lastUpdated: new Date().toISOString(),
};

/**
 * Fetches the stats/summary singleton document from Firestore.
 * Implements a strict client-side TTL cache (~2 minutes) in sessionStorage
 * to ensure that repeated dashboard loads or navigations across 4 simultaneous
 * devices cost exactly 0 additional reads within the window.
 *
 * Cost:
 * - Within TTL: 0 reads
 * - On cache miss / forced refresh: exactly 1 getDoc() read
 */
export const getStatsSummary = async (forceRefresh: boolean = false): Promise<StatsSummary> => {
  // 1. Check client-side sessionStorage TTL cache
  if (!forceRefresh) {
    try {
      const cachedRaw = sessionStorage.getItem(STATS_CACHE_KEY);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        if (cached && typeof cached.timestamp === 'number' && Date.now() - cached.timestamp < STATS_CACHE_TTL_MS) {
          return cached.data as StatsSummary;
        }
      }
    } catch {
      // Ignore cache parse error and proceed to fetch
    }
  }

  // 2. Fetch the singleton document from Firestore (1 read)
  try {
    const docRef = doc(db, 'stats', 'summary');
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const data = snap.data() as Partial<StatsSummary>;
      const resolvedStats: StatsSummary = {
        totalCustomers: Number(data.totalCustomers) || 0,
        todaysCollection: Number(data.todaysCollection) || 0,
        totalBishiCollected: Number(data.totalBishiCollected) || 0,
        totalPrincipalLoans: Number(data.totalPrincipalLoans) || 0,
        loanBalanceDue: Number(data.loanBalanceDue) || 0,
        todaysPenalty: Number(data.todaysPenalty) || 0,
        todaysDueAmount: Number(data.todaysDueAmount) || 0,
        todaysDueInstallments: Number(data.todaysDueInstallments) || 0,
        lastUpdated: data.lastUpdated || new Date().toISOString(),
      };

      // Save to sessionStorage
      try {
        sessionStorage.setItem(
          STATS_CACHE_KEY,
          JSON.stringify({ timestamp: Date.now(), data: resolvedStats })
        );
      } catch {}

      return resolvedStats;
    }
  } catch (err) {
    console.warn('[StatsService] Could not fetch stats/summary:', err);
  }

  // 3. Fallback if stats document does not exist yet (prior to migration)
  try {
    const localCustomers = JSON.parse(localStorage.getItem('sb_customers') || '[]');
    const localColls = JSON.parse(localStorage.getItem('sb_collections') || '[]');
    const localLoans = JSON.parse(localStorage.getItem('sb_loans') || '[]');
    const todayStr = new Date().toISOString().split('T')[0];

    let todaysColl = 0;
    let totalColl = 0;
    let todaysDue = 0;
    let todaysDueCount = 0;
    let todaysPenalty = 0;

    localColls.forEach((c: any) => {
      totalColl += Number(c.collectedAmount) || 0;
      if (c.paymentDate === todayStr) {
        todaysColl += Number(c.collectedAmount) || 0;
        todaysPenalty += Number(c.penaltyAmount) || 0;
      }
      if (c.dueDate <= todayStr && c.status !== 'PAID') {
        todaysDue += Number(c.remainingAmount) || 0;
        todaysDueCount += 1;
      }
    });

    let totalPrincipal = 0;
    let loanBalance = 0;
    localLoans.forEach((l: any) => {
      if (l.status === 'ACTIVE') {
        totalPrincipal += Number(l.principalAmount) || 0;
        loanBalance += Number(l.remainingAmount) || 0;
      }
    });

    const fallback: StatsSummary = {
      totalCustomers: localCustomers.length,
      todaysCollection: todaysColl,
      totalBishiCollected: totalColl,
      totalPrincipalLoans: totalPrincipal,
      loanBalanceDue: loanBalance,
      todaysPenalty: todaysPenalty,
      todaysDueAmount: todaysDue,
      todaysDueInstallments: todaysDueCount,
      lastUpdated: new Date().toISOString(),
    };

    return fallback;
  } catch {
    return DEFAULT_STATS;
  }
};

/**
 * Invalidates the client stats cache.
 * Call this when a payment, customer, or loan is created/deleted on the current device.
 */
export const invalidateStatsCache = () => {
  try {
    sessionStorage.removeItem(STATS_CACHE_KEY);
  } catch {}
};
