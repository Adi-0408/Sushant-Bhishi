import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { UserCheck, Phone, Save, Mail, User } from 'lucide-react';
import { MarathiTextInput } from '../../components/common/MarathiTextInput';

export const ProfileManager: React.FC = () => {
  const { currentAdmin, updateAdminProfile } = useAuth();
  const { showToast } = useApp();

  const [name, setName] = useState(currentAdmin?.name || '');
  const [mobile, setMobile] = useState(currentAdmin?.mobile || '');
  const [email, setEmail] = useState(currentAdmin?.email || '');

  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !mobile.trim()) return;

    setSaving(true);
    try {
      await updateAdminProfile({
        name: name.trim(),
        mobile: mobile.trim(),
        email: email.trim(),
      });
      showToast('प्रशासकाची माहिती यशस्वीपणे अपडेट झाली.', 'success');
    } catch {
      showToast('माहिती अपडेट करताना त्रुटी आली.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center space-x-2">
          <UserCheck className="w-6 h-6 text-brand-700" />
          <span>माझी माहिती (Profile)</span>
        </h2>
        <p className="text-xs text-slate-500 font-medium mt-1">
          प्रशासकाची प्रोफाइल माहिती बदला
        </p>
      </div>

      <div className="max-w-xl bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              प्रशासकाचे नाव <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <MarathiTextInput
                required
                value={name}
                onChange={(val) => setName(val)}
                placeholder="प्रशासकाचे नाव (उदा. sushant -> सुशांत)"
                className="w-full pl-4 pr-20 py-2.5 rounded-xl border border-slate-300 text-sm font-bold"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              ईमेल आयडी (Email ID) <span className="text-rose-500">*</span>
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
              मोबाईल क्रमांक <span className="text-rose-500">*</span>
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
              <span>{saving ? 'जतन होत आहे...' : 'माहिती जतन करा'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
