import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Users, Wallet, UserCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const BottomNav: React.FC = () => {
  const { t } = useApp();

  const navItems = [
    { label: t.navDashboard, icon: Home, path: '/dashboard' },
    { label: t.navCustomers, icon: Users, path: '/customers' },
    { label: t.navCollections, icon: Wallet, path: '/collections' },
    { label: t.navProfile, icon: UserCheck, path: '/profile' },
  ];

  return (
    <nav
      aria-label="Mobile Bottom Navigation"
      className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#E4EAE7] shadow-[0_-4px_16px_rgba(11,92,69,0.08)] lg:hidden no-print pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid grid-cols-4 h-16 max-w-md mx-auto px-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `group relative flex flex-col items-center justify-center gap-1 py-1.5 px-1 rounded-xl transition-all duration-200 select-none ${
                  isActive
                    ? 'text-[#0B5C45] font-extrabold'
                    : 'text-[#64748B] hover:text-[#0B5C45] font-semibold'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {/* Active top indicator pill */}
                  {isActive && (
                    <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 rounded-b-full bg-[#0B5C45]" />
                  )}
                  <div
                    className={`flex items-center justify-center w-10 h-7 rounded-full transition-all duration-200 ${
                      isActive
                        ? 'bg-[#EAF5F0] text-[#0B5C45] scale-105'
                        : 'group-hover:bg-slate-100'
                    }`}
                  >
                    <Icon
                      className={`w-5 h-5 transition-transform duration-200 ${
                        isActive ? 'stroke-[2.5]' : 'stroke-[2]'
                      }`}
                    />
                  </div>
                  <span className="text-[11px] leading-tight tracking-tight truncate max-w-full px-0.5">
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};
