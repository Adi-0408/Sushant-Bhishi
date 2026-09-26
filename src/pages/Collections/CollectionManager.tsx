import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  formatCurrency,
  formatDateMarathi,
  getStatusBadgeClass,
  getStatusTextMarathi,
  matchesCustomerSearch,
} from '../../utils/formatters';
import { Wallet, Search, Plus, Eye, CheckCircle2, AlertCircle, X, RefreshCw } from 'lucide-react';
import { MarathiTextInput } from '../../components/common/MarathiTextInput';
import { Link, useSearchParams } from 'react-router-dom';
import { QuickCollectionModal } from '../../components/collections/QuickCollectionModal';

export const CollectionManager: React.FC = () => {
  const { collections, customers, activeOffice, t, language, isRefreshing, refreshAllData } = useApp();
  const [searchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState<'TODAY' | 'WEEKLY' | 'MONTHLY'>('TODAY');
  const initialStatus = searchParams.get('filter') === 'pending' || searchParams.get('status') === 'PENDING' ? 'PENDING' : 'ALL';
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'PAID'>(initialStatus);
  const [searchTerm, setSearchTerm] = useState('');

  // Quick collection modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | undefined>(undefined);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | undefined>(undefined);

  const todayStr = new Date().toISOString().split('T')[0];

  // Filter collections by office and search term
  const officeCustomers = new Set(
    customers.filter((c) => activeOffice === 'ALL' || c.officeId === activeOffice).map((c) => c.id)
  );

  const isSearching = Boolean(searchTerm.trim());

  const filteredCollections = collections.filter((item) => {
    // When searching, allow finding customer entries across any office
    if (!isSearching && !officeCustomers.has(item.customerId)) return false;

    const cust = customers.find((c) => c.id === item.customerId);
    if (!cust) return false;

    if (isSearching) {
      if (!matchesCustomerSearch(cust, searchTerm, item.accountNumber)) {
        return false;
      }
      if (statusFilter === 'PENDING' && item.status === 'PAID') return false;
      if (statusFilter === 'PAID' && item.status !== 'PAID') return false;
      return true;
    }

    // Do not show future unpaid entries (next month / future weeks in advance)
    if (item.dueDate > todayStr && item.status !== 'PAID') {
      return false;
    }

    if (statusFilter === 'PENDING' && item.status === 'PAID') return false;
    if (statusFilter === 'PAID' && item.status !== 'PAID') return false;

    if (activeTab === 'TODAY') {
      if (item.status !== 'PAID') {
        // Unpaid installments due today or from previous days (overdue)
        return item.dueDate <= todayStr;
      } else {
        // Paid collections recorded today or due today
        return item.paymentDate === todayStr || item.dueDate === todayStr;
      }
    } else if (activeTab === 'WEEKLY') {
      return cust.modality === 'W';
    } else {
      return cust.modality === 'M';
    }
  });

  // Guarantee strictly unique entries per customer and period
  const uniqueCollections = useMemo(() => {
    const seen = new Set<string>();
    return filteredCollections.filter((item) => {
      const cust = customers.find((c) => c.id === item.customerId);
      const acc = String(cust?.accountNumber || item.accountNumber || '').trim().toLowerCase();
      const period = String(item.periodIndex ?? '');
      const key = acc ? `${acc}_${period}` : `${item.customerId}_${period}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [filteredCollections, customers]);

  const handleOpenQuickCollect = (customerId?: string, collectionId?: string) => {
    setSelectedCustomerId(customerId);
    setSelectedCollectionId(collectionId);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center space-x-2">
            <Wallet className="w-6 h-6 text-emerald-700" />
            <span>{t.collectionTitle}</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            {t.collectionSub}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {/* Refresh Button */}
          <button
            onClick={() => refreshAllData()}
            disabled={isRefreshing}
            title={language === 'EN' ? 'Refresh Collections (0 reads if unchanged)' : 'जमा डेटा रिफ्रेश करा (बदल नसल्यास ० रीड्स)'}
            className="w-full sm:w-auto px-3.5 py-2.5 min-h-[44px] bg-white hover:bg-emerald-50 text-[#0F7A5C] font-extrabold text-xs rounded-xl border border-[#E4EAE7] shadow-2xs flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-60 active:scale-95 transition-all touch-target"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#0F7A5C] ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{language === 'EN' ? 'Refresh' : 'रिफ्रेश'}</span>
          </button>

          {/* Main Collection Action Button requested by user */}
          <button
            onClick={() => handleOpenQuickCollect()}
            className="w-full sm:w-auto px-4 py-2.5 min-h-[44px] rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs transition-colors shadow-md flex items-center justify-center space-x-2 touch-target"
          >
            <Plus className="w-4 h-4" />
            <span>{t.btnRecordDeposit}</span>
          </button>

          {/* Tab Switcher */}
          <div className="flex w-full sm:w-auto justify-center bg-[#F4F6F5] p-1.5 rounded-xl border border-[#E4EAE7] shadow-2xs gap-1.5">
            <button
              onClick={() => setActiveTab('TODAY')}
              className={`px-3.5 py-1.5 min-h-[38px] rounded-lg text-xs font-black transition-all cursor-pointer ${
                activeTab === 'TODAY'
                  ? 'bg-[#0B5C45] text-white shadow-xs border border-[#0B5C45]'
                  : 'bg-white text-[#5F6E68] hover:text-[#10241E] border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {t.tabToday}
            </button>
            <button
              onClick={() => setActiveTab('WEEKLY')}
              className={`px-3.5 py-1.5 min-h-[38px] rounded-lg text-xs font-black transition-all cursor-pointer ${
                activeTab === 'WEEKLY'
                  ? 'bg-[#0B5C45] text-white shadow-xs border border-[#0B5C45]'
                  : 'bg-white text-[#5F6E68] hover:text-[#10241E] border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {t.tabWeekly}
            </button>
            <button
              onClick={() => setActiveTab('MONTHLY')}
              className={`px-3.5 py-1.5 min-h-[38px] rounded-lg text-xs font-black transition-all cursor-pointer ${
                activeTab === 'MONTHLY'
                  ? 'bg-[#0B5C45] text-white shadow-xs border border-[#0B5C45]'
                  : 'bg-white text-[#5F6E68] hover:text-[#10241E] border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {t.tabMonthly}
            </button>
          </div>
        </div>
      </div>

      {/* Filter Tabs for Pending vs Paid */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#E4EAE7] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center bg-[#F4F6F5] p-1.5 rounded-xl border border-[#E4EAE7] gap-1 shadow-2xs">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
              statusFilter === 'ALL'
                ? 'bg-[#10241E] text-white shadow-xs'
                : 'text-[#5F6E68] hover:text-[#10241E] hover:bg-white/80'
            }`}
          >
            {t.tabAllRecords}
          </button>
          <button
            onClick={() => setStatusFilter('PENDING')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center space-x-1.5 cursor-pointer ${
              statusFilter === 'PENDING'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-rose-700 hover:bg-rose-100/80 bg-rose-50/70 border border-rose-200/50'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{t.reportPendingReport}</span>
          </button>
          <button
            onClick={() => setStatusFilter('PAID')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center space-x-1.5 cursor-pointer ${
              statusFilter === 'PAID'
                ? 'bg-[#0F7A5C] text-white shadow-xs'
                : 'text-[#0F7A5C] hover:bg-emerald-100/80 bg-emerald-50/70 border border-emerald-200/50'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{t.reportPaidReport}</span>
          </button>
        </div>

        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#0F7A5C] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
          <MarathiTextInput
            value={searchTerm}
            onChange={(val) => setSearchTerm(val)}
            placeholder={language === 'EN' ? 'Search Acc No / Name / Mobile (e.g. 101 / Suraj)...' : 'खाते क्र / नाव / मोबाईल शोधा (उदा. 101 / सुरज)...'}
            className="w-full pl-10 pr-9 py-2 rounded-xl border border-[#E4EAE7] hover:border-[#0F7A5C]/60 text-xs sm:text-sm font-extrabold focus:ring-2 focus:ring-[#0F7A5C] focus:border-[#0F7A5C] bg-[#F4F6F5]/50 focus:outline-none transition-all"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 z-10 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {uniqueCollections.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm font-medium space-y-3">
            <div>
              {statusFilter === 'PENDING'
                ? (language === 'EN' ? '🎉 Great! No pending dues in this filter.' : '🎉 अभिनंदन! या फिल्टरमध्ये कोणताही न भरलेला बाकीदार नाही.')
                : t.noRecordsFound}
            </div>
            <button
              onClick={() => handleOpenQuickCollect()}
              className="px-4 py-2 rounded-xl bg-emerald-700 text-white font-bold text-xs hover:bg-emerald-800 transition-colors"
            >
              {t.btnRecordDeposit}
            </button>
          </div>
        ) : (
          <>
            {/* Mobile Cards View (< md screens) */}
            <div className="block md:hidden space-y-3 p-3 bg-slate-50/50">
              {uniqueCollections.map((item) => {
                const cust = customers.find((c) => c.id === item.customerId);
                if (!cust) return null;

                return (
                  <div
                    key={item.id}
                    className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3"
                  >
                    {/* Top Row: Account & Customer Name */}
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
                          item.status
                        )}`}
                      >
                        {getStatusTextMarathi(item.status, language)}
                      </span>
                    </div>

                    {/* Details Grid */}
                    <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-600">
                      <div>
                        <span className="text-[10px] font-extrabold text-slate-400 block uppercase">
                          {t.colDueDate}
                        </span>
                        <div className="flex items-center space-x-1">
                          <span className="text-slate-900 font-bold">
                            {formatDateMarathi(item.dueDate, language)}
                          </span>
                          {item.dueDate < todayStr && item.status !== 'PAID' && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-black">
                              {language === 'EN' ? 'Overdue' : 'थकीत'}
                            </span>
                          )}
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] font-extrabold text-slate-400 block uppercase">
                          {t.colExpectedAmount}
                        </span>
                        <span className="text-slate-900 font-extrabold">
                          {formatCurrency(item.expectedAmount, language)}
                        </span>
                      </div>
                    </div>

                    {/* Amounts Summary Box */}
                    <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-500 font-bold block">{t.colCollectedAmount}:</span>
                        <span className="font-black text-emerald-700">
                          {formatCurrency(item.collectedAmount, language)}
                        </span>
                        {(item.extraAmount || 0) > 0 && (
                          <div className="text-[10px] font-extrabold text-blue-700">
                            + {language === 'EN' ? 'Extra' : 'अतिरिक्त'}: {formatCurrency(item.extraAmount || 0, language)}
                          </div>
                        )}
                        {(item.penaltyAmount || 0) > 0 && (
                          <div className="text-[10px] font-extrabold text-amber-800">
                            + {language === 'EN' ? 'Penalty' : 'दंड'}: {formatCurrency(item.penaltyAmount, language)} ({language === 'EN' ? 'Total' : 'एकूण'}: {formatCurrency(item.totalWithPenalty || ((item.collectedAmount || 0) + (item.extraAmount || 0) + (item.penaltyAmount || 0)), language)})
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-rose-700 font-extrabold block">
                          {language === 'EN' ? 'Due to Pay:' : 'ग्राहकाकडून येणे:'}
                        </span>
                        {(() => {
                          const itemRemaining = Math.max(0, (item.expectedAmount || 0) - (item.collectedAmount || 0));
                          return itemRemaining > 0 ? (
                            <span className="inline-block px-2 py-0.5 rounded-lg bg-rose-100 text-rose-800 border border-rose-300 font-black text-xs shadow-2xs">
                              {formatCurrency(itemRemaining, language)}
                            </span>
                          ) : (
                            <span className="font-black text-emerald-700">₹0</span>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Action Footer */}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                      <Link
                        to={`/customers/${cust.id}`}
                        className="px-3 py-2 min-h-[44px] rounded-xl bg-slate-100 text-slate-700 font-extrabold text-xs flex items-center space-x-1 touch-target"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>{t.btnView}</span>
                      </Link>

                      {item.status !== 'PAID' ? (
                        <button
                          onClick={() => handleOpenQuickCollect(cust.id, item.id)}
                          className="px-4 py-2 min-h-[44px] rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs flex items-center space-x-1 shadow-xs cursor-pointer touch-target"
                        >
                          <Wallet className="w-3.5 h-3.5" />
                          <span>{t.btnCollect}</span>
                        </button>
                      ) : (
                        <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-xs">
                          ✅ {t.statusPaid}
                        </span>
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
                    <th className="p-3.5 pl-5">{t.colAccountNo}</th>
                    <th className="p-3.5">{t.colCustomerName}</th>
                    <th className="p-3.5">{t.colDueDate}</th>
                    <th className="p-3.5 text-right">{t.colExpectedAmount}</th>
                    <th className="p-3.5 text-right">{t.colCollectedAmount}</th>
                    <th className="p-3.5 text-right">{t.colRemainingAmount}</th>
                    <th className="p-3.5 text-center">{t.colStatus}</th>
                    <th className="p-3.5 text-center">{t.colActions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {uniqueCollections.map((item) => {
                    const cust = customers.find((c) => c.id === item.customerId);
                    if (!cust) return null;

                    return (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3.5 pl-5 font-bold text-slate-900">{cust.accountNumber}</td>
                        <td className="p-3.5 font-bold text-slate-800">{cust.name}</td>
                        <td className="p-3.5 text-slate-600 font-semibold">
                          <div>{formatDateMarathi(item.dueDate, language)}</div>
                          {item.dueDate < todayStr && item.status !== 'PAID' && (
                            <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 text-[10px] font-black">
                              {language === 'EN' ? 'Overdue' : 'थकीत (Overdue)'}
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-right font-bold text-slate-800">
                          {formatCurrency(item.expectedAmount, language)}
                        </td>
                        <td className="p-3.5 text-right font-bold text-emerald-700">
                          <div>{formatCurrency(item.collectedAmount, language)}</div>
                          {(item.extraAmount || 0) > 0 && (
                            <div className="text-[10px] text-blue-700 font-extrabold whitespace-nowrap">
                              + {language === 'EN' ? 'Extra' : 'अतिरिक्त'}: {formatCurrency(item.extraAmount || 0, language)}
                            </div>
                          )}
                          {(item.penaltyAmount || 0) > 0 && (
                            <div className="text-[10px] text-amber-800 font-extrabold whitespace-nowrap">
                              + {language === 'EN' ? 'Penalty' : 'दंड'} {formatCurrency(item.penaltyAmount, language)} ({language === 'EN' ? 'Total' : 'एकूण'}: {formatCurrency(item.totalWithPenalty || ((item.collectedAmount || 0) + (item.extraAmount || 0) + (item.penaltyAmount || 0)), language)})
                            </div>
                          )}
                        </td>
                        <td className="p-3.5 text-right font-extrabold">
                          {(() => {
                            const itemRemaining = Math.max(0, (item.expectedAmount || 0) - (item.collectedAmount || 0));
                            return itemRemaining > 0 ? (
                              <span className="inline-block px-2.5 py-1 rounded-lg bg-rose-100 text-rose-900 border border-rose-300 font-black shadow-2xs">
                                {formatCurrency(itemRemaining, language)}
                              </span>
                            ) : (
                              <span className="text-emerald-700 font-extrabold">₹0</span>
                            );
                          })()}
                        </td>
                        <td className="p-3.5 text-center">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-bold ${getStatusBadgeClass(
                              item.status
                            )}`}
                          >
                            {getStatusTextMarathi(item.status, language)}
                          </span>
                        </td>
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center space-x-1.5">
                            {item.status !== 'PAID' ? (
                              <button
                                onClick={() => handleOpenQuickCollect(cust.id, item.id)}
                                className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold transition-colors text-xs flex items-center space-x-1 shadow-xs cursor-pointer"
                              >
                                <Wallet className="w-3.5 h-3.5" />
                                <span>{t.btnCollect}</span>
                              </button>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-xs">
                                ✅ {t.statusPaid}
                              </span>
                            )}
                            <Link
                              to={`/customers/${cust.id}`}
                              title={t.btnView}
                              className="p-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                            >
                              <Eye className="w-4 h-4" />
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

      {/* Quick Collection Modal */}
      <QuickCollectionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initialCustomerId={selectedCustomerId}
        initialCollectionId={selectedCollectionId}
      />
    </div>
  );
};
