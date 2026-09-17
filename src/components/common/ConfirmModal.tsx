import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { ModalPortal } from './ModalPortal';

interface ConfirmModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title = 'पुष्टी करा',
  message,
  confirmText = 'हटवा',
  cancelText = 'रद्द करा',
  isDanger = true,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs no-print overflow-hidden">
        <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] flex flex-col p-6 shadow-2xl animate-in fade-in zoom-in duration-150 my-auto overflow-hidden">
        <div className="flex items-center space-x-3 text-amber-600 mb-4 shrink-0">
          <div className={`p-2.5 rounded-full ${isDanger ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'}`}>
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        </div>

        <p className="text-sm text-slate-600 font-medium leading-relaxed mb-6 overflow-y-auto flex-1">
          {message}
        </p>

        <div className="flex items-center justify-end space-x-3 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-bold hover:bg-slate-50 transition-colors"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-5 py-2.5 rounded-xl text-white text-sm font-bold shadow-md transition-all ${
              isDanger
                ? 'bg-rose-600 hover:bg-rose-700 focus:ring-2 focus:ring-rose-500'
                : 'bg-brand-600 hover:bg-brand-700 focus:ring-2 focus:ring-brand-500'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
};
