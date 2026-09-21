import { Customer, BishiConfig, BishiType, Modality, OfficeId } from '../types';
import { Language } from './translations';

export const generateNextAccountNumber = (
  bishiType: BishiType,
  customers: Customer[],
  bishiConfigs: BishiConfig[] = []
): string => {
  let startNum = 1;
  let endNum = 300;

  if (bishiType === '15_AUGUST') {
    startNum = 1;
    endNum = 300;
  } else if (bishiType === '26_JANUARY') {
    startNum = 301;
    endNum = 600;
  } else if (bishiType === 'DASARA') {
    startNum = 601;
    endNum = 900;
  } else if (bishiType === 'LOAN_ONLY') {
    startNum = 9001;
    endNum = 9999;
  } else {
    const idx = bishiConfigs.findIndex((c) => c.id === bishiType);
    if (idx >= 0) {
      startNum = idx * 300 + 1;
      endNum = (idx + 1) * 300;
    } else {
      startNum = 901;
      endNum = 1200;
    }
  }

  const existingNums = customers
    .map((c) => parseInt(c.accountNumber.replace(/\D/g, ''), 10))
    .filter((n) => !isNaN(n) && n >= startNum && n <= endNum);

  if (existingNums.length === 0) {
    return String(startNum);
  }

  const maxNum = Math.max(...existingNums);
  const nextNum = maxNum + 1;

  if (nextNum > endNum) {
    const usedSet = new Set(existingNums);
    let gap = startNum;
    while (usedSet.has(gap)) {
      gap++;
    }
    return String(gap);
  }

  return String(nextNum);
};

export const formatCurrency = (amount: number, lang: Language = 'MR'): string => {
  const safeAmount = isNaN(amount) ? 0 : amount;
  return new Intl.NumberFormat(lang === 'EN' ? 'en-IN' : 'mr-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(safeAmount);
};

export const formatDateMarathi = (dateString?: string, lang: Language = 'MR'): string => {
  if (!dateString) return '-';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return new Intl.DateTimeFormat(lang === 'EN' ? 'en-US' : 'mr-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date);
  } catch {
    return dateString;
  }
};

export const getBishiNameMarathi = (type: BishiType, lang: Language = 'MR'): string => {
  if (lang === 'EN') {
    switch (type) {
      case '15_AUGUST':
        return '15 August Bishi';
      case '26_JANUARY':
        return '26 January Bishi';
      case 'DASARA':
        return 'Dasara Bishi';
      case 'LOAN_ONLY':
        return 'Loan Only Customer';
      default:
        return type;
    }
  }
  switch (type) {
    case '15_AUGUST':
      return '१५ ऑगस्ट भिशी';
    case '26_JANUARY':
      return '२६ जानेवारी भिशी';
    case 'DASARA':
      return 'दसरा भिशी';
    case 'LOAN_ONLY':
      return 'फक्त कर्ज खातेदार (Loan Only)';
    default:
      return type;
  }
};

export const getModalityLabel = (modality: Modality, lang: Language = 'MR'): string => {
  if (lang === 'EN') {
    return modality === 'W' ? 'W – Weekly' : 'M – Monthly';
  }
  return modality === 'W' ? 'W – साप्ताहिक' : 'M – मासिक';
};

export const getModalityShort = (modality: Modality, lang: Language = 'MR'): string => {
  if (lang === 'EN') {
    return modality === 'W' ? 'Weekly' : 'Monthly';
  }
  return modality === 'W' ? 'साप्ताहिक' : 'मासिक';
};

export const getOfficeNameMarathi = (officeId: OfficeId, lang: Language = 'MR'): string => {
  if (lang === 'EN') {
    if (officeId === 'ALL') return 'All Offices';
    return officeId === 'MAIN' ? 'Main Office' : 'Home Office';
  }
  if (officeId === 'ALL') return 'सर्व कार्यालये';
  return officeId === 'MAIN' ? 'मुख्य कार्यालय' : 'गृह कार्यालय';
};

export const getStatusBadgeClass = (status: string): string => {
  switch (status) {
    case 'PAID':
    case 'पूर्ण जमा':
    case 'जमा':
    case 'COMPLETED':
    case 'पूर्ण':
      return 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold';
    case 'ACTIVE':
    case 'सुरू':
      return 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold';
    case 'PARTIAL':
    case 'अपूर्ण':
      return 'bg-amber-100 text-amber-800 border border-amber-300 font-semibold';
    case 'PENDING':
    case 'बाकी':
    case 'प्रलंबित':
      return 'bg-rose-100 text-rose-800 border border-rose-300 font-semibold';
    case 'CLOSED':
    case 'बंद':
      return 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold';
    default:
      return 'bg-slate-100 text-slate-800';
  }
};

export const getStatusTextMarathi = (status: string, lang: Language = 'MR'): string => {
  if (lang === 'EN') {
    switch (status) {
      case 'PAID':
        return 'Paid';
      case 'PARTIAL':
        return 'Partial';
      case 'PENDING':
        return 'Pending';
      case 'ACTIVE':
        return 'Active';
      case 'CLOSED':
      case 'COMPLETED':
        return 'Completed';
      default:
        return status;
    }
  }
  switch (status) {
    case 'PAID':
      return 'जमा';
    case 'PARTIAL':
      return 'अपूर्ण';
    case 'PENDING':
      return 'बाकी';
    case 'ACTIVE':
      return 'सुरू';
    case 'CLOSED':
    case 'COMPLETED':
      return 'पूर्ण (Completed)';
    default:
      return status;
  }
};

// Converts Devanagari numerals to English digits
export const toEnglishDigits = (str: string): string => {
  const marathiDigits = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
  let res = str;
  for (let i = 0; i < 10; i++) {
    res = res.split(marathiDigits[i]).join(String(i));
  }
  return res;
};

// Converts English digits to Devanagari numerals
export const toMarathiDigits = (str: string): string => {
  const marathiDigits = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
  let res = str;
  for (let i = 0; i < 10; i++) {
    res = res.split(String(i)).join(marathiDigits[i]);
  }
  return res;
};

// Universal matching for customer search (Account Number, Name, Mobile)
export const matchesCustomerSearch = (
  customer: {
    name?: string;
    customerName?: string;
    accountNumber?: string | number;
    accountNo?: string | number;
    accNo?: string | number;
    mobile?: string;
  } | null | undefined,
  searchQuery: string,
  extraAccountNumber?: string | number
): boolean => {
  if (!customer) return false;
  const rawQ = (searchQuery || '').trim();
  if (!rawQ) return true;

  const qLower = rawQ.toLowerCase();
  const qEnglishDigits = toEnglishDigits(qLower);
  const qNumericOnly = qEnglishDigits.replace(/\D/g, '');

  const name = String(customer.name || customer.customerName || '').toLowerCase();
  const mobile = String(customer.mobile || '').replace(/\D/g, '');

  const accRaw = String(
    customer.accountNumber ||
    customer.accountNo ||
    customer.accNo ||
    extraAccountNumber ||
    ''
  ).trim();
  const accExtra = extraAccountNumber ? String(extraAccountNumber).trim() : '';

  const accLower = accRaw.toLowerCase();
  const accNumeric = toEnglishDigits(accRaw).replace(/\D/g, '');
  const accExtraNumeric = toEnglishDigits(accExtra).replace(/\D/g, '');

  // 1. Match on Account Number:
  // Direct match or substring match (English or Marathi)
  if (accRaw && (accLower.includes(qLower) || accLower.includes(qEnglishDigits))) {
    return true;
  }
  if (accExtra && (accExtra.toLowerCase().includes(qLower) || accExtra.toLowerCase().includes(qEnglishDigits))) {
    return true;
  }

  // Match Marathi numerals directly
  const qMarathi = toMarathiDigits(rawQ);
  if (accRaw && (accRaw.includes(qMarathi) || toMarathiDigits(accRaw).includes(qMarathi))) {
    return true;
  }

  // Numeric comparison (e.g. user types "101", "#101", "0101", "acc 101", "खाते १०१")
  if (qNumericOnly) {
    // Exact or prefix match on account number
    if (accNumeric && (accNumeric === qNumericOnly || accNumeric.startsWith(qNumericOnly) || accNumeric.includes(qNumericOnly))) {
      return true;
    }
    if (accExtraNumeric && (accExtraNumeric === qNumericOnly || accExtraNumeric.startsWith(qNumericOnly) || accExtraNumeric.includes(qNumericOnly))) {
      return true;
    }
    // Parse as integer so "01" matches "1"
    const parsedQ = parseInt(qNumericOnly, 10);
    const parsedAcc = parseInt(accNumeric, 10);
    if (!isNaN(parsedQ) && !isNaN(parsedAcc) && parsedQ === parsedAcc) {
      return true;
    }
    const parsedExtra = parseInt(accExtraNumeric, 10);
    if (!isNaN(parsedQ) && !isNaN(parsedExtra) && parsedQ === parsedExtra) {
      return true;
    }
  }

  // 2. Match on Name:
  if (name && (name.includes(qLower) || name.includes(qEnglishDigits))) {
    return true;
  }

  // 3. Match on Mobile:
  // Only match mobile if user typed at least 3 digits or if mobile starts with query
  if (mobile) {
    if (qNumericOnly) {
      if (mobile.startsWith(qNumericOnly)) {
        return true;
      }
      if (qNumericOnly.length >= 3 && mobile.includes(qNumericOnly)) {
        return true;
      }
    } else if (qLower.length >= 3 && mobile.includes(qLower)) {
      return true;
    }
  }

  return false;
};

