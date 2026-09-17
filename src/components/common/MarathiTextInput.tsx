import React, { useState, useRef } from 'react';

interface MarathiTextInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  name?: string;
  autoFocus?: boolean;
  rows?: number;
}

export const MarathiTextInput: React.FC<MarathiTextInputProps> = ({
  value,
  onChange,
  placeholder = 'इंग्रजीत टाईप करा (उदा. sushant -> सुशांत)',
  className = '',
  required = false,
  disabled = false,
  id,
  name,
  autoFocus = false,
  rows,
}) => {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  // Transliterate single English word to Marathi options
  const transliterateWord = async (word: string): Promise<string[]> => {
    if (!word || !/^[a-zA-Z]+$/.test(word)) return [];
    try {
      const res = await fetch(
        `https://www.google.com/inputtools/request?text=${encodeURIComponent(
          word
        )}&ime=transliteration_en_mr&num=5&cp=0&cs=1&ie=utf-8&oe=utf-8&app=jsapi`
      );
      const data = await res.json();
      if (data[0] === 'SUCCESS' && data[1]?.[0]?.[1]) {
        return data[1][0][1];
      }
    } catch (e) {
      console.warn('Transliteration failed:', e);
    }
    return [];
  };

  // Transliterate entire string containing English words
  const convertTextToMarathi = async (fullText: string): Promise<string> => {
    const parts = fullText.split(/(\s+)/);
    const converted = await Promise.all(
      parts.map(async (part) => {
        if (/^[a-zA-Z]+$/.test(part)) {
          const choices = await transliterateWord(part);
          return choices.length > 0 ? choices[0] : part;
        }
        return part;
      })
    );
    return converted.join('');
  };

  // Convert on Space or Enter
  const handleKeyDown = async (
    e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    if (e.key === ' ' || e.key === 'Enter') {
      const target = e.currentTarget;
      const cursorPos = target.selectionStart || value.length;
      const textBeforeCursor = value.slice(0, cursorPos);
      const textAfterCursor = value.slice(cursorPos);

      const match = textBeforeCursor.match(/([a-zA-Z]+)$/);
      if (match) {
        const wordToTransliterate = match[1];
        const res = await transliterateWord(wordToTransliterate);
        if (res.length > 0) {
          const marathiWord = res[0];
          const newTextBefore =
            textBeforeCursor.slice(0, textBeforeCursor.length - wordToTransliterate.length) +
            marathiWord +
            (e.key === ' ' ? ' ' : e.key === 'Enter' && !rows ? '' : '');
          const newValue = newTextBefore + textAfterCursor;
          onChange(newValue);
          setSuggestions([]);
          if (e.key === ' ' && !rows) {
            e.preventDefault();
          }
        }
      }
    }
  };

  // Convert remaining English words on Blur
  const handleBlur = async () => {
    if (!value) return;
    if (/[a-zA-Z]/.test(value)) {
      const marathi = await convertTextToMarathi(value);
      onChange(marathi);
    }
    setSuggestions([]);
  };

  // Handle Input Change and fetch live suggestions for word under cursor
  const handleChange = async (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const newValue = e.target.value;
    onChange(newValue);

    const cursorPos = e.target.selectionStart || newValue.length;
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const match = textBeforeCursor.match(/([a-zA-Z]+)$/);
    if (match) {
      const word = match[1];
      const choices = await transliterateWord(word);
      setSuggestions(choices);
    } else {
      setSuggestions([]);
    }
  };

  const applySuggestion = (sug: string) => {
    if (!inputRef.current) return;
    const cursorPos = inputRef.current.selectionStart || value.length;
    const textBeforeCursor = value.slice(0, cursorPos);
    const textAfterCursor = value.slice(cursorPos);

    const match = textBeforeCursor.match(/([a-zA-Z]+)$/);
    if (match) {
      const wordToReplace = match[1];
      const newTextBefore =
        textBeforeCursor.slice(0, textBeforeCursor.length - wordToReplace.length) + sug + ' ';
      onChange(newTextBefore + textAfterCursor);
    }
    setSuggestions([]);
  };

  const isTextArea = typeof rows === 'number' && rows > 0;

  return (
    <div className="relative w-full">
      <div className="relative flex items-start">
        {isTextArea ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            id={id}
            name={name}
            rows={rows}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            placeholder={placeholder}
            required={required}
            disabled={disabled}
            autoFocus={autoFocus}
            className={className}
          />
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            id={id}
            name={name}
            type="text"
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            placeholder={placeholder}
            required={required}
            disabled={disabled}
            autoFocus={autoFocus}
            className={className}
          />
        )}
      </div>

      {/* Transliteration Suggestions Dropdown */}
      {suggestions.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white rounded-2xl shadow-xl border border-[#E4EAE7] p-2 flex flex-wrap gap-1.5 animate-in fade-in">
          {suggestions.map((sug, idx) => (
            <button
              key={idx}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                applySuggestion(sug);
              }}
              className="px-3 py-1.5 text-xs font-black text-[#10241E] bg-[#F4F6F5] hover:bg-[#0F7A5C] hover:text-white rounded-xl transition-all shadow-2xs cursor-pointer"
            >
              <span className="text-[#0F7A5C] group-hover:text-white mr-1 text-[10px]">{idx + 1}.</span> {sug}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
