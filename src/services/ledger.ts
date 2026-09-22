import { Customer, CollectionEntry, Loan, LoanPayment } from '../types';

export interface MemberLedgerRow {
  id: string;
  srNo: number;
  date: string;
  deposit: number;
  extraAmount?: number;
  cumulativeDeposit: number;
  bishiPenalty: number;
  expected: number;
  loanIssued: number;
  loanPrincipalPaid: number;
  loanInterestPaid: number;
  loanPenalty: number;
  loanDiscount: number;
  balanceRemaining: number;
  paymentMode?: string;
  note?: string;
}

export interface MemberLedgerCalculation {
  rows: MemberLedgerRow[];
  totalDeposit: number;
  totalCumulativeDeposit: number;
  totalBishiPenalty: number;
  totalExpected: number;
  totalLoanIssued: number;
  totalLoanPrincipalPaid: number;
  totalLoanInterestPaid: number;
  totalLoanPenalty: number;
  totalLoanDiscount: number;
  finalRemainingBalance: number;
}

/**
 * Builds all rows for a customer's Member Ledger Card.
 * Ensures that EVERY individual payment is shown as its own row,
 * even when multiple payments occur on a single day.
 */
export const calculateMemberLedger = (
  customer: Customer,
  collections: CollectionEntry[],
  loan?: Loan | null,
  loanPayments: LoanPayment[] = [],
  showAllPeriods: boolean = false
): MemberLedgerCalculation => {
  // 1. Get customer-specific collections and loan payments
  const allCustomerCollections = collections
    .filter((c) => c.customerId === customer.id)
    .sort((a, b) => a.periodIndex - b.periodIndex);

  const custLoanPayments = loanPayments
    .filter((lp) => lp.customerId === customer.id)
    .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate) || (a.id || '').localeCompare(b.id || ''));

  // 2. Filter collections if not showing all scheduled weeks
  const relevantCollections = showAllPeriods
    ? allCustomerCollections
    : allCustomerCollections.filter((c) => {
        const hasDeposit = (c.collectedAmount || 0) > 0;
        const isPaid = c.status === 'PAID';
        return hasDeposit || isPaid;
      });

  // 3. Track unused loan payments and map collections with loan payments by date
  // A loan payment can match a collection on either paymentDate or dueDate
  const usedLoanPaymentIds = new Set<string>();

  interface RawLedgerEntry {
    date: string;
    collection?: CollectionEntry;
    loanPayment?: LoanPayment;
  }

  const rawEntries: RawLedgerEntry[] = [];

  // Group loan payments by date
  const loanPaymentsByDate = new Map<string, LoanPayment[]>();
  custLoanPayments.forEach((lp) => {
    const d = lp.paymentDate;
    if (!loanPaymentsByDate.has(d)) {
      loanPaymentsByDate.set(d, []);
    }
    loanPaymentsByDate.get(d)!.push(lp);
  });

  // Track loan payment index consumed per date
  const loanPaymentIndexPerDate = new Map<string, number>();

  // Process collections in order
  for (const c of relevantCollections) {
    const cDate = c.paymentDate || c.dueDate;
    // Check if there are available loan payments for this date (or dueDate)
    let matchedLp: LoanPayment | undefined;

    const dateKey = loanPaymentsByDate.has(cDate)
      ? cDate
      : loanPaymentsByDate.has(c.dueDate)
      ? c.dueDate
      : null;

    if (dateKey) {
      const paymentsForDate = loanPaymentsByDate.get(dateKey)!;
      const curIdx = loanPaymentIndexPerDate.get(dateKey) || 0;
      if (curIdx < paymentsForDate.length) {
        matchedLp = paymentsForDate[curIdx];
        loanPaymentIndexPerDate.set(dateKey, curIdx + 1);
        usedLoanPaymentIds.add(matchedLp.id);
      }
    }

    rawEntries.push({
      date: cDate,
      collection: c,
      loanPayment: matchedLp,
    });
  }

  // Any remaining loan payments that were NOT paired with a collection
  // (e.g. multiple loan payments on the same day, or loan payments on days without bishi)
  for (const lp of custLoanPayments) {
    if (!usedLoanPaymentIds.has(lp.id)) {
      rawEntries.push({
        date: lp.paymentDate,
        collection: undefined,
        loanPayment: lp,
      });
      usedLoanPaymentIds.add(lp.id);
    }
  }

  // Sort raw entries chronologically by date
  rawEntries.sort((a, b) => a.date.localeCompare(b.date));

  // 4. Calculate running balances and cumulative totals across all rows
  let cumulativeDeposit = 0;
  let totalDeposit = 0;
  let totalBishiPenalty = 0;
  let totalExpected = 0;
  let totalLoanPrincipalPaid = 0;
  let totalLoanInterestPaid = 0;
  let totalLoanPenalty = 0;
  let totalLoanDiscount = 0;

  const totalLoanIssued = customer.hasLoan && loan ? (loan.principalAmount || 0) : 0;
  let runningLoanPrincipalBalance = totalLoanIssued;

  const rows: MemberLedgerRow[] = rawEntries.map((entry, idx) => {
    const c = entry.collection;
    const lp = entry.loanPayment;

    const extra = c ? (c.extraAmount || 0) : 0;
    const bishiDeposit = c ? (c.collectedAmount || 0) : 0;
    const deposit = bishiDeposit + extra;
    cumulativeDeposit += deposit;
    totalDeposit += deposit;

    const bishiPenalty = c ? (c.penaltyAmount || 0) : 0;
    totalBishiPenalty += bishiPenalty;

    const expected = c ? (c.expectedAmount || 0) : 0;
    totalExpected += expected;

    const loanPrincipalPaid = lp ? (lp.paidAmount || 0) : 0;
    totalLoanPrincipalPaid += loanPrincipalPaid;

    const loanInterestPaid = lp ? (lp.interestPaid || 0) : 0;
    totalLoanInterestPaid += loanInterestPaid;

    const loanPenalty = lp ? (lp.penaltyPaid || 0) : 0;
    totalLoanPenalty += loanPenalty;

    const loanDiscount = lp ? (lp.discountAmount || 0) : 0;
    totalLoanDiscount += loanDiscount;

    if (customer.hasLoan) {
      runningLoanPrincipalBalance = Math.max(
        0,
        runningLoanPrincipalBalance - loanPrincipalPaid - loanDiscount
      );
    }

    const loanIssued = idx === 0 && customer.hasLoan ? totalLoanIssued : 0;

    // Remaining balance is running loan principal balance + remaining bishi amount for this installment (if any)
    const bishiRemaining = c ? (c.remainingAmount || 0) : 0;
    const balanceRemaining = (customer.hasLoan ? runningLoanPrincipalBalance : 0) + bishiRemaining;

    return {
      id: c ? c.id : lp ? lp.id : `ledger-row-${idx}`,
      srNo: idx + 1,
      date: entry.date,
      deposit,
      extraAmount: extra,
      cumulativeDeposit,
      bishiPenalty,
      expected,
      loanIssued,
      loanPrincipalPaid,
      loanInterestPaid,
      loanPenalty,
      loanDiscount,
      balanceRemaining,
      paymentMode: lp ? lp.paymentMode : c ? c.paymentMode : undefined,
      note: lp ? lp.note : c ? c.note : undefined,
    };
  });

  const finalRemainingBalance =
    (customer.hasLoan && loan ? loan.remainingAmount : 0) +
    (allCustomerCollections.length > 0
      ? allCustomerCollections[allCustomerCollections.length - 1].remainingAmount || 0
      : 0);

  return {
    rows,
    totalDeposit,
    totalCumulativeDeposit: cumulativeDeposit,
    totalBishiPenalty,
    totalExpected,
    totalLoanIssued,
    totalLoanPrincipalPaid,
    totalLoanInterestPaid,
    totalLoanPenalty,
    totalLoanDiscount,
    finalRemainingBalance,
  };
};
