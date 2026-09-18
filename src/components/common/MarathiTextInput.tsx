import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';

// Comprehensive offline dictionary of common Marathi words, names, bishi schemes, and places
const MARATHI_DICTIONARY: Record<string, string> = {
  // Bishi & Scheme Names
  diwali: 'दिवाळी',
  divali: 'दिवाळी',
  deepavali: 'दीपावली',
  dipawali: 'दिपावली',
  bishi: 'भिशी',
  bhishi: 'भिशी',
  ganesh: 'गणेश',
  ganpati: 'गणपती',
  dasara: 'दसरा',
  dusshera: 'दसरा',
  dussehra: 'दसरा',
  january: 'जानेवारी',
  august: 'ऑगस्ट',
  navratri: 'नवरात्री',
  holi: 'होळी',
  gudi: 'गुढी',
  padwa: 'पाडवा',
  rakhi: 'राखी',
  makar: 'मकर',
  sankranti: 'संक्रांती',
  chhatrapati: 'छत्रपती',
  shivaji: 'शिवाजी',
  maharaj: 'महाराज',
  bhim: 'भीम',
  jayanti: 'जयंती',
  new: 'नवीन',
  navin: 'नवीन',
  yojana: 'योजना',
  weekly: 'साप्ताहिक',
  saptahik: 'साप्ताहिक',
  monthly: 'मासिक',
  masik: 'मासिक',
  loan: 'कर्ज',
  karj: 'कर्ज',
  saving: 'बचत',
  bachat: 'बचत',
  shree: 'श्री',
  shri: 'श्री',
  om: 'ओम',
  jai: 'जय',

  // Common Marathi Names
  sushant: 'सुशांत',
  sachin: 'सचिन',
  rahul: 'राहुल',
  amit: 'अमित',
  santosh: 'संतोष',
  anil: 'अनिल',
  sunil: 'सुनील',
  mahesh: 'महेश',
  rajesh: 'राजेश',
  ajay: 'अजय',
  vijay: 'विजय',
  prakash: 'प्रकाश',
  deepak: 'दीपक',
  dipak: 'दिपक',
  suresh: 'सुरेश',
  ramesh: 'रमेश',
  dinesh: 'दिनेश',
  pramod: 'प्रमोद',
  prashant: 'प्रशांत',
  pravin: 'प्रवीण',
  prabin: 'प्रवीण',
  sandip: 'संदीप',
  sandeep: 'संदीप',
  mangesh: 'मंगेश',
  ram: 'राम',
  shyam: 'श्याम',
  vishnu: 'विष्णू',
  hanumant: 'हनुमंत',
  balaji: 'बालाजी',
  vishwajit: 'विश्वजीत',
  aditya: 'आदित्य',
  omkar: 'ओमकार',
  rohit: 'रोहित',
  akash: 'आकाश',
  suraj: 'सूरज',
  amol: 'अमोल',
  anand: 'आनंद',
  nitin: 'नितीन',
  vikram: 'विक्रम',
  swapnil: 'स्वप्निल',
  atul: 'अतुल',
  kiran: 'किरण',
  chetan: 'चेतन',
  ganeshbishi: 'गणेश भिशी',
  diwalibishi: 'दिवाळी भिशी',
  dasarabishi: 'दसरा भिशी',

  // Common Surnames
  patil: 'पाटील',
  shinde: 'शिंदे',
  pawar: 'पवार',
  jadhav: 'जाधव',
  chavan: 'चव्हाण',
  bhosale: 'भोसले',
  bhosle: 'भोसले',
  kadam: 'कदम',
  more: 'मोरे',
  gaikwad: 'गायकवाड',
  deshmukh: 'देशमुख',
  kulkarni: 'कुलकर्णी',
  mane: 'माने',
  thorat: 'थोरात',
  sawant: 'सावंत',
  salunkhe: 'साळुंखे',
  joshi: 'जोशी',
  sharma: 'शर्मा',
  verma: 'वर्मा',
  kale: 'काळे',
  gore: 'गोरे',
  raut: 'राऊत',
  wagh: 'वाघ',
  ghadge: 'घाडगे',
  mohite: 'मोहिते',
  kamble: 'कांबळे',
  shaikh: 'शेख',
  pathan: 'पठाण',

  // Common Cities / Places
  pune: 'पुणे',
  mumbai: 'मुंबई',
  nagpur: 'नागपूर',
  nashik: 'नाशिक',
  kolhapur: 'कोल्हापूर',
  satara: 'सातारा',
  sangli: 'सांगली',
  solapur: 'सोलापूर',
  aurangabad: 'औरंगाबाद',
  thane: 'ठाणे',
  road: 'रोड',
  galli: 'गल्ली',
  nagar: 'नगर',
  wadi: 'वाडी',
  chowk: 'चौक',
  bazar: 'बाजार',
  peth: 'पेठ',
  main: 'मुख्य',
  home: 'गृह',
  office: 'कार्यालय',
};

// Algorithmic phonetic transliteration fallback
const VOWEL_MAP: Record<string, string> = {
  aa: 'ा',
  ai: 'ै',
  au: 'ौ',
  ee: 'ी',
  oo: 'ू',
  a: '',
  i: 'ि',
  u: 'ु',
  e: 'े',
  o: 'ो',
};

const START_VOWEL_MAP: Record<string, string> = {
  aa: 'आ',
  ai: 'ऐ',
  au: 'औ',
  ee: 'ई',
  oo: 'ऊ',
  a: 'अ',
  i: 'इ',
  u: 'उ',
  e: 'ए',
  o: 'ओ',
};

const CONSONANT_MAP: Record<string, string> = {
  kh: 'ख',
  gh: 'घ',
  ch: 'च',
  chh: 'छ',
  jh: 'झ',
  th: 'थ',
  dh: 'ध',
  ph: 'फ',
  bh: 'भ',
  sh: 'श',
  shh: 'ष',
  k: 'क',
  g: 'ग',
  j: 'ज',
  t: 'त',
  d: 'द',
  n: 'न',
  p: 'प',
  f: 'फ',
  b: 'ब',
  m: 'म',
  y: 'य',
  r: 'र',
  l: 'ल',
  v: 'व',
  w: 'व',
  s: 'स',
  h: 'ह',
};

export const algorithmicTransliterate = (input: string): string => {
  const str = input.toLowerCase();
  let result = '';
  let i = 0;
  let isStart = true;

  while (i < str.length) {
    let matched = false;
    for (const len of [3, 2, 1]) {
      if (i + len <= str.length) {
        const sub = str.substr(i, len);
        if (isStart && START_VOWEL_MAP[sub]) {
          result += START_VOWEL_MAP[sub];
          i += len;
          isStart = false;
          matched = true;
          break;
        } else if (!isStart && VOWEL_MAP[sub] !== undefined) {
          result += VOWEL_MAP[sub];
          i += len;
          matched = true;
          break;
        } else if (CONSONANT_MAP[sub]) {
          result += CONSONANT_MAP[sub];
          i += len;
          isStart = false;
          matched = true;
          for (const vLen of [2, 1]) {
            if (i + vLen <= str.length) {
              const vSub = str.substr(i, vLen);
              if (VOWEL_MAP[vSub] !== undefined) {
                result += VOWEL_MAP[vSub];
                i += vLen;
                break;
              }
            }
          }
          break;
        }
      }
    }
    if (!matched) {
      result += str[i];
      i++;
      isStart = false;
    }
  }
  return result;
};

// In-memory cache for ultra-fast repeated lookups
const transliterationCache = new Map<string, string[]>();

// Fetch Google Input Tools transliteration
const fetchGoogleTransliteration = async (word: string): Promise<string[]> => {
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
  } catch {
    // Network / CORS / offline fallback
  }
  return [];
};

// Transliterate single English word to Marathi options
export const transliterateWord = async (word: string): Promise<string[]> => {
  if (!word || !/^[a-zA-Z]+$/.test(word)) return [];
  const lower = word.toLowerCase();

  // 1. In-memory cache
  if (transliterationCache.has(lower)) {
    return transliterationCache.get(lower)!;
  }

  // 2. High-priority local dictionary
  const dictMatch = MARATHI_DICTIONARY[lower];
  if (dictMatch) {
    const defaultList = [dictMatch];
    transliterationCache.set(lower, defaultList);

    // Asynchronously fetch Google suggestions to enrich list without blocking UI
    fetchGoogleTransliteration(lower).then((apiChoices) => {
      if (apiChoices.length > 0) {
        const merged = Array.from(new Set([dictMatch, ...apiChoices]));
        transliterationCache.set(lower, merged);
      }
    });

    return defaultList;
  }

  // 3. Google API fetch
  const apiChoices = await fetchGoogleTransliteration(lower);
  if (apiChoices.length > 0) {
    transliterationCache.set(lower, apiChoices);
    return apiChoices;
  }

  // 4. Algorithmic Devnagari phonetic fallback
  const fallback = algorithmicTransliterate(lower);
  if (fallback) {
    const fallbackList = [fallback];
    transliterationCache.set(lower, fallbackList);
    return fallbackList;
  }

  return [];
};

// Transliterate entire string containing English words into Marathi
export const convertTextToMarathi = async (fullText: string): Promise<string> => {
  if (!fullText) return '';
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
  forceMarathi?: boolean;
}

export const MarathiTextInput: React.FC<MarathiTextInputProps> = ({
  value,
  onChange,
  placeholder = 'इंग्रजीत टाईप करा (उदा. diwali -> दिवाळी)',
  className = '',
  required = false,
  disabled = false,
  id,
  name,
  autoFocus = false,
  rows,
  forceMarathi = false,
}) => {
  let contextLanguage = 'MR';
  try {
    const ctx = useApp();
    if (ctx && ctx.language) {
      contextLanguage = ctx.language;
    }
  } catch {
    contextLanguage = localStorage.getItem('sushant_bishi_language') || 'MR';
  }

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const isMarathiMode = forceMarathi || contextLanguage === 'MR';

  // Instant full-field manual conversion
  const handleConvertAll = async () => {
    if (!value || !isMarathiMode) return;
    if (/[a-zA-Z]/.test(value)) {
      const converted = await convertTextToMarathi(value);
      onChange(converted);
    }
    setSuggestions([]);
  };

  // Convert previous word on Space, Enter, or Tab
  const handleKeyDown = async (
    e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    if (!isMarathiMode) return;

    if (e.key === ' ' || e.key === 'Enter' || e.key === 'Tab') {
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
            (e.key === ' ' ? ' ' : '');
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

  // Convert remaining English words automatically on Blur
  const handleBlur = async () => {
    if (!value || !isMarathiMode) return;
    if (/[a-zA-Z]/.test(value)) {
      const marathi = await convertTextToMarathi(value);
      onChange(marathi);
    }
    setSuggestions([]);
  };

  // Handle Input Change and fetch live suggestions
  const handleChange = async (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const newValue = e.target.value;
    onChange(newValue);

    if (!isMarathiMode) {
      setSuggestions([]);
      return;
    }

    const cursorPos = e.target.selectionStart || newValue.length;
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const match = textBeforeCursor.match(/([a-zA-Z]+)$/);
    if (match && match[1].length >= 2) {
      const word = match[1];
      const choices = await transliterateWord(word);
      setSuggestions(choices);
    } else {
      setSuggestions([]);
    }
  };

  // Debounced auto-convert: when the user pauses typing for 650ms on a completed word
  useEffect(() => {
    if (!isMarathiMode || !value) return;

    const hasEnglish = /[a-zA-Z]{2,}/.test(value);
    if (!hasEnglish) return;

    const timer = setTimeout(async () => {
      if (inputRef.current && document.activeElement === inputRef.current) {
        const cursorPos = inputRef.current.selectionStart || value.length;
        const textBeforeCursor = value.slice(0, cursorPos);
        const match = textBeforeCursor.match(/([a-zA-Z]+)$/);
        if (match) {
          const choices = await transliterateWord(match[1]);
          if (choices.length > 0) {
            setSuggestions(choices);
          }
        }
      }
    }, 650);

    return () => clearTimeout(timer);
  }, [value, isMarathiMode]);

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
  const hasEnglishText = /[a-zA-Z]/.test(value);

  return (
    <div className="relative w-full">
      <div className="relative flex items-center">
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
            spellCheck={false}
            autoCorrect="off"
            className={`${className} ${hasEnglishText && isMarathiMode ? 'pr-20' : ''}`}
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
            spellCheck={false}
            autoCorrect="off"
            className={`${className} ${hasEnglishText && isMarathiMode ? 'pr-20' : ''}`}
          />
        )}

        {/* Quick Convert Badge / Button when English text is detected in Marathi mode */}
        {isMarathiMode && hasEnglishText && !disabled && (
          <button
            type="button"
            onClick={handleConvertAll}
            title="मराठीत रुपांतर करा (Convert to Marathi)"
            className="absolute right-2 px-2 py-0.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-[#0F7A5C] text-[10px] font-black border border-emerald-300/80 shadow-2xs transition-all cursor-pointer flex items-center space-x-1"
          >
            <span>मराठी ⇄</span>
          </button>
        )}
      </div>

      {/* Transliteration Suggestions Dropdown */}
      {suggestions.length > 0 && isMarathiMode && (
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
