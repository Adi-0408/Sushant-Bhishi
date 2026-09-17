import React, { useState, useEffect } from 'react';
import { Customer, BishiConfig, BishiType, Modality, OfficeId } from '../../types';
import { useApp } from '../../context/AppContext';
import { StorageService } from '../../services/db';
import { generateWeeklyEntries, generateMonthlyEntries } from '../../utils/calculations';
import { generateNextAccountNumber } from '../../utils/formatters';
import { MarathiTextInput } from '../../components/common/MarathiTextInput';
import { CustomDropdown } from '../../components/common/CustomDropdown';
import { ModalPortal } from '../../components/common/ModalPortal';
import { X, UserPlus, Save, AlertCircle, CheckCircle2 } from 'lucide-react';

interface CustomerFormModalProps {
  isOpen: boolean;
  editingCustomer?: Customer | null;
  onClose: () => void;
  onSuccess: (newCustomerId?: string) => void;
  initialLoanOnly?: boolean;
}

export const CustomerFormModal: React.FC<CustomerFormModalProps> = ({
  isOpen,
  editingCustomer,
  onClose,
  onSuccess,
  initialLoanOnly = false,
}) => {
  const { customers, activeOffice, bishiConfigs, interestRates, penaltySettings, showToast, refreshData } = useApp();

  const defaultInterestRate = interestRates[0]?.rate || 10;
  const defaultPenaltyRate = penaltySettings?.weeklyPenalty || 50;

  const [accountNumber, setAccountNumber] = useState('');
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [bishiType, setBishiType] = useState<BishiType>('15_AUGUST');
  const [bishiDate, setBishiDate] = useState(new Date().toISOString().split('T')[0]);
  const [modality, setModality] = useState<Modality>('W');
  const [totalInstallments, setTotalInstallments] = useState<number | ''>(40);
  const [amount, setAmount] = useState<number | ''>(1000);
  const [interestRate, setInterestRate] = useState<number | ''>(defaultInterestRate);
  const [penaltyRate, setPenaltyRate] = useState<number | ''>(defaultPenaltyRate);
  const [officeId, setOfficeId] = useState<OfficeId>(activeOffice);
  const [address, setAddress] = useState('');
  const [photoURL, setPhotoURL] = useState('');

  // Loan fields
  const [hasLoan, setHasLoan] = useState<boolean>(false);
  const [loanPrincipal, setLoanPrincipal] = useState<number | ''>('');
  const [loanInterestRate, setLoanInterestRate] = useState<number | ''>(12);

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successCustomer, setSuccessCustomer] = useState<{
    id: string;
    accountNumber: string;
    name: string;
    mobile: string;
    amount: number;
    modality: Modality;
  } | null>(null);

  const handleBishiTypeChange = (newType: BishiType) => {
    setBishiType(newType);
    if (!editingCustomer) {
      const autoAcc = generateNextAccountNumber(newType, customers, bishiConfigs);
      setAccountNumber(autoAcc);
    }
    if (newType === 'LOAN_ONLY') {
      setAmount(0);
      setHasLoan(true);
    } else if (amount === 0) {
      setAmount(1000);
    }
  };

  useEffect(() => {
    if (editingCustomer) {
      setAccountNumber(editingCustomer.accountNumber);
      setName(editingCustomer.name);
      setMobile(editingCustomer.mobile);
      setBishiType(editingCustomer.bishiType);
      setBishiDate(editingCustomer.bishiDate || new Date().toISOString().split('T')[0]);
      setModality(editingCustomer.modality);
      setTotalInstallments(editingCustomer.totalInstallments || (editingCustomer.modality === 'W' ? 40 : 10));
      setAmount(editingCustomer.amount);
      setInterestRate(editingCustomer.interestRate);
      setPenaltyRate(editingCustomer.penaltyRate);
      setOfficeId(editingCustomer.officeId);
      setAddress(editingCustomer.address || '');
      setPhotoURL(editingCustomer.photoURL || '');
      setHasLoan(editingCustomer.hasLoan);

      if (editingCustomer.hasLoan) {
        const existingLoan = StorageService.getLoanByCustomerId(editingCustomer.id);
        if (existingLoan) {
          setLoanPrincipal(existingLoan.principalAmount);
          setLoanInterestRate(existingLoan.interestRate);
        }
      }
    } else {
      const initType = initialLoanOnly ? 'LOAN_ONLY' : (bishiConfigs.length > 0 ? bishiConfigs[0].id : '15_AUGUST');
      const autoAcc = generateNextAccountNumber(initType, customers, bishiConfigs);
      setAccountNumber(autoAcc);
      setName('');
      setMobile('');
      setBishiType(initType);
      setBishiDate(new Date().toISOString().split('T')[0]);
      setModality('W');
      setTotalInstallments(40);
      setAmount(initialLoanOnly ? 0 : 1000);
      setInterestRate(defaultInterestRate);
      setPenaltyRate(defaultPenaltyRate);
      setOfficeId(activeOffice);
      setAddress('');
      setPhotoURL('');
      setHasLoan(initialLoanOnly ? true : false);
      setLoanPrincipal('');
      setLoanInterestRate(12);
    }
    setError('');
  }, [editingCustomer, isOpen, activeOffice, defaultInterestRate, defaultPenaltyRate, initialLoanOnly, customers, bishiConfigs]);

  if (!isOpen) return null;

  if (successCustomer) {
    return (
      <ModalPortal>
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs no-print overflow-hidden">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl text-center animate-in fade-in zoom-in duration-150 my-auto max-h-[90vh] overflow-y-auto">
            {/* Animated Success Badge */}
            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
              <CheckCircle2 className="w-12 h-12 stroke-[2.5]" />
            </div>

            <h2 className="text-2xl font-black text-slate-900 mb-1">
              खातेदार यशस्वीपणे जोडला गेला!
            </h2>
            <p className="text-xs text-slate-500 font-medium mb-6">
              सुषांत भिशी सिस्टीममध्ये नवीन खातेदाराची नोंद जतन झाली आहे.
            </p>

            {/* Details Summary Card */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-left space-y-2 mb-6">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-medium">खाते क्रमांक:</span>
                <span className="font-extrabold text-slate-900 bg-white px-2.5 py-0.5 rounded-md border border-slate-200">
                  {successCustomer.accountNumber}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-medium">खातेदाराचे नाव:</span>
                <span className="font-bold text-slate-900">{successCustomer.name}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-medium">मोबाईल नंबर:</span>
                <span className="font-bold text-slate-900">{successCustomer.mobile}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-medium">भिशी रक्कम:</span>
                <span className="font-extrabold text-emerald-700">
                  ₹{successCustomer.amount} ({successCustomer.modality === 'W' ? 'साप्ताहिक' : 'मासिक'})
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => {
                  const createdId = successCustomer.id;
                  setSuccessCustomer(null);
                  refreshData();
                  onSuccess(createdId);
                  onClose();
                }}
                className="flex-1 py-3 px-4 rounded-xl bg-emerald-700 text-white font-extrabold text-sm hover:bg-emerald-800 transition-colors shadow-md"
              >
                ठीक आहे (OK)
              </button>
            </div>
          </div>
        </div>
      </ModalPortal>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!accountNumber.trim()) {
      setError('कृपया खाते क्रमांक भरा.');
      return;
    }
    if (!name.trim()) {
      setError('कृपया खातेदाराचे पूर्ण नाव भरा.');
      return;
    }
    if (!mobile.trim() || mobile.length < 10) {
      setError('मोबाईल क्रमांक चुकीचा आहे.');
      return;
    }
    if (bishiType !== 'LOAN_ONLY' && (!amount || Number(amount) <= 0)) {
      setError('कृपया योग्य भिशी रक्कम टाका.');
      return;
    }

    if (hasLoan && (!loanPrincipal || Number(loanPrincipal) <= 0)) {
      setError('कृपया कर्जाची योग्य रक्कम भरा.');
      return;
    }

    setSubmitting(true);
    try {
      if (editingCustomer) {
        // Update customer
        const updated = StorageService.updateCustomer(editingCustomer.id, {
          accountNumber: accountNumber.trim(),
          name: name.trim(),
          mobile: mobile.trim(),
          bishiType,
          bishiDate,
          modality,
          amount: bishiType === 'LOAN_ONLY' ? 0 : Number(amount),
          totalInstallments: Number(totalInstallments) || (modality === 'W' ? 40 : 10),
          interestRate: Number(interestRate) || 0,
          penaltyRate: Number(penaltyRate) || 0,
          officeId,
          address: address.trim(),
          photoURL: photoURL.trim() || undefined,
          hasLoan: bishiType === 'LOAN_ONLY' ? true : hasLoan,
        });

        // Update Loan if applicable
        if (hasLoan && loanPrincipal) {
          const principal = Number(loanPrincipal);
          const rate = Number(loanInterestRate) || 12;
          const totalInterest = Math.round((principal * rate) / 100);
          const totalPayable = principal + totalInterest;

          const existingLoan = StorageService.getLoanByCustomerId(editingCustomer.id);
          StorageService.saveLoan({
            customerId: updated.id,
            accountNumber: updated.accountNumber,
            officeId: updated.officeId,
            principalAmount: principal,
            issueDate: bishiDate,
            interestRate: rate,
            totalInterest,
            totalPayable,
            paidAmount: existingLoan ? existingLoan.paidAmount : 0,
            remainingAmount: existingLoan
              ? Math.max(0, principal - (existingLoan.paidAmount || 0) - (existingLoan.discountAmount || 0) + (existingLoan.penaltyAmount || 0))
              : principal,
            penaltyAmount: existingLoan ? existingLoan.penaltyAmount || 0 : 0,
            status: 'ACTIVE',
          });
        }

        showToast('खातेदाराची माहिती यशस्वीपणे अपडेट झाली.', 'success');
      } else {
        // Add new customer
        const isLoanOnly = bishiType === 'LOAN_ONLY';
        const finalAmount = isLoanOnly ? 0 : Number(amount);
        const finalInstallments = Number(totalInstallments) || (modality === 'W' ? 40 : 10);
        const newCustomer = StorageService.addCustomer({
          accountNumber: accountNumber.trim(),
          name: name.trim(),
          customerName: name.trim(),
          mobile: mobile.trim(),
          bishiType,
          bishiDate,
          modality,
          amount: finalAmount,
          totalInstallments: finalInstallments,
          interestRate: Number(interestRate) || 0,
          penaltyRate: Number(penaltyRate) || 0,
          officeId,
          address: address.trim(),
          photoURL: photoURL.trim() || undefined,
          hasLoan: isLoanOnly ? true : hasLoan,
          status: 'ACTIVE',
        });

        // Generate Weekly/Monthly entries only if NOT loan-only
        if (!isLoanOnly) {
          const selectedSchemeConfig = bishiConfigs.find((cfg: BishiConfig) => cfg.id === bishiType);
          const targetInstallments =
            finalInstallments || selectedSchemeConfig?.totalInstallments || (modality === 'W' ? 40 : 10);

          const collectionEntries =
            modality === 'W'
              ? generateWeeklyEntries(newCustomer, bishiDate, targetInstallments)
              : generateMonthlyEntries(newCustomer, bishiDate, targetInstallments);

          const preparedCollections = collectionEntries.map((c) => ({
            ...c,
            customerName: newCustomer.name,
            id: `coll_${newCustomer.id}_${c.periodIndex}`,
          }));

          StorageService.saveCollectionsBatch(preparedCollections);
        }

        // Save Loan if applicable
        if (hasLoan && loanPrincipal) {
          const principal = Number(loanPrincipal);
          const rate = Number(loanInterestRate) || 12;
          const totalInterest = Math.round((principal * rate) / 100);
          const totalPayable = principal + totalInterest;

          StorageService.saveLoan({
            customerId: newCustomer.id,
            customerName: newCustomer.name,
            accountNumber: newCustomer.accountNumber,
            officeId: newCustomer.officeId,
            principalAmount: principal,
            issueDate: bishiDate,
            interestRate: rate,
            totalInterest,
            totalPayable,
            paidAmount: 0,
            remainingAmount: principal,
            penaltyAmount: 0,
            status: 'ACTIVE',
          });
        }

        showToast('नवीन खातेदार यशस्वीपणे जोडला गेला.', 'success');
        setSuccessCustomer({
          id: newCustomer.id,
          accountNumber: newCustomer.accountNumber,
          name: newCustomer.name,
          mobile: newCustomer.mobile,
          amount: newCustomer.amount,
          modality: newCustomer.modality,
        });
        refreshData();
      }
      if (editingCustomer) {
        refreshData();
        onSuccess();
        onClose();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'खातेदार जतन करताना त्रुटी आली.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs no-print overflow-hidden">
        <div className="bg-white rounded-2xl sm:rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in duration-150">
        {/* Fixed Pinned Header */}
        <div className="p-4 sm:px-6 sm:py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
          <div className="flex items-center space-x-3">
            <div className="p-2 sm:p-2.5 rounded-xl bg-brand-100 text-brand-700 font-bold shrink-0">
              <UserPlus className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                {editingCustomer
                  ? (bishiType === 'LOAN_ONLY' ? 'कर्ज खातेदार माहिती बदला' : 'खातेदार माहिती बदला')
                  : (initialLoanOnly || bishiType === 'LOAN_ONLY' ? 'नवीन कर्ज खातेदार जोडा' : 'नवीन भिशी खातेदार जोडा')}
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500 font-medium">
                सर्व आवश्यक माहिती अचूकपणे भरा
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 min-w-[40px] min-h-[40px] text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 flex items-center justify-center cursor-pointer transition-colors"
            aria-label="फॉर्म बंद करा"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form with scrollable body & pinned footer */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Scrollable Form Body */}
          <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
            {error && (
              <div className="mb-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm font-semibold flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Account Number */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                खाते क्रमांक <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="उदा. 101"
                className="w-full px-4 py-2.5 rounded-xl border border-emerald-300 text-sm font-extrabold text-emerald-900 bg-emerald-50/20 focus:ring-2 focus:ring-brand-500 focus:outline-none"
              />
            </div>

            {/* Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                खातेदाराचे पूर्ण नाव <span className="text-rose-500">*</span>
              </label>
              <MarathiTextInput
                required
                value={name}
                onChange={(val) => setName(val)}
                placeholder="इंग्रजीत टाईप करा (उदा. rahul -> राहुल)"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-medium focus:ring-2 focus:ring-brand-500 focus:outline-none"
              />
            </div>

            {/* Mobile */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                मोबाईल क्रमांक <span className="text-rose-500">*</span>
              </label>
              <input
                type="tel"
                required
                maxLength={10}
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="१० अंकी मोबाईल नंबर"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-medium focus:ring-2 focus:ring-brand-500 focus:outline-none"
              />
            </div>

            {/* Office */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                कार्यालय <span className="text-rose-500">*</span>
              </label>
              <CustomDropdown<OfficeId>
                value={officeId}
                onChange={(val) => setOfficeId(val)}
                options={[
                  { value: 'MAIN', label: 'मुख्य कार्यालय' },
                  { value: 'HOME', label: 'गृह कार्यालय' },
                ]}
                size="lg"
              />
            </div>

            {/* Bishi Type */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                भिशी प्रकार <span className="text-rose-500">*</span>
              </label>
              <CustomDropdown<BishiType>
                value={bishiType}
                onChange={(val) => handleBishiTypeChange(val)}
                options={[
                  ...bishiConfigs.map((cfg) => ({
                    value: cfg.id as BishiType,
                    label: cfg.name,
                  })),
                  ...((initialLoanOnly || bishiType === 'LOAN_ONLY')
                    ? [{ value: 'LOAN_ONLY' as BishiType, label: 'फक्त कर्ज खातेदार (Loan Only)' }]
                    : []),
                ]}
                size="lg"
              />
            </div>

            {/* Bishi Start Date */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                {bishiType === 'LOAN_ONLY' ? 'खाते सुरु तारीख' : 'भिशीची तारीख'} <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                required
                value={bishiDate}
                onChange={(e) => setBishiDate(e.target.value)}
                className="w-full h-11 px-4 rounded-xl border border-[#E4EAE7] hover:border-[#0F7A5C]/60 text-sm font-bold text-[#10241E] focus:ring-2 focus:ring-[#0F7A5C] bg-white transition-all shadow-2xs"
              />
            </div>

            {/* Modality */}
            {bishiType !== 'LOAN_ONLY' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  भिशीची पद्धत <span className="text-rose-500">*</span>
                </label>
                <CustomDropdown<Modality>
                  value={modality}
                  onChange={(val) => {
                    setModality(val);
                    if (!editingCustomer) {
                      setTotalInstallments(val === 'W' ? 40 : 10);
                    }
                  }}
                  options={[
                    { value: 'W', label: 'साप्ताहिक (Weekly)' },
                    { value: 'M', label: 'मासिक (Monthly)' },
                  ]}
                  size="lg"
                />
              </div>
            )}

            {/* Total Installments (Weeks / Months) */}
            {bishiType !== 'LOAN_ONLY' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {modality === 'W' ? 'एकूण आठवडे (Total Weeks)' : 'एकूण महिने (Total Months)'}{' '}
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  max={200}
                  value={totalInstallments}
                  onChange={(e) => setTotalInstallments(e.target.value ? Number(e.target.value) : '')}
                  placeholder={modality === 'W' ? 'उदा. 40 किंवा 52' : 'उदा. 10 किंवा 12'}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-bold focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>
            )}

            {/* Amount */}
            {bishiType !== 'LOAN_ONLY' ? (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {modality === 'W' ? 'साप्ताहिक रक्कम (₹)' : 'मासिक रक्कम (₹)'}{' '}
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min={100}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : '')}
                  placeholder="उदा. 1000"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-bold focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold text-amber-800 mb-1">
                  खातेदार प्रकार
                </label>
                <div className="px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 font-bold text-xs flex items-center justify-between">
                  <span>फक्त कर्ज खातेदार (Without Bishi)</span>
                  <span className="text-[10px] bg-amber-200 text-amber-900 px-2 py-0.5 rounded-md font-extrabold">भिशी हप्ता ₹0</span>
                </div>
              </div>
            )}

            {/* Interest */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                व्याजदर (%)
              </label>
              <input
                type="number"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value ? Number(e.target.value) : '')}
                placeholder="उदा. 10"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-medium focus:ring-2 focus:ring-brand-500 focus:outline-none"
              />
            </div>

            {/* Penalty */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                दंड रक्कम (₹)
              </label>
              <input
                type="number"
                value={penaltyRate}
                onChange={(e) => setPenaltyRate(e.target.value ? Number(e.target.value) : '')}
                placeholder="उदा. 50"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-medium focus:ring-2 focus:ring-brand-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">पत्ता</label>
            <MarathiTextInput
              rows={2}
              value={address}
              onChange={(val) => setAddress(val)}
              placeholder="संपूर्ण पत्ता इंग्रजीत टाईप करा (उदा. mg road pune -> एमजी रोड पुणे)"
              className="w-full px-4 py-2 rounded-xl border border-slate-300 text-sm font-medium focus:ring-2 focus:ring-brand-500 focus:outline-none"
            />
          </div>



          </div>

          {/* Fixed Pinned Footer */}
          <div className="p-3.5 sm:px-6 sm:py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end space-x-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 min-h-[44px] rounded-xl border border-slate-300 text-slate-700 text-sm font-bold hover:bg-white transition-colors cursor-pointer flex items-center justify-center shadow-2xs"
            >
              रद्द करा
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 min-h-[44px] rounded-xl bg-brand-900 text-white text-sm font-bold shadow-md hover:bg-brand-800 transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{submitting ? 'जतन होत आहे...' : 'जतन करा'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </ModalPortal>
  );
};
