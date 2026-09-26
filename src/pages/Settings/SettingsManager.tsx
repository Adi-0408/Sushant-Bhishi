import React from 'react';
import { useApp } from '../../context/AppContext';
import { Settings, ShieldCheck, Building2, CheckCircle2, RefreshCw } from 'lucide-react';
import { getOfficeNameMarathi } from '../../utils/formatters';

export const SettingsManager: React.FC = () => {
  const { activeOffice, language, isRefreshing, refreshAllData } = useApp();

  return (
    <div className="space-y-6 pb-12">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center space-x-2">
            <Settings className="w-6 h-6 text-brand-700" />
            <span>{language === 'EN' ? 'Settings' : 'सेटिंग (Settings)'}</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-1">
            {language === 'EN' ? 'System configuration and general information' : 'प्रणाली कॉन्फिगरेशन व सुरक्षा सेटिंग'}
          </p>
        </div>

        <button
          onClick={() => refreshAllData()}
          disabled={isRefreshing}
          title={language === 'EN' ? 'Refresh System Data (0 reads if unchanged)' : 'सिस्टीम डेटा रिफ्रेश करा (बदल नसल्यास ० रीड्स)'}
          className="h-10 px-3.5 bg-white hover:bg-emerald-50 text-[#0F7A5C] font-extrabold text-xs rounded-xl border border-[#E4EAE7] shadow-2xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-60 active:scale-95 transition-all self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#0F7A5C] ${isRefreshing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{language === 'EN' ? 'Refresh' : 'रिफ्रेश'}</span>
        </button>
      </div>

      <div className="max-w-xl bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200">
            <div>
              <span className="text-xs font-bold text-slate-500 block">
                {language === 'EN' ? 'Application Name' : 'वेबसाइटचे नाव'}
              </span>
              <span className="text-base font-black text-brand-900">
                {language === 'EN' ? 'Sushant Bishi' : 'सुषांत भिशी'}
              </span>
            </div>
            <ShieldCheck className="w-6 h-6 text-emerald-600" />
          </div>

          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200">
            <div>
              <span className="text-xs font-bold text-slate-500 block">
                {language === 'EN' ? 'Current Office Selected' : 'सध्याचे निवडलेले कार्यालय'}
              </span>
              <span className="text-sm font-bold text-slate-800">
                {getOfficeNameMarathi(activeOffice, language)}
              </span>
            </div>
            <Building2 className="w-5 h-5 text-brand-700" />
          </div>

          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200">
            <div>
              <span className="text-xs font-bold text-slate-500 block">
                {language === 'EN' ? 'System Version' : 'प्रणाली आवृत्ती (Version)'}
              </span>
              <span className="text-sm font-bold text-slate-800">
                v1.0.0 ({language === 'EN' ? 'Bishi Management System' : 'मराठी भिशी सिस्टीम'})
              </span>
            </div>
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          </div>
        </div>
      </div>
    </div>
  );
};
