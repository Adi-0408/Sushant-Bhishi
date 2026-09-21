import { CollectionEntry, Customer, Loan, BishiConfig } from '../types';

export interface CalculatedFinancials {
  totalExpectedBishi: number;
  totalCollectedBishi: number;
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
  alreadyCollectedAmount: number = 0
) => {
  const safeExpected = Math.max(0, expectedAmount || 0);
  const inputAmount = Math.max(0, newCollectedInput || 0);
  const alreadyCollected = Math.max(0, alreadyCollectedAmount || 0);
  const safeInterestRate = Math.max(0, interestRate || 0);
  const safePenalty = Math.max(0, penaltyAmount || 0);

  // If inputAmount is already >= safeExpected, treat it as the total accumulated collected amount.
  // Otherwise, accumulate alreadyCollected + inputAmount.
  let totalCollected = 0;
  if (inputAmount >= safeExpected) {
    totalCollected = inputAmount;
  } else if (alreadyCollected > 0 && inputAmount <= safeExpected - alreadyCollected) {
    totalCollected = alreadyCollected + inputAmount;
  } else if (inputAmount + alreadyCollected >= safeExpected) {
    totalCollected = safeExpected;
  } else {
    totalCollected = alreadyCollected + inputAmount;
  }

  const remainingAmount = Math.max(0, safeExpected - totalCollected);

  // Calculate interest based on expected amount
  const interestAmount = Math.round((safeExpected * safeInterestRate) / 100);

  const totalPaid = totalCollected;
  const totalPayable = remainingAmount + interestAmount + safePenalty;

  let status: 'PAID' | 'PARTIAL' | 'PENDING' = 'PENDING';
  if (totalCollected >= safeExpected && safeExpected > 0) {
    status = 'PAID';
  } else if (totalCollected > 0) {
    status = 'PARTIAL';
  }

  return {
    expectedAmount: safeExpected,
    collectedAmount: totalCollected,
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
  const customerCollections = collections.filter(
    (c) => c.customerId === customer.id || (customer.accountNumber && String(c.accountNumber) === String(customer.accountNumber))
  );

  let totalExpectedBishi = 0;
  let totalCollectedBishi = 0;
  let totalRemainingBishi = 0;
  let totalInterest = 0;
  let totalPenalty = 0;
  let completedInstallmentsCount = 0;

  const todayStr = new Date().toISOString().split('T')[0];
  let currentDueRemaining = 0;

  customerCollections.forEach((item) => {
    totalExpectedBishi += item.expectedAmount || 0;
    totalCollectedBishi += item.collectedAmount || 0;
    totalRemainingBishi += item.remainingAmount || 0;
    totalInterest += item.interestAmount || 0;
    totalPenalty += item.penaltyAmount || 0;

    if (item.dueDate <= todayStr) {
      currentDueRemaining += item.remainingAmount || 0;
    }

    if (item.status === 'PAID' || (item.collectedAmount >= item.expectedAmount && item.expectedAmount > 0)) {
      completedInstallmentsCount += 1;
    }
  });

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

  // ONLY calculate final interest / dividend payout if ALL set installments (e.g. 40 weeks or 10 months) are fully paid!
  const isBishiCompleted =
    completedInstallmentsCount >= totalInstallmentsCount &&
    totalRemainingBishi === 0 &&
    totalExpectedBishi > 0;

  const finalBishiPayoutInterest = isBishiCompleted
    ? Math.round((totalCollectedBishi * (customer.interestRate || 0)) / 100)
    : 0;

  const finalBishiTotalReturn = totalCollectedBishi + finalBishiPayoutInterest;
  const totalPayableBishi = totalRemainingBishi + totalInterest + totalPenalty;

  let loanPrincipal = 0;
  let loanInterest = 0;
  let loanPaid = 0;
  let loanRemaining = 0;

  if (customer.hasLoan && loan) {
    loanPrincipal = loan.principalAmount || 0;
    const dueInterest = calculateLoanDueInterest(loan, todayStr);
    loanInterest = dueInterest;
    loanPaid = (Number(loan.paidAmount) || 0) + (Number(loan.totalInterestPaid) || 0);
    loanRemaining = Math.max(0, (Number(loan.remainingAmount) || 0));
  }

  const grandTotalPayable = totalPayableBishi + loanRemaining;

  return {
    totalExpectedBishi,
    totalCollectedBishi,
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
