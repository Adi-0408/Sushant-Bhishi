import { CollectionEntry, Customer, Loan, BishiConfig } from '../types';

export interface CalculatedFinancials {
  totalExpectedBishi: number;
  totalCollectedBishi: number;
  totalExtraAmount: number;
  totalRemainingBishi: number;
  currentDueRemaining: number;
  isCurrentDuePaid: boolean;
  totalInterest: number;
  totalPenalty: number;
  totalPayableBishi: number;
  completedInstallmentsCount: number;
  totalInstallmentsCount: number;
  isBishiCompleted: boolean;
  finalBishiPayoutInterest: number;
  finalBishiTotalReturn: number;
  loanPrincipal: number;
  loanInterest: number;
  loanPaid: number;
  loanRemaining: number;
  grandTotalPayable: number;
}

export const calculateCollectionEntry = (
  expectedAmount: number,
  newCollectedInput: number,
  interestRate: number,
  penaltyAmount: number,
  alreadyCollectedAmount: number = 0,
  isDirectEdit: boolean = false,
  extraAmount: number = 0
) => {
  const safeExpected = Math.max(0, expectedAmount || 0);
  const inputAmount = Math.max(0, newCollectedInput || 0);
  const safeExtra = Math.max(0, extraAmount || 0);
  const alreadyCollected = Math.max(0, alreadyCollectedAmount || 0);
  const safeInterestRate = Math.max(0, interestRate || 0);
  const safePenalty = Math.max(0, penaltyAmount || 0);

  let totalCollected = 0;
  if (isDirectEdit || alreadyCollected === 0) {
    // When editing directly or when no prior collection exists, the input is the exact target collected amount
    totalCollected = inputAmount;
  } else {
    // Incremental collection deposit (e.g. Quick Collection modal)
    if (inputAmount >= safeExpected) {
      totalCollected = inputAmount;
    } else if (inputAmount + alreadyCollected >= safeExpected) {
      totalCollected = safeExpected;
    } else {
      totalCollected = alreadyCollected + inputAmount;
    }
  }

  const remainingAmount = Math.max(0, safeExpected - totalCollected);

  // Calculate interest based on bishi collected/paid amount ONLY (interest is NOT applicable for extra amount)
  // Bishi collected amount eligible for interest is strictly capped at the installment expected amount
  const bishiCollectedForInterest = safeExpected > 0 ? Math.min(totalCollected, safeExpected) : totalCollected;
  const interestAmount = bishiCollectedForInterest > 0 ? Math.round((bishiCollectedForInterest * safeInterestRate) / 100) : 0;

  const totalPaid = totalCollected + safeExtra;
  const totalPayable = remainingAmount + safePenalty;

  let status: 'PAID' | 'PARTIAL' | 'PENDING' = 'PENDING';
  if (totalCollected >= safeExpected && safeExpected > 0) {
    status = 'PAID';
  } else if (totalCollected > 0) {
    status = 'PARTIAL';
  }

  return {
    expectedAmount: safeExpected,
    collectedAmount: totalCollected,
    extraAmount: safeExtra,
    remainingAmount,
    interestAmount,
    penaltyAmount: safePenalty,
    totalPaid,
    totalPayable,
    status,
  };
};

export const calculateCustomerFinancials = (
  customer: Customer,
  collections: CollectionEntry[],
  loan?: Loan | null,
  bishiConfigs?: BishiConfig[]
): CalculatedFinancials => {
  const rawCustomerCollections = collections.filter(
    (c) => c.customerId === customer.id || (customer.accountNumber && String(c.accountNumber) === String(customer.accountNumber))
  );

  const seenPeriods = new Map<number, typeof rawCustomerCollections[0]>();
  for (const c of rawCustomerCollections) {
    if (!seenPeriods.has(c.periodIndex)) {
      seenPeriods.set(c.periodIndex, c);
    } else {
      const existing = seenPeriods.get(c.periodIndex)!;
      const existingTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
      const currentTime = c.updatedAt ? new Date(c.updatedAt).getTime() : 0;
      if (currentTime > existingTime) {
        seenPeriods.set(c.periodIndex, c);
      }
    }
  }
  const customerCollections = Array.from(seenPeriods.values());

  let totalExpectedBishi = 0;
  let totalCollectedBishi = 0;
  let totalExtraAmount = 0;
  let explicitInterestSum = 0;
  let totalPenalty = 0;
  let completedInstallmentsCount = 0;

  const todayStr = new Date().toISOString().split('T')[0];
  let currentDueRemaining = 0;

  customerCollections.forEach((item) => {
    const expectedAmt = item.expectedAmount || 0;
    const collectedAmt = item.collectedAmount || 0;
    // Per-entry remaining (used only for currentDueRemaining check below)
    const recalcRemaining = Math.max(0, expectedAmt - collectedAmt);

    totalExpectedBishi += expectedAmt;
    totalCollectedBishi += collectedAmt;
    totalExtraAmount += item.extraAmount || 0;
    explicitInterestSum += item.interestAmount || 0;
    totalPenalty += item.penaltyAmount || 0;

    // currentDueRemaining: only count entries whose due date has passed/is today
    if (item.dueDate <= todayStr) {
      currentDueRemaining += recalcRemaining;
    }

    if (item.status === 'PAID' || (collectedAmt >= expectedAmt && expectedAmt > 0)) {
      completedInstallmentsCount += 1;
    }
  });

  // Overall scheme remaining = total expected − total collected.
  // This correctly handles overpayments and cross-installment payments,
  // avoiding the per-installment sum which inflates remaining by counting
  // future unpaid installments regardless of overpayments on earlier ones.
  const totalRemainingBishi = Math.max(0, totalExpectedBishi - totalCollectedBishi);

  // Effective interest rate for bishi (from customer or default for modality)
  const effectiveRate =
    typeof customer.interestRate === 'number' && customer.interestRate > 0
      ? customer.interestRate
      : (customer.modality === 'W' ? 2.5 : 10);

  // Any collected amount beyond the total bishi target is extra submitted amount (no interest)
  const extraFromOverpayment = totalExpectedBishi > 0 ? Math.max(0, totalCollectedBishi - totalExpectedBishi) : 0;
  const effectiveExtraAmount = totalExtraAmount + extraFromOverpayment;

  // The actual Bishi collected amount eligible for interest (strictly bishi only, capped at scheme limit)
  const bishiAmountEligibleForInterest = totalExpectedBishi > 0
    ? Math.min(totalCollectedBishi, totalExpectedBishi)
    : totalCollectedBishi;

  // Interest calculated STRICTLY on the bishi collected amount (NEVER on extra amount)
  const totalInterest = Math.round((bishiAmountEligibleForInterest * effectiveRate) / 100);

  // A customer has paid their current due if there are NO remaining balances on or before today
  // AND they have at least 1 collected entry or expected bishi
  const isCurrentDuePaid = currentDueRemaining === 0 && (totalCollectedBishi > 0 || completedInstallmentsCount > 0);

  const config = bishiConfigs?.find((cfg) => cfg.id === customer.bishiType);
  const totalInstallmentsCount = customer.totalInstallments
    ? customer.totalInstallments
    : config?.totalInstallments
    ? config.totalInstallments
    : customer.modality === 'W'
    ? 40
    : 10;

  // Final interest / dividend payout on total collected bishi
  const isBishiCompleted =
    completedInstallmentsCount >= totalInstallmentsCount &&
    totalRemainingBishi === 0 &&
    totalExpectedBishi > 0;

  const finalBishiPayoutInterest = totalInterest;
  // Final return: Bishi collected + Interest (on bishi only) + Extra submitted amount (trust/saving)
  const finalBishiTotalReturn = bishiAmountEligibleForInterest + totalInterest + effectiveExtraAmount;

  // What the customer owes for bishi is remaining balance + late penalty
  const totalPayableBishi = totalRemainingBishi + totalPenalty;

  let loanPrincipal = 0;
  let loanInterest = 0;
  let loanPaid = 0;
  let loanRemaining = 0;

  if ((customer.hasLoan || customer.bishiType === 'LOAN_ONLY' || Boolean(loan)) && loan) {
    loanPrincipal = loan.principalAmount || 0;
    const dueInterest = calculateLoanDueInterest(loan, todayStr);
    loanInterest = dueInterest;
    loanPaid = (Number(loan.paidAmount) || 0) + (Number(loan.totalInterestPaid) || 0);
    loanRemaining = Math.max(0, (Number(loan.remainingAmount) || 0));
  }

  const grandTotalPayable = totalPayableBishi + loanRemaining;

  return {
    totalExpectedBishi,
    totalCollectedBishi: bishiAmountEligibleForInterest,
    totalExtraAmount: effectiveExtraAmount,
    totalRemainingBishi,
    currentDueRemaining,
    isCurrentDuePaid,
    totalInterest,
    totalPenalty,
    totalPayableBishi,
    completedInstallmentsCount,
    totalInstallmentsCount,
    isBishiCompleted,
    finalBishiPayoutInterest,
    finalBishiTotalReturn,
    loanPrincipal,
    loanInterest,
    loanPaid,
    loanRemaining,
    grandTotalPayable,
  };
};

/**
 * Parse a 'YYYY-MM-DD' string safely in local time without UTC offset day shifts.
 */
export const parseLocalDate = (dateStr?: string): Date => {
  if (!dateStr) return new Date();
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      return new Date(y, m, d, 12, 0, 0);
    }
  }
  return new Date(dateStr);
};

/**
 * Format a Date object into 'YYYY-MM-DD' in local timezone.
 */
export const formatLocalDate = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/**
 * Calculates number of months elapsed from startDateStr to asOfDateStr (default today).
 * For loans and finance, minimum 1 month is charged. If a month has started/elapsed, it counts.
 */
export const calculateElapsedMonths = (startDateStr: string, asOfDateStr?: string): number => {
  if (!startDateStr) return 1;
  const start = parseLocalDate(startDateStr);
  const asOf = asOfDateStr ? parseLocalDate(asOfDateStr) : new Date();

  if (asOf <= start) return 1;

  let months = (asOf.getFullYear() - start.getFullYear()) * 12 + (asOf.getMonth() - start.getMonth());
  // If the asOf date of month has passed start day of month, entered the next month
  if (asOf.getDate() > start.getDate()) {
    months += 1;
  }
  return Math.max(1, months);
};

/**
 * Calculates total accrued interest for a loan based on principal amount, interest rate %,
 * and elapsed months between loan issueDate and asOfDateStr (today).
 */
export const calculateLoanTotalAccruedInterest = (loan?: Loan | null, asOfDateStr?: string): number => {
  if (!loan) return 0;
  const principal = Number(loan.principalAmount) || 0;
  const rate = Number(loan.interestRate) || 0;
  if (principal <= 0 || rate <= 0) return 0;

  const monthlyRateAmount = Math.round((principal * rate) / 100);
  const months = calculateElapsedMonths(loan.issueDate, asOfDateStr);
  return Math.max(monthlyRateAmount, months * monthlyRateAmount);
};

export const generateWeeklyEntries = (
  customer: Customer,
  startDateStr: string,
  totalWeeks: number = 40
): Omit<CollectionEntry, 'id'>[] => {
  const entries: Omit<CollectionEntry, 'id'>[] = [];
  const startDate = parseLocalDate(startDateStr);

  for (let i = 1; i <= totalWeeks; i++) {
    const dueDate = new Date(startDate);
    dueDate.setDate(startDate.getDate() + (i - 1) * 7);

    entries.push({
      customerId: customer.id,
      customerName: customer.name,
      accountNumber: customer.accountNumber,
      officeId: customer.officeId,
      bishiType: customer.bishiType,
      periodIndex: i,
      periodLabel: `आठवडा ${i}`,
      dueDate: formatLocalDate(dueDate),
      expectedAmount: customer.amount,
      collectedAmount: 0,
      remainingAmount: customer.amount,
      interestAmount: 0,
      historicalInterestRate: customer.interestRate,
      penaltyAmount: 0,
      historicalPenaltyRate: customer.penaltyRate,
      totalPaid: 0,
      status: 'PENDING',
      updatedAt: new Date().toISOString(),
    });
  }

  return entries;
};

export const generateMonthlyEntries = (
  customer: Customer,
  startDateStr: string,
  totalMonths: number = 10
): Omit<CollectionEntry, 'id'>[] => {
  const entries: Omit<CollectionEntry, 'id'>[] = [];
  const startDate = parseLocalDate(startDateStr);

  for (let i = 1; i <= totalMonths; i++) {
    const dueDate = new Date(startDate);
    dueDate.setMonth(startDate.getMonth() + (i - 1));

    entries.push({
      customerId: customer.id,
      customerName: customer.name,
      accountNumber: customer.accountNumber,
      officeId: customer.officeId,
      bishiType: customer.bishiType,
      periodIndex: i,
      periodLabel: `महिना ${i}`,
      dueDate: formatLocalDate(dueDate),
      expectedAmount: customer.amount,
      collectedAmount: 0,
      remainingAmount: customer.amount,
      interestAmount: 0,
      historicalInterestRate: customer.interestRate,
      penaltyAmount: 0,
      historicalPenaltyRate: customer.penaltyRate,
      totalPaid: 0,
      status: 'PENDING',
      updatedAt: new Date().toISOString(),
    });
  }

  return entries;
};

/**
 * Calculates current active loan principal balance (remaining loan principal amount).
 * If no principal has been repaid, it returns the full loan principal amount (loan.principalAmount).
 * If partial principal has been repaid, it returns the remaining principal amount.
 */
export const getLoanRemainingPrincipal = (loan?: Loan | null): number => {
  if (!loan) return 0;
  if (loan.status === 'CLOSED' || loan.status === 'COMPLETED') return 0;
  const principal = Number(loan.principalAmount) || 0;
  if (principal > 0) {
    const paid = Number(loan.paidAmount) || 0;
    const discount = Number(loan.discountAmount) || 0;
    return Math.max(0, principal - paid - discount);
  }
  return Math.max(0, Number(loan.remainingAmount) || 0);
};

/**
 * Calculates due interest for a loan based on elapsed months from issueDate to asOfDateStr,
 * minus any interest already paid.
 */
export const calculateLoanDueInterest = (loan?: Loan | null, asOfDateStr?: string): number => {
  if (!loan) return 0;
  if (loan.status === 'CLOSED' || loan.status === 'COMPLETED') return 0;
  const remPrincipal = getLoanRemainingPrincipal(loan);
  if (remPrincipal <= 0) return 0;

  const rate = Number(loan.interestRate) || 0;
  if (rate <= 0) return 0;

  const monthlyRateAmount = Math.round((remPrincipal * rate) / 100);
  const months = calculateElapsedMonths(loan.issueDate, asOfDateStr);
  const totalAccrued = months * monthlyRateAmount;
  const paidInterest = Number(loan.totalInterestPaid) || 0;

  return Math.max(0, totalAccrued - paidInterest);
};
