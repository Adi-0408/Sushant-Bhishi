import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
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
  Globe,
} from 'lucide-react';

export const LoginRegister: React.FC = () => {
  const { login } = useAuth();
  const { language, setLanguage, t } = useApp();

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
      setError(
        language === 'EN'
          ? 'Please enter Email ID or Mobile number and Password.'
          : 'कृपया ईमेल आयडी किंवा मोबाईल क्रमांक आणि पासवर्ड भरा.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const success = await login(loginIdentifier, loginPassword);
      if (!success) {
        setError(
          language === 'EN'
            ? 'Incorrect Email / Mobile number or Password.'
            : 'ईमेल / मोबाईल क्रमांक किंवा पासवर्ड चुकीचा आहे.'
        );
      }
    } catch {
      setError(
        language === 'EN'
          ? 'An error occurred during login.'
          : 'प्रवेश करताना त्रुटी आली.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50/20 to-emerald-50/30 flex flex-col justify-between p-4 sm:p-6 lg:p-8 font-marathi relative overflow-hidden">
      {/* Top Right Header Language Selector */}
      <div className="flex justify-end items-center max-w-7xl w-full mx-auto z-20">
        <button
          type="button"
          onClick={() => setLanguage(language === 'MR' ? 'EN' : 'MR')}
          className="flex items-center space-x-2 bg-white/90 backdrop-blur-md px-4 py-2 rounded-full border border-slate-200 shadow-sm text-xs font-black text-slate-800 cursor-pointer hover:bg-emerald-50 hover:border-emerald-300 transition-all touch-target"
        >
          <Globe className="w-4 h-4 text-[#0F7A5C]" />
          <span>{language === 'EN' ? 'English' : 'मराठी'}</span>
          <span className="text-[10px] text-slate-400 font-bold">
            ({language === 'EN' ? 'मराठी' : 'EN'})
          </span>
        </button>
      </div>

      {/* Main Content Layout Container */}
      <div className="max-w-7xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-center my-auto py-6 z-10">
        
        {/* Left Hero Branding Section */}
        <div className="lg:col-span-7 space-y-8 pr-0 lg:pr-6">
          
          {/* Logo & Tagline */}
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white text-3xl font-black shadow-md border-2 border-emerald-400 flex-shrink-0">
              {language === 'EN' ? 'S' : 'सु'}
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
                {t.appName}
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 font-bold tracking-wide mt-0.5">
                — {t.tagline} —
              </p>
            </div>
          </div>

          {/* Heading & Subtitle */}
          <div className="space-y-3">
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 leading-snug tracking-tight">
              {language === 'EN' ? (
                <>Professional & Secure Bishi <br className="hidden sm:inline" />Management System</>
              ) : (
                <>व्यावसायिक आणि सुरक्षित मराठी भिशी <br className="hidden sm:inline" />व्यवस्थापन प्रणाली</>
              )}
            </h2>
            <p className="text-sm sm:text-base text-slate-600 font-medium leading-relaxed max-w-xl">
              {language === 'EN'
                ? 'Independent, reliable, and convenient bishi, loan & collection management for Main Office and Home Office.'
                : 'मुख्य कार्यालय आणि गृह कार्यालयासाठी स्वतंत्र, सोपी आणि सुलभ भिशी, कर्ज व जमा हिशोब व्यवस्था.'}
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
                  <span className="text-[10px] font-black tracking-wider uppercase">{t.appName}</span>
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

          {/* 4 Feature Badges Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Feature 1 */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center space-x-3.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0 font-bold">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-900">
                  {language === 'EN' ? 'Secure Admin Login' : 'सुरक्षित प्रशासक प्रवेश'}
                </h4>
                <p className="text-[11px] text-slate-500 font-semibold">
                  {language === 'EN' ? 'Authorized personnel only' : 'फक्त अधिकृत व्यक्तीलाच प्रवेश'}
                </p>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center space-x-3.5">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0 font-bold">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-900">
                  {language === 'EN' ? '15 Aug, 26 Jan & Dasara Bishi' : '१५ ऑगस्ट, २६ जानेवारी व दसरा भिशी'}
                </h4>
                <p className="text-[11px] text-slate-500 font-semibold">
                  {language === 'EN' ? '3 Bishi Options' : '३ भिशी पर्याय'}
                </p>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center space-x-3.5">
              <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center flex-shrink-0 font-bold">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-900">
                  {language === 'EN' ? 'Weekly & Monthly' : 'साप्ताहिक आणि मासिक'}
                </h4>
                <p className="text-[11px] text-slate-500 font-semibold">
                  {language === 'EN' ? 'W / M Modality' : 'W / M पद्धत'}
                </p>
              </div>
            </div>

            {/* Feature 4 */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center space-x-3.5">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center flex-shrink-0 font-bold">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-900">
                  {language === 'EN' ? 'Clean Reports & PDF/Print' : 'सुस्पष्ट अहवाल व PDF/Print'}
                </h4>
                <p className="text-[11px] text-slate-500 font-semibold">
                  {language === 'EN' ? 'Daily, Weekly, Monthly' : 'दैनिक, साप्ताहिक, मासिक'}
                </p>
              </div>
            </div>

          </div>
        </div>

        {/* Right Form Card */}
        <div className="lg:col-span-5 w-full">
          <div className="bg-white rounded-[2.5rem] p-7 sm:p-10 shadow-xl border border-slate-200/80 relative">
            
            {/* Card Header Logo */}
            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white text-3xl font-black shadow-md border-2 border-emerald-400 mx-auto mb-2">
                {language === 'EN' ? 'S' : 'सु'}
              </div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">{t.appName}</h3>
              <p className="text-[11px] text-slate-500 font-bold">
                — {t.tagline} —
              </p>
            </div>

            <div className="mb-5">
              <h4 className="text-lg font-black text-slate-900">
                {language === 'EN' ? 'Admin Login' : 'प्रशासक प्रवेश'}
              </h4>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {language === 'EN'
                  ? 'Sign in to access the system and continue work'
                  : 'आपल्या खात्यात लॉगिन करा आणि पुढे काम सुरू करा'}
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
                  {language === 'EN' ? 'Mobile Number or Email' : 'मोबाईल क्रमांक किंवा ईमेल'} <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    placeholder={language === 'EN' ? 'e.g. 9876543210 or sushant@gmail.com' : 'उदा. ९८७६५४३२१० किंवा sushant@gmail.com'}
                    className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-slate-50/40"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-800 mb-1">
                  {language === 'EN' ? 'Password' : 'पासवर्ड'} <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder={language === 'EN' ? 'Enter Password' : 'पासवर्ड टाका'}
                    className="w-full pl-10 pr-10 py-3 rounded-2xl border border-slate-200 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-slate-50/40"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-2 p-2 text-slate-400 hover:text-slate-600 touch-target flex items-center justify-center cursor-pointer"
                    aria-label={language === 'EN' ? 'Show/hide password' : 'पासवर्ड दाखवा/लपवा'}
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
                  {language === 'EN' ? 'Forgot Password?' : 'पासवर्ड विसरलात?'}
                </button>
              </div>

              {forgotPasswordMsg && (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs font-semibold">
                  {language === 'EN' ? (
                    <>💡 Default password is <strong className="font-mono">123456</strong> (Mobile: 9876543210). You can update it in the Profile section.</>
                  ) : (
                    <>💡 डिफॉल्ट पासवर्ड <strong className="font-mono">123456</strong> आहे (मोबाईल: ९८७६५४३२१०). आपण प्रोफाइल विभागात जाऊन पासवर्ड बदलू शकता.</>
                  )}
                </div>
              )}

              {/* Primary Action Button */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-sm transition-all shadow-md flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
              >
                <span>
                  {submitting
                    ? (language === 'EN' ? 'Checking...' : 'तपासत आहे...')
                    : (language === 'EN' ? 'Login' : 'प्रवेश करा')}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>

              {/* Security Footer Notice */}
              <div className="mt-5 p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-100 text-slate-700 text-[11px] font-bold flex items-start space-x-3">
                <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="text-slate-900 font-extrabold block">
                    {language === 'EN' ? 'Authorized administrators only.' : 'फक्त अधिकृत प्रशासकांनाच प्रवेश आहे.'}
                  </span>
                  <span className="text-slate-500 font-medium">
                    {language === 'EN' ? 'New registration is disabled. Please login directly.' : 'नवीन नोंदणी बंद आहे. थेट लॉगिन करा.'}
                  </span>
                </div>
              </div>
            </form>
          </div>
        </div>

      </div>

      {/* Page Bottom Copyright Footer */}
      <div className="text-center text-xs text-slate-400 font-bold py-2 z-10">
        © {new Date().getFullYear()} {t.appName} • {language === 'EN' ? 'All rights reserved' : 'सर्व हक्क सुरक्षित'}
      </div>
    </div>
  );
};
