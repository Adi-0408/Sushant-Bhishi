import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { CollectionEntry, Customer } from '../../types';
import { StorageService } from '../../services/db';
import { SmsService } from '../../services/sms';
import { calculateCollectionEntry, getLoanRemainingPrincipal, calculateLoanDueInterest } from '../../utils/calculations';
import { formatCurrency, formatDateMarathi, getBishiNameMarathi, matchesCustomerSearch, toEnglishDigits } from '../../utils/formatters';
import { X, Wallet, CheckCircle2, AlertCircle, Phone, Calendar, Landmark, CreditCard } from 'lucide-react';
import { MarathiTextInput } from '../common/MarathiTextInput';
import { CustomDropdown } from '../common/CustomDropdown';
import { ModalPortal } from '../common/ModalPortal';

interface QuickCollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialCustomerId?: string;
  initialCollectionId?: string;
}

export const QuickCollectionModal: React.FC<QuickCollectionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialCustomerId,
  initialCollectionId,
}) => {
  const { customers, collections, loans, activeOffice, refreshData, showToast, t, language } = useApp();

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedEntryId, setSelectedEntryId] = useState<string>('');
  const [collectedInput, setCollectedInput] = useState<number | ''>('');
  const [penaltyInput, setPenaltyInput] = useState<number | ''>('');
  const [loanPrincipalInput, setLoanPrincipalInput] = useState<number | ''>('');
  const [loanInterestInput, setLoanInterestInput] = useState<number | ''>('');
  const [loanDiscountInput, setLoanDiscountInput] = useState<number | ''>('');
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'ONLINE'>('CASH');
  const [paymentDate, setPaymentDate] = useState<string>('');
  const [paymentTime, setPaymentTime] = useState<string>('');
  const [customerSearch, setCustomerSearch] = useState<string>('');
  const [successDeposit, setSuccessDeposit] = useState<{
    customerName: string;
    accountNumber: string;
    collectedAmount: number;
    penaltyAmount: number;
    remainingAmount: number;
    statusText: string;
  } | null>(null);

  const todayStr = new Date().toISOString().split('T')[0];
  const currentTimeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Helper to check customer payment status (only consider items due on or before today)
  const getCustomerStatusInfo = (custId: string) => {
    const custColl = collections.filter((item) => item.customerId === custId);
    const duePending = custColl.find((item) => item.status !== 'PAID' && item.dueDate <= todayStr);
    const nextUpcoming = custColl.find((item) => item.status !== 'PAID' && item.dueDate > todayStr);
    const isFullyPaid = !duePending;
    return { isFullyPaid, pendingEntry: duePending, nextUpcomingEntry: nextUpcoming, allEntries: custColl };
  };

  // State to filter only pending customers by default
  const [showOnlyPending, setShowOnlyPending] = useState<boolean>(true);

  // Active office customers
  const officeCustomers = customers.filter(
    (c) => (activeOffice === 'ALL' || c.officeId === activeOffice) && c.status === 'ACTIVE'
  );

  const isSearching = Boolean(customerSearch.trim());

  // Filtered customers (pending vs all + search)
  const displayedCustomers = (isSearching ? customers.filter((c) => c.status === 'ACTIVE') : officeCustomers).filter((c) => {
    // If user typed a search query, match account number, name, or mobile (supports Devanagari numerals)
    if (isSearching) {
      return matchesCustomerSearch(c, customerSearch);
    }
    if (showOnlyPending) {
      const { isFullyPaid } = getCustomerStatusInfo(c.id);
      if (isFullyPaid && c.bishiType !== 'LOAN_ONLY') {
        return false;
      }
    }
    return true;
  });

  // Auto-select when search query matches
  useEffect(() => {
    if (customerSearch.trim() && displayedCustomers.length > 0) {
      const qNum = toEnglishDigits(customerSearch.trim()).replace(/\D/g, '');
      // If numbers typed, look for exact account number match first
      const exactAcc = qNum
        ? displayedCustomers.find((c) => toEnglishDigits(String(c.accountNumber)).replace(/\D/g, '') === qNum)
        : undefined;
      const target = exactAcc || (displayedCustomers.length === 1 ? displayedCustomers[0] : undefined);
      if (target && target.id !== selectedCustomerId) {
        handleCustomerChange(target.id);
      }
    }
  }, [customerSearch, displayedCustomers]);

  // Selected customer object
  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  // Selected customer's status info
  const selectedCustomerStatus = selectedCustomerId ? getCustomerStatusInfo(selectedCustomerId) : null;

  // Selected collection entry object
  const selectedEntry = collections.find((item) => item.id === selectedEntryId);

  // Active loan for selected customer
  const activeLoan = selectedCustomerId
    ? StorageService.getLoanByCustomerId(selectedCustomerId) || loans.find((l) => l.customerId === selectedCustomerId && l.status === 'ACTIVE')
    : undefined;

  const isLoanOnly = selectedCustomer?.bishiType === 'LOAN_ONLY';
  const hasActiveLoan = Boolean(selectedCustomer?.hasLoan || activeLoan || isLoanOnly);

  const loanPrinRemaining = activeLoan ? getLoanRemainingPrincipal(activeLoan) : 0;
  const dueInterest = activeLoan ? calculateLoanDueInterest(activeLoan) : 0;
  const loanInterestPaidVal = Number(loanInterestInput) || 0;
  const unpaidInterest = activeLoan && dueInterest > loanInterestPaidVal ? dueInterest - loanInterestPaidVal : 0;

  // Reset and auto-select logic when modal opens
  useEffect(() => {
    if (isOpen) {
      setCustomerSearch('');
      setSuccessDeposit(null);

      // Check if initialCustomerId is valid
      let defaultCustId = '';
      if (initialCustomerId) {
        const { isFullyPaid } = getCustomerStatusInfo(initialCustomerId);
        if (!isFullyPaid || initialCollectionId) {
          defaultCustId = initialCustomerId;
        }
      }

      // Find first pending customer
      if (!defaultCustId) {
        const pendingCust = officeCustomers.find((c) => {
          if (c.bishiType === 'LOAN_ONLY') return true;
          const { isFullyPaid } = getCustomerStatusInfo(c.id);
          return !isFullyPaid;
        });
        defaultCustId = pendingCust ? pendingCust.id : '';
      }

      if (defaultCustId) {
        handleCustomerChange(defaultCustId);
      } else {
        setSelectedCustomerId('');
        setSelectedEntryId('');
        setCollectedInput('');
        setPenaltyInput('');
        setLoanPrincipalInput('');
        setLoanInterestInput('');
        setLoanDiscountInput('');
        setPaymentMode('CASH');
      }
    }
  }, [isOpen, initialCustomerId, initialCollectionId]);

  // When customer selection changes
  const handleCustomerChange = (customerId: string) => {
    setSelectedCustomerId(customerId);
    setPenaltyInput('');
    setLoanPrincipalInput('');
    setLoanInterestInput('');
    setLoanDiscountInput('');
    setPaymentMode('CASH');

    if (!customerId) {
      setSelectedEntryId('');
      setCollectedInput('');
      setPenaltyInput('');
      return;
    }

    const cust = customers.find((c) => c.id === customerId);
    const loanObj = StorageService.getLoanByCustomerId(customerId) || loans.find((l) => l.customerId === customerId && l.status === 'ACTIVE');

    if (loanObj) {
      const calcInterest = calculateLoanDueInterest(loanObj);
      setLoanInterestInput(calcInterest);
    }

    if (cust?.bishiType === 'LOAN_ONLY') {
      setSelectedEntryId('');
      setCollectedInput(0);
      setPenaltyInput('');
      return;
    }

    const { isFullyPaid, pendingEntry, allEntries } = getCustomerStatusInfo(customerId);
    
    // If a specific collection ID was passed, prefer that entry
    const specificEntry = initialCollectionId ? allEntries.find((c) => c.id === initialCollectionId) : undefined;
    const targetEntry = specificEntry || pendingEntry;

    if (!targetEntry || (isFullyPaid && !specificEntry)) {
      setSelectedEntryId('');
      setCollectedInput('');
      setPenaltyInput('');
      setPaymentDate(todayStr);
      setPaymentTime(currentTimeStr);
    } else {
      setSelectedEntryId(targetEntry.id);
      setCollectedInput(targetEntry.remainingAmount > 0 ? targetEntry.remainingAmount : targetEntry.expectedAmount);
      setPenaltyInput('');
      // The payment is made today (actual transaction date)
      setPaymentDate(todayStr);
      setPaymentTime(currentTimeStr);
    }
  };

  // Calculate live preview totals
  const bishiVal = isLoanOnly ? 0 : (Number(collectedInput) || 0);
  const bishiPenaltyVal = isLoanOnly ? 0 : (Number(penaltyInput) || 0);
  const loanPrinVal = Number(loanPrincipalInput) || 0;
  const totalDepositVal = bishiVal + bishiPenaltyVal + loanPrinVal + loanInterestPaidVal;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCustomer) {
      showToast(language === 'EN' ? 'Please select a customer.' : 'कृपया खातेदार निवडा.', 'error');
      return;
    }

    if (totalDepositVal <= 0) {
      showToast(language === 'EN' ? 'Please enter a valid deposit or loan payment amount.' : 'कृपया जमा करण्यासाठी योग्य रक्कम भरा.', 'error');
      return;
    }

    const effectiveDate = paymentDate || todayStr;
    const effectiveTime = paymentTime || currentTimeStr;

    let bishiSuccess = false;
    let bishiRemaining = 0;
    let bishiStatus = '';

    // 1. Record Bishi Collection Deposit
    if (!isLoanOnly && selectedEntry && (bishiVal > 0 || bishiPenaltyVal > 0)) {
      const calc = calculateCollectionEntry(
        selectedEntry.expectedAmount,
        bishiVal,
        selectedCustomer.interestRate,
        bishiPenaltyVal,
        selectedEntry.collectedAmount || 0
      );

      const totalWithPen = calc.collectedAmount + bishiPenaltyVal;

      StorageService.updateCollectionEntry(selectedEntry.id, {
        paymentDate: effectiveDate,
        paymentTime: effectiveTime,
        paymentMode: paymentMode,
        collectedAmount: calc.collectedAmount,
        remainingAmount: calc.remainingAmount,
        interestAmount: calc.interestAmount,
        penaltyAmount: bishiPenaltyVal,
        totalPaid: totalWithPen,
        totalWithPenalty: totalWithPen,
        status: calc.status,
        note: `पद्धत: ${paymentMode === 'ONLINE' ? 'ऑनलाइन' : 'रोख'}${bishiPenaltyVal > 0 ? ` [दंड/लेट फी ₹${bishiPenaltyVal}]` : ''}`,
      });

      bishiSuccess = true;
      bishiRemaining = calc.remainingAmount;
      bishiStatus = calc.status === 'PAID' ? `✅ ${t.statusPaid}` : `⚠️ ${t.statusPartial}`;

      SmsService.sendSms(selectedCustomer, 'COLLECTION', {
        amount: totalWithPen,
        remaining: calc.remainingAmount,
      });
    }

    // 2. Record Loan & Interest Payment (if customer has active loan and amounts entered)
    const loanDiscVal = Number(loanDiscountInput) || 0;
    if (activeLoan && (loanPrinVal > 0 || loanInterestPaidVal > 0 || loanDiscVal > 0)) {
      const calcDueInterest = calculateLoanDueInterest(activeLoan);
      const unpaidInt = Math.max(0, calcDueInterest - loanInterestPaidVal);
      const remainingPrincipal = Math.max(0, (activeLoan.principalAmount || 0) - (activeLoan.paidAmount || 0) - loanPrinVal - loanDiscVal);
      const remLoan = Math.max(0, remainingPrincipal + (activeLoan.penaltyAmount || 0) + unpaidInt);

      StorageService.addLoanPayment({
        loanId: activeLoan.id,
        customerId: selectedCustomer.id,
        paymentDate: effectiveDate,
        paidAmount: loanPrinVal,
        interestPaid: loanInterestPaidVal,
        penaltyPaid: unpaidInt, // Unpaid interest carried forward as penalty for next cycle
        discountAmount: loanDiscVal,
        remainingLoan: remLoan,
        paymentMode: paymentMode,
        note: `कर्ज भरणा (${paymentMode === 'ONLINE' ? 'ऑनलाइन' : 'रोख'})${loanDiscVal > 0 ? ` [डिस्काउंट/सूट ₹${loanDiscVal}]` : ''}${unpaidInt > 0 ? ` [थकबाकी व्याज ₹${unpaidInt} पुढील हप्त्यात वर्ग]` : ''}`,
      });

      SmsService.sendSms(selectedCustomer, 'LOAN_BALANCE', {
        loanBalance: remLoan,
      });
    }

    showToast(
      language === 'EN'
        ? `✅ ₹${totalDepositVal} payment recorded (${paymentMode === 'ONLINE' ? 'Online' : 'Cash'})!`
        : `✅ ₹${totalDepositVal} जमा नोंद यशस्वी झाली (${paymentMode === 'ONLINE' ? 'ऑनलाइन' : 'रोख'})!`,
      'success'
    );
    refreshData();

    setSuccessDeposit({
      customerName: selectedCustomer.name,
      accountNumber: selectedCustomer.accountNumber,
      collectedAmount: totalDepositVal,
      penaltyAmount: bishiPenaltyVal,
      remainingAmount: isLoanOnly && activeLoan
        ? Math.max(0, activeLoan.remainingAmount - loanPrinVal)
        : bishiRemaining,
      statusText: isLoanOnly ? '✅ कर्ज जमा नोंद' : (bishiStatus || '✅ जमा नोंद'),
    });
  };

  if (!isOpen) return null;

  if (successDeposit) {
    return (
      <ModalPortal>
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs no-print overflow-hidden">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl text-center animate-in fade-in zoom-in duration-150 my-auto max-h-[90vh] overflow-y-auto">
          <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
            <CheckCircle2 className="w-12 h-12 stroke-[2.5]" />
          </div>

          <h2 className="text-2xl font-black text-slate-900 mb-1">
            {language === 'EN' ? '✅ Deposit Recorded!' : '✅ जमा नोंद यशस्वी झाली!'}
          </h2>
          <p className="text-xs text-slate-500 font-medium mb-6">
            {language === 'EN' ? 'Deposit entry has been saved.' : 'खातेदाराची जमा नोंद यशस्वीरित्या जतन झाली आहे.'}
          </p>

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-left space-y-2 mb-6">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 font-medium">{t.colCustomerName}:</span>
              <span className="font-bold text-slate-900">{successDeposit.customerName}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 font-medium">{t.colAccountNo}:</span>
              <span className="font-extrabold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                {successDeposit.accountNumber}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 font-medium">एकूण जमा रक्कम:</span>
              <span className="font-black text-emerald-700 text-base">₹{successDeposit.collectedAmount} ({paymentMode === 'ONLINE' ? 'ऑनलाइन' : 'रोख'})</span>
            </div>
            {successDeposit.penaltyAmount > 0 && (
              <div className="flex justify-between items-center text-xs text-rose-700 font-bold bg-rose-50/70 px-2.5 py-1 rounded-lg border border-rose-200">
                <span>समाविष्ट दंड (Penalty):</span>
                <span className="font-extrabold">+₹{successDeposit.penaltyAmount}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 font-medium">{t.colRemainingAmount}:</span>
              <span className="font-extrabold text-amber-700">₹{successDeposit.remainingAmount}</span>
            </div>
            <div className="flex justify-between items-center text-sm pt-1 border-t border-slate-200">
              <span className="text-slate-500 font-medium">{t.colStatus}:</span>
              <span className="font-black text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                {successDeposit.statusText}
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => {
                setSuccessDeposit(null);
                setCustomerSearch('');
                const remainingPending = officeCustomers.find((c) => {
                  if (c.bishiType === 'LOAN_ONLY') return true;
                  const { isFullyPaid } = getCustomerStatusInfo(c.id);
                  return !isFullyPaid;
                });
                if (remainingPending) {
                  handleCustomerChange(remainingPending.id);
                } else {
                  setSelectedCustomerId('');
                  setSelectedEntryId('');
                  setCollectedInput('');
                  setPenaltyInput('');
                  setLoanPrincipalInput('');
                  setLoanInterestInput('');
                }
              }}
              className="flex-1 py-3 px-4 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs hover:bg-slate-200 transition-colors"
            >
              {language === 'EN' ? 'Record Another' : 'आणखी जमा करा'}
            </button>
            <button
              onClick={() => {
                setSuccessDeposit(null);
                if (onSuccess) onSuccess();
                onClose();
              }}
              className="flex-1 py-3 px-4 rounded-xl bg-emerald-700 text-white font-extrabold text-xs hover:bg-emerald-800 transition-colors shadow-md"
            >
              {language === 'EN' ? 'OK' : 'ठीक आहे (OK)'}
            </button>
          </div>
        </div>
      </div>
      </ModalPortal>
    );
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-hidden no-print">
        <div className="bg-white rounded-2xl sm:rounded-3xl max-w-md w-full my-auto max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-800 shadow-xs shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">{t.modalDepositTitle}</h3>
              <p className="text-xs text-slate-500 font-medium">
                {language === 'EN' ? 'Select customer and record deposit' : 'खातेदार निवडून थेट जमा नोंदवा'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 sm:w-10 sm:h-10 min-w-[36px] min-h-[36px] rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {/* Customer Selection Dropdown */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-slate-700">
                {t.modalSelectCustomer} <span className="text-rose-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => setShowOnlyPending(!showOnlyPending)}
                className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 underline"
              >
                {showOnlyPending ? (language === 'EN' ? 'Show All Customers' : 'सर्व खातेदार दाखवा') : (language === 'EN' ? 'Show Pending Only' : 'फक्त बाकी असलेले दाखवा')}
              </button>
            </div>

            {officeCustomers.length > 0 && (
              <div className="mb-2">
                <MarathiTextInput
                  value={customerSearch}
                  onChange={(val) => setCustomerSearch(val)}
                  placeholder={language === 'EN' ? 'Search Acc No, Name or Mobile (e.g. 101 / Suraj)...' : 'खाते क्र, नाव किंवा मोबाईल शोधा (उदा. 101 / सुरज)...'}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E4EAE7] hover:border-[#0F7A5C]/60 text-xs sm:text-sm font-bold text-slate-900 bg-[#F4F6F5]/50 focus:ring-2 focus:ring-[#0F7A5C] focus:border-[#0F7A5C] transition-all"
                />
              </div>
            )}

            <CustomDropdown<string>
              value={selectedCustomerId}
              onChange={(val) => handleCustomerChange(val)}
              options={displayedCustomers.map((c) => ({
                value: c.id,
                label: `#${c.accountNumber} - ${c.name}`,
                subLabel: c.bishiType === 'LOAN_ONLY' ? (language === 'EN' ? 'Loan Only' : 'फक्त कर्जदार') : `${getBishiNameMarathi(c.bishiType, language)} - ₹${c.amount}`,
                badge: c.bishiType === 'LOAN_ONLY' ? (language === 'EN' ? 'Loan' : 'कर्ज') : undefined,
              }))}
              placeholder={
                displayedCustomers.length === 0
                  ? (language === 'EN' ? '-- All Customers Paid --' : '-- सर्व खातेदारांचे हप्ते भरलेले आहेत (All Paid) --')
                  : (language === 'EN' ? '-- Select Customer --' : '-- खातेदार निवडा (Select Customer) --')}
              size="lg"
            />
          </div>

          {/* Payment Mode Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {language === 'EN' ? 'Payment Mode' : 'भरणा पद्धत (Payment Mode)'} <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMode('CASH')}
                className={`py-2.5 px-3 min-h-[44px] rounded-xl text-xs font-extrabold flex items-center justify-center space-x-2 border transition-all touch-target cursor-pointer ${
                  paymentMode === 'CASH'
                    ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span>💵 {language === 'EN' ? 'Cash' : 'रोख (Cash)'}</span>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMode('ONLINE')}
                className={`py-2.5 px-3 min-h-[44px] rounded-xl text-xs font-extrabold flex items-center justify-center space-x-2 border transition-all touch-target cursor-pointer ${
                  paymentMode === 'ONLINE'
                    ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span>📱 {language === 'EN' ? 'Online (UPI)' : 'ऑनलाइन (Online)'}</span>
              </button>
            </div>
          </div>



          {/* Selected Customer details summary in Cards */}
          {selectedCustomer && (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {/* Card 1: Mobile */}
                <div className="bg-[#F4F6F5] p-2.5 sm:p-3 rounded-2xl border border-[#E4EAE7] flex flex-col items-center justify-center text-center shadow-2xs">
                  <div className="flex items-center space-x-1 text-[10px] font-extrabold text-[#5F6E68] uppercase tracking-wider mb-0.5">
                    <Phone className="w-3 h-3 text-[#0F7A5C]" />
                    <span>{t.colMobile}</span>
                  </div>
                  <span className="text-xs font-black text-[#10241E] truncate w-full">{selectedCustomer.mobile}</span>
                </div>

                {/* Card 2: Due Date */}
                <div className="bg-[#F4F6F5] p-2.5 sm:p-3 rounded-2xl border border-[#E4EAE7] flex flex-col items-center justify-center text-center shadow-2xs">
                  <div className="flex items-center space-x-1 text-[10px] font-extrabold text-[#5F6E68] uppercase tracking-wider mb-0.5">
                    <Calendar className="w-3 h-3 text-[#0F7A5C]" />
                    <span>{t.colDueDate}</span>
                  </div>
                  <span className="text-xs font-black text-[#0B5C45] truncate w-full">
                    {selectedEntry ? formatDateMarathi(selectedEntry.dueDate, language) : '-'}
                  </span>
                </div>

                {/* Card 3: Regular Installment */}
                <div className="bg-[#F4F6F5] p-2.5 sm:p-3 rounded-2xl border border-[#E4EAE7] flex flex-col items-center justify-center text-center shadow-2xs">
                  <div className="flex items-center space-x-1 text-[10px] font-extrabold text-[#5F6E68] uppercase tracking-wider mb-0.5">
                    <Wallet className="w-3 h-3 text-[#0F7A5C]" />
                    <span>{t.colInstallmentAmount}</span>
                  </div>
                  <span className="text-xs sm:text-sm font-black text-[#0F7A5C] truncate w-full">
                    {isLoanOnly ? '₹0 (कर्ज खाते)' : `₹${selectedCustomer.amount}`}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Deposit Breakdown Section - 3 Clear Options */}
          <div className="space-y-3 bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center justify-between border-b border-slate-200 pb-2">
              <span>जमा रक्कम पर्याय (Deposit Options)</span>
              {hasActiveLoan && (
                <span className="text-[11px] font-extrabold text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                  बाकी कर्ज: ₹{activeLoan?.remainingAmount}
                </span>
              )}
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Option 1: Bishi Installment (if not loan only) */}
              {!isLoanOnly && (
                <div className="sm:col-span-2">
                  {selectedCustomerStatus?.isFullyPaid ? (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
                      <p className="text-xs font-black text-emerald-800 flex items-center justify-center space-x-1">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 inline mr-1" />
                        <span>चालू तारखेचा हप्ता पूर्ण भरलेला आहे!</span>
                      </p>
                      {selectedCustomerStatus?.nextUpcomingEntry ? (
                        <p className="text-[11px] text-emerald-700 mt-1 font-medium">
                          ⏳ पुढील हप्ता तारीख: <strong className="font-extrabold">{formatDateMarathi(selectedCustomerStatus.nextUpcomingEntry.dueDate, language)}</strong> रोजी आहे. (त्या तारखेलाच जमा पर्याय सुरू होईल)
                        </p>
                      ) : (
                        <p className="text-[11px] text-emerald-700 mt-1 font-medium">
                          या भिशीचे सर्व हप्ते पूर्ण जमा झाले आहेत.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="block text-xs font-extrabold text-emerald-900">
                              १. भिशी हप्ता जमा (₹) <span className="text-emerald-700 font-normal text-[10px]">(नियमित हप्ता)</span>
                            </label>
                            <span className="text-[10px] font-bold text-slate-500">
                              अपेक्षित: ₹{selectedCustomerStatus?.pendingEntry?.remainingAmount || selectedCustomer?.amount}
                            </span>
                          </div>
                          <input
                            type="number"
                            min={0}
                            value={collectedInput}
                            onChange={(e) => setCollectedInput(e.target.value ? Number(e.target.value) : '')}
                            placeholder="उदा. 500"
                            className="w-full px-3.5 py-2 rounded-xl border border-emerald-400 text-sm font-black text-emerald-900 bg-white focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="block text-xs font-extrabold text-rose-900">
                              लेट फी / दंड (Penalty ₹) <span className="text-rose-700 font-normal text-[10px]">(उशिरा भरल्यास)</span>
                            </label>
                          </div>
                          <input
                            type="number"
                            min={0}
                            value={penaltyInput}
                            onChange={(e) => setPenaltyInput(e.target.value ? Number(e.target.value) : '')}
                            placeholder="उदा. 50"
                            className="w-full px-3.5 py-2 rounded-xl border border-rose-300 text-sm font-black text-rose-900 bg-rose-50/40 focus:ring-2 focus:ring-rose-500"
                          />
                        </div>
                      </div>

                      {bishiPenaltyVal > 0 && (
                        <div className="text-[11px] font-bold text-rose-800 bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-200 flex justify-between items-center">
                          <span>हप्ता: ₹{bishiVal} + दंड: ₹{bishiPenaltyVal}</span>
                          <span className="font-extrabold">दंडासह भिशी जमा: ₹{bishiVal + bishiPenaltyVal}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Loan Section: Option 2 (Interest - Calculated First) & Option 3 (Principal) */}
              {hasActiveLoan && activeLoan && (
                <>
                  {/* Option 2: Loan Interest (Calculated First) */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-[11px] font-extrabold text-amber-950">
                        २. कर्ज व्याज जमा (₹)
                      </label>
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-200">
                        ऑटो {activeLoan.interestRate}%
                      </span>
                    </div>
                    <input
                      type="number"
                      min={0}
                      value={loanInterestInput}
                      onChange={(e) => setLoanInterestInput(e.target.value ? Number(e.target.value) : '')}
                      placeholder={`उदा. ${dueInterest}`}
                      className="w-full px-3 py-2 rounded-xl border border-amber-400 text-xs font-black text-amber-950 focus:ring-2 focus:ring-amber-500 bg-amber-50/30"
                    />
                    <span className="text-[10px] font-semibold text-slate-500 block mt-0.5">
                      (ऑटो कॅल्क्युलेट व्याज: ₹{dueInterest})
                    </span>
                  </div>

                  {/* Option 3: Loan Principal Repayment */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-[11px] font-extrabold text-amber-950">
                        ३. कर्ज मुद्दल जमा (₹)
                      </label>
                    </div>
                    <input
                      type="number"
                      min={0}
                      value={loanPrincipalInput}
                      onChange={(e) => setLoanPrincipalInput(e.target.value ? Number(e.target.value) : '')}
                      placeholder="उदा. 2000"
                      className="w-full px-3 py-2 rounded-xl border border-amber-400 text-xs font-black text-amber-950 focus:ring-2 focus:ring-amber-500 bg-white"
                    />
                    <span className="text-[10px] font-semibold text-slate-500 block mt-0.5">
                      (मुद्दल भरल्यास बाकी कर्ज कमी होते)
                    </span>
                  </div>

                  {/* Option 4: Loan Discount / Suit (Optional) */}
                  <div className="sm:col-span-2 pt-1 border-t border-slate-200/80">
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] font-extrabold text-emerald-900">
                        ४. कर्ज डिस्काउंट / सूट (Discount ₹) <span className="text-emerald-700 font-normal text-[10px]">(पर्यायी / जर सूट द्यायची असल्यास)</span>
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={loanDiscountInput}
                        onChange={(e) => setLoanDiscountInput(e.target.value ? Number(e.target.value) : '')}
                        placeholder="उदा. 300"
                        className="w-48 px-3 py-1.5 rounded-xl border border-emerald-400 text-xs font-bold text-emerald-950 focus:ring-2 focus:ring-emerald-500 bg-emerald-50/40 text-right"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Interest calculation and penalty note */}
            {hasActiveLoan && activeLoan && (
              <div className="text-[11px] font-semibold text-amber-900 bg-amber-100/80 p-2.5 rounded-xl border border-amber-200 space-y-1 mt-2">
                <div className="flex justify-between items-center">
                  <span>चालू महिन्याचे व्याज ({activeLoan.interestRate}%): <strong className="text-amber-950 font-black">₹{dueInterest}</strong></span>
                  {unpaidInterest > 0 && (
                    <span className="text-rose-700 font-extrabold">
                      ⚠️ थकबाकी व्याज ₹{unpaidInterest} दंडासह वर्ग होईल
                    </span>
                  )}
                </div>
                {loanPrinVal > 0 && (
                  <div className="flex justify-between items-center pt-1 border-t border-amber-200/80 text-blue-900 font-bold">
                    <span>💡 मुद्दल परतीनंतर पुढील महिन्याचे ऑटो व्याज:</span>
                    <span className="font-black text-blue-950">
                      ₹{Math.round((Math.max(0, loanPrinRemaining - loanPrinVal - (Number(loanDiscountInput) || 0)) * activeLoan.interestRate) / 100)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Live Summary Box (Total Collected) */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
            <div className="flex justify-between items-center text-xs font-bold text-slate-700">
              <span>{t.modalTotalCollected}:</span>
              <span className="text-emerald-800 font-black text-base">₹{totalDepositVal}</span>
            </div>
            {bishiPenaltyVal > 0 && (
              <div className="flex justify-between items-center text-[11px] font-bold text-rose-700 pt-1 border-t border-slate-200">
                <span>समाविष्ट लेट दंड (Penalty Included):</span>
                <span>+₹{bishiPenaltyVal}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-[11px] text-slate-500 font-medium">
              <span>भरणा पद्धत:</span>
              <span className="font-bold text-slate-800">{paymentMode === 'ONLINE' ? '📱 ऑनलाइन (UPI)' : '💵 रोख (Cash)'}</span>
            </div>
          </div>

          </div>

          {/* Buttons Footer - Fixed at bottom */}
          <div className="p-3.5 sm:px-5 sm:py-3.5 bg-slate-50 border-t border-slate-100 flex space-x-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="w-1/3 py-3 min-h-[44px] rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs transition-colors cursor-pointer flex items-center justify-center shadow-2xs"
            >
              {t.btnCancel}
            </button>
            <button
              type="submit"
              disabled={!selectedCustomerId || totalDepositVal <= 0}
              className={`w-2/3 py-3 min-h-[44px] rounded-xl font-extrabold text-xs transition-colors shadow-md flex items-center justify-center space-x-2 cursor-pointer ${
                !selectedCustomerId || totalDepositVal <= 0
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
                  : 'bg-emerald-700 hover:bg-emerald-800 text-white'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{t.btnCollect}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
    </ModalPortal>
  );
};
