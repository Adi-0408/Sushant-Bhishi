import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { Plus, UserPlus, Wallet, Calendar, Landmark, X } from 'lucide-react';
import { CustomerFormModal } from '../../pages/Customers/CustomerFormModal';
import { QuickCollectionModal } from '../collections/QuickCollectionModal';
import { ModalPortal } from './ModalPortal';

interface QuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QuickAddModal: React.FC<QuickAddModalProps> = ({ isOpen, onClose }) => {
  const { refreshData, language } = useApp();
  const navigate = useNavigate();

  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);

  if (!isOpen) return null;

  return (
    <>
      <ModalPortal>
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs no-print overflow-hidden">
          <div className="bg-white rounded-3xl max-w-sm w-full max-h-[90vh] flex flex-col p-5 sm:p-6 shadow-2xl animate-in fade-in zoom-in duration-150 my-auto overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4 shrink-0">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-black">
                <Plus className="w-5 h-5" />
              </div>
              <h3 className="text-base font-extrabold text-slate-900">
                {language === 'EN' ? 'Quick Add Menu' : 'नवीन जोडा (Quick Add)'}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3 overflow-y-auto flex-1 pr-0.5">
            {/* 1. Add Customer */}
            <button
              onClick={() => {
                onClose();
                setIsCustomerModalOpen(true);
              }}
              className="w-full p-3.5 rounded-2xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-950 font-extrabold text-xs flex items-center justify-between transition-all group shadow-2xs"
            >
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-700 text-white flex items-center justify-center shrink-0">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <span className="block text-sm font-black text-slate-900">
                    {language === 'EN' ? 'Add New Customer' : 'नवीन खातेदार जोडा'}
                  </span>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {language === 'EN' ? 'Register account holder & bishi' : 'नवीन खातेदाराची नोंदणी करा'}
                  </span>
                </div>
              </div>
            </button>

            {/* 2. Record Deposit */}
            <button
              onClick={() => {
                onClose();
                setIsDepositModalOpen(true);
              }}
              className="w-full p-3.5 rounded-2xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-950 font-extrabold text-xs flex items-center justify-between transition-all group shadow-2xs"
            >
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                  <Wallet className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <span className="block text-sm font-black text-slate-900">
                    {language === 'EN' ? 'Record Installment Deposit' : 'नवीन हप्ता जमा करा'}
                  </span>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {language === 'EN' ? 'Record daily/weekly payment' : 'खातेदाराची जमा नोंदवा'}
                  </span>
                </div>
              </div>
            </button>

            {/* 3. Add Bishi Scheme */}
            <button
              onClick={() => {
                onClose();
                navigate('/bishi');
              }}
              className="w-full p-3.5 rounded-2xl bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-950 font-extrabold text-xs flex items-center justify-between transition-all group shadow-2xs"
            >
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0">
                  <Calendar className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <span className="block text-sm font-black text-slate-900">
                    {language === 'EN' ? 'Add Bishi Scheme' : 'नवीन भिशी योजना जोडा'}
                  </span>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {language === 'EN' ? 'Create new bishi scheme' : 'नवीन भिशी योजना तयार करा'}
                  </span>
                </div>
              </div>
            </button>

            {/* 4. Add Loan */}
            <button
              onClick={() => {
                onClose();
                navigate('/loans');
              }}
              className="w-full p-3.5 rounded-2xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-950 font-extrabold text-xs flex items-center justify-between transition-all group shadow-2xs"
            >
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0">
                  <Landmark className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <span className="block text-sm font-black text-slate-900">
                    {language === 'EN' ? 'Add New Loan' : 'नवीन कर्ज जोडा'}
                  </span>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {language === 'EN' ? 'Disburse loan & interest' : 'नवीन कर्ज वाटप नोंदवा'}
                  </span>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
      </ModalPortal>

      {/* Embedded Modals */}
      <CustomerFormModal
        isOpen={isCustomerModalOpen}
        editingCustomer={null}
        onClose={() => setIsCustomerModalOpen(false)}
        onSuccess={refreshData}
      />

      <QuickCollectionModal
        isOpen={isDepositModalOpen}
        onClose={() => setIsDepositModalOpen(false)}
      />
    </>
  );
};
