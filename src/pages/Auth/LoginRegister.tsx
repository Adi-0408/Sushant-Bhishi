import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Lock,
  Phone,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  Users,
  FileText,
  Eye,
  EyeOff,
  ArrowRight,
  Sun,
} from 'lucide-react';

export const LoginRegister: React.FC = () => {
  const { login } = useAuth();

  // Login form state
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState('');
  const [successMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [forgotPasswordMsg, setForgotPasswordMsg] = useState(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!loginIdentifier.trim() || !loginPassword) {
      setError('कृपया ईमेल आयडी किंवा मोबाईल क्रमांक आणि पासवर्ड भरा.');
      return;
    }

    setSubmitting(true);
    try {
      const success = await login(loginIdentifier, loginPassword);
      if (!success) {
        setError('ईमेल / मोबाईल क्रमांक किंवा पासवर्ड चुकीचा आहे.');
      }
    } catch {
      setError('प्रवेश करताना त्रुटी आली.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50/20 to-emerald-50/30 flex flex-col justify-between p-4 sm:p-6 lg:p-8 font-marathi relative overflow-hidden">
      {/* Top Right Header Language Selector */}
      <div className="flex justify-end items-center max-w-7xl w-full mx-auto z-20">
        <div className="flex items-center space-x-2 bg-white/90 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-slate-200 shadow-xs text-xs font-extrabold text-slate-700 cursor-pointer hover:bg-slate-50 transition-colors">
          <Sun className="w-3.5 h-3.5 text-amber-500" />
          <span>मराठी</span>
          <span className="text-[10px]">▼</span>
        </div>
      </div>

      {/* Main Content Layout Container */}
      <div className="max-w-7xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-center my-auto py-6 z-10">
        
        {/* Left Hero Branding Section (Exactly like screenshot) */}
        <div className="lg:col-span-7 space-y-8 pr-0 lg:pr-6">
          
          {/* Logo & Tagline */}
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white text-3xl font-black shadow-md border-2 border-emerald-400 flex-shrink-0">
              सु
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
                सुषांत भिशी
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 font-bold tracking-wide mt-0.5">
                — विश्वासाची साथ, समृद्धीची वाट —
              </p>
            </div>
          </div>

          {/* Heading & Subtitle */}
          <div className="space-y-3">
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 leading-snug tracking-tight">
              व्यावसायिक आणि सुरक्षित मराठी भिशी <br className="hidden sm:inline" />
              व्यवस्थापन प्रणाली
            </h2>
            <p className="text-sm sm:text-base text-slate-600 font-medium leading-relaxed max-w-xl">
              मुख्य कार्यालय आणि गृह कार्यालयासाठी स्वतंत्र, सोपी आणि सुलभ भिशी, कर्ज व जमा हिशोब व्यवस्था.
            </p>
          </div>

          {/* Illustration Graphic Box */}
          <div className="bg-gradient-to-r from-teal-50/60 to-emerald-50/60 p-6 sm:p-8 rounded-3xl border border-teal-100/80 shadow-xs flex justify-center items-center relative">
            <div className="relative w-full max-w-md h-44 flex items-center justify-center">
              {/* Visual Vector Graphic */}
              <div className="absolute inset-0 bg-white/80 backdrop-blur-xs rounded-2xl border border-teal-100 shadow-sm p-4 flex items-center justify-between">
                <div className="space-y-2">
                  <div className="w-28 h-3 bg-teal-200 rounded-full"></div>
                  <div className="w-20 h-3 bg-emerald-200 rounded-full"></div>
                  <div className="w-36 h-2.5 bg-slate-200 rounded-full"></div>
                  <div className="w-24 h-2.5 bg-slate-200 rounded-full"></div>
                </div>
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-800 text-white flex flex-col items-center justify-center shadow-lg transform rotate-3">
                  <FileText className="w-8 h-8 mb-1" />
                  <span className="text-[10px] font-black tracking-wider uppercase">सुषांत भिशी</span>
                </div>
              </div>
              {/* Coins & Calendar accent graphics */}
              <div className="absolute -top-3 -right-3 w-12 h-12 rounded-2xl bg-amber-400 text-slate-900 font-black text-xl flex items-center justify-center shadow-md border-2 border-white transform -rotate-12">
                ₹
              </div>
              <div className="absolute -bottom-3 -left-3 p-2.5 rounded-2xl bg-brand-600 text-white shadow-md border-2 border-white">
                <Calendar className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* 4 Feature Badges Grid (Exact 2x2 layout from image) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Feature 1 */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center space-x-3.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0 font-bold">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-900">सुरक्षित प्रशासक प्रवेश</h4>
                <p className="text-[11px] text-slate-500 font-semibold">फक्त अधिकृत व्यक्तीलाच प्रवेश</p>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center space-x-3.5">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0 font-bold">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-900">१५ ऑगस्ट, २६ जानेवारी व दसरा भिशी</h4>
                <p className="text-[11px] text-slate-500 font-semibold">३ भिशी पर्याय</p>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center space-x-3.5">
              <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center flex-shrink-0 font-bold">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-900">साप्ताहिक आणि मासिक</h4>
                <p className="text-[11px] text-slate-500 font-semibold">W / M पद्धत</p>
              </div>
            </div>

            {/* Feature 4 */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center space-x-3.5">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center flex-shrink-0 font-bold">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-900">सुस्पष्ट अहवाल व PDF/Print</h4>
                <p className="text-[11px] text-slate-500 font-semibold">दैनिक, साप्ताहिक, मासिक</p>
              </div>
            </div>

          </div>
        </div>

        {/* Right Form Card (Exact match to uploaded design) */}
        <div className="lg:col-span-5 w-full">
          <div className="bg-white rounded-[2.5rem] p-7 sm:p-10 shadow-xl border border-slate-200/80 relative">
            
            {/* Card Header Logo */}
            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white text-3xl font-black shadow-md border-2 border-emerald-400 mx-auto mb-2">
                सु
              </div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">सुषांत भिशी</h3>
              <p className="text-[11px] text-slate-500 font-bold">
                — विश्वासाची साथ, समृद्धीची वाट —
              </p>
            </div>

            <div className="mb-5">
              <h4 className="text-lg font-black text-slate-900">
                प्रशासक प्रवेश
              </h4>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                आपल्या खात्यात लॉगिन करा आणि पुढे काम सुरू करा
              </p>
            </div>

            {successMsg && (
              <div className="mb-5 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {error && (
              <div className="mb-5 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center space-x-2">
                <span>⚠️ {error}</span>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-extrabold text-slate-800 mb-1">
                  मोबाईल क्रमांक किंवा ईमेल <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    placeholder="उदा. ९८७६५४३२१० किंवा sushant@gmail.com"
                    className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-slate-50/40"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-800 mb-1">
                  पासवर्ड <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="पासवर्ड टाका"
                    className="w-full pl-10 pr-10 py-3 rounded-2xl border border-slate-200 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-slate-50/40"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-2 p-2 text-slate-400 hover:text-slate-600 touch-target flex items-center justify-center cursor-pointer"
                    aria-label="पासवर्ड दाखवा/लपवा"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setForgotPasswordMsg(!forgotPasswordMsg)}
                  className="text-[11px] font-bold text-emerald-700 hover:underline cursor-pointer"
                >
                  पासवर्ड विसरलात?
                </button>
              </div>

              {forgotPasswordMsg && (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs font-semibold">
                  💡 डिफॉल्ट पासवर्ड <strong className="font-mono">123456</strong> आहे (मोबाईल: ९८७६५४३२१०). आपण प्रोफाइल विभागात जाऊन पासवर्ड बदलू शकता.
                </div>
              )}

              {/* Primary Action Button */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-sm transition-all shadow-md flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
              >
                <span>{submitting ? 'तपासत आहे...' : 'प्रवेश करा'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              {/* Security Footer Notice */}
              <div className="mt-5 p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-100 text-slate-700 text-[11px] font-bold flex items-start space-x-3">
                <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="text-slate-900 font-extrabold block">फक्त अधिकृत प्रशासकांनाच प्रवेश आहे.</span>
                  <span className="text-slate-500 font-medium">नवीन नोंदणी बंद आहे. थेट लॉगिन करा.</span>
                </div>
              </div>
            </form>
          </div>
        </div>

      </div>

      {/* Page Bottom Copyright Footer */}
      <div className="text-center text-xs text-slate-400 font-bold py-2 z-10">
        © {new Date().getFullYear()} सुषांत भिशी • सर्व हक्क सुरक्षित
      </div>
    </div>
  );
};
