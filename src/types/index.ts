export type OfficeId = 'ALL' | 'MAIN' | 'HOME';

export type BishiType = '15_AUGUST' | '26_JANUARY' | 'DASARA' | 'LOAN_ONLY' | (string & {});

export type Modality = 'W' | 'M';

export interface Admin {
  id: string;
  name: string;
  mobile: string;
  email?: string;
  photoURL?: string;
  password?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface BishiConfig {
  id: BishiType;
  name: string;
  startDate: string;
  endDate: string;
  totalInstallments: number;
  modality?: Modality;
  officeId: OfficeId;
  color?: string;
  bgPastel?: string;
}

export interface Customer {
  id: string;
  accountNumber: string; // Unique
  accountNo?: string; // Denormalized alias for fast prefix / equality queries
  name: string;
  customerName?: string;
  nameLower?: string; // Denormalized lowercase name for efficient prefix range queries
  mobile: string;
  bishiType: BishiType;
  bishiName?: string;
  bishiDate: string;
  modality: Modality;
  amount: number;
  totalInstallments?: number;
  interestRate: number;
  penaltyRate: number;
  officeId: OfficeId;
  address: string;
  photoURL?: string;
  hasLoan: boolean;
  status: 'ACTIVE' | 'COMPLETED';
  createdAt: string;
  updatedAt?: string;
  summary?: {
    totalExpected: number;
    totalCollected: number;
    totalExtraAmount?: number;
    totalRemaining: number;
    completedInstallments: number;
    pendingInstallments: number;
  };
  installments?: any[];
  loanDetails?: any;
}

// ── Installments (Due-Schedule) Schema ──────────────────────────────────────
export interface Installment {
  id: string; // e.g. inst_bishi_${customerId}_${periodIndex} or inst_loan_${loanId}_${periodIndex}
  customerId: string;
  customerName: string; // Denormalized to avoid re-fetching customer doc
  accountNumber: string;
  accountNo?: string;
  type: 'bishi' | 'loan';
  sourceId: string; // bishiType or loanId this belongs to
  dueDate: string; // YYYY-MM-DD (start of day)
  amount: number;
  status: 'pending' | 'paid' | 'overdue';
  paidAt: string | null;
  periodIndex?: number;
  periodLabel?: string;
  officeId?: OfficeId;
  createdAt?: string;
  updatedAt?: string;
}

// ── Stats Summary Singleton Schema (stats/summary) ─────────────────────────
export interface StatsSummary {
  totalCustomers: number;
  todaysCollection: number;
  totalBishiCollected: number;
  totalPrincipalLoans: number;
  loanBalanceDue: number;
  todaysPenalty: number;
  todaysDueAmount: number;
  todaysDueInstallments: number;
  lastUpdated: string;
}

export interface CollectionEntry {
  id: string;
  customerId: string;
  customerName?: string;
  accountNumber: string;
  officeId: OfficeId;
  bishiType: BishiType;
  bishiName?: string;
  periodIndex: number;
  periodLabel: string;
  dueDate: string;
  paymentDate?: string;
  expectedAmount: number;
  collectedAmount: number;
  extraAmount?: number;
  remainingAmount: number;
  interestAmount: number;
  historicalInterestRate: number;
  penaltyAmount: number;
  historicalPenaltyRate: number;
  totalPaid: number;
  totalWithPenalty?: number;
  status: 'PAID' | 'PARTIAL' | 'PENDING';
  paymentTime?: string;
  paymentMode?: 'CASH' | 'ONLINE' | 'BANK';
  note?: string;
  updatedAt: string;
}

export interface Loan {
  id: string;
  customerId: string;
  customerName?: string;
  accountNumber: string;
  officeId: OfficeId;
  customerMobile?: string;
  principalAmount: number;
  issueDate: string;
  interestRate: number;
  totalInterest: number;
  totalInterestPaid?: number;
  totalPayable: number;
  paidAmount: number;
  discountAmount?: number;
  remainingAmount: number;
  penaltyAmount: number;
  status: 'ACTIVE' | 'CLOSED' | 'COMPLETED';
  purposeNote?: string;
  updatedAt: string;
}

export interface LoanPayment {
  id: string;
  loanId: string;
  customerId: string;
  customerName?: string;
  accountNumber?: string;
  officeId?: OfficeId;
  customerMobile?: string;
  paymentDate: string;
  paidAmount: number;
  interestPaid: number;
  totalInterest?: number;
  totalInterestPaid?: number;
  penaltyPaid: number;
  discountAmount?: number;
  remainingLoan: number;
  totalPaid?: number;
  paymentMode?: 'CASH' | 'ONLINE';
  note?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface InterestRateConfig {
  id: string;
  rate: number;
  rateType?: 'MONTHLY' | 'WEEKLY';
  effectiveDate: string;
  note?: string;
}

export interface PenaltySetting {
  id: string;
  weeklyPenalty: number;
  monthlyPenalty: number;
  graceDays: number;
}

export interface SmsLog {
  id: string;
  customerId: string;
  customerName: string;
  mobile: string;
  message: string;
  type: 'DUE_REMINDER_2_DAYS' | 'DUE_TODAY' | 'PENDING' | 'PENALTY' | 'COLLECTION' | 'LOAN_BALANCE';
  sentAt: string;
  status: 'SENT' | 'FAILED';
}

// ── Thakbaki (थकबाकी) Types ──────────────────────────────────────────────────
export interface ThakbakiPayment {
  id: string;
  paymentDate: string;
  paidAmount: number;
  paymentMode: 'CASH' | 'ONLINE' | 'BANK';
  note?: string;
  createdAt: string;
}

export interface ThakbakiEntry {
  id: string;
  customerId?: string; // Optional link to an existing registered customer
  accountNumber: string;
  name: string;
  mobile: string;
  officeId: OfficeId;
  initialAmount: number;   // Original arrears / dues amount
  paidAmount: number;      // Total paid so far
  remainingAmount: number; // Current balance due
  status: 'PENDING' | 'CLEARED';
  startDate: string;
  lastPaymentDate?: string;
  note?: string;
  payments: ThakbakiPayment[];
  createdAt: string;
  updatedAt: string;
}
// ─────────────────────────────────────────────────────────────────────────────

export interface SystemBackupData {
  version: string;
  exportedAt: string;
  admins: Admin[];
  customers: Customer[];
  bishiConfigs: BishiConfig[];
  collections: CollectionEntry[];
  loans: Loan[];
  loanPayments: LoanPayment[];
  interestRates: InterestRateConfig[];
  penaltySettings: PenaltySetting[];
  smsLogs: SmsLog[];
  thakbaki?: ThakbakiEntry[]; // Optional - keeps backward compatibility with old backups
}


export interface LocalBackupSnapshot {
  id: string;
  createdAt: string;
  filename: string;
  customerCount: number;
  collectionCount: number;
  loanCount: number;
  sizeKb: number;
  data: SystemBackupData;
}

export interface AutoBackupConfig {
  enabled: boolean;
  intervalDays: number;
  lastBackupTimestamp: number;
  lastBackupDate?: string;
  lastBackupFilename?: string;
}

