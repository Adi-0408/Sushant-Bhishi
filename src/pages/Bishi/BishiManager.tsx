import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { BishiConfig, BishiType, Modality } from '../../types';
import { StorageService } from '../../services/db';
import { formatDateMarathi, getOfficeNameMarathi } from '../../utils/formatters';
import { Calendar, Save, Edit3, Plus, X, Trash2 } from 'lucide-react';
import { ModalPortal } from '../../components/common/ModalPortal';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { MarathiTextInput, convertTextToMarathi } from '../../components/common/MarathiTextInput';

export const BishiManager: React.FC = () => {
  const { bishiConfigs, customers, activeOffice, refreshData, showToast, language } = useApp();

  const [editingId, setEditingId] = useState<BishiType | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [installments, setInstallments] = useState<number>(40);
  const [modality, setModality] = useState<Modality>('W');

  // New Bishi Scheme Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newBishiName, setNewBishiName] = useState('');
  const [newStartDate, setNewStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [newEndDate, setNewEndDate] = useState(
    new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [newModality, setNewModality] = useState<Modality>('W');
  const [newInstallments, setNewInstallments] = useState<number>(40);

  const startEdit = (config: BishiConfig) => {
    setEditingId(config.id);
    setStartDate(config.startDate);
    setEndDate(config.endDate);
    const configModality = config.modality || (config.id === '26_JANUARY' ? 'M' : 'W');
    setModality(configModality);
    setInstallments(config.totalInstallments || (configModality === 'M' ? 10 : 40));
  };

  const handleSave = (id: BishiType) => {
    const updatedList = bishiConfigs.map((cfg) => {
      if (cfg.id === id) {
        return {
          ...cfg,
          startDate,
          endDate,
          modality,
          totalInstallments: Number(installments),
        };
      }
      return cfg;
    });

    StorageService.saveBishiConfigs(updatedList);
    showToast(
      language === 'EN'
        ? 'Bishi scheme updated successfully.'
        : 'भिशी योजनेचे हप्ते व तारीख यशस्वीपणे अपडेट झाली.',
      'success'
    );
    refreshData();
    setEditingId(null);
  };

  const handleAddBishi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBishiName.trim()) {
      showToast(
        language === 'EN' ? 'Please enter a valid Bishi scheme name.' : 'कृपया भिशी योजनेचे नाव प्रविष्ट करा.',
        'error'
      );
      return;
    }

    const trimmedName = newBishiName.trim();
    const finalName = language === 'MR' ? await convertTextToMarathi(trimmedName) : trimmedName;

    const schemeId = finalName.trim().toUpperCase().replace(/\s+/g, '_');
    const newConfig: BishiConfig = {
      id: schemeId,
      name: finalName.trim(),
      startDate: newStartDate,
      endDate: newEndDate,
      modality: newModality,
      totalInstallments: Number(newInstallments) || (newModality === 'M' ? 10 : 40),
      officeId: activeOffice === 'ALL' ? 'MAIN' : activeOffice,
      color: 'bg-emerald-700',
      bgPastel: 'bg-emerald-50/50',
    };

    const updatedList = [...bishiConfigs, newConfig];
    StorageService.saveBishiConfigs(updatedList);
    showToast(
      language === 'EN' ? 'New Bishi scheme added successfully!' : 'नवीन भिशी योजना यशस्वीपणे जोडली गेली!',
      'success'
    );
    refreshData();
    setIsAddModalOpen(false);
    setNewBishiName('');
  };

  // Helper: calculate end date from start date, modality, and count
  const calculateEndDateFromInstallments = (
    startStr: string,
    mod: Modality,
    count: number
  ): string => {
    if (!startStr || !count || count <= 0) return '';
    const d = new Date(startStr);
    if (isNaN(d.getTime())) return '';

    if (mod === 'W') {
      d.setDate(d.getDate() + count * 7);
    } else {
      d.setMonth(d.getMonth() + count);
    }

    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // Helper: calculate installments (weeks or months) from start date and end date
  const calculateInstallmentsFromDates = (
    startStr: string,
    endStr: string,
    mod: Modality
  ): number => {
    if (!startStr || !endStr) return mod === 'M' ? 10 : 40;
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      return mod === 'M' ? 10 : 40;
    }

    if (mod === 'W') {
      const diffMs = end.getTime() - start.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      const weeks = Math.round(diffDays / 7);
      return Math.max(1, weeks);
    } else {
      const yearDiff = end.getFullYear() - start.getFullYear();
      const monthDiff = end.getMonth() - start.getMonth();
      const dayDiff = (end.getDate() - start.getDate()) / 30;
      const months = Math.round(yearDiff * 12 + monthDiff + dayDiff);
      return Math.max(1, months);
    }
  };

  // Card Edit Handlers
  const handleStartDateChange = (newStart: string) => {
    setStartDate(newStart);
    if (installments && installments > 0) {
      const calculatedEnd = calculateEndDateFromInstallments(newStart, modality, installments);
      if (calculatedEnd) {
        setEndDate(calculatedEnd);
      }
    }
  };

  const handleEndDateChange = (newEnd: string) => {
    setEndDate(newEnd);
    if (startDate) {
      const calculatedCount = calculateInstallmentsFromDates(startDate, newEnd, modality);
      if (calculatedCount > 0) {
        setInstallments(calculatedCount);
      }
    }
  };

  const handleInstallmentsChange = (val: number | '') => {
    const num = Number(val);
    setInstallments(num);
    if (startDate && num > 0) {
      const calculatedEnd = calculateEndDateFromInstallments(startDate, modality, num);
      if (calculatedEnd) {
        setEndDate(calculatedEnd);
      }
    }
  };

  const handleModalityChangeInEdit = (m: Modality) => {
    setModality(m);
    const defaultCount = m === 'M' ? 10 : 40;
    setInstallments(defaultCount);
    if (startDate) {
      const calculatedEnd = calculateEndDateFromInstallments(startDate, m, defaultCount);
      if (calculatedEnd) {
        setEndDate(calculatedEnd);
      }
    }
  };

  // Add Modal Handlers
  const handleNewStartDateChange = (newStart: string) => {
    setNewStartDate(newStart);
    if (newInstallments && newInstallments > 0) {
      const calculatedEnd = calculateEndDateFromInstallments(newStart, newModality, newInstallments);
      if (calculatedEnd) {
        setNewEndDate(calculatedEnd);
      }
    }
  };

  const handleNewEndDateChange = (newEnd: string) => {
    setNewEndDate(newEnd);
    if (newStartDate) {
      const calculatedCount = calculateInstallmentsFromDates(newStartDate, newEnd, newModality);
      if (calculatedCount > 0) {
        setNewInstallments(calculatedCount);
      }
    }
  };

  const handleNewInstallmentsChange = (val: number | '') => {
    const num = Number(val);
    setNewInstallments(num);
    if (newStartDate && num > 0) {
      const calculatedEnd = calculateEndDateFromInstallments(newStartDate, newModality, num);
      if (calculatedEnd) {
        setNewEndDate(calculatedEnd);
      }
    }
  };

  const handleModalityChangeInAdd = (m: Modality) => {
    setNewModality(m);
    const defaultCount = m === 'M' ? 10 : 40;
    setNewInstallments(defaultCount);
    if (newStartDate) {
      const calculatedEnd = calculateEndDateFromInstallments(newStartDate, m, defaultCount);
      if (calculatedEnd) {
        setNewEndDate(calculatedEnd);
      }
    }
  };

  // Delete Bishi Scheme state
  const [schemeToDelete, setSchemeToDelete] = useState<BishiConfig | null>(null);

  const handleDeleteScheme = async (scheme: BishiConfig) => {
    try {
      await StorageService.deleteBishiConfig(scheme.id);
      showToast(
        language === 'EN'
          ? `Bishi scheme "${scheme.name}" deleted successfully.`
          : `"${scheme.name}" भिशी योजना यशस्वीपणे हटवली गेली.`,
        'success'
      );
      refreshData();
    } catch (err) {
      showToast(
        language === 'EN' ? 'Failed to delete Bishi scheme.' : 'भिशी योजना हटवता आली नाही.',
        'error'
      );
    } finally {
      setSchemeToDelete(null);
    }
  };

  const defaultInitialList: BishiConfig[] = [
    {
      id: '15_AUGUST',
      name: language === 'EN' ? '15 August Bishi' : '१५ ऑगस्ट भिशी',
      startDate: `${new Date().getFullYear()}-08-15`,
      endDate: `${new Date().getFullYear() + 1}-08-14`,
      totalInstallments: 40,
      modality: 'W',
      officeId: activeOffice,
      color: 'bg-emerald-600',
      bgPastel: 'bg-pastel-green/30',
    },
    {
      id: '26_JANUARY',
      name: language === 'EN' ? '26 January Bishi' : '२६ जानेवारी भिशी',
      startDate: `${new Date().getFullYear()}-01-26`,
      endDate: `${new Date().getFullYear() + 1}-01-25`,
      totalInstallments: 10,
      modality: 'M',
      officeId: activeOffice,
      color: 'bg-brand-600',
      bgPastel: 'bg-pastel-blue/30',
    },
    {
      id: 'DASARA',
      name: language === 'EN' ? 'Dasara Bishi' : 'दसरा भिशी',
      startDate: `${new Date().getFullYear()}-10-12`,
      endDate: `${new Date().getFullYear() + 1}-10-11`,
      totalInstallments: 40,
      modality: 'W',
      officeId: activeOffice,
      color: 'bg-amber-600',
      bgPastel: 'bg-pastel-yellow/30',
    },
  ];

  // Seed default configs if storage was never initialized
  React.useEffect(() => {
    if (bishiConfigs.length === 0 && localStorage.getItem('sushant_bishi_configs') === null) {
      StorageService.saveBishiConfigs(defaultInitialList);
      refreshData();
    }
  }, [bishiConfigs.length]);

  const getSchemeColors = (id: string, index: number) => {
    if (id === '15_AUGUST') return { color: 'bg-emerald-600', bgPastel: 'bg-pastel-green/30' };
    if (id === '26_JANUARY') return { color: 'bg-brand-600', bgPastel: 'bg-pastel-blue/30' };
    if (id === 'DASARA') return { color: 'bg-amber-600', bgPastel: 'bg-pastel-yellow/30' };

    const palette = [
      { color: 'bg-emerald-700', bgPastel: 'bg-emerald-50/50' },
      { color: 'bg-purple-600', bgPastel: 'bg-purple-50/50' },
      { color: 'bg-indigo-600', bgPastel: 'bg-indigo-50/50' },
      { color: 'bg-teal-600', bgPastel: 'bg-teal-50/50' },
      { color: 'bg-rose-600', bgPastel: 'bg-rose-50/50' },
      { color: 'bg-cyan-700', bgPastel: 'bg-cyan-50/50' },
    ];
    return palette[index % palette.length];
  };

  // Display configs directly from stored bishiConfigs
  const displayConfigs: BishiConfig[] = bishiConfigs.map((cfg, idx) => {
    const defaultCol = getSchemeColors(cfg.id, idx);
    return {
      ...cfg,
      color: cfg.color || defaultCol.color,
      bgPastel: cfg.bgPastel || defaultCol.bgPastel,
    };
  });

  const associatedCustomers = schemeToDelete
    ? customers.filter((c) => c.bishiType === schemeToDelete.id)
    : [];

  const confirmDeleteMessage = schemeToDelete
    ? associatedCustomers.length > 0
      ? language === 'EN'
        ? `Are you sure you want to delete the "${schemeToDelete.name}" scheme? Warning: ${associatedCustomers.length} customer(s) are currently registered under this scheme. Existing transaction records will be preserved, but this scheme will no longer be available for new registrations.`
        : `तुम्हाला खात्रीने "${schemeToDelete.name}" भिशी योजना हटवायची आहे का? सावधान: या योजनेखाली सध्या ${associatedCustomers.length} खातेदार नोंदणीकृत आहेत. त्यांचे जुने व्यवहार सुरक्षित राहतील, परंतु नवीन निवडीसाठी ही योजना उपलब्ध राहणार नाही.`
      : language === 'EN'
      ? `Are you sure you want to delete the "${schemeToDelete.name}" scheme? This action cannot be undone.`
      : `तुम्हाला खात्रीने "${schemeToDelete.name}" भिशी योजना हटवायची आहे का? ही योजना कायमची हटवली जाईल.`
    : '';

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center space-x-2">
            <Calendar className="w-6 h-6 text-brand-700" />
            <span>
              {language === 'EN' ? 'Bishi Scheme Manager' : 'भिशी व्यवस्थापन'} ({getOfficeNameMarathi(activeOffice, language)})
            </span>
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-1">
            {language === 'EN'
              ? 'Manage start date, end date, modality (Monthly 10M / Weekly 40W), and edit total installments'
              : 'भिशीची सुरुवातीची तारीख, शेवटची तारीख आणि एकूण हप्ते (साप्ताहिक ४० / मासिक १०) बदलून जतन करा'}
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="w-full sm:w-auto px-5 py-2.5 min-h-[44px] rounded-xl bg-emerald-700 text-white font-extrabold text-sm hover:bg-emerald-800 transition-colors shadow-md flex items-center justify-center space-x-2 touch-target cursor-pointer"
        >
          <Plus className="w-5 h-5" />
          <span>{language === 'EN' ? 'Add Bishi Scheme' : 'नवीन भिशी योजना जोडा'}</span>
        </button>
      </div>

      {/* Dynamic Cards Grid */}
      {displayConfigs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center flex flex-col items-center justify-center space-y-3 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <Calendar className="w-7 h-7" />
          </div>
          <h3 className="text-base font-extrabold text-slate-900">
            {language === 'EN' ? 'No Bishi Schemes Found' : 'कोणतीही भिशी योजना उपलब्ध नाही'}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm">
            {language === 'EN'
              ? 'Currently there are no active Bishi schemes. Click below to add a new Bishi scheme.'
              : 'सध्या कोणतीही भिशी योजना नाही. नवीन भिशी योजना तयार करण्यासाठी खालील बटणावर क्लिक करा.'}
          </p>
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs flex items-center space-x-2 shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{language === 'EN' ? 'Add Bishi Scheme' : 'नवीन भिशी योजना जोडा'}</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {displayConfigs.map((config) => {
            const isEditing = editingId === config.id;
            const cardColor = config.color || 'bg-emerald-600';
            const cardPastel = config.bgPastel || 'bg-pastel-green/30';
            const currentModality = config.modality || (config.id === '26_JANUARY' ? 'M' : 'W');
            const currentTotalInst = config.totalInstallments || (currentModality === 'M' ? 10 : 40);

            return (
              <div key={config.id} className="rainbow-border-box">
                <div className="bg-white rounded-[1.1rem] overflow-hidden flex flex-col justify-between h-full">
                  {/* Header Banner */}
                  <div className={`${cardColor} p-6 text-white text-center`}>
                    <span className="text-xs font-bold uppercase tracking-wider text-white/80 block mb-1">
                      {language === 'EN' ? 'Bishi Scheme' : 'भिशी प्रकार'}
                    </span>
                    <h3 className="text-2xl font-black text-white !text-white">{config.name}</h3>
                  </div>

                  {/* Body */}
                  <div className={`p-6 space-y-4 flex-1 ${cardPastel}`}>
                    {isEditing ? (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            {language === 'EN' ? 'Frequency / Modality:' : 'पद्धत (साप्ताहिक / मासिक):'}
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => handleModalityChangeInEdit('W')}
                              className={`py-2 text-xs font-extrabold rounded-xl border ${
                                modality === 'W'
                                  ? 'bg-brand-800 text-white border-brand-800'
                                  : 'bg-white text-slate-700 border-slate-300'
                              }`}
                            >
                              {language === 'EN' ? 'Weekly (40 W)' : 'साप्ताहिक (४० आठवडे)'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleModalityChangeInEdit('M')}
                              className={`py-2 text-xs font-extrabold rounded-xl border ${
                                modality === 'M'
                                  ? 'bg-brand-800 text-white border-brand-800'
                                  : 'bg-white text-slate-700 border-slate-300'
                              }`}
                            >
                              {language === 'EN' ? 'Monthly (10 M)' : 'मासिक (१० महिने)'}
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            {language === 'EN' ? 'Start Date:' : 'सुरुवातीची तारीख:'}
                          </label>
                          <input
                            type="date"
                            value={startDate}
                            onChange={(e) => handleStartDateChange(e.target.value)}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-bold bg-white focus:ring-2 focus:ring-[#0F7A5C]"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-xs font-bold text-slate-700">
                              {language === 'EN' ? 'End Date:' : 'शेवटची तारीख:'}
                            </label>
                            <span className="text-[10px] text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                              {language === 'EN' ? 'Auto-synced' : 'आपोआप अपडेट होते'}
                            </span>
                          </div>
                          <input
                            type="date"
                            value={endDate}
                            onChange={(e) => handleEndDateChange(e.target.value)}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-bold bg-white focus:ring-2 focus:ring-[#0F7A5C]"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-xs font-bold text-slate-700">
                              {modality === 'M'
                                ? language === 'EN' ? 'Total Months (Editable):' : 'एकूण महिने (Edit करा):'
                                : language === 'EN' ? 'Total Weeks (Editable):' : 'एकूण आठवडे (Edit करा):'}
                            </label>
                            <span className="text-[10px] text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                              {language === 'EN' ? 'Auto-calculates dates' : 'तारीख आपोआप बदलते'}
                            </span>
                          </div>
                          <input
                            type="number"
                            min={1}
                            max={200}
                            value={installments || ''}
                            onChange={(e) => handleInstallmentsChange(e.target.value === '' ? '' : Number(e.target.value))}
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-black text-brand-900 bg-white focus:ring-2 focus:ring-[#0F7A5C]"
                          />
                          <div className="text-[11px] font-bold text-emerald-800 mt-1 flex items-center space-x-1">
                            <span>💡</span>
                            <span>
                              {modality === 'M'
                                ? (language === 'EN' ? 'Changing months updates end date automatically, and vice-versa.' : 'महिने बदलल्यास शेवटची तारीख आपोआप बदलते, तसेच तारीख बदलल्यास महिने बदलतात.')
                                : (language === 'EN' ? 'Changing weeks updates end date automatically, and vice-versa.' : 'आठवडे बदलल्यास शेवटची तारीख आपोआप बदलते, तसेच तारीख बदलल्यास आठवडे बदलतात.')}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3 text-sm font-medium">
                        <div className="flex justify-between items-center p-3 bg-white/90 rounded-xl border border-slate-100 shadow-2xs">
                          <span className="text-xs text-slate-500 font-bold">
                            {language === 'EN' ? 'Frequency' : 'पद्धत'}
                          </span>
                          <span className="font-extrabold text-brand-800">
                            {currentModality === 'M'
                              ? language === 'EN' ? 'Monthly' : 'मासिक (Monthly)'
                              : language === 'EN' ? 'Weekly' : 'साप्ताहिक (Weekly)'}
                          </span>
                        </div>

                        <div className="flex justify-between items-center p-3 bg-white/90 rounded-xl border border-slate-100 shadow-2xs">
                          <span className="text-xs text-slate-500 font-bold">
                            {language === 'EN' ? 'Total Installments' : 'एकूण हप्ते'}
                          </span>
                          <span className="font-extrabold text-slate-900">
                            {currentTotalInst}{' '}
                            {currentModality === 'M'
                              ? language === 'EN' ? 'Months' : 'महिने'
                              : language === 'EN' ? 'Weeks' : 'आठवडे'}
                          </span>
                        </div>

                        <div className="flex justify-between items-center p-3 bg-white/90 rounded-xl border border-slate-100 shadow-2xs">
                          <span className="text-xs text-slate-500 font-bold">
                            {language === 'EN' ? 'Start Date' : 'सुरुवातीची तारीख'}
                          </span>
                          <span className="font-extrabold text-slate-800">
                            {formatDateMarathi(config.startDate, language)}
                          </span>
                        </div>

                        <div className="flex justify-between items-center p-3 bg-white/90 rounded-xl border border-slate-100 shadow-2xs">
                          <span className="text-xs text-slate-500 font-bold">
                            {language === 'EN' ? 'End Date' : 'शेवटची तारीख'}
                          </span>
                          <span className="font-extrabold text-slate-800">
                            {formatDateMarathi(config.endDate, language)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action */}
                  <div className="p-4 bg-white border-t border-slate-100">
                    {isEditing ? (
                      <div className="flex space-x-2">
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="w-1/2 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-extrabold text-xs transition-colors cursor-pointer"
                        >
                          {language === 'EN' ? 'Cancel' : 'रद्द करा'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSave(config.id)}
                          className="w-1/2 py-2.5 rounded-xl bg-[#0F7A5C] hover:bg-[#0B5C45] text-white font-extrabold text-xs flex items-center justify-center space-x-1.5 shadow-md transition-colors cursor-pointer"
                        >
                          <Save className="w-4 h-4" />
                          <span>{language === 'EN' ? 'Save' : 'जतन करा'}</span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => startEdit(config)}
                          className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white font-extrabold text-xs hover:bg-slate-800 transition-all flex items-center justify-center space-x-2 shadow-xs cursor-pointer hover:shadow-md active:scale-[0.99]"
                        >
                          <Edit3 className="w-4 h-4" />
                          <span>{language === 'EN' ? 'Edit Scheme' : 'तारीख / हप्ते बदला'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSchemeToDelete(config)}
                          className="p-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-700 border border-rose-200 transition-all flex items-center justify-center shadow-xs cursor-pointer hover:scale-105 active:scale-95"
                          title={language === 'EN' ? 'Delete Bishi Scheme' : 'भिशी योजना हटवा'}
                          aria-label={language === 'EN' ? 'Delete Bishi Scheme' : 'भिशी योजना हटवा'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add New Bishi Scheme Modal */}
      {isAddModalOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs no-print overflow-hidden">
            <div className="bg-white rounded-2xl sm:rounded-3xl max-w-md w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in duration-150">
            <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center space-x-2">
                <Calendar className="w-5 h-5 text-emerald-700" />
                <span>{language === 'EN' ? 'Add New Bishi Scheme' : 'नवीन भिशी योजना जोडा'}</span>
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddBishi} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {language === 'EN' ? 'Bishi Scheme Name' : 'भिशी योजनेचे नाव'} <span className="text-rose-500">*</span>
                  </label>
                  <MarathiTextInput
                    required
                    value={newBishiName}
                    onChange={(val) => setNewBishiName(val)}
                    placeholder={language === 'EN' ? 'e.g. Diwali Bishi, Ganesh Bishi' : 'उदा. diwali -> दिवाळी भिशी, ganesh -> गणेश'}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {language === 'EN' ? 'Frequency / Modality' : 'पद्धत (साप्ताहिक / मासिक)'} <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleModalityChangeInAdd('W')}
                      className={`py-2 text-xs font-extrabold rounded-xl border ${
                        newModality === 'W'
                          ? 'bg-brand-800 text-white border-brand-800'
                          : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      {language === 'EN' ? 'Weekly (40 Weeks)' : 'साप्ताहिक (४० आठवडे)'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleModalityChangeInAdd('M')}
                      className={`py-2 text-xs font-extrabold rounded-xl border ${
                        newModality === 'M'
                          ? 'bg-brand-800 text-white border-brand-800'
                          : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      {language === 'EN' ? 'Monthly (10 Months)' : 'मासिक (१० महिने)'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      {language === 'EN' ? 'Start Date' : 'सुरुवातीची तारीख'}
                    </label>
                    <input
                      type="date"
                      required
                      value={newStartDate}
                      onChange={(e) => handleNewStartDateChange(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold bg-white focus:ring-2 focus:ring-[#0F7A5C]"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-slate-700">
                        {language === 'EN' ? 'End Date' : 'शेवटची तारीख'}
                      </label>
                      <span className="text-[10px] text-emerald-800 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60">
                        {language === 'EN' ? 'Auto' : 'आपोआप'}
                      </span>
                    </div>
                    <input
                      type="date"
                      required
                      value={newEndDate}
                      onChange={(e) => handleNewEndDateChange(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold bg-white focus:ring-2 focus:ring-[#0F7A5C]"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">
                      {newModality === 'M'
                        ? language === 'EN' ? 'Total Months (Editable)' : 'एकूण महिने (Edit करा)'
                        : language === 'EN' ? 'Total Weeks (Editable)' : 'एकूण आठवडे (Edit करा)'}
                    </label>
                    <span className="text-[10px] text-emerald-800 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60">
                      {language === 'EN' ? 'Auto-calculates dates' : 'तारीख आपोआप बदलते'}
                    </span>
                  </div>
                  <input
                    type="number"
                    required
                    min={1}
                    max={200}
                    value={newInstallments || ''}
                    onChange={(e) => handleNewInstallmentsChange(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-4 py-2 rounded-xl border border-slate-300 text-sm font-black text-brand-900 bg-white focus:ring-2 focus:ring-[#0F7A5C]"
                  />
                  <div className="text-[11px] font-bold text-emerald-800 mt-1 flex items-center space-x-1">
                    <span>💡</span>
                    <span>
                      {newModality === 'M'
                        ? (language === 'EN' ? 'Changing months updates end date automatically, and vice-versa.' : 'महिने बदलल्यास शेवटची तारीख आपोआप बदलते, तसेच तारीख बदलल्यास महिने बदलतात.')
                        : (language === 'EN' ? 'Changing weeks updates end date automatically, and vice-versa.' : 'आठवडे बदलल्यास शेवटची तारीख आपोआप बदलते, तसेच तारीख बदलल्यास आठवडे बदलतात.')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-3.5 sm:px-6 sm:py-3.5 bg-slate-50 border-t border-slate-100 flex justify-end space-x-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-white min-h-[44px] flex items-center justify-center cursor-pointer shadow-2xs"
                >
                  {language === 'EN' ? 'Cancel' : 'रद्द करा'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-emerald-700 text-white text-xs font-extrabold shadow-md hover:bg-emerald-800 min-h-[44px] flex items-center justify-center cursor-pointer"
                >
                  {language === 'EN' ? 'Save Scheme' : 'योजना जतन करा'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </ModalPortal>
      )}

      {/* Delete Scheme Confirmation Modal */}
      <ConfirmModal
        isOpen={!!schemeToDelete}
        title={language === 'EN' ? 'Delete Bishi Scheme' : 'भिशी योजना हटवा'}
        message={confirmDeleteMessage}
        confirmText={language === 'EN' ? 'Delete Scheme' : 'योजना हटवा'}
        cancelText={language === 'EN' ? 'Cancel' : 'रद्द करा'}
        isDanger={true}
        onConfirm={() => {
          if (schemeToDelete) {
            handleDeleteScheme(schemeToDelete);
          }
        }}
        onCancel={() => setSchemeToDelete(null)}
      />
    </div>
  );
};
