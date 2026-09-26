import React, { useState } from 'react';
import { Menu, Calendar as CalendarIcon, User, Landmark, Globe, ChevronDown, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { formatDateMarathi } from '../../utils/formatters';
import { OfficeId } from '../../types';
import { Language } from '../../utils/translations';
import { useNavigate } from 'react-router-dom';
import { QuickAddModal } from '../common/QuickAddModal';
import { CustomDropdown } from '../common/CustomDropdown';

interface HeaderProps {
  onMenuToggle: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onMenuToggle }) => {
  const { currentAdmin, logout } = useAuth();
  const { activeOffice, setActiveOffice, language, setLanguage, t, isRefreshing, refreshAllData } = useApp();
  const navigate = useNavigate();

  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <header className="h-16 sm:h-20 bg-white border-b border-[#E4EAE7] sticky top-0 z-30 px-3 sm:px-8 flex items-center justify-between no-print gap-2 shadow-2xs">
      <div className="flex items-center space-x-2 sm:space-x-4 min-w-0">
        <button
          onClick={onMenuToggle}
          className="p-2 min-w-[44px] min-h-[44px] rounded-xl text-[#10241E] hover:bg-emerald-50 hover:text-[#0F7A5C] hover:scale-105 active:scale-95 transition-all duration-150 lg:hidden flex-shrink-0 cursor-pointer flex items-center justify-center touch-target"
          aria-label={language === 'EN' ? 'Open menu' : 'मेनू उघडा'}
        >
          <Menu className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>

        {/* Welcome Greeting with Accent Green Vertical Bar */}
        <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
          <div className="w-1.5 h-5 sm:h-8 bg-[#0F7A5C] rounded-full flex-shrink-0"></div>
          <div className="min-w-0">
            <h2 className="text-xs sm:text-xl font-black text-[#10241E] tracking-tight truncate">
              <span className="sm:hidden">{currentAdmin?.name || t.appName}</span>
              <span className="hidden sm:inline">{t.welcomeGreeting} {currentAdmin?.name || t.adminDefault}</span>
            </h2>
            <div className="hidden sm:flex items-center space-x-1 text-xs text-[#5F6E68] font-bold">
              <CalendarIcon className="w-3.5 h-3.5 text-[#0F7A5C] flex-shrink-0" />
              <span className="truncate">{formatDateMarathi(todayStr, language)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Controls: Office Selector Pill + Language Selector + Cloud Sync + Profile */}
      <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0">

        {/* Office Selector Pill - Compact on mobile with clean unclipped labels */}
        <div className="w-20 min-[440px]:w-24 sm:w-44">
          <CustomDropdown<OfficeId>
            value={activeOffice}
            onChange={(val) => setActiveOffice(val)}
            options={[
              { value: 'ALL', label: language === 'EN' ? 'All' : 'सर्व' },
              { value: 'MAIN', label: language === 'EN' ? 'Main' : 'मुख्य' },
              { value: 'HOME', label: language === 'EN' ? 'Home' : 'गृह' },
            ]}
            prefixIcon={<Landmark className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#0F7A5C]" />}
            prefixLabel={`${t.officeLabel}:`}
            size="sm"
            triggerClassName="h-9 sm:h-10 bg-white text-xs font-black"
          />
        </div>

        {/* Language Selector Switcher Pill - Compact on mobile screens */}
        <div className="hidden min-[440px]:block w-24 sm:w-36">
          <CustomDropdown<Language>
            value={language}
            onChange={(val) => setLanguage(val)}
            options={[
              { value: 'MR', label: 'मराठी' },
              { value: 'EN', label: 'English' },
            ]}
            prefixIcon={<Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#0F7A5C]" />}
            size="sm"
            triggerClassName="h-9 sm:h-10 bg-[#F4F6F5]"
          />
        </div>

        {/* Universal Delta Refresh Button — Minimal/0-Read Incremental Sync across all sections */}
        <button
          onClick={() => refreshAllData()}
          disabled={isRefreshing}
          title={
            language === 'EN'
              ? 'Refresh data across all sections (minimal / 0 reads if unchanged)'
              : 'सर्व विभागांचा डेटा रिफ्रेश करा (बदल नसल्यास ०-१ रीड)'
          }
          className="h-9 sm:h-10 min-h-[44px] px-2.5 sm:px-3 rounded-xl bg-white hover:bg-emerald-50 text-[#0F7A5C] hover:text-emerald-900 border border-[#E4EAE7] hover:border-[#0F7A5C] shadow-2xs flex items-center justify-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50 active:scale-95 touch-target flex-shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#0F7A5C] ${isRefreshing ? 'animate-spin' : ''}`} />
          <span className="hidden md:inline text-xs font-black">
            {isRefreshing
              ? (language === 'EN' ? 'Refreshing...' : 'रिफ्रेश होत आहे...')
              : (language === 'EN' ? 'Refresh' : 'रिफ्रेश')}
          </span>
        </button>

        {/* User Profile Avatar Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
            className="h-9 sm:h-10 min-h-[44px] min-w-[44px] px-2 sm:px-2.5 rounded-xl bg-white text-[#0F7A5C] flex items-center justify-center space-x-1 border border-[#E4EAE7] shadow-2xs hover:border-[#0F7A5C] hover:bg-slate-50 hover:scale-[1.02] active:scale-[0.98] transition-all flex-shrink-0 cursor-pointer touch-target"
          >
            {currentAdmin?.photoURL ? (
              <img
                src={currentAdmin.photoURL}
                alt={currentAdmin.name}
                className="w-6 h-6 sm:w-7 sm:h-7 rounded-full object-cover"
              />
            ) : (
              <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-emerald-100 flex items-center justify-center text-[#0F7A5C]">
                <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#0F7A5C]" />
              </div>
            )}
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {isProfileMenuOpen && (
            <div className="absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-xl border border-[#E4EAE7] p-2 z-50 animate-in fade-in zoom-in duration-100">
              {/* Language Switcher for compact screens */}
              <div className="min-[440px]:hidden p-2 mb-1 bg-slate-50 rounded-xl border border-[#E4EAE7] flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-600">भाषा:</span>
                <button
                  onClick={() => setLanguage(language === 'MR' ? 'EN' : 'MR')}
                  className="px-2 py-1 rounded-lg bg-emerald-100 text-emerald-900 text-xs font-black"
                >
                  {language === 'MR' ? 'मराठी (Switch EN)' : 'English (मराठी)'}
                </button>
              </div>
              <button
                onClick={() => {
                  setIsProfileMenuOpen(false);
                  navigate('/profile');
                }}
                className="w-full text-left px-4 py-2.5 rounded-xl text-xs font-extrabold text-[#10241E] hover:bg-emerald-50 hover:text-[#0F7A5C] hover:translate-x-1 transition-all cursor-pointer"
              >
                {t.profileMenu}
              </button>
              <button
                onClick={() => {
                  setIsProfileMenuOpen(false);
                  logout();
                }}
                className="w-full text-left px-4 py-2.5 rounded-xl text-xs font-extrabold text-[#C4525B] hover:bg-rose-50 hover:translate-x-1 transition-all cursor-pointer"
              >
                {t.logoutMenu}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
