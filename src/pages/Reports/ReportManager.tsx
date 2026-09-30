import React, { useState } from 'react';
import { Link } from 'react-router-dom';
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
import { generateReportPDF, generateMemberLedgerPDF, generateThakbakiReportPDF } from '../../services/pdf';
import { exportMemberLedgerToExcel, exportGeneralReportToExcel, exportThakbakiReportToExcel } from '../../services/excel';
import { calculateMemberLedger } from '../../services/ledger';
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
  ClipboardList,
  RefreshCw,
} from 'lucide-react';

export const ReportManager: React.FC = () => {
  const { customers, collections, loans, bishiConfigs, activeOffice, selectedBishiFilter, t, language, thakbakiList, isRefreshing, refreshAllData } = useApp();

  const [viewMode, setViewMode] = useState<'LEDGER_CARD' | 'SUMMARY' | 'THAKBAKI'>('LEDGER_CARD');
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
    if (bishiFilter !== 'ALL') {
      if (bishiFilter === 'LOAN_ONLY') {
        const isBorrower =
          c.bishiType === 'LOAN_ONLY' ||
          Boolean(c.hasLoan) ||
          loans.some((l) => {
            if (l.customerId === c.id) return true;
            if (!c.accountNumber || !l.accountNumber) return false;
            const strA = String(c.accountNumber).trim();
            const strB = String(l.accountNumber).trim();
            if (strA === strB) return true;
            const numA = Number(strA);
            const numB = Number(strB);
            return !isNaN(numA) && !isNaN(numB) && numA === numB;
          }) ||
          loanPayments.some((lp) => {
            if (lp.customerId === c.id) return true;
            if (!c.accountNumber || !lp.accountNumber) return false;
            const strA = String(c.accountNumber).trim();
            const strB = String(lp.accountNumber).trim();
            if (strA === strB) return true;
            const numA = Number(strA);
            const numB = Number(strB);
            return !isNaN(numA) && !isNaN(numB) && numA === numB;
          });
        if (!isBorrower) return false;
      } else if (c.bishiType !== bishiFilter) {
        return false;
      }
    }
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
  let grandExpectedInterest = 0;
  let grandTotalExpWithInterest = 0;
  let grandCollected = 0;
  let grandRemaining = 0;
  let grandInterest = 0;
  let grandPenalty = 0;
  let grandUnpaidLoan = 0;
  let grandLoanDeduction = 0;
  let grandPayable = 0;
  let grandExtraSubmitted = 0;
  let grandGrossReturn = 0;
  let grandFinalReturn = 0;

  const allRows = (summarySearch.trim() ? customers : officeCustomers).map((cust) => {
    const schemeCfg = bishiConfigs.find((cfg) => cfg.id === cust.bishiType);
    const targetInstallments = Number(cust.totalInstallments) || Number(schemeCfg?.totalInstallments) || (cust.modality === 'W' ? 40 : 10);

    const custColls = collections.filter((c) => {
      if (c.customerId !== cust.id) return false;
      if (c.periodIndex > targetInstallments && c.status !== 'PAID' && (c.collectedAmount || 0) <= 0) return false;
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
      const expAmt = c.expectedAmount || 0;
      const collAmt = c.collectedAmount || 0;
      exp += expAmt;
      coll += collAmt;
      pen += c.penaltyAmount || 0;
    });

    // Compute overall scheme remaining as (totalExpected − totalCollected).
    // This correctly reflects overpayments and avoids inflating remaining
    // by counting future unpaid installments that haven't been due yet.
    rem = Math.max(0, exp - coll);

    // Interest is calculated STRICTLY on the regular Bishi collected amount (NEVER on extra amount)
    const effectiveCustRate = cust.interestRate || (cust.modality === 'W' ? 2.5 : 10);
    const expectedBishiInterest = cust.bishiType === 'LOAN_ONLY' ? 0 : Math.round((exp * effectiveCustRate) / 100);
    const bishiAmountForInt = exp > 0 ? Math.min(coll, exp) : coll;
    const bishiInterest = Math.round((bishiAmountForInt * effectiveCustRate) / 100);

    const custLoans = loans.filter((l) => {
      if (l.customerId === cust.id) return true;
      if (!cust.accountNumber || !l.accountNumber) return false;
      const strA = String(cust.accountNumber).trim();
      const strB = String(l.accountNumber).trim();
      if (strA === strB) return true;
      const numA = Number(strA);
      const numB = Number(strB);
      return !isNaN(numA) && !isNaN(numB) && numA === numB;
    });

    const custLoan = custLoans.find((l) => l.status === 'ACTIVE')
      || [...custLoans].sort((a, b) => (b.updatedAt || b.issueDate || '').localeCompare(a.updatedAt || a.issueDate || ''))[0]
      || null;

    // Total unpaid/remaining loan for this customer across all active/pending loans
    const unpaidLoan = custLoans.reduce((sum, l) => {
      if (l.status === 'COMPLETED' || l.status === 'CLOSED') return sum;
      return sum + Math.max(0, l.remainingAmount || 0);
    }, 0);
    const totalPrincipalLoan = custLoans.reduce((sum, l) => sum + (l.principalAmount || 0), 0);

    const custLoanPayments = loanPayments.filter((lp) => {
      if (lp.customerId === cust.id) return true;
      if (!cust.accountNumber || !lp.accountNumber) return false;
      const strA = String(cust.accountNumber).trim();
      const strB = String(lp.accountNumber).trim();
      if (strA === strB) return true;
      const numA = Number(strA);
      const numB = Number(strB);
      return !isNaN(numA) && !isNaN(numB) && numA === numB;
    });

    let loanPaid = 0;
    let loanIntPaid = 0;
    let loanPenPaid = 0;
    custLoanPayments.forEach((lp) => {
      loanPaid += lp.paidAmount || 0;
      loanIntPaid += lp.interestPaid || 0;
      loanPenPaid += lp.penaltyPaid || 0;
    });

    if (timePeriodFilter === 'ALL' && custLoan) {
      if (loanPaid === 0 && (custLoan.paidAmount || 0) > 0) {
        loanPaid = custLoan.paidAmount;
      }
      if (loanIntPaid === 0 && (custLoan.totalInterestPaid || 0) > 0) {
        loanIntPaid = custLoan.totalInterestPaid || 0;
      }
      if (loanPenPaid === 0 && (custLoan.penaltyAmount || 0) > 0) {
        loanPenPaid = custLoan.penaltyAmount;
      }
    }

    const hasLoan = custLoans.length > 0 || Boolean(cust.hasLoan) || cust.bishiType === 'LOAN_ONLY' || totalPrincipalLoan > 0 || loanPaid > 0;

    // PURE loan-only customer (who does not belong to any regular bishi scheme)
    const isLoanOnly = cust.bishiType === 'LOAN_ONLY';

    const totalExpBase = isLoanOnly ? (custLoan ? custLoan.principalAmount : (cust.amount || 0)) : exp;
    const totalExpWithInterest = isLoanOnly ? totalExpBase : (exp + expectedBishiInterest);
    const totalColl = isLoanOnly ? loanPaid : coll;
    const totalRem = isLoanOnly ? (custLoan ? custLoan.remainingAmount : 0) : rem;
    const totalInt = isLoanOnly ? loanIntPaid : bishiInterest;
    const totalPen = isLoanOnly ? loanPenPaid : pen;

    const isPaid = totalRem === 0 && (totalExpBase > 0 || totalColl > 0);
    const isPending = totalRem > 0;
    const isPartial = totalColl > 0 && totalRem > 0;

    const extraSubmitted = Math.max(0, totalColl - totalExpBase);

    // Bishi gross return:
    // If customer has made deposits, their return is coll + interest.
    // If customer hasn't deposited yet in this period, scheme target return is totalExpWithInterest.
    const bishiGrossReturn = isLoanOnly
      ? 0
      : (totalColl > 0 ? (totalColl + totalInt) : totalExpWithInterest);

    // Unpaid loan deduction against bishi return
    const loanDeduction = isLoanOnly ? 0 : Math.min(bishiGrossReturn, unpaidLoan);
    const netReturn = isLoanOnly ? 0 : Math.max(0, bishiGrossReturn - unpaidLoan);
    const totalWithExtra = isLoanOnly ? 0 : bishiGrossReturn;
    const totalPayable = isLoanOnly ? 0 : (totalExpWithInterest + extraSubmitted);

    return {
      customer: cust,
      exp: totalExpBase,
      expectedInterest: isLoanOnly ? 0 : expectedBishiInterest,
      totalExpWithInterest,
      coll: totalColl,
      rem: totalRem,
      int: totalInt,
      pen: totalPen,
      isPaid,
      isPending,
      isPartial,
      isLoanOnly,
      loanPaid,
      loanIntPaid,
      custLoan,
      hasLoan,
      unpaidLoan,
      totalPrincipalLoan,
      loanDeduction,
      bishiGrossReturn,
      netReturn,
      totalPayable,
      extraSubmitted,
      totalWithExtra,
    };
  });

  // Filter rows based on statusFilter tab and search query
  const filteredRows = allRows.filter((r) => {
    if (summarySearch.trim() && !matchesCustomerSearch(r.customer, summarySearch)) return false;
    if (statusFilter === 'PENDING') return r.isPending;
    if (statusFilter === 'PAID') return r.isPaid;
    if (statusFilter === 'PARTIAL') return r.isPartial;
    if (statusFilter === 'LOAN_ONLY') {
      return (
        r.customer.bishiType === 'LOAN_ONLY' ||
        Boolean(r.customer.hasLoan) ||
        r.hasLoan ||
        r.unpaidLoan > 0 ||
        r.totalPrincipalLoan > 0 ||
        r.loanPaid > 0 ||
        Boolean(r.custLoan)
      );
    }
    if (bishiFilter !== 'ALL') {
      if (bishiFilter === 'LOAN_ONLY') {
        const isBorrower =
          r.customer.bishiType === 'LOAN_ONLY' ||
          Boolean(r.customer.hasLoan) ||
          r.hasLoan ||
          r.unpaidLoan > 0 ||
          r.totalPrincipalLoan > 0 ||
          r.loanPaid > 0 ||
          Boolean(r.custLoan);
        if (!isBorrower) return false;
      } else if (r.customer.bishiType !== bishiFilter) {
        return false;
      }
    }
    return true;
  });

  filteredRows.forEach((r) => {
    grandExpected += r.exp;
    grandExpectedInterest += r.expectedInterest;
    grandTotalExpWithInterest += r.totalExpWithInterest;
    grandCollected += r.coll;
    grandRemaining += r.rem;
    grandInterest += r.int;
    grandPenalty += r.pen;
    grandUnpaidLoan += r.unpaidLoan;
    grandLoanDeduction += r.loanDeduction;
    grandPayable += r.totalPayable;
    grandExtraSubmitted += r.extraSubmitted;
    grandGrossReturn += r.bishiGrossReturn;
    grandFinalReturn += r.netReturn;
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
    if (viewMode === 'THAKBAKI') {
      generateThakbakiReportPDF(thakbakiList, language);
      return;
    }
    if (viewMode === 'LEDGER_CARD' && activeLedgerCustomer) {
      const custLoan = loans.find((l) => l.customerId === activeLedgerCustomer.id);
      generateMemberLedgerPDF(activeLedgerCustomer, collections, custLoan, loanPayments, showAllLedgerPeriods, language);
    } else {
      const filteredCustomersToDownload = filteredRows.map((r) => r.customer);
      generateReportPDF(
        reportTitle,
        getOfficeNameMarathi(activeOffice, language),
        bishiFilter === 'ALL' ? t.allBishi : getBishiNameMarathi(bishiFilter, language),
        filteredCustomersToDownload,
        collections,
        customReportNote,
        language
      );
    }
  };

  const handleDownloadExcel = () => {
    if (viewMode === 'THAKBAKI') {
      exportThakbakiReportToExcel(thakbakiList, language);
      return;
    }
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

  // Loan details for active ledger customer
  const activeCustomerLoan = activeLedgerCustomer
    ? loans.find((l) => l.customerId === activeLedgerCustomer.id)
    : null;

  // Calculate unified ledger rows supporting multiple payments on a single day
  const ledgerCalculation = activeLedgerCustomer
    ? calculateMemberLedger(
        activeLedgerCustomer,
        collections,
        activeCustomerLoan,
        loanPayments,
        showAllLedgerPeriods
      )
    : null;

  // Active ledger customer dividend / interest calculations
  const ledgerCustRate = activeLedgerCustomer
    ? (activeLedgerCustomer.interestRate || (activeLedgerCustomer.modality === 'W' ? 2.5 : 10))
    : 0;
  const ledgerTotalBaseExpected = ledgerCalculation ? ledgerCalculation.totalExpected : 0;
  const ledgerExpectedInterest = Math.round((ledgerTotalBaseExpected * ledgerCustRate) / 100);
  const ledgerTotalExpWithInterest = ledgerTotalBaseExpected + ledgerExpectedInterest;
  const ledgerEarnedInterest = ledgerCalculation
    ? Math.round((ledgerCalculation.totalDeposit * ledgerCustRate) / 100)
    : 0;
  const ledgerTotalPayout = ledgerCalculation
    ? (ledgerCalculation.totalDeposit + ledgerEarnedInterest)
    : 0;

  return (
    <div className="space-y-6 pb-16 print-container print-landscape">
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
          {/* Refresh Button */}
          <button
            onClick={() => refreshAllData()}
            disabled={isRefreshing}
            title={language === 'EN' ? 'Refresh Reports (0 reads if unchanged)' : 'अहवाल डेटा रिफ्रेश करा (बदल नसल्यास ० रीड्स)'}
            className="px-3.5 py-2.5 min-h-[44px] rounded-xl bg-white hover:bg-emerald-50 text-[#0F7A5C] border border-[#E4EAE7] font-extrabold text-xs shadow-2xs flex items-center space-x-1.5 touch-target cursor-pointer disabled:opacity-60 active:scale-95 transition-all"
          >
            <RefreshCw className={`w-4 h-4 text-[#0F7A5C] ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{language === 'EN' ? 'Refresh' : 'रिफ्रेश'}</span>
          </button>

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
          <div className="flex flex-wrap sm:flex-nowrap bg-slate-100 p-1.5 rounded-2xl border-2 border-slate-200/80 gap-2 w-full sm:w-auto shadow-inner">
            <button
              onClick={() => setViewMode('LEDGER_CARD')}
              className={`flex-1 sm:flex-initial px-4 py-2.5 min-h-[46px] rounded-xl text-xs font-black transition-all flex items-center justify-center space-x-2 touch-target cursor-pointer relative ${
                viewMode === 'LEDGER_CARD'
                  ? 'bg-[#0B5C45] text-white shadow-md border-2 border-[#0B5C45] scale-[1.01]'
                  : 'bg-white text-slate-800 border-2 border-amber-400 hover:border-amber-500 animate-tab-blink hover:bg-amber-50 shadow-xs'
              }`}
            >
              <BookOpen className={`w-4 h-4 shrink-0 ${viewMode === 'LEDGER_CARD' ? 'text-amber-300' : 'text-amber-700'}`} />
              <span className="truncate">{language === 'EN' ? 'Member Ledger Card' : 'खातेदार खाते उतारा (Ledger Card)'}</span>
              {viewMode !== 'LEDGER_CARD' && (
                <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-white shadow-xs inline-flex items-center gap-1 shrink-0 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                  <span>{language === 'EN' ? 'Click' : 'टॅब उपलब्ध'}</span>
                </span>
              )}
            </button>

            <button
              onClick={() => setViewMode('SUMMARY')}
              className={`flex-1 sm:flex-initial px-4 py-2.5 min-h-[46px] rounded-xl text-xs font-black transition-all flex items-center justify-center space-x-2 touch-target cursor-pointer relative ${
                viewMode === 'SUMMARY'
                  ? 'bg-[#0B5C45] text-white shadow-md border-2 border-[#0B5C45] scale-[1.01]'
                  : 'bg-white text-slate-800 border-2 border-amber-400 hover:border-amber-500 animate-tab-blink hover:bg-amber-50 shadow-xs'
              }`}
            >
              <BarChart3 className={`w-4 h-4 shrink-0 ${viewMode === 'SUMMARY' ? 'text-amber-300' : 'text-amber-700'}`} />
              <span className="truncate">{language === 'EN' ? 'Summary Report' : 'सामान्य अहवाल (Summary Report)'}</span>
              {viewMode !== 'SUMMARY' && (
                <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-white shadow-xs inline-flex items-center gap-1 shrink-0 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                  <span>{language === 'EN' ? 'Click' : 'टॅब उपलब्ध'}</span>
                </span>
              )}
            </button>

            {/* Thakbaki Report Tab */}
            <button
              onClick={() => setViewMode('THAKBAKI')}
              className={`flex-1 sm:flex-initial px-4 py-2.5 min-h-[46px] rounded-xl text-xs font-black transition-all flex items-center justify-center space-x-2 touch-target cursor-pointer relative ${
                viewMode === 'THAKBAKI'
                  ? 'bg-amber-700 text-white shadow-md border-2 border-amber-700 scale-[1.01]'
                  : 'bg-white text-slate-800 border-2 border-amber-400 hover:border-amber-500 animate-tab-blink hover:bg-amber-50 shadow-xs'
              }`}
            >
              <ClipboardList className={`w-4 h-4 shrink-0 ${viewMode === 'THAKBAKI' ? 'text-amber-200' : 'text-amber-700'}`} />
              <span className="truncate">{t.thakbakiReportTitle}</span>
              {viewMode !== 'THAKBAKI' && (
                <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-white shadow-xs inline-flex items-center gap-1 shrink-0 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                  <span>{language === 'EN' ? 'Click' : 'टॅब उपलब्ध'}</span>
                </span>
              )}
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
                    <tr className="border-b border-amber-900/30">
                      <td className="p-2.5 bg-[#8B4513] text-white font-extrabold">{language === 'EN' ? 'Installment (₹)' : 'हप्ता रुपये'}</td>
                      <td className="p-2.5 font-extrabold text-emerald-900 border-r border-amber-900/30">
                        ₹{activeLedgerCustomer.amount} ({activeLedgerCustomer.modality === 'W' ? (language === 'EN' ? 'Weekly' : 'साप्ताहिक') : (language === 'EN' ? 'Monthly' : 'मासिक')})
                      </td>
                      <td className="p-2.5 bg-[#8B4513] text-white font-extrabold">{language === 'EN' ? 'Address / Mobile' : 'पत्ता / मोबाईल'}</td>
                      <td className="p-2.5 font-extrabold text-slate-800">
                        {activeLedgerCustomer.address || '-'} ({activeLedgerCustomer.mobile})
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2.5 bg-[#8B4513] text-white font-extrabold">{language === 'EN' ? 'Total Bishi (with Int.)' : 'एकूण भिशी (व्याजासह)'}</td>
                      <td className="p-2.5 font-black text-emerald-950 text-sm sm:text-base border-r border-amber-900/30">
                        {formatCurrency(ledgerTotalExpWithInterest, language)}
                        <span className="text-[11px] font-bold text-slate-700 ml-1.5 block sm:inline">
                          (हप्ते: {formatCurrency(ledgerTotalBaseExpected, language)} + {language === 'EN' ? 'Int: +' : 'व्याज: +'}{formatCurrency(ledgerExpectedInterest, language)})
                        </span>
                      </td>
                      <td className="p-2.5 bg-[#8B4513] text-white font-extrabold">{language === 'EN' ? 'Dividend / Interest' : 'लाभांश / व्याजदर'}</td>
                      <td className="p-2.5 font-black text-blue-900 text-sm sm:text-base">
                        {ledgerCustRate}% ({activeLedgerCustomer.modality === 'W' ? (language === 'EN' ? 'Weekly' : 'साप्ताहिक') : (language === 'EN' ? 'Monthly' : 'मासिक')})
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
              <div className="overflow-x-auto table-responsive print:overflow-visible">
                <table className="w-full text-center text-xs font-bold border-collapse border border-amber-900/40 print:text-[8px] print:leading-tight print-fit-table">
                  <thead className="print:table-header-group">
                    <tr className="bg-[#f5e6d3] text-slate-900 border-b border-amber-900/40 break-inside-avoid">
                      <th rowSpan={2} className="p-2.5 print:p-1 border border-amber-900/40 w-12 print:w-6">{language === 'EN' ? 'Sr.' : 'अ. क्र.'}</th>
                      <th rowSpan={2} className="p-2.5 print:p-1 border border-amber-900/40 w-24 print:w-16">{language === 'EN' ? 'Date' : 'तारीख'}</th>
                      <th rowSpan={2} className="p-2.5 print:p-1 border border-amber-900/40 text-emerald-900">{language === 'EN' ? 'Deposit (₹)' : 'खात्यात जमा रुपये'}</th>
                      <th rowSpan={2} className="p-2.5 print:p-1 border border-amber-900/40 text-emerald-950">{language === 'EN' ? 'Total Deposit (₹)' : 'एकूण जमा रुपये'}</th>
                      <th rowSpan={2} className="p-2.5 print:p-1 border border-amber-900/40 text-rose-900">{language === 'EN' ? 'Penalty' : 'दंड'}</th>
                      <th rowSpan={2} className="p-2.5 print:p-1 border border-amber-900/40">{language === 'EN' ? 'Expected' : 'देणे'}</th>
                      <th rowSpan={2} className="p-2.5 print:p-1 border border-amber-900/40 text-amber-900">{language === 'EN' ? 'Loan Given' : 'दिलेले कर्ज'}</th>
                      <th colSpan={2} className="p-2.5 print:p-1 border border-amber-900/40 text-brand-900">{language === 'EN' ? 'Loan Repayment' : 'कर्ज परत फेड'}</th>
                      <th rowSpan={2} className="p-2.5 print:p-1 border border-amber-900/40 text-rose-900">{language === 'EN' ? 'Penalty' : 'दंड'}</th>
                      <th rowSpan={2} className="p-2.5 print:p-1 border border-amber-900/40 text-rose-950">{language === 'EN' ? 'Balance Due' : 'देणे बाकी'}</th>
                    </tr>
                    <tr className="bg-[#faebd7] text-slate-900 border-b border-amber-900/40 break-inside-avoid">
                      <th className="p-2 print:p-1 border border-amber-900/40">{language === 'EN' ? 'Principal' : 'कर्ज'}</th>
                      <th className="p-2 print:p-1 border border-amber-900/40">{language === 'EN' ? 'Interest' : 'व्याज'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!ledgerCalculation || ledgerCalculation.rows.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="p-8 print:p-4 text-center text-slate-500 font-bold text-xs print:text-[9px] bg-slate-50 border border-amber-900/30">
                          {language === 'EN'
                            ? 'No completed payments recorded yet for this customer.'
                            : 'या खातेदाराची अद्याप कोणतीही पूर्ण जमा नोंद झालेली नाही.'}
                        </td>
                      </tr>
                    ) : (
                      ledgerCalculation.rows.map((row) => (
                        <tr
                          key={row.id}
                          className="hover:bg-amber-100/40 transition-colors odd:bg-white even:bg-[#fcf8f2] border-b border-amber-900/20 break-inside-avoid"
                        >
                          <td className="p-2 print:p-1 border border-amber-900/30 font-extrabold text-slate-700">{row.srNo}</td>
                          <td className="p-2 print:p-1 border border-amber-900/30 font-bold text-slate-800">
                            {formatDateMarathi(row.date, language)}
                          </td>
                          <td className="p-2 print:p-1 border border-amber-900/30 text-right font-black text-emerald-700">
                            {row.deposit > 0 ? formatCurrency(row.deposit, language) : '-'}
                          </td>
                          <td className="p-2 print:p-1 border border-amber-900/30 text-right font-black text-emerald-900">
                            {row.cumulativeDeposit > 0 ? formatCurrency(row.cumulativeDeposit, language) : '-'}
                          </td>
                          <td className="p-2 print:p-1 border border-amber-900/30 text-right font-extrabold text-rose-700">
                            {row.bishiPenalty > 0 ? formatCurrency(row.bishiPenalty, language) : '-'}
                          </td>
                          <td className="p-2 print:p-1 border border-amber-900/30 text-right font-bold text-slate-800">
                            {row.expected > 0 ? formatCurrency(row.expected, language) : '-'}
                          </td>
                          <td className="p-2 print:p-1 border border-amber-900/30 text-right font-extrabold text-amber-800">
                            {row.loanIssued > 0 ? formatCurrency(row.loanIssued, language) : '-'}
                          </td>
                          <td className="p-2 print:p-1 border border-amber-900/30 text-right font-extrabold text-emerald-800">
                            {row.loanPrincipalPaid > 0 ? formatCurrency(row.loanPrincipalPaid, language) : '-'}
                          </td>
                          <td className="p-2 print:p-1 border border-amber-900/30 text-right font-extrabold text-emerald-800">
                            {row.loanInterestPaid > 0 ? formatCurrency(row.loanInterestPaid, language) : '-'}
                          </td>
                          <td className="p-2 print:p-1 border border-amber-900/30 text-right font-extrabold text-rose-700">
                            {row.loanPenalty > 0 ? formatCurrency(row.loanPenalty, language) : '-'}
                          </td>
                          <td className="p-2 print:p-1 border border-amber-900/30 text-right font-black text-rose-600">
                            {row.balanceRemaining > 0 ? formatCurrency(row.balanceRemaining, language) : '₹0'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot className="print:table-footer-group">
                    <tr className="bg-[#8B4513] text-white font-extrabold text-xs print:text-[8px] break-inside-avoid">
                      <td className="p-2 print:p-1 border border-amber-900/40 text-center">-</td>
                      <td className="p-2 print:p-1 border border-amber-900/40 text-center">{language === 'EN' ? 'TOTAL' : 'एकूण'}</td>
                      <td className="p-2 print:p-1 border border-amber-900/40 text-right text-emerald-200 font-black">
                        {ledgerCalculation && ledgerCalculation.totalDeposit > 0 ? formatCurrency(ledgerCalculation.totalDeposit, language) : '-'}
                      </td>
                      <td className="p-2 print:p-1 border border-amber-900/40 text-right text-emerald-100 font-black">
                        {ledgerCalculation && ledgerCalculation.totalCumulativeDeposit > 0 ? formatCurrency(ledgerCalculation.totalCumulativeDeposit, language) : '-'}
                      </td>
                      <td className="p-2 print:p-1 border border-amber-900/40 text-right text-rose-200">
                        {ledgerCalculation && ledgerCalculation.totalBishiPenalty > 0 ? formatCurrency(ledgerCalculation.totalBishiPenalty, language) : '-'}
                      </td>
                      <td className="p-2 print:p-1 border border-amber-900/40 text-right">
                        {ledgerCalculation && ledgerCalculation.totalExpected > 0 ? formatCurrency(ledgerCalculation.totalExpected, language) : '-'}
                      </td>
                      <td className="p-2 print:p-1 border border-amber-900/40 text-right text-amber-200">
                        {ledgerCalculation && ledgerCalculation.totalLoanIssued > 0 ? formatCurrency(ledgerCalculation.totalLoanIssued, language) : '-'}
                      </td>
                      <td className="p-2 print:p-1 border border-amber-900/40 text-right text-emerald-200 font-black">
                        {ledgerCalculation && ledgerCalculation.totalLoanPrincipalPaid > 0 ? formatCurrency(ledgerCalculation.totalLoanPrincipalPaid, language) : '-'}
                      </td>
                      <td className="p-2 print:p-1 border border-amber-900/40 text-right text-emerald-200 font-black">
                        {ledgerCalculation && ledgerCalculation.totalLoanInterestPaid > 0 ? formatCurrency(ledgerCalculation.totalLoanInterestPaid, language) : '-'}
                      </td>
                      <td className="p-2 print:p-1 border border-amber-900/40 text-right text-rose-200">
                        {ledgerCalculation && ledgerCalculation.totalLoanPenalty > 0 ? formatCurrency(ledgerCalculation.totalLoanPenalty, language) : '-'}
                      </td>
                      <td className="p-2 print:p-1 border border-amber-900/40 text-right text-rose-200 font-black">
                        {ledgerCalculation && ledgerCalculation.finalRemainingBalance > 0 ? formatCurrency(ledgerCalculation.finalRemainingBalance, language) : '₹0'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Footer Block matching media_1789461835687.jpg */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 pt-4 border-t border-amber-900/30 text-xs font-extrabold text-slate-800">
                <div className="bg-[#fffde7] border border-amber-900/30 p-3 rounded-lg space-y-1.5 w-full sm:w-80 shadow-xs">
                  <div>{language === 'EN' ? '1) Bid/Draw: ___________________' : '१) टाकणी: ___________________'}</div>
                  <div className="text-emerald-900 font-black">
                    {language === 'EN' ? '2) Dividend / Interest (' : '२) डिव्हिडंड / व्याज ('}{ledgerCustRate}%): {formatCurrency(ledgerEarnedInterest, language)}
                  </div>
                  <div>{language === 'EN' ? '3) Acc No: ' : '३) खाते नं.: '}<strong>{activeLedgerCustomer.accountNumber}</strong></div>
                  <div className="text-blue-950 font-black">
                    {language === 'EN' ? '4) Total Return Payout: ' : '४) एकूण अंतिम परतावा: '}{formatCurrency(ledgerTotalPayout, language)}
                  </div>
                </div>

                <div className="text-right w-full sm:w-auto pr-4">
                  <p className="mb-8 font-black text-slate-900 text-xs sm:text-sm">
                    {language === 'EN'
                      ? `Acknowledged receipt of total Bishi amount ${formatCurrency(ledgerTotalPayout, language)} (with interest)...`
                      : `सदर भिशीची एकूण रक्कम ${formatCurrency(ledgerTotalPayout, language)} (व्याजासह) मिळाल्या बद्दल...`}
                  </p>
                  <div className="border-t-2 border-slate-900 pt-1 inline-block min-w-44 text-center font-black text-slate-900">
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

          {/* Summary Overview Cards Bar */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 no-print w-full min-w-0">
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs min-w-0">
              <span className="text-[11px] font-bold text-slate-500 block uppercase truncate">
                {language === 'EN' ? 'Total Accounts' : 'एकूण खातेदार'}
              </span>
              <span className="text-xl font-black text-slate-900 mt-0.5 block truncate">{filteredRows.length}</span>
            </div>

            <div className="bg-gradient-to-br from-emerald-50 to-teal-50/40 p-3.5 rounded-2xl border border-emerald-200/80 shadow-2xs min-w-0">
              <span className="text-[11px] font-bold text-emerald-800 block uppercase truncate">
                {language === 'EN' ? 'Total Bishi (with Int.)' : 'एकूण भिशी (व्याजासह)'}
              </span>
              <span className="text-xl font-black text-emerald-950 mt-0.5 block truncate">
                {formatCurrency(grandTotalExpWithInterest, language)}
              </span>
              <span className="text-[10px] font-semibold text-emerald-700 block mt-0.5 truncate">
                ({language === 'EN' ? 'Inst: ' : 'हप्ते: '}{formatCurrency(grandExpected, language)} + {language === 'EN' ? 'Int: +' : 'व्याज: +'}{formatCurrency(grandExpectedInterest, language)})
              </span>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs min-w-0">
              <span className="text-[11px] font-bold text-slate-500 block uppercase truncate">
                {language === 'EN' ? 'Actual Collected' : 'प्रत्यक्ष जमा'}
              </span>
              <span className="text-xl font-black text-emerald-700 mt-0.5 block truncate">
                {formatCurrency(grandCollected, language)}
              </span>
              <span className="text-[10px] font-semibold text-rose-600 block mt-0.5 truncate">
                {language === 'EN' ? 'Remaining: ' : 'बाकी: '}{formatCurrency(grandRemaining, language)}
              </span>
            </div>

            <div className="bg-gradient-to-br from-blue-50 to-indigo-50/40 p-3.5 rounded-2xl border border-blue-200/80 shadow-2xs min-w-0">
              <span className="text-[11px] font-bold text-blue-800 block uppercase truncate">
                {language === 'EN' ? 'Total Return / Payable' : 'एकूण परतावा / देय'}
              </span>
              <span className="text-xl font-black text-blue-950 mt-0.5 block truncate">
                {formatCurrency(grandGrossReturn, language)}
              </span>
              <span className="text-[10px] font-semibold text-blue-700 block mt-0.5 truncate">
                {grandLoanDeduction > 0
                  ? `(${language === 'EN' ? 'Net after loan: ' : 'कर्ज वजा करून: '}${formatCurrency(grandFinalReturn, language)})`
                  : `${language === 'EN' ? 'Earned Int: +' : 'जमा व्याज: +'}${formatCurrency(grandInterest, language)}`}
              </span>
            </div>
          </div>

          {/* Report Data Table Card */}
          <div className="w-full max-w-full bg-white rounded-2xl border border-slate-300 shadow-sm overflow-hidden print:border-none print:shadow-none">
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
                  {filteredRows.map(({ customer: cust, exp, expectedInterest, totalExpWithInterest, coll, rem, int, pen, hasLoan, unpaidLoan, totalPrincipalLoan, loanDeduction, bishiGrossReturn, netReturn, isLoanOnly, isPaid, isPending, isPartial, totalPayable, extraSubmitted, totalWithExtra }, idx) => (
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
                            {language === 'EN' ? 'Total Bishi (with Int.)' : 'एकूण भिशी (व्याजासह)'}
                          </span>
                          <span className="text-slate-900 font-black text-sm">{formatCurrency(totalExpWithInterest, language)}</span>
                          <span className="text-[10px] text-slate-500 font-bold block">
                            ({formatCurrency(exp, language)} + {language === 'EN' ? 'Int: +' : 'व्याज: +'}{formatCurrency(expectedInterest, language)})
                          </span>
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

                      {/* 4 Fields in Mobile Card */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-blue-50/60 p-2.5 rounded-xl border border-blue-100 flex flex-col justify-between items-center text-center">
                          <span className="text-[10px] text-blue-900 font-extrabold block">
                            {language === 'EN' ? 'Total Payable' : 'एकूण देय'}
                          </span>
                          <span className="font-bold text-blue-950 mt-1 text-xs">
                            {totalPayable > 0 ? formatCurrency(totalPayable, language) : '-'}
                          </span>
                        </div>
                        <div className="bg-purple-50/60 p-2.5 rounded-xl border border-purple-100 flex flex-col justify-between items-center text-center">
                          <span className="text-[10px] text-purple-900 font-extrabold block">
                            {language === 'EN' ? 'Extra Subm.' : 'जादा जमा'}
                          </span>
                          <span className="font-bold text-purple-950 mt-1 text-xs">
                            {extraSubmitted > 0 ? `+${formatCurrency(extraSubmitted, language)}` : '-'}
                          </span>
                        </div>
                        <div className="bg-amber-50/70 p-2.5 rounded-xl border border-amber-200/80 flex flex-col justify-between items-center text-center">
                          <span className="text-[10px] text-amber-900 font-extrabold block">
                            {language === 'EN' ? 'Loan (Unpaid)' : 'कर्ज (बाकी)'}
                          </span>
                          <div className="mt-1 flex flex-col items-center">
                            <span className="font-black text-amber-950 text-xs">
                              {unpaidLoan > 0 ? (
                                <Link to={`/customers/${cust.id}`} className="underline hover:text-amber-700">
                                  {formatCurrency(unpaidLoan, language)}
                                </Link>
                              ) : hasLoan ? (
                                '₹0'
                              ) : (
                                '-'
                              )}
                            </span>
                            {hasLoan && unpaidLoan === 0 && (
                              <span className="text-[9px] text-emerald-700 font-bold block mt-0.5">
                                {language === 'EN' ? 'Paid' : 'फेड झाले'}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="bg-emerald-50/70 p-2.5 rounded-xl border border-emerald-200/80 flex flex-col justify-between items-center text-center">
                          <span className="text-[10px] text-emerald-900 font-extrabold block">
                            {language === 'EN' ? 'Total Return' : 'एकूण परतावा'}
                          </span>
                          <div className="mt-1 flex flex-col items-center">
                            <span className="font-black text-emerald-950 text-xs">
                              {isLoanOnly ? '-' : bishiGrossReturn > 0 ? formatCurrency(bishiGrossReturn, language) : '-'}
                            </span>
                            {!isLoanOnly && unpaidLoan > 0 && bishiGrossReturn > 0 && (
                              <div className="text-[10px] text-rose-600 font-extrabold leading-tight mt-0.5">
                                <div>
                                  - कर्ज: {formatCurrency(unpaidLoan, language)}
                                </div>
                                {unpaidLoan >= bishiGrossReturn ? (
                                  <span className="text-amber-700 block text-[9px] font-bold">
                                    (बाकी: {formatCurrency(unpaidLoan - bishiGrossReturn, language)})
                                  </span>
                                ) : (
                                  <span className="text-emerald-700 block text-[9px] font-bold">
                                    (हात: {formatCurrency(netReturn, language)})
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop & Print Table View */}
                {/* Modern Desktop Toolbar & Horizontal Scroll Indicator */}
                <div className="hidden md:flex items-center justify-between px-4 py-2 bg-gradient-to-r from-emerald-900 to-slate-900 text-white text-xs border-b border-emerald-800 print:hidden">
                  <div className="flex items-center space-x-3">
                    <span className="flex h-2.5 w-2.5 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                    <span className="font-black tracking-wide">
                      {reportTitle}
                    </span>
                    <span className="bg-emerald-800/90 px-2.5 py-0.5 rounded-full text-[11px] font-black text-emerald-200">
                      {filteredRows.length} {language === 'EN' ? 'Accounts' : 'खातेदार'}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 text-[11px] font-bold text-emerald-200">
                    <span className="bg-white/10 px-2.5 py-0.5 rounded-lg border border-white/15">
                      {language === 'EN' ? '← Frozen Account & Name | Scroll right for all columns →' : '← खातेदार माहिती स्थिर | उर्वरित कॉलमसाठी उजवीकडे स्क्रोल करा →'}
                    </span>
                  </div>
                </div>

                <div className="hidden md:block print:block overflow-x-auto print:overflow-visible custom-scrollbar relative max-w-full">
                  <table className="w-full text-left text-xs border-collapse print:text-[8px] print:leading-tight print-fit-table">
                    <thead className="bg-emerald-950 text-white font-extrabold print:bg-emerald-950 print:text-white print:table-header-group sticky top-0 z-20 shadow-xs">
                      <tr>
                        {/* Sticky Column 1: # */}
                        <th className="p-2.5 print:p-1 text-center border-r border-b border-emerald-800 w-12 min-w-[48px] max-w-[48px] sticky left-0 z-30 bg-emerald-950 text-white align-middle shadow-[1px_0_0_0_#064e3b]">
                          #
                        </th>
                        {/* Sticky Column 2: Account No */}
                        <th className="p-2.5 print:p-1 print:px-1 border-r border-b border-emerald-800 text-center whitespace-nowrap w-20 min-w-[80px] max-w-[80px] sticky left-[48px] z-30 bg-emerald-950 text-white align-middle shadow-[1px_0_0_0_#064e3b]">
                          {t.colAccountNo}
                        </th>
                        {/* Sticky Column 3: Full Name */}
                        <th className="p-2.5 print:p-1 print:px-1.5 border-r-2 border-b border-emerald-800 text-left whitespace-nowrap min-w-[170px] max-w-[220px] sticky left-[128px] z-30 bg-emerald-950 text-white align-middle shadow-[4px_0_8px_-2px_rgba(0,0,0,0.35)]">
                          {t.colFullName}
                        </th>

                        {/* Scrollable Columns 4 through 14 */}
                        <th className="p-2.5 print:p-1 print:px-1 border-r border-b border-emerald-800 text-center whitespace-nowrap min-w-[110px] align-middle">{t.colMobile}</th>
                        <th className="p-2.5 print:p-1 print:px-1 border-r border-b border-emerald-800 text-center whitespace-nowrap min-w-[145px] align-middle">{t.colBishi}</th>
                        <th className="p-2.5 print:p-1 print:px-1 text-right border-r border-b border-emerald-800 whitespace-nowrap min-w-[160px] align-middle">{language === 'EN' ? 'Total Bishi (with Int.) (₹)' : 'एकूण भिशी (व्याजासह) (₹)'}</th>
                        <th className="p-2.5 print:p-1 print:px-1 text-right border-r border-b border-emerald-800 whitespace-nowrap min-w-[115px] align-middle">{t.colCollectedAmount}</th>
                        <th className="p-2.5 print:p-1 print:px-1 text-right border-r border-b border-emerald-800 whitespace-nowrap min-w-[115px] align-middle">{t.colRemainingAmount}</th>
                        <th className="p-2.5 print:p-1 print:px-1 text-right border-r border-b border-emerald-800 whitespace-nowrap min-w-[120px] align-middle">{language === 'EN' ? 'Interest/Penalty (₹)' : 'व्याज/दंड (₹)'}</th>
                        <th className="p-2.5 print:p-1 print:px-1 text-right border-r border-b border-emerald-800 bg-amber-950/50 print:bg-amber-950/20 whitespace-nowrap min-w-[125px] align-middle">{language === 'EN' ? 'Loan (₹)' : 'कर्ज (₹)'}</th>
                        <th className="p-2.5 print:p-1 print:px-1 text-right border-r border-b border-emerald-800 bg-emerald-900/60 print:bg-emerald-950/20 whitespace-nowrap min-w-[120px] align-middle">{language === 'EN' ? 'Total Payable (₹)' : 'एकूण देय (₹)'}</th>
                        <th className="p-2.5 print:p-1 print:px-1 text-right border-r border-b border-emerald-800 bg-purple-950/50 print:bg-purple-950/20 whitespace-nowrap min-w-[120px] align-middle">{language === 'EN' ? 'Extra Submitted (₹)' : 'जादा जमा (₹)'}</th>
                        <th className="p-2.5 print:p-1 print:px-1 text-right border-r border-b border-emerald-800 bg-teal-950/60 print:bg-teal-950/20 whitespace-nowrap min-w-[160px] align-middle">{language === 'EN' ? 'Total Return (₹)' : 'एकूण परतावा (₹)'}</th>
                        <th className="p-2.5 print:p-1 print:px-1 text-center border-b border-emerald-800 whitespace-nowrap min-w-[100px] align-middle">{t.colStatus}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-medium">
                      {filteredRows.map(({ customer: cust, exp, expectedInterest, totalExpWithInterest, coll, rem, int, pen, hasLoan, unpaidLoan, totalPrincipalLoan, loanDeduction, bishiGrossReturn, netReturn, isLoanOnly, isPaid, isPending, isPartial, totalPayable, extraSubmitted, totalWithExtra }, idx) => (
                        <tr key={cust.id} className="group hover:bg-[#EEF7F2] transition-colors odd:bg-white even:bg-slate-50/70 break-inside-avoid">
                          {/* Sticky Col 1: # */}
                          <td className="p-2.5 print:p-1 text-center font-bold text-slate-700 border-r border-b border-slate-200 w-12 min-w-[48px] max-w-[48px] sticky left-0 z-10 bg-white group-even:bg-slate-50 group-hover:bg-[#EEF7F2] align-middle shadow-[1px_0_0_0_#e2e8f0]">
                            {idx + 1}
                          </td>

                          {/* Sticky Col 2: Account No */}
                          <td className="p-2.5 print:p-1 print:px-1 text-center border-r border-b border-slate-200 whitespace-nowrap w-20 min-w-[80px] max-w-[80px] sticky left-[48px] z-10 bg-white group-even:bg-slate-50 group-hover:bg-[#EEF7F2] align-middle shadow-[1px_0_0_0_#e2e8f0]">
                            <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900 text-xs font-black inline-block whitespace-nowrap">
                              {cust.accountNumber}
                            </span>
                          </td>

                          {/* Sticky Col 3: Customer Name */}
                          <td className="p-2.5 print:p-1 print:px-1.5 border-r-2 border-b border-slate-300 whitespace-nowrap min-w-[170px] max-w-[220px] sticky left-[128px] z-10 bg-white group-even:bg-slate-50 group-hover:bg-[#EEF7F2] align-middle shadow-[4px_0_8px_-2px_rgba(0,0,0,0.1)]">
                            <div className="font-bold text-slate-900 text-xs sm:text-sm truncate whitespace-nowrap" title={cust.name}>
                              {cust.name}
                            </div>
                          </td>

                          {/* Col 4: Mobile */}
                          <td className="p-2.5 print:p-1 print:px-1 text-center text-slate-600 font-semibold border-r border-b border-slate-200 whitespace-nowrap min-w-[110px] align-middle">
                            {cust.mobile || '-'}
                          </td>

                          {/* Col 5: Bishi Scheme */}
                          <td className="p-2.5 print:p-1 print:px-1 text-center border-r border-b border-slate-200 whitespace-nowrap min-w-[145px] align-middle">
                            <span className="inline-block px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 font-bold text-[11px] border border-slate-200/80 whitespace-nowrap">
                              {getBishiNameMarathi(cust.bishiType, language)}
                            </span>
                          </td>

                          {/* Col 6: Total Bishi (with Int.) */}
                          <td className="p-2.5 print:p-1 print:px-1 text-right font-bold text-slate-900 border-r border-b border-slate-200 whitespace-nowrap min-w-[160px] align-middle">
                            <div className="flex flex-col items-end text-right whitespace-nowrap">
                              <span className="font-black text-slate-900 text-xs sm:text-sm">{formatCurrency(totalExpWithInterest, language)}</span>
                              <span className="text-[10px] text-slate-500 font-bold whitespace-nowrap">
                                ({formatCurrency(exp, language)} + {language === 'EN' ? 'Int: +' : 'व्याज: +'}{formatCurrency(expectedInterest, language)})
                              </span>
                            </div>
                          </td>

                          {/* Col 7: Collected */}
                          <td className="p-2.5 print:p-1 print:px-1 text-right font-black text-emerald-700 border-r border-b border-slate-200 whitespace-nowrap min-w-[115px] align-middle">
                            {formatCurrency(coll, language)}
                          </td>

                          {/* Col 8: Remaining */}
                          <td className="p-2.5 print:p-1 print:px-1 text-right font-black text-rose-600 border-r border-b border-slate-200 whitespace-nowrap min-w-[115px] align-middle">
                            {formatCurrency(rem, language)}
                          </td>

                          {/* Col 9: Interest/Penalty */}
                          <td className="p-2.5 print:p-1 print:px-1 text-right text-slate-800 border-r border-b border-slate-200 whitespace-nowrap min-w-[120px] align-middle">
                            <div className="flex flex-col items-end text-right whitespace-nowrap">
                              {int > 0 && <span className="text-blue-700 font-extrabold text-xs whitespace-nowrap">{language === 'EN' ? 'Int: ' : 'व्याज: '}{formatCurrency(int, language)}</span>}
                              {pen > 0 && <span className="text-amber-800 font-extrabold text-xs whitespace-nowrap">{language === 'EN' ? 'Pen: ' : 'दंड: '}{formatCurrency(pen, language)}</span>}
                              {int === 0 && pen === 0 && <span className="text-slate-400 font-bold">-</span>}
                            </div>
                          </td>

                          {/* Col 10: Loan */}
                          <td className="p-2.5 print:p-1 print:px-1 text-right border-r border-b border-slate-200 whitespace-nowrap min-w-[125px] bg-amber-50/25 align-middle">
                            {unpaidLoan > 0 ? (
                              <Link
                                to={`/customers/${cust.id}`}
                                className="group/loan flex flex-col items-end text-right hover:opacity-85 transition-opacity whitespace-nowrap"
                                title={language === 'EN' ? 'Click to view / pay loan' : 'कर्ज पाहण्यासाठी किंवा परतफेड करण्यासाठी क्लिक करा'}
                              >
                                <span className="font-black text-amber-900 group-hover/loan:text-amber-700 underline decoration-amber-400 text-xs sm:text-sm">
                                  {formatCurrency(unpaidLoan, language)}
                                </span>
                                <span className="text-[10px] text-amber-700 font-bold whitespace-nowrap">
                                  {totalPrincipalLoan > unpaidLoan
                                    ? `${language === 'EN' ? 'Bal: ' : 'शिल्लक: '}${formatCurrency(unpaidLoan, language)}`
                                    : (language === 'EN' ? 'Unpaid' : 'बाकी कर्ज')}
                                </span>
                              </Link>
                            ) : hasLoan ? (
                              <div className="flex flex-col items-end text-right whitespace-nowrap">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  ₹0 • {language === 'EN' ? 'Paid' : 'फेड'}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400 font-bold">-</span>
                            )}
                          </td>

                          {/* Col 11: Total Payable */}
                          <td className="p-2.5 print:p-1 print:px-1 text-right font-black text-blue-900 border-r border-b border-slate-200 whitespace-nowrap min-w-[120px] bg-blue-50/20 align-middle">
                            {totalPayable > 0 ? formatCurrency(totalPayable, language) : '-'}
                          </td>

                          {/* Col 12: Extra Submitted */}
                          <td className="p-2.5 print:p-1 print:px-1 text-right font-bold text-purple-900 border-r border-b border-slate-200 whitespace-nowrap min-w-[120px] bg-purple-50/20 align-middle">
                            {extraSubmitted > 0 ? (
                              <span className="inline-block px-2 py-0.5 rounded bg-purple-100 text-purple-900 font-black text-xs whitespace-nowrap">
                                +{formatCurrency(extraSubmitted, language)}
                              </span>
                            ) : (
                              <span className="text-slate-400 font-bold">-</span>
                            )}
                          </td>

                          {/* Col 13: Total Return */}
                          <td className="p-2.5 print:p-1 print:px-1 text-right font-black text-emerald-800 border-r border-b border-slate-200 whitespace-nowrap min-w-[160px] bg-emerald-50/30 align-middle">
                            {isLoanOnly ? (
                              <span className="text-slate-400 font-bold">-</span>
                            ) : bishiGrossReturn > 0 ? (
                              <div className="flex flex-col items-end text-right whitespace-nowrap">
                                <span className="font-black text-emerald-950 text-xs sm:text-sm">
                                  {formatCurrency(bishiGrossReturn, language)}
                                </span>
                                {unpaidLoan > 0 && (
                                  <div className="text-[10px] text-rose-600 font-extrabold mt-0.5 leading-tight text-right whitespace-nowrap">
                                    <span>
                                      {language === 'EN' ? '- Loan: ' : '- कर्ज: '}
                                      {formatCurrency(unpaidLoan, language)}
                                    </span>
                                    {unpaidLoan >= bishiGrossReturn ? (
                                      <span className="text-amber-700 block text-[9px] font-bold whitespace-nowrap">
                                        ({language === 'EN' ? 'Bal Due: ' : 'बाकी देणे: '}
                                        {formatCurrency(unpaidLoan - bishiGrossReturn, language)})
                                      </span>
                                    ) : (
                                      <span className="text-emerald-700 block text-[9px] font-bold whitespace-nowrap">
                                        ({language === 'EN' ? 'Net Payout: ' : 'हात परतावा: '}
                                        {formatCurrency(netReturn, language)})
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 font-bold">-</span>
                            )}
                          </td>

                          {/* Col 14: Status */}
                          <td className="p-2.5 print:p-1 print:px-1 text-center border-b border-slate-200 whitespace-nowrap min-w-[100px] align-middle">
                            <span
                              className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-[10px] font-extrabold whitespace-nowrap border shadow-2xs ${
                                isPaid
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : isPartial
                                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                                  : 'bg-rose-100 text-rose-800 border-rose-300'
                              }`}
                            >
                              {isPaid ? `✅ ${t.statusPaid}` : isPartial ? `⏳ ${t.statusPartial}` : `❌ ${t.statusPending}`}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-emerald-950 text-white font-black text-xs print:text-[8px] print:bg-emerald-950 print:text-white print:table-footer-group sticky bottom-0 z-20 shadow-md">
                      <tr className="break-inside-avoid">
                        {/* Sticky Col 1: # */}
                        <td className="p-2.5 print:p-1 text-center border-r border-t-2 border-emerald-800 w-12 min-w-[48px] max-w-[48px] sticky left-0 z-30 bg-emerald-950 text-white align-middle shadow-[1px_0_0_0_#064e3b]">
                          -
                        </td>
                        {/* Sticky Col 2: Account No */}
                        <td className="p-2.5 print:p-1 print:px-1 text-center border-r border-t-2 border-emerald-800 whitespace-nowrap w-20 min-w-[80px] max-w-[80px] sticky left-[48px] z-30 bg-emerald-950 text-white align-middle font-extrabold shadow-[1px_0_0_0_#064e3b]">
                          {language === 'EN' ? 'TOTAL' : 'एकूण'}
                        </td>
                        {/* Sticky Col 3: Customer Name */}
                        <td className="p-2.5 print:p-1 print:px-1.5 border-r-2 border-t-2 border-emerald-800 whitespace-nowrap min-w-[170px] max-w-[220px] sticky left-[128px] z-30 bg-emerald-950 text-white align-middle font-black shadow-[4px_0_8px_-2px_rgba(0,0,0,0.35)]">
                          {language === 'EN' ? 'Accounts: ' : 'खातेदार: '}{filteredRows.length}
                        </td>

                        {/* Col 4: Mobile */}
                        <td className="p-2.5 print:p-1 border-r border-t-2 border-emerald-800 text-center text-slate-400 whitespace-nowrap min-w-[110px] align-middle">-</td>

                        {/* Col 5: Scheme */}
                        <td className="p-2.5 print:p-1 border-r border-t-2 border-emerald-800 text-center text-slate-400 whitespace-nowrap min-w-[145px] align-middle">-</td>

                        {/* Col 6: Total Bishi (with Int.) */}
                        <td className="p-2.5 print:p-1 print:px-1 text-right border-r border-t-2 border-emerald-800 text-emerald-200 font-black whitespace-nowrap min-w-[160px] align-middle">
                          <div className="flex flex-col items-end text-right whitespace-nowrap">
                            <span className="text-sm font-black text-white">{formatCurrency(grandTotalExpWithInterest, language)}</span>
                            <span className="text-[10px] text-emerald-300 font-bold whitespace-nowrap">
                              ({language === 'EN' ? 'Inst: ' : 'हप्ते: '}{formatCurrency(grandExpected, language)} + {language === 'EN' ? 'Int: +' : 'व्याज: +'}{formatCurrency(grandExpectedInterest, language)})
                            </span>
                          </div>
                        </td>

                        {/* Col 7: Collected */}
                        <td className="p-2.5 print:p-1 print:px-1 text-right border-r border-t-2 border-emerald-800 text-emerald-300 font-black whitespace-nowrap min-w-[115px] align-middle">
                          {formatCurrency(grandCollected, language)}
                        </td>

                        {/* Col 8: Remaining */}
                        <td className="p-2.5 print:p-1 print:px-1 text-right border-r border-t-2 border-emerald-800 text-rose-300 font-black whitespace-nowrap min-w-[115px] align-middle">
                          {formatCurrency(grandRemaining, language)}
                        </td>

                        {/* Col 9: Interest/Penalty */}
                        <td className="p-2.5 print:p-1 print:px-1 text-right border-r border-t-2 border-emerald-800 text-amber-200 font-bold whitespace-nowrap min-w-[120px] align-middle">
                          <div className="flex flex-col items-end text-right whitespace-nowrap">
                            {grandInterest > 0 && <span>{language === 'EN' ? 'Int: ' : 'व्याज: '}{formatCurrency(grandInterest, language)}</span>}
                            {grandPenalty > 0 && <span>{language === 'EN' ? 'Pen: ' : 'दंड: '}{formatCurrency(grandPenalty, language)}</span>}
                            {grandInterest === 0 && grandPenalty === 0 && '-'}
                          </div>
                        </td>

                        {/* Col 10: Loan */}
                        <td className="p-2.5 print:p-1 print:px-1 text-right border-r border-t-2 border-emerald-800 text-amber-200 font-black whitespace-nowrap min-w-[125px] align-middle">
                          {grandUnpaidLoan > 0 ? formatCurrency(grandUnpaidLoan, language) : '-'}
                        </td>

                        {/* Col 11: Total Payable */}
                        <td className="p-2.5 print:p-1 print:px-1 text-right border-r border-t-2 border-emerald-800 text-blue-200 font-black whitespace-nowrap min-w-[120px] align-middle">
                          {formatCurrency(grandPayable, language)}
                        </td>

                        {/* Col 12: Extra Submitted */}
                        <td className="p-2.5 print:p-1 print:px-1 text-right border-r border-t-2 border-emerald-800 text-purple-200 font-black whitespace-nowrap min-w-[120px] align-middle">
                          {formatCurrency(grandExtraSubmitted, language)}
                        </td>

                        {/* Col 13: Total Return */}
                        <td className="p-2.5 print:p-1 print:px-1 text-right border-r border-t-2 border-emerald-800 text-emerald-300 font-black whitespace-nowrap min-w-[160px] align-middle">
                          <div className="flex flex-col items-end text-right whitespace-nowrap">
                            <span className="text-sm font-black">{formatCurrency(grandGrossReturn, language)}</span>
                            {grandLoanDeduction > 0 && (
                              <span className="text-[10px] text-rose-300 font-bold whitespace-nowrap">
                                (-कर्ज: {formatCurrency(grandLoanDeduction, language)} | {language === 'EN' ? 'Net: ' : 'हात: '}{formatCurrency(grandFinalReturn, language)})
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Col 14: Status */}
                        <td className="p-2.5 print:p-1 text-center border-t-2 border-emerald-800 whitespace-nowrap min-w-[100px] align-middle">-</td>
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

      {/* ══ VIEW 3: THAKBAKI REPORT ══════════════════════════════════════════ */}
      {viewMode === 'THAKBAKI' && (() => {
        const totalCustomers = thakbakiList.length;
        const totalInitial = thakbakiList.reduce((s, e) => s + (e.initialAmount || 0), 0);
        const totalPaid = thakbakiList.reduce((s, e) => s + (e.paidAmount || 0), 0);
        const totalRemaining = thakbakiList.reduce((s, e) => s + (e.remainingAmount || 0), 0);
        const pendingCount = thakbakiList.filter((e) => e.status === 'PENDING').length;
        const clearedCount = thakbakiList.filter((e) => e.status === 'CLEARED').length;

        return (
          <div className="space-y-4 print-container">
            {/* Summary Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 no-print">
              <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs text-center">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{t.thakbakiTotalCustomers}</p>
                <p className="text-2xl font-black text-slate-900 mt-1">{totalCustomers}</p>
              </div>
              <div className="bg-rose-50 rounded-2xl p-4 border border-rose-200 shadow-xs text-center">
                <p className="text-[10px] font-bold text-rose-500 uppercase tracking-wide">{t.thakbakiTotalInitial}</p>
                <p className="text-lg font-black text-rose-700 mt-1">{formatCurrency(totalInitial, language)}</p>
              </div>
              <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-200 shadow-xs text-center">
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">{t.thakbakiTotalPaid}</p>
                <p className="text-lg font-black text-emerald-700 mt-1">{formatCurrency(totalPaid, language)}</p>
              </div>
              <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200 shadow-xs text-center">
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">{t.thakbakiTotalRemaining}</p>
                <p className="text-lg font-black text-amber-700 mt-1">{formatCurrency(totalRemaining, language)}</p>
              </div>
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 shadow-xs text-center">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                  {language === 'EN' ? 'Pending / Cleared' : 'बाकी / पूर्ण'}
                </p>
                <p className="text-lg font-black text-slate-900 mt-1">
                  <span className="text-amber-700">{pendingCount}</span>
                  <span className="text-slate-400 font-medium mx-1">/</span>
                  <span className="text-emerald-700">{clearedCount}</span>
                </p>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden print:rounded-none print:border-none print:shadow-none">
              <div className="bg-amber-700 px-5 py-3 print:py-4">
                <h3 className="text-white font-extrabold text-sm">{language === 'EN' ? 'Sushant Bishi - ' : 'सुषांत भिशी - '}{t.thakbakiReportTitle}</h3>
                <p className="text-amber-200 text-[10px] font-medium">
                  {formatDateMarathi(new Date().toISOString().split('T')[0], language)} | {language === 'EN' ? 'Records: ' : 'एकूण नोंदी: '}{totalCustomers}
                </p>
              </div>
              <div className="overflow-x-auto print:overflow-visible">
                <table className="w-full text-xs print:text-[8.5px] print:leading-tight print-fit-table">
                  <thead className="print:table-header-group">
                    <tr className="bg-amber-900 text-white break-inside-avoid">
                      <th className="px-3 py-2.5 print:p-1 text-center font-bold whitespace-nowrap">अ.क्र.</th>
                      <th className="px-3 py-2.5 print:p-1 text-left font-bold whitespace-nowrap">{t.thakbakiAccountNo}</th>
                      <th className="px-3 py-2.5 print:p-1 text-left font-bold whitespace-nowrap">{t.thakbakiCustomerName}</th>
                      <th className="px-3 py-2.5 print:p-1 text-left font-bold whitespace-nowrap">{t.thakbakiMobile}</th>
                      <th className="px-3 py-2.5 print:p-1 text-left font-bold whitespace-nowrap">{language === 'EN' ? 'Office' : 'कार्यालय'}</th>
                      <th className="px-3 py-2.5 print:p-1 text-right font-bold whitespace-nowrap">{t.thakbakiInitialAmount}</th>
                      <th className="px-3 py-2.5 print:p-1 text-right font-bold whitespace-nowrap">{t.thakbakiPaidAmount}</th>
                      <th className="px-3 py-2.5 print:p-1 text-right font-bold whitespace-nowrap">{t.thakbakiRemainingAmount}</th>
                      <th className="px-3 py-2.5 print:p-1 text-center font-bold whitespace-nowrap">{t.thakbakiStatus}</th>
                      <th className="px-3 py-2.5 print:p-1 text-center font-bold whitespace-nowrap">{t.thakbakiLastPayment}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {thakbakiList.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-4 py-10 print:py-4 text-center text-slate-400 font-bold">
                          {t.thakbakiNoRecords}
                        </td>
                      </tr>
                    ) : (
                      thakbakiList.map((entry, idx) => (
                        <tr key={entry.id} className="hover:bg-slate-50 odd:bg-white even:bg-slate-50/50 break-inside-avoid">
                          <td className="px-3 py-3 print:p-1 text-center text-slate-500 font-bold">{idx + 1}</td>
                          <td className="px-3 py-3 print:p-1 font-extrabold text-slate-700">{entry.accountNumber}</td>
                          <td className="px-3 py-3 print:p-1 font-extrabold text-slate-900 whitespace-nowrap">{entry.name}</td>
                          <td className="px-3 py-3 print:p-1 text-slate-600">{entry.mobile || '-'}</td>
                          <td className="px-3 py-3 print:p-1 text-slate-600">{getOfficeNameMarathi(entry.officeId, language)}</td>
                          <td className="px-3 py-3 print:p-1 text-right font-bold text-slate-700">{formatCurrency(entry.initialAmount, language)}</td>
                          <td className="px-3 py-3 print:p-1 text-right font-bold text-emerald-700">{formatCurrency(entry.paidAmount, language)}</td>
                          <td className="px-3 py-3 print:p-1 text-right font-black text-rose-700">{formatCurrency(entry.remainingAmount, language)}</td>
                          <td className="px-3 py-3 print:p-1 text-center">
                            <span className={`px-2 py-0.5 print:px-1 print:py-0 rounded-full text-[10px] print:text-[8px] font-black ${
                              entry.status === 'CLEARED'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : 'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}>
                              {entry.status === 'CLEARED' ? `✅ ${t.thakbakiCleared}` : `⏳ ${t.thakbakiPending}`}
                            </span>
                          </td>
                          <td className="px-3 py-3 print:p-1 text-center text-slate-500 text-[10px] print:text-[8px] font-medium">
                            {entry.lastPaymentDate ? formatDateMarathi(entry.lastPaymentDate, language) : '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {thakbakiList.length > 0 && (
                    <tfoot className="bg-amber-800 text-white font-black text-xs print:text-[8.5px] print:table-footer-group">
                      <tr className="break-inside-avoid">
                        <td className="px-3 py-3 print:p-1 text-center" colSpan={5}>
                          {language === 'EN' ? 'TOTAL' : 'एकूण'} ({totalCustomers} {language === 'EN' ? 'Records' : 'नोंदी'})
                        </td>
                        <td className="px-3 py-3 print:p-1 text-right">{formatCurrency(totalInitial, language)}</td>
                        <td className="px-3 py-3 print:p-1 text-right text-amber-200">{formatCurrency(totalPaid, language)}</td>
                        <td className="px-3 py-3 print:p-1 text-right text-rose-200">{formatCurrency(totalRemaining, language)}</td>
                        <td colSpan={2} className="px-3 py-3 print:p-1 text-center">-</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        );
      })()}

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
