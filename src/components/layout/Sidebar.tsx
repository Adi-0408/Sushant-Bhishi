import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Home,
  Users,
  Wallet,
  Calendar,
  Landmark,
  TrendingUp,
  AlertTriangle,
  BarChart3,
  MessageSquare,
  HardDrive,
  UserCheck,
  Settings,
  LogOut,
  Plus,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { QuickAddModal } from '../common/QuickAddModal';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onLogoutClick: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, onLogoutClick }) => {
  const { currentAdmin } = useAuth();
  const { t, language } = useApp();
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);

  const menuItems = [
    { label: t.navDashboard, icon: Home, path: '/dashboard' },
    { label: t.navCustomers, icon: Users, path: '/customers' },
    { label: t.navCollections, icon: Wallet, path: '/collections' },
    { label: t.navBishi, icon: Calendar, path: '/bishi' },
    { label: t.navLoans, icon: Landmark, path: '/loans' },
    { label: t.navInterest, icon: TrendingUp, path: '/interest' },
    { label: t.navPenalty, icon: AlertTriangle, path: '/penalty' },
    { label: t.navReports, icon: BarChart3, path: '/reports' },
    { label: t.navSms, icon: MessageSquare, path: '/sms' },
    { label: t.navBackup, icon: HardDrive, path: '/backup' },
    { label: t.navProfile, icon: UserCheck, path: '/profile' },
    { label: t.navSettings, icon: Settings, path: '/settings' },
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden no-print backdrop-blur-xs"
          onClick={onClose}
        />
      )}

      {/* Dark Forest Green Sidebar (#0B5C45) per design tokens */}
      <aside
        className={`fixed top-0 left-0 bottom-0 w-64 bg-[#0B5C45] text-white z-40 transition-transform duration-300 ease-in-out flex flex-col no-print ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Header Branding - Official Brand Emblem */}
        <div className="h-16 lg:h-18 px-5 flex items-center justify-between border-b border-white/10 shrink-0">
          <div className="flex items-center space-x-3 group cursor-pointer">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#0F4A3C] border border-[#2F9E6E] p-1 flex items-center justify-center shadow-sm flex-shrink-0 group-hover:scale-105 group-hover:border-emerald-400 transition-all duration-200">
              <svg viewBox="0 0 160 160" className="w-full h-full">
                <circle cx="80" cy="80" r="80" fill="#0f4a3c"/>
                <circle cx="80" cy="80" r="66" fill="none" stroke="#2f9e6e" strokeWidth="4"/>
                <rect x="45" y="55" width="9" height="45" fill="#ffffff"/>
                <rect x="61" y="55" width="9" height="45" fill="#ffffff"/>
                <rect x="77" y="55" width="9" height="45" fill="#ffffff"/>
                <rect x="93" y="55" width="9" height="45" fill="#ffffff"/>
                <rect x="109" y="55" width="9" height="45" fill="#ffffff"/>
                <polygon points="80,30 115,50 45,50" fill="#ffffff"/>
                <rect x="42" y="103" width="76" height="8" fill="#ffffff"/>
              </svg>
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-extrabold text-[#ffffff] !text-white tracking-tight leading-tight group-hover:text-emerald-200 transition-colors">
                {t.appName}
              </h1>
              <span className="text-[9px] tracking-widest text-[#2F9E6E] font-bold block uppercase">
                {t.trustSecurity}
              </span>
            </div>
          </div>

          {/* Mobile Drawer Close Button (< 1024px) */}
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors lg:hidden cursor-pointer touch-target"
            aria-label={language === 'EN' ? 'Close menu' : 'मेनू बंद करा'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Menu (Single Scrollbar Guarantee, no-scrollbar hides internal thumb) */}
        <nav className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 space-y-0.5 sm:space-y-1 overflow-y-auto no-scrollbar">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={({ isActive }) =>
                  `group flex items-center space-x-3 px-3.5 py-2 min-h-[44px] lg:min-h-[38px] rounded-[10px] text-sm font-bold transition-all duration-200 ease-out ${
                    isActive
                      ? 'bg-white/18 text-white font-extrabold shadow-sm border-l-4 border-[#2F9E6E] pl-2.5'
                      : 'text-white/75 hover:bg-white/12 hover:text-white hover:translate-x-1.5 hover:shadow-xs'
                  }`
                }
              >
                <Icon className="w-5 h-5 flex-shrink-0 transition-transform duration-200 group-hover:scale-110 group-hover:text-emerald-300" />
                <span className="transition-colors duration-200">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Logout Button */}
        <div className="p-3 sm:p-4 border-t border-white/10 shrink-0">
          <button
            onClick={() => {
              onClose();
              onLogoutClick();
            }}
            className="group w-full flex items-center space-x-3 px-3.5 py-2 min-h-[44px] lg:min-h-[38px] rounded-[10px] text-sm font-bold text-rose-300 hover:bg-rose-900/40 hover:text-white hover:translate-x-1.5 transition-all duration-200 ease-out cursor-pointer"
          >
            <LogOut className="w-5 h-5 flex-shrink-0 text-rose-300 group-hover:text-rose-200 group-hover:scale-110 group-hover:-rotate-6 transition-transform duration-200" />
            <span>{t.navLogout}</span>
          </button>
        </div>
      </aside>
    </>
  );
};
