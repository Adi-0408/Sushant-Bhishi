import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { StorageService } from '../../services/db';
import { ThakbakiEntry, OfficeId } from '../../types';
import { formatCurrency, formatDateMarathi, getOfficeNameMarathi } from '../../utils/formatters';
import { ModalPortal } from '../../components/common/ModalPortal';
import { CustomDropdown } from '../../components/common/CustomDropdown';
import {
  ClipboardList,
  Plus,
  X,
  CreditCard,
  BookOpen,
  Edit2,
  Trash2,
  Check,
  Clock,
  IndianRupee,
  Users,
  TrendingDown,
  TrendingUp,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

// ── Helper: Office Name ───────────────────────────────────────────────────────
const OFFICE_OPTIONS = [
  { value: 'ALL' as OfficeId, label: 'सर्व कार्यालये' },
  { value: 'MAIN' as OfficeId, label: 'मुख्य कार्यालय' },
  { value: 'HOME' as OfficeId, label: 'गृह कार्यालय' },
];

const PAYMENT_MODE_OPTIONS = [
  { value: 'CASH', label: 'रोख (Cash)' },
  { value: 'ONLINE', label: 'ऑनलाइन (Online)' },
  { value: 'BANK', label: 'बँक (Bank)' },
];

// ─────────────────────────────────────────────────────────────────────────────

export const ThakbakiManager: React.FC = () => {
  const { thakbakiList, customers, refreshData, showToast, language, t } = useApp();

  // ── Filters ────────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [officeFilter, setOfficeFilter] = useState<OfficeId>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'CLEARED'>('ALL');

  // ── Add Thakbaki Modal ─────────────────────────────────────────────────────
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addMode, setAddMode] = useState<'EXISTING' | 'MANUAL'>('EXISTING');
  const [addSelectedCustomerId, setAddSelectedCustomerId] = useState('');
  const [addName, setAddName] = useState('');
  const [addMobile, setAddMobile] = useState('');
  const [addAccountNo, setAddAccountNo] = useState('');
  const [addOffice, setAddOffice] = useState<OfficeId>('MAIN');
  const [addInitialAmount, setAddInitialAmount] = useState<number | ''>('');
  const [addStartDate, setAddStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [addNote, setAddNote] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  // ── Edit Thakbaki Modal ────────────────────────────────────────────────────
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<ThakbakiEntry | null>(null);
  const [editName, setEditName] = useState('');
  const [editMobile, setEditMobile] = useState('');
  const [editAccountNo, setEditAccountNo] = useState('');
  const [editOffice, setEditOffice] = useState<OfficeId>('MAIN');
  const [editNote, setEditNote] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // ── Pay Amount Modal ───────────────────────────────────────────────────────
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [payEntry, setPayEntry] = useState<ThakbakiEntry | null>(null);
  const [payAmount, setPayAmount] = useState<number | ''>('');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payMode, setPayMode] = useState<'CASH' | 'ONLINE' | 'BANK'>('CASH');
  const [payNote, setPayNote] = useState('');
  const [payLoading, setPayLoading] = useState(false);

  // ── Ledger / History Modal ─────────────────────────────────────────────────
  const [isLedgerModalOpen, setIsLedgerModalOpen] = useState(false);
  const [ledgerEntry, setLedgerEntry] = useState<ThakbakiEntry | null>(null);

  // ── Delete Confirm ─────────────────────────────────────────────────────────
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const todayStr = new Date().toISOString().split('T')[0];

  // ── Filtered List ──────────────────────────────────────────────────────────
  const filteredList = useMemo(() => {
    return thakbakiList.filter((entry) => {
      if (officeFilter !== 'ALL' && entry.officeId !== officeFilter) return false;
      if (statusFilter !== 'ALL' && entry.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const nameMatch = entry.name.toLowerCase().includes(q);
        const mobileMatch = entry.mobile.toLowerCase().includes(q);
        const accMatch = entry.accountNumber.toLowerCase().includes(q);
        if (!nameMatch && !mobileMatch && !accMatch) return false;
      }
      return true;
    });
  }, [thakbakiList, officeFilter, statusFilter, searchQuery]);

  // ── Summary Stats ──────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const totalCustomers = filteredList.length;
    const totalInitial = filteredList.reduce((sum, e) => sum + (e.initialAmount || 0), 0);
    const totalPaid = filteredList.reduce((sum, e) => sum + (e.paidAmount || 0), 0);
    const totalRemaining = filteredList.reduce((sum, e) => sum + (e.remainingAmount || 0), 0);
    return { totalCustomers, totalInitial, totalPaid, totalRemaining };
  }, [filteredList]);

  // ── Customer dropdown for existing customers ───────────────────────────────
  const customerOptions = useMemo(() => {
    return customers.map((c) => ({
      value: c.id,
      label: `#${c.accountNumber} - ${c.name}`,
      subLabel: c.mobile || '',
    }));
  }, [customers]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const resetAddForm = () => {
    setAddMode('EXISTING');
    setAddSelectedCustomerId('');
    setAddName('');
    setAddMobile('');
    setAddAccountNo('');
    setAddOffice('MAIN');
    setAddInitialAmount('');
    setAddStartDate(todayStr);
    setAddNote('');
  };

  const handleOpenAddModal = () => {
    resetAddForm();
    setIsAddModalOpen(true);
  };

  const handleExistingCustomerSelect = (custId: string) => {
    setAddSelectedCustomerId(custId);
    const cust = customers.find((c) => c.id === custId);
    if (cust) {
      setAddName(cust.name);
      setAddMobile(cust.mobile || '');
      setAddAccountNo(cust.accountNumber);
      setAddOffice(cust.officeId === 'ALL' ? 'MAIN' : (cust.officeId as 'MAIN' | 'HOME'));
    }
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addName.trim()) {
      showToast(language === 'EN' ? 'Please enter customer name.' : 'कृपया खातेदाराचे नाव भरा.', 'error');
      return;
    }
    if (!addInitialAmount || Number(addInitialAmount) <= 0) {
      showToast(language === 'EN' ? 'Please enter a valid initial amount.' : 'कृपया मूळ थकबाकी रक्कम भरा.', 'error');
      return;
    }
    setAddLoading(true);
    try {
      StorageService.addThakbaki({
        customerId: addMode === 'EXISTING' ? addSelectedCustomerId : undefined,
        accountNumber: addAccountNo.trim() || 'TB-' + Date.now(),
        name: addName.trim(),
        mobile: addMobile.trim(),
        officeId: addOffice,
        initialAmount: Number(addInitialAmount),
        startDate: addStartDate,
        note: addNote.trim(),
      });
      refreshData();
      showToast(
        language === 'EN' ? 'Thak Baki record added successfully.' : 'थकबाकी नोंद यशस्वीपणे जोडली.',
        'success'
      );
      setIsAddModalOpen(false);
      resetAddForm();
    } catch (err: any) {
      showToast(err?.message || (language === 'EN' ? 'Error adding record.' : 'नोंद जोडताना त्रुटी.'), 'error');
    } finally {
      setAddLoading(false);
    }
  };

  const handleOpenEdit = (entry: ThakbakiEntry) => {
    setEditEntry(entry);
    setEditName(entry.name);
    setEditMobile(entry.mobile);
    setEditAccountNo(entry.accountNumber);
    setEditOffice(entry.officeId === 'ALL' ? 'MAIN' : (entry.officeId as 'MAIN' | 'HOME'));
    setEditNote(entry.note || '');
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editEntry) return;
    if (!editName.trim()) {
      showToast(language === 'EN' ? 'Please enter customer name.' : 'कृपया खातेदाराचे नाव भरा.', 'error');
      return;
    }
    setEditLoading(true);
    try {
      StorageService.updateThakbaki(editEntry.id, {
        name: editName.trim(),
        mobile: editMobile.trim(),
        accountNumber: editAccountNo.trim(),
        officeId: editOffice,
        note: editNote.trim(),
      });
      refreshData();
      showToast(
        language === 'EN' ? 'Record updated successfully.' : 'नोंद यशस्वीपणे अद्ययावत केली.',
        'success'
      );
      setIsEditModalOpen(false);
    } catch (err: any) {
      showToast(err?.message || 'Error', 'error');
    } finally {
      setEditLoading(false);
    }
  };

  const handleOpenPay = (entry: ThakbakiEntry) => {
    setPayEntry(entry);
    setPayAmount('');
    setPayDate(todayStr);
    setPayMode('CASH');
    setPayNote('');
    setIsPayModalOpen(true);
  };

  const handlePaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payEntry) return;
    if (!payAmount || Number(payAmount) <= 0) {
      showToast(language === 'EN' ? 'Please enter a valid payment amount.' : 'कृपया वैध जमा रक्कम भरा.', 'error');
      return;
    }
    if (Number(payAmount) > payEntry.remainingAmount) {
      showToast(
        language === 'EN'
          ? `Payment cannot exceed remaining balance of ₹${payEntry.remainingAmount}.`
          : `जमा रक्कम शिल्लक बाकी ₹${payEntry.remainingAmount} पेक्षा जास्त असू शकत नाही.`,
        'error'
      );
      return;
    }
    setPayLoading(true);
    try {
      StorageService.recordThakbakiPayment(payEntry.id, {
        paymentDate: payDate,
        paidAmount: Number(payAmount),
        paymentMode: payMode,
        note: payNote.trim(),
      });
      refreshData();
      showToast(
        language === 'EN' ? 'Payment recorded successfully.' : 'जमा यशस्वीपणे नोंदवली.',
        'success'
      );
      setIsPayModalOpen(false);
    } catch (err: any) {
      showToast(err?.message || 'Error', 'error');
    } finally {
      setPayLoading(false);
    }
  };

  const handleOpenLedger = (entry: ThakbakiEntry) => {
    const freshEntry = StorageService.getThakbakiById(entry.id) || entry;
    setLedgerEntry(freshEntry);
    setIsLedgerModalOpen(true);
  };

  const handleDeletePayment = (thakbakiId: string, paymentId: string) => {
    try {
      const updated = StorageService.deleteThakbakiPayment(thakbakiId, paymentId);
      setLedgerEntry(updated);
      refreshData();
      showToast(
        language === 'EN' ? 'Payment entry removed.' : 'जमा नोंद काढली.',
        'success'
      );
    } catch (err: any) {
      showToast(err?.message || 'Error', 'error');
    }
  };

  const handleDelete = (id: string) => {
    try {
      StorageService.deleteThakbaki(id);
      refreshData();
      showToast(
        language === 'EN' ? 'Thak Baki record deleted.' : 'थकबाकी नोंद हटवली.',
        'success'
      );
      setDeleteId(null);
    } catch (err: any) {
      showToast(err?.message || 'Error', 'error');
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 pb-16">
      {/* ── Page Header ── */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center space-x-2">
              <ClipboardList className="w-6 h-6 text-amber-600" />
              <span>{t.thakbakiTitle}</span>
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">{t.thakbakiSub}</p>
          </div>
          <button
            onClick={handleOpenAddModal}
            className="flex items-center space-x-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs transition-colors shadow-md touch-target cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{t.addThakbaki}</span>
          </button>
        </div>
      </div>

      {/* ── Summary Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
          <div className="flex items-center space-x-2 mb-1">
            <Users className="w-4 h-4 text-slate-500" />
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{t.thakbakiTotalCustomers}</span>
          </div>
          <p className="text-2xl font-black text-slate-900">{summary.totalCustomers}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
          <div className="flex items-center space-x-2 mb-1">
            <IndianRupee className="w-4 h-4 text-rose-500" />
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{t.thakbakiTotalInitial}</span>
          </div>
          <p className="text-lg font-black text-rose-700">{formatCurrency(summary.totalInitial, language)}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
          <div className="flex items-center space-x-2 mb-1">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{t.thakbakiTotalPaid}</span>
          </div>
          <p className="text-lg font-black text-emerald-700">{formatCurrency(summary.totalPaid, language)}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
          <div className="flex items-center space-x-2 mb-1">
            <TrendingDown className="w-4 h-4 text-amber-500" />
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{t.thakbakiTotalRemaining}</span>
          </div>
          <p className="text-lg font-black text-amber-700">{formatCurrency(summary.totalRemaining, language)}</p>
        </div>
      </div>

      {/* ── Filters Row ── */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={language === 'EN' ? 'Search by name, mobile, acc no...' : 'नाव, मोबाईल, खाते क्र. शोधा...'}
            className="flex-1 h-10 px-3 rounded-xl border border-slate-300 text-sm font-bold focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
          />
          <div className="w-full sm:w-44">
            <CustomDropdown<OfficeId>
              value={officeFilter}
              onChange={setOfficeFilter}
              options={OFFICE_OPTIONS}
              placeholder="कार्यालय"
              size="md"
            />
          </div>
          <div className="w-full sm:w-40">
            <CustomDropdown<'ALL' | 'PENDING' | 'CLEARED'>
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'ALL', label: language === 'EN' ? 'All Status' : 'सर्व स्थिती' },
                { value: 'PENDING', label: t.thakbakiPending },
                { value: 'CLEARED', label: t.thakbakiCleared },
              ]}
              placeholder="स्थिती"
              size="md"
            />
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#0B5C45] text-white">
                <th className="px-4 py-3 text-left font-bold text-xs whitespace-nowrap">अ.क्र.</th>
                <th className="px-4 py-3 text-left font-bold text-xs whitespace-nowrap">{t.thakbakiAccountNo}</th>
                <th className="px-4 py-3 text-left font-bold text-xs whitespace-nowrap">{t.thakbakiCustomerName}</th>
                <th className="px-4 py-3 text-left font-bold text-xs whitespace-nowrap">{t.thakbakiMobile}</th>
                <th className="px-4 py-3 text-left font-bold text-xs whitespace-nowrap">{language === 'EN' ? 'Office' : 'कार्यालय'}</th>
                <th className="px-4 py-3 text-right font-bold text-xs whitespace-nowrap">{t.thakbakiInitialAmount}</th>
                <th className="px-4 py-3 text-right font-bold text-xs whitespace-nowrap">{t.thakbakiPaidAmount}</th>
                <th className="px-4 py-3 text-right font-bold text-xs whitespace-nowrap">{t.thakbakiRemainingAmount}</th>
                <th className="px-4 py-3 text-center font-bold text-xs whitespace-nowrap">{t.thakbakiStatus}</th>
                <th className="px-4 py-3 text-center font-bold text-xs whitespace-nowrap">{language === 'EN' ? 'Actions' : 'कृती'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-slate-400 font-bold text-sm">
                    {t.thakbakiNoRecords}
                  </td>
                </tr>
              ) : (
                filteredList.map((entry, idx) => (
                  <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-xs text-slate-500 font-bold">{idx + 1}</td>
                    <td className="px-4 py-3 text-xs font-extrabold text-slate-700">{entry.accountNumber}</td>
                    <td className="px-4 py-3 font-extrabold text-slate-900 whitespace-nowrap">{entry.name}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 font-medium">{entry.mobile || '-'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 font-medium">{getOfficeNameMarathi(entry.officeId, language)}</td>
                    <td className="px-4 py-3 text-right text-xs font-bold text-slate-700">{formatCurrency(entry.initialAmount, language)}</td>
                    <td className="px-4 py-3 text-right text-xs font-bold text-emerald-700">{formatCurrency(entry.paidAmount, language)}</td>
                    <td className="px-4 py-3 text-right text-xs font-black text-rose-700">{formatCurrency(entry.remainingAmount, language)}</td>
                    <td className="px-4 py-3 text-center">
                      {entry.status === 'CLEARED' ? (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <Check className="w-3 h-3" />
                          <span>{t.thakbakiCleared}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200">
                          <Clock className="w-3 h-3" />
                          <span>{t.thakbakiPending}</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* Pay Button */}
                        {entry.status !== 'CLEARED' && (
                          <button
                            onClick={() => handleOpenPay(entry)}
                            className="p-1.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-700 transition-colors cursor-pointer"
                            title={t.thakbakiPayNow}
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {/* Ledger Button */}
                        <button
                          onClick={() => handleOpenLedger(entry)}
                          className="p-1.5 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-700 transition-colors cursor-pointer"
                          title={t.thakbakiViewLedger}
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                        </button>
                        {/* Edit Button */}
                        <button
                          onClick={() => handleOpenEdit(entry)}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                          title={language === 'EN' ? 'Edit' : 'बदल'}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {/* Delete Button */}
                        <button
                          onClick={() => setDeleteId(entry.id)}
                          className="p-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 transition-colors cursor-pointer"
                          title={language === 'EN' ? 'Delete' : 'हटवा'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          ADD THAKBAKI MODAL
         ══════════════════════════════════════════════════════════════════════ */}
      {isAddModalOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center">
                    <Plus className="w-4 h-4 text-amber-700" />
                  </div>
                  <h3 className="text-base font-extrabold text-slate-900">{t.addThakbaki}</h3>
                </div>
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddSubmit} className="p-5 space-y-4">
                {/* Mode toggle */}
                <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
                  <button
                    type="button"
                    onClick={() => setAddMode('EXISTING')}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                      addMode === 'EXISTING' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {t.thakbakiSelectExisting}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddMode('MANUAL')}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                      addMode === 'MANUAL' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {language === 'EN' ? 'Old / Manual' : 'जुने / हस्तचलित'}
                  </button>
                </div>

                {/* Existing customer selection */}
                {addMode === 'EXISTING' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      {t.thakbakiSelectExisting} <span className="text-rose-500">*</span>
                    </label>
                    <CustomDropdown<string>
                      value={addSelectedCustomerId}
                      onChange={handleExistingCustomerSelect}
                      options={customerOptions}
                      placeholder={language === 'EN' ? 'Select customer...' : 'खातेदार निवडा...'}
                      size="md"
                    />
                  </div>
                )}

                {/* Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {t.thakbakiCustomerName} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    placeholder={language === 'EN' ? 'Full Name' : 'पूर्ण नाव'}
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-bold focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  />
                </div>

                {/* Mobile + Account */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">{t.thakbakiMobile}</label>
                    <input
                      type="tel"
                      value={addMobile}
                      onChange={(e) => setAddMobile(e.target.value)}
                      placeholder="9XXXXXXXXX"
                      className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-bold focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">{t.thakbakiAccountNo}</label>
                    <input
                      type="text"
                      value={addAccountNo}
                      onChange={(e) => setAddAccountNo(e.target.value)}
                      placeholder="खाते क्र."
                      className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-bold focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>

                {/* Office */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">{language === 'EN' ? 'Office' : 'कार्यालय'}</label>
                  <CustomDropdown<OfficeId>
                    value={addOffice}
                    onChange={(val) => setAddOffice(val === 'ALL' ? 'MAIN' : val)}
                    options={OFFICE_OPTIONS.filter((o) => o.value !== 'ALL')}
                    placeholder="कार्यालय"
                    size="md"
                  />
                </div>

                {/* Initial Amount + Start Date */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      {t.thakbakiInitialAmount} <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={addInitialAmount}
                      onChange={(e) => setAddInitialAmount(e.target.value ? Number(e.target.value) : '')}
                      placeholder="₹"
                      className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-black text-rose-700 focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">{t.thakbakiStartDate}</label>
                    <input
                      type="date"
                      value={addStartDate}
                      onChange={(e) => setAddStartDate(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-bold focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>

                {/* Note */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">{t.thakbakiNote}</label>
                  <textarea
                    value={addNote}
                    onChange={(e) => setAddNote(e.target.value)}
                    placeholder={language === 'EN' ? 'Optional remark...' : 'पर्यायी शेरा...'}
                    rows={2}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-medium resize-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    {language === 'EN' ? 'Cancel' : 'रद्द करा'}
                  </button>
                  <button
                    type="submit"
                    disabled={addLoading}
                    className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-sm transition-colors shadow-md disabled:opacity-60 cursor-pointer"
                  >
                    {addLoading ? '...' : (language === 'EN' ? 'Add Record' : 'नोंद जोडा')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          EDIT THAKBAKI MODAL
         ══════════════════════════════════════════════════════════════════════ */}
      {isEditModalOpen && editEntry && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
                    <Edit2 className="w-4 h-4 text-slate-600" />
                  </div>
                  <h3 className="text-base font-extrabold text-slate-900">{language === 'EN' ? 'Edit Record' : 'नोंद बदला'}</h3>
                </div>
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleEditSubmit} className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {t.thakbakiCustomerName} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-bold focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">{t.thakbakiMobile}</label>
                    <input
                      type="tel"
                      value={editMobile}
                      onChange={(e) => setEditMobile(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-bold focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">{t.thakbakiAccountNo}</label>
                    <input
                      type="text"
                      value={editAccountNo}
                      onChange={(e) => setEditAccountNo(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-bold focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">{language === 'EN' ? 'Office' : 'कार्यालय'}</label>
                  <CustomDropdown<OfficeId>
                    value={editOffice}
                    onChange={(val) => setEditOffice(val === 'ALL' ? 'MAIN' : val)}
                    options={OFFICE_OPTIONS.filter((o) => o.value !== 'ALL')}
                    placeholder="कार्यालय"
                    size="md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">{t.thakbakiNote}</label>
                  <textarea
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-medium resize-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-50 cursor-pointer"
                  >
                    {language === 'EN' ? 'Cancel' : 'रद्द करा'}
                  </button>
                  <button
                    type="submit"
                    disabled={editLoading}
                    className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-sm shadow-md disabled:opacity-60 cursor-pointer"
                  >
                    {editLoading ? '...' : (language === 'EN' ? 'Save Changes' : 'जतन करा')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          PAY AMOUNT MODAL
         ══════════════════════════════════════════════════════════════════════ */}
      {isPayModalOpen && payEntry && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center">
                    <CreditCard className="w-4 h-4 text-emerald-700" />
                  </div>
                  <h3 className="text-base font-extrabold text-slate-900">{t.thakbakiPayNow}</h3>
                </div>
                <button
                  onClick={() => setIsPayModalOpen(false)}
                  className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Customer Info */}
              <div className="mx-5 mt-4 bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <p className="font-extrabold text-slate-900 text-sm">{payEntry.name}</p>
                <p className="text-xs text-slate-500 font-medium">{payEntry.accountNumber} • {payEntry.mobile}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs font-bold text-slate-600">{t.thakbakiRemainingAmount}:</span>
                  <span className="text-base font-black text-rose-700">{formatCurrency(payEntry.remainingAmount, language)}</span>
                </div>
              </div>

              <form onSubmit={handlePaySubmit} className="p-5 space-y-4">
                {/* Amount */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {t.thakbakiPaidAmount} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={payEntry.remainingAmount}
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value ? Number(e.target.value) : '')}
                    placeholder="₹"
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 text-lg font-black text-emerald-700 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    autoFocus
                  />
                </div>

                {/* Date + Mode */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">{t.thakbakiPaymentDate}</label>
                    <input
                      type="date"
                      value={payDate}
                      onChange={(e) => setPayDate(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-bold focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">{t.thakbakiPaymentMode}</label>
                    <CustomDropdown<'CASH' | 'ONLINE' | 'BANK'>
                      value={payMode}
                      onChange={setPayMode}
                      options={PAYMENT_MODE_OPTIONS as any}
                      size="md"
                    />
                  </div>
                </div>

                {/* Note */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">{t.thakbakiPaymentNote}</label>
                  <input
                    type="text"
                    value={payNote}
                    onChange={(e) => setPayNote(e.target.value)}
                    placeholder={language === 'EN' ? 'Optional note...' : 'पर्यायी नोंद...'}
                    className="w-full h-10 px-3 rounded-xl border border-slate-300 text-sm font-medium focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* New balance preview */}
                {payAmount !== '' && Number(payAmount) > 0 && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs font-bold text-emerald-800">
                    {language === 'EN' ? 'New balance after payment:' : 'जमा केल्यावर शिल्लक बाकी:'}
                    {' '}
                    <span className="text-base font-black">
                      {formatCurrency(Math.max(0, payEntry.remainingAmount - Number(payAmount)), language)}
                    </span>
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsPayModalOpen(false)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-50 cursor-pointer"
                  >
                    {language === 'EN' ? 'Cancel' : 'रद्द करा'}
                  </button>
                  <button
                    type="submit"
                    disabled={payLoading}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm shadow-md disabled:opacity-60 cursor-pointer"
                  >
                    {payLoading ? '...' : t.thakbakiSubmitPayment}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          LEDGER / PAYMENT HISTORY MODAL
         ══════════════════════════════════════════════════════════════════════ */}
      {isLedgerModalOpen && ledgerEntry && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center">
                    <BookOpen className="w-4 h-4 text-blue-700" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900">{t.thakbakiPaymentHistory}</h3>
                    <p className="text-xs text-slate-500">{ledgerEntry.name} • {ledgerEntry.accountNumber}</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsLedgerModalOpen(false)}
                  className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Balance Summary */}
              <div className="mx-5 mt-4 grid grid-cols-3 gap-2">
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">{language === 'EN' ? 'Initial' : 'मूळ थकबाकी'}</p>
                  <p className="text-sm font-black text-slate-900 mt-0.5">{formatCurrency(ledgerEntry.initialAmount, language)}</p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-3 text-center">
                  <p className="text-[10px] font-bold text-emerald-600 uppercase">{language === 'EN' ? 'Paid' : 'जमा'}</p>
                  <p className="text-sm font-black text-emerald-700 mt-0.5">{formatCurrency(ledgerEntry.paidAmount, language)}</p>
                </div>
                <div className="bg-rose-50 rounded-xl p-3 text-center">
                  <p className="text-[10px] font-bold text-rose-500 uppercase">{language === 'EN' ? 'Balance' : 'शिल्लक'}</p>
                  <p className="text-sm font-black text-rose-700 mt-0.5">{formatCurrency(ledgerEntry.remainingAmount, language)}</p>
                </div>
              </div>

              {/* Status Badge */}
              <div className="px-5 mt-3">
                {ledgerEntry.status === 'CLEARED' ? (
                  <div className="flex items-center justify-center space-x-2 py-2 bg-emerald-100 rounded-xl">
                    <Check className="w-4 h-4 text-emerald-700" />
                    <span className="text-xs font-extrabold text-emerald-800">{t.thakbakiCleared}</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center space-x-2 py-2 bg-amber-100 rounded-xl">
                    <Clock className="w-4 h-4 text-amber-700" />
                    <span className="text-xs font-extrabold text-amber-800">{t.thakbakiPending}</span>
                  </div>
                )}
              </div>

              {/* Payment List */}
              <div className="p-5 space-y-2">
                <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wide">
                  {t.thakbakiPaymentHistory} ({(ledgerEntry.payments || []).length})
                </h4>
                {(ledgerEntry.payments || []).length === 0 ? (
                  <p className="text-sm text-slate-400 font-medium py-4 text-center">{t.thakbakiNoPayments}</p>
                ) : (
                  [...(ledgerEntry.payments || [])].reverse().map((payment, idx) => (
                    <div key={payment.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                      <div className="flex items-center space-x-3">
                        <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-black text-emerald-700">
                          {(ledgerEntry.payments || []).length - idx}
                        </div>
                        <div>
                          <p className="text-xs font-extrabold text-slate-900">{formatCurrency(payment.paidAmount, language)}</p>
                          <p className="text-[10px] text-slate-500 font-medium">
                            {formatDateMarathi(payment.paymentDate, language)} •{' '}
                            {payment.paymentMode === 'CASH'
                              ? (language === 'EN' ? 'Cash' : 'रोख')
                              : payment.paymentMode === 'ONLINE'
                              ? 'Online'
                              : 'Bank'}
                          </p>
                          {payment.note && (
                            <p className="text-[10px] text-slate-400 font-medium">{payment.note}</p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeletePayment(ledgerEntry.id, payment.id)}
                        className="p-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 transition-colors cursor-pointer"
                        title={language === 'EN' ? 'Remove entry' : 'नोंद काढा'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Pay now shortcut from ledger */}
              {ledgerEntry.status !== 'CLEARED' && (
                <div className="px-5 pb-5">
                  <button
                    onClick={() => {
                      setIsLedgerModalOpen(false);
                      handleOpenPay(ledgerEntry);
                    }}
                    className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm flex items-center justify-center space-x-2 shadow-md cursor-pointer"
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>{t.thakbakiPayNow}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </ModalPortal>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          DELETE CONFIRMATION MODAL
         ══════════════════════════════════════════════════════════════════════ */}
      {deleteId && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6 text-rose-600" />
              </div>
              <h3 className="text-base font-extrabold text-slate-900 mb-2">
                {language === 'EN' ? 'Delete Record?' : 'नोंद हटवायची?'}
              </h3>
              <p className="text-xs text-slate-500 font-medium mb-5">{t.thakbakiDeleteConfirm}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteId(null)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-50 cursor-pointer"
                >
                  {language === 'EN' ? 'Cancel' : 'रद्द करा'}
                </button>
                <button
                  onClick={() => handleDelete(deleteId)}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-sm shadow-md cursor-pointer"
                >
                  {language === 'EN' ? 'Delete' : 'हटवा'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
};
