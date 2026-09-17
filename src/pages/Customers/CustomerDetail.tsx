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
} from 'lucide-react';

export const CustomerDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { customers, collections, loans, loanPayments, bishiConfigs, refreshData, showToast } = useApp();

  const customer = customers.find((c) => c.id === id);
  const loan = customer ? loans.find((l) => l.customerId === customer.id && l.status === 'ACTIVE') : null;
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
  const [loanPaymentInput, setLoanPaymentInput] = useState<number | ''>('');
  const [loanInterestPaymentInput, setLoanInterestPaymentInput] = useState<number | ''>('');
  const [loanDiscountPaymentInput, setLoanDiscountPaymentInput] = useState<number | ''>('');
  const [loanPaymentMode, setLoanPaymentMode] = useState<'CASH' | 'ONLINE'>('CASH');

  const [deleteConfirmEntry, setDeleteConfirmEntry] = useState<CollectionEntry | null>(null);
  const [isEditCustomerOpen, setIsEditCustomerOpen] = useState(false);

  if (!customer) {
    return (
      <div className="p-12 text-center">
        <p className="text-slate-600 font-bold mb-4">खातेदार सापडला नाही.</p>
        <button
          onClick={() => navigate('/customers')}
          className="px-4 py-2 rounded-xl bg-brand-900 text-white font-bold text-sm"
        >
          यादीकडे परत जा
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
    // When collecting payment, record the actual payment date as today
    setPaymentDate(todayStr);
    setPaymentTime(getCurrentTimeStr());
    setPaymentMode(entry.paymentMode || 'CASH');
    setCollectedInput(entry.remainingAmount > 0 ? entry.remainingAmount : (entry.collectedAmount || entry.expectedAmount));
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

    showToast('जमा नोंद यशस्वी झाली.', 'success');
    refreshData();
    setIsCollectModalOpen(false);

    // Send SMS notification automatically or prompt log
    SmsService.sendSms(customer, 'COLLECTION', {
      amount: collected,
      remaining: calc.remainingAmount,
    });
  };

  const handleOpenLoanModal = () => {
    if (loan) {
      const calcInterest = calculateLoanDueInterest(loan);
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
      showToast('कृपया जमा करण्यासाठी कर्ज मुद्दल, व्याज किंवा डिस्काउंट भरा.', 'error');
      return;
    }

    const calcDueInterest = calculateLoanDueInterest(loan);
    const unpaidInt = Math.max(0, calcDueInterest - paidInt);
    const remainingPrincipal = Math.max(0, (loan.principalAmount || 0) - (loan.paidAmount || 0) - paidPrin - discountVal);
    const remLoan = Math.max(0, remainingPrincipal + (loan.penaltyAmount || 0) + unpaidInt);

    StorageService.addLoanPayment({
      loanId: loan.id,
      customerId: customer.id,
      paymentDate: new Date().toISOString().split('T')[0],
      paidAmount: paidPrin,
      interestPaid: paidInt,
      penaltyPaid: unpaidInt, // Unpaid interest carried forward as penalty
      discountAmount: discountVal,
      remainingLoan: remLoan,
      paymentMode: loanPaymentMode,
      note: `कर्ज जमा (${loanPaymentMode === 'ONLINE' ? 'ऑनलाइन' : 'रोख'})${discountVal > 0 ? ` [डिस्काउंट/सूट ₹${discountVal}]` : ''}${unpaidInt > 0 ? ` [थकबाकी व्याज ₹${unpaidInt} पुढील हप्त्यात वर्ग]` : ''}`,
    });

    showToast('कर्ज जमा नोंद यशस्वी झाली.', 'success');
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
      showToast('जमा नोंद हटवली.', 'success');
      refreshData();
      setDeleteConfirmEntry(null);
    } catch {
      showToast('नोंद हटवताना त्रुटी आली.', 'error');
    }
  };

  const handleSendManualSms = () => {
    SmsService.sendSms(customer, 'PENDING', {
      remaining: financials.totalRemainingBishi,
    });
    showToast('खातेदाराला एसएमएस पाठवला गेला.', 'success');
  };

  return (
    <div className="space-y-6 pb-16 print-container">
      {/* Top Navigation & Print / Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs no-print">
        <button
          onClick={() => navigate('/customers')}
          className="inline-flex items-center space-x-2 text-sm font-bold text-slate-700 hover:text-brand-900"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>खातेदार यादीकडे परत</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {/* Send SMS */}
          <button
            onClick={handleSendManualSms}
            className="px-3.5 py-2 min-h-[44px] rounded-xl bg-purple-50 text-purple-700 border border-purple-200 font-bold text-xs hover:bg-purple-100 transition-colors flex items-center space-x-1.5 touch-target cursor-pointer"
          >
            <MessageSquare className="w-4 h-4" />
            <span>एसएमएस पाठवा</span>
          </button>

          {/* Download PDF - Requirement 25: Clean PDF without Branding */}
          <button
            onClick={() => generateCustomerPDF(customer, collections, loan, loanPayments)}
            className="px-3.5 py-2 min-h-[44px] rounded-xl bg-brand-50 text-brand-700 border border-brand-200 font-bold text-xs hover:bg-brand-100 transition-colors flex items-center space-x-1.5 touch-target cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>PDF डाउनलोड</span>
          </button>

          {/* Print - Requirement 29 */}
          <button
            onClick={() => window.print()}
            className="px-3.5 py-2 min-h-[44px] rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition-colors flex items-center space-x-1.5 shadow-xs touch-target cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>प्रिंट करा</span>
          </button>
        </div>
      </div>

      {/* Print-Only Header */}
      <div className="print-only mb-6 border-b-2 border-emerald-900 pb-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black text-emerald-900 tracking-tight">सुषांत भिशी</h1>
            <p className="text-sm font-extrabold text-slate-700">खातेदार व्यवहार अहवाल (Customer Account Statement)</p>
          </div>
          <div className="text-right text-xs font-bold text-slate-600">
            <div>दिनांक: <strong className="text-slate-900">{formatDateMarathi(new Date().toISOString().split('T')[0])}</strong></div>
            <div>कार्यालय: <strong className="text-emerald-900">{getOfficeNameMarathi(customer.officeId)}</strong></div>
          </div>
        </div>
      </div>

      {/* Customer Header Info Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs print:border-slate-300">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 rounded-2xl bg-brand-900 text-white flex items-center justify-center text-xl font-black shadow-md flex-shrink-0">
              {customer.photoURL ? (
                <img
                  src={customer.photoURL}
                  alt={customer.name}
                  className="w-full h-full rounded-2xl object-cover"
                />
              ) : (
                customer.name.charAt(0)
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900">{customer.name}</h1>
                <span className="px-3 py-0.5 rounded-full text-xs font-black bg-brand-100 text-brand-900">
                  {customer.accountNumber}
                </span>
                <button
                  onClick={() => setIsEditCustomerOpen(true)}
                  className="px-3 py-1 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-extrabold text-xs flex items-center space-x-1.5 transition-all shadow-2xs cursor-pointer ml-1 no-print"
                  title="नाव, मोबाईल नंबर किंवा माहिती बदला"
                >
                  <Edit className="w-3.5 h-3.5 text-amber-700" />
                  <span>माहिती बदला (Edit)</span>
                </button>
              </div>
              <p className="text-xs text-slate-500 font-bold mt-1">
                मोबाईल: {customer.mobile} | कार्यालय: {getOfficeNameMarathi(customer.officeId)}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-700">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">भिशी प्रकार</span>
              {getBishiNameMarathi(customer.bishiType)}
            </div>
            <div className="h-6 w-px bg-slate-300"></div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">पद्धत</span>
              {getModalityShort(customer.modality)} ({customer.modality})
            </div>
          </div>
        </div>

        {/* Financial Summary Grid - Requirement 11 */}
        <div className="mt-6">
          <h3 className="text-sm font-extrabold text-slate-900 mb-3 flex items-center space-x-2">
            <Wallet className="w-4 h-4 text-brand-700" />
            <span>आर्थिक माहिती</span>
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <span className="text-[11px] font-bold text-slate-500 block">एकूण भिशी रक्कम</span>
              <span className="text-base font-extrabold text-slate-900">
                {formatCurrency(financials.totalExpectedBishi)}
              </span>
            </div>

            <div className="bg-emerald-50 p-3.5 rounded-xl border border-emerald-200">
              <span className="text-[11px] font-bold text-emerald-800 block">आतापर्यंत जमा</span>
              <span className="text-base font-black text-emerald-700">
                {formatCurrency(financials.totalCollectedBishi)}
              </span>
            </div>

            <div className="bg-rose-50 p-3.5 rounded-xl border border-rose-200">
              <span className="text-[11px] font-bold text-rose-800 block">बाकी</span>
              <span className="text-base font-black text-rose-600">
                {formatCurrency(financials.totalRemainingBishi)}
              </span>
            </div>

            <div className="bg-blue-50 p-3.5 rounded-xl border border-blue-200">
              <span className="text-[11px] font-bold text-blue-800 block">एकूण व्याज</span>
              <span className="text-base font-extrabold text-blue-900">
                {formatCurrency(financials.totalInterest)}
              </span>
            </div>

            <div className="bg-amber-50 p-3.5 rounded-xl border border-amber-200">
              <span className="text-[11px] font-bold text-amber-800 block">एकूण दंड</span>
              <span className="text-base font-extrabold text-amber-900">
                {formatCurrency(financials.totalPenalty)}
              </span>
            </div>

            <div className="bg-brand-900 text-white p-3.5 rounded-xl shadow-xs">
              <span className="text-[11px] font-bold text-brand-200 block">एकूण देय रक्कम</span>
              <span className="text-base font-black text-white">
                {formatCurrency(financials.totalPayableBishi)}
              </span>
            </div>
          </div>
        </div>

        {/* Bishi Completion & Settlement Status Card */}
        {customer.bishiType !== 'LOAN_ONLY' && (
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className={`w-5 h-5 ${financials.isBishiCompleted ? 'text-emerald-600' : 'text-amber-500'}`} />
                <h4 className="text-sm font-extrabold text-slate-900">
                  भिशी समाप्ती व व्याज लाभांश परतावा (Bishi Final Settlement)
                </h4>
              </div>

              <span className={`px-3 py-1 rounded-full text-xs font-black ${
                financials.isBishiCompleted
                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                  : 'bg-amber-100 text-amber-900 border border-amber-300'
              }`}>
                {financials.isBishiCompleted
                  ? `🎉 सर्व ${financials.totalInstallmentsCount}/${financials.totalInstallmentsCount} हप्ते पूर्ण (Bishi Fully Completed)`
                  : `⏳ चालू भिशी (${financials.completedInstallmentsCount}/${financials.totalInstallmentsCount} हप्ते जमा)`}
              </span>
            </div>

            {financials.isBishiCompleted ? (
              <div className="mt-4 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <span className="text-[11px] font-bold text-emerald-800 block">एकूण जमा भिशी रक्कम</span>
                  <span className="text-lg font-black text-emerald-900">{formatCurrency(financials.totalCollectedBishi)}</span>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-emerald-800 block">अंतिम व्याज / लाभांश ({customer.interestRate}%)</span>
                  <span className="text-lg font-black text-emerald-700">+{formatCurrency(financials.finalBishiPayoutInterest)}</span>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-emerald-900 block">खातेदाराला मिळणारा एकूण अंतिम परतावा</span>
                  <span className="text-xl font-black text-emerald-900">{formatCurrency(financials.finalBishiTotalReturn)}</span>
                </div>
              </div>
            ) : (
              <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 font-semibold flex items-center justify-between">
                <span>
                  💡 सर्व <strong>{financials.totalInstallmentsCount} हप्ते</strong> ({customer.modality === 'W' ? `${financials.totalInstallmentsCount} आठवडे` : `${financials.totalInstallmentsCount} महिने`}) पूर्ण भरल्यावरच शेवटी अंतिम लाभांश व्याज परतावा जोडला जाईल.
                </span>
                <span className="font-extrabold text-amber-900 bg-amber-100 px-2 py-1 rounded shrink-0 ml-2">
                  बाकी: {financials.totalInstallmentsCount - financials.completedInstallmentsCount} हप्ते
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 52-Week or Monthly Collection Table - Requirements 13 & 14 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Calendar className="w-5 h-5 text-brand-700" />
            <h3 className="text-base font-extrabold text-slate-900">
              {customer.modality === 'W' ? 'साप्ताहिक भिशी जमा नोंदी' : 'मासिक भिशी जमा नोंदी'}
            </h3>
          </div>
          <div className="flex items-center space-x-3 no-print">
            <button
              onClick={() => setShowAllWeeks(!showAllWeeks)}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all flex items-center space-x-1.5"
            >
              {showAllWeeks ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{showAllWeeks ? 'चालू आठवडा पहा' : `सर्व ${customerCollections.length} आठवडे पहा`}</span>
            </button>
            <span className="text-xs font-bold px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full">
              दाखवले: {visibleCollections.length} / {customerCollections.length}
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
                  चालू तारखेचा हप्ता पूर्ण जमा झाला आहे!
                </span>
                <span className="text-emerald-700 text-xs sm:ml-2">
                  पुढील हप्ता तारीख: <strong className="font-black text-emerald-900">{formatDateMarathi(nextUpcomingEntry.dueDate)}</strong> ({nextUpcomingEntry.periodLabel})
                </span>
              </div>
            </div>
            <span className="text-[11px] font-extrabold px-3 py-1 rounded-full bg-emerald-200/80 text-emerald-900 shrink-0 w-fit">
              ✅ सर्व चालू हप्ते पूर्ण
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
                    ? getStatusTextMarathi('PAID')
                    : isPayableEntry(entry)
                    ? getStatusTextMarathi(entry.status)
                    : '⏳ आगामी'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-600">
                <div>
                  <span className="text-[10px] font-extrabold text-slate-400 block uppercase">
                    देय तारीख
                  </span>
                  <span className="text-slate-900 font-bold">
                    {formatDateMarathi(entry.paymentDate || entry.dueDate)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-extrabold text-slate-400 block uppercase">
                    अपेक्षित रक्कम
                  </span>
                  <span className="text-slate-900 font-extrabold">
                    {formatCurrency(entry.expectedAmount)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 font-bold block">जमा:</span>
                  <span className="font-black text-emerald-700">
                    {formatCurrency(entry.collectedAmount)}
                  </span>
                  {(entry.penaltyAmount || 0) > 0 && (
                    <div className="text-[10px] font-extrabold text-amber-800">
                      + दंड: {formatCurrency(entry.penaltyAmount)} (एकूण: {formatCurrency(entry.totalWithPenalty || ((entry.collectedAmount || 0) + (entry.penaltyAmount || 0)))})
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 font-bold block">बाकी:</span>
                  <span className="font-black text-rose-600">
                    {formatCurrency(entry.remainingAmount)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[11px] font-bold text-slate-700">
                  {entry.paymentMode === 'ONLINE' ? 'ऑनलाइन (UPI)' : entry.paymentMode === 'BANK' ? 'बँक' : 'नगद'}
                </span>

                <div className="flex items-center space-x-2">
                  {entry.status === 'PAID' ? (
                    <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-xs">
                      ✅ जमा
                    </span>
                  ) : isPayableEntry(entry) ? (
                    <button
                      onClick={() => openCollectModal(entry)}
                      className="px-3.5 py-2 min-h-[44px] rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs flex items-center space-x-1 shadow-xs cursor-pointer touch-target"
                    >
                      <Wallet className="w-3.5 h-3.5" />
                      <span>जमा करा</span>
                    </button>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 font-bold text-xs flex items-center space-x-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>आगामी ({formatDateMarathi(entry.dueDate)})</span>
                    </span>
                  )}
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
        <div className="hidden md:block print:block overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-50 text-slate-700 font-extrabold border-b border-slate-200">
              <tr>
                <th className="p-3.5 pl-5">
                  {customer.modality === 'W' ? 'आठवडा' : 'महिना'}
                </th>
                <th className="p-3.5">देय तारीख / जमा वेळ</th>
                <th className="p-3.5 text-right">अपेक्षित (₹)</th>
                <th className="p-3.5 text-right">जमा (₹)</th>
                <th className="p-3.5 text-right">बाकी (₹)</th>
                <th className="p-3.5 text-right">व्याज (₹)</th>
                <th className="p-3.5 text-right">दंड (₹)</th>
                <th className="p-3.5 text-center">पद्धत</th>
                <th className="p-3.5 text-center">स्थिती</th>
                <th className="p-3.5 text-center no-print">कृती</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {visibleCollections.map((entry) => (
                <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3.5 pl-5 font-bold text-slate-900">{entry.periodLabel}</td>
                  <td className="p-3.5 text-slate-600">
                    <div>{formatDateMarathi(entry.paymentDate || entry.dueDate)}</div>
                    {entry.paymentTime && (
                      <div className="text-[11px] font-bold text-slate-400 flex items-center space-x-1 mt-0.5">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{entry.paymentTime}</span>
                      </div>
                    )}
                  </td>
                  <td className="p-3.5 text-right font-bold text-slate-800">
                    {formatCurrency(entry.expectedAmount)}
                  </td>
                  <td className="p-3.5 text-right font-bold text-emerald-700">
                    <div>{formatCurrency(entry.collectedAmount)}</div>
                    {(entry.penaltyAmount || 0) > 0 && (
                      <div className="text-[10px] text-amber-800 font-extrabold whitespace-nowrap">
                        दंडासह: {formatCurrency(entry.totalWithPenalty || ((entry.collectedAmount || 0) + (entry.penaltyAmount || 0)))}
                      </div>
                    )}
                  </td>
                  <td className="p-3.5 text-right font-extrabold text-rose-600">
                    {formatCurrency(entry.remainingAmount)}
                  </td>
                  <td className="p-3.5 text-right text-slate-700">
                    {formatCurrency(entry.interestAmount)}
                  </td>
                  <td className="p-3.5 text-right font-bold text-rose-600">
                    {(entry.penaltyAmount || 0) > 0 ? (
                      <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-extrabold border border-rose-200">
                        {formatCurrency(entry.penaltyAmount)}
                      </span>
                    ) : (
                      <span className="text-slate-400 font-normal">₹0</span>
                    )}
                  </td>
                  <td className="p-3.5 text-center font-bold text-slate-700">
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[11px] font-bold">
                      {entry.paymentMode === 'ONLINE' ? 'ऑनलाइन (UPI)' : entry.paymentMode === 'BANK' ? 'बँक' : 'नगद'}
                    </span>
                  </td>
                  <td className="p-3.5 text-center">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                        entry.status === 'PAID'
                          ? getStatusBadgeClass('PAID')
                          : isPayableEntry(entry)
                          ? getStatusBadgeClass(entry.status)
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {entry.status === 'PAID'
                        ? getStatusTextMarathi('PAID')
                        : isPayableEntry(entry)
                        ? getStatusTextMarathi(entry.status)
                        : '⏳ आगामी'}
                    </span>
                  </td>
                  <td className="p-3.5 text-center no-print">
                    <div className="flex items-center justify-center space-x-1.5">
                      {entry.status === 'PAID' ? (
                        <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-[11px]">
                          ✅ जमा
                        </span>
                      ) : isPayableEntry(entry) ? (
                        <button
                          onClick={() => openCollectModal(entry)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold transition-colors text-xs flex items-center space-x-1 cursor-pointer shadow-2xs"
                        >
                          <Wallet className="w-3.5 h-3.5" />
                          <span>जमा करा</span>
                        </button>
                      ) : (
                        <span
                          className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 font-bold text-[11px] flex items-center space-x-1"
                          title={`पुढील हप्ता तारीख: ${formatDateMarathi(entry.dueDate)}`}
                        >
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>आगामी ({formatDateMarathi(entry.dueDate)})</span>
                        </span>
                      )}
                      {entry.collectedAmount > 0 && (
                        <button
                          onClick={() => setDeleteConfirmEntry(entry)}
                          className="p-1 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors"
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

      {/* LOAN SECTION - STRICTLY HIDDEN IF NO LOAN (Requirements 17 & 48) */}
      {(customer.hasLoan || customer.bishiType === 'LOAN_ONLY') && loan ? (
        <div className="bg-white rounded-2xl border border-amber-200 shadow-xs overflow-hidden">
          <div className="p-5 bg-amber-50/50 border-b border-amber-200 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Landmark className="w-5 h-5 text-amber-700" />
              <h3 className="text-base font-extrabold text-amber-900">कर्जाची माहिती</h3>
            </div>
            <button
              onClick={handleOpenLoanModal}
              className="px-4 py-2 rounded-xl bg-amber-700 text-white font-extrabold text-xs hover:bg-amber-800 transition-colors no-print"
            >
              + कर्ज जमा करा
            </button>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 sm:gap-4">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <span className="text-[11px] font-bold text-slate-500 block">कर्जाची रक्कम</span>
                <span className="text-base font-extrabold text-slate-900">
                  {formatCurrency(loan.principalAmount)}
                </span>
                {loanPrincipalRemaining < loan.principalAmount && (
                  <span className="text-[10px] font-bold text-amber-800 block mt-0.5">
                    (उर्वरित मुद्दल: {formatCurrency(loanPrincipalRemaining)})
                  </span>
                )}
              </div>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <span className="text-[11px] font-bold text-slate-500 block">व्याज दर</span>
                <span className="text-base font-extrabold text-slate-900">
                  {loan.interestRate}%
                </span>
                <span className="text-[10px] font-bold text-amber-800 block mt-0.5">
                  (मासिक: {formatCurrency(loanDueInterest)})
                </span>
              </div>

              <div className="bg-amber-50 p-3.5 rounded-xl border border-amber-200">
                <span className="text-[11px] font-bold text-amber-800 block">एकूण देय</span>
                <span className="text-base font-black text-amber-900">
                  {formatCurrency(loan.totalPayable)}
                </span>
              </div>

              <div className="bg-emerald-50 p-3.5 rounded-xl border border-emerald-200">
                <span className="text-[11px] font-bold text-emerald-800 block">भरलेली मुद्दल</span>
                <span className="text-base font-black text-emerald-700">
                  {formatCurrency(loan.paidAmount)}
                </span>
              </div>

              <div className="bg-amber-100/70 p-3.5 rounded-xl border border-amber-300">
                <span className="text-[11px] font-extrabold text-amber-950 block">भरलेले व्याज</span>
                <span className="text-base font-black text-amber-900">
                  {formatCurrency(totalInterestPaid)}
                </span>
              </div>

              {Boolean(loan.discountAmount && loan.discountAmount > 0) && (
                <div className="bg-emerald-100/70 p-3.5 rounded-xl border border-emerald-300">
                  <span className="text-[11px] font-extrabold text-emerald-900 block">दिलेली सूट (Discount)</span>
                  <span className="text-base font-black text-emerald-800">
                    {formatCurrency(loan.discountAmount || 0)}
                  </span>
                </div>
              )}

              <div className="bg-rose-50 p-3.5 rounded-xl border border-rose-200">
                <span className="text-[11px] font-bold text-rose-800 block">कर्जाची बाकी</span>
                <span className="text-base font-black text-rose-600">
                  {formatCurrency(loan.remainingAmount)}
                </span>
              </div>

              <div className="bg-slate-100 p-3.5 rounded-xl border border-slate-200 flex items-center justify-center">
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusBadgeClass(loan.status)}`}>
                  {loan.status === 'ACTIVE' ? 'कर्ज सुरू' : 'कर्ज पूर्ण बंद'}
                </span>
              </div>
            </div>

            {/* Loan Payment History Table */}
            {customerLoanPayments.length > 0 && (
              <div className="mt-6 border-t border-slate-100 pt-5">
                <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-3 flex items-center justify-between">
                  <span>कर्ज भरणा इतिहास (Loan Payment History)</span>
                  <span className="text-[11px] text-slate-500 font-bold">
                    एकूण नोंदी: {customerLoanPayments.length} | एकूण जमा व्याज: {formatCurrency(totalInterestPaid)}
                  </span>
                </h4>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-700 font-extrabold border-b border-slate-200">
                      <tr>
                        <th className="p-3 pl-4">दिनांक</th>
                        <th className="p-3 text-right">भरलेली मुद्दल</th>
                        <th className="p-3 text-right text-amber-900 font-black">भरलेले व्याज</th>
                        <th className="p-3 text-right">सूट (Discount)</th>
                        <th className="p-3 text-right">उर्वरित बाकी</th>
                        <th className="p-3">पद्धत</th>
                        <th className="p-3">तपशील / टीप</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                      {customerLoanPayments.map((lp) => (
                        <tr key={lp.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3 pl-4 font-bold text-slate-900">{formatDateMarathi(lp.paymentDate)}</td>
                          <td className="p-3 text-right font-black text-emerald-700">
                            {formatCurrency(lp.paidAmount)}
                          </td>
                          <td className="p-3 text-right font-black text-amber-800">
                            {formatCurrency(lp.interestPaid)}
                          </td>
                          <td className="p-3 text-right text-slate-600">
                            {lp.discountAmount ? formatCurrency(lp.discountAmount) : '-'}
                          </td>
                          <td className="p-3 text-right font-black text-rose-600">
                            {formatCurrency(lp.remainingLoan)}
                          </td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[11px] font-bold text-slate-700">
                              {lp.paymentMode === 'ONLINE' ? '📱 ऑनलाइन' : '💵 नगद'}
                            </span>
                          </td>
                          <td className="p-3 text-slate-500 text-[11px] font-medium">
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
      <div className="print-only mt-8 pt-6 border-t border-dashed border-slate-400 text-xs font-bold text-slate-600">
        <div className="flex justify-between items-end">
          <div>
            <p className="text-[10px] text-slate-500">• सदर अहवाल सुषांत भिशी व्यवस्थापन प्रणालीद्वारे संगणकीकृत तयार करण्यात आला आहे.</p>
            <p className="text-[10px] text-slate-500">• कोणतीही तफावत आढळल्यास त्वरित कार्यालयाशी संपर्क साधावा.</p>
          </div>
          <div className="flex gap-10 text-center">
            <div>
              <div className="h-10"></div>
              <div className="border-t border-slate-600 pt-1 min-w-32 text-slate-800 font-bold">खातेदार स्वाक्षरी</div>
            </div>
            <div>
              <div className="h-10"></div>
              <div className="border-t border-emerald-900 pt-1 min-w-36 text-emerald-950 font-black">अधिकृत स्वाक्षरी / शिक्का</div>
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
                  <span>भिशी हप्ता जमा नोंद ({selectedEntry.periodLabel})</span>
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  हप्ता देय तारीख: <strong className="text-emerald-800 font-extrabold">{formatDateMarathi(selectedEntry.dueDate)}</strong>
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
                <label className="block text-xs font-bold text-slate-700 mb-1">पद्धत (Payment Mode)</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMode('CASH')}
                    className={`py-2 px-2 rounded-xl text-xs font-extrabold transition-all border ${
                      paymentMode === 'CASH'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    💵 नगद (Cash)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMode('ONLINE')}
                    className={`py-2 px-2 rounded-xl text-xs font-extrabold transition-all border ${
                      paymentMode === 'ONLINE'
                        ? 'bg-brand-900 text-white border-brand-900 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    📱 ऑनलाइन (UPI)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMode('BANK')}
                    className={`py-2 px-2 rounded-xl text-xs font-extrabold transition-all border ${
                      paymentMode === 'BANK'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    🏛️ बँक
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">अपेक्षित रक्कम</label>
                  <input
                    type="number"
                    readOnly
                    value={selectedEntry.expectedAmount}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">जमा रक्कम (₹)</label>
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
                <label className="block text-xs font-bold text-slate-700 mb-1">दंड (₹)</label>
                <input
                  type="number"
                  value={penaltyInput}
                  onChange={(e) => setPenaltyInput(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-4 py-2 rounded-xl border border-rose-300 text-sm font-bold text-rose-800"
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 space-y-1.5">
                <div className="flex justify-between">
                  <span>उरलेली बाकी:</span>
                  <span className="text-rose-600 font-extrabold">
                    {formatCurrency(
                      Math.max(0, selectedEntry.expectedAmount - (Number(collectedInput) || 0))
                    )}
                  </span>
                </div>
                {(Number(penaltyInput) || 0) > 0 && (
                  <div className="flex justify-between pt-1.5 border-t border-slate-200 text-amber-900">
                    <span>दंड समावेश एकूण जमा:</span>
                    <span className="text-emerald-800 font-black">
                      {formatCurrency((Number(collectedInput) || 0) + (Number(penaltyInput) || 0))}
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
                रद्द करा
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-brand-900 text-white text-xs font-bold shadow-md hover:bg-brand-800 transition-colors cursor-pointer"
              >
                जतन करा
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
                <span>कर्ज जमा करा (Loan Repayment)</span>
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
                  भरणा पद्धत (Payment Mode) <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setLoanPaymentMode('CASH')}
                    className={`py-2 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center space-x-2 border transition-all ${
                      loanPaymentMode === 'CASH'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>💵 रोख (Cash)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLoanPaymentMode('ONLINE')}
                    className={`py-2 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center space-x-2 border transition-all ${
                      loanPaymentMode === 'ONLINE'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>📱 ऑनलाइन (Online)</span>
                  </button>
                </div>
              </div>

              {/* Option 1: Loan Interest (Calculated on Loan Amount) */}
              <div>
                <label className="block text-xs font-extrabold text-slate-900 mb-1">
                  १. कर्ज व्याज जमा (₹)
                  <span className="text-amber-700 ml-2 font-bold text-[11px]">
                    (चालू ऑटो व्याज: ₹{loanDueInterest})
                  </span>
                </label>
                <input
                  type="number"
                  min={0}
                  value={loanInterestPaymentInput}
                  onChange={(e) => setLoanInterestPaymentInput(e.target.value ? Number(e.target.value) : '')}
                  placeholder={`उदा. ${loanDueInterest}`}
                  className="w-full px-4 py-2.5 rounded-xl border border-amber-300 text-sm font-bold focus:ring-2 focus:ring-amber-500 bg-amber-50/20"
                />
              </div>

              {/* Option 2: Loan Principal Repayment */}
              <div>
                <label className="block text-xs font-extrabold text-slate-900 mb-1">
                  २. कर्ज मुद्दल जमा (₹)
                  <span className="text-slate-500 ml-2 font-normal text-[11px]">(मुद्दल भरल्याने बाकी कमी होते)</span>
                </label>
                <input
                  type="number"
                  min={0}
                  value={loanPaymentInput}
                  onChange={(e) => setLoanPaymentInput(e.target.value ? Number(e.target.value) : '')}
                  placeholder="उदा. 5000"
                  className="w-full px-4 py-2.5 rounded-xl border border-amber-300 text-sm font-bold focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Option 3: Loan Discount / Suit */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ३. कर्ज डिस्काउंट / सूट (Discount ₹)
                  <span className="text-emerald-700 ml-2 font-normal">(पर्यायी दिलेली सूट)</span>
                </label>
                <input
                  type="number"
                  min={0}
                  value={loanDiscountPaymentInput}
                  onChange={(e) => setLoanDiscountPaymentInput(e.target.value ? Number(e.target.value) : '')}
                  placeholder="उदा. 500"
                  className="w-full px-4 py-2.5 rounded-xl border border-emerald-400 text-sm font-bold focus:ring-2 focus:ring-emerald-500 text-emerald-900 bg-emerald-50/30"
                />
              </div>

              {/* Live Remaining Balance & Next Cycle Interest Calculation Preview */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs font-bold space-y-1.5">
                <div className="flex justify-between text-slate-600">
                  <span>चालू कर्जाची बाकी:</span>
                  <span>{formatCurrency(loan.remainingAmount)}</span>
                </div>
                {(Number(loanInterestPaymentInput) || 0) > 0 && (
                  <div className="flex justify-between text-amber-900 font-bold">
                    <span>भरलेले व्याज (Interest Paid):</span>
                    <span>₹{Number(loanInterestPaymentInput) || 0}</span>
                  </div>
                )}
                {((Number(loanPaymentInput) || 0) > 0 || (Number(loanDiscountPaymentInput) || 0) > 0) && (
                  <div className="flex justify-between text-emerald-700">
                    <span>जमा मुद्दल + डिस्काउंट:</span>
                    <span>₹{(Number(loanPaymentInput) || 0) + (Number(loanDiscountPaymentInput) || 0)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-1 border-t border-slate-200">
                  <span>नवीन कर्जाची उर्वरित बाकी:</span>
                  <span className="text-rose-600 font-extrabold">
                    {formatCurrency(Math.max(0, loanPrincipalRemaining - (Number(loanPaymentInput) || 0) - (Number(loanDiscountPaymentInput) || 0) + (loan.penaltyAmount || 0) + Math.max(0, loanDueInterest - (Number(loanInterestPaymentInput) || 0))))}
                  </span>
                </div>
                {Math.max(0, loanPrincipalRemaining - (Number(loanPaymentInput) || 0) - (Number(loanDiscountPaymentInput) || 0)) > 0 && (Number(loanPaymentInput) || 0) > 0 && (
                  <div className="flex justify-between text-blue-800 pt-1 border-t border-slate-200 text-[11px]">
                    <span>💡 मुद्दल परतीनंतर पुढील महिन्याचे ऑटो व्याज ({loan.interestRate}%):</span>
                    <span className="font-extrabold text-blue-900">
                      ₹{Math.round((Math.max(0, loanPrincipalRemaining - (Number(loanPaymentInput) || 0) - (Number(loanDiscountPaymentInput) || 0)) * loan.interestRate) / 100)}
                    </span>
                  </div>
                )}
                {Math.max(0, loan.remainingAmount - (Number(loanPaymentInput) || 0) - (Number(loanDiscountPaymentInput) || 0)) === 0 && (
                  <div className="text-center text-emerald-700 font-black text-xs pt-1 border-t border-emerald-200 mt-1">
                    🎉 कर्ज पूर्ण नील / बंद होईल (Loan Status: CLOSED)!
                  </div>
                )}
              </div>

              {/* Unpaid Interest Carry Forward Note */}
              {loanDueInterest > (Number(loanInterestPaymentInput) || 0) && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-900">
                  ⚠️ न भरलेले व्याज ₹{loanDueInterest - (Number(loanInterestPaymentInput) || 0)} थकबाकी दंडासह पुढील हप्त्यात जोडले जाईल.
                </div>
              )}
            </div>

            <div className="p-3.5 sm:px-6 sm:py-3.5 bg-slate-50 border-t border-slate-100 flex justify-end space-x-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsLoanModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-white transition-colors cursor-pointer shadow-2xs"
              >
                रद्द करा
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-amber-700 text-white text-xs font-bold shadow-md hover:bg-amber-800 transition-colors cursor-pointer"
              >
                कर्ज जमा करा
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
        title="जमा नोंद हटवा"
        message="तुम्हाला ही जमा नोंद नक्की हटवायची आहे का?"
        confirmText="हटवा"
        cancelText="रद्द करा"
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
