import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { BishiType, OfficeId } from '../types';
import { QuickCollectionModal } from '../components/collections/QuickCollectionModal';
import { WelcomeBanner } from '../components/common/WelcomeBanner';
import {
  formatCurrency,
  formatDateMarathi,
  getBishiNameMarathi,
  getOfficeNameMarathi,
  matchesCustomerSearch,
} from '../utils/formatters';
import { MarathiTextInput } from '../components/common/MarathiTextInput';
import { CustomDropdown } from '../components/common/CustomDropdown';
import {
  Users,
  Wallet,
  Clock,
  Landmark,
  Calendar,
  AlertTriangle,
  ArrowUpRight,
  Filter,
  Percent,
  FileText,
  ChevronRight,
  Zap,
  UserPlus,
  ShieldCheck,
  Search,
  X,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

export const Dashboard: React.FC = () => {
  const {
    activeOffice,
    setActiveOffice,
    selectedBishiFilter,
    setSelectedBishiFilter,
    customers,
    collections,
    loans,
    bishiConfigs,
    t,
    language,
  } = useApp();

  const [modalityFilter, setModalityFilter] = React.useState<'ALL' | 'W' | 'M'>('ALL');
  const [officeFilter, setOfficeFilter] = React.useState<'ALL' | 'MAIN' | 'HOME'>(activeOffice);

  React.useEffect(() => {
    setOfficeFilter(activeOffice);
  }, [activeOffice]);

  const [isQuickCollectOpen, setIsQuickCollectOpen] = useState(false);
  const [collectCustId, setCollectCustId] = useState<string | undefined>(undefined);
  const [dashboardSearch, setDashboardSearch] = useState('');

  const navigate = useNavigate();
  const todayStr = new Date().toISOString().split('T')[0];

  const dashboardSearchResults = dashboardSearch.trim()
    ? customers.filter((cust) => matchesCustomerSearch(cust, dashboardSearch))
    : [];

  const filteredCustomers = customers.filter((cust) => {
    if (officeFilter !== 'ALL' && cust.officeId !== officeFilter) return false;
    if (selectedBishiFilter !== 'ALL' && cust.bishiType !== selectedBishiFilter) return false;
    if (modalityFilter !== 'ALL' && cust.modality !== modalityFilter) return false;
    return true;
  });

  const filteredCustomerIds = new Set(filteredCustomers.map((c) => c.id));

  const filteredCollections = collections.filter((c) => filteredCustomerIds.has(c.customerId));
  const filteredLoans = loans.filter((l) => filteredCustomerIds.has(l.customerId) && l.status === 'ACTIVE');

  const totalCustomersCount = filteredCustomers.length;

  let todaysCollection = 0;
  let todaysPendingAmount = 0;
  let totalCollectedBishi = 0;
  let todaysPendingInstallmentsCount = 0;
  let todaysPenaltyAmount = 0;

  filteredCollections.forEach((c) => {
    totalCollectedBishi += c.collectedAmount || 0;

    // Payments collected today
    if (c.paymentDate === todayStr) {
      todaysCollection += c.collectedAmount || 0;
      todaysPenaltyAmount += c.penaltyAmount || 0;
    }

    // Pending dues: if someone didn't pay on their due date (today or earlier past dates), still count in pending!
    if (c.dueDate <= todayStr && c.status !== 'PAID') {
      todaysPendingAmount += c.remainingAmount || 0;
      todaysPendingInstallmentsCount += 1;
    }
  });

  let totalLoanAmount = 0;
  let loanRemainingAmount = 0;
  filteredLoans.forEach((l) => {
    totalLoanAmount += l.principalAmount || 0;
    loanRemainingAmount += l.remainingAmount || 0;
  });

  const todaysPendingList = filteredCollections.filter((c) => {
    if (c.status === 'PAID') return false;
    if (dashboardSearch.trim()) {
      const cust = customers.find((cu) => cu.id === c.customerId);
      if (!matchesCustomerSearch(cust, dashboardSearch, c.accountNumber)) return false;
    }
    return c.dueDate <= todayStr;
  });

  return (
    <div className="space-y-4 sm:space-y-6 pb-12 font-marathi min-h-screen flex flex-col justify-between bg-[#F4F6F5]">
      <div className="space-y-3.5 sm:space-y-6">

        {/* Hero Welcome Banner Card */}
        <WelcomeBanner />

        {/* TOP QUICK DAILY ACTION BAR - Easy Access for Daily Collection */}
        <div className="bg-gradient-to-r from-[#0B5C45] via-[#0F7A5C] to-[#10241E] p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl shadow-md border border-[#0B5C45]/20 flex flex-col sm:flex-row items-center justify-between gap-3.5 sm:gap-4 text-white">
          <div className="flex items-center space-x-3 sm:space-x-3.5 w-full sm:w-auto">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center text-amber-300 font-black text-xl sm:text-2xl shadow-inner shrink-0">
              <Wallet className="w-5 h-5 sm:w-6 sm:h-6 text-amber-300" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <span className="bg-amber-400/20 text-amber-300 text-[10px] font-black px-2 py-0.5 rounded-full border border-amber-400/30 uppercase tracking-wider">
                  {t.heroTagline}
                </span>
              </div>
              <h2 className="text-sm sm:text-lg font-black tracking-tight text-white mt-0.5 truncate">
                {t.heroTitle}
              </h2>
              <p className="text-[11px] sm:text-xs text-emerald-100 font-bold truncate sm:whitespace-normal">
                {t.heroDesc}
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              setCollectCustId(undefined);
              setIsQuickCollectOpen(true);
            }}
            className="w-full sm:w-auto min-h-[44px] px-5 sm:px-6 py-3 sm:py-3.5 bg-amber-400 hover:bg-amber-500 text-[#10241E] font-black rounded-xl sm:rounded-2xl shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center space-x-2 shrink-0 transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
          >
            <Wallet className="w-5 h-5 text-[#10241E]" />
            <span className="text-sm tracking-tight font-black">{t.heroButton}</span>
          </button>
        </div>

        {/* DASHBOARD QUICK CUSTOMER SEARCH BAR */}
        <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-[#E4EAE7] shadow-xs space-y-3">
          <div className="relative">
            <Search className="w-5 h-5 text-[#0F7A5C] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
            <MarathiTextInput
              value={dashboardSearch}
              onChange={(val) => setDashboardSearch(val)}
              placeholder={language === 'EN' ? 'Search customer by Name or Account No (e.g. 101 / Suraj / 9822)...' : 'खातेदाराचे नाव किंवा खाते क्रमांक टाकून शोधा (उदा. 101, सुरज, मोबाईल)...'}
              className="w-full pl-11 pr-10 py-3 rounded-xl border border-[#E4EAE7] hover:border-[#0F7A5C]/60 text-sm font-extrabold text-slate-900 focus:ring-2 focus:ring-[#0F7A5C] focus:border-[#0F7A5C] bg-[#F4F6F5]/50 transition-all"
            />
            {dashboardSearch && (
              <button
                type="button"
                onClick={() => setDashboardSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 z-10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Realtime Search Results Box if query entered */}
          {dashboardSearch.trim() !== '' && (
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="text-xs font-extrabold text-slate-600 flex justify-between items-center">
                <span>{language === 'EN' ? `Search results (${dashboardSearchResults.length} found):` : `शोध निकाल (${dashboardSearchResults.length} सापडले):`}</span>
                {dashboardSearchResults.length === 0 && (
                  <span className="text-rose-600 font-bold">{language === 'EN' ? 'No customer found.' : 'कोणताही खातेदार सापडला नाही.'}</span>
                )}
              </div>

              {dashboardSearchResults.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-80 overflow-y-auto pr-1">
                  {dashboardSearchResults.map((cust) => (
                    <div
                      key={cust.id}
                      className="p-3 bg-white hover:bg-emerald-50/60 rounded-xl border border-[#E4EAE7] hover:border-emerald-300 transition-all flex items-center justify-between shadow-2xs"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center space-x-2">
                          <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900 font-black text-xs shrink-0">
                            #{cust.accountNumber}
                          </span>
                          <span className="font-extrabold text-slate-900 text-xs truncate">{cust.name}</span>
                        </div>
                        <div className="text-[11px] font-bold text-slate-500 mt-1 flex items-center space-x-2">
                          <span>{cust.mobile}</span>
                          <span>•</span>
                          <span className="truncate">{getBishiNameMarathi(cust.bishiType, language)}</span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setCollectCustId(cust.id);
                            setIsQuickCollectOpen(true);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-700 text-white font-extrabold text-xs hover:bg-emerald-800 transition-all flex items-center space-x-1 shadow-2xs cursor-pointer"
                          title={language === 'EN' ? 'Record Collection' : 'हप्ता / जमा करा'}
                        >
                          <Wallet className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">{language === 'EN' ? 'Collect' : 'जमा'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(`/customers/${cust.id}`)}
                          className="p-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 font-bold text-xs transition-all cursor-pointer"
                          title={language === 'EN' ? 'View Customer Details' : 'खातेदार तपशील पहा'}
                        >
                          <ArrowUpRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Filter Dropdown Bar */}
        <div className="bg-white p-3 sm:p-4 rounded-2xl border border-[#E4EAE7] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-2.5 sm:gap-3">
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3 w-full md:w-auto">
            <div className="flex items-center space-x-1.5 text-xs font-black text-[#0B5C45] bg-[#e6f4f0] px-3 py-2 rounded-xl border border-emerald-200/50 shrink-0 self-start sm:self-auto">
              <Filter className="w-3.5 h-3.5 text-[#0F7A5C]" />
              <span>{language === 'EN' ? 'Filter' : 'फिल्टर'}:</span>
            </div>

            {/* Bishi Filter */}
            <div className="w-full sm:w-48">
              <CustomDropdown<string>
                value={selectedBishiFilter}
                onChange={(val) => setSelectedBishiFilter(val as any)}
                options={[
                  { value: 'ALL', label: t.allBishi },
                  ...bishiConfigs.map((cfg) => ({
                    value: cfg.id,
                    label: cfg.name,
                  })),
                ]}
                size="md"
              />
            </div>

            {/* Modality Filter */}
            <div className="w-full sm:w-40">
              <CustomDropdown<string>
                value={modalityFilter}
                onChange={(val) => setModalityFilter(val as any)}
                options={[
                  { value: 'ALL', label: t.allModalities },
                  { value: 'W', label: t.modalityWeekly },
                  { value: 'M', label: t.modalityMonthly },
                ]}
                size="md"
              />
            </div>

            {/* Office Filter */}
            <div className="w-full sm:w-44">
              <CustomDropdown<OfficeId>
                value={officeFilter}
                onChange={(val) => {
                  setOfficeFilter(val);
                  if (val === 'MAIN' || val === 'HOME') {
                    setActiveOffice(val);
                  }
                }}
                options={[
                  { value: 'ALL', label: t.allOffices },
                  { value: 'MAIN', label: t.mainOffice },
                  { value: 'HOME', label: t.homeOffice },
                ]}
                size="md"
              />
            </div>
          </div>

          <div className="hidden md:flex items-center justify-end shrink-0">
            <span className="h-10 inline-flex items-center px-3.5 bg-emerald-50 text-[#0F7A5C] font-extrabold text-xs rounded-xl border border-emerald-200/60 shadow-2xs">
              <Landmark className="w-3.5 h-3.5 mr-1.5" />
              {getOfficeNameMarathi(officeFilter as any, language)}
            </span>
          </div>
        </div>

        {/* 8 Primary Stat Cards (Compact & Mobile-Optimized) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3.5">
          
          {/* Card 1: Total Customers */}
          <div 
            onClick={() => navigate('/customers')}
            className="relative overflow-hidden bg-gradient-to-br from-[#b8860b] to-[#8c6705] p-3 sm:p-4 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1 group cursor-pointer"
          >
            <div className="absolute -top-3 -right-3 w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/10 pointer-events-none group-hover:scale-125 transition-transform duration-300" />
            <div className="flex items-center justify-between relative z-10">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/20 backdrop-blur-xs text-white flex items-center justify-center font-bold flex-shrink-0 group-hover:scale-110 transition-transform duration-200">
                <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
              <button className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-white/20 text-white flex items-center justify-center text-xs font-black group-hover:bg-white group-hover:text-[#b8860b] group-hover:scale-110 transition-all cursor-pointer">
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="mt-2 sm:mt-2.5 relative z-10">
              <span className="text-[11px] sm:text-xs font-bold text-white/90 truncate block">{t.statTotalCustomers}</span>
              <div className="text-base sm:text-xl font-black text-white tracking-tight mt-0.5">
                {totalCustomersCount}
              </div>
              <div className="text-[10px] sm:text-[11px] text-white/75 font-medium truncate block mt-0.5">{t.statTotalCustSub}</div>
            </div>
          </div>

          {/* Card 2: Today's Collection */}
          <div className="relative overflow-hidden bg-gradient-to-br from-[#0f7a5c] to-[#09543f] p-3 sm:p-4 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1 group">
            <div className="absolute -top-3 -right-3 w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/10 pointer-events-none group-hover:scale-125 transition-transform duration-300" />
            <div className="flex items-center justify-between relative z-10">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/20 backdrop-blur-xs text-white flex items-center justify-center font-bold text-xs sm:text-sm flex-shrink-0 group-hover:scale-110 transition-transform duration-200">
                ₹
              </div>
              <button
                onClick={() => {
                  setCollectCustId(undefined);
                  setIsQuickCollectOpen(true);
                }}
                className="px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full bg-white/25 hover:bg-white text-white hover:text-[#0f7a5c] hover:scale-105 active:scale-95 text-[10px] sm:text-xs font-black transition-all shadow-2xs cursor-pointer"
              >
                <span>{t.btnCollect}</span>
              </button>
            </div>
            <div className="mt-2 sm:mt-2.5 relative z-10">
              <span className="text-[11px] sm:text-xs font-bold text-white/90 truncate block">{t.statTodayCollection}</span>
              <div className="text-base sm:text-xl font-black text-white tracking-tight mt-0.5">
                {formatCurrency(todaysCollection, language)}
              </div>
              <div className="text-[10px] sm:text-[11px] text-white/75 font-medium truncate block mt-0.5">{t.statTodayCollSub}</div>
            </div>
          </div>

          {/* Card 3: Today's Due / Pending */}
          <div 
            onClick={() => navigate('/collections?filter=pending')}
            className="relative overflow-hidden bg-gradient-to-br from-[#d94a4a] to-[#b33636] p-3 sm:p-4 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1 group cursor-pointer"
          >
            <div className="absolute -top-3 -right-3 w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/10 pointer-events-none group-hover:scale-125 transition-transform duration-300" />
            <div className="flex items-center justify-between relative z-10">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/20 backdrop-blur-xs text-white flex items-center justify-center font-bold flex-shrink-0 group-hover:scale-110 transition-transform duration-200">
                <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); navigate('/collections?filter=pending'); }} 
                className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-white/20 text-white flex items-center justify-center text-xs font-black group-hover:bg-white group-hover:text-[#d94a4a] group-hover:scale-110 transition-all cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="mt-2 sm:mt-2.5 relative z-10">
              <span className="text-[11px] sm:text-xs font-bold text-white/90 truncate block">{t.statTodayPending}</span>
              <div className="text-base sm:text-xl font-black text-white tracking-tight mt-0.5">
                {formatCurrency(todaysPendingAmount, language)}
              </div>
              <div className="text-[10px] sm:text-[11px] text-white/75 font-medium truncate block mt-0.5">{t.statTodayPendSub}</div>
            </div>
          </div>

          {/* Card 4: Total Bishi Collected */}
          <div 
            onClick={() => navigate('/collections')}
            className="relative overflow-hidden bg-gradient-to-br from-[#6b66cc] to-[#4e48b8] p-3 sm:p-4 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1 group cursor-pointer"
          >
            <div className="absolute -top-3 -right-3 w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/10 pointer-events-none group-hover:scale-125 transition-transform duration-300" />
            <div className="flex items-center justify-between relative z-10">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/20 backdrop-blur-xs text-white flex items-center justify-center font-bold flex-shrink-0 group-hover:scale-110 transition-transform duration-200">
                <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
              <button onClick={(e) => { e.stopPropagation(); navigate('/collections'); }} className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-white/20 text-white flex items-center justify-center text-xs font-black group-hover:bg-white group-hover:text-[#6b66cc] group-hover:scale-110 transition-all cursor-pointer">
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="mt-2 sm:mt-2.5 relative z-10">
              <span className="text-[11px] sm:text-xs font-bold text-white/90 truncate block">{t.statTotalBishiColl}</span>
              <div className="text-base sm:text-xl font-black text-white tracking-tight mt-0.5">
                {formatCurrency(totalCollectedBishi, language)}
              </div>
              <div className="text-[10px] sm:text-[11px] text-white/75 font-medium truncate block mt-0.5">{t.statTotalBishiSub}</div>
            </div>
          </div>

          {/* Card 5: Total Loan */}
          <div 
            onClick={() => navigate('/loans')}
            className="relative overflow-hidden bg-gradient-to-br from-[#c89a2e] to-[#9e761d] p-3 sm:p-4 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1 group cursor-pointer"
          >
            <div className="absolute -top-3 -right-3 w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/10 pointer-events-none group-hover:scale-125 transition-transform duration-300" />
            <div className="flex items-center justify-between relative z-10">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/20 backdrop-blur-xs text-white flex items-center justify-center font-bold flex-shrink-0 group-hover:scale-110 transition-transform duration-200">
                <Landmark className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
              <button onClick={(e) => { e.stopPropagation(); navigate('/loans'); }} className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-white/20 text-white flex items-center justify-center text-xs font-black group-hover:bg-white group-hover:text-[#c89a2e] group-hover:scale-110 transition-all cursor-pointer">
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="mt-2 sm:mt-2.5 relative z-10">
              <span className="text-[11px] sm:text-xs font-bold text-white/90 truncate block">{t.statTotalLoan}</span>
              <div className="text-base sm:text-xl font-black text-white tracking-tight mt-0.5">
                {formatCurrency(totalLoanAmount, language)}
              </div>
              <div className="text-[10px] sm:text-[11px] text-white/75 font-medium truncate block mt-0.5">{t.statTotalLoanSub}</div>
            </div>
          </div>

          {/* Card 6: Remaining Loan */}
          <div 
            onClick={() => navigate('/loans')}
            className="relative overflow-hidden bg-gradient-to-br from-[#0d8a6a] to-[#075f48] p-3 sm:p-4 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1 group cursor-pointer"
          >
            <div className="absolute -top-3 -right-3 w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/10 pointer-events-none group-hover:scale-125 transition-transform duration-300" />
            <div className="flex items-center justify-between relative z-10">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/20 backdrop-blur-xs text-white flex items-center justify-center font-bold flex-shrink-0 group-hover:scale-110 transition-transform duration-200">
                <Wallet className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
              <button onClick={(e) => { e.stopPropagation(); navigate('/loans'); }} className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-white/20 text-white flex items-center justify-center text-xs font-black group-hover:bg-white group-hover:text-[#0d8a6a] group-hover:scale-110 transition-all cursor-pointer">
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="mt-2 sm:mt-2.5 relative z-10">
              <span className="text-[11px] sm:text-xs font-bold text-white/90 truncate block">{t.statLoanRemaining}</span>
              <div className="text-base sm:text-xl font-black text-white tracking-tight mt-0.5">
                {formatCurrency(loanRemainingAmount, language)}
              </div>
              <div className="text-[10px] sm:text-[11px] text-white/75 font-medium truncate block mt-0.5">{t.statLoanRemSub}</div>
            </div>
          </div>

          {/* Card 7: Pending Installments */}
          <div 
            onClick={() => navigate('/collections')}
            className="relative overflow-hidden bg-gradient-to-br from-[#4b50b8] to-[#35398d] p-3 sm:p-4 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1 group cursor-pointer"
          >
            <div className="absolute -top-3 -right-3 w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/10 pointer-events-none group-hover:scale-125 transition-transform duration-300" />
            <div className="flex items-center justify-between relative z-10">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/20 backdrop-blur-xs text-white flex items-center justify-center font-bold flex-shrink-0 group-hover:scale-110 transition-transform duration-200">
                <Percent className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
              <button onClick={(e) => { e.stopPropagation(); navigate('/collections'); }} className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-white/20 text-white flex items-center justify-center text-xs font-black group-hover:bg-white group-hover:text-[#4b50b8] group-hover:scale-110 transition-all cursor-pointer">
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="mt-2 sm:mt-2.5 relative z-10">
              <span className="text-[11px] sm:text-xs font-bold text-white/90 truncate block">{t.statTodayPendInstallments}</span>
              <div className="text-base sm:text-xl font-black text-white tracking-tight mt-0.5">
                {todaysPendingInstallmentsCount}
              </div>
              <div className="text-[10px] sm:text-[11px] text-white/75 font-medium truncate block mt-0.5">{t.statTodayInstSub}</div>
            </div>
          </div>

          {/* Card 8: Today's Penalty */}
          <div 
            onClick={() => navigate('/penalty')}
            className="relative overflow-hidden bg-gradient-to-br from-[#c4525b] to-[#993b42] p-3 sm:p-4 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1 group cursor-pointer"
          >
            <div className="absolute -top-3 -right-3 w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/10 pointer-events-none group-hover:scale-125 transition-transform duration-300" />
            <div className="flex items-center justify-between relative z-10">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/20 backdrop-blur-xs text-white flex items-center justify-center font-bold flex-shrink-0 group-hover:scale-110 transition-transform duration-200">
                <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
              <button onClick={(e) => { e.stopPropagation(); navigate('/penalty'); }} className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-white/20 text-white flex items-center justify-center text-xs font-black group-hover:bg-white group-hover:text-[#c4525b] group-hover:scale-110 transition-all cursor-pointer">
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="mt-2 sm:mt-2.5 relative z-10">
              <span className="text-[11px] sm:text-xs font-bold text-white/90 truncate block">{t.statTodayPenalty}</span>
              <div className="text-base sm:text-xl font-black text-white tracking-tight mt-0.5">
                {formatCurrency(todaysPenaltyAmount, language)}
              </div>
              <div className="text-[10px] sm:text-[11px] text-white/75 font-medium truncate block mt-0.5">{t.statTodayPenSub}</div>
            </div>
          </div>

        </div>

        {/* Bottom Section: Daily Pending Box */}
        <div className="w-full bg-white rounded-2xl sm:rounded-3xl border border-[#E4EAE7] shadow-xs overflow-hidden flex flex-col justify-between">
          <div className="p-3.5 sm:p-6 border-b border-[#E4EAE7] flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-full bg-[#C4525B]/10 text-[#C4525B] flex items-center justify-center font-bold">
                <Clock className="w-4 h-4" />
              </div>
              <h3 className="text-base font-black text-[#10241E]">
                {t.todayPendingTitle} <span className="text-xs font-bold text-[#5F6E68]">{t.todayPendingSub}</span>
              </h3>
            </div>

            <span className="inline-flex items-center space-x-1 px-3 py-1 bg-[#C4525B]/10 text-[#C4525B] text-xs font-extrabold rounded-full border border-[#C4525B]/20">
              <span>{todaysPendingList.length} {t.pendingCountSuffix}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </span>
          </div>

          {todaysPendingList.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-[#F4F6F5] text-[#0F7A5C] flex items-center justify-center">
                <FileText className="w-7 h-7" />
              </div>
              <p className="text-xs font-bold text-[#5F6E68]">
                {t.noPendingText}
              </p>
            </div>
          ) : (
            <>
              {/* Mobile Card View (< md screens) */}
              <div className="block md:hidden space-y-3 p-3 bg-slate-50/50">
                {todaysPendingList.map((item) => {
                  const cust = customers.find((c) => c.id === item.customerId);
                  if (!cust) return null;
                  return (
                    <div
                      key={item.id}
                      className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900 text-xs font-black">
                            {cust.accountNumber}
                          </span>
                          <span className="font-bold text-slate-900 text-xs truncate">
                            {cust.name}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs font-extrabold text-[#C4525B] mt-1">
                          <span>{t.colRemaining}: {formatCurrency(item.remainingAmount, language)}</span>
                          {item.dueDate < todayStr && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-black">
                              {language === 'EN' ? 'Overdue' : 'थकीत'} ({formatDateMarathi(item.dueDate, language)})
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setCollectCustId(cust.id);
                          setIsQuickCollectOpen(true);
                        }}
                        className="px-3.5 py-2 min-h-[44px] bg-[#0F7A5C] hover:bg-emerald-800 text-white rounded-xl text-xs font-extrabold transition-colors shadow-xs shrink-0 cursor-pointer touch-target flex items-center justify-center"
                      >
                        {t.btnCollect}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table View (>= md screens) */}
              <div className="hidden md:block overflow-x-auto p-4">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-[#F4F6F5] text-[#10241E] font-extrabold border-b border-[#E4EAE7]">
                    <tr>
                      <th className="p-3 pl-4">{t.colAccountNo}</th>
                      <th className="p-3">{t.colCustomerName}</th>
                      <th className="p-3">{t.colDueDate}</th>
                      <th className="p-3 text-right">{t.colRemaining}</th>
                      <th className="p-3 text-center">{t.colActions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E4EAE7] font-medium">
                    {todaysPendingList.map((item) => {
                      const cust = customers.find((c) => c.id === item.customerId);
                      if (!cust) return null;
                      return (
                        <tr key={item.id} className="hover:bg-[#F4F6F5]">
                          <td className="p-3 pl-4 font-bold">{cust.accountNumber}</td>
                          <td className="p-3 font-bold">{cust.name}</td>
                          <td className="p-3 font-semibold text-slate-700">
                            <span>{formatDateMarathi(item.dueDate, language)}</span>
                            {item.dueDate < todayStr && (
                              <span className="ml-1.5 px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-black">
                                {language === 'EN' ? 'Overdue' : 'थकीत'}
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-right font-extrabold text-[#C4525B]">{formatCurrency(item.remainingAmount, language)}</td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => {
                                setCollectCustId(cust.id);
                                setIsQuickCollectOpen(true);
                              }}
                              className="px-3 py-1 bg-[#0F7A5C] hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition-colors shadow-xs cursor-pointer"
                            >
                              {t.btnCollect}
                            </button>
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

      </div>

      {/* Page Bottom Copyright & Trust Footer */}
      <div className="pt-6 border-t border-[#E4EAE7] flex flex-col sm:flex-row items-center justify-between text-xs font-bold text-[#5F6E68] gap-2">
        <div className="flex items-center space-x-2">
          <span className="text-[#10241E] font-black">{t.appName}</span>
          <span>|</span>
          <span className="text-[#5F6E68] font-semibold">{t.tagline}</span>
        </div>
        <div className="flex items-center space-x-1.5 text-[#0F7A5C] font-extrabold">
          <ShieldCheck className="w-4 h-4" />
          <span>{t.secureSystem}</span>
        </div>
      </div>

      {/* Quick Collection Modal */}
      <QuickCollectionModal
        isOpen={isQuickCollectOpen}
        onClose={() => setIsQuickCollectOpen(false)}
        initialCustomerId={collectCustId}
      />
    </div>
  );
};
