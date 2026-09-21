import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { CollectionEntry } from '../../types';
import { StorageService } from '../../services/db';
import { SmsService } from '../../services/sms';
import { generateCustomerPDF } from '../../services/pdf';
import {
  formatCurrency,
  formatDateMarathi,
  getBishiNameMarathi,
  getModalityShort,
  getOfficeNameMarathi,
  getStatusBadgeClass,
  getStatusTextMarathi,
} from '../../utils/formatters';
import { calculateCustomerFinancials, calculateCollectionEntry, getLoanRemainingPrincipal, calculateLoanDueInterest } from '../../utils/calculations';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { MarathiTextInput } from '../../components/common/MarathiTextInput';
import { CustomerFormModal } from './CustomerFormModal';
import { ModalPortal } from '../../components/common/ModalPortal';
import {
  ArrowLeft,
  Printer,
  Download,
  MessageSquare,
  Wallet,
  Landmark,
  Calendar,
  User,
  PlusCircle,
  Edit,
  Trash2,
  AlertCircle,
  X,
  Save,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  History,
} from 'lucide-react';

export const CustomerDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { customers, collections, loans, loanPayments, bishiConfigs, refreshData, showToast, language, t } = useApp();

  const customer = customers.find((c) => c.id === id);
  const customerLoans = customer ? loans.filter((l) => l.customerId === customer.id) : [];
  const loan = customerLoans.find((l) => l.status === 'ACTIVE')
    || [...customerLoans].sort((a, b) => (b.updatedAt || b.issueDate || '').localeCompare(a.updatedAt || a.issueDate || ''))[0]
    || null;
  const isLoanCompleted = Boolean(loan && (loan.status === 'COMPLETED' || loan.status === 'CLOSED' || (loan.remainingAmount || 0) <= 0));
  const hasAnyLoan = Boolean(customer?.hasLoan || customer?.bishiType === 'LOAN_ONLY' || customerLoans.length > 0);
  const loanPrincipalRemaining = loan ? getLoanRemainingPrincipal(loan) : 0;
  const loanDueInterest = loan ? calculateLoanDueInterest(loan) : 0;

  const customerLoanPayments = customer
    ? loanPayments.filter((lp) => lp.customerId === customer.id || (loan && lp.loanId === loan.id))
    : [];
  const totalInterestPaid = customerLoanPayments.reduce((sum, lp) => sum + (Number(lp.interestPaid) || 0), 0);

  // Collection modal state
  const [selectedEntry, setSelectedEntry] = useState<CollectionEntry | null>(null);
  const [isCollectModalOpen, setIsCollectModalOpen] = useState(false);
  const [showAllWeeks, setShowAllWeeks] = useState(false);
  const [loanHistoryMobileView, setLoanHistoryMobileView] = useState<'table' | 'cards'>('table');

  const getCurrentTimeStr = () => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  };

  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentTime, setPaymentTime] = useState(getCurrentTimeStr());
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'ONLINE' | 'BANK'>('CASH');
  const [collectedInput, setCollectedInput] = useState<number | ''>('');
  const [interestInput, setInterestInput] = useState<number | ''>('');
  const [penaltyInput, setPenaltyInput] = useState<number | ''>('');
  const [noteInput, setNoteInput] = useState('');

  // Loan Payment modal state
  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
  const [loanPaymentDate, setLoanPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [loanPaymentInput, setLoanPaymentInput] = useState<number | ''>('');
  const [loanInterestPaymentInput, setLoanInterestPaymentInput] = useState<number | ''>('');
  const [loanDiscountPaymentInput, setLoanDiscountPaymentInput] = useState<number | ''>('');
  const [loanPaymentMode, setLoanPaymentMode] = useState<'CASH' | 'ONLINE'>('CASH');

  const [deleteConfirmEntry, setDeleteConfirmEntry] = useState<CollectionEntry | null>(null);
  const [isEditCustomerOpen, setIsEditCustomerOpen] = useState(false);

  if (!customer) {
    return (
      <div className="p-12 text-center">
        <p className="text-slate-600 font-bold mb-4">{language === 'EN' ? 'Customer not found.' : 'खातेदार सापडला नाही.'}</p>
        <button
          onClick={() => navigate('/customers')}
          className="px-4 py-2 rounded-xl bg-brand-900 text-white font-bold text-sm"
        >
          {language === 'EN' ? 'Back to Customer List' : 'यादीकडे परत जा'}
        </button>
      </div>
    );
  }

  const todayStr = new Date().toISOString().split('T')[0];

  const customerCollections = collections
    .filter((c) => c.customerId === customer.id)
    .sort((a, b) => a.periodIndex - b.periodIndex);

  // Unpaid entries due on or before today
  const pendingDueEntries = customerCollections.filter(
    (c) => c.status !== 'PAID' && c.dueDate <= todayStr
  );

  // Next upcoming entry in the future
  const nextUpcomingEntry = customerCollections.find(
    (c) => c.status !== 'PAID' && c.dueDate > todayStr
  );

  // All current installments up to today are paid
  const isUpToDate = pendingDueEntries.length === 0;

  // Progressive reveal:
  // - Show all paid / partial entries
  // - Show unpaid entries due on or before today
  // - If brand new customer with no payment history yet, show first installment
  const visibleCollections = showAllWeeks
    ? customerCollections
    : customerCollections.filter((entry) => {
        if (entry.status === 'PAID' || entry.status === 'PARTIAL') return true;
        if (entry.dueDate <= todayStr) return true;
        const hasAnyPaid = customerCollections.some((c) => c.status === 'PAID' || c.status === 'PARTIAL');
        if (!hasAnyPaid && entry.periodIndex === 1) return true;
        return false;
      });

  // Determines whether the payment button ("जमा करा") should be shown
  // CRITICAL RULE:
  // - Never on already paid entries
  // - Allow for entries due on or before today
  // - If brand new customer with no payment history, allow first entry
  // - AFTER PAYING: Future entries (dueDate > todayStr) must NOT show the payment option!
  const isPayableEntry = (entry: CollectionEntry) => {
    if (entry.status === 'PAID') return false;
    if (entry.dueDate <= todayStr) return true;
    const hasAnyPaid = customerCollections.some((c) => c.status === 'PAID' || c.status === 'PARTIAL');
    if (!hasAnyPaid && entry.periodIndex === 1) return true;
    return false;
  };

  const financials = calculateCustomerFinancials(customer, collections, loan, bishiConfigs);

  const openCollectModal = (entry: CollectionEntry) => {
    setSelectedEntry(entry);
    setPaymentDate(entry.paymentDate || entry.dueDate || todayStr);
    setPaymentTime(entry.paymentTime || getCurrentTimeStr());
    setPaymentMode(entry.paymentMode || 'CASH');
    setCollectedInput(entry.collectedAmount > 0 ? entry.collectedAmount : (entry.remainingAmount > 0 ? entry.remainingAmount : entry.expectedAmount));
    setInterestInput(entry.interestAmount || 0);
    setPenaltyInput(entry.penaltyAmount || 0);
    setNoteInput(entry.note || '');
    setIsCollectModalOpen(true);
  };

  const handleSaveCollection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntry) return;

    const collected = Number(collectedInput) || 0;
    const interest = Number(interestInput) || 0;
    const penalty = Number(penaltyInput) || 0;

    const calc = calculateCollectionEntry(
      selectedEntry.expectedAmount,
      collected,
      customer.interestRate,
      penalty,
      selectedEntry.collectedAmount || 0
    );

    const totalWithPen = calc.collectedAmount + penalty;
    const updated = StorageService.updateCollectionEntry(selectedEntry.id, {
      paymentDate,
      paymentTime,
      paymentMode,
      collectedAmount: calc.collectedAmount,
      remainingAmount: calc.remainingAmount,
      interestAmount: interest || calc.interestAmount,
      penaltyAmount: penalty,
      totalPaid: totalWithPen,
      totalWithPenalty: totalWithPen,
      status: calc.status,
      note: noteInput.trim(),
    });

    showToast(language === 'EN' ? 'Collection recorded successfully.' : 'जमा नोंद यशस्वी झाली.', 'success');
    refreshData();
    setIsCollectModalOpen(false);

    // Send SMS notification automatically or prompt log
    SmsService.sendSms(customer, 'COLLECTION', {
      amount: collected,
      remaining: calc.remainingAmount,
    });
  };

  const effectiveModalLoanDueInterest = loan ? calculateLoanDueInterest(loan, loanPaymentDate || todayStr) : 0;

  const handleOpenLoanModal = () => {
    const defaultDate = todayStr;
    setLoanPaymentDate(defaultDate);
    if (loan) {
      const calcInterest = calculateLoanDueInterest(loan, defaultDate);
      setLoanInterestPaymentInput(calcInterest);
      setLoanPaymentInput('');
      setLoanDiscountPaymentInput('');
      setLoanPaymentMode('CASH');
    }
    setIsLoanModalOpen(true);
  };

  const handleSaveLoanPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loan) return;

    const paidPrin = Number(loanPaymentInput) || 0;
    const paidInt = Number(loanInterestPaymentInput) || 0;
    const discountVal = Number(loanDiscountPaymentInput) || 0;

    if (paidPrin <= 0 && paidInt <= 0 && discountVal <= 0) {
      showToast(language === 'EN' ? 'Please enter loan principal, interest or discount to deposit.' : 'कृपया जमा करण्यासाठी कर्ज मुद्दल, व्याज किंवा डिस्काउंट भरा.', 'error');
      return;
    }

    const effectiveDate = loanPaymentDate || todayStr;
    const calcDueInterest = calculateLoanDueInterest(loan, effectiveDate);
    const unpaidInt = Math.max(0, calcDueInterest - paidInt);
    const remainingPrincipal = Math.max(0, (loan.principalAmount || 0) - (loan.paidAmount || 0) - paidPrin - discountVal);
    const remLoan = Math.max(0, remainingPrincipal + (loan.penaltyAmount || 0) + unpaidInt);

    StorageService.addLoanPayment({
      loanId: loan.id,
      customerId: customer.id,
      customerName: customer.name,
      accountNumber: customer.accountNumber,
      officeId: customer.officeId,
      customerMobile: customer.mobile,
      paymentDate: loanPaymentDate || new Date().toISOString().split('T')[0],
      paidAmount: paidPrin,
      interestPaid: paidInt,
      penaltyPaid: unpaidInt, // Unpaid interest carried forward as penalty
      discountAmount: discountVal,
      remainingLoan: remLoan,
      paymentMode: loanPaymentMode,
      note: language === 'EN'
        ? `Loan payment (${loanPaymentMode === 'ONLINE' ? 'Online' : 'Cash'})${discountVal > 0 ? ` [Discount ₹${discountVal}]` : ''}${unpaidInt > 0 ? ` [Pending interest ₹${unpaidInt} carried to next period]` : ''}`
        : `कर्ज जमा (${loanPaymentMode === 'ONLINE' ? 'ऑनलाइन' : 'रोख'})${discountVal > 0 ? ` [डिस्काउंट/सूट ₹${discountVal}]` : ''}${unpaidInt > 0 ? ` [थकबाकी व्याज ₹${unpaidInt} पुढील हप्त्यात वर्ग]` : ''}`,
    });

    showToast(language === 'EN' ? 'Loan payment recorded successfully.' : 'कर्ज जमा नोंद यशस्वी झाली.', 'success');
    refreshData();
    setIsLoanModalOpen(false);
    setLoanPaymentInput('');
    setLoanInterestPaymentInput('');
    setLoanDiscountPaymentInput('');

    SmsService.sendSms(customer, 'LOAN_BALANCE', {
      loanBalance: remLoan,
    });
  };

  const handleDeleteEntryConfirm = async () => {
    if (!deleteConfirmEntry) return;
    try {
      await StorageService.deleteCollectionEntry(deleteConfirmEntry.id);
      showToast(language === 'EN' ? 'Collection entry deleted.' : 'जमा नोंद हटवली.', 'success');
      refreshData();
      setDeleteConfirmEntry(null);
    } catch {
      showToast(language === 'EN' ? 'Error deleting entry.' : 'नोंद हटवताना त्रुटी आली.', 'error');
    }
  };

  const handleSendManualSms = () => {
    SmsService.sendSms(customer, 'PENDING', {
      remaining: financials.totalRemainingBishi,
    });
    showToast(language === 'EN' ? 'SMS sent to customer.' : 'खातेदाराला एसएमएस पाठवला गेला.', 'success');
  };

  return (
    <div className="space-y-6 pb-16 print:space-y-3 print:pb-0 print-container">
      {/* Top Navigation & Print / Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs no-print">
        <button
          onClick={() => navigate('/customers')}
          className="inline-flex items-center space-x-2 text-sm font-bold text-slate-700 hover:text-brand-900"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{language === 'EN' ? 'Back to Customer List' : 'खातेदार यादीकडे परत'}</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {/* Send SMS */}
          <button
            onClick={handleSendManualSms}
            className="px-3.5 py-2 min-h-[44px] rounded-xl bg-purple-50 text-purple-700 border border-purple-200 font-bold text-xs hover:bg-purple-100 transition-colors flex items-center space-x-1.5 touch-target cursor-pointer"
          >
            <MessageSquare className="w-4 h-4" />
            <span>{language === 'EN' ? 'Send SMS' : 'एसएमएस पाठवा'}</span>
          </button>

          {/* Download PDF - Requirement 25: Clean PDF without Branding */}
          <button
            onClick={() => generateCustomerPDF(customer, collections, loan, loanPayments)}
            className="px-3.5 py-2 min-h-[44px] rounded-xl bg-brand-50 text-brand-700 border border-brand-200 font-bold text-xs hover:bg-brand-100 transition-colors flex items-center space-x-1.5 touch-target cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>{language === 'EN' ? 'Download PDF' : 'PDF डाउनलोड'}</span>
          </button>

          {/* Print - Requirement 29 */}
          <button
            onClick={() => window.print()}
            className="px-3.5 py-2 min-h-[44px] rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition-colors flex items-center space-x-1.5 shadow-xs touch-target cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>{language === 'EN' ? 'Print' : 'प्रिंट करा'}</span>
          </button>
        </div>
      </div>

      {/* Print-Only Header - Clean Slate Border & Layout */}
      <div className="print-only mb-3 border-b-2 border-slate-700 pb-2.5">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">{t.appName}</h1>
            <p className="text-xs font-extrabold text-slate-700">
              {language === 'EN' ? 'Customer Account Statement' : 'खातेदार व्यवहार अहवाल (Customer Account Statement)'}
            </p>
          </div>
          <div className="text-right text-[11px] font-bold text-slate-600 leading-tight">
            <div>{language === 'EN' ? 'Date:' : 'दिनांक:'} <strong className="text-slate-900">{formatDateMarathi(new Date().toISOString().split('T')[0], language)}</strong></div>
            <div>{t.colOffice}: <strong className="text-slate-900">{getOfficeNameMarathi(customer.officeId, language)}</strong></div>
          </div>
        </div>
      </div>

      {/* Customer Header Info Card */}
      <div className="bg-white p-6 print:p-3 rounded-2xl print:rounded-xl border border-slate-200 print:border-slate-300 shadow-xs print:shadow-none">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5 print:flex-row print:items-center print:pb-2.5 print:border-slate-200">
          <div className="flex items-center space-x-3 sm:space-x-4">
            <div className="w-14 h-14 print:w-10 print:h-10 rounded-2xl print:rounded-xl bg-brand-900 text-white flex items-center justify-center text-xl print:text-base font-black shadow-md flex-shrink-0">
              {customer.photoURL ? (
                <img
                  src={customer.photoURL}
                  alt={customer.name}
                  className="w-full h-full rounded-2xl print:rounded-xl object-cover"
                />
              ) : (
                customer.name.charAt(0)
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl print:text-base font-black text-slate-900">{customer.name}</h1>
                <span className="px-3 py-0.5 rounded-full text-xs print:text-[10px] font-black bg-brand-100 text-brand-900">
                  {customer.accountNumber}
                </span>
                <button
                  onClick={() => setIsEditCustomerOpen(true)}
                  className="px-3 py-1 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-extrabold text-xs flex items-center space-x-1.5 transition-all shadow-2xs cursor-pointer ml-1 no-print"
                  title={language === 'EN' ? 'Edit customer information' : 'नाव, मोबाईल नंबर किंवा माहिती बदला'}
                >
                  <Edit className="w-3.5 h-3.5 text-amber-700" />
                  <span>{language === 'EN' ? 'Edit Details' : 'माहिती बदला (Edit)'}</span>
                </button>
              </div>
              <p className="text-xs print:text-[10px] text-slate-500 font-bold mt-1 print:mt-0.5">
                {t.colMobile}: {customer.mobile} | {t.colOffice}: {getOfficeNameMarathi(customer.officeId, language)}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3 bg-slate-50 p-3 print:p-1.5 print:text-[10px] rounded-xl border border-slate-200 text-xs font-bold text-slate-700">
            <div>
              <span className="text-slate-400 block text-[10px] print:text-[8px] uppercase">{t.colBishi}</span>
              {getBishiNameMarathi(customer.bishiType, language)}
            </div>
            <div className="h-6 w-px bg-slate-300"></div>
            <div>
              <span className="text-slate-400 block text-[10px] print:text-[8px] uppercase">{t.colModality}</span>
              {getModalityShort(customer.modality, language)} ({customer.modality})
            </div>
          </div>
        </div>

        {/* Financial Summary Grid - Requirement 11 */}
        <div className="mt-6 print:mt-2.5">
          <h3 className="text-sm print:text-xs font-extrabold text-slate-900 mb-3 print:mb-1.5 flex items-center space-x-2">
            <Wallet className="w-4 h-4 print:w-3.5 print:h-3.5 text-brand-700" />
            <span>{language === 'EN' ? 'Financial Summary' : 'आर्थिक माहिती'}</span>
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 print:grid-cols-6 gap-3 print:gap-1.5">
            <div className="bg-slate-50 p-3.5 print:p-1.5 rounded-xl print:rounded-lg border border-slate-200 text-center">
              <span className="text-[11px] print:text-[9px] font-bold text-slate-500 block leading-tight">{language === 'EN' ? 'Total Bishi Amount' : 'एकूण भिशी रक्कम'}</span>
              <span className="text-base print:text-xs font-black text-slate-900 block mt-0.5">
                {formatCurrency(financials.totalExpectedBishi, language)}
              </span>
            </div>

            <div className="bg-emerald-50 p-3.5 print:p-1.5 rounded-xl print:rounded-lg border border-emerald-200 text-center">
              <span className="text-[11px] print:text-[9px] font-bold text-emerald-800 block leading-tight">{language === 'EN' ? 'Total Collected' : 'आतापर्यंत जमा'}</span>
              <span className="text-base print:text-xs font-black text-emerald-700 block mt-0.5">
                {formatCurrency(financials.totalCollectedBishi, language)}
              </span>
            </div>

            <div className={`p-3.5 print:p-1.5 rounded-xl print:rounded-lg border-2 text-center transition-all ${
              financials.totalRemainingBishi > 0
                ? 'bg-rose-50 border-rose-400 ring-2 ring-rose-200/60 shadow-xs print:border-rose-300 print:ring-0'
                : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center justify-center space-x-1">
                <span className="text-[11px] print:text-[9px] font-extrabold text-rose-900 block leading-tight">{t.colRemaining}</span>
                {financials.totalRemainingBishi > 0 && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] print:hidden font-black bg-rose-600 text-white animate-pulse">
                    {language === 'EN' ? 'TO PAY' : 'देय बाकी'}
                  </span>
                )}
              </div>
              <span className="text-base print:text-xs font-black text-rose-700 block mt-0.5">
                {formatCurrency(financials.totalRemainingBishi, language)}
              </span>
            </div>

            <div className="bg-blue-50 p-3.5 print:p-1.5 rounded-xl print:rounded-lg border border-blue-200 text-center">
              <span className="text-[11px] print:text-[9px] font-bold text-blue-800 block leading-tight">{language === 'EN' ? 'Total Interest' : 'एकूण व्याज'}</span>
              <span className="text-base print:text-xs font-black text-blue-900 block mt-0.5">
                {formatCurrency(financials.totalInterest, language)}
              </span>
            </div>

            <div className="bg-amber-50 p-3.5 print:p-1.5 rounded-xl print:rounded-lg border border-amber-200 text-center">
              <span className="text-[11px] print:text-[9px] font-bold text-amber-800 block leading-tight">{language === 'EN' ? 'Total Penalty' : 'एकूण दंड'}</span>
              <span className="text-base print:text-xs font-black text-amber-900 block mt-0.5">
                {formatCurrency(financials.totalPenalty, language)}
              </span>
            </div>

            <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-3.5 print:p-1.5 rounded-xl print:rounded-lg shadow-md border-2 border-slate-700 text-center">
              <div className="flex items-center justify-center space-x-1">
                <span className="text-[11px] print:text-[9px] font-bold text-slate-300 block leading-tight">{language === 'EN' ? 'Total Payable Amount' : 'एकूण देय रक्कम'}</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] print:hidden font-black bg-emerald-600 text-white">
                  {language === 'EN' ? 'PAYABLE' : 'ग्राहकाकडून देय'}
                </span>
              </div>
              <span className="text-base print:text-xs font-black text-white block mt-0.5">
                {formatCurrency(financials.totalPayableBishi, language)}
              </span>
            </div>
          </div>
        </div>

        {/* Bishi Completion & Settlement Status Card */}
        {customer.bishiType !== 'LOAN_ONLY' && (
          <div className="mt-4 print:mt-2 bg-white p-4 print:p-2.5 rounded-xl border border-slate-200 print:border-slate-300 shadow-xs print:shadow-none">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:gap-1.5 border-b border-slate-100 print:border-slate-200 pb-3 print:pb-1.5">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className={`w-5 h-5 print:w-4 print:h-4 ${financials.isBishiCompleted ? 'text-emerald-600' : 'text-amber-500'}`} />
                <h4 className="text-sm print:text-xs font-extrabold text-slate-900">
                  {language === 'EN' ? 'Bishi Final Settlement & Dividend Return' : 'भिशी समाप्ती व व्याज लाभांश परतावा (Bishi Final Settlement)'}
                </h4>
              </div>

              <span className={`px-3 py-1 print:px-2 print:py-0.5 rounded-full text-xs print:text-[10px] font-black ${
                financials.isBishiCompleted
                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                  : 'bg-amber-100 text-amber-900 border border-amber-300'
              }`}>
                {financials.isBishiCompleted
                  ? (language === 'EN' ? `🎉 All ${financials.totalInstallmentsCount}/${financials.totalInstallmentsCount} Installments Completed (Bishi Fully Completed)` : `🎉 सर्व ${financials.totalInstallmentsCount}/${financials.totalInstallmentsCount} हप्ते पूर्ण (Bishi Fully Completed)`)
                  : (language === 'EN' ? `⏳ Active Bishi (${financials.completedInstallmentsCount}/${financials.totalInstallmentsCount} Installments Paid)` : `⏳ चालू भिशी (${financials.completedInstallmentsCount}/${financials.totalInstallmentsCount} हप्ते जमा)`)}
              </span>
            </div>

            {financials.isBishiCompleted ? (
              <div className="mt-4 print:mt-1.5 p-4 print:p-2 rounded-2xl print:rounded-lg bg-emerald-50 border border-emerald-200 grid grid-cols-1 sm:grid-cols-3 gap-4 print:gap-2">
                <div>
                  <span className="text-[11px] print:text-[9px] font-bold text-emerald-800 block leading-tight">{language === 'EN' ? 'Total Collected Bishi Amount' : 'एकूण जमा भिशी रक्कम'}</span>
                  <span className="text-lg print:text-sm font-black text-emerald-900">{formatCurrency(financials.totalCollectedBishi, language)}</span>
                </div>
                <div>
                  <span className="text-[11px] print:text-[9px] font-bold text-emerald-800 block leading-tight">{language === 'EN' ? `Final Interest / Dividend (${customer.interestRate}%)` : `अंतिम व्याज / लाभांश (${customer.interestRate}%)`}</span>
                  <span className="text-lg print:text-sm font-black text-emerald-700">+{formatCurrency(financials.finalBishiPayoutInterest, language)}</span>
                </div>
                <div>
                  <span className="text-[11px] print:text-[9px] font-bold text-emerald-900 block leading-tight">{language === 'EN' ? 'Total Final Return to Customer' : 'खातेदाराला मिळणारा एकूण अंतिम परतावा'}</span>
                  <span className="text-xl print:text-sm font-black text-emerald-900">{formatCurrency(financials.finalBishiTotalReturn, language)}</span>
                </div>
              </div>
            ) : (
              <div className="mt-3 print:mt-1.5 p-3 print:p-2 rounded-xl border border-slate-200 text-xs print:text-[10px] text-slate-600 font-semibold flex items-center justify-between">
                <span>
                  {language === 'EN' ? (
                    <>💡 Final dividend interest return will be added only after paying all <strong>{financials.totalInstallmentsCount} installments</strong> ({customer.modality === 'W' ? `${financials.totalInstallmentsCount} weeks` : `${financials.totalInstallmentsCount} months`}).</>
                  ) : (
                    <>💡 सर्व <strong>{financials.totalInstallmentsCount} हप्ते</strong> ({customer.modality === 'W' ? `${financials.totalInstallmentsCount} आठवडे` : `${financials.totalInstallmentsCount} महिने`}) पूर्ण भरल्यावरच शेवटी अंतिम लाभांश व्याज परतावा जोडला जाईल.</>
                  )}
                </span>
                <span className="font-extrabold text-amber-900 bg-amber-100 px-2 py-0.5 rounded shrink-0 ml-2 print:text-[9px]">
                  {language === 'EN' ? `Remaining: ${financials.totalInstallmentsCount - financials.completedInstallmentsCount} installments` : `बाकी: ${financials.totalInstallmentsCount - financials.completedInstallmentsCount} हप्ते`}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 52-Week or Monthly Collection Table - Requirements 13 & 14 */}
      <div className="bg-white rounded-2xl print:rounded-xl border border-slate-200 print:border-slate-300 shadow-xs print:shadow-none overflow-hidden print:mt-2">
        <div className="p-5 print:p-2.5 border-b border-slate-100 print:border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Calendar className="w-5 h-5 print:w-4 print:h-4 text-brand-700" />
            <h3 className="text-base print:text-xs font-extrabold text-slate-900">
              {language === 'EN'
                ? (customer.modality === 'W' ? 'Weekly Bishi Collection Records' : 'Monthly Bishi Collection Records')
                : (customer.modality === 'W' ? 'साप्ताहिक भिशी जमा नोंदी' : 'मासिक भिशी जमा नोंदी')}
            </h3>
          </div>
          <div className="flex items-center space-x-3 no-print">
            <button
              onClick={() => setShowAllWeeks(!showAllWeeks)}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              {showAllWeeks ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>
                {language === 'EN'
                  ? (showAllWeeks ? 'View Current Week' : `View All ${customerCollections.length} Weeks`)
                  : (showAllWeeks ? 'चालू आठवडा पहा' : `सर्व ${customerCollections.length} आठवडे पहा`)}
              </span>
            </button>
            <span className="text-xs font-bold px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full">
              {language === 'EN'
                ? `Showing: ${visibleCollections.length} / ${customerCollections.length}`
                : `दाखवले: ${visibleCollections.length} / ${customerCollections.length}`}
            </span>
          </div>
        </div>

        {/* Banner if all current installments are paid */}
        {isUpToDate && nextUpcomingEntry && (
          <div className="mx-3 sm:mx-5 mt-4 p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 no-print">
            <div className="flex items-center space-x-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <span className="font-extrabold text-emerald-950 text-xs sm:text-sm block sm:inline">
                  {language === 'EN' ? 'Current installment is fully paid!' : 'चालू तारखेचा हप्ता पूर्ण जमा झाला आहे!'}
                </span>
                <span className="text-emerald-700 text-xs sm:ml-2">
                  {language === 'EN' ? 'Next Due Date:' : 'पुढील हप्ता तारीख:'} <strong className="font-black text-emerald-900">{formatDateMarathi(nextUpcomingEntry.dueDate, language)}</strong> ({nextUpcomingEntry.periodLabel})
                </span>
              </div>
            </div>
            <span className="text-[11px] font-extrabold px-3 py-1 rounded-full bg-emerald-200/80 text-emerald-900 shrink-0 w-fit">
              {language === 'EN' ? '✅ All Current Dues Paid' : '✅ सर्व चालू हप्ते पूर्ण'}
            </span>
          </div>
        )}

        {/* Mobile Cards View (< md screens, hidden in print) */}
        <div className="block md:hidden print:hidden space-y-3 p-3 bg-slate-50/50">
          {visibleCollections.map((entry) => (
            <div
              key={entry.id}
              className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="font-extrabold text-slate-900 text-sm">{entry.periodLabel}</span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-black ${
                    entry.status === 'PAID'
                      ? getStatusBadgeClass('PAID')
                      : isPayableEntry(entry)
                      ? getStatusBadgeClass(entry.status)
                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                  }`}
                >
                  {entry.status === 'PAID'
                    ? getStatusTextMarathi('PAID', language)
                    : isPayableEntry(entry)
                    ? getStatusTextMarathi(entry.status, language)
                    : (language === 'EN' ? '⏳ Upcoming' : '⏳ आगामी')}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-600">
                <div>
                  <span className="text-[10px] font-extrabold text-slate-400 block uppercase">
                    {t.colDueDate}
                  </span>
                  <span className="text-slate-900 font-bold">
                    {formatDateMarathi(entry.paymentDate || entry.dueDate, language)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-extrabold text-slate-400 block uppercase">
                    {t.colExpectedAmount}
                  </span>
                  <span className="text-slate-900 font-extrabold">
                    {formatCurrency(entry.expectedAmount, language)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 font-bold block">{t.colCollected}:</span>
                  <span className="font-black text-emerald-700">
                    {formatCurrency(entry.collectedAmount, language)}
                  </span>
                  {(entry.penaltyAmount || 0) > 0 && (
                    <div className="text-[10px] font-extrabold text-amber-800">
                      + {language === 'EN' ? 'Penalty' : 'दंड'}: {formatCurrency(entry.penaltyAmount, language)} ({language === 'EN' ? 'Total' : 'एकूण'}: {formatCurrency(entry.totalWithPenalty || ((entry.collectedAmount || 0) + (entry.penaltyAmount || 0)), language)})
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-rose-700 font-extrabold block">
                    {language === 'EN' ? 'Due to Pay:' : 'ग्राहकाकडून येणे:'}
                  </span>
                  {entry.remainingAmount > 0 ? (
                    <span className="inline-block px-2 py-0.5 rounded-lg bg-rose-100 text-rose-800 border border-rose-300 font-black text-xs shadow-2xs">
                      {formatCurrency(entry.remainingAmount, language)}
                    </span>
                  ) : (
                    <span className="font-black text-emerald-700">₹0</span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[11px] font-bold text-slate-700">
                  {entry.paymentMode === 'ONLINE'
                    ? (language === 'EN' ? 'Online (UPI)' : 'ऑनलाइन (UPI)')
                    : entry.paymentMode === 'BANK'
                    ? (language === 'EN' ? 'Bank' : 'बँक')
                    : (language === 'EN' ? 'Cash' : 'नगद')}
                </span>

                <div className="flex items-center space-x-2">
                  {entry.status === 'PAID' ? (
                    <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-xs">
                      {language === 'EN' ? '✅ Paid' : '✅ जमा'}
                    </span>
                  ) : isPayableEntry(entry) ? (
                    <button
                      onClick={() => openCollectModal(entry)}
                      className="px-3.5 py-2 min-h-[44px] rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs flex items-center space-x-1 shadow-xs cursor-pointer touch-target"
                    >
                      <Wallet className="w-3.5 h-3.5" />
                      <span>{t.btnCollect}</span>
                    </button>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 font-bold text-xs flex items-center space-x-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>{language === 'EN' ? 'Upcoming' : 'आगामी'} ({formatDateMarathi(entry.dueDate, language)})</span>
                    </span>
                  )}
                  {/* Edit button for all entries so user can edit dates/amounts */}
                  <button
                    type="button"
                    onClick={() => openCollectModal(entry)}
                    className="p-2.5 min-h-[44px] min-w-[44px] rounded-xl bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 flex items-center justify-center touch-target cursor-pointer"
                    title={language === 'EN' ? 'Edit installment / date' : 'नोंद / तारीख बदला (Edit)'}
                  >
                    <Edit className="w-4 h-4 text-amber-700" />
                  </button>
                  {entry.collectedAmount > 0 && (
                    <button
                      onClick={() => setDeleteConfirmEntry(entry)}
                      className="p-2.5 min-h-[44px] min-w-[44px] rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 flex items-center justify-center touch-target"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop & Print Table View */}
        <div className="hidden md:block print:block overflow-x-auto print:overflow-visible">
          <table className="w-full text-left text-xs sm:text-sm print:text-[10px] print:leading-tight">
            <thead className="bg-slate-50 text-slate-700 font-extrabold border-b border-slate-200">
              <tr>
                <th className="p-3.5 pl-5 print:p-1.5 print:pl-2">
                  {language === 'EN'
                    ? (customer.modality === 'W' ? 'Week' : 'Month')
                    : (customer.modality === 'W' ? 'आठवडा' : 'महिना')}
                </th>
                <th className="p-3.5 print:p-1.5">{language === 'EN' ? 'Due Date / Time' : 'देय तारीख / जमा वेळ'}</th>
                <th className="p-3.5 print:p-1.5 text-right">{t.colExpectedAmount}</th>
                <th className="p-3.5 print:p-1.5 text-right">{t.colCollectedAmount}</th>
                <th className="p-3.5 print:p-1.5 text-right">{t.colRemainingAmount}</th>
                <th className="p-3.5 print:p-1.5 text-right">{language === 'EN' ? 'Interest (₹)' : 'व्याज (₹)'}</th>
                <th className="p-3.5 print:p-1.5 text-right">{language === 'EN' ? 'Penalty (₹)' : 'दंड (₹)'}</th>
                <th className="p-3.5 print:p-1.5 text-center">{t.colModality}</th>
                <th className="p-3.5 print:p-1.5 text-center">{t.colStatus}</th>
                <th className="p-3.5 text-center no-print">{t.colActions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {visibleCollections.map((entry) => (
                <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3.5 pl-5 print:p-1.5 print:pl-2 font-bold text-slate-900">{entry.periodLabel}</td>
                  <td className="p-3.5 print:p-1.5 text-slate-600">
                    <div>{formatDateMarathi(entry.paymentDate || entry.dueDate, language)}</div>
                    {entry.paymentTime && (
                      <div className="text-[11px] print:text-[9px] font-bold text-slate-400 flex items-center space-x-1 mt-0.5">
                        <Clock className="w-3 h-3 print:w-2.5 print:h-2.5 text-slate-400" />
                        <span>{entry.paymentTime}</span>
                      </div>
                    )}
                  </td>
                  <td className="p-3.5 print:p-1.5 text-right font-bold text-slate-800">
                    {formatCurrency(entry.expectedAmount, language)}
                  </td>
                  <td className="p-3.5 print:p-1.5 text-right font-bold text-emerald-700">
                    <div>{formatCurrency(entry.collectedAmount, language)}</div>
                    {(entry.penaltyAmount || 0) > 0 && (
                      <div className="text-[10px] print:text-[8px] text-amber-800 font-extrabold whitespace-nowrap">
                        {language === 'EN' ? 'With Penalty:' : 'दंडासह:'} {formatCurrency(entry.totalWithPenalty || ((entry.collectedAmount || 0) + (entry.penaltyAmount || 0)), language)}
                      </div>
                    )}
                  </td>
                  <td className="p-3.5 print:p-1.5 text-right font-extrabold">
                    {entry.remainingAmount > 0 ? (
                      <span className="inline-block px-2.5 py-1 print:px-1 print:py-0 rounded-lg bg-rose-100 text-rose-900 border border-rose-300 font-black shadow-2xs print:bg-transparent print:border-none print:shadow-none print:text-rose-700 print:text-[10px]">
                        {formatCurrency(entry.remainingAmount, language)}
                      </span>
                    ) : (
                      <span className="text-emerald-700 font-extrabold print:text-[10px]">₹0</span>
                    )}
                  </td>
                  <td className="p-3.5 print:p-1.5 text-right text-slate-700 print:text-[10px]">
                    {formatCurrency(entry.interestAmount, language)}
                  </td>
                  <td className="p-3.5 print:p-1.5 text-right font-bold text-rose-600 print:text-[10px]">
                    {(entry.penaltyAmount || 0) > 0 ? (
                      <span className="px-1.5 py-0.5 print:px-0.5 print:py-0 rounded bg-rose-50 text-rose-700 font-extrabold border border-rose-200 print:bg-transparent print:border-none print:text-[10px]">
                        {formatCurrency(entry.penaltyAmount, language)}
                      </span>
                    ) : (
                      <span className="text-slate-400 font-normal">₹0</span>
                    )}
                  </td>
                  <td className="p-3.5 print:p-1.5 text-center font-bold text-slate-700 print:text-[10px]">
                    <span className="px-2 py-0.5 print:px-1 print:py-0 rounded-md bg-slate-100 print:bg-transparent text-[11px] print:text-[9px] font-bold">
                      {entry.paymentMode === 'ONLINE'
                        ? (language === 'EN' ? 'Online' : 'ऑनलाइन')
                        : entry.paymentMode === 'BANK'
                        ? (language === 'EN' ? 'Bank' : 'बँक')
                        : (language === 'EN' ? 'Cash' : 'नगद')}
                    </span>
                  </td>
                  <td className="p-3.5 print:p-1.5 text-center print:text-[10px]">
                    <span
                      className={`px-2.5 py-1 print:px-1 print:py-0 rounded-full text-xs print:text-[9px] font-bold ${
                        entry.status === 'PAID'
                          ? getStatusBadgeClass('PAID')
                          : isPayableEntry(entry)
                          ? getStatusBadgeClass(entry.status)
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {entry.status === 'PAID'
                        ? getStatusTextMarathi('PAID', language)
                        : isPayableEntry(entry)
                        ? getStatusTextMarathi(entry.status, language)
                        : (language === 'EN' ? '⏳ Upcoming' : '⏳ आगामी')}
                    </span>
                  </td>
                  <td className="p-3.5 text-center no-print">
                    <div className="flex items-center justify-center space-x-1.5">
                      {entry.status === 'PAID' ? (
                        <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-[11px]">
                          {language === 'EN' ? '✅ Paid' : '✅ जमा'}
                        </span>
                      ) : isPayableEntry(entry) ? (
                        <button
                          onClick={() => openCollectModal(entry)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold transition-colors text-xs flex items-center space-x-1 cursor-pointer shadow-2xs"
                        >
                          <Wallet className="w-3.5 h-3.5" />
                          <span>{t.btnCollect}</span>
                        </button>
                      ) : (
                        <span
                          className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 font-bold text-[11px] flex items-center space-x-1"
                          title={language === 'EN' ? `Next due date: ${formatDateMarathi(entry.dueDate, language)}` : `पुढील हप्ता तारीख: ${formatDateMarathi(entry.dueDate, language)}`}
                        >
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>{language === 'EN' ? 'Upcoming' : 'आगामी'} ({formatDateMarathi(entry.dueDate, language)})</span>
                        </span>
                      )}
                      {/* Edit button so user can edit dates/amounts for any entry */}
                      <button
                        type="button"
                        onClick={() => openCollectModal(entry)}
                        className="p-1 rounded-lg bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 transition-colors cursor-pointer"
                        title={language === 'EN' ? 'Edit installment / date' : 'नोंद / तारीख बदला (Edit)'}
                      >
                        <Edit className="w-3.5 h-3.5 text-amber-700" />
                      </button>
                      {entry.collectedAmount > 0 && (
                        <button
                          onClick={() => setDeleteConfirmEntry(entry)}
                          className="p-1 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* LOAN SECTION - SHOW FOR ANY CUSTOMER WITH CURRENT OR COMPLETED LOAN */}
      {hasAnyLoan && loan ? (
        <div className="bg-white rounded-2xl print:rounded-xl border border-amber-200 print:border-slate-300 shadow-xs print:shadow-none overflow-hidden print:mt-2.5 print:break-inside-avoid">
          <div className="p-5 print:p-2 bg-amber-50/50 border-b border-amber-200 print:border-slate-200 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Landmark className="w-5 h-5 print:w-4 print:h-4 text-amber-700" />
              <h3 className="text-base print:text-xs font-extrabold text-amber-900">
                {language === 'EN' ? 'Loan Details' : 'कर्जाची माहिती'}
              </h3>
            </div>
            {isLoanCompleted ? (
              <span className="px-3 py-1.5 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-800 font-extrabold text-xs inline-flex items-center space-x-1.5 shadow-2xs no-print">
                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                <span>{language === 'EN' ? 'Loan Completed' : 'कर्ज पूर्ण फेडले (Completed)'}</span>
              </span>
            ) : (
              <button
                onClick={handleOpenLoanModal}
                className="px-4 py-2 rounded-xl bg-amber-700 text-white font-extrabold text-xs hover:bg-amber-800 transition-colors no-print cursor-pointer"
              >
                {language === 'EN' ? '+ Repay Loan' : '+ कर्ज जमा करा'}
              </button>
            )}
          </div>

          <div className="p-6 print:p-2.5">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 print:grid-cols-7 gap-3 sm:gap-4 print:gap-1.5">
              <div className="bg-slate-50 p-3.5 print:p-1.5 rounded-xl print:rounded-lg border border-slate-200 text-center">
                <span className="text-[11px] print:text-[9px] font-bold text-slate-500 block leading-tight">{language === 'EN' ? 'Loan Principal' : 'कर्जाची रक्कम'}</span>
                <span className="text-base print:text-xs font-black text-slate-900 block mt-0.5">
                  {formatCurrency(loan.principalAmount, language)}
                </span>
                {loanPrincipalRemaining < loan.principalAmount && (
                  <span className="text-[10px] print:text-[8px] font-bold text-amber-800 block mt-0.5 leading-none">
                    ({language === 'EN' ? 'Rem' : 'उर्वरित'}: {formatCurrency(loanPrincipalRemaining, language)})
                  </span>
                )}
              </div>

              <div className="bg-slate-50 p-3.5 print:p-1.5 rounded-xl print:rounded-lg border border-slate-200 text-center">
                <span className="text-[11px] print:text-[9px] font-bold text-slate-500 block leading-tight">{language === 'EN' ? 'Interest Rate' : 'व्याज दर'}</span>
                <span className="text-base print:text-xs font-black text-slate-900 block mt-0.5">
                  {loan.interestRate}%
                </span>
                <span className="text-[10px] print:text-[8px] font-bold text-amber-800 block mt-0.5 leading-none">
                  ({language === 'EN' ? 'Mo' : 'मासिक'}: {formatCurrency(loanDueInterest, language)})
                </span>
              </div>

              <div className="bg-amber-50 p-3.5 print:p-1.5 rounded-xl print:rounded-lg border border-amber-200 text-center">
                <span className="text-[11px] print:text-[9px] font-bold text-amber-800 block leading-tight">{language === 'EN' ? 'Total Payable' : 'एकूण देय'}</span>
                <span className="text-base print:text-xs font-black text-amber-900 block mt-0.5">
                  {formatCurrency(loan.totalPayable, language)}
                </span>
              </div>

              <div className="bg-emerald-50 p-3.5 print:p-1.5 rounded-xl print:rounded-lg border border-emerald-200 text-center">
                <span className="text-[11px] print:text-[9px] font-bold text-emerald-800 block leading-tight">{language === 'EN' ? 'Paid Principal' : 'भरलेली मुद्दल'}</span>
                <span className="text-base print:text-xs font-black text-emerald-700 block mt-0.5">
                  {formatCurrency(loan.paidAmount, language)}
                </span>
              </div>

              <div className="bg-amber-100/70 p-3.5 print:p-1.5 rounded-xl print:rounded-lg border border-amber-300 text-center">
                <span className="text-[11px] print:text-[9px] font-extrabold text-amber-950 block leading-tight">{language === 'EN' ? 'Interest Paid' : 'भरलेले व्याज'}</span>
                <span className="text-base print:text-xs font-black text-amber-900 block mt-0.5">
                  {formatCurrency(totalInterestPaid, language)}
                </span>
              </div>

              {Boolean(loan.discountAmount && loan.discountAmount > 0) && (
                <div className="bg-emerald-100/70 p-3.5 print:p-1.5 rounded-xl print:rounded-lg border border-emerald-300 text-center">
                  <span className="text-[11px] print:text-[9px] font-extrabold text-emerald-900 block leading-tight">{language === 'EN' ? 'Discount Given' : 'दिलेली सूट'}</span>
                  <span className="text-base print:text-xs font-black text-emerald-800 block mt-0.5">
                    {formatCurrency(loan.discountAmount || 0, language)}
                  </span>
                </div>
              )}

              <div className={`p-3.5 print:p-1.5 rounded-xl print:rounded-lg border-2 text-center transition-all ${
                isLoanCompleted
                  ? 'bg-emerald-50 border-emerald-300'
                  : loan.remainingAmount > 0
                  ? 'bg-rose-50 border-rose-400 ring-2 ring-rose-200/60 shadow-xs print:border-rose-300 print:ring-0'
                  : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex items-center justify-center space-x-1">
                  <span className={`text-[11px] print:text-[9px] font-extrabold block leading-tight ${isLoanCompleted ? 'text-emerald-900' : 'text-rose-900'}`}>
                    {language === 'EN' ? 'Loan Balance' : 'कर्जाची बाकी'}
                  </span>
                  {!isLoanCompleted && loan.remainingAmount > 0 && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] print:hidden font-black bg-rose-600 text-white animate-pulse">
                      {language === 'EN' ? 'DUE' : 'बाकी'}
                    </span>
                  )}
                  {isLoanCompleted && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] print:hidden font-black bg-emerald-600 text-white">
                      ✓
                    </span>
                  )}
                </div>
                <span className={`text-base print:text-xs font-black block mt-0.5 ${isLoanCompleted ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {formatCurrency(isLoanCompleted ? 0 : loan.remainingAmount, language)}
                </span>
              </div>

              <div className={`p-3.5 print:p-1.5 rounded-xl print:rounded-lg border flex items-center justify-center text-center ${
                isLoanCompleted ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-100 border-slate-200'
              }`}>
                <span className={`px-3 py-1 print:px-1.5 print:py-0.5 rounded-full text-xs print:text-[9px] font-bold ${
                  isLoanCompleted
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : getStatusBadgeClass(loan.status)
                }`}>
                  {isLoanCompleted
                    ? (language === 'EN' ? 'Completed' : 'पूर्ण (Completed)')
                    : loan.status === 'ACTIVE'
                    ? (language === 'EN' ? 'Active Loan' : 'कर्ज सुरू')
                    : (language === 'EN' ? 'Completed' : 'पूर्ण (Completed)')}
                </span>
              </div>
            </div>

            {/* Loan Payment History Table */}
            {customerLoanPayments.length > 0 && (
              <div className="mt-6 print:mt-2.5 border-t border-slate-100 print:border-slate-200 pt-5 print:pt-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 print:mb-1.5">
                  <h4 className="text-xs print:text-[10px] font-black text-slate-800 uppercase tracking-wider flex items-center space-x-2">
                    <History className="w-4 h-4 print:w-3.5 print:h-3.5 text-emerald-700 shrink-0" />
                    <span>{language === 'EN' ? 'Loan Payment History' : 'कर्ज भरणा इतिहास (Loan Payment History)'}</span>
                  </h4>

                  <div className="flex items-center flex-wrap gap-2">
                    <span className="text-[11px] print:text-[9px] text-slate-600 font-bold bg-slate-100 px-2.5 py-1 print:px-1.5 print:py-0.5 rounded-lg border border-slate-200">
                      {language === 'EN'
                        ? `Entries: ${customerLoanPayments.length} | Total Interest: ${formatCurrency(totalInterestPaid, language)}`
                        : `नोंदी: ${customerLoanPayments.length} | एकूण व्याज: ${formatCurrency(totalInterestPaid, language)}`}
                    </span>

                    {/* Mobile View Toggle (Table vs Cards) - Strictly Hidden in Print */}
                    <div className="flex md:hidden bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px] font-bold no-print">
                      <button
                        type="button"
                        onClick={() => setLoanHistoryMobileView('table')}
                        className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                          loanHistoryMobileView === 'table'
                            ? 'bg-emerald-700 text-white shadow-2xs font-extrabold'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        📋 {language === 'EN' ? 'Table' : 'तक्ता'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setLoanHistoryMobileView('cards')}
                        className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                          loanHistoryMobileView === 'cards'
                            ? 'bg-emerald-700 text-white shadow-2xs font-extrabold'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        📱 {language === 'EN' ? 'Cards' : 'कार्ड्स'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Mobile Swipe Cue (visible in Table mode on mobile) */}
                {loanHistoryMobileView === 'table' && (
                  <div className="md:hidden flex items-center justify-between text-[11px] font-bold text-amber-800 bg-amber-50/90 px-3 py-1.5 rounded-lg border border-amber-200 mb-2.5 no-print">
                    <span>👉 {language === 'EN' ? 'Swipe horizontally to view all columns' : 'सर्व रकाने पाहण्यासाठी डावीकडे/उजवीकडे स्वाइप करा'}</span>
                  </div>
                )}

                {/* Mobile Cards View (< md screens when 'cards' view selected) */}
                {loanHistoryMobileView === 'cards' && (
                  <div className="block md:hidden space-y-2.5 no-print">
                    {customerLoanPayments.map((lp, idx) => (
                      <div
                        key={lp.id}
                        className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-2.5"
                      >
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                          <div className="flex items-center space-x-2">
                            <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-black text-xs flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <span className="font-extrabold text-slate-900 text-xs">
                              {formatDateMarathi(lp.paymentDate, language)}
                            </span>
                          </div>
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[11px] font-bold text-slate-700">
                            {lp.paymentMode === 'ONLINE'
                              ? (language === 'EN' ? '📱 Online' : '📱 ऑनलाइन')
                              : (language === 'EN' ? '💵 Cash' : '💵 नगद')}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-emerald-50/70 p-2 rounded-lg border border-emerald-100/80">
                            <span className="text-[10px] font-bold text-emerald-800 block">
                              {language === 'EN' ? 'Paid Principal' : 'भरलेली मुद्दल'}:
                            </span>
                            <span className="font-black text-emerald-700 text-sm">
                              {formatCurrency(lp.paidAmount, language)}
                            </span>
                          </div>
                          <div className="bg-amber-50/70 p-2 rounded-lg border border-amber-100/80">
                            <span className="text-[10px] font-bold text-amber-800 block">
                              {language === 'EN' ? 'Interest Paid' : 'भरलेले व्याज'}:
                            </span>
                            <span className="font-black text-amber-800 text-sm">
                              {formatCurrency(lp.interestPaid, language)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
                          <div className="text-slate-500 text-[11px]">
                            {lp.discountAmount ? (
                              <span className="font-bold text-emerald-700">
                                {language === 'EN' ? 'Discount' : 'सूट'}: {formatCurrency(lp.discountAmount, language)}
                              </span>
                            ) : lp.note ? (
                              <span>{lp.note}</span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] font-extrabold text-slate-500 block">
                              {language === 'EN' ? 'Remaining Loan' : 'उर्वरित बाकी'}:
                            </span>
                            <span className="font-black text-rose-600 text-sm">
                              {formatCurrency(lp.remainingLoan, language)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Table View (Aligned with min-w-[640px] and whitespace-nowrap for flawless horizontal mobile scroll and desktop display) */}
                <div className={`${loanHistoryMobileView === 'cards' ? 'hidden md:block' : 'block'} print:block overflow-x-auto print:overflow-visible rounded-xl border border-slate-200 print:border-slate-300 shadow-2xs print:shadow-none bg-white`}>
                  <table className="w-full min-w-[640px] print:min-w-0 text-left text-xs print:text-[10px] border-collapse print:leading-tight">
                    <thead className="bg-slate-50 text-slate-700 font-extrabold border-b border-slate-200">
                      <tr>
                        <th className="p-2.5 sm:p-3 print:p-1.5 pl-3 sm:pl-4 print:pl-2 text-left whitespace-nowrap">{language === 'EN' ? 'Date' : 'दिनांक'}</th>
                        <th className="p-2.5 sm:p-3 print:p-1.5 text-right whitespace-nowrap">{language === 'EN' ? 'Paid Principal' : 'भरलेली मुद्दल'}</th>
                        <th className="p-2.5 sm:p-3 print:p-1.5 text-right text-amber-900 font-black whitespace-nowrap">{language === 'EN' ? 'Interest Paid' : 'भरलेले व्याज'}</th>
                        <th className="p-2.5 sm:p-3 print:p-1.5 text-right whitespace-nowrap">{language === 'EN' ? 'Discount' : 'सूट (Discount)'}</th>
                        <th className="p-2.5 sm:p-3 print:p-1.5 text-right whitespace-nowrap text-rose-900">{language === 'EN' ? 'Remaining Balance' : 'उर्वरित बाकी'}</th>
                        <th className="p-2.5 sm:p-3 print:p-1.5 text-center whitespace-nowrap">{t.colModality}</th>
                        <th className="p-2.5 sm:p-3 print:p-1.5 text-left whitespace-nowrap pr-3 sm:pr-4 print:pr-2">{language === 'EN' ? 'Details / Note' : 'तपशील / टीप'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                      {customerLoanPayments.map((lp, idx) => (
                        <tr
                          key={lp.id}
                          className={`hover:bg-slate-50/80 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}
                        >
                          <td className="p-2.5 sm:p-3 print:p-1.5 pl-3 sm:pl-4 print:pl-2 font-bold text-slate-900 whitespace-nowrap">
                            {formatDateMarathi(lp.paymentDate, language)}
                          </td>
                          <td className="p-2.5 sm:p-3 print:p-1.5 text-right font-black text-emerald-700 whitespace-nowrap">
                            {formatCurrency(lp.paidAmount, language)}
                          </td>
                          <td className="p-2.5 sm:p-3 print:p-1.5 text-right font-black text-amber-800 whitespace-nowrap">
                            {formatCurrency(lp.interestPaid, language)}
                          </td>
                          <td className="p-2.5 sm:p-3 print:p-1.5 text-right text-slate-600 whitespace-nowrap">
                            {lp.discountAmount ? formatCurrency(lp.discountAmount, language) : '-'}
                          </td>
                          <td className="p-2.5 sm:p-3 print:p-1.5 text-right font-black text-rose-600 whitespace-nowrap">
                            {formatCurrency(lp.remainingLoan, language)}
                          </td>
                          <td className="p-2.5 sm:p-3 print:p-1.5 text-center whitespace-nowrap">
                            <span className="px-2 py-0.5 print:px-1 print:py-0 rounded-md bg-slate-100 print:bg-transparent text-[11px] print:text-[9px] font-bold text-slate-700 inline-block">
                              {lp.paymentMode === 'ONLINE'
                                ? (language === 'EN' ? 'Online' : 'ऑनलाइन')
                                : (language === 'EN' ? 'Cash' : 'नगद')}
                            </span>
                          </td>
                          <td className="p-2.5 sm:p-3 print:p-1.5 text-slate-500 text-[11px] print:text-[9px] font-medium whitespace-nowrap pr-3 sm:pr-4 print:pr-2">
                            {lp.note || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Print-Only Verification & Signature Block */}
      <div className="print-only mt-6 print:mt-3 pt-4 print:pt-2 border-t border-dashed border-slate-400 text-xs font-bold text-slate-600 break-inside-avoid">
        <div className="flex justify-between items-end">
          <div>
            <p className="text-[9px] text-slate-500 leading-tight">
              {language === 'EN'
                ? '• This report is computer-generated by Sushant Bishi Management System.'
                : '• सदर अहवाल सुषांत भिशी व्यवस्थापन प्रणालीद्वारे संगणकीकृत तयार करण्यात आला आहे.'}
            </p>
            <p className="text-[9px] text-slate-500 leading-tight">
              {language === 'EN'
                ? '• In case of any discrepancy, please contact the office immediately.'
                : '• कोणतीही तफावत आढळल्यास त्वरित कार्यालयाशी संपर्क साधावा.'}
            </p>
          </div>
          <div className="flex gap-8 text-center">
            <div>
              <div className="h-8"></div>
              <div className="border-t border-slate-600 pt-1 min-w-28 text-slate-800 font-bold text-[11px]">
                {language === 'EN' ? 'Customer Signature' : 'खातेदार स्वाक्षरी'}
              </div>
            </div>
            <div>
              <div className="h-8"></div>
              <div className="border-t border-slate-800 pt-1 min-w-32 text-slate-900 font-black text-[11px]">
                {language === 'EN' ? 'Authorized Stamp / Sign' : 'अधिकृत स्वाक्षरी / शिक्का'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Collection Entry Modal - Requirement 12 */}
      {isCollectModalOpen && selectedEntry && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs no-print overflow-hidden">
            <div className="bg-white rounded-2xl sm:rounded-3xl max-w-md w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in duration-150">
            <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 flex items-center space-x-2">
                  <Wallet className="w-5 h-5 text-emerald-700" />
                  <span>
                    {language === 'EN'
                      ? `Record Bishi Installment (${selectedEntry.periodLabel})`
                      : `भिशी हप्ता जमा नोंद (${selectedEntry.periodLabel})`}
                  </span>
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  {t.colDueDate}: <strong className="text-emerald-800 font-extrabold">{formatDateMarathi(selectedEntry.dueDate, language)}</strong>
                </p>
              </div>
              <button onClick={() => setIsCollectModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCollection} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">


              {/* Payment Mode Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {language === 'EN' ? 'Payment Mode' : 'पद्धत (Payment Mode)'}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMode('CASH')}
                    className={`py-2 px-2 rounded-xl text-xs font-extrabold transition-all border cursor-pointer ${
                      paymentMode === 'CASH'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    💵 {language === 'EN' ? 'Cash' : 'नगद (Cash)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMode('ONLINE')}
                    className={`py-2 px-2 rounded-xl text-xs font-extrabold transition-all border cursor-pointer ${
                      paymentMode === 'ONLINE'
                        ? 'bg-brand-900 text-white border-brand-900 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    📱 {language === 'EN' ? 'Online (UPI)' : 'ऑनलाइन (UPI)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMode('BANK')}
                    className={`py-2 px-2 rounded-xl text-xs font-extrabold transition-all border cursor-pointer ${
                      paymentMode === 'BANK'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    🏛️ {language === 'EN' ? 'Bank' : 'बँक'}
                  </button>
                </div>
              </div>

              {/* Payment Date & Time (Editable) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center space-x-1">
                    <Calendar className="w-3.5 h-3.5 text-emerald-700" />
                    <span>{language === 'EN' ? 'Payment Date (Editable):' : 'जमा दिनांक (तारीख बदला):'}</span>
                  </label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 bg-white focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center space-x-1">
                    <Clock className="w-3.5 h-3.5 text-emerald-700" />
                    <span>{language === 'EN' ? 'Payment Time (Editable):' : 'जमा वेळ:'}</span>
                  </label>
                  <input
                    type="time"
                    value={paymentTime}
                    onChange={(e) => setPaymentTime(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 bg-white focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {language === 'EN' ? 'Expected Amount' : 'अपेक्षित रक्कम'}
                  </label>
                  <input
                    type="number"
                    readOnly
                    value={selectedEntry.expectedAmount}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {language === 'EN' ? 'Deposit Amount (₹)' : 'जमा रक्कम (₹)'}
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={collectedInput}
                    onChange={(e) => setCollectedInput(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-4 py-2 rounded-xl border border-emerald-300 text-sm font-bold text-emerald-800 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {language === 'EN' ? 'Late Fee / Penalty (₹)' : 'दंड (₹)'}
                </label>
                <input
                  type="number"
                  value={penaltyInput}
                  onChange={(e) => setPenaltyInput(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-4 py-2 rounded-xl border border-rose-300 text-sm font-bold text-rose-800"
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 space-y-1.5">
                <div className="flex justify-between">
                  <span>{language === 'EN' ? 'Remaining Due:' : 'उरलेली बाकी:'}</span>
                  <span className="text-rose-600 font-extrabold">
                    {formatCurrency(
                      Math.max(0, selectedEntry.expectedAmount - (Number(collectedInput) || 0)),
                      language
                    )}
                  </span>
                </div>
                {(Number(penaltyInput) || 0) > 0 && (
                  <div className="flex justify-between pt-1.5 border-t border-slate-200 text-amber-900">
                    <span>{language === 'EN' ? 'Total Collection with Penalty:' : 'दंड समावेश एकूण जमा:'}</span>
                    <span className="text-emerald-800 font-black">
                      {formatCurrency((Number(collectedInput) || 0) + (Number(penaltyInput) || 0), language)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="p-3.5 sm:px-6 sm:py-3.5 bg-slate-50 border-t border-slate-100 flex justify-end space-x-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsCollectModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-white transition-colors cursor-pointer shadow-2xs"
              >
                {t.btnCancel}
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-brand-900 text-white text-xs font-bold shadow-md hover:bg-brand-800 transition-colors cursor-pointer"
              >
                {t.btnSave}
              </button>
            </div>
          </form>
        </div>
      </div>
      </ModalPortal>
      )}

      {/* Loan Payment Modal */}
      {isLoanModalOpen && loan && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs no-print overflow-hidden">
            <div className="bg-white rounded-2xl sm:rounded-3xl max-w-md w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in duration-150">
            <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center space-x-2">
                <Landmark className="w-5 h-5 text-amber-600" />
                <span>{language === 'EN' ? 'Loan Repayment' : 'कर्ज जमा करा (Loan Repayment)'}</span>
              </h3>
              <button onClick={() => setIsLoanModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveLoanPayment} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
              {/* Payment Mode Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {language === 'EN' ? 'Payment Mode' : 'भरणा पद्धत (Payment Mode)'} <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setLoanPaymentMode('CASH')}
                    className={`py-2 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center space-x-2 border transition-all cursor-pointer ${
                      loanPaymentMode === 'CASH'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>💵 {language === 'EN' ? 'Cash' : 'रोख (Cash)'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLoanPaymentMode('ONLINE')}
                    className={`py-2 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center space-x-2 border transition-all cursor-pointer ${
                      loanPaymentMode === 'ONLINE'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>📱 {language === 'EN' ? 'Online' : 'ऑनलाइन (Online)'}</span>
                  </button>
                </div>
              </div>

              {/* Loan Payment Date (Editable) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center space-x-1">
                  <Calendar className="w-3.5 h-3.5 text-amber-600" />
                  <span>{language === 'EN' ? 'Payment Date (Editable):' : 'कर्ज जमा दिनांक (तारीख बदला):'}</span>
                </label>
                <input
                  type="date"
                  value={loanPaymentDate}
                  onChange={(e) => {
                    const newDate = e.target.value;
                    setLoanPaymentDate(newDate);
                    if (loan) {
                      const newInt = calculateLoanDueInterest(loan, newDate);
                      setLoanInterestPaymentInput(newInt);
                    }
                  }}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 bg-white focus:ring-2 focus:ring-amber-500 shadow-2xs"
                />
              </div>

              {/* Option 1: Loan Interest (Calculated on Loan Amount) */}
              <div>
                <label className="block text-xs font-extrabold text-slate-900 mb-1">
                  {language === 'EN' ? '1. Loan Interest Deposit (₹)' : '१. कर्ज व्याज जमा (₹)'}
                  <span className="text-amber-700 ml-2 font-bold text-[11px]">
                    ({language === 'EN' ? 'Current Auto Interest:' : 'चालू ऑटो व्याज:'} ₹{effectiveModalLoanDueInterest})
                  </span>
                </label>
                <input
                  type="number"
                  min={0}
                  value={loanInterestPaymentInput}
                  onChange={(e) => setLoanInterestPaymentInput(e.target.value ? Number(e.target.value) : '')}
                  placeholder={language === 'EN' ? `e.g. ${effectiveModalLoanDueInterest}` : `उदा. ${effectiveModalLoanDueInterest}`}
                  className="w-full px-4 py-2.5 rounded-xl border border-amber-300 text-sm font-bold focus:ring-2 focus:ring-amber-500 bg-amber-50/20"
                />
              </div>

              {/* Option 2: Loan Principal Repayment */}
              <div>
                <label className="block text-xs font-extrabold text-slate-900 mb-1">
                  {language === 'EN' ? '2. Loan Principal Repayment (₹)' : '२. कर्ज मुद्दल जमा (₹)'}
                  <span className="text-slate-500 ml-2 font-normal text-[11px]">
                    {language === 'EN' ? '(Reduces outstanding loan balance)' : '(मुद्दल भरल्याने बाकी कमी होते)'}
                  </span>
                </label>
                <input
                  type="number"
                  min={0}
                  value={loanPaymentInput}
                  onChange={(e) => setLoanPaymentInput(e.target.value ? Number(e.target.value) : '')}
                  placeholder={language === 'EN' ? 'e.g. 5000' : 'उदा. 5000'}
                  className="w-full px-4 py-2.5 rounded-xl border border-amber-300 text-sm font-bold focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Option 3: Loan Discount / Suit */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {language === 'EN' ? '3. Loan Discount / Concession (₹)' : '३. कर्ज डिस्काउंट / सूट (Discount ₹)'}
                  <span className="text-emerald-700 ml-2 font-normal">
                    {language === 'EN' ? '(Optional discount)' : '(पर्यायी दिलेली सूट)'}
                  </span>
                </label>
                <input
                  type="number"
                  min={0}
                  value={loanDiscountPaymentInput}
                  onChange={(e) => setLoanDiscountPaymentInput(e.target.value ? Number(e.target.value) : '')}
                  placeholder={language === 'EN' ? 'e.g. 500' : 'उदा. 500'}
                  className="w-full px-4 py-2.5 rounded-xl border border-emerald-400 text-sm font-bold focus:ring-2 focus:ring-emerald-500 text-emerald-900 bg-emerald-50/30"
                />
              </div>

              {/* Live Remaining Balance & Next Cycle Interest Calculation Preview */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold space-y-1.5">
                <div className="flex justify-between text-slate-600">
                  <span>{language === 'EN' ? 'Current Loan Balance:' : 'चालू कर्जाची बाकी:'}</span>
                  <span>{formatCurrency(loan.remainingAmount, language)}</span>
                </div>
                {(Number(loanInterestPaymentInput) || 0) > 0 && (
                  <div className="flex justify-between text-amber-900 font-bold">
                    <span>{language === 'EN' ? 'Interest Paid:' : 'भरलेले व्याज (Interest Paid):'}</span>
                    <span>₹{Number(loanInterestPaymentInput) || 0}</span>
                  </div>
                )}
                {((Number(loanPaymentInput) || 0) > 0 || (Number(loanDiscountPaymentInput) || 0) > 0) && (
                  <div className="flex justify-between text-emerald-700">
                    <span>{language === 'EN' ? 'Principal Paid + Discount:' : 'जमा मुद्दल + डिस्काउंट:'}</span>
                    <span>₹{(Number(loanPaymentInput) || 0) + (Number(loanDiscountPaymentInput) || 0)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-1 border-t border-slate-200">
                  <span>{language === 'EN' ? 'New Remaining Loan Balance:' : 'नवीन कर्जाची उर्वरित बाकी:'}</span>
                  <span className="text-rose-600 font-extrabold">
                    {formatCurrency(Math.max(0, loanPrincipalRemaining - (Number(loanPaymentInput) || 0) - (Number(loanDiscountPaymentInput) || 0) + (loan.penaltyAmount || 0) + Math.max(0, effectiveModalLoanDueInterest - (Number(loanInterestPaymentInput) || 0))), language)}
                  </span>
                </div>
                {Math.max(0, loanPrincipalRemaining - (Number(loanPaymentInput) || 0) - (Number(loanDiscountPaymentInput) || 0)) > 0 && (Number(loanPaymentInput) || 0) > 0 && (
                  <div className="flex justify-between text-blue-800 pt-1 border-t border-slate-200 text-[11px]">
                    <span>{language === 'EN' ? `💡 Auto monthly interest next period (${loan.interestRate}%):` : `💡 मुद्दल परतीनंतर पुढील महिन्याचे ऑटो व्याज (${loan.interestRate}%):`}</span>
                    <span className="font-extrabold text-blue-900">
                      ₹{Math.round((Math.max(0, loanPrincipalRemaining - (Number(loanPaymentInput) || 0) - (Number(loanDiscountPaymentInput) || 0)) * loan.interestRate) / 100)}
                    </span>
                  </div>
                )}
                {Math.max(0, loan.remainingAmount - (Number(loanPaymentInput) || 0) - (Number(loanDiscountPaymentInput) || 0)) === 0 && (
                  <div className="text-center text-emerald-700 font-black text-xs pt-1 border-t border-emerald-200 mt-1">
                    {language === 'EN' ? '🎉 Loan Fully Closed (Status: CLOSED)!' : '🎉 कर्ज पूर्ण नील / बंद होईल (Loan Status: CLOSED)!'}
                  </div>
                )}
              </div>

              {/* Unpaid Interest Carry Forward Note */}
              {effectiveModalLoanDueInterest > (Number(loanInterestPaymentInput) || 0) && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-900">
                  {language === 'EN'
                    ? `⚠️ Unpaid interest ₹${effectiveModalLoanDueInterest - (Number(loanInterestPaymentInput) || 0)} will be carried forward with late fees to next cycle.`
                    : `⚠️ न भरलेले व्याज ₹${effectiveModalLoanDueInterest - (Number(loanInterestPaymentInput) || 0)} थकबाकी दंडासह पुढील हप्त्यात जोडले जाईल.`}
                </div>
              )}
            </div>

            <div className="p-3.5 sm:px-6 sm:py-3.5 bg-slate-50 border-t border-slate-100 flex justify-end space-x-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsLoanModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-white transition-colors cursor-pointer shadow-2xs"
              >
                {t.btnCancel}
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-amber-700 text-white text-xs font-bold shadow-md hover:bg-amber-800 transition-colors cursor-pointer"
              >
                {language === 'EN' ? 'Record Loan Payment' : 'कर्ज जमा करा'}
              </button>
            </div>
          </form>
        </div>
      </div>
      </ModalPortal>
      )}

      {/* Entry Delete Confirm Modal */}
      <ConfirmModal
        isOpen={!!deleteConfirmEntry}
        title={language === 'EN' ? 'Delete Collection Entry' : 'जमा नोंद हटवा'}
        message={language === 'EN' ? 'Are you sure you want to delete this collection entry?' : 'तुम्हाला ही जमा नोंद नक्की हटवायची आहे का?'}
        confirmText={t.btnDelete}
        cancelText={t.btnCancel}
        onConfirm={handleDeleteEntryConfirm}
        onCancel={() => setDeleteConfirmEntry(null)}
      />

      {/* Edit Customer Modal */}
      <CustomerFormModal
        isOpen={isEditCustomerOpen}
        editingCustomer={customer}
        onClose={() => setIsEditCustomerOpen(false)}
        onSuccess={refreshData}
      />
    </div>
  );
};
