import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { formatCurrency, formatDateMarathi, getBishiNameMarathi, matchesCustomerSearch } from '../../utils/formatters';
import { StorageService } from '../../services/db';
import { Landmark, Search, Plus, Wallet, ArrowUpRight, X, UserPlus, Edit3, Save, Calendar } from 'lucide-react';
import { MarathiTextInput } from '../../components/common/MarathiTextInput';
import { CustomDropdown } from '../../components/common/CustomDropdown';
import { Link } from 'react-router-dom';
import { CustomerFormModal } from '../Customers/CustomerFormModal';
import { ModalPortal } from '../../components/common/ModalPortal';
import { Loan } from '../../types';

export const LoanManager: React.FC = () => {
  const { loans, loanPayments, customers, activeOffice, refreshData, showToast, t, language } = useApp();

  const [searchTerm, setSearchTerm] = useState('');

  // New Loan Modal state
  const [isAddLoanModalOpen, setIsAddLoanModalOpen] = useState(false);
  const [isAddCustomerModalOpen, setIsAddCustomerModalOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [principalInput, setPrincipalInput] = useState<number | ''>('');
  const [interestRateInput, setInterestRateInput] = useState<number | ''>(12);
  const [issueDateInput, setIssueDateInput] = useState(new Date().toISOString().split('T')[0]);
  const [purposeInput, setPurposeInput] = useState('');

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
    const totalInterest = Math.round((principal * rate) / 100);
    const paid = Number(editingLoan.paidAmount) || 0;
    const discount = Number(editingLoan.discountAmount) || 0;
    const penalty = Number(editingLoan.penaltyAmount) || 0;
    const remainingPrincipal = Math.max(0, principal - paid - discount);
    const remainingAmount = remainingPrincipal + penalty;
    const totalPayable = principal + totalInterest;

    StorageService.saveLoan({
      ...editingLoan,
      principalAmount: principal,
      interestRate: rate,
      totalInterest,
      totalPayable,
      remainingAmount,
      issueDate: editIssueDate || editingLoan.issueDate,
      purposeNote: editPurpose.trim() || undefined,
      status: editStatus,
    });

    showToast(language === 'EN' ? 'Loan updated successfully.' : 'कर्ज माहिती यशस्वीपणे अपडेट झाली.', 'success');
    refreshData();
    setEditingLoan(null);
  };

  const officeCustomerIds = new Set(
    customers
      .filter((c) => (activeOffice === 'ALL' || c.officeId === activeOffice) && (c.hasLoan || c.bishiType === 'LOAN_ONLY' || loans.some((l) => l.customerId === c.id)))
      .map((c) => c.id)
  );

  const activeLoans = loans.filter((l) => officeCustomerIds.has(l.customerId));

  const isSearching = Boolean(searchTerm.trim());

  const filteredLoans = loans.filter((l) => {
    if (!isSearching && !officeCustomerIds.has(l.customerId)) return false;
    const cust = customers.find((c) => c.id === l.customerId);
    if (!cust) return false;
    if (isSearching) {
      const purposeMatch = Boolean(l.purposeNote && l.purposeNote.toLowerCase().includes(searchTerm.trim().toLowerCase()));
      return matchesCustomerSearch(cust, searchTerm, l.accountNumber) || purposeMatch;
    }
    return true;
  });

  const handleCreateLoan = (e: React.FormEvent) => {
    e.preventDefault();
    const cust = customers.find((c) => c.id === selectedCustomerId);
    if (!cust) {
      showToast(language === 'EN' ? 'Please select a customer.' : 'कृपया खातेदार निवडा.', 'error');
      return;
    }
    const principal = Number(principalInput);
    if (!principal || principal <= 0) {
      showToast(language === 'EN' ? 'Please enter a valid loan amount.' : 'कृपया योग्य कर्जाची रक्कम भरा.', 'error');
      return;
    }
    const rate = Number(interestRateInput) || 12;
    const totalInterest = Math.round((principal * rate) / 100);
    const totalPayable = principal + totalInterest;

    StorageService.saveLoan({
      customerId: cust.id,
      customerName: cust.name,
      customerMobile: cust.mobile,
      accountNumber: cust.accountNumber,
      officeId: cust.officeId,
      principalAmount: principal,
      issueDate: issueDateInput,
      interestRate: rate,
      totalInterest,
      totalInterestPaid: 0,
      totalPayable,
      paidAmount: 0,
      remainingAmount: principal,
      penaltyAmount: 0,
      status: 'ACTIVE',
      purposeNote: purposeInput.trim() || undefined,
    });

    StorageService.updateCustomer(cust.id, { hasLoan: true });

    showToast(language === 'EN' ? 'New loan created successfully.' : 'नवीन कर्ज यशस्वीपणे जोडले गेले.', 'success');
    refreshData();
    setIsAddLoanModalOpen(false);
    setSelectedCustomerId('');
    setPrincipalInput('');
    setPurposeInput('');
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

        <button
          onClick={() => setIsAddLoanModalOpen(true)}
          className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-amber-700 text-white font-extrabold text-sm hover:bg-amber-800 transition-colors shadow-md flex items-center justify-center space-x-2 cursor-pointer"
        >
          <Plus className="w-5 h-5" />
          <span>{t.btnAddLoan}</span>
        </button>
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
                const cust = customers.find((c) => c.id === loan.customerId);
                if (!cust) return null;
                const loanInterestPaid = (loanPayments || [])
                  .filter((lp) => lp.loanId === loan.id || lp.customerId === loan.customerId)
                  .reduce((sum, lp) => sum + (Number(lp.interestPaid) || 0), 0);

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
                    const cust = customers.find((c) => c.id === loan.customerId);
                    if (!cust) return null;
                    const loanInterestPaid = (loanPayments || [])
                      .filter((lp) => lp.loanId === loan.id || lp.customerId === loan.customerId)
                      .reduce((sum, lp) => sum + (Number(lp.interestPaid) || 0), 0);

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
                onClick={() => setIsAddLoanModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 min-w-[40px] min-h-[40px] flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateLoan} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
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
                    onChange={(val) => setSelectedCustomerId(val)}
                    options={customers
                      .filter((c) => activeOffice === 'ALL' || c.officeId === activeOffice)
                      .map((c) => ({
                        value: c.id,
                        label: `#${c.accountNumber} - ${c.name}`,
                        subLabel: c.mobile,
                        badge: c.bishiType === 'LOAN_ONLY' ? (language === 'EN' ? 'Loan Only' : 'फक्त कर्जदार') : undefined,
                      }))}
                    placeholder={language === 'EN' ? '-- Select Customer --' : '-- खातेदार निवडा --'}
                    size="lg"
                  />
                </div>

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

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {language === 'EN' ? 'Loan Principal Amount (₹)' : 'कर्जाची रक्कम (₹)'} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min={100}
                    value={principalInput}
                    onChange={(e) => setPrincipalInput(e.target.value ? Number(e.target.value) : '')}
                    placeholder={language === 'EN' ? 'e.g. 50000' : 'उदा. 50000'}
                    className="w-full px-4 py-2.5 rounded-xl border border-amber-300 text-sm font-bold text-amber-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      {t.colInterestRate}
                    </label>
                    <input
                      type="number"
                      value={interestRateInput}
                      onChange={(e) => setInterestRateInput(e.target.value ? Number(e.target.value) : '')}
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
              </div>

              <div className="p-3.5 sm:px-6 sm:py-3.5 bg-slate-50 border-t border-slate-100 flex justify-end space-x-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsAddLoanModalOpen(false)}
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
