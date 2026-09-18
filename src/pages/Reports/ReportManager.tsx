import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { BishiType, CollectionEntry, Modality } from '../../types';
import { StorageService } from '../../services/db';
import {
  formatCurrency,
  formatDateMarathi,
  getBishiNameMarathi,
  getOfficeNameMarathi,
  matchesCustomerSearch,
} from '../../utils/formatters';
import { MarathiTextInput } from '../../components/common/MarathiTextInput';
import { CustomDropdown } from '../../components/common/CustomDropdown';
import { ModalPortal } from '../../components/common/ModalPortal';
import { generateReportPDF, generateMemberLedgerPDF } from '../../services/pdf';
import { exportMemberLedgerToExcel, exportGeneralReportToExcel } from '../../services/excel';
import {
  BarChart3,
  Download,
  Printer,
  Users,
  AlertCircle,
  CheckCircle2,
  Plus,
  FileSpreadsheet,
  BookOpen,
  User,
} from 'lucide-react';

export const ReportManager: React.FC = () => {
  const { customers, collections, loans, bishiConfigs, activeOffice, selectedBishiFilter, t, language } = useApp();

  const [viewMode, setViewMode] = useState<'LEDGER_CARD' | 'SUMMARY'>('LEDGER_CARD');
  const [timePeriodFilter, setTimePeriodFilter] = useState<'ALL' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'>('ALL');
  const [bishiFilter, setBishiFilter] = useState<'ALL' | BishiType>(selectedBishiFilter);
  const [modalityFilter, setModalityFilter] = useState<'ALL' | Modality>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'PAID' | 'PARTIAL' | 'LOAN_ONLY'>('ALL');

  // Customer Ledger Card selection & search
  const [selectedLedgerCustomerId, setSelectedLedgerCustomerId] = useState<string>('');
  const [ledgerSearch, setLedgerSearch] = useState<string>('');
  const [summarySearch, setSummarySearch] = useState<string>('');
  const [showAllLedgerPeriods, setShowAllLedgerPeriods] = useState<boolean>(false);

  // Custom Report Note state
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [customReportNote, setCustomReportNote] = useState('');
  const [noteInput, setNoteInput] = useState('');

  const todayStr = new Date().toISOString().split('T')[0];
  const loanPayments = StorageService.getLoanPayments();

  const isDateInPeriod = (dateStr?: string, period: 'ALL' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' = 'ALL'): boolean => {
    if (!dateStr || period === 'ALL') return true;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return true;
    const now = new Date();

    if (period === 'DAILY') {
      return d.toISOString().split('T')[0] === todayStr;
    }

    if (period === 'WEEKLY') {
      const currentDay = now.getDay();
      const diffToMonday = now.getDate() - currentDay + (currentDay === 0 ? -6 : 1);
      const monday = new Date(now.getFullYear(), now.getMonth(), diffToMonday);
      monday.setHours(0, 0, 0, 0);

      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      return d >= monday && d <= sunday;
    }

    if (period === 'MONTHLY') {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }

    if (period === 'YEARLY') {
      return d.getFullYear() === now.getFullYear();
    }

    return true;
  };

  // Office & filter filtered customers strictly for the General Summary Report tab
  const officeCustomers = customers.filter((c) => {
    if (activeOffice !== 'ALL' && c.officeId !== activeOffice) return false;
    if (bishiFilter !== 'ALL' && c.bishiType !== bishiFilter) return false;
    if (modalityFilter !== 'ALL' && c.modality !== modalityFilter) return false;
    return true;
  });

  // For the Member Ledger Card:
  // All customers are accessible. If an activeOffice is selected, sort customers from that office to the top.
  // Never filter out customers by bishiFilter or modalityFilter in Member Ledger Card!
  const sortedLedgerCustomers = [...customers].sort((a, b) => {
    if (activeOffice !== 'ALL') {
      if (a.officeId === activeOffice && b.officeId !== activeOffice) return -1;
      if (a.officeId !== activeOffice && b.officeId === activeOffice) return 1;
    }
    const numA = Number(a.accountNumber);
    const numB = Number(b.accountNumber);
    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB;
    }
    return String(a.accountNumber).localeCompare(String(b.accountNumber));
  });

  const displayedLedgerCustomers = sortedLedgerCustomers.filter((c) => {
    if (!ledgerSearch.trim()) return true;
    return matchesCustomerSearch(c, ledgerSearch);
  });

  // Default active customer for Ledger Card
  const activeLedgerCustomer =
    (selectedLedgerCustomerId && customers.find((c) => c.id === selectedLedgerCustomerId)) ||
    displayedLedgerCustomers[0] ||
    customers[0] ||
    null;

  let grandExpected = 0;
  let grandCollected = 0;
  let grandRemaining = 0;
  let grandInterest = 0;
  let grandPenalty = 0;

  const allRows = (summarySearch.trim() ? customers : officeCustomers).map((cust) => {
    const custColls = collections.filter((c) => {
      if (c.customerId !== cust.id) return false;
      if (timePeriodFilter === 'ALL') return true;
      const matchDueDate = isDateInPeriod(c.dueDate, timePeriodFilter);
      const matchPaymentDate = isDateInPeriod(c.paymentDate, timePeriodFilter);
      const isPastOverduePending = statusFilter === 'PENDING' && c.status !== 'PAID' && c.dueDate <= todayStr;
      return matchDueDate || matchPaymentDate || isPastOverduePending;
    });

    let exp = 0;
    let coll = 0;
    let rem = 0;
    let int = 0;
    let pen = 0;

    custColls.forEach((c) => {
      exp += c.expectedAmount || 0;
      coll += c.collectedAmount || 0;
      rem += c.remainingAmount || 0;
      int += c.interestAmount || 0;
      pen += c.penaltyAmount || 0;
    });

    const custLoan = loans.find((l) => l.customerId === cust.id);
    const custLoanPayments = loanPayments.filter((lp) => {
      if (lp.customerId !== cust.id) return false;
      return isDateInPeriod(lp.paymentDate, timePeriodFilter);
    });

    let loanPaid = 0;
    let loanIntPaid = 0;
    let loanPenPaid = 0;
    custLoanPayments.forEach((lp) => {
      loanPaid += lp.paidAmount || 0;
      loanIntPaid += lp.interestPaid || 0;
      loanPenPaid += lp.penaltyPaid || 0;
    });

    const isLoanOnly = cust.bishiType === 'LOAN_ONLY';
    const totalExp = isLoanOnly ? (custLoan ? custLoan.principalAmount : 0) : exp;
    const totalColl = isLoanOnly ? loanPaid : coll;
    const totalRem = isLoanOnly ? (custLoan ? custLoan.remainingAmount : 0) : rem;
    const totalInt = isLoanOnly ? loanIntPaid : int;
    const totalPen = isLoanOnly ? loanPenPaid : pen;

    const isPaid = totalRem === 0 && (totalExp > 0 || totalColl > 0);
    const isPending = totalRem > 0;
    const isPartial = totalColl > 0 && totalRem > 0;

    return {
      customer: cust,
      exp: totalExp,
      coll: totalColl,
      rem: totalRem,
      int: totalInt,
      pen: totalPen,
      isPaid,
      isPending,
      isPartial,
      loanPaid,
      loanIntPaid,
      custLoan,
    };
  });

  // Filter rows based on statusFilter tab and search query
  const filteredRows = allRows.filter((r) => {
    if (summarySearch.trim() && !matchesCustomerSearch(r.customer, summarySearch)) return false;
    if (statusFilter === 'PENDING') return r.isPending;
    if (statusFilter === 'PAID') return r.isPaid;
    if (statusFilter === 'PARTIAL') return r.isPartial;
    if (statusFilter === 'LOAN_ONLY') return r.customer.bishiType === 'LOAN_ONLY' || r.customer.hasLoan;
    return true;
  });

  filteredRows.forEach((r) => {
    grandExpected += r.exp;
    grandCollected += r.coll;
    grandRemaining += r.rem;
    grandInterest += r.int;
    grandPenalty += r.pen;
  });

  const pendingCount = allRows.filter((r) => r.isPending).length;
  const paidCount = allRows.filter((r) => r.isPaid).length;

  const getPeriodLabelText = () => {
    switch (timePeriodFilter) {
      case 'DAILY':
        return language === 'EN' ? 'Daily' : 'दैनिक (आजचा)';
      case 'WEEKLY':
        return language === 'EN' ? 'Weekly' : 'साप्ताहिक (या आठवड्याचा)';
      case 'MONTHLY':
        return language === 'EN' ? 'Monthly' : 'मासिक (या महिन्याचा)';
      case 'YEARLY':
        return language === 'EN' ? 'Yearly' : 'वार्षिक (या वर्षाचा)';
      default:
        return language === 'EN' ? 'All Time' : 'सर्व कालावधी';
    }
  };

  const getStatusLabelText = () => {
    switch (statusFilter) {
      case 'PENDING':
        return language === 'EN' ? 'Pending Dues' : 'फक्त बाकी अहवाल';
      case 'PAID':
        return language === 'EN' ? 'Paid Collections' : 'फक्त पूर्ण जमा अहवाल';
      case 'PARTIAL':
        return language === 'EN' ? 'Partial Payments' : 'फक्त अंशतः जमा अहवाल';
      case 'LOAN_ONLY':
        return language === 'EN' ? 'Loan Only' : 'फक्त कर्ज खातेदार अहवाल';
      default:
        return language === 'EN' ? 'All Records' : 'सर्व नोंदी अहवाल';
    }
  };

  const reportTitle = `${getStatusLabelText()} - ${getPeriodLabelText()}`;

  const handleDownloadPDF = () => {
    if (viewMode === 'LEDGER_CARD' && activeLedgerCustomer) {
      const custLoan = loans.find((l) => l.customerId === activeLedgerCustomer.id);
      generateMemberLedgerPDF(activeLedgerCustomer, collections, custLoan, loanPayments, showAllLedgerPeriods);
    } else {
      const filteredCustomersToDownload = filteredRows.map((r) => r.customer);
      generateReportPDF(
        customReportNote ? `${reportTitle} - ${customReportNote}` : reportTitle,
        getOfficeNameMarathi(activeOffice, language),
        bishiFilter === 'ALL' ? t.allBishi : getBishiNameMarathi(bishiFilter, language),
        filteredCustomersToDownload,
        collections
      );
    }
  };

  const handleDownloadExcel = () => {
    if (viewMode === 'LEDGER_CARD' && activeLedgerCustomer) {
      const custLoan = loans.find((l) => l.customerId === activeLedgerCustomer.id);
      exportMemberLedgerToExcel(activeLedgerCustomer, collections, custLoan, loanPayments, showAllLedgerPeriods);
    } else {
      exportGeneralReportToExcel(
        reportTitle,
        getOfficeNameMarathi(activeOffice, language),
        bishiFilter === 'ALL' ? t.allBishi : getBishiNameMarathi(bishiFilter, language),
        filteredRows
      );
    }
  };

  // Loan payments for active ledger customer
  const ledgerLoanPaymentsForCust = loanPayments.filter(
    (lp) => activeLedgerCustomer && lp.customerId === activeLedgerCustomer.id
  );

  // Prepare active customer collections for Member Ledger Card (Filter out future empty weeks by default)
  const allActiveCustomerCollections = activeLedgerCustomer
    ? collections
        .filter((c) => c.customerId === activeLedgerCustomer.id)
        .sort((a, b) => a.periodIndex - b.periodIndex)
    : [];

  // If customer has loan payments on dates without bishi collections, synthesize rows so they are never missed
  const collectionDueDates = new Set(allActiveCustomerCollections.map((c) => c.dueDate));
  const missingLoanPaymentDates = Array.from(
    new Set(
      ledgerLoanPaymentsForCust
        .filter((lp) => !collectionDueDates.has(lp.paymentDate))
        .map((lp) => lp.paymentDate)
    )
  ).sort();

  const synthesizedLoanRows: CollectionEntry[] = missingLoanPaymentDates.map((pDate, idx) => ({
    id: `synth-loan-${idx}-${pDate}`,
    customerId: activeLedgerCustomer?.id || '',
    customerName: activeLedgerCustomer?.name,
    accountNumber: activeLedgerCustomer?.accountNumber || '',
    officeId: activeLedgerCustomer?.officeId || 'HEAD_OFFICE',
    bishiType: activeLedgerCustomer?.bishiType || 'DIWALI',
    periodIndex: 900 + idx,
    periodLabel: `कर्ज परतफेड`,
    dueDate: pDate,
    expectedAmount: 0,
    collectedAmount: 0,
    remainingAmount: 0,
    interestAmount: 0,
    historicalInterestRate: 0,
    penaltyAmount: 0,
    historicalPenaltyRate: 0,
    totalPaid: 0,
    status: 'PAID',
    paymentDate: pDate,
    updatedAt: pDate,
  }));

  const mergedCustomerCollections = [...allActiveCustomerCollections, ...synthesizedLoanRows].sort((a, b) =>
    a.dueDate.localeCompare(b.dueDate)
  );

  const activeCustomerCollections = showAllLedgerPeriods
    ? mergedCustomerCollections
    : mergedCustomerCollections.filter((c) => {
        const hasDeposit = (c.collectedAmount || 0) > 0;
        const isPaid = c.status === 'PAID';
        const hasLoanPayment = ledgerLoanPaymentsForCust.some((lp) => lp.paymentDate === c.dueDate);
        return hasDeposit || isPaid || hasLoanPayment;
      });

  const activeCustomerLoan = activeLedgerCustomer
    ? loans.find((l) => l.customerId === activeLedgerCustomer.id)
    : null;

  const ledgerTotalDeposit = activeCustomerCollections.reduce((sum, c) => sum + (c.collectedAmount || 0), 0);
  const ledgerTotalExpected = activeCustomerCollections.reduce((sum, c) => sum + (c.expectedAmount || 0), 0);
  const ledgerTotalPenalty = activeCustomerCollections.reduce((sum, c) => sum + (c.penaltyAmount || 0), 0);
  const ledgerLoanIssued = activeLedgerCustomer?.hasLoan && activeCustomerLoan ? (activeCustomerLoan.principalAmount || 0) : 0;
  const ledgerTotalLoanPrincipal = ledgerLoanPaymentsForCust.reduce((sum, lp) => sum + (lp.paidAmount || 0), 0);
  const ledgerTotalLoanInterest = ledgerLoanPaymentsForCust.reduce((sum, lp) => sum + (lp.interestPaid || 0), 0);
  const ledgerTotalLoanPenalty = ledgerLoanPaymentsForCust.reduce((sum, lp) => sum + (lp.penaltyPaid || 0), 0);
  const ledgerFinalRemaining = (activeLedgerCustomer?.hasLoan && activeCustomerLoan ? activeCustomerLoan.remainingAmount : 0) + (activeCustomerCollections.length > 0 ? (activeCustomerCollections[activeCustomerCollections.length - 1].remainingAmount || 0) : 0);

  return (
    <div className="space-y-6 pb-16 print-container">
      {/* Top Header Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs no-print">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center space-x-2">
            <BarChart3 className="w-6 h-6 text-emerald-700" />
            <span>{t.reportTitle}</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            {language === 'EN'
              ? 'View Member Ledger Card register template, export PDF/Excel & print reports'
              : 'खातेदार खाते उतारा रजिस्टर टेम्पलेट पहा, PDF/Excel डाऊनलोड करा व प्रिंट काढा'}
          </p>
        </div>

        {/* Export & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsNoteModalOpen(true)}
            className="px-3.5 py-2.5 min-h-[44px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs transition-colors flex items-center space-x-1.5 touch-target cursor-pointer"
          >
            <Plus className="w-4 h-4 text-emerald-700" />
            <span>{language === 'EN' ? 'Add Note' : 'टीप / शेरा जोडा'}</span>
          </button>

          {/* Excel Download Button */}
          <button
            onClick={handleDownloadExcel}
            className="px-4 py-2.5 min-h-[44px] rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-extrabold text-xs transition-colors shadow-md flex items-center space-x-1.5 touch-target cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
            <span>{language === 'EN' ? 'Excel Download' : 'Excel डाऊनलोड'}</span>
          </button>

          {/* PDF Download Button */}
          <button
            onClick={handleDownloadPDF}
            className="px-4 py-2.5 min-h-[44px] rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs transition-colors shadow-md flex items-center space-x-1.5 touch-target cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>{t.btnDownloadPdf}</span>
          </button>

          {/* Print Button */}
          <button
            onClick={() => window.print()}
            className="px-4 py-2.5 min-h-[44px] rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition-colors flex items-center space-x-1.5 shadow-xs touch-target cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>{t.btnPrint}</span>
          </button>
        </div>
      </div>

      {/* Mode Switcher Tabs (Member Ledger Card vs General Summary) */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-4 no-print">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200 w-full sm:w-auto">
            <button
              onClick={() => setViewMode('LEDGER_CARD')}
              className={`flex-1 sm:flex-initial px-4 py-2 min-h-[44px] rounded-lg text-xs font-extrabold transition-all flex items-center justify-center space-x-2 touch-target cursor-pointer ${
                viewMode === 'LEDGER_CARD'
                  ? 'bg-brand-900 text-white shadow-xs'
                  : 'text-slate-700 hover:bg-slate-200'
              }`}
            >
              <BookOpen className="w-4 h-4 text-amber-400" />
              <span>{language === 'EN' ? 'Member Ledger Card Template' : 'खातेदार खाते उतारा (Ledger Card Template)'}</span>
            </button>

            <button
              onClick={() => setViewMode('SUMMARY')}
              className={`flex-1 sm:flex-initial px-4 py-2 min-h-[44px] rounded-lg text-xs font-extrabold transition-all flex items-center justify-center space-x-2 touch-target cursor-pointer ${
                viewMode === 'SUMMARY'
                  ? 'bg-brand-900 text-white shadow-xs'
                  : 'text-slate-700 hover:bg-slate-200'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>{language === 'EN' ? 'Summary Report' : 'सामान्य अहवाल (Summary Report)'}</span>
            </button>
          </div>

          {/* Customer Dropdown & Reveal Filter (Visible in Ledger Card Mode) */}
          {viewMode === 'LEDGER_CARD' && (
            <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
              <div className="flex items-center space-x-2 w-full sm:w-auto bg-[#F4F6F5] p-1.5 rounded-2xl border border-[#E4EAE7]">
                <div className="w-32 sm:w-44 shrink-0">
                  <MarathiTextInput
                    value={ledgerSearch}
                    onChange={(val) => {
                      setLedgerSearch(val);
                      const matches = customers.filter((c) => matchesCustomerSearch(c, val));
                      if (matches.length > 0) {
                        setSelectedLedgerCustomerId(matches[0].id);
                      }
                    }}
                    placeholder={language === 'EN' ? 'Acc No / Name...' : 'खाते क्र / नाव...'}
                    className="w-full h-10 px-3 rounded-xl border border-[#E4EAE7] bg-white font-extrabold text-xs focus:ring-2 focus:ring-[#0F7A5C] focus:border-[#0F7A5C]"
                  />
                </div>
                <div className="flex-1 sm:w-64">
                  <CustomDropdown<string>
                    value={activeLedgerCustomer?.id || ''}
                    onChange={(val) => setSelectedLedgerCustomerId(val)}
                    options={displayedLedgerCustomers.map((cust) => ({
                      value: cust.id,
                      label: `#${cust.accountNumber} - ${cust.name}`,
                      subLabel: cust.mobile ? `${cust.mobile} • ${getOfficeNameMarathi(cust.officeId, language)}` : getOfficeNameMarathi(cust.officeId, language),
                      badge: cust.modality === 'W' ? (language === 'EN' ? 'Weekly' : 'साप्ताहिक') : (language === 'EN' ? 'Monthly' : 'मासिक'),
                    }))}
                    placeholder={language === 'EN' ? 'Select Customer' : 'खातेदार निवडा'}
                    size="md"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowAllLedgerPeriods(!showAllLedgerPeriods)}
                className={`h-11 px-4 rounded-xl border text-xs font-black transition-all flex items-center space-x-1.5 shadow-2xs cursor-pointer ${
                  showAllLedgerPeriods
                    ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                    : 'bg-emerald-100 text-emerald-900 border-emerald-300 hover:bg-emerald-200'
                }`}
              >
                <span>
                  {showAllLedgerPeriods
                    ? (language === 'EN' ? 'Showing All Weeks' : 'सर्व आठवडे दाखवले (All Weeks)')
                    : (language === 'EN' ? 'Completed Weeks Only' : 'फक्त जमा झालेले आठवडे (Completed Weeks)')}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Dropdown Filters Grid for Summary Mode */}
        {viewMode === 'SUMMARY' && (
          <div className="space-y-4 pt-3 border-t border-[#E4EAE7]">
            {/* Search filter for summary reports */}
            <div>
              <MarathiTextInput
                value={summarySearch}
                onChange={(val) => setSummarySearch(val)}
                placeholder={language === 'EN' ? 'Search Acc No / Name / Mobile (e.g. 101 / Suraj)...' : 'खाते क्रमांक / नाव / मोबाईल शोधा (उदा. 101 / सुरज)...'}
                className="w-full h-11 px-4 rounded-xl border border-[#E4EAE7] hover:border-[#0F7A5C]/60 text-xs sm:text-sm font-extrabold focus:ring-2 focus:ring-[#0F7A5C] focus:border-[#0F7A5C] bg-[#F4F6F5]/50 focus:outline-none transition-all"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* 1. Time Period Filter */}
              <div>
                <label className="block text-xs font-bold text-[#5F6E68] mb-1.5">
                  {language === 'EN' ? 'Time Period' : 'कालावधी (Time Period)'}
                </label>
                <CustomDropdown<'ALL' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'>
                  value={timePeriodFilter}
                  onChange={(val) => setTimePeriodFilter(val)}
                  options={[
                    { value: 'ALL', label: language === 'EN' ? 'All Time (सर्व कालावधी)' : 'सर्व कालावधी (All Time)' },
                    { value: 'DAILY', label: language === 'EN' ? 'Daily (आजचा अहवाल)' : 'दैनिक / आजचा अहवाल (Daily)' },
                    { value: 'WEEKLY', label: language === 'EN' ? 'Weekly (या आठवड्याचा)' : 'साप्ताहिक (या आठवड्याचा)' },
                    { value: 'MONTHLY', label: language === 'EN' ? 'Monthly (या महिन्याचा)' : 'मासिक (या महिन्याचा)' },
                    { value: 'YEARLY', label: language === 'EN' ? 'Yearly (या वर्षाचा)' : 'वार्षिक (या वर्षाचा)' },
                  ]}
                  size="lg"
                />
              </div>

              {/* 2. Status / Collection Filter */}
              <div>
                <label className="block text-xs font-bold text-[#5F6E68] mb-1.5">
                  {language === 'EN' ? 'Report Status' : 'जमा-बाकी स्थिती (Status)'}
                </label>
                <CustomDropdown<'ALL' | 'PENDING' | 'PAID' | 'PARTIAL' | 'LOAN_ONLY'>
                  value={statusFilter}
                  onChange={(val) => setStatusFilter(val)}
                  options={[
                    { value: 'ALL', label: language === 'EN' ? 'All Records (सर्व अहवाल)' : 'सर्व अहवाल (All Reports)' },
                    { value: 'PENDING', label: language === 'EN' ? 'Pending Dues (फक्त बाकी भिशी)' : 'फक्त बाकी भिशी (Pending Only)' },
                    { value: 'PAID', label: language === 'EN' ? 'Paid Collections (फक्त जमा)' : 'फक्त पूर्ण जमा भिशी (Paid Only)' },
                    { value: 'PARTIAL', label: language === 'EN' ? 'Partial Deposits (अंशतः जमा)' : 'फक्त अंशतः जमा (Partial Deposits)' },
                    { value: 'LOAN_ONLY', label: language === 'EN' ? 'Loan Only (फक्त कर्ज)' : 'फक्त कर्ज खातेदार (Loan Only)' },
                  ]}
                  size="lg"
                />
              </div>

              {/* 3. Bishi Scheme Filter */}
              <div>
                <label className="block text-xs font-bold text-[#5F6E68] mb-1.5">{t.filterBishi}</label>
                <CustomDropdown<'ALL' | BishiType>
                  value={bishiFilter}
                  onChange={(val) => setBishiFilter(val)}
                  options={[
                    { value: 'ALL', label: t.allBishi },
                    ...bishiConfigs.map((cfg) => ({
                      value: cfg.id as BishiType,
                      label: cfg.name,
                    })),
                    { value: 'LOAN_ONLY', label: language === 'EN' ? 'Loan Only Customer' : 'फक्त कर्ज खातेदार' },
                  ]}
                  size="lg"
                />
              </div>

              {/* 4. Modality Filter */}
              <div>
                <label className="block text-xs font-bold text-[#5F6E68] mb-1.5">{t.filterModality}</label>
                <CustomDropdown<'ALL' | Modality>
                  value={modalityFilter}
                  onChange={(val) => setModalityFilter(val)}
                  options={[
                    { value: 'ALL', label: t.allModalities },
                    { value: 'W', label: t.modalityWeekly },
                    { value: 'M', label: t.modalityMonthly },
                  ]}
                  size="lg"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* VIEW 1: MEMBER LEDGER CARD TEMPLATE (Matching physical photo & excel mockup) */}
      {viewMode === 'LEDGER_CARD' && (
        <div className="bg-white rounded-2xl border border-amber-900/30 shadow-md p-4 sm:p-8 space-y-6 print:border-none print:shadow-none print:p-0">
          {activeLedgerCustomer ? (
            <div className="border-4 border-double border-amber-900/40 p-4 sm:p-6 bg-[#fffdfa] rounded-xl space-y-5">
              {/* Header Box */}
              <div className="flex flex-col sm:flex-row justify-between items-center border-b-2 border-amber-900/40 pb-3 gap-2">
                <div>
                  <h2 className="text-sm font-black text-amber-900">{language === 'EN' ? 'Sushant Bishi' : 'सुषांत भिशी'}</h2>
                  <h1 className="text-lg sm:text-xl font-black text-amber-950 tracking-tight">
                    {language === 'EN' ? 'Member Ledger Card' : 'खातेदार खाते उतारा (Member Ledger Card)'}
                  </h1>
                </div>
                <div className="text-right text-xs font-extrabold text-amber-950">
                  <div>{language === 'EN' ? 'Office: ' : 'कार्यालय: '}{getOfficeNameMarathi(activeOffice, language)}</div>
                  <div>{language === 'EN' ? 'Date: ' : 'दिनांक: '}{formatDateMarathi(new Date().toISOString().split('T')[0], language)}</div>
                </div>
              </div>

              {/* Account Meta Grid Box */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-bold border-collapse border border-amber-900/40 bg-[#fffde7]">
                  <tbody>
                    <tr className="border-b border-amber-900/30">
                      <td className="p-2.5 bg-[#8B4513] text-white font-extrabold w-28 sm:w-36">{language === 'EN' ? 'Account No' : 'खाते नंबर'}</td>
                      <td className="p-2.5 font-black text-slate-900 text-sm sm:text-base border-r border-amber-900/30">
                        {activeLedgerCustomer.accountNumber}
                      </td>
                      <td className="p-2.5 bg-[#8B4513] text-white font-extrabold w-32 sm:w-40">{language === 'EN' ? 'Customer Name' : 'खातेदाराचे नाव'}</td>
                      <td className="p-2.5 font-black text-slate-900 text-sm sm:text-base">
                        {activeLedgerCustomer.name}
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2.5 bg-[#8B4513] text-white font-extrabold">{language === 'EN' ? 'Installment (₹)' : 'हप्ता रुपये'}</td>
                      <td className="p-2.5 font-extrabold text-emerald-900 border-r border-amber-900/30">
                        ₹{activeLedgerCustomer.amount} ({activeLedgerCustomer.modality === 'W' ? (language === 'EN' ? 'Weekly' : 'साप्ताहिक') : (language === 'EN' ? 'Monthly' : 'मासिक')})
                      </td>
                      <td className="p-2.5 bg-[#8B4513] text-white font-extrabold">{language === 'EN' ? 'Address / Mobile' : 'पत्ता / मोबाईल'}</td>
                      <td className="p-2.5 font-extrabold text-slate-800">
                        {activeLedgerCustomer.address || '-'} ({activeLedgerCustomer.mobile})
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Mobile swipe helper cue */}
              <div className="md:hidden flex items-center justify-between text-[11px] font-bold text-amber-800 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200 mb-2 no-print">
                <span>{language === 'EN' ? '👉 Swipe horizontally to view full ledger table' : '👉 संपूर्ण तक्ता पाहण्यासाठी डावीकडे/उजवीकडे स्वाइप करा (Swipe to view full ledger)'}</span>
              </div>

              {/* Main Ledger Table (Multi-level columns matching photo & excel mockup) */}
              <div className="overflow-x-auto table-responsive">
                <table className="w-full text-center text-xs font-bold border-collapse border border-amber-900/40">
                  <thead>
                    <tr className="bg-[#f5e6d3] text-slate-900 border-b border-amber-900/40">
                      <th rowSpan={2} className="p-2.5 border border-amber-900/40 w-12">{language === 'EN' ? 'Sr.' : 'अ. क्र.'}</th>
                      <th rowSpan={2} className="p-2.5 border border-amber-900/40 w-24">{language === 'EN' ? 'Date' : 'तारीख'}</th>
                      <th rowSpan={2} className="p-2.5 border border-amber-900/40 text-emerald-900">{language === 'EN' ? 'Deposit (₹)' : 'खात्यात जमा रुपये'}</th>
                      <th rowSpan={2} className="p-2.5 border border-amber-900/40 text-emerald-950">{language === 'EN' ? 'Total Deposit (₹)' : 'एकूण जमा रुपये'}</th>
                      <th rowSpan={2} className="p-2.5 border border-amber-900/40 text-rose-900">{language === 'EN' ? 'Penalty' : 'दंड'}</th>
                      <th rowSpan={2} className="p-2.5 border border-amber-900/40">{language === 'EN' ? 'Expected' : 'देणे'}</th>
                      <th rowSpan={2} className="p-2.5 border border-amber-900/40 text-amber-900">{language === 'EN' ? 'Loan Given' : 'दिलेले कर्ज'}</th>
                      <th colSpan={2} className="p-2.5 border border-amber-900/40 text-brand-900">{language === 'EN' ? 'Loan Repayment' : 'कर्ज परत फेड'}</th>
                      <th rowSpan={2} className="p-2.5 border border-amber-900/40 text-rose-900">{language === 'EN' ? 'Penalty' : 'दंड'}</th>
                      <th rowSpan={2} className="p-2.5 border border-amber-900/40 text-rose-950">{language === 'EN' ? 'Balance Due' : 'देणे बाकी'}</th>
                    </tr>
                    <tr className="bg-[#faebd7] text-slate-900 border-b border-amber-900/40">
                      <th className="p-2 border border-amber-900/40">{language === 'EN' ? 'Principal' : 'कर्ज'}</th>
                      <th className="p-2 border border-amber-900/40">{language === 'EN' ? 'Interest' : 'व्याज'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeCustomerCollections.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="p-8 text-center text-slate-500 font-bold text-xs bg-slate-50 border border-amber-900/30">
                          {language === 'EN'
                            ? 'No completed payments recorded yet for this customer.'
                            : 'या खातेदाराची अद्याप कोणतीही पूर्ण जमा नोंद झालेली नाही.'}
                        </td>
                      </tr>
                    ) : (() => {
                      let cumulativeDeposit = 0;
                      let runningLoanPrincipalBalance = activeCustomerLoan ? (activeCustomerLoan.principalAmount || 0) : 0;
                      return activeCustomerCollections.map((item, idx) => {
                        const deposit = item.collectedAmount || 0;
                        cumulativeDeposit += deposit;
                        const penalty = item.penaltyAmount || 0;
                        const expected = item.expectedAmount || 0;

                        // Filter ALL loan payments matching this customer and date
                        const periodPayments = ledgerLoanPaymentsForCust.filter(
                          (lp) => lp.paymentDate === item.dueDate
                        );

                        const loanPrincipalPaid = periodPayments.reduce((sum, lp) => sum + (lp.paidAmount || 0), 0);
                        const loanInterestPaid = periodPayments.reduce((sum, lp) => sum + (lp.interestPaid || 0), 0);
                        const loanPenalty = periodPayments.reduce((sum, lp) => sum + (lp.penaltyPaid || 0), 0);
                        const loanDiscount = periodPayments.reduce((sum, lp) => sum + (lp.discountAmount || 0), 0);

                        if (activeLedgerCustomer?.hasLoan) {
                          runningLoanPrincipalBalance = Math.max(0, runningLoanPrincipalBalance - loanPrincipalPaid - loanDiscount);
                        }

                        const loanIssued =
                          idx === 0 && activeLedgerCustomer?.hasLoan && activeCustomerLoan
                            ? activeCustomerLoan.principalAmount
                            : 0;

                        const balanceRemaining = (activeLedgerCustomer?.hasLoan ? runningLoanPrincipalBalance : 0) + (item.remainingAmount || 0);

                        return (
                          <tr
                            key={item.id}
                            className="hover:bg-amber-100/40 transition-colors odd:bg-white even:bg-[#fcf8f2] border-b border-amber-900/20"
                          >
                            <td className="p-2 border border-amber-900/30 font-extrabold text-slate-700">{idx + 1}</td>
                            <td className="p-2 border border-amber-900/30 font-bold text-slate-800">
                              {formatDateMarathi(item.dueDate, language)}
                            </td>
                            <td className="p-2 border border-amber-900/30 text-right font-black text-emerald-700">
                              {deposit > 0 ? formatCurrency(deposit, language) : '-'}
                            </td>
                            <td className="p-2 border border-amber-900/30 text-right font-black text-emerald-900">
                              {cumulativeDeposit > 0 ? formatCurrency(cumulativeDeposit, language) : '-'}
                            </td>
                            <td className="p-2 border border-amber-900/30 text-right font-extrabold text-rose-700">
                              {penalty > 0 ? formatCurrency(penalty, language) : '-'}
                            </td>
                            <td className="p-2 border border-amber-900/30 text-right font-bold text-slate-800">
                              {expected > 0 ? formatCurrency(expected, language) : '-'}
                            </td>
                            <td className="p-2 border border-amber-900/30 text-right font-extrabold text-amber-800">
                              {loanIssued > 0 ? formatCurrency(loanIssued, language) : '-'}
                            </td>
                            <td className="p-2 border border-amber-900/30 text-right font-extrabold text-emerald-800">
                              {loanPrincipalPaid > 0 ? formatCurrency(loanPrincipalPaid, language) : '-'}
                            </td>
                            <td className="p-2 border border-amber-900/30 text-right font-extrabold text-emerald-800">
                              {loanInterestPaid > 0 ? formatCurrency(loanInterestPaid, language) : '-'}
                            </td>
                            <td className="p-2 border border-amber-900/30 text-right font-extrabold text-rose-700">
                              {loanPenalty > 0 ? formatCurrency(loanPenalty, language) : '-'}
                            </td>
                            <td className="p-2 border border-amber-900/30 text-right font-black text-rose-600">
                              {balanceRemaining > 0 ? formatCurrency(balanceRemaining, language) : '₹0'}
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[#8B4513] text-white font-extrabold text-xs">
                      <td className="p-2 border border-amber-900/40 text-center">-</td>
                      <td className="p-2 border border-amber-900/40 text-center">{language === 'EN' ? 'TOTAL' : 'एकूण'}</td>
                      <td className="p-2 border border-amber-900/40 text-right text-emerald-200 font-black">{ledgerTotalDeposit > 0 ? formatCurrency(ledgerTotalDeposit, language) : '-'}</td>
                      <td className="p-2 border border-amber-900/40 text-right text-emerald-100 font-black">{ledgerTotalDeposit > 0 ? formatCurrency(ledgerTotalDeposit, language) : '-'}</td>
                      <td className="p-2 border border-amber-900/40 text-right text-rose-200">{ledgerTotalPenalty > 0 ? formatCurrency(ledgerTotalPenalty, language) : '-'}</td>
                      <td className="p-2 border border-amber-900/40 text-right">{ledgerTotalExpected > 0 ? formatCurrency(ledgerTotalExpected, language) : '-'}</td>
                      <td className="p-2 border border-amber-900/40 text-right text-amber-200">{ledgerLoanIssued > 0 ? formatCurrency(ledgerLoanIssued, language) : '-'}</td>
                      <td className="p-2 border border-amber-900/40 text-right text-emerald-200 font-black">{ledgerTotalLoanPrincipal > 0 ? formatCurrency(ledgerTotalLoanPrincipal, language) : '-'}</td>
                      <td className="p-2 border border-amber-900/40 text-right text-emerald-200 font-black">{ledgerTotalLoanInterest > 0 ? formatCurrency(ledgerTotalLoanInterest, language) : '-'}</td>
                      <td className="p-2 border border-amber-900/40 text-right text-rose-200">{ledgerTotalLoanPenalty > 0 ? formatCurrency(ledgerTotalLoanPenalty, language) : '-'}</td>
                      <td className="p-2 border border-amber-900/40 text-right text-rose-200 font-black">{ledgerFinalRemaining > 0 ? formatCurrency(ledgerFinalRemaining, language) : '₹0'}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Footer Block matching media_1789461835687.jpg */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 pt-4 border-t border-amber-900/30 text-xs font-extrabold text-slate-800">
                <div className="bg-[#fffde7] border border-amber-900/30 p-3 rounded-lg space-y-1 w-full sm:w-64">
                  <div>{language === 'EN' ? '1) Bid/Draw: ___________________' : '१) टाकणी: ___________________'}</div>
                  <div>{language === 'EN' ? '2) Dividend: ___________________' : '२) डिव्हिडंड: ___________________'}</div>
                  <div>{language === 'EN' ? '3) Acc No: ' : '३) खाते नं.: '}{activeLedgerCustomer.accountNumber}</div>
                  <div>{language === 'EN' ? '4) Note: ___________________' : '४) शेरा: ___________________'}</div>
                </div>

                <div className="text-right w-full sm:w-auto pr-4">
                  <p className="mb-8 font-extrabold text-slate-700">
                    {language === 'EN' ? 'Acknowledged receipt of Bishi amount...' : 'सदर भिशीची रक्कम मिळाल्या बद्दल...'}
                  </p>
                  <div className="border-t border-slate-900 pt-1 inline-block min-w-40 text-center font-black text-slate-900">
                    {language === 'EN' ? 'Secretary / President' : 'सेक्रेटरी / अध्यक्ष'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-slate-500 font-bold">
              {language === 'EN' ? 'No customers found for this selection.' : 'निवडलेल्या निकषासाठी कोणताही खातेदार सापडला नाही.'}
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: GENERAL SUMMARY REPORT */}
      {viewMode === 'SUMMARY' && (
        <>
          {/* Print-Only Header for Summary Report */}
          <div className="print-only mb-6 border-b-2 border-emerald-900 pb-4">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-black text-emerald-900 tracking-tight">{language === 'EN' ? 'Sushant Bishi' : 'सुषांत भिशी'}</h1>
                <h2 className="text-base font-extrabold text-slate-800">{customReportNote ? `${reportTitle} - ${customReportNote}` : reportTitle}</h2>
              </div>
              <div className="text-right text-xs font-bold text-slate-600 leading-relaxed">
                <div>{language === 'EN' ? 'Office: ' : 'कार्यालय: '}<strong className="text-emerald-900">{getOfficeNameMarathi(activeOffice, language)}</strong></div>
                <div>{language === 'EN' ? 'Bishi Scheme: ' : 'भिशी योजना: '}<strong className="text-emerald-900">{bishiFilter === 'ALL' ? t.allBishi : getBishiNameMarathi(bishiFilter, language)}</strong></div>
                <div>{language === 'EN' ? 'Date: ' : 'दिनांक: '}<strong className="text-slate-900">{formatDateMarathi(new Date().toISOString().split('T')[0], language)}</strong> | {language === 'EN' ? 'Total: ' : 'एकूण: '}<strong className="text-slate-900">{filteredRows.length}</strong></div>
              </div>
            </div>
          </div>

          {/* Report Data Table */}
          <div className="bg-white rounded-2xl border border-slate-300 shadow-xs overflow-hidden print:border-none print:shadow-none">
            {filteredRows.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-sm font-medium">
                {statusFilter === 'PENDING'
                  ? language === 'EN' ? '🎉 Great! No pending customers in this report.' : '🎉 अभिनंदन! या अहवालात कोणताही खातेदार न भरलेला/बाकीदार नाही.'
                  : statusFilter === 'PAID'
                  ? language === 'EN' ? 'No fully paid collections found.' : 'कोणत्याही खातेदाराची जमा नोंद पूर्ण झालेली नाही.'
                  : language === 'EN' ? 'No records found.' : 'कोणतीही नोंद सापडली नाही.'}
              </div>
            ) : (
              <>
                {/* Mobile Cards View (< md screens, hidden in print) */}
                <div className="block md:hidden print:hidden space-y-3 p-3 bg-slate-50/50">
                  {filteredRows.map(({ customer: cust, exp, coll, rem, int, pen, isPaid, isPending, isPartial }, idx) => (
                    <div key={cust.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <div className="flex items-center space-x-2">
                          <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900 text-xs font-black">
                            {cust.accountNumber}
                          </span>
                          <span className="font-bold text-slate-900 text-xs truncate">{cust.name}</span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold ${
                            isPaid
                              ? 'bg-emerald-100 text-emerald-800'
                              : isPartial
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {isPaid ? `✅ ${t.statusPaid}` : isPartial ? `⏳ ${t.statusPartial}` : `❌ ${t.statusPending}`}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-600">
                        <div>
                          <span className="text-[10px] font-extrabold text-slate-400 block uppercase">
                            {t.colExpectedAmount}
                          </span>
                          <span className="text-slate-900 font-extrabold">{formatCurrency(exp, language)}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-extrabold text-slate-400 block uppercase">
                            {t.colBishi}
                          </span>
                          <span className="text-slate-800 font-bold">{getBishiNameMarathi(cust.bishiType, language)}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs">
                        <div>
                          <span className="text-[10px] text-slate-500 font-bold block">{t.colCollectedAmount}:</span>
                          <span className="font-black text-emerald-700">{formatCurrency(coll, language)}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-slate-500 font-bold block">{t.summaryRemaining}:</span>
                          <span className="font-black text-rose-600">{formatCurrency(rem, language)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop & Print Table View */}
                <div className="hidden md:block print:block overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm border-collapse border border-slate-300">
                    <thead className="bg-emerald-900 text-white font-extrabold print:bg-emerald-900 print:text-white">
                      <tr>
                        <th className="p-3 text-center border border-emerald-800 w-10">#</th>
                        <th className="p-3 border border-emerald-800">{t.colAccountNo}</th>
                        <th className="p-3 border border-emerald-800">{t.colFullName}</th>
                        <th className="p-3 border border-emerald-800">{t.colMobile}</th>
                        <th className="p-3 border border-emerald-800">{t.colBishi}</th>
                        <th className="p-3 text-right border border-emerald-800">{t.colExpectedAmount}</th>
                        <th className="p-3 text-right border border-emerald-800">{t.colCollectedAmount}</th>
                        <th className="p-3 text-right border border-emerald-800">{t.colRemainingAmount}</th>
                        <th className="p-3 text-right border border-emerald-800">{language === 'EN' ? 'Interest/Penalty (₹)' : 'व्याज/दंड (₹)'}</th>
                        <th className="p-3 text-center border border-emerald-800">{t.colStatus}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-medium">
                      {filteredRows.map(({ customer: cust, exp, coll, rem, int, pen, isPaid, isPending, isPartial }, idx) => (
                        <tr key={cust.id} className="hover:bg-slate-50 transition-colors odd:bg-white even:bg-slate-50/50">
                          <td className="p-3 text-center font-bold text-slate-700 border border-slate-300">{idx + 1}</td>
                          <td className="p-3 font-extrabold text-slate-900 border border-slate-300">{cust.accountNumber}</td>
                          <td className="p-3 font-bold text-slate-800 border border-slate-300">{cust.name}</td>
                          <td className="p-3 text-slate-600 border border-slate-300">{cust.mobile}</td>
                          <td className="p-3 text-slate-700 border border-slate-300">{getBishiNameMarathi(cust.bishiType, language)}</td>
                          <td className="p-3 text-right font-bold text-slate-800 border border-slate-300">{formatCurrency(exp, language)}</td>
                          <td className="p-3 text-right font-extrabold text-emerald-700 border border-slate-300">{formatCurrency(coll, language)}</td>
                          <td className="p-3 text-right font-black text-rose-600 border border-slate-300">{formatCurrency(rem, language)}</td>
                          <td className="p-3 text-right text-slate-800 border border-slate-300">
                            {int > 0 && <div className="text-blue-700 font-bold">{language === 'EN' ? 'Interest: ' : 'व्याज: '}{formatCurrency(int, language)}</div>}
                            {pen > 0 && <div className="text-amber-800 font-bold">{language === 'EN' ? 'Penalty: ' : 'दंड: '}{formatCurrency(pen, language)}</div>}
                            {int === 0 && pen === 0 && '-'}
                          </td>
                          <td className="p-3 text-center border border-slate-300">
                            <span
                              className={`px-2.5 py-1 rounded-md text-xs font-extrabold ${
                                isPaid
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  : isPartial
                                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                  : 'bg-rose-100 text-rose-800 border border-rose-300'
                              }`}
                            >
                              {isPaid ? `✅ ${t.statusPaid}` : isPartial ? `⏳ ${t.statusPartial}` : `❌ ${t.statusPending}`}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-emerald-950 text-white font-black text-xs sm:text-sm print:bg-emerald-950 print:text-white">
                      <tr>
                        <td className="p-3 text-center border border-emerald-800">-</td>
                        <td className="p-3 border border-emerald-800">{language === 'EN' ? 'TOTAL' : 'एकूण (TOTAL)'}</td>
                        <td className="p-3 border border-emerald-800">{language === 'EN' ? 'Accounts:' : 'खातेदार:'} {filteredRows.length}</td>
                        <td className="p-3 border border-emerald-800">-</td>
                        <td className="p-3 border border-emerald-800">-</td>
                        <td className="p-3 text-right border border-emerald-800">{formatCurrency(grandExpected, language)}</td>
                        <td className="p-3 text-right border border-emerald-800 text-emerald-300">{formatCurrency(grandCollected, language)}</td>
                        <td className="p-3 text-right border border-emerald-800 text-rose-300">{formatCurrency(grandRemaining, language)}</td>
                        <td className="p-3 text-right border border-emerald-800 text-amber-200 font-bold">
                          {grandInterest > 0 && <div>{language === 'EN' ? 'Interest: ' : 'व्याज: '}{formatCurrency(grandInterest, language)}</div>}
                          {grandPenalty > 0 && <div>{language === 'EN' ? 'Penalty: ' : 'दंड: '}{formatCurrency(grandPenalty, language)}</div>}
                          {grandInterest === 0 && grandPenalty === 0 && '-'}
                        </td>
                        <td className="p-3 text-center border border-emerald-800">-</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* Print-Only Footer for Summary Report */}
          <div className="print-only mt-8 pt-4 border-t border-dashed border-slate-300 text-xs font-bold text-slate-600">
            <div className="flex justify-between items-end">
              <div>
                <div>{language === 'EN' ? 'Report Generation Date: ' : 'अहवाल निर्मिती दिनांक: '}{formatDateMarathi(new Date().toISOString().split('T')[0], language)}</div>
                <div className="text-[10px] text-slate-500">• {language === 'EN' ? 'Computer Generated Copy: Sushant Bishi Management System' : 'संगणकीकृत प्रत: सुषांत भिशी व्यवस्थापन प्रणाली'}</div>
              </div>
              <div className="text-center pr-4">
                <div className="h-10"></div>
                <div className="border-t border-emerald-900 pt-1 min-w-36 text-emerald-950 font-black">
                  {language === 'EN' ? 'Authorized Signature' : 'अधिकृत स्वाक्षरी'}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Custom Report Note Display Banner */}
      {customReportNote && (
        <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl flex items-center justify-between text-xs font-bold text-emerald-900 no-print">
          <div className="flex items-center space-x-2">
            <span className="font-extrabold text-emerald-800">{language === 'EN' ? 'Report Note:' : 'अहवाल शेरा / टीप:'}</span>
            <span>{customReportNote}</span>
          </div>
          <button
            onClick={() => setCustomReportNote('')}
            className="text-rose-600 hover:underline font-extrabold no-print"
          >
            {language === 'EN' ? 'Clear Note' : 'टीप काढा'}
          </button>
        </div>
      )}

      {/* Custom Report Note Modal */}
      {isNoteModalOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs no-print overflow-hidden">
            <div className="bg-white rounded-2xl sm:rounded-3xl max-w-md w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in duration-150">
            <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center space-x-2">
                <Plus className="w-5 h-5 text-emerald-700" />
                <span>{language === 'EN' ? 'Add Custom Report Note' : 'अहवालात विशेष टीप / शेरा जोडा'}</span>
              </h3>
              <button
                onClick={() => setIsNoteModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setCustomReportNote(noteInput.trim());
                setIsNoteModalOpen(false);
              }}
              className="flex flex-col flex-1 min-h-0 overflow-hidden"
            >
              <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {language === 'EN' ? 'Custom Note / Remarks' : 'अहवालाची टीप / शेरा'}
                  </label>
                  <textarea
                    rows={3}
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    placeholder={language === 'EN' ? 'e.g. Approved by Director, Special Diwali Report' : 'उदा. दिवाळी विशेष हिशोब, संचालकांची मान्यता'}
                    className="w-full p-3 rounded-xl border border-slate-300 text-xs font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="p-3.5 sm:px-6 sm:py-3.5 bg-slate-50 border-t border-slate-100 flex justify-end space-x-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsNoteModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  {language === 'EN' ? 'Cancel' : 'रद्द करा'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-700 text-white text-xs font-extrabold shadow-md hover:bg-emerald-800 transition-colors"
                >
                  {language === 'EN' ? 'Save Note' : 'टीप जतन करा'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </ModalPortal>
      )}
    </div>
  );
};
