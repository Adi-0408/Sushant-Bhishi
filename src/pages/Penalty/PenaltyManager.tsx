import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { StorageService } from '../../services/db';
import { formatCurrency } from '../../utils/formatters';
import { AlertTriangle, Save, Clock, RefreshCw } from 'lucide-react';

export const PenaltyManager: React.FC = () => {
  const { penaltySettings, refreshData, showToast, language, isRefreshing, refreshAllData } = useApp();

  const [weeklyPenalty, setWeeklyPenalty] = useState<number | ''>(
    penaltySettings?.weeklyPenalty || 50
  );
  const [monthlyPenalty, setMonthlyPenalty] = useState<number | ''>(
    penaltySettings?.monthlyPenalty || 200
  );
  const [graceDays, setGraceDays] = useState<number | ''>(penaltySettings?.graceDays || 2);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    const updated = {
      id: 'default',
      weeklyPenalty: Number(weeklyPenalty) || 0,
      monthlyPenalty: Number(monthlyPenalty) || 0,
      graceDays: Number(graceDays) || 0,
    };

    StorageService.savePenaltySettings(updated);
    showToast(
      language === 'EN' ? 'Penalty settings saved successfully.' : 'दंडाचे नियम यशस्वीपणे जतन झाले.',
      'success'
    );
    refreshData();
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center space-x-2">
            <AlertTriangle className="w-6 h-6 text-rose-600" />
            <span>{language === 'EN' ? 'Penalty Management' : 'दंड व्यवस्थापन'}</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-1">
            {language === 'EN'
              ? 'Late penalty amounts and grace period rules'
              : 'विलंब दंडाची रक्कम व मुदतीचे नियम'}
          </p>
        </div>

        <button
          onClick={() => refreshAllData()}
          disabled={isRefreshing}
          title={language === 'EN' ? 'Refresh Penalty Settings (0 reads if unchanged)' : 'दंड नियम डेटा रिफ्रेश करा (बदल नसल्यास ० रीड्स)'}
          className="h-10 px-3.5 bg-white hover:bg-emerald-50 text-[#0F7A5C] font-extrabold text-xs rounded-xl border border-[#E4EAE7] shadow-2xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-60 active:scale-95 transition-all self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#0F7A5C] ${isRefreshing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{language === 'EN' ? 'Refresh' : 'रिफ्रेश'}</span>
        </button>
      </div>

      <div className="max-w-xl bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
        <form onSubmit={handleSave} className="space-y-5">
          {/* Grace Days */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {language === 'EN' ? 'Grace Period (Days)' : 'विंलबासाठी मुभेचा कालावधी (दिवस)'} <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Clock className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
              <input
                type="number"
                required
                min={0}
                value={graceDays}
                onChange={(e) => setGraceDays(e.target.value ? Number(e.target.value) : '')}
                placeholder={language === 'EN' ? 'e.g. 2 (Two days)' : 'उदा. 2 (दोन दिवस)'}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm font-bold focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {language === 'EN'
                ? 'Days after the due date before late penalty is applied.'
                : 'देय तारीख संपल्यानंतर किती दिवसांनी दंड लागू करावा.'}
            </p>
          </div>

          {/* Weekly Penalty */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {language === 'EN' ? 'Weekly Penalty Amount (₹)' : 'साप्ताहिक दंडाची रक्कम (₹)'} <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              required
              min={0}
              value={weeklyPenalty}
              onChange={(e) => setWeeklyPenalty(e.target.value ? Number(e.target.value) : '')}
              placeholder={language === 'EN' ? 'e.g. 50' : 'उदा. 50'}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-extrabold text-rose-600 focus:ring-2 focus:ring-rose-500"
            />
          </div>

          {/* Monthly Penalty */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {language === 'EN' ? 'Monthly Penalty Amount (₹)' : 'मासिक दंडाची रक्कम (₹)'} <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              required
              min={0}
              value={monthlyPenalty}
              onChange={(e) => setMonthlyPenalty(e.target.value ? Number(e.target.value) : '')}
              placeholder={language === 'EN' ? 'e.g. 200' : 'उदा. 200'}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-extrabold text-rose-600 focus:ring-2 focus:ring-rose-500"
            />
          </div>

          <div className="pt-3 border-t border-slate-100">
            <button
              type="submit"
              className="w-full min-h-[44px] py-3 rounded-xl bg-slate-900 text-white font-extrabold text-sm hover:bg-slate-800 transition-colors shadow-md flex items-center justify-center space-x-2 cursor-pointer"
            >
              <Save className="w-5 h-5" />
              <span>{language === 'EN' ? 'Save Settings' : 'नियम जतन करा'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
