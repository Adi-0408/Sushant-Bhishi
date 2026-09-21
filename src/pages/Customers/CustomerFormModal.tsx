import React, { useState, useEffect } from 'react';
import { Customer, BishiConfig, BishiType, Modality, OfficeId } from '../../types';
import { useApp } from '../../context/AppContext';
import { StorageService } from '../../services/db';
import { generateWeeklyEntries, generateMonthlyEntries, calculateElapsedMonths } from '../../utils/calculations';
import { generateNextAccountNumber } from '../../utils/formatters';
import { MarathiTextInput, convertTextToMarathi } from '../../components/common/MarathiTextInput';
import { CustomDropdown } from '../../components/common/CustomDropdown';
import { ModalPortal } from '../../components/common/ModalPortal';
import { X, UserPlus, Save, AlertCircle, CheckCircle2, Landmark, Calendar, Clock, DollarSign } from 'lucide-react';

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
  const { customers, activeOffice, bishiConfigs, interestRates, penaltySettings, showToast, refreshData, language, t } = useApp();

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
  const [officeId, setOfficeId] = useState<OfficeId>(activeOffice === 'ALL' ? 'MAIN' : activeOffice);
  const [address, setAddress] = useState('');
  const [photoURL, setPhotoURL] = useState('');

  // Old Bishi data migration
  const [alreadyPaidInstallments, setAlreadyPaidInstallments] = useState<number | ''>('');

  // Loan fields with historical date & repayment support
  const [hasLoan, setHasLoan] = useState<boolean>(false);
  const [loanPrincipal, setLoanPrincipal] = useState<number | ''>('');
  const [loanInterestRate, setLoanInterestRate] = useState<number | ''>(2);
  const [loanIssueDate, setLoanIssueDate] = useState<string>('');
  const [loanPaidPrincipal, setLoanPaidPrincipal] = useState<number | ''>('');
  const [loanPaidInterest, setLoanPaidInterest] = useState<number | ''>('');

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

    const selectedConfig = bishiConfigs.find((cfg) => cfg.id === newType);
    if (selectedConfig) {
      const cfgModality = selectedConfig.modality || (selectedConfig.id === '26_JANUARY' ? 'M' : 'W');
      const cfgInstallments = selectedConfig.totalInstallments || (cfgModality === 'M' ? 10 : 40);
      setModality(cfgModality);
      setTotalInstallments(cfgInstallments);
      if (!editingCustomer && selectedConfig.startDate) {
        setBishiDate(selectedConfig.startDate);
      }
    }

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
          setLoanIssueDate(existingLoan.issueDate || editingCustomer.bishiDate || new Date().toISOString().split('T')[0]);
          setLoanPaidPrincipal(existingLoan.paidAmount || '');
          setLoanPaidInterest(existingLoan.totalInterestPaid || '');
        }
      }
      setAlreadyPaidInstallments('');
    } else {
      const initType = initialLoanOnly ? 'LOAN_ONLY' : (bishiConfigs.length > 0 ? bishiConfigs[0].id : '15_AUGUST');
      const autoAcc = generateNextAccountNumber(initType, customers, bishiConfigs);
      const firstConfig = bishiConfigs.find((cfg) => cfg.id === initType);
      const initModality = firstConfig?.modality || (firstConfig?.id === '26_JANUARY' ? 'M' : 'W');
      const initInstallments = firstConfig?.totalInstallments || (initModality === 'M' ? 10 : 40);
      const initStartDate = firstConfig?.startDate || new Date().toISOString().split('T')[0];

      setAccountNumber(autoAcc);
      setName('');
      setMobile('');
      setBishiType(initType);
      setBishiDate(initStartDate);
      setModality(initModality);
      setTotalInstallments(initInstallments);
      setAmount(initialLoanOnly ? 0 : 1000);
      setInterestRate(defaultInterestRate);
      setPenaltyRate(defaultPenaltyRate);
      setOfficeId(activeOffice === 'ALL' ? 'MAIN' : activeOffice);
      setAddress('');
      setPhotoURL('');
      setHasLoan(initialLoanOnly ? true : false);
      setLoanPrincipal('');
      setLoanInterestRate(2);
      setLoanIssueDate(initStartDate);
      setLoanPaidPrincipal('');
      setLoanPaidInterest('');
      setAlreadyPaidInstallments('');
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
              {language === 'EN' ? 'Customer Added Successfully!' : 'खातेदार यशस्वीपणे जोडला गेला!'}
            </h2>
            <p className="text-xs text-slate-500 font-medium mb-6">
              {language === 'EN'
                ? 'New customer record has been saved in Sushant Bishi system.'
                : 'सुषांत भिशी सिस्टीममध्ये नवीन खातेदाराची नोंद जतन झाली आहे.'}
            </p>

            {/* Details Summary Card */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-left space-y-2 mb-6">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-medium">{t.colAccountNo}:</span>
                <span className="font-extrabold text-slate-900 bg-white px-2.5 py-0.5 rounded-md border border-slate-200">
                  {successCustomer.accountNumber}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-medium">{t.colFullName}:</span>
                <span className="font-bold text-slate-900">{successCustomer.name}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-medium">{t.colMobile}:</span>
                <span className="font-bold text-slate-900">{successCustomer.mobile}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-medium">{t.colInstallmentAmount}:</span>
                <span className="font-extrabold text-emerald-700">
                  ₹{successCustomer.amount} ({successCustomer.modality === 'W' ? (language === 'EN' ? 'Weekly' : 'साप्ताहिक') : (language === 'EN' ? 'Monthly' : 'मासिक')})
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
                className="flex-1 py-3 px-4 rounded-xl bg-emerald-700 text-white font-extrabold text-sm hover:bg-emerald-800 transition-colors shadow-md cursor-pointer"
              >
                {language === 'EN' ? 'OK' : 'ठीक आहे (OK)'}
              </button>
            </div>
          </div>
        </div>
      </ModalPortal>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!accountNumber.trim()) {
      setError(language === 'EN' ? 'Please enter account number.' : 'कृपया खाते क्रमांक भरा.');
      return;
    }
    if (!name.trim()) {
      setError(language === 'EN' ? 'Please enter customer name.' : 'कृपया खातेदाराचे पूर्ण नाव भरा.');
      return;
    }
    if (!mobile.trim() || mobile.length < 10) {
      setError(language === 'EN' ? 'Invalid 10-digit mobile number.' : 'मोबाईल क्रमांक चुकीचा आहे.');
      return;
    }
    if (bishiType !== 'LOAN_ONLY' && (!amount || Number(amount) <= 0)) {
      setError(language === 'EN' ? 'Please enter valid bishi installment amount.' : 'कृपया योग्य भिशी रक्कम टाका.');
      return;
    }

    if (hasLoan && (!loanPrincipal || Number(loanPrincipal) <= 0)) {
      setError(language === 'EN' ? 'Please enter valid loan principal amount.' : 'कृपया कर्जाची योग्य रक्कम भरा.');
      return;
    }

    setSubmitting(true);
    try {
      const finalName = language === 'MR' ? await convertTextToMarathi(name.trim()) : name.trim();
      const finalAddress = address.trim()
        ? language === 'MR'
          ? await convertTextToMarathi(address.trim())
          : address.trim()
        : '';

      if (editingCustomer) {
        // Update customer
        const updated = StorageService.updateCustomer(editingCustomer.id, {
          accountNumber: accountNumber.trim(),
          name: finalName,
          customerName: finalName,
          mobile: mobile.trim(),
          bishiType,
          bishiDate,
          modality,
          amount: bishiType === 'LOAN_ONLY' ? 0 : Number(amount),
          totalInstallments: Number(totalInstallments) || (modality === 'W' ? 40 : 10),
          interestRate: Number(interestRate) || 0,
          penaltyRate: Number(penaltyRate) || 0,
          officeId,
          address: finalAddress,
          photoURL: photoURL.trim() || undefined,
          hasLoan: bishiType === 'LOAN_ONLY' ? true : hasLoan,
        });

        // Update Loan if applicable
        if (hasLoan && loanPrincipal) {
          const principal = Number(loanPrincipal);
          const rate = Number(loanInterestRate) || 2;
          const effectiveDate = loanIssueDate || bishiDate;
          const months = calculateElapsedMonths(effectiveDate);
          const monthlyInterest = Math.round((principal * rate) / 100);
          const totalInterest = Math.max(monthlyInterest, months * monthlyInterest);

          const existingLoan = StorageService.getLoanByCustomerId(editingCustomer.id);
          const paidPrin = existingLoan ? (Number(existingLoan.paidAmount) || 0) : (Number(loanPaidPrincipal) || 0);
          const paidInt = existingLoan ? (Number(existingLoan.totalInterestPaid) || 0) : (Number(loanPaidInterest) || 0);
          const discount = existingLoan ? (Number(existingLoan.discountAmount) || 0) : 0;
          const penalty = existingLoan ? (Number(existingLoan.penaltyAmount) || 0) : 0;
          const remPrincipal = Math.max(0, principal - paidPrin - discount);
          const remInterest = Math.max(0, totalInterest - paidInt);
          const remainingAmount = remPrincipal + penalty + remInterest;
          const isCompleted = remainingAmount <= 0;

          StorageService.saveLoan({
            customerId: updated.id,
            accountNumber: updated.accountNumber,
            officeId: updated.officeId,
            customerName: updated.name,
            customerMobile: updated.mobile,
            principalAmount: principal,
            issueDate: effectiveDate,
            interestRate: rate,
            totalInterest,
            totalInterestPaid: paidInt,
            totalPayable: principal + totalInterest,
            paidAmount: paidPrin,
            discountAmount: discount,
            remainingAmount,
            penaltyAmount: penalty,
            status: isCompleted ? 'COMPLETED' : 'ACTIVE',
          });
        }

        // Check if bishi schedule parameters changed and synchronize collections
        const dateChanged = editingCustomer.bishiDate !== bishiDate;
        const modalityChanged = editingCustomer.modality !== modality;
        const amountChanged = Number(editingCustomer.amount) !== Number(amount);

        if (bishiType !== 'LOAN_ONLY') {
          const allColls = StorageService.getCollections();
          const customerColls = allColls.filter(
            (c) => c.customerId === editingCustomer.id || (editingCustomer.accountNumber && c.accountNumber === editingCustomer.accountNumber)
          );

          if (customerColls.length > 0) {
            const startDate = new Date(bishiDate || Date.now());
            const updatedCustomerColls = allColls.map((c) => {
              if (c.customerId === editingCustomer.id || (editingCustomer.accountNumber && c.accountNumber === editingCustomer.accountNumber)) {
                let newDueDate = c.dueDate;
                if (dateChanged || modalityChanged) {
                  const d = new Date(startDate);
                  if (modality === 'W') {
                    d.setDate(d.getDate() + (c.periodIndex - 1) * 7);
                  } else {
                    d.setMonth(d.getMonth() + (c.periodIndex - 1));
                  }
                  newDueDate = d.toISOString().split('T')[0];
                }

                let newExpected = c.expectedAmount;
                let newRemaining = c.remainingAmount;
                let newStatus = c.status;
                if (amountChanged && c.status !== 'PAID') {
                  newExpected = Number(amount) || c.expectedAmount;
                  newRemaining = Math.max(0, newExpected - (c.collectedAmount || 0));
                  newStatus = (c.collectedAmount || 0) >= newExpected ? 'PAID' : ((c.collectedAmount || 0) > 0 ? 'PARTIAL' : 'PENDING');
                }

                return {
                  ...c,
                  customerName: finalName,
                  accountNumber: accountNumber.trim(),
                  officeId,
                  bishiType,
                  periodLabel: modality === 'W' ? `आठवडा ${c.periodIndex}` : `महिना ${c.periodIndex}`,
                  dueDate: newDueDate,
                  expectedAmount: newExpected,
                  remainingAmount: newRemaining,
                  status: newStatus,
                };
              }
              return c;
            });
            StorageService.saveCollectionsBatch(updatedCustomerColls);
          }
        }

        showToast(language === 'EN' ? 'Customer updated successfully.' : 'खातेदाराची माहिती यशस्वीपणे अपडेट झाली.', 'success');
      } else {
        // Add new customer
        const isLoanOnly = bishiType === 'LOAN_ONLY';
        const finalAmount = isLoanOnly ? 0 : Number(amount);
        const finalInstallments = Number(totalInstallments) || (modality === 'W' ? 40 : 10);
        const newCustomer = StorageService.addCustomer({
          accountNumber: accountNumber.trim(),
          name: finalName,
          customerName: finalName,
          mobile: mobile.trim(),
          bishiType,
          bishiDate,
          modality,
          amount: finalAmount,
          totalInstallments: finalInstallments,
          interestRate: Number(interestRate) || 0,
          penaltyRate: Number(penaltyRate) || 0,
          officeId,
          address: finalAddress,
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

          const paidCount = Math.min(targetInstallments, Math.max(0, Number(alreadyPaidInstallments) || 0));

          const preparedCollections = collectionEntries.map((c) => {
            const isPrePaid = c.periodIndex <= paidCount;
            return {
              ...c,
              customerName: newCustomer.name,
              id: `coll_${newCustomer.id}_${c.periodIndex}`,
              collectedAmount: isPrePaid ? c.expectedAmount : 0,
              remainingAmount: isPrePaid ? 0 : c.expectedAmount,
              totalPaid: isPrePaid ? c.expectedAmount : 0,
              totalWithPenalty: isPrePaid ? c.expectedAmount : 0,
              status: isPrePaid ? ('PAID' as const) : ('PENDING' as const),
              paymentDate: isPrePaid ? c.dueDate : undefined,
              paymentTime: isPrePaid ? '10:00' : undefined,
              paymentMode: isPrePaid ? ('CASH' as const) : undefined,
            };
          });

          StorageService.saveCollectionsBatch(preparedCollections);
        }

        // Save Loan if applicable
        if (hasLoan && loanPrincipal) {
          const principal = Number(loanPrincipal);
          const rate = Number(loanInterestRate) || 2;
          const effectiveDate = loanIssueDate || bishiDate;
          const months = calculateElapsedMonths(effectiveDate);
          const monthlyInterest = Math.round((principal * rate) / 100);
          const totalInterest = Math.max(monthlyInterest, months * monthlyInterest);
          const paidPrin = Number(loanPaidPrincipal) || 0;
          const paidInt = Number(loanPaidInterest) || 0;
          const remPrin = Math.max(0, principal - paidPrin);
          const remInt = Math.max(0, totalInterest - paidInt);
          const remainingAmount = remPrin + remInt;
          const isCompleted = remainingAmount <= 0;

          const savedLoan = StorageService.saveLoan({
            customerId: newCustomer.id,
            customerName: newCustomer.name,
            accountNumber: newCustomer.accountNumber,
            officeId: newCustomer.officeId,
            customerMobile: newCustomer.mobile,
            principalAmount: principal,
            issueDate: effectiveDate,
            interestRate: rate,
            totalInterest,
            totalInterestPaid: paidInt,
            totalPayable: principal + totalInterest,
            paidAmount: paidPrin,
            remainingAmount,
            penaltyAmount: 0,
            status: isCompleted ? 'COMPLETED' : 'ACTIVE',
          });

          if (paidPrin > 0 || paidInt > 0) {
            StorageService.addLoanPayment({
              loanId: savedLoan.id,
              customerId: newCustomer.id,
              customerName: newCustomer.name,
              accountNumber: newCustomer.accountNumber,
              officeId: newCustomer.officeId,
              customerMobile: newCustomer.mobile,
              paymentDate: effectiveDate,
              paidAmount: paidPrin,
              interestPaid: paidInt,
              penaltyPaid: 0,
              discountAmount: 0,
              remainingLoan: remainingAmount,
              paymentMode: 'CASH',
              note: language === 'EN' ? 'Initial historical loan payment recorded' : 'सुरुवातीची जुनी कर्ज भरणा नोंद',
            });
          }
        }

        showToast(language === 'EN' ? 'New customer added successfully.' : 'नवीन खातेदार यशस्वीपणे जोडला गेला.', 'success');
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
      const msg = err instanceof Error ? err.message : (language === 'EN' ? 'Error saving customer.' : 'खातेदार जतन करताना त्रुटी आली.');
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const effectiveLoanDate = loanIssueDate || bishiDate || new Date().toISOString().split('T')[0];
  const loanMonths = calculateElapsedMonths(effectiveLoanDate);
  const loanPrinNum = Number(loanPrincipal) || 0;
  const loanRateNum = Number(loanInterestRate) || 0;
  const loanMonthlyInterest = Math.round((loanPrinNum * loanRateNum) / 100);
  const loanTotalAccruedInterest = Math.max(loanMonthlyInterest, loanMonths * loanMonthlyInterest);
  const loanTotalPayable = loanPrinNum + loanTotalAccruedInterest;
  const loanPaidPrinNum = Number(loanPaidPrincipal) || 0;
  const loanPaidIntNum = Number(loanPaidInterest) || 0;
  const loanRemPrincipal = Math.max(0, loanPrinNum - loanPaidPrinNum);
  const loanRemInterest = Math.max(0, loanTotalAccruedInterest - loanPaidIntNum);
  const loanRemainingTotal = loanRemPrincipal + loanRemInterest;

  const bishiElapsedMonths = calculateElapsedMonths(bishiDate);

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
                  ? (bishiType === 'LOAN_ONLY'
                      ? (language === 'EN' ? 'Edit Loan Customer Details' : 'कर्ज खातेदार माहिती बदला')
                      : (language === 'EN' ? 'Edit Customer Details' : 'खातेदार माहिती बदला'))
                  : (initialLoanOnly || bishiType === 'LOAN_ONLY'
                      ? (language === 'EN' ? 'Add Loan Customer' : 'नवीन कर्ज खातेदार जोडा')
                      : (language === 'EN' ? 'Add New Customer' : 'नवीन भिशी खातेदार जोडा'))}
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500 font-medium">
                {language === 'EN' ? 'Fill all required details accurately' : 'सर्व आवश्यक माहिती अचूकपणे भरा'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 min-w-[40px] min-h-[40px] text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 flex items-center justify-center cursor-pointer transition-colors"
            aria-label={language === 'EN' ? 'Close form' : 'फॉर्म बंद करा'}
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
                {t.colAccountNo} <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder={language === 'EN' ? 'e.g. 101' : 'उदा. 101'}
                className="w-full px-4 py-2.5 rounded-xl border border-emerald-300 text-sm font-extrabold text-emerald-900 bg-emerald-50/20 focus:ring-2 focus:ring-brand-500 focus:outline-none"
              />
            </div>

            {/* Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {t.colFullName} <span className="text-rose-500">*</span>
              </label>
              <MarathiTextInput
                required
                value={name}
                onChange={(val) => setName(val)}
                placeholder={language === 'EN' ? 'Type customer full name' : 'इंग्रजीत टाईप करा (उदा. rahul -> राहुल)'}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-medium focus:ring-2 focus:ring-brand-500 focus:outline-none"
              />
            </div>

            {/* Mobile */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {t.colMobile} <span className="text-rose-500">*</span>
              </label>
              <input
                type="tel"
                required
                maxLength={10}
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder={language === 'EN' ? '10-digit mobile number' : '१० अंकी मोबाईल नंबर'}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-medium focus:ring-2 focus:ring-brand-500 focus:outline-none"
              />
            </div>

            {/* Office */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                {t.colOffice} <span className="text-rose-500">*</span>
              </label>
              <CustomDropdown<OfficeId>
                value={officeId}
                onChange={(val) => setOfficeId(val)}
                options={[
                  { value: 'MAIN', label: t.mainOffice },
                  { value: 'HOME', label: t.homeOffice },
                ]}
                size="lg"
              />
            </div>

            {/* Bishi Type */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                {t.colBishi} <span className="text-rose-500">*</span>
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
                    ? [{ value: 'LOAN_ONLY' as BishiType, label: language === 'EN' ? 'Loan Only Customer' : 'फक्त कर्ज खातेदार (Loan Only)' }]
                    : []),
                ]}
                size="lg"
              />
            </div>

            {/* Bishi Start Date */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                {bishiType === 'LOAN_ONLY'
                  ? (language === 'EN' ? 'Account Opening Date' : 'खाते सुरु तारीख')
                  : (language === 'EN' ? 'Bishi Start Date' : 'भिशीची तारीख')}{' '}
                <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                required
                value={bishiDate}
                onChange={(e) => {
                  setBishiDate(e.target.value);
                  if (!loanIssueDate) {
                    setLoanIssueDate(e.target.value);
                  }
                }}
                className="w-full h-11 px-4 rounded-xl border border-[#E4EAE7] hover:border-[#0F7A5C]/60 text-sm font-bold text-[#10241E] focus:ring-2 focus:ring-[#0F7A5C] bg-white transition-all shadow-2xs"
              />
              {bishiElapsedMonths > 1 && (
                <div className="mt-1 flex items-center space-x-1.5 text-[11px] font-extrabold text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 rounded-lg w-fit">
                  <Clock className="w-3 h-3 text-emerald-700" />
                  <span>{language === 'EN' ? `${bishiElapsedMonths} months elapsed since start date` : `सुरुवातीपासून ${bishiElapsedMonths} महिने झाले आहेत`}</span>
                </div>
              )}
            </div>

            {/* Modality */}
            {bishiType !== 'LOAN_ONLY' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  {t.colModality} <span className="text-rose-500">*</span>
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
                    { value: 'W', label: t.modalityWeekly },
                    { value: 'M', label: t.modalityMonthly },
                  ]}
                  size="lg"
                />
              </div>
            )}

            {/* Total Installments (Weeks / Months) */}
            {bishiType !== 'LOAN_ONLY' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {modality === 'W'
                    ? (language === 'EN' ? 'Total Weeks' : 'एकूण आठवडे (Total Weeks)')
                    : (language === 'EN' ? 'Total Months' : 'एकूण महिने (Total Months)')}{' '}
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  max={200}
                  value={totalInstallments}
                  onChange={(e) => setTotalInstallments(e.target.value ? Number(e.target.value) : '')}
                  placeholder={modality === 'W' ? (language === 'EN' ? 'e.g. 40 or 52' : 'उदा. 40 किंवा 52') : (language === 'EN' ? 'e.g. 10 or 12' : 'उदा. 10 किंवा 12')}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-bold focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>
            )}

            {/* Amount */}
            {bishiType !== 'LOAN_ONLY' ? (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {modality === 'W'
                    ? (language === 'EN' ? 'Weekly Amount (₹)' : 'साप्ताहिक रक्कम (₹)')
                    : (language === 'EN' ? 'Monthly Amount (₹)' : 'मासिक रक्कम (₹)')}{' '}
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min={100}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : '')}
                  placeholder={language === 'EN' ? 'e.g. 1000' : 'उदा. 1000'}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-bold focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold text-amber-800 mb-1">
                  {language === 'EN' ? 'Customer Category' : 'खातेदार प्रकार'}
                </label>
                <div className="px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 font-bold text-xs flex items-center justify-between">
                  <span>{language === 'EN' ? 'Loan Only Customer (Without Bishi)' : 'फक्त कर्ज खातेदार (Without Bishi)'}</span>
                  <span className="text-[10px] bg-amber-200 text-amber-900 px-2 py-0.5 rounded-md font-extrabold">{language === 'EN' ? 'Bishi Installment ₹0' : 'भिशी हप्ता ₹0'}</span>
                </div>
              </div>
            )}

            {/* Already Paid Installments for Old Bishi Customers */}
            {bishiType !== 'LOAN_ONLY' && !editingCustomer && (
              <div className="sm:col-span-2 bg-emerald-50/70 p-3.5 rounded-2xl border border-emerald-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-extrabold text-emerald-950">
                    {language === 'EN' ? 'Already Paid Installments (Old Records - Optional)' : 'आधीच जमा झालेले हप्ते (जुना रेकॉर्ड - ऐच्छिक)'}
                  </label>
                  <span className="text-[11px] font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md">
                    {alreadyPaidInstallments ? `${alreadyPaidInstallments} / ${totalInstallments} जमा` : (language === 'EN' ? '0 Paid' : 'शून्य जमा')}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min={0}
                    max={Number(totalInstallments) || 200}
                    value={alreadyPaidInstallments}
                    onChange={(e) => setAlreadyPaidInstallments(e.target.value ? Number(e.target.value) : '')}
                    placeholder={language === 'EN' ? 'e.g. 20 or 40' : 'उदा. 20 किंवा 40'}
                    className="w-1/2 px-3.5 py-2 rounded-xl border border-emerald-300 text-sm font-bold text-emerald-950 bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setAlreadyPaidInstallments(Number(totalInstallments) || (modality === 'W' ? 40 : 10))}
                    className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition-colors cursor-pointer"
                  >
                    {language === 'EN' ? 'All Paid' : 'सर्व जमा'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAlreadyPaidInstallments(Math.floor((Number(totalInstallments) || 40) / 2))}
                    className="px-3 py-2 rounded-xl bg-emerald-200 hover:bg-emerald-300 text-emerald-900 text-xs font-bold transition-colors cursor-pointer"
                  >
                    {language === 'EN' ? 'Half Paid' : 'अर्धे जमा'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAlreadyPaidInstallments('')}
                    className="px-2.5 py-2 rounded-xl bg-white border border-slate-300 text-slate-600 hover:text-slate-900 text-xs font-bold transition-colors cursor-pointer"
                  >
                    {language === 'EN' ? 'Clear' : 'रीसेट'}
                  </button>
                </div>
                <p className="text-[11px] text-emerald-800 font-semibold">
                  {language === 'EN'
                    ? 'The first installments will automatically be saved as PAID on their respective past due dates.'
                    : 'दिलेले पहिले हप्ते त्यांच्या संबंधित जुन्या तारखांनुसार जमा (PAID) म्हणून आपोआप सेव्ह केले जातील.'}
                </p>
              </div>
            )}

            {/* Interest */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {language === 'EN' ? 'Interest Rate (%)' : 'व्याजदर (%)'}
              </label>
              <input
                type="number"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value ? Number(e.target.value) : '')}
                placeholder={language === 'EN' ? 'e.g. 10' : 'उदा. 10'}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-medium focus:ring-2 focus:ring-brand-500 focus:outline-none"
              />
            </div>

            {/* Penalty */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {language === 'EN' ? 'Penalty Amount (₹)' : 'दंड रक्कम (₹)'}
              </label>
              <input
                type="number"
                value={penaltyRate}
                onChange={(e) => setPenaltyRate(e.target.value ? Number(e.target.value) : '')}
                placeholder={language === 'EN' ? 'e.g. 50' : 'उदा. 50'}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-medium focus:ring-2 focus:ring-brand-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Include Loan Toggle for Regular Bishi */}
          {bishiType !== 'LOAN_ONLY' && (
            <div className="pt-1">
              <label className="flex items-center space-x-3 p-3.5 bg-amber-50/50 border border-amber-200 rounded-2xl cursor-pointer hover:bg-amber-100/60 transition-colors">
                <input
                  type="checkbox"
                  checked={hasLoan}
                  onChange={(e) => {
                    setHasLoan(e.target.checked);
                    if (e.target.checked && !loanIssueDate) {
                      setLoanIssueDate(bishiDate);
                    }
                  }}
                  className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                />
                <div className="flex items-center space-x-2">
                  <Landmark className="w-4 h-4 text-amber-700" />
                  <span className="text-xs font-extrabold text-amber-950">
                    {language === 'EN' ? 'Add Loan with Bishi (कर्ज समाविष्ट करा)' : 'भिशीसोबत कर्ज जोडा (कर्ज तपशील)'}
                  </span>
                </div>
              </label>
            </div>
          )}

          {/* Loan Details Section with Live Date-Based Accrued Interest Calculation */}
          {(hasLoan || bishiType === 'LOAN_ONLY') && (
            <div className="p-4 rounded-2xl bg-amber-50/80 border-2 border-amber-300 space-y-3.5 shadow-2xs">
              <div className="flex items-center justify-between border-b border-amber-200/80 pb-2">
                <div className="flex items-center space-x-2 text-amber-900">
                  <Landmark className="w-5 h-5 text-amber-700" />
                  <h4 className="text-sm font-extrabold">
                    {language === 'EN' ? 'Loan Details & Date-Based Interest' : 'कर्ज तपशील व दिनांकानुसार व्याज गणना'}
                  </h4>
                </div>
                <span className="text-[11px] font-black bg-amber-200 text-amber-950 px-2.5 py-0.5 rounded-full">
                  {language === 'EN' ? `Elapsed: ${loanMonths} Months` : `कालावधी: ${loanMonths} महिने झाले`}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {language === 'EN' ? 'Loan Principal Amount (₹)' : 'कर्ज मुद्दल रक्कम (₹)'} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    required={hasLoan || bishiType === 'LOAN_ONLY'}
                    min={100}
                    value={loanPrincipal}
                    onChange={(e) => setLoanPrincipal(e.target.value ? Number(e.target.value) : '')}
                    placeholder={language === 'EN' ? 'e.g. 50000' : 'उदा. 50000'}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-black text-slate-900 bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {language === 'EN' ? 'Monthly Interest Rate (%)' : 'मासिक व्याजदर (%)'}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    value={loanInterestRate}
                    onChange={(e) => setLoanInterestRate(e.target.value ? Number(e.target.value) : '')}
                    placeholder={language === 'EN' ? 'e.g. 2' : 'उदा. 2'}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-900 bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {language === 'EN' ? 'Loan Issue Date' : 'कर्ज दिल्याची तारीख'} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required={hasLoan || bishiType === 'LOAN_ONLY'}
                    value={loanIssueDate || bishiDate}
                    onChange={(e) => setLoanIssueDate(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none h-[42px]"
                  />
                </div>
              </div>

              {/* Live Date-Based Calculation Card */}
              {loanPrinNum > 0 && (
                <div className="p-3 bg-white rounded-xl border border-amber-200 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center shadow-2xs">
                  <div className="p-2 bg-amber-50 rounded-lg">
                    <span className="text-[10px] font-bold text-amber-800 block">कालावधी (Duration)</span>
                    <span className="text-xs font-extrabold text-amber-950">{loanMonths} महिने ({loanMonths} Mo)</span>
                  </div>
                  <div className="p-2 bg-amber-50 rounded-lg">
                    <span className="text-[10px] font-bold text-amber-800 block">दरमहा व्याज (Monthly)</span>
                    <span className="text-xs font-extrabold text-amber-950">₹{loanMonthlyInterest}</span>
                  </div>
                  <div className="p-2 bg-amber-100/70 rounded-lg">
                    <span className="text-[10px] font-black text-amber-900 block">दिनांकानुसार एकूण व्याज</span>
                    <span className="text-xs font-black text-amber-900">₹{loanTotalAccruedInterest}</span>
                  </div>
                  <div className="p-2 bg-emerald-50 rounded-lg">
                    <span className="text-[10px] font-black text-emerald-800 block">एकूण परतफेड (Payable)</span>
                    <span className="text-xs font-black text-emerald-900">₹{loanTotalPayable}</span>
                  </div>
                </div>
              )}

              {/* Optional Historical Payments for Old Loans */}
              <div className="pt-2 border-t border-amber-200/60">
                <span className="text-[11px] font-extrabold text-amber-900 block mb-1.5">
                  {language === 'EN' ? 'Old Repayment Records (If migrating already paid amounts):' : 'जुनी परतफेड माहिती (आधीच काही भरले असल्यास - ऐच्छिक):'}
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      {language === 'EN' ? 'Previously Paid Principal (₹)' : 'आधी जमा केलेली मुद्दल (₹)'}
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={loanPrinNum || undefined}
                      value={loanPaidPrincipal}
                      onChange={(e) => setLoanPaidPrincipal(e.target.value ? Number(e.target.value) : '')}
                      placeholder="0"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      {language === 'EN' ? 'Previously Paid Interest (₹)' : 'आधी जमा केलेले व्याज (₹)'}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={loanPaidInterest}
                      onChange={(e) => setLoanPaidInterest(e.target.value ? Number(e.target.value) : '')}
                      placeholder="0"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 bg-white"
                    />
                  </div>
                </div>

                {(loanPaidPrinNum > 0 || loanPaidIntNum > 0) && (
                  <div className="mt-2 p-2 rounded-lg bg-white border border-amber-200 flex items-center justify-between text-xs font-bold text-slate-800">
                    <span>शिल्लक मुद्दल: <strong className="text-emerald-700">₹{loanRemPrincipal}</strong> | शिल्लक व्याज: <strong className="text-amber-800">₹{loanRemInterest}</strong></span>
                    <span>एकूण बाकी: <strong className="text-rose-600">₹{loanRemainingTotal}</strong></span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Address */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {language === 'EN' ? 'Address' : 'पत्ता'}
            </label>
            <MarathiTextInput
              rows={2}
              value={address}
              onChange={(val) => setAddress(val)}
              placeholder={language === 'EN' ? 'Type address...' : 'संपूर्ण पत्ता इंग्रजीत टाईप करा (उदा. mg road pune -> एमजी रोड पुणे)'}
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
              {t.btnCancel}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 min-h-[44px] rounded-xl bg-brand-900 text-white text-sm font-bold shadow-md hover:bg-brand-800 transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{submitting ? (language === 'EN' ? 'Saving...' : 'जतन होत आहे...') : t.btnSave}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </ModalPortal>
  );
};
