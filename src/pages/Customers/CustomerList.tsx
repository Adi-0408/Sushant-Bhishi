import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { Customer, BishiType, Modality, OfficeId, CollectionEntry, Loan } from '../../types';
import {
  formatCurrency,
  getBishiNameMarathi,
  getModalityShort,
  getOfficeNameMarathi,
  getStatusBadgeClass,
  matchesCustomerSearch,
} from '../../utils/formatters';
import { calculateCustomerFinancials } from '../../utils/calculations';
import { CustomerFormModal } from './CustomerFormModal';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { StorageService, deduplicateCustomers, compareAccountNumbers } from '../../services/db';
import { MarathiTextInput } from '../../components/common/MarathiTextInput';
import { CustomDropdown } from '../../components/common/CustomDropdown';
import { QuickCollectionModal } from '../../components/collections/QuickCollectionModal';
import { Link } from 'react-router-dom';
import {
  Search,
  UserPlus,
  Eye,
  Edit,
  Trash2,
  Wallet,
  Users,
  X,
  RefreshCw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';

export const CustomerList: React.FC = () => {
  const { customers, collections, loans, bishiConfigs, activeOffice, setActiveOffice, refreshData, showToast, t, language, isRefreshing, refreshAllData } = useApp();

  // Sorting state (default: natural numeric order by Account Number)
  const [sortBy, setSortBy] = useState<'accountNumber' | 'name'>('accountNumber');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const toggleSort = (field: 'accountNumber' | 'name') => {
    if (sortBy === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDirection('asc');
    }
  };

  // Full customer base sorted according to user selection (0 reads!)
  const sortedCustomers = useMemo(() => {
    return [...customers].sort((a, b) => {
      if (sortBy === 'accountNumber') {
        return compareAccountNumbers(a.accountNumber, b.accountNumber, sortDirection);
      }
      const nameA = String(a.name || '').trim();
      const nameB = String(b.name || '').trim();
      const res = nameA.localeCompare(nameB, 'mr', { sensitivity: 'base' });
      return sortDirection === 'asc' ? res : -res;
    });
  }, [customers, sortBy, sortDirection]);

  // ── Client-side pagination state (0 Firestore reads!) ──
  const [displayLimit, setDisplayLimit] = useState(20);
  const isLoading = false;
  const isLoadingMore = false;
  const isLoadingAll = false;

  const hasMore = sortedCustomers.length > displayLimit;
  const isAllLoaded = displayLimit >= sortedCustomers.length;

  const paginatedCustomers = useMemo(() => {
    return sortedCustomers.slice(0, displayLimit);
  }, [sortedCustomers, displayLimit]);

  // Search state (0 Firestore reads; instant in-memory search)
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Customer[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const [bishiFilter, setBishiFilter] = useState<'ALL' | BishiType>('ALL');
  const [modalityFilter, setModalityFilter] = useState<'ALL' | Modality>('ALL');
  const [officeFilter, setOfficeFilter] = useState<'ALL' | OfficeId>(activeOffice);

  useEffect(() => {
    setOfficeFilter(activeOffice);
  }, [activeOffice]);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PAID' | 'PENDING' | 'BORROWER'>('ALL');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [collectCustomer, setCollectCustomer] = useState<Customer | null>(null);

  // Load more via client-side pagination (0 reads)
  const handleLoadMore = () => {
    setDisplayLimit((prev) => prev + 20);
  };

  // Load ALL customers (0 reads!)
  const handleLoadAll = () => {
    setDisplayLimit(sortedCustomers.length);
  };

  const handleShowLess = () => {
    setDisplayLimit(20);
  };

  // Instant client-side search across Name, Account No, Mobile (0 reads!)
  useEffect(() => {
    const term = searchTerm.trim();
    if (!term) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    const filtered = sortedCustomers.filter((c) => matchesCustomerSearch(c, term));
    setSearchResults(filtered);
    setIsSearching(false);
  }, [searchTerm, sortedCustomers]);

  const activeList = searchResults !== null ? searchResults : paginatedCustomers;

  // O(N) financials for visible items only (never whole collection scan)
  const customerFinancialsMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof calculateCustomerFinancials>>();
    for (let i = 0; i < activeList.length; i++) {
      const cust = activeList[i];
      if (cust.summary) {
        map.set(cust.id, {
          isCurrentDuePaid: cust.summary.pendingInstallments === 0,
          totalCollectedBishi: cust.summary.totalCollected,
          totalExtraAmount: cust.summary.totalExtraAmount || 0,
          totalRemainingBishi: cust.summary.totalRemaining,
          loanPrincipal: cust.loanDetails?.principal || 0,
          loanRemaining: cust.loanDetails?.remaining || 0,
          totalPayableWithInterest: cust.summary.totalExpected || 0,
        } as any);
      } else {
        const custColls = collections.filter(
          (c) => c.customerId === cust.id || (cust.accountNumber && c.accountNumber === cust.accountNumber)
        );
        const custLoan =
          loans.find(
            (l) =>
              (l.customerId === cust.id || (cust.accountNumber && l.accountNumber === cust.accountNumber)) &&
              l.status === 'ACTIVE'
          ) || null;
        map.set(cust.id, calculateCustomerFinancials(cust, custColls, custLoan, bishiConfigs));
      }
    }
    return map;
  }, [activeList, collections, loans, bishiConfigs]);

  // Filtered List Computation
  const filteredCustomers = useMemo(() => {
    return activeList.filter((cust) => {
      // Office filter
      if (officeFilter !== 'ALL' && cust.officeId !== officeFilter) {
        return false;
      }

      // Bishi filter
      if (bishiFilter !== 'ALL' && cust.bishiType !== bishiFilter) {
        return false;
      }

      // Modality filter
      if (modalityFilter !== 'ALL' && cust.modality !== modalityFilter) {
        return false;
      }

      // Status filter
      if (statusFilter !== 'ALL') {
        const financials = customerFinancialsMap.get(cust.id);
        if (statusFilter === 'BORROWER' && !cust.hasLoan && cust.bishiType !== 'LOAN_ONLY' && (!financials || financials.loanPrincipal <= 0)) return false;
        if (statusFilter === 'PAID' && !financials?.isCurrentDuePaid) return false;
        if (statusFilter === 'PENDING' && financials?.isCurrentDuePaid) return false;
      }

      return true;
    });
  }, [activeList, officeFilter, bishiFilter, modalityFilter, statusFilter, customerFinancialsMap]);

  const hasActiveFilter = officeFilter !== 'ALL' || bishiFilter !== 'ALL' || modalityFilter !== 'ALL' || statusFilter !== 'ALL';

  const handleDeleteConfirm = async () => {
    if (!customerToDelete) return;
    try {
      await StorageService.deleteCustomer(customerToDelete.id);
      showToast(language === 'EN' ? 'Customer deleted successfully.' : 'खातेदाराची माहिती यशस्वीपणे हटवली.', 'success');
      if (searchResults) {
        setSearchResults((prev) => (prev ? prev.filter((c) => c.id !== customerToDelete.id) : null));
      }
      refreshData();
      setCustomerToDelete(null);
    } catch {
      showToast(language === 'EN' ? 'Error deleting customer.' : 'हटवताना त्रुटी आली.', 'error');
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Title & Add Button Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center space-x-2">
            <Users className="w-6 h-6 text-brand-700" />
            <span>
              {t.customerListTitle} (
                {searchResults !== null
                  ? filteredCustomers.length
                  : hasActiveFilter
                  ? filteredCustomers.length
                  : customers.length}
              )
            </span>
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            {t.customerListSub}
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => refreshAllData()}
            disabled={isRefreshing}
            title={language === 'EN' ? 'Refresh Customers (0 reads if unchanged)' : 'ग्राहक डेटा रिफ्रेश करा (बदल नसल्यास ० रीड्स)'}
            className="h-10 px-3.5 bg-white hover:bg-emerald-50 text-[#0F7A5C] font-extrabold text-xs rounded-xl border border-[#E4EAE7] shadow-2xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-60 active:scale-95 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#0F7A5C] ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{language === 'EN' ? 'Refresh' : 'रिफ्रेश'}</span>
          </button>

          <button
            onClick={() => {
              setEditingCustomer(null);
              setIsFormOpen(true);
            }}
            className="px-5 py-2.5 rounded-xl bg-brand-900 text-white font-extrabold text-sm hover:bg-brand-800 hover:shadow-lg hover:-translate-y-0.5 active:scale-95 transition-all flex items-center justify-center space-x-2 cursor-pointer shadow-md"
          >
            <UserPlus className="w-5 h-5" />
            <span>{t.btnAddCustomer}</span>
          </button>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#E4EAE7] shadow-xs space-y-4">
        {/* Instant Search Box */}
        <div className="relative">
          <Search className="w-5 h-5 text-[#0F7A5C] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
          <MarathiTextInput
            value={searchTerm}
            onChange={(val) => setSearchTerm(val)}
            placeholder={language === 'EN' ? 'Search Acc No / Name / Mobile (e.g. 101 / Suraj)...' : 'खाते क्रमांक / नाव / मोबाईल क्रमांक शोधा (उदा. 101 / सुशांत)...'}
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

        {/* Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
          {/* Bishi Filter */}
          <div>
            <label className="block text-xs font-bold text-[#5F6E68] mb-1.5">{t.filterBishi}</label>
            <CustomDropdown<string>
              value={bishiFilter}
              onChange={(val) => setBishiFilter(val as any)}
              options={[
                { value: 'ALL', label: t.allBishi },
                ...bishiConfigs.map((cfg) => ({
                  value: cfg.id,
                  label: cfg.name,
                })),
                { value: 'LOAN_ONLY', label: language === 'EN' ? 'Loan Only' : 'फक्त कर्ज खातेदार' },
              ]}
              size="lg"
            />
          </div>

          {/* Modality Filter */}
          <div>
            <label className="block text-xs font-bold text-[#5F6E68] mb-1.5">{t.filterModality}</label>
            <CustomDropdown<string>
              value={modalityFilter}
              onChange={(val) => setModalityFilter(val as any)}
              options={[
                { value: 'ALL', label: t.allModalities },
                { value: 'W', label: t.modalityWeekly },
                { value: 'M', label: t.modalityMonthly },
              ]}
              size="lg"
            />
          </div>

          {/* Office Filter */}
          <div>
            <label className="block text-xs font-bold text-[#5F6E68] mb-1.5">{t.filterOffice}</label>
            <CustomDropdown<OfficeId>
              value={officeFilter}
              onChange={(val) => {
                setOfficeFilter(val);
                setActiveOffice(val);
              }}
              options={[
                { value: 'ALL', label: t.allOffices },
                { value: 'MAIN', label: t.mainOffice },
                { value: 'HOME', label: t.homeOffice },
              ]}
              size="lg"
            />
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-xs font-bold text-[#5F6E68] mb-1.5">{t.colStatus}</label>
            <CustomDropdown<string>
              value={statusFilter}
              onChange={(val) => setStatusFilter(val as any)}
              options={[
                { value: 'ALL', label: t.filterAllStatus },
                { value: 'PAID', label: t.statusPaid },
                { value: 'PENDING', label: t.statusPending },
                { value: 'BORROWER', label: t.statusBorrower },
              ]}
              size="lg"
            />
          </div>
        </div>
      </div>

      {/* Customer List Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {filteredCustomers.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm font-medium">
            {language === 'EN' ? 'No customers found. Please add a new customer or adjust search filters.' : 'खातेदार सापडले नाहीत. कृपया नवीन खातेदार जोडा किंवा शोध बदला.'}
          </div>
        ) : (
          <>
            {/* Mobile Sort Bar (< md screens) */}
            <div className="flex md:hidden items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs">
              <span className="font-extrabold text-slate-500">
                {language === 'EN' ? 'Sort by:' : 'क्रमवारी:'}
              </span>
              <div className="flex items-center space-x-1.5">
                <button
                  type="button"
                  onClick={() => toggleSort('accountNumber')}
                  className={`px-3 py-1.5 rounded-lg font-black flex items-center space-x-1 transition-all cursor-pointer ${
                    sortBy === 'accountNumber'
                      ? 'bg-brand-900 text-white shadow-xs'
                      : 'bg-white text-slate-700 border border-slate-200'
                  }`}
                >
                  <span>{t.colAccountNo}</span>
                  {sortBy === 'accountNumber' && (
                    sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 stroke-[3]" /> : <ArrowDown className="w-3 h-3 stroke-[3]" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => toggleSort('name')}
                  className={`px-3 py-1.5 rounded-lg font-black flex items-center space-x-1 transition-all cursor-pointer ${
                    sortBy === 'name'
                      ? 'bg-brand-900 text-white shadow-xs'
                      : 'bg-white text-slate-700 border border-slate-200'
                  }`}
                >
                  <span>{t.colFullName}</span>
                  {sortBy === 'name' && (
                    sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 stroke-[3]" /> : <ArrowDown className="w-3 h-3 stroke-[3]" />
                  )}
                </button>
              </div>
            </div>

            {/* Mobile Card View (< md screens) */}
            <div className="block md:hidden space-y-3 p-3 bg-slate-50/50">
              {filteredCustomers.map((cust) => {
                const financials = customerFinancialsMap.get(cust.id) || calculateCustomerFinancials(cust, [], null, bishiConfigs);
                const isPaid = financials.isCurrentDuePaid;

                return (
                  <div
                    key={cust.id}
                    className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3 hover:shadow-md hover:border-emerald-300 transition-all duration-200"
                  >
                    {/* Header Row */}
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <div className="flex items-center space-x-2">
                        <span className="px-2.5 py-0.5 rounded-lg bg-emerald-100 text-emerald-900 text-xs font-black">
                          {cust.accountNumber}
                        </span>
                        <Link
                          to={`/customers/${cust.id}`}
                          className="font-black text-slate-900 text-sm hover:text-emerald-700"
                        >
                          {cust.name}
                        </Link>
                      </div>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-black ${getStatusBadgeClass(
                          isPaid ? 'PAID' : 'PENDING'
                        )}`}
                      >
                        {isPaid ? t.statusPaid : t.statusPending}
                      </span>
                    </div>

                    {/* Details Grid */}
                    <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-600">
                      <div>
                        <span className="text-[10px] font-extrabold text-slate-400 block uppercase">
                          {t.colMobile}
                        </span>
                        <span className="text-slate-900 font-bold">{cust.mobile}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-extrabold text-slate-400 block uppercase">
                          {t.colBishi} / {t.colModality}
                        </span>
                        <span className="text-slate-900 font-bold">
                          {getBishiNameMarathi(cust.bishiType, language)} ({getModalityShort(cust.modality, language)})
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-extrabold text-slate-400 block uppercase">
                          {t.colInstallmentAmount}
                        </span>
                        <span className="text-slate-900 font-extrabold">
                          {formatCurrency(cust.amount, language)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-extrabold text-slate-400 block uppercase">
                          {t.colOffice}
                        </span>
                        <span className="text-slate-700 font-bold">
                          {getOfficeNameMarathi(cust.officeId, language)}
                        </span>
                      </div>
                    </div>

                    {/* Collection Financials Pill */}
                    <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-500 font-bold block">{t.colCollected}:</span>
                        <span className="font-black text-emerald-700">
                          {formatCurrency(financials.totalCollectedBishi + (financials.totalExtraAmount || 0), language)}
                        </span>
                        {(financials.totalExtraAmount || 0) > 0 && (
                          <span className="text-[10px] text-blue-700 font-bold block">
                            +{language === 'EN' ? 'Extra' : 'अतिरिक्त'} {formatCurrency(financials.totalExtraAmount, language)}
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-rose-700 font-bold block">
                          {language === 'EN' ? 'Due to Pay:' : 'ग्राहकाकडून येणे:'}
                        </span>
                        {financials.totalRemainingBishi > 0 ? (
                          <span className="inline-block px-2 py-0.5 rounded-lg bg-rose-100 text-rose-800 border border-rose-300 font-black shadow-2xs">
                            {formatCurrency(financials.totalRemainingBishi, language)}
                          </span>
                        ) : (
                          <span className="font-black text-emerald-700">₹0</span>
                        )}
                      </div>
                    </div>

                    {/* Loan Remaining pill if customer has active loan */}
                    {(cust.hasLoan || financials.loanPrincipal > 0) && financials.loanRemaining > 0 && (
                      <div className="flex items-center justify-between bg-amber-50/80 px-2.5 py-1.5 rounded-xl border border-amber-200 text-xs">
                        <span className="text-[10px] text-amber-900 font-bold">
                          {language === 'EN' ? 'Remaining Loan Due:' : 'कर्ज येणे बाकी:'}
                        </span>
                        <span className="inline-block px-2 py-0.5 rounded-lg bg-amber-100 text-amber-950 border border-amber-300 font-black text-xs shadow-2xs">
                          {formatCurrency(financials.loanRemaining, language)}
                        </span>
                      </div>
                    )}

                    {/* Actions Bar */}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                      <div className="flex items-center space-x-2">
                        <Link
                          to={`/customers/${cust.id}`}
                          className="px-3 py-2 min-h-[44px] rounded-xl bg-blue-50 text-blue-700 font-extrabold text-xs flex items-center space-x-1 touch-target"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>{t.btnView}</span>
                        </Link>
                        <button
                          onClick={() => {
                            setEditingCustomer(cust);
                            setIsFormOpen(true);
                          }}
                          className="px-3 py-2 min-h-[44px] rounded-xl bg-slate-100 text-slate-700 font-extrabold text-xs flex items-center space-x-1 touch-target"
                        >
                          <Edit className="w-3.5 h-3.5" />
                          <span>{t.btnEdit}</span>
                        </button>
                        <button
                          onClick={() => setCustomerToDelete(cust)}
                          className="p-2.5 min-h-[44px] min-w-[44px] rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 flex items-center justify-center touch-target"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {!isPaid && (
                        <button
                          onClick={() => setCollectCustomer(cust)}
                          className="px-3.5 py-2 min-h-[44px] rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs flex items-center space-x-1 shadow-xs cursor-pointer touch-target"
                        >
                          <Wallet className="w-3.5 h-3.5" />
                          <span>{t.btnCollect}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View (>= md screens) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-50 text-slate-700 font-extrabold border-b border-slate-200">
                  <tr>
                    <th
                      onClick={() => toggleSort('accountNumber')}
                      className="p-3.5 pl-5 cursor-pointer hover:bg-slate-100 transition-colors select-none group/th"
                      title={language === 'EN' ? 'Click to sort by Account Number' : 'खाते क्रमांकाने क्रमवारी लावण्यासाठी क्लिक करा'}
                    >
                      <div className="flex items-center space-x-1.5">
                        <span className={sortBy === 'accountNumber' ? 'text-brand-900 font-black' : ''}>{t.colAccountNo}</span>
                        {sortBy === 'accountNumber' ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp className="w-3.5 h-3.5 text-brand-700 stroke-[2.5]" />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5 text-brand-700 stroke-[2.5]" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 group-hover/th:text-slate-600 transition-colors" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => toggleSort('name')}
                      className="p-3.5 cursor-pointer hover:bg-slate-100 transition-colors select-none group/th"
                      title={language === 'EN' ? 'Click to sort by Name' : 'नावाने क्रमवारी लावण्यासाठी क्लिक करा'}
                    >
                      <div className="flex items-center space-x-1.5">
                        <span className={sortBy === 'name' ? 'text-brand-900 font-black' : ''}>{t.colFullName}</span>
                        {sortBy === 'name' ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp className="w-3.5 h-3.5 text-brand-700 stroke-[2.5]" />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5 text-brand-700 stroke-[2.5]" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 group-hover/th:text-slate-600 transition-colors" />
                        )}
                      </div>
                    </th>
                    <th className="p-3.5">{t.colMobile}</th>
                    <th className="p-3.5">{t.colBishi}</th>
                    <th className="p-3.5 text-center">{t.colModality}</th>
                    <th className="p-3.5 text-right">{t.colInstallmentAmount}</th>
                    <th className="p-3.5 text-right">{t.colCollected}</th>
                    <th className="p-3.5 text-right">{t.colRemaining}</th>
                    <th className="p-3.5 text-center">{t.colLoan}</th>
                    <th className="p-3.5">{t.colOffice}</th>
                    <th className="p-3.5 text-center">{t.colStatus}</th>
                    <th className="p-3.5 text-center">{t.colActions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredCustomers.map((cust) => {
                    const financials = customerFinancialsMap.get(cust.id) || calculateCustomerFinancials(cust, [], null, bishiConfigs);
                    const isPaid = financials.isCurrentDuePaid;

                    return (
                      <tr key={cust.id} className="hover:bg-emerald-50/40 transition-colors group">
                        <td className="p-3.5 pl-5 font-bold text-slate-900">
                          <Link
                            to={`/customers/${cust.id}`}
                            className="text-brand-700 hover:underline"
                          >
                            {cust.accountNumber}
                          </Link>
                        </td>
                        <td className="p-3.5 font-extrabold text-slate-800">
                          <Link
                            to={`/customers/${cust.id}`}
                            className="hover:text-brand-600 transition-colors"
                          >
                            {cust.name}
                          </Link>
                        </td>
                        <td className="p-3.5 text-slate-600">{cust.mobile}</td>
                        <td className="p-3.5 text-slate-800 font-semibold">
                          {getBishiNameMarathi(cust.bishiType, language)}
                        </td>
                        <td className="p-3.5 text-center">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-md text-xs font-bold ${
                              cust.modality === 'W'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-purple-100 text-purple-800'
                            }`}
                          >
                            {getModalityShort(cust.modality, language)}
                          </span>
                        </td>
                        <td className="p-3.5 text-right font-bold text-slate-900">
                          {formatCurrency(cust.amount, language)}
                        </td>
                        <td className="p-3.5 text-right font-bold text-emerald-700">
                          <div>{formatCurrency(financials.totalCollectedBishi + (financials.totalExtraAmount || 0), language)}</div>
                          {(financials.totalExtraAmount || 0) > 0 && (
                            <div className="text-[10px] text-blue-700 font-bold whitespace-nowrap">
                              +{language === 'EN' ? 'Extra' : 'अतिरिक्त'} {formatCurrency(financials.totalExtraAmount, language)}
                            </div>
                          )}
                        </td>
                        <td className="p-3.5 text-right font-extrabold">
                          {financials.totalRemainingBishi > 0 ? (
                            <span className="inline-block px-2.5 py-1 rounded-lg bg-rose-100 text-rose-900 border border-rose-300 font-black shadow-2xs">
                              {formatCurrency(financials.totalRemainingBishi, language)}
                            </span>
                          ) : (
                            <span className="text-emerald-700 font-extrabold">₹0</span>
                          )}
                        </td>
                        <td className="p-3.5 text-center">
                          {(cust.hasLoan || financials.loanPrincipal > 0) && financials.loanRemaining > 0 ? (
                            <span className="inline-block px-2.5 py-1 rounded-lg text-xs font-black bg-amber-100 text-amber-950 border border-amber-300 shadow-2xs">
                              {formatCurrency(financials.loanRemaining, language)}
                            </span>
                          ) : (cust.hasLoan || financials.loanPrincipal > 0) ? (
                            <span className="text-emerald-700 font-extrabold text-xs">₹0</span>
                          ) : (
                            <span className="text-slate-400 font-medium">-</span>
                          )}
                        </td>
                        <td className="p-3.5 text-slate-700 text-xs">
                          {getOfficeNameMarathi(cust.officeId, language)}
                        </td>
                        <td className="p-3.5 text-center">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-bold ${getStatusBadgeClass(
                              isPaid ? 'PAID' : 'PENDING'
                            )}`}
                          >
                            {isPaid ? t.statusPaid : t.statusPending}
                          </span>
                        </td>
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center space-x-1.5">
                            <Link
                              to={`/customers/${cust.id}`}
                              title={t.btnView}
                              className="p-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                            >
                              <Eye className="w-4 h-4" />
                            </Link>
                            <button
                              onClick={() => {
                                setEditingCustomer(cust);
                                setIsFormOpen(true);
                              }}
                              title={t.btnEdit}
                              className="p-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            {!isPaid && (
                              <button
                                onClick={() => setCollectCustomer(cust)}
                                title={t.btnCollect}
                                className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                              >
                                <Wallet className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => setCustomerToDelete(cust)}
                              title={t.btnDelete}
                              className="p-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
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

        {/* Cursor pagination: Load More & Load All Buttons */}
        {searchResults === null && (hasMore || isAllLoaded || paginatedCustomers.length < customers.length) && (
          <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 border-t border-slate-200">
            <div className="text-xs font-bold text-slate-600">
              {language === 'EN'
                ? `Showing ${paginatedCustomers.length} of ${customers.length} customers`
                : `${customers.length} पैकी ${paginatedCustomers.length} खातेदार दाखवले आहेत`}
            </div>

            <div className="flex items-center space-x-2 self-end sm:self-auto">
              {(hasMore || paginatedCustomers.length < customers.length) && (
                <>
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    disabled={isLoadingMore || isLoadingAll}
                    className="px-4 py-2 rounded-xl bg-white border border-[#E4EAE7] hover:border-[#0F7A5C] text-[#0F7A5C] font-extrabold text-xs sm:text-sm shadow-xs transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isLoadingMore ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#0F7A5C]" />
                        <span>{language === 'EN' ? 'Loading...' : 'लोड होत आहे...'}</span>
                      </>
                    ) : (
                      <span>{language === 'EN' ? 'Load More (20)' : 'अधिक दाखवा (२०)'}</span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleLoadAll}
                    disabled={isLoadingMore || isLoadingAll}
                    className="px-4 py-2 rounded-xl bg-[#0F7A5C] hover:bg-[#0B5C45] text-white font-extrabold text-xs sm:text-sm shadow-xs transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isLoadingAll ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                        <span>{language === 'EN' ? 'Loading All...' : 'सर्व लोड होत आहे...'}</span>
                      </>
                    ) : (
                      <span>
                        {language === 'EN'
                          ? `Load All (${customers.length})`
                          : `सर्व खातेदार दाखवा (${customers.length})`}
                      </span>
                    )}
                  </button>
                </>
              )}

              {isAllLoaded && customers.length > 20 && (
                <button
                  type="button"
                  onClick={handleShowLess}
                  className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-extrabold text-xs sm:text-sm transition-all flex items-center space-x-1.5 cursor-pointer"
                >
                  <span>{language === 'EN' ? 'Show Less (20)' : 'पहिले २० दाखवा'}</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Form Modal */}
      <CustomerFormModal
        isOpen={isFormOpen}
        editingCustomer={editingCustomer}
        onClose={() => setIsFormOpen(false)}
        onSuccess={() => {
          refreshData();
        }}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!customerToDelete}
        title={language === 'EN' ? 'Delete Customer' : 'खातेदार हटवा'}
        message={language === 'EN' ? `Are you sure you want to delete ${customerToDelete?.name} (${customerToDelete?.accountNumber})? All associated deposits, remaining dues, and loans will be removed.` : `तुम्हाला ${customerToDelete?.name} (${customerToDelete?.accountNumber}) यांची माहिती नक्की हटवायची आहे का? या खातेदाराशी संबंधित जमा, बाकी, कर्ज आणि व्यवहाराची संपूर्ण माहिती हटवली जाईल.`}
        confirmText={t.btnDelete}
        cancelText={t.btnCancel}
        isDanger={true}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setCustomerToDelete(null)}
      />

      {/* Quick Collection Modal */}
      <QuickCollectionModal
        isOpen={!!collectCustomer}
        onClose={() => setCollectCustomer(null)}
        initialCustomerId={collectCustomer?.id}
      />
    </div>
  );
};
