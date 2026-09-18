import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { UserCheck, Phone, Save, Mail, KeyRound, Eye, EyeOff, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { MarathiTextInput, convertTextToMarathi } from '../../components/common/MarathiTextInput';

export const ProfileManager: React.FC = () => {
  const { currentAdmin, updateAdminProfile, changePassword } = useAuth();
  const { showToast, language } = useApp();

  // Profile info state
  const [name, setName] = useState(currentAdmin?.name || '');
  const [mobile, setMobile] = useState(currentAdmin?.mobile || '');
  const [email, setEmail] = useState(currentAdmin?.email || '');
  const [saving, setSaving] = useState(false);

  // Change password state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [changingPass, setChangingPass] = useState(false);
  const [passError, setPassError] = useState('');
  const [passSuccess, setPassSuccess] = useState('');

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !mobile.trim()) return;

    setSaving(true);
    try {
      const finalName = language === 'MR' ? await convertTextToMarathi(name.trim()) : name.trim();
      await updateAdminProfile({
        name: finalName,
        mobile: mobile.trim(),
        email: email.trim(),
      });
      showToast(
        language === 'EN' ? 'Admin profile updated successfully.' : 'प्रशासकाची माहिती यशस्वीपणे अपडेट झाली.',
        'success'
      );
    } catch {
      showToast(
        language === 'EN' ? 'Error updating profile.' : 'माहिती अपडेट करताना त्रुटी आली.',
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassError('');
    setPassSuccess('');

    if (!newPassword || !confirmPassword) {
      setPassError(
        language === 'EN'
          ? 'Please enter new password and confirm password.'
          : 'कृपया नवीन पासवर्ड आणि पुष्टीकरण पासवर्ड भरा.'
      );
      return;
    }

    if (newPassword.length < 4) {
      setPassError(
        language === 'EN'
          ? 'New password must be at least 4 characters.'
          : 'नवीन पासवर्ड किमान ४ अक्षरांचा असावा.'
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setPassError(
        language === 'EN'
          ? 'New password and confirmation password do not match.'
          : 'नवीन पासवर्ड आणि पुन्हा टाकलेला पासवर्ड जुळत नाही.'
      );
      return;
    }

    setChangingPass(true);
    try {
      await changePassword(newPassword);
      setPassSuccess(
        language === 'EN'
          ? 'Password changed successfully! Use this password for future logins.'
          : 'पासवर्ड यशस्वीपणे बदलला आहे! पुढील वेळी लॉगिनसाठी हाच पासवर्ड वापरा.'
      );
      showToast(
        language === 'EN' ? 'Password updated successfully.' : 'पासवर्ड यशस्वीपणे अपडेट झाला.',
        'success'
      );
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const msg = err instanceof Error
        ? err.message
        : (language === 'EN' ? 'Failed to update password.' : 'पासवर्ड बदलताना त्रुटी आली.');
      setPassError(msg);
      showToast(msg, 'error');
    } finally {
      setChangingPass(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center space-x-2">
          <UserCheck className="w-6 h-6 text-brand-700" />
          <span>{language === 'EN' ? 'Profile & Security' : 'माझी माहिती व सुरक्षा (Profile & Security)'}</span>
        </h2>
        <p className="text-xs text-slate-500 font-medium mt-1">
          {language === 'EN'
            ? 'Update administrator profile information and change login password'
            : 'प्रशासकाची प्रोफाइल माहिती बदला आणि सुरक्षा पासवर्ड अपडेट करा'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Profile Card */}
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center space-x-3 pb-3 border-b border-slate-100">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">
                {language === 'EN' ? 'Administrator Details' : 'प्रशासक तपशील'}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {language === 'EN' ? 'Name, Email ID, and Mobile Number' : 'नाव, ईमेल आणि मोबाईल क्रमांक'}
              </p>
            </div>
          </div>

          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {language === 'EN' ? 'Administrator Name' : 'प्रशासकाचे नाव'} <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <MarathiTextInput
                  required
                  value={name}
                  onChange={(val) => setName(val)}
                  placeholder={language === 'EN' ? 'Admin Name (e.g. Sushant)' : 'प्रशासकाचे नाव (उदा. sushant -> सुशांत)'}
                  className="w-full pl-4 pr-20 py-2.5 rounded-xl border border-slate-300 text-sm font-bold"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {language === 'EN' ? 'Email Address' : 'ईमेल आयडी (Email ID)'} <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Mail className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="sushant@gmail.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm font-bold"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {language === 'EN' ? 'Mobile Number' : 'मोबाईल क्रमांक'} <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Phone className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
                <input
                  type="tel"
                  required
                  maxLength={10}
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm font-bold"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100">
              <button
                type="submit"
                disabled={saving}
                className="w-full min-h-[44px] py-3 rounded-xl bg-brand-900 text-white font-extrabold text-sm hover:bg-brand-800 transition-colors shadow-md flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-5 h-5" />
                <span>
                  {saving
                    ? (language === 'EN' ? 'Saving...' : 'जतन होत आहे...')
                    : (language === 'EN' ? 'Save Profile' : 'माहिती जतन करा')}
                </span>
              </button>
            </div>
          </form>
        </div>

        {/* Change Password Card */}
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center space-x-3 pb-3 border-b border-slate-100">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">
                {language === 'EN' ? 'Change Password' : 'पासवर्ड बदला (Change Password)'}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {language === 'EN' ? 'Set a new password to keep account secure' : 'खाते सुरक्षित ठेवण्यासाठी नवीन पासवर्ड सेट करा'}
              </p>
            </div>
          </div>

          {passSuccess && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>{passSuccess}</span>
            </div>
          )}

          {passError && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center space-x-2">
              <span>⚠️ {passError}</span>
            </div>
          )}

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {language === 'EN' ? 'New Password' : 'नवीन पासवर्ड (New Password)'} <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={language === 'EN' ? 'Enter new password (min 4 chars)' : 'नवीन पासवर्ड टाका (किमान ४ अक्षरे)'}
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-2 top-2 p-1.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  aria-label={language === 'EN' ? 'Toggle password visibility' : 'नवीन पासवर्ड दाखवा/लपवा'}
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {language === 'EN' ? 'Confirm New Password' : 'नवीन पासवर्ड पुन्हा टाका (Confirm New Password)'} <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <ShieldCheck className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={language === 'EN' ? 'Re-enter new password' : 'नवीन पासवर्ड पुन्हा लिहा'}
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-2 top-2 p-1.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  aria-label={language === 'EN' ? 'Toggle password visibility' : 'पुन्हा पासवर्ड दाखवा/लपवा'}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-xs font-medium">
              💡 <strong>{language === 'EN' ? 'Note:' : 'टीप:'}</strong> {language === 'EN' ? 'Once changed, this new password will be required for all future logins.' : 'पासवर्ड बदलल्यानंतर पुढील सर्व लॉगिनसाठी हाच नवीन पासवर्ड वापरला जाईल.'}
            </div>

            <div className="pt-3 border-t border-slate-100">
              <button
                type="submit"
                disabled={changingPass}
                className="w-full min-h-[44px] py-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-sm transition-colors shadow-md flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
              >
                <KeyRound className="w-5 h-5" />
                <span>
                  {changingPass
                    ? (language === 'EN' ? 'Updating Password...' : 'पासवर्ड बदलत आहे...')
                    : (language === 'EN' ? 'Update Password' : 'पासवर्ड अपडेट करा')}
                </span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
