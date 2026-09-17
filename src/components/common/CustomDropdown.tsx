import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface DropdownOption<T = string> {
  value: T;
  label: string;
  subLabel?: string;
  icon?: React.ReactNode;
  badge?: string;
}

export interface CustomDropdownProps<T = string> {
  value: T;
  onChange: (value: T) => void;
  options: DropdownOption<T>[];
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
  disabled?: boolean;
  prefixIcon?: React.ReactNode;
  prefixLabel?: string;
  size?: 'sm' | 'md' | 'lg';
  align?: 'left' | 'right';
  maxHeight?: string;
}

export function CustomDropdown<T extends string = string>({
  value,
  onChange,
  options,
  placeholder = '-- Select --',
  className = '',
  triggerClassName = '',
  menuClassName = '',
  disabled = false,
  prefixIcon,
  prefixLabel,
  size = 'md',
  align = 'left',
  maxHeight = 'max-h-64',
}: CustomDropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  // Close when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('touchstart', handleOutsideClick);
    }

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const sizeClasses = {
    sm: 'h-8 px-2.5 text-xs rounded-xl',
    md: 'h-10 px-3.5 text-xs sm:text-sm rounded-xl',
    lg: 'h-11 px-4 text-sm rounded-xl',
  }[size];

  return (
    <div ref={containerRef} className={`relative inline-block w-full ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between border transition-all cursor-pointer select-none bg-white text-[#10241E] font-bold shadow-2xs ${
          isOpen
            ? 'border-[#0F7A5C] ring-2 ring-[#0F7A5C]/20'
            : 'border-[#E4EAE7] hover:border-[#0F7A5C]/60'
        } ${disabled ? 'opacity-50 cursor-not-allowed bg-slate-50' : ''} ${sizeClasses} custom-dropdown-trigger ${triggerClassName}`}
      >
        <div className="flex items-center space-x-1.5 min-w-0 pr-2 truncate">
          {prefixIcon && <span className="shrink-0 text-[#0F7A5C]">{prefixIcon}</span>}
          {prefixLabel && <span className="text-xs font-bold text-[#5F6E68] shrink-0 hidden sm:inline">{prefixLabel}</span>}
          <span className="truncate font-extrabold text-[#10241E]">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          {selectedOption?.badge && (
            <span className="ml-1 px-1.5 py-0.5 rounded-md text-[10px] font-black bg-emerald-100 text-emerald-900 shrink-0">
              {selectedOption.badge}
            </span>
          )}
        </div>

        <ChevronDown
          className={`w-4 h-4 text-[#0F7A5C] shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : 'rotate-0'
          }`}
        />
      </button>

      {/* Dropdown Menu Popup */}
      {isOpen && (
        <div
          className={`absolute z-50 mt-1.5 min-w-full bg-white rounded-2xl shadow-xl border border-[#E4EAE7] p-1.5 overflow-hidden animate-in fade-in zoom-in-95 duration-100 ${
            align === 'right' ? 'right-0' : 'left-0'
          } ${menuClassName}`}
        >
          <div className={`${maxHeight} overflow-y-auto space-y-0.5 pr-0.5`}>
            {options.length === 0 ? (
              <div className="py-3 px-4 text-center text-xs text-slate-400 font-bold">
                नोंदी उपलब्ध नाहीत (No options)
              </div>
            ) : (
              options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={String(option.value)}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 sm:py-2.5 min-h-[44px] rounded-xl text-xs sm:text-sm font-bold transition-colors flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-[#e6f4f0] text-[#0B5C45] font-black'
                        : 'text-[#10241E] hover:bg-[#F4F6F5] hover:text-[#0F7A5C]'
                    }`}
                  >
                    <div className="flex items-center space-x-2 min-w-0 pr-2">
                      {option.icon && <span className="shrink-0">{option.icon}</span>}
                      <div className="truncate">
                        <span className="block truncate">{option.label}</span>
                        {option.subLabel && (
                          <span className="block text-[11px] font-semibold text-slate-500 truncate">
                            {option.subLabel}
                          </span>
                        )}
                      </div>
                      {option.badge && (
                        <span className="px-1.5 py-0.5 rounded-md text-[10px] font-black bg-emerald-100 text-emerald-900 shrink-0">
                          {option.badge}
                        </span>
                      )}
                    </div>

                    {isSelected && (
                      <Check className="w-4 h-4 text-[#0F7A5C] shrink-0 ml-2" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
