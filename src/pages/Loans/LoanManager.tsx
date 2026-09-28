import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { formatCurrency, formatDateMarathi, getBishiNameMarathi, matchesCustomerSearch } from '../../utils/formatters';
import { StorageService } from '../../services/db';
import { Landmark, Search, Plus, Wallet, ArrowUpRight, X, UserPlus, Edit3, Save, Calendar, Clock, RefreshCw, Calculator, AlertCircle, CheckCircle2 } from 'lucide-react';
import { MarathiTextInput } from '../../components/common/MarathiTextInput';
import { CustomDropdown } from '../../components/common/CustomDropdown';
import { Link } from 'react-router-dom';
import { CustomerFormModal } from '../Customers/CustomerFormModal';
import { ModalPortal } from '../../components/common/ModalPortal';
import { Loan } from '../../types';
import { calculateElapsedMonths } from '../../utils/calculations';

export const LoanManager: React.FC = () => {
  const { loans, loanPayments, customers, activeOffice, refreshData, showToast, t, language, isRefreshing, refreshAllData } = useApp();

  const [searchTerm, setSearchTerm] = useState('');

  // New Loan Modal state
  const [isAddLoanModalOpen, setIsAddLoanModalOpen] = useState(false);
  const [isAddCustomerModalOpen, setIsAddCustomerModalOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [principalInput, setPrincipalInput] = useState<number | ''>('');
  const [interestRateInput, setInterestRateInput] = useState<number | ''>(12);
  const [issueDateInput, setIssueDateInput] = useState(new Date().toISOString().split('T')[0]);
  const [purposeInput, setPurposeInput] = useState('');
  // Previous loan options & fields
  const [hasPreviousLoan, setHasPreviousLoan] = useState(false);
  const [previousLoanAmount, setPreviousLoanAmount] = useState<number | ''>('');
  const [previousSubmittedAmount, setPreviousSubmittedAmount] = useState<number | ''>('');
  const [previousInterestAmount, setPreviousInterestAmount] = useState<number | ''>('');
  const [isManualPrevInterest, setIsManualPrevInterest] = useState(false);

  // Edit Loan Modal state
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [editPrincipal, setEditPrincipal] = useState<number | ''>('');
  const [editRate, setEditRate] = useState<number | ''>(12);
  const [editIssueDate, setEditIssueDate] = useState('');
  const [editPurpose, setEditPurpose] = useState('');
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'COMPLETED'>('ACTIVE');

  const startEditLoan = (l: Loan) => {
    setEditingLoan(l);
    setEditPrincipal(l.principalAmount);
    setEditRate(l.interestRate);
    setEditIssueDate(l.issueDate);
    setEditPurpose(l.purposeNote || '');
    setEditStatus(l.status === 'ACTIVE' ? 'ACTIVE' : 'COMPLETED');
  };

  const handleUpdateLoan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLoan) return;

    const principal = Number(editPrincipal) || editingLoan.principalAmount;
    const rate = Number(editRate) || editingLoan.interestRate;
    const issueDate = editIssueDate || editingLoan.issueDate;
    const months = calculateElapsedMonths(issueDate);
    const monthlyInterest = Math.round((principal * rate) / 100);
    const totalInterest = Math.max(monthlyInterest, months * monthlyInterest);
    const paid = Number(editingLoan.paidAmount) || 0;
    const discount = Number(editingLoan.discountAmount) || 0;
    const penalty = Number(editingLoan.penaltyAmount) || 0;
    const paidInterest = Number(editingLoan.totalInterestPaid) || 0;
    const remainingPrincipal = Math.max(0, principal - paid - discount);
    const dueInterest = Math.max(0, totalInterest - paidInterest);
    const remainingAmount = remainingPrincipal + penalty + dueInterest;
    const totalPayable = principal + totalInterest;

    StorageService.saveLoan({
      ...editingLoan,
      principalAmount: principal,
      interestRate: rate,
      totalInterest,
      totalPayable,
      remainingAmount,
      issueDate,
      purposeNote: editPurpose.trim() || undefined,
      status: editStatus,
    });

    showToast(language === 'EN' ? 'Loan updated successfully.' : 'कर्ज माहिती यशस्वीपणे अपडेट झाली.', 'success');
    refreshData();
    setEditingLoan(null);
  };

  const officeCustomerIds = new Set(
    customers
      .filter((c) => (activeOffice === 'ALL' || c.officeId === activeOffice) && (c.hasLoan || c.bishiType === 'LOAN_ONLY' || loans.some((l) => l.customerId === c.id || (c.accountNumber && l.accountNumber === c.accountNumber))))
      .map((c) => c.id)
  );

  const isSearching = Boolean(searchTerm.trim());

  const filteredLoans = loans.filter((l) => {
    const cust = customers.find((c) => c.id === l.customerId || (l.accountNumber && c.accountNumber === l.accountNumber));
    if (!cust) return false;
    if (!isSearching && !officeCustomerIds.has(cust.id)) return false;
    if (isSearching) {
      const purposeMatch = Boolean(l.purposeNote && l.purposeNote.toLowerCase().includes(searchTerm.trim().toLowerCase()));
      return matchesCustomerSearch(cust, searchTerm, l.accountNumber) || purposeMatch;
    }
    return true;
  });

  const resetAddLoanModal = () => {
    setIsAddLoanModalOpen(false);
    setSelectedCustomerId('');
    setPrincipalInput('');
    setInterestRateInput(12);
    setIssueDateInput(new Date().toISOString().split('T')[0]);
    setPurposeInput('');
    setHasPreviousLoan(false);
    setPreviousLoanAmount('');
    setPreviousSubmittedAmount('');
    setPreviousInterestAmount('');
    setIsManualPrevInterest(false);
  };

  const handleSelectCustomer = (customerId: string) => {
    setSelectedCustomerId(customerId);
    const cust = customers.find((c) => c.id === customerId);
    const existingLoan = loans.find(
      (l) =>
        (l.customerId === customerId || (cust && l.accountNumber === cust.accountNumber)) &&
        (l.status === 'ACTIVE' || Number(l.remainingAmount) > 0)
    );

    if (existingLoan) {
      setHasPreviousLoan(true);
      setPreviousLoanAmount(existingLoan.principalAmount);
      setPreviousSubmittedAmount(existingLoan.paidAmount || 0);
      const rate = existingLoan.interestRate || Number(interestRateInput) || 12;
      setInterestRateInput(rate);

      const prevRem = Math.max(
        0,
        existingLoan.principalAmount - (existingLoan.paidAmount || 0) - (existingLoan.discountAmount || 0)
      );
      const months = calculateElapsedMonths(existingLoan.issueDate);
      const monthlyInt = Math.round((prevRem * rate) / 100);
      const accrued = Math.max(monthlyInt, months * monthlyInt);
      const netInterest = Math.max(0, accrued - (existingLoan.totalInterestPaid || 0));
      setPreviousInterestAmount(netInterest > 0 ? netInterest : monthlyInt);
      setIsManualPrevInterest(false);
    } else if (cust?.hasLoan) {
      setHasPreviousLoan(true);
      setPreviousLoanAmount('');
      setPreviousSubmittedAmount('');
      setPreviousInterestAmount('');
      setIsManualPrevInterest(false);
    } else {
      setHasPreviousLoan(false);
      setPreviousLoanAmount('');
      setPreviousSubmittedAmount('');
      setPreviousInterestAmount('');
      setIsManualPrevInterest(false);
    }
  };

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);
  const existingCustomerLoan = loans.find(
    (l) =>
      (l.customerId === selectedCustomerId || (selectedCustomer && l.accountNumber === selectedCustomer.accountNumber)) &&
      (l.status === 'ACTIVE' || Number(l.remainingAmount) > 0)
  );

  const prevLoanNum = hasPreviousLoan ? (Number(previousLoanAmount) || 0) : 0;
  const prevSubmittedNum = hasPreviousLoan ? (Number(previousSubmittedAmount) || 0) : 0;
  const prevRemainingPrin = Math.max(0, prevLoanNum - prevSubmittedNum);
  const currentRate = Number(interestRateInput) || 12;
  const prevMonthlyInterest = Math.round((prevRemainingPrin * currentRate) / 100);
  const prevInterestNum = hasPreviousLoan ? (Number(previousInterestAmount) || 0) : 0;

  const newPrincipalNum = Number(principalInput) || 0;
  const totalEffectivePrincipal = prevRemainingPrin + newPrincipalNum;
  const newElapsedMonths = calculateElapsedMonths(issueDateInput);
  const newMonthlyInterest = Math.round((newPrincipalNum * currentRate) / 100);
  const newAccruedInterest = Math.max(newMonthlyInterest, newElapsedMonths * newMonthlyInterest);
  const totalCombinedInterest = prevInterestNum + (newPrincipalNum > 0 ? newAccruedInterest : 0);
  const totalPayableAmount = totalEffectivePrincipal + totalCombinedInterest;

  const handleCreateLoan = (e: React.FormEvent) => {
    e.preventDefault();
    const cust = customers.find((c) => c.id === selectedCustomerId);
    if (!cust) {
      showToast(language === 'EN' ? 'Please select a customer.' : 'कृपया खातेदार निवडा.', 'error');
      return;
    }

    const effectivePrincipal = hasPreviousLoan
      ? Math.max(0, prevLoanNum - prevSubmittedNum) + newPrincipalNum
      : newPrincipalNum;

    if (effectivePrincipal <= 0 && (!hasPreviousLoan || prevLoanNum <= 0)) {
      showToast(language === 'EN' ? 'Please enter a valid loan amount.' : 'कृपया योग्य कर्जाची रक्कम भरा.', 'error');
      return;
    }

    const rate = Number(interestRateInput) || 12;
    const months = calculateElapsedMonths(issueDateInput);
    const newMonthlyInterestVal = Math.round((newPrincipalNum * rate) / 100);
    const newTotalInterestVal = Math.max(newMonthlyInterestVal, months * newMonthlyInterestVal);

    const totalOriginalPrincipal = prevLoanNum > 0 ? (prevLoanNum + newPrincipalNum) : newPrincipalNum;
    const totalPaidPrincipal = prevSubmittedNum;
    const remainingPrincipal = Math.max(0, totalOriginalPrincipal - totalPaidPrincipal);

    const totalInterest = prevInterestNum + (newPrincipalNum > 0 ? newTotalInterestVal : 0);
    const totalPayable = totalOriginalPrincipal + totalInterest;
    const remainingAmount = remainingPrincipal + (newPrincipalNum > 0 ? newTotalInterestVal : 0) + prevInterestNum;
    const isCompleted = remainingAmount <= 0;

    const existingLoan = loans.find(
      (l) =>
        (l.customerId === cust.id || (cust.accountNumber && l.accountNumber === cust.accountNumber)) &&
        (l.status === 'ACTIVE' || Number(l.remainingAmount) > 0)
    );

    const loanToSave: any = {
      id: existingLoan ? existingLoan.id : undefined,
      customerId: cust.id,
      customerName: cust.name,
      customerMobile: cust.mobile,
      accountNumber: cust.accountNumber,
      officeId: cust.officeId,
      principalAmount: totalOriginalPrincipal,
      issueDate: issueDateInput,
      interestRate: rate,
      totalInterest,
      totalInterestPaid: existingLoan ? (existingLoan.totalInterestPaid || 0) : 0,
      totalPayable,
      paidAmount: totalPaidPrincipal,
      remainingAmount,
      penaltyAmount: existingLoan ? (existingLoan.penaltyAmount || 0) : 0,
      discountAmount: existingLoan ? (existingLoan.discountAmount || 0) : 0,
      status: isCompleted ? 'COMPLETED' : 'ACTIVE',
      purposeNote: purposeInput.trim() || existingLoan?.purposeNote || undefined,
    };

    const savedLoan = StorageService.saveLoan(loanToSave);

    if (!existingLoan && (totalPaidPrincipal > 0 || prevInterestNum > 0)) {
      StorageService.addLoanPayment({
        loanId: savedLoan.id,
        customerId: cust.id,
        customerName: cust.name,
        accountNumber: cust.accountNumber,
        officeId: cust.officeId,
        customerMobile: cust.mobile,
        paymentDate: issueDateInput,
        paidAmount: totalPaidPrincipal,
        interestPaid: 0,
        penaltyPaid: 0,
        discountAmount: 0,
        remainingLoan: remainingAmount,
        paymentMode: 'CASH',
        note: language === 'EN' ? 'Historical loan initial payment record' : 'मागील जमा नोंद (आधीच भरलेली रक्कम)',
      });
    }

    StorageService.updateCustomer(cust.id, { hasLoan: true });

    showToast(language === 'EN' ? 'Loan saved successfully.' : 'कर्ज नोंद यशस्वीपणे जतन झाली.', 'success');
    refreshData();
    resetAddLoanModal();
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center space-x-2">
            <Landmark className="w-6 h-6 text-amber-700" />
            <span>{t.loanTitle}</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            {t.loanSub}
          </p>
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <button
            onClick={() => refreshAllData()}
            disabled={isRefreshing}
            title={language === 'EN' ? 'Refresh Loans (0 reads if unchanged)' : 'कर्ज डेटा रिफ्रेश करा (बदल नसल्यास ० रीड्स)'}
            className="w-full sm:w-auto min-h-[44px] px-3.5 py-2.5 bg-white hover:bg-emerald-50 text-[#0F7A5C] font-extrabold text-xs rounded-xl border border-[#E4EAE7] shadow-2xs flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-60 active:scale-95 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#0F7A5C] ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{language === 'EN' ? 'Refresh' : 'रिफ्रेश'}</span>
          </button>

          <button
            onClick={() => setIsAddLoanModalOpen(true)}
            className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-amber-700 text-white font-extrabold text-sm hover:bg-amber-800 transition-colors shadow-md flex items-center justify-center space-x-2 cursor-pointer"
          >
            <Plus className="w-5 h-5" />
            <span>{t.btnAddLoan}</span>
          </button>
        </div>
      </div>

      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#E4EAE7] shadow-xs">
        <div className="relative">
          <Search className="w-5 h-5 text-[#0F7A5C] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
          <MarathiTextInput
            value={searchTerm}
            onChange={(val) => setSearchTerm(val)}
            placeholder={language === 'EN' ? 'Search borrowers (Acc No / Name / Item e.g. 101)...' : 'कर्जधारक शोधा (खाते क्रमांक / नाव / कारण उदा. 101)...'}
            className="w-full pl-11 pr-10 py-3 rounded-xl border border-[#E4EAE7] hover:border-[#0F7A5C]/60 text-sm font-extrabold text-slate-900 focus:ring-2 focus:ring-[#0F7A5C] focus:border-[#0F7A5C] bg-[#F4F6F5]/50 transition-all"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 z-10 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Loans Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {filteredLoans.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm font-medium">
            {language === 'EN' ? 'No active loan accounts available.' : 'सध्या कोणतेही कर्ज खाते उपलब्ध नाही.'}
          </div>
        ) : (
          <>
            {/* Mobile Cards View (< md screens) */}
            <div className="block md:hidden space-y-3 p-3 bg-slate-50/50">
              {filteredLoans.map((loan) => {
                const cust = customers.find((c) => c.id === loan.customerId || (loan.accountNumber && c.accountNumber === loan.accountNumber));
                if (!cust) return null;
                const recordedInterest = (loanPayments || [])
                  .filter((lp) => lp.loanId === loan.id || lp.customerId === loan.customerId || (loan.accountNumber && lp.accountNumber === loan.accountNumber))
                  .reduce((sum, lp) => sum + (Number(lp.interestPaid) || 0), 0);
                const loanInterestPaid = recordedInterest > 0 ? recordedInterest : (Number(loan.totalInterestPaid) || 0);

                return (
                  <div
                    key={loan.id}
                    className="bg-white p-4 rounded-2xl border border-amber-200 shadow-xs space-y-3"
                  >
                    {/* Header Row */}
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <div className="flex items-center space-x-2">
                        <span className="px-2.5 py-0.5 rounded-lg bg-amber-100 text-amber-900 text-xs font-black">
                          {cust.accountNumber}
                        </span>
                        <Link
                          to={`/customers/${cust.id}`}
                          className="font-black text-slate-900 text-sm hover:text-amber-700"
                        >
                          {cust.name}
                        </Link>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-md border ${
                          loan.status === 'COMPLETED' || loan.status === 'CLOSED' || loan.remainingAmount <= 0
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : 'bg-amber-50 text-amber-800 border-amber-200'
                        }`}>
                          {loan.status === 'COMPLETED' || loan.status === 'CLOSED' || loan.remainingAmount <= 0
                            ? (language === 'EN' ? 'Completed' : 'पूर्ण')
                            : (language === 'EN' ? 'Active' : 'सुरू')}
                        </span>
                        <span className="text-xs font-extrabold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                          {loan.interestRate}% {language === 'EN' ? 'Interest' : 'व्याज'}
                        </span>
                      </div>
                    </div>

                    {/* Purpose note badge if available */}
                    {loan.purposeNote && (
                      <div className="text-xs font-bold text-amber-900 bg-amber-50/80 px-2.5 py-1 rounded-lg border border-amber-200/60 flex items-center space-x-1">
                        <span className="text-slate-500 font-semibold">{language === 'EN' ? 'Item/Purpose:' : 'वस्तू/कारण:'}</span>
                        <span>{loan.purposeNote}</span>
                      </div>
                    )}

                    {/* Details Grid */}
                    <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-600">
                      <div>
                        <span className="text-[10px] font-extrabold text-slate-400 block uppercase">
                          {t.colPrincipalAmount}
                        </span>
                        <span className="text-slate-900 font-extrabold">
                          {formatCurrency(loan.principalAmount, language)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-extrabold text-slate-400 block uppercase">
                          {t.colLoanDate}
                        </span>
                        <span className="text-slate-900 font-bold">
                          {formatDateMarathi(loan.issueDate, language)}
                        </span>
                      </div>
                    </div>

                    {/* Financial Summary Box */}
                    <div className="grid grid-cols-3 gap-2 bg-amber-50/60 p-2.5 rounded-xl border border-amber-200 text-xs">
                      <div>
                        <span className="text-[10px] text-amber-800 font-bold block">{language === 'EN' ? 'Principal Paid' : 'भरलेली मुद्दल'}:</span>
                        <span className="font-black text-emerald-700">
                          {formatCurrency(loan.paidAmount, language)}
                        </span>
                      </div>
                      <div className="text-center">
                        <span className="text-[10px] text-amber-800 font-bold block">{language === 'EN' ? 'Interest Paid' : 'भरलेले व्याज'}:</span>
                        <span className="font-black text-amber-900">
                          {formatCurrency(loanInterestPaid, language)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-rose-800 font-bold block">{t.statLoanRemaining}:</span>
                        {loan.remainingAmount > 0 ? (
                          <span className="inline-block px-2 py-0.5 rounded-lg bg-rose-100 text-rose-900 border border-rose-300 font-black shadow-2xs">
                            {formatCurrency(loan.remainingAmount, language)}
                          </span>
                        ) : (
                          <span className="font-black text-emerald-700">₹0</span>
                        )}
                      </div>
                    </div>

                    {/* Action */}
                    <div className="pt-1 flex items-center justify-end space-x-2">
                      <button
                        type="button"
                        onClick={() => startEditLoan(loan)}
                        className="p-2.5 min-h-[44px] min-w-[44px] rounded-xl bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-200 font-extrabold text-xs flex items-center justify-center transition-colors cursor-pointer"
                        title={language === 'EN' ? 'Edit Loan' : 'कर्ज माहिती बदला (Edit)'}
                      >
                        <Edit3 className="w-4 h-4 text-amber-700" />
                      </button>
                      <Link
                        to={`/customers/${cust.id}`}
                        className="px-4 py-2.5 rounded-xl bg-amber-700 text-white font-extrabold text-xs inline-flex items-center justify-center space-x-1 shadow-xs cursor-pointer min-h-[44px]"
                      >
                        <span>{t.btnLoanPay}</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View (>= md screens) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-amber-50 text-amber-900 font-extrabold border-b border-amber-200">
                  <tr>
                    <th className="p-3.5 pl-5">{t.colAccountNo}</th>
                    <th className="p-3.5">{t.colCustomerName}</th>
                    <th className="p-3.5">{language === 'EN' ? 'Purpose/Item' : 'कारण/वस्तू'}</th>
                    <th className="p-3.5">{t.colLoanDate}</th>
                    <th className="p-3.5 text-right">{t.colPrincipalAmount}</th>
                    <th className="p-3.5 text-right">{t.colInterestRate}</th>
                    <th className="p-3.5 text-right">{t.colTotalPayable}</th>
                    <th className="p-3.5 text-right">{language === 'EN' ? 'Principal Paid' : 'भरलेली मुद्दल'}</th>
                    <th className="p-3.5 text-right text-amber-950 font-black">{language === 'EN' ? 'Interest Paid' : 'भरलेले व्याज'}</th>
                    <th className="p-3.5 text-right">{t.statLoanRemaining}</th>
                    <th className="p-3.5 text-center">{language === 'EN' ? 'Status' : 'स्थिती'}</th>
                    <th className="p-3.5 text-center">{t.colActions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredLoans.map((loan) => {
                    const cust = customers.find((c) => c.id === loan.customerId || (loan.accountNumber && c.accountNumber === loan.accountNumber));
                    if (!cust) return null;
                    const recordedInterest = (loanPayments || [])
                      .filter((lp) => lp.loanId === loan.id || lp.customerId === loan.customerId || (loan.accountNumber && lp.accountNumber === loan.accountNumber))
                      .reduce((sum, lp) => sum + (Number(lp.interestPaid) || 0), 0);
                    const loanInterestPaid = recordedInterest > 0 ? recordedInterest : (Number(loan.totalInterestPaid) || 0);

                    return (
                      <tr key={loan.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3.5 pl-5 font-bold text-slate-900">{cust.accountNumber}</td>
                        <td className="p-3.5 font-bold text-slate-800">{cust.name}</td>
                        <td className="p-3.5 text-slate-600 font-semibold">{loan.purposeNote || '-'}</td>
                        <td className="p-3.5 text-slate-600">{formatDateMarathi(loan.issueDate, language)}</td>
                        <td className="p-3.5 text-right font-extrabold text-slate-900">
                          {formatCurrency(loan.principalAmount, language)}
                        </td>
                        <td className="p-3.5 text-right font-bold text-slate-700">
                          {loan.interestRate}%
                        </td>
                        <td className="p-3.5 text-right font-bold text-amber-900">
                          {formatCurrency(loan.totalPayable, language)}
                        </td>
                        <td className="p-3.5 text-right font-bold text-emerald-700">
                          {formatCurrency(loan.paidAmount, language)}
                        </td>
                        <td className="p-3.5 text-right font-black text-amber-800">
                          {formatCurrency(loanInterestPaid, language)}
                        </td>
                        <td className="p-3.5 text-right font-black">
                          {loan.remainingAmount > 0 ? (
                            <span className="inline-block px-2.5 py-1 rounded-lg bg-rose-100 text-rose-900 border border-rose-300 font-black shadow-2xs">
                              {formatCurrency(loan.remainingAmount, language)}
                            </span>
                          ) : (
                            <span className="text-emerald-700 font-extrabold">₹0</span>
                          )}
                        </td>
                        <td className="p-3.5 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                            loan.status === 'COMPLETED' || loan.status === 'CLOSED' || loan.remainingAmount <= 0
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-amber-100 text-amber-800 border border-amber-300'
                          }`}>
                            {loan.status === 'COMPLETED' || loan.status === 'CLOSED' || loan.remainingAmount <= 0
                              ? (language === 'EN' ? 'Completed' : 'पूर्ण (Completed)')
                              : (language === 'EN' ? 'Active' : 'सुरू')}
                          </span>
                        </td>
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center space-x-1.5">
                            <button
                              type="button"
                              onClick={() => startEditLoan(loan)}
                              className="p-1.5 rounded-lg bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-200 transition-colors text-xs inline-flex items-center cursor-pointer"
                              title={language === 'EN' ? 'Edit Loan' : 'कर्ज माहिती बदला (Edit)'}
                            >
                              <Edit3 className="w-3.5 h-3.5 text-amber-700" />
                            </button>
                            <Link
                              to={`/customers/${cust.id}`}
                              className="px-3 py-1.5 rounded-lg bg-amber-100 text-amber-900 font-bold hover:bg-amber-200 transition-colors text-xs inline-flex items-center space-x-1"
                            >
                              <span>{t.btnLoanPay}</span>
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* New Loan Modal */}
      {isAddLoanModalOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs no-print overflow-hidden">
            <div className="bg-white rounded-2xl sm:rounded-3xl max-w-md w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in duration-150">
            <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center space-x-2">
                <Landmark className="w-5 h-5 text-amber-600" />
                <span>{t.btnAddLoan}</span>
              </h3>
              <button
                onClick={resetAddLoanModal}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 min-w-[40px] min-h-[40px] flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateLoan} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
                {/* Customer Selection */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">
                      {language === 'EN' ? 'Select Customer' : 'खातेदार निवडा'} <span className="text-rose-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsAddCustomerModalOpen(true)}
                      className="text-xs font-extrabold text-amber-700 hover:text-amber-900 flex items-center space-x-1 bg-amber-50 hover:bg-amber-100 px-2.5 py-1.5 rounded-lg border border-amber-200 transition-colors min-h-[36px]"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>{language === 'EN' ? '+ New Customer' : '+ नवीन खातेदार जोडा'}</span>
                    </button>
                  </div>
                  <CustomDropdown<string>
                    value={selectedCustomerId}
                    onChange={(val) => handleSelectCustomer(val)}
                    options={customers
                      .filter((c) => activeOffice === 'ALL' || c.officeId === activeOffice)
                      .map((c) => {
                        const hasActiveLoan = loans.some(
                          (l) => (l.customerId === c.id || (c.accountNumber && l.accountNumber === c.accountNumber)) && (l.status === 'ACTIVE' || Number(l.remainingAmount) > 0)
                        );
                        return {
                          value: c.id,
                          label: `#${c.accountNumber} - ${c.name}`,
                          subLabel: c.mobile,
                          badge: hasActiveLoan
                            ? (language === 'EN' ? 'Active Loan' : 'चालू कर्जदार')
                            : (c.bishiType === 'LOAN_ONLY' ? (language === 'EN' ? 'Loan Only' : 'फक्त कर्जदार') : undefined),
                        };
                      })}
                    placeholder={language === 'EN' ? '-- Select Customer --' : '-- खातेदार निवडा --'}
                    size="lg"
                  />
                </div>

                {/* Active Loan Alert if customer already has a loan */}
                {selectedCustomer && existingCustomerLoan && (
                  <div className="p-3 bg-amber-50 border border-amber-300 rounded-2xl text-xs space-y-1 shadow-2xs">
                    <div className="flex items-center justify-between font-black text-amber-950">
                      <span className="flex items-center space-x-1.5">
                        <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                        <span>{language === 'EN' ? 'Active Loan Found for this Customer' : 'खातेदाराचे चालू कर्ज अस्तित्वात आहे'}</span>
                      </span>
                      <span className="text-[10px] bg-amber-200 px-2 py-0.5 rounded-md text-amber-900 font-extrabold border border-amber-300">
                        {language === 'EN' ? 'Auto-filled' : 'मागील माहिती भरली आहे'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 text-[11px] text-amber-900 pt-1 border-t border-amber-200/80">
                      <div>{language === 'EN' ? 'Original:' : 'मागील मुद्दल:'} <strong className="font-black text-slate-900">₹{existingCustomerLoan.principalAmount}</strong></div>
                      <div>{language === 'EN' ? 'Paid:' : 'भरलेली मुद्दल:'} <strong className="font-black text-emerald-800">₹{existingCustomerLoan.paidAmount || 0}</strong></div>
                      <div>{language === 'EN' ? 'Outstanding:' : 'चालू बाकी:'} <strong className="font-black text-rose-800">₹{existingCustomerLoan.remainingAmount}</strong></div>
                    </div>
                  </div>
                )}

                {/* Previous Loan Toggle / Container */}
                <div className="bg-amber-50/70 p-3.5 rounded-2xl border border-amber-200/90 space-y-3">
                  <div
                    className="flex items-center justify-between cursor-pointer select-none"
                    onClick={() => setHasPreviousLoan(!hasPreviousLoan)}
                  >
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="hasPreviousLoanCheckbox"
                        checked={hasPreviousLoan}
                        onChange={(e) => setHasPreviousLoan(e.target.checked)}
                        className="w-4 h-4 text-amber-600 rounded border-amber-300 focus:ring-amber-500 cursor-pointer"
                      />
                      <label htmlFor="hasPreviousLoanCheckbox" className="text-xs font-black text-amber-950 cursor-pointer">
                        {language === 'EN' ? 'This Customer Has a Previous Loan' : 'खातेदाराचे मागील/जुने कर्ज आहे (Previous Loan Record)'}
                      </label>
                    </div>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${hasPreviousLoan ? 'bg-amber-200 text-amber-900 border border-amber-300' : 'bg-slate-200/80 text-slate-600'}`}>
                      {hasPreviousLoan ? (language === 'EN' ? 'PREVIOUS LOAN' : 'मागील कर्ज लागू') : (language === 'EN' ? 'FRESH LOAN' : 'नवीन कर्ज')}
                    </span>
                  </div>

                  {hasPreviousLoan && (
                    <div className="pt-2.5 border-t border-amber-200/80 space-y-3 animate-in fade-in duration-150">
                      <p className="text-[11px] text-amber-900 font-medium">
                        {language === 'EN'
                          ? 'Enter the previous loan amount, previous submitted amount, and interest applying on the previous loan balance.'
                          : 'मागील कर्ज मुद्दल, मागील जमा केलेली रक्कम व मागील बाकी कर्जावर लागू होणारे व्याज येथे नोंदवा.'}
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {/* 1. Previous Loan (मागील कर्ज मुद्दल) */}
                        <div>
                          <label className="block text-[11px] font-extrabold text-amber-950 mb-1">
                            {language === 'EN' ? 'Previous Loan Amount (₹)' : 'मागील कर्ज (मुद्दल रक्कम) (₹)'}
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={previousLoanAmount}
                            onChange={(e) => {
                              const val = e.target.value ? Number(e.target.value) : '';
                              setPreviousLoanAmount(val);
                              if (!isManualPrevInterest) {
                                const rem = Math.max(0, (Number(val) || 0) - (Number(previousSubmittedAmount) || 0));
                                const rate = Number(interestRateInput) || 12;
                                setPreviousInterestAmount(rem > 0 ? Math.round((rem * rate) / 100) : 0);
                              }
                            }}
                            placeholder={language === 'EN' ? 'e.g. 50000' : 'उदा. 50000'}
                            className="w-full px-3 py-2 rounded-xl border border-amber-300 text-xs font-bold text-amber-950 bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                          />
                        </div>

                        {/* 2. Previous Submitted (मागील जमा रक्कम) */}
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="block text-[11px] font-extrabold text-amber-950">
                              {language === 'EN' ? 'Previous Submitted Amount (₹)' : 'मागील जमा रक्कम (₹)'}
                            </label>
                            {Number(previousLoanAmount) > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const fullVal = Number(previousLoanAmount) || 0;
                                  setPreviousSubmittedAmount(fullVal);
                                  if (!isManualPrevInterest) {
                                    setPreviousInterestAmount(0);
                                  }
                                }}
                                className="text-[10px] text-amber-800 font-bold underline cursor-pointer"
                              >
                                {language === 'EN' ? 'Full Paid' : 'पूर्ण जमा'}
                              </button>
                            )}
                          </div>
                          <input
                            type="number"
                            min={0}
                            max={Number(previousLoanAmount) || undefined}
                            value={previousSubmittedAmount}
                            onChange={(e) => {
                              const val = e.target.value ? Number(e.target.value) : '';
                              setPreviousSubmittedAmount(val);
                              if (!isManualPrevInterest) {
                                const rem = Math.max(0, (Number(previousLoanAmount) || 0) - (Number(val) || 0));
                                const rate = Number(interestRateInput) || 12;
                                setPreviousInterestAmount(rem > 0 ? Math.round((rem * rate) / 100) : 0);
                              }
                            }}
                            placeholder={language === 'EN' ? 'e.g. 20000' : 'उदा. 20000'}
                            className="w-full px-3 py-2 rounded-xl border border-amber-300 text-xs font-bold text-amber-950 bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* Remaining Previous Principal Badge */}
                      <div className="p-2.5 bg-white rounded-xl border border-amber-200 flex items-center justify-between text-xs font-bold shadow-2xs">
                        <span className="text-slate-600">
                          {language === 'EN' ? 'Remaining Previous Principal:' : 'मागील बाकी मुद्दल (Previous Balance):'}
                        </span>
                        <span className="text-sm font-black text-amber-950">
                          ₹{prevRemainingPrin}
                        </span>
                      </div>

                      {/* 3. Interest Applying on Previous Loan (मागील कर्जावरील लागू व्याज) */}
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="block text-[11px] font-extrabold text-amber-950">
                            {language === 'EN' ? 'Interest Applying on Previous Loan (₹)' : 'मागील कर्जावर लागू होणारे व्याज (₹)'}
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setIsManualPrevInterest(false);
                              const rate = Number(interestRateInput) || 12;
                              const monthly = Math.round((prevRemainingPrin * rate) / 100);
                              const months = existingCustomerLoan ? calculateElapsedMonths(existingCustomerLoan.issueDate) : calculateElapsedMonths(issueDateInput);
                              const calculated = Math.max(monthly, months * monthly);
                              const net = existingCustomerLoan ? Math.max(0, calculated - (existingCustomerLoan.totalInterestPaid || 0)) : calculated;
                              setPreviousInterestAmount(net > 0 ? net : monthly);
                            }}
                            className="text-[10px] text-amber-800 font-bold underline cursor-pointer"
                          >
                            {language === 'EN' ? 'Recalculate Interest' : 'व्याज पुन्हा काढा'}
                          </button>
                        </div>
                        <input
                          type="number"
                          min={0}
                          value={previousInterestAmount}
                          onChange={(e) => {
                            setIsManualPrevInterest(true);
                            setPreviousInterestAmount(e.target.value ? Number(e.target.value) : '');
                          }}
                          placeholder={language === 'EN' ? 'e.g. 3000' : 'उदा. 3000'}
                          className="w-full px-3 py-2 rounded-xl border border-amber-300 text-xs font-bold text-amber-900 bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        />
                        <div className="flex items-center justify-between text-[10px] text-amber-800 font-semibold mt-1">
                          <span>
                            {language === 'EN'
                              ? `At ${currentRate}% interest, monthly interest on remaining ₹${prevRemainingPrin} is ₹${prevMonthlyInterest}.`
                              : `${currentRate}% दरानुसार बाकी ₹${prevRemainingPrin} मुद्दलावर दरमहा व्याज ₹${prevMonthlyInterest} लागू होत आहे.`}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* New / Additional Principal Amount (मुद्दल रक्कम) */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {hasPreviousLoan
                      ? (language === 'EN' ? 'New / Additional Principal Amount (₹)' : 'नवीन मुद्दल रक्कम (अतिरिक्त कर्ज असल्यास भरा) (₹)')
                      : (language === 'EN' ? 'Loan Principal Amount (₹)' : 'कर्जाची मुद्दल रक्कम (₹)')}{' '}
                    {!hasPreviousLoan && <span className="text-rose-500">*</span>}
                  </label>
                  <input
                    type="number"
                    min={0}
                    required={!hasPreviousLoan}
                    value={principalInput}
                    onChange={(e) => setPrincipalInput(e.target.value ? Number(e.target.value) : '')}
                    placeholder={hasPreviousLoan ? (language === 'EN' ? 'e.g. 10000 (or leave empty if no additional cash)' : 'उदा. 10000 (अतिरिक्त रक्कम नसल्यास रिक्त ठेवा)') : 'उदा. 50000'}
                    className="w-full px-4 py-2.5 rounded-xl border border-amber-300 text-sm font-bold text-amber-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                {/* Interest Rate & Issue Date */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      {t.colInterestRate} (%)
                    </label>
                    <input
                      type="number"
                      value={interestRateInput}
                      onChange={(e) => {
                        const val = e.target.value ? Number(e.target.value) : '';
                        setInterestRateInput(val);
                        if (!isManualPrevInterest && hasPreviousLoan) {
                          const rate = Number(val) || 12;
                          const monthly = Math.round((prevRemainingPrin * rate) / 100);
                          setPreviousInterestAmount(monthly);
                        }
                      }}
                      placeholder="12"
                      className="w-full px-4 py-2 rounded-xl border border-slate-300 text-sm font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      {t.colLoanDate}
                    </label>
                    <input
                      type="date"
                      required
                      value={issueDateInput}
                      onChange={(e) => setIssueDateInput(e.target.value)}
                      className="w-full px-4 py-2 rounded-xl border border-slate-300 text-sm font-bold"
                    />
                  </div>
                </div>

                {/* Purpose / Item */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {language === 'EN' ? 'Loan Purpose / Item Description' : 'कर्जाचे कारण / वस्तूची माहिती (Add Item/Note)'}
                  </label>
                  <MarathiTextInput
                    value={purposeInput}
                    onChange={(val) => setPurposeInput(val)}
                    placeholder={language === 'EN' ? 'e.g. Vehicle, Gold, Personal' : 'उदा. गाडी, सोने, वैयक्तिक...'}
                    className="w-full px-4 py-2 rounded-xl border border-slate-300 text-xs font-medium focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                {/* Financial Summary & Breakdown Card */}
                {(totalEffectivePrincipal > 0 || Number(previousLoanAmount) > 0) && (
                  <div className="p-3 bg-amber-50/90 rounded-2xl border border-amber-200 space-y-2.5 shadow-2xs">
                    <div className="text-[11px] font-black text-amber-950 flex items-center justify-between border-b border-amber-200/80 pb-1.5">
                      <span className="flex items-center space-x-1.5">
                        <Calculator className="w-3.5 h-3.5 text-amber-700" />
                        <span>{language === 'EN' ? 'Loan Summary & Breakdown' : 'कर्ज हिशोब व एकूण बाकी तपशील'}</span>
                      </span>
                      <span className="text-[10px] text-amber-800 font-bold">{newElapsedMonths} महिने</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center text-xs">
                      {hasPreviousLoan && (
                        <>
                          <div className="p-1.5 bg-white rounded-xl border border-amber-100">
                            <span className="text-[10px] font-bold text-slate-500 block">{language === 'EN' ? 'Prev Remaining Prin' : 'मागील बाकी मुद्दल'}</span>
                            <span className="font-black text-slate-900">₹{prevRemainingPrin}</span>
                          </div>
                          <div className="p-1.5 bg-white rounded-xl border border-amber-100">
                            <span className="text-[10px] font-bold text-slate-500 block">{language === 'EN' ? 'Interest on Prev Loan' : 'मागील लागू व्याज'}</span>
                            <span className="font-black text-amber-900">₹{prevInterestNum}</span>
                          </div>
                        </>
                      )}
                      <div className="p-1.5 bg-white rounded-xl border border-amber-100">
                        <span className="text-[10px] font-bold text-slate-500 block">{language === 'EN' ? 'New Principal' : 'नवीन मुद्दल'}</span>
                        <span className="font-black text-emerald-800">₹{newPrincipalNum}</span>
                      </div>
                      <div className="p-1.5 bg-amber-100/70 rounded-xl border border-amber-200">
                        <span className="text-[10px] font-black text-amber-900 block">{language === 'EN' ? 'Total Principal' : 'एकूण मुद्दल'}</span>
                        <span className="font-black text-amber-950">₹{totalEffectivePrincipal}</span>
                      </div>
                      <div className="p-1.5 bg-amber-100/70 rounded-xl border border-amber-200">
                        <span className="text-[10px] font-black text-amber-900 block">{language === 'EN' ? 'Total Interest' : 'एकूण चालू व्याज'}</span>
                        <span className="font-black text-amber-950">₹{totalCombinedInterest}</span>
                      </div>
                      <div className="p-1.5 bg-emerald-100/80 rounded-xl border border-emerald-300">
                        <span className="text-[10px] font-black text-emerald-900 block">{language === 'EN' ? 'Total Outstanding' : 'एकूण देय बाकी'}</span>
                        <span className="font-black text-emerald-950 text-sm">₹{totalPayableAmount}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-3.5 sm:px-6 sm:py-3.5 bg-slate-50 border-t border-slate-100 flex justify-end space-x-2 shrink-0">
                <button
                  type="button"
                  onClick={resetAddLoanModal}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-white min-h-[44px] flex items-center justify-center cursor-pointer shadow-2xs"
                >
                  {t.btnCancel}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-amber-700 text-white text-xs font-extrabold shadow-md hover:bg-amber-800 min-h-[44px] flex items-center justify-center cursor-pointer"
                >
                  {t.btnSave}
                </button>
              </div>
            </form>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Edit Loan Modal */}
      {editingLoan && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs no-print overflow-hidden">
            <div className="bg-white rounded-2xl sm:rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in duration-150">
              <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
                <div className="flex items-center space-x-3">
                  <div className="p-2 sm:p-2.5 rounded-xl bg-amber-100 text-amber-800 font-bold shrink-0">
                    <Landmark className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                      {language === 'EN' ? 'Edit Loan Account' : 'कर्ज माहिती बदला (Edit Loan)'}
                    </h3>
                    <p className="text-[11px] sm:text-xs text-slate-500 font-medium">
                      {editingLoan.customerName} ({editingLoan.accountNumber})
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingLoan(null)}
                  className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleUpdateLoan} className="flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
                  {/* Issue Date */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center space-x-1">
                      <Calendar className="w-3.5 h-3.5 text-amber-600" />
                      <span>{language === 'EN' ? 'Loan Issue Date (Editable):' : 'कर्ज तारीख (तारीख बदला):'}</span> <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={editIssueDate}
                      onChange={(e) => setEditIssueDate(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  {/* Principal & Interest Rate */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        {language === 'EN' ? 'Principal Amount (₹):' : 'मुद्दल रक्कम (₹):'} <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="number"
                        required
                        min={100}
                        value={editPrincipal}
                        onChange={(e) => setEditPrincipal(e.target.value ? Number(e.target.value) : '')}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        {language === 'EN' ? 'Interest Rate (%):' : 'व्याजदर (%):'} <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="number"
                        required
                        min={0}
                        step={0.1}
                        value={editRate}
                        onChange={(e) => setEditRate(e.target.value ? Number(e.target.value) : '')}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  {/* Loan Status */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      {language === 'EN' ? 'Loan Status:' : 'कर्ज स्थिती:'}
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setEditStatus('ACTIVE')}
                        className={`py-2 px-3 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                          editStatus === 'ACTIVE'
                            ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {language === 'EN' ? 'Active (Open)' : 'सुरू (Active)'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditStatus('COMPLETED')}
                        className={`py-2 px-3 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                          editStatus === 'COMPLETED'
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {language === 'EN' ? 'Completed (Paid)' : 'पूर्ण (Completed)'}
                      </button>
                    </div>
                  </div>

                  {Number(editPrincipal) > 0 && (
                    <div className="p-3 bg-amber-50/90 rounded-2xl border border-amber-200 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center shadow-2xs">
                      <div className="p-1.5 bg-white rounded-xl border border-amber-100">
                        <span className="text-[10px] font-bold text-amber-800 block">कालावधी (Duration)</span>
                        <span className="text-xs font-black text-amber-950">{calculateElapsedMonths(editIssueDate || editingLoan.issueDate)} महिने</span>
                      </div>
                      <div className="p-1.5 bg-white rounded-xl border border-amber-100">
                        <span className="text-[10px] font-bold text-amber-800 block">दरमहा व्याज</span>
                        <span className="text-xs font-black text-amber-950">₹{Math.round((Number(editPrincipal) * (Number(editRate) || 0)) / 100)}</span>
                      </div>
                      <div className="p-1.5 bg-amber-100/80 rounded-xl border border-amber-200">
                        <span className="text-[10px] font-black text-amber-900 block">दिनांकानुसार एकूण व्याज</span>
                        <span className="text-xs font-black text-amber-900">₹{Math.max(Math.round((Number(editPrincipal) * (Number(editRate) || 0)) / 100), calculateElapsedMonths(editIssueDate || editingLoan.issueDate) * Math.round((Number(editPrincipal) * (Number(editRate) || 0)) / 100))}</span>
                      </div>
                      <div className="p-1.5 bg-emerald-50 rounded-xl border border-emerald-200">
                        <span className="text-[10px] font-black text-emerald-800 block">एकूण देय रक्कम</span>
                        <span className="text-xs font-black text-emerald-900">₹{Number(editPrincipal) + Math.max(Math.round((Number(editPrincipal) * (Number(editRate) || 0)) / 100), calculateElapsedMonths(editIssueDate || editingLoan.issueDate) * Math.round((Number(editPrincipal) * (Number(editRate) || 0)) / 100))}</span>
                      </div>
                    </div>
                  )}

                  {/* Purpose Note */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      {language === 'EN' ? 'Purpose / Note:' : 'कारण / नोंद:'}
                    </label>
                    <MarathiTextInput
                      value={editPurpose}
                      onChange={(val) => setEditPurpose(val)}
                      placeholder={language === 'EN' ? 'Purpose of loan or item name' : 'कर्जाचे कारण किंवा वस्तूचे नाव'}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-medium focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>

                <div className="p-3.5 sm:px-6 sm:py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end space-x-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditingLoan(null)}
                    className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-white min-h-[44px] flex items-center justify-center cursor-pointer shadow-2xs"
                  >
                    {t.btnCancel}
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-amber-700 text-white text-xs font-extrabold shadow-md hover:bg-amber-800 min-h-[44px] flex items-center justify-center space-x-1.5 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>{t.btnSave}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Customer Form Modal embedded for adding customer directly from loan modal */}
      <CustomerFormModal
        isOpen={isAddCustomerModalOpen}
        initialLoanOnly={true}
        onClose={() => setIsAddCustomerModalOpen(false)}
        onSuccess={(newCustomerId) => {
          refreshData();
          if (newCustomerId) {
            setSelectedCustomerId(newCustomerId);
          }
        }}
      />
    </div>
  );
};
