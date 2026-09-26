import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { StorageService } from '../../services/db';
import { formatDateMarathi } from '../../utils/formatters';
import { TrendingUp, Plus, ShieldAlert, Calendar, Trash2, RefreshCw } from 'lucide-react';
import { MarathiTextInput, convertTextToMarathi } from '../../components/common/MarathiTextInput';

export const InterestManager: React.FC = () => {
  const { interestRates, refreshData, showToast, language, isRefreshing, refreshAllData } = useApp();

  const [rateInput, setRateInput] = useState<number | ''>(10);
  const [rateTypeInput, setRateTypeInput] = useState<'MONTHLY' | 'WEEKLY'>('MONTHLY');
  const [noteInput, setNoteInput] = useState('');

  // Always sort rates newest first
  const sortedRates = [...interestRates].sort((a, b) => {
    const timeA = a.id?.startsWith('ir_') ? Number(a.id.replace('ir_', '')) : 0;
    const timeB = b.id?.startsWith('ir_') ? Number(b.id.replace('ir_', '')) : 0;
    if (timeA && timeB) return timeB - timeA;
    if (timeA && !timeB) return -1;
    if (!timeA && timeB) return 1;
    return (b.effectiveDate || '').localeCompare(a.effectiveDate || '');
  });

  const activeMonthly = sortedRates.find((r) => (r.rateType || 'MONTHLY') === 'MONTHLY');
  const activeWeekly = sortedRates.find((r) => r.rateType === 'WEEKLY');

  const handleTypeSelect = (type: 'MONTHLY' | 'WEEKLY') => {
    setRateTypeInput(type);
    if (type === 'WEEKLY') {
      setRateInput(activeWeekly ? activeWeekly.rate : 2.5);
    } else {
      setRateInput(activeMonthly ? activeMonthly.rate : 10);
    }
  };

  const handleDeleteRate = (id: string) => {
    if (window.confirm(language === 'EN' ? 'Are you sure you want to delete this rate entry?' : 'तुम्हाला ही व्याजदर नोंद हटवायची आहे का?')) {
      StorageService.deleteInterestRate(id);
      showToast(language === 'EN' ? 'Interest rate deleted.' : 'व्याजदर नोंद हटवली.', 'info');
      refreshData();
    }
  };

  const handleSaveRate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rateInput || Number(rateInput) <= 0) return;

    const finalNote = noteInput.trim()
      ? language === 'MR'
        ? await convertTextToMarathi(noteInput.trim())
        : noteInput.trim()
      : undefined;

    StorageService.addInterestRate(Number(rateInput), rateTypeInput, finalNote);
    showToast(
      language === 'EN'
        ? `New ${rateTypeInput === 'MONTHLY' ? 'Monthly' : 'Weekly'} interest rate applied.`
        : `नवीन ${rateTypeInput === 'MONTHLY' ? 'मासिक' : 'साप्ताहिक'} व्याज दर लागू करण्यात आला.`,
      'success'
    );
    refreshData();
    setNoteInput('');
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center space-x-2">
            <TrendingUp className="w-6 h-6 text-brand-700" />
            <span>{language === 'EN' ? 'Interest Rate Management' : 'व्याज व्यवस्थापन (Interest Management)'}</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-1">
            {language === 'EN' ? 'Set weekly and monthly interest rates & view history' : 'सिस्टीमचे साप्ताहिक व मासिक व्याजदर ठरवा व इतिहास पहा'}
          </p>
        </div>

        <button
          onClick={() => refreshAllData()}
          disabled={isRefreshing}
          title={language === 'EN' ? 'Refresh Interest Rates (0 reads if unchanged)' : 'व्याजदर डेटा रिफ्रेश करा (बदल नसल्यास ० रीड्स)'}
          className="h-10 px-3.5 bg-white hover:bg-emerald-50 text-[#0F7A5C] font-extrabold text-xs rounded-xl border border-[#E4EAE7] shadow-2xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-60 active:scale-95 transition-all self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#0F7A5C] ${isRefreshing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{language === 'EN' ? 'Refresh' : 'रिफ्रेश'}</span>
        </button>
      </div>

      {/* Active Rate Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl flex justify-between items-center">
          <div>
            <span className="text-xs font-bold text-emerald-800 uppercase tracking-wide">
              {language === 'EN' ? 'Active Monthly Rate' : 'सध्याचा मासिक व्याजदर'}
            </span>
            <div className="text-2xl font-black text-emerald-950 mt-0.5">
              {activeMonthly ? `${activeMonthly.rate}%` : '10%'}
              <span className="text-xs font-medium text-emerald-700 ml-1">/ {language === 'EN' ? 'month' : 'महिना'}</span>
            </div>
          </div>
          <span className="px-3 py-1 bg-emerald-600 text-white font-extrabold text-xs rounded-full">
            {language === 'EN' ? 'Monthly' : 'मासिक'}
          </span>
        </div>

        <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl flex justify-between items-center">
          <div>
            <span className="text-xs font-bold text-blue-800 uppercase tracking-wide">
              {language === 'EN' ? 'Active Weekly Rate' : 'सध्याचा साप्ताहिक व्याजदर'}
            </span>
            <div className="text-2xl font-black text-blue-950 mt-0.5">
              {activeWeekly ? `${activeWeekly.rate}%` : '2.5%'}
              <span className="text-xs font-medium text-blue-700 ml-1">/ {language === 'EN' ? 'week' : 'आठवडा'}</span>
            </div>
          </div>
          <span className="px-3 py-1 bg-blue-600 text-white font-extrabold text-xs rounded-full">
            {language === 'EN' ? 'Weekly' : 'साप्ताहिक'}
          </span>
        </div>
      </div>

      {/* Critical Rule Alert */}
      <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200 text-amber-900 text-xs font-semibold flex items-start space-x-3">
        <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-extrabold block text-sm">
            {language === 'EN' ? 'Strict Rule:' : 'कडक नियम (Strict Rule):'}
          </span>
          {language === 'EN'
            ? 'Updating interest rates will not change historical transaction calculations. Historical rates remain locked for past entries.'
            : 'नवीन व्याजदर लागू केल्यावर जुन्या व्यवहारांचा हिशोब कधीही बदलत नाही. जुन्या व्यवहारांना त्या वेळी लागू असलेलाच व्याजदर कायम राहतो.'}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Add New Rate Form */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-base font-extrabold text-slate-900 border-b border-slate-100 pb-3">
            {language === 'EN' ? 'Set New Interest Rate' : 'नवीन व्याज दर ठरवा'}
          </h3>

          <form onSubmit={handleSaveRate} className="space-y-4">
            {/* Rate Type Checkboxes / Radio Options */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">
                {language === 'EN' ? 'Interest Frequency / Type' : 'व्याजदर प्रकार (साप्ताहिक / मासिक)'} <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleTypeSelect('MONTHLY')}
                  className={`min-h-[44px] py-2.5 px-3 rounded-xl border text-xs font-extrabold flex items-center justify-center space-x-2 transition-all cursor-pointer ${
                    rateTypeInput === 'MONTHLY'
                      ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Calendar className="w-4 h-4" />
                  <span>{language === 'EN' ? 'Monthly' : 'मासिक (Monthly)'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleTypeSelect('WEEKLY')}
                  className={`min-h-[44px] py-2.5 px-3 rounded-xl border text-xs font-extrabold flex items-center justify-center space-x-2 transition-all cursor-pointer ${
                    rateTypeInput === 'WEEKLY'
                      ? 'bg-blue-700 text-white border-blue-700 shadow-sm'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Calendar className="w-4 h-4" />
                  <span>{language === 'EN' ? 'Weekly' : 'साप्ताहिक (Weekly)'}</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {language === 'EN' ? 'Interest Rate (%)' : 'व्याज दर (%)'} <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                required
                min={0}
                max={100}
                step="0.1"
                value={rateInput}
                onChange={(e) => setRateInput(e.target.value ? Number(e.target.value) : '')}
                placeholder={rateTypeInput === 'MONTHLY' ? (language === 'EN' ? 'e.g. 10' : 'उदा. 10') : (language === 'EN' ? 'e.g. 2.5' : 'उदा. 2.5')}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-base font-extrabold focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {language === 'EN' ? 'Note / Reason' : 'कारण / टीप (Note)'}
              </label>
              <MarathiTextInput
                value={noteInput}
                onChange={(val) => setNoteInput(val)}
                placeholder={language === 'EN' ? 'e.g. New year special rate' : 'उदा. नवीन वर्षाचा व्याजदर'}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-medium focus:ring-2 focus:ring-brand-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              className="w-full min-h-[44px] py-3 rounded-xl bg-brand-900 text-white font-extrabold text-sm hover:bg-brand-800 transition-colors shadow-md flex items-center justify-center space-x-2 cursor-pointer"
            >
              <Plus className="w-5 h-5" />
              <span>{language === 'EN' ? 'Apply New Rate' : 'नवीन दर लागू करा'}</span>
            </button>
          </form>
        </div>

        {/* Interest Rate History */}
        <div className="md:col-span-2 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex justify-between items-center">
            <h3 className="text-base font-extrabold text-slate-900">
              {language === 'EN' ? 'Interest Rate History' : 'व्याजदर इतिहास'}
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 text-slate-700 font-extrabold border-b border-slate-200">
                <tr>
                  <th className="p-3.5 pl-5">{language === 'EN' ? 'Rate (%)' : 'व्याज दर'}</th>
                  <th className="p-3.5">{language === 'EN' ? 'Frequency' : 'प्रकार'}</th>
                  <th className="p-3.5">{language === 'EN' ? 'Effective Date' : 'लागू तारीख'}</th>
                  <th className="p-3.5">{language === 'EN' ? 'Note' : 'टीप'}</th>
                  <th className="p-3.5 text-center">{language === 'EN' ? 'Status' : 'स्थिती'}</th>
                  <th className="p-3.5 text-center">{language === 'EN' ? 'Action' : 'क्रिया'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {sortedRates.map((item, idx) => {
                  const isMonthly = (item.rateType || 'MONTHLY') === 'MONTHLY';
                  const isFirstOfKind =
                    sortedRates.findIndex((r) => (r.rateType || 'MONTHLY') === (item.rateType || 'MONTHLY')) === idx;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="p-3.5 pl-5 font-black text-brand-900 text-base">
                        {item.rate}%
                      </td>
                      <td className="p-3.5">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold ${
                            isMonthly ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {isMonthly
                            ? language === 'EN' ? 'Monthly' : 'मासिक'
                            : language === 'EN' ? 'Weekly' : 'साप्ताहिक'}
                        </span>
                      </td>
                      <td className="p-3.5 text-slate-700 font-bold">
                        {formatDateMarathi(item.effectiveDate, language)}
                      </td>
                      <td className="p-3.5 text-slate-600">{item.note || '-'}</td>
                      <td className="p-3.5 text-center">
                        {isFirstOfKind ? (
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            {language === 'EN' ? 'Active' : 'सध्या लागू'}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs font-bold">
                            {language === 'EN' ? 'Previous' : 'मागील दर'}
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteRate(item.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer inline-flex items-center justify-center"
                          title={language === 'EN' ? 'Delete' : 'हटवा'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
