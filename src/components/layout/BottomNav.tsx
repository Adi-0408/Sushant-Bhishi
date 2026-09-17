import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Users, Wallet, Landmark, Menu, Plus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { QuickAddModal } from '../common/QuickAddModal';

interface BottomNavProps {
  onMenuToggle: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ onMenuToggle }) => {
  const { t, language } = useApp();
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#E4EAE7] shadow-lg z-30 lg:hidden no-print pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around h-16 px-1 max-w-lg mx-auto relative">
          {/* Home */}
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              `group flex flex-col items-center justify-center flex-1 h-full min-h-[44px] py-1 text-[10px] font-extrabold transition-all active:scale-95 touch-target ${
                isActive ? 'text-[#0F7A5C]' : 'text-slate-500 hover:text-[#0F7A5C]'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div
                  className={`p-1 rounded-xl transition-all duration-200 group-hover:scale-110 ${
                    isActive ? 'bg-[#0F7A5C]/10 text-[#0F7A5C]' : 'text-slate-500 group-hover:bg-[#0F7A5C]/10 group-hover:text-[#0F7A5C]'
                  }`}
                >
                  <Home className="w-5 h-5" />
                </div>
                <span className="mt-0.5 tracking-tight group-hover:font-black transition-all">{t.navDashboard}</span>
              </>
            )}
          </NavLink>

          {/* Customers */}
          <NavLink
            to="/customers"
            className={({ isActive }) =>
              `group flex flex-col items-center justify-center flex-1 h-full min-h-[44px] py-1 text-[10px] font-extrabold transition-all active:scale-95 touch-target ${
                isActive ? 'text-[#0F7A5C]' : 'text-slate-500 hover:text-[#0F7A5C]'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div
                  className={`p-1 rounded-xl transition-all duration-200 group-hover:scale-110 ${
                    isActive ? 'bg-[#0F7A5C]/10 text-[#0F7A5C]' : 'text-slate-500 group-hover:bg-[#0F7A5C]/10 group-hover:text-[#0F7A5C]'
                  }`}
                >
                  <Users className="w-5 h-5" />
                </div>
                <span className="mt-0.5 tracking-tight group-hover:font-black transition-all">{t.navCustomers}</span>
              </>
            )}
          </NavLink>

          {/* Collections */}
          <NavLink
            to="/collections"
            className={({ isActive }) =>
              `group flex flex-col items-center justify-center flex-1 h-full min-h-[44px] py-1 text-[10px] font-extrabold transition-all active:scale-95 touch-target ${
                isActive ? 'text-[#0F7A5C]' : 'text-slate-500 hover:text-[#0F7A5C]'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div
                  className={`p-1 rounded-xl transition-all duration-200 group-hover:scale-110 ${
                    isActive ? 'bg-[#0F7A5C]/10 text-[#0F7A5C]' : 'text-slate-500 group-hover:bg-[#0F7A5C]/10 group-hover:text-[#0F7A5C]'
                  }`}
                >
                  <Wallet className="w-5 h-5" />
                </div>
                <span className="mt-0.5 tracking-tight group-hover:font-black transition-all">{t.navCollections}</span>
              </>
            )}
          </NavLink>

          {/* Menu Drawer Toggle Button */}
          <button
            onClick={onMenuToggle}
            className="group flex flex-col items-center justify-center flex-1 h-full min-h-[44px] py-1 text-[10px] font-extrabold text-slate-500 hover:text-[#0F7A5C] transition-all active:scale-95 cursor-pointer touch-target"
          >
            <div className="p-1 rounded-xl text-slate-500 group-hover:scale-110 group-hover:bg-[#0F7A5C]/10 group-hover:text-[#0F7A5C] transition-all duration-200">
              <Menu className="w-5 h-5" />
            </div>
            <span className="mt-0.5 tracking-tight group-hover:font-black transition-all">{language === 'EN' ? 'Menu' : 'मेनू'}</span>
          </button>
        </div>
      </nav>
    </>
  );
};
