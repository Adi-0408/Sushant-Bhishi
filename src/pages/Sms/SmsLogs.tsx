import React from 'react';
import { MessageSquare } from 'lucide-react';

export const SmsLogs: React.FC = () => {

  const templates = [
    {
      title: 'देय तारखेच्या २ दिवस आधी',
      sample: 'नमस्कार [नाव], तुमची [भिशी] रक्कम ₹[रक्कम] दिनांक [तारीख] रोजी देय आहे.',
    },
    {
      title: 'देय तारखेला',
      sample: 'नमस्कार [नाव], तुमची ₹[रक्कम] भिशी रक्कम आज देय आहे.',
    },
    {
      title: 'रक्कम बाकी असल्यास',
      sample: 'नमस्कार [नाव], तुमची ₹[बाकी] रक्कम बाकी आहे. कृपया रक्कम जमा करावी.',
    },
    {
      title: 'दंड लागल्यास',
      sample: 'नमस्कार [नाव], तुमच्या खात्यावर ₹[दंड] दंड लागू झाला आहे. सध्या एकूण बाकी ₹[रक्कम] आहे.',
    },
    {
      title: 'रक्कम जमा झाल्यावर',
      sample: 'नमस्कार [नाव], तुमची ₹[रक्कम] रक्कम जमा झाली आहे. तुमच्या खात्यावर सध्या ₹[बाकी] बाकी आहे.',
    },
    {
      title: 'कर्ज असल्यास',
      sample: 'नमस्कार [नाव], तुमच्या कर्जाची ₹[रक्कम] बाकी आहे.',
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center space-x-2">
          <MessageSquare className="w-6 h-6 text-purple-600" />
          <span>एसएमएस नोंद (SMS Service Logs)</span>
        </h2>
        <p className="text-xs text-slate-500 font-medium mt-1">
          पाठवलेल्या संदेशांचा इतिहास व स्वयंचलित टेम्पलेट्स
        </p>
      </div>

      {/* SMS Templates Preview Section - Requirements 20 & 21 */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <h3 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-3">
          स्वयंचलित एसएमएस टेम्पलेट्स (Auto SMS Templates)
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
