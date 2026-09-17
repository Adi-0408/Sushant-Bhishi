import React from 'react';
import { useApp } from '../../context/AppContext';

export const WelcomeBanner: React.FC = () => {
  const { t, language } = useApp();

  return (
    <>
      {/* Mobile View (< md) - Sleek, Uncluttered, Single Cohesive Card */}
      <div className="md:hidden w-full bg-gradient-to-br from-[#0B5C45] via-[#0F7A5C] to-[#10241E] text-white p-3.5 sm:p-4 rounded-2xl shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-xl pointer-events-none" />

        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-[#2F9E6E] flex items-center justify-center font-black text-lg text-white shadow-inner border border-white/20 shrink-0">
              {language === 'EN' ? 'S' : 'सु'}
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-1.5">
                <h1 className="text-base font-black tracking-tight text-white leading-tight truncate">
                  {t.appName}
                </h1>
                <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-white/15 text-amber-300 border border-white/10 shrink-0">
                  {language === 'EN' ? 'Bishi' : 'भिशी'}
                </span>
              </div>
              <p className="text-[11px] font-bold text-emerald-100/90 truncate mt-0.5">
                {language === 'EN' ? 'Financial Discipline & Trust' : 'आर्थिक शिस्त आणि विश्वास'}
              </p>
            </div>
          </div>

          {/* Compact Growth Badge */}
          <div className="shrink-0 bg-white/10 backdrop-blur-xs px-2.5 py-1.5 rounded-xl border border-white/15 text-right flex items-center space-x-2">
            <div className="flex items-end space-x-1">
              <div className="w-1.5 h-3 bg-[#C89A2E] rounded-t-xs" />
              <div className="w-1.5 h-4 bg-[#2F9E6E] rounded-t-xs" />
              <div className="w-1.5 h-5 bg-white rounded-t-xs" />
            </div>
            <span className="text-[10px] font-black text-amber-300 leading-tight block">
              {language === 'EN' ? 'Prosper' : 'समृद्धी'}
            </span>
          </div>
        </div>

        {/* Subtle tagline row */}
        <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-emerald-100/80 font-semibold relative z-10">
          <span className="italic truncate">
            {language === 'EN' ? '"Drop by drop, savings build your dreams"' : '"थेंबा-थेंबाने साठवण, स्वप्नांची होते पूर्तता"'}
          </span>
        </div>
      </div>

      {/* Desktop & Tablet View (>= md) - 100% Identical Original Layout */}
      <div className="hidden md:flex w-full bg-white rounded-3xl border border-[#E4EAE7] shadow-xs overflow-hidden items-center justify-between p-5 sm:p-6 gap-5 relative">
        {/* Left Monogram & Brand Card */}
        <div className="flex items-center space-x-4 bg-gradient-to-br from-[#0B5C45] to-[#0F7A5C] text-white p-4 sm:p-4.5 rounded-2xl shadow-sm shrink-0 w-full sm:w-auto">
          <div className="w-12 h-12 rounded-full bg-[#2F9E6E] flex items-center justify-center font-black text-xl text-white shadow-inner border border-white/20 shrink-0">
            {language === 'EN' ? 'S' : 'सु'}
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight leading-none text-white">{t.appName}</h1>
            <p className="text-xs font-bold text-white tracking-wide mt-1">
              {language === 'EN' ? 'Management System' : 'व्यवस्थापन प्रणाली'}
            </p>
          </div>
        </div>

        {/* Middle Greetings & Shayari */}
        <div className="flex-1 text-center md:text-left space-y-1">
          <h2 className="text-lg sm:text-xl font-black text-[#10241E] tracking-tight">
            {language === 'EN' ? 'Welcome to Dashboard!' : 'आपले हार्दिक स्वागत आहे!'}
          </h2>
          <p className="text-xs sm:text-sm text-[#5F6E68] font-bold">
            {language === 'EN'
              ? 'Financial discipline, trust, and shared prosperity.'
              : 'आर्थिक शिस्त, विश्वास आणि प्रगतीची साथ.'}
          </p>
          <p className="text-xs sm:text-sm font-bold italic text-[#0F7A5C]">
            {language === 'EN'
              ? '"Drop by drop, savings build your dreams"'
              : '"थेंबा-थेंबाने साठवण, स्वप्नांची होते पूर्तता"'}
          </p>
        </div>

        {/* Right Growth Graphic & Motto */}
        <div className="flex items-center space-x-4 shrink-0 bg-[#F4F8F6] p-3.5 sm:p-4 rounded-2xl border border-[#E4EAE7] w-full md:w-auto justify-between md:justify-start">
          {/* Growth Bars Graphic */}
          <div className="flex items-end space-x-2">
            <div className="w-6 sm:w-7 h-7 bg-[#C89A2E] rounded-t-md shadow-xs flex items-center justify-center text-white font-extrabold text-[10px]">₹</div>
            <div className="w-6 sm:w-7 h-11 bg-[#2F9E6E] rounded-t-md shadow-xs"></div>
            <div className="w-6 sm:w-7 h-16 bg-[#0B5C45] rounded-t-md shadow-xs"></div>
            <div className="w-6 sm:w-7 h-12 bg-[#5B5FC7] rounded-t-md shadow-xs"></div>
          </div>

          <div className="text-right">
            <span className="font-black text-[#10241E] text-xs sm:text-sm italic block leading-tight">
              {language === 'EN' ? <>Together We <br />Prosper..</> : <>एकत्र येऊ, <br />समृद्ध होऊ..</>}
            </span>
            <div className="w-14 h-1 bg-[#0B5C45] rounded-full mt-1.5 ml-auto"></div>
          </div>
        </div>
      </div>
    </>
  );
};
