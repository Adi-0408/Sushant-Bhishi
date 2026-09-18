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
  name: string;
  customerName?: string;
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
  summary?: {
    totalExpected: number;
    totalCollected: number;
    totalRemaining: number;
    completedInstallments: number;
    pendingInstallments: number;
  };
  installments?: any[];
  loanDetails?: any;
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
  principalAmount: number;
  issueDate: string;
  interestRate: number;
  totalInterest: number;
  totalPayable: number;
  paidAmount: number;
  discountAmount?: number;
  remainingAmount: number;
  penaltyAmount: number;
  status: 'ACTIVE' | 'CLOSED';
  purposeNote?: string;
  updatedAt: string;
}

export interface LoanPayment {
  id: string;
  loanId: string;
  customerId: string;
  customerName?: string;
  paymentDate: string;
  paidAmount: number;
  interestPaid: number;
  penaltyPaid: number;
  discountAmount?: number;
  remainingLoan: number;
  paymentMode?: 'CASH' | 'ONLINE';
  note?: string;
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

