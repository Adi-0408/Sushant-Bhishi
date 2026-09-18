import React from 'react';
import { MessageSquare } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const SmsLogs: React.FC = () => {
  const { language } = useApp();

  const templates = [
    {
      title: language === 'EN' ? '2 Days Before Due Date' : 'देय तारखेच्या २ दिवस आधी',
      sample: language === 'EN'
        ? 'Hello [Name], your [Bishi] installment of ₹[Amount] is due on [Date].'
        : 'नमस्कार [नाव], तुमची [भिशी] रक्कम ₹[रक्कम] दिनांक [तारीख] रोजी देय आहे.',
    },
    {
      title: language === 'EN' ? 'On Due Date' : 'देय तारखेला',
      sample: language === 'EN'
        ? 'Hello [Name], your [Bishi] installment of ₹[Amount] is due today.'
        : 'नमस्कार [नाव], तुमची ₹[रक्कम] भिशी रक्कम आज देय आहे.',
    },
    {
      title: language === 'EN' ? 'Payment Overdue' : 'रक्कम बाकी असल्यास',
      sample: language === 'EN'
        ? 'Hello [Name], your overdue balance is ₹[Balance]. Please deposit the installment promptly.'
        : 'नमस्कार [नाव], तुमची ₹[बाकी] रक्कम बाकी आहे. कृपया रक्कम जमा करावी.',
    },
    {
      title: language === 'EN' ? 'Late Penalty Applied' : 'दंड लागल्यास',
      sample: language === 'EN'
        ? 'Hello [Name], a late penalty of ₹[Penalty] has been charged. Current total due: ₹[Amount].'
        : 'नमस्कार [नाव], तुमच्या खात्यावर ₹[दंड] दंड लागू झाला आहे. सध्या एकूण बाकी ₹[रक्कम] आहे.',
    },
    {
      title: language === 'EN' ? 'Payment Confirmation' : 'रक्कम जमा झाल्यावर',
      sample: language === 'EN'
        ? 'Hello [Name], deposit of ₹[Amount] received. Your remaining balance is ₹[Balance]. Thank you!'
        : 'नमस्कार [नाव], तुमची ₹[रक्कम] रक्कम जमा झाली आहे. तुमच्या खात्यावर सध्या ₹[बाकी] बाकी आहे.',
    },
    {
      title: language === 'EN' ? 'Active Loan Reminder' : 'कर्ज असल्यास',
      sample: language === 'EN'
        ? 'Hello [Name], your loan outstanding balance is ₹[Amount].'
        : 'नमस्कार [नाव], तुमच्या कर्जाची ₹[रक्कम] बाकी आहे.',
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center space-x-2">
          <MessageSquare className="w-6 h-6 text-purple-600" />
          <span>{language === 'EN' ? 'SMS Service Templates' : 'एसएमएस नोंद (SMS Service Logs)'}</span>
        </h2>
        <p className="text-xs text-slate-500 font-medium mt-1">
          {language === 'EN'
            ? 'Sent notifications history & automated customer SMS templates'
            : 'पाठवलेल्या संदेशांचा इतिहास व स्वयंचलित टेम्पलेट्स'}
        </p>
      </div>

      {/* SMS Templates Preview Section */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <h3 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-3">
          {language === 'EN' ? 'Automated SMS Templates' : 'स्वयंचलित एसएमएस टेम्पलेट्स (Auto SMS Templates)'}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((tpl, i) => (
            <div key={i} className="p-4 rounded-2xl bg-purple-50/60 border border-purple-200 space-y-2">
              <span className="text-xs font-bold text-purple-900 block">{tpl.title}</span>
              <p className="text-xs text-slate-700 font-medium bg-white p-3 rounded-xl border border-purple-100">
                "{tpl.sample}"
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
