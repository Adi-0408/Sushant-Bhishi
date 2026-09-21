import React, { useEffect, useState } from 'react';

interface SplashScreenProps {
  onFinish?: () => void;
  appName?: string;
  tagline?: string;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  onFinish,
  appName = 'सुषांत भिशी',
  tagline = 'विश्वासाची साथ, समृद्धीची वाट',
}) => {
  const [isExiting, setIsExiting] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    // Check for prefers-reduced-motion
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mediaQuery.matches) {
      setReducedMotion(true);
      const timer = setTimeout(() => {
        if (onFinish) onFinish();
      }, 1200);
      return () => clearTimeout(timer);
    }

    // Normal ~3.3s sequence timing:
    // At 3.0s: Start exit transition (opacity 0, translateY -24px over 0.6s)
    const exitTimer = setTimeout(() => {
      setIsExiting(true);
    }, 3000);

    // At 3.6s: Complete sequence and notify parent to unmount/reveal app
    const finishTimer = setTimeout(() => {
      if (onFinish) onFinish();
    }, 3600);

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(finishTimer);
    };
  }, [onFinish]);

  // Helper to split Devanagari text into grapheme clusters so matras stay attached to base consonants
  const getGraphemes = (text: string): string[] => {
    if (!text) return [];
    try {
      const IntlObj = Intl as Record<string, any>;
      if (typeof IntlObj !== 'undefined' && IntlObj.Segmenter) {
        const segmenter = new IntlObj.Segmenter('mr', { granularity: 'grapheme' });
        return Array.from(segmenter.segment(text)).map((s: any) => s.segment);
      }
    } catch {
      // ignore
    }
    return (
      text.match(/[\u0900-\u097F][\u0900-\u0903\u093A-\u094F\u0951-\u0957\u0962-\u0963]*|\s|./g) ||
      text.split('')
    );
  };

  const appNameClusters = getGraphemes(appName);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden select-none no-print ${
        isExiting ? 'animate-splash-exit' : ''
      }`}
      style={{
        background: 'linear-gradient(150deg, #0B5C45 0%, #0F7A5C 55%, #12946E 100%)',
      }}
    >
      {/* Decorative Blob 1 (Top-Left, White Tint) */}
      <div
        className={`absolute -top-20 -left-20 w-80 h-80 rounded-full pointer-events-none ${
          reducedMotion ? 'opacity-100' : 'animate-fade-in'
        }`}
        style={{
          background: 'radial-gradient(circle, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 70%)',
          filter: 'blur(40px)',
        }}
      />

      {/* Decorative Blob 2 (Bottom-Right, Gold Tint) */}
      <div
        className={`absolute -bottom-20 -right-20 w-96 h-96 rounded-full pointer-events-none ${
          reducedMotion ? 'opacity-100' : 'animate-fade-in'
        }`}
        style={{
          background: 'radial-gradient(circle, rgba(200,154,46,0.16) 0%, rgba(200,154,46,0) 70%)',
          filter: 'blur(50px)',
        }}
      />

      {/* Logo Container with Pulse Rings */}
      <div className="relative flex items-center justify-center mb-6">
        {!reducedMotion && (
          <>
            {/* Expanding Pulse Ring 1 */}
            <div
              className="absolute w-[88px] h-[88px] rounded-[24px] border-2 border-white/55 pointer-events-none animate-pulse-ring-1"
            />
            {/* Expanding Pulse Ring 2 */}
            <div
              className="absolute w-[88px] h-[88px] rounded-[24px] border-2 border-white/55 pointer-events-none animate-pulse-ring-2"
            />
          </>
        )}

        {/* 88x88px Logo Mark - Official Bank Emblem Badge */}
        <div
          className={`w-[88px] h-[88px] bg-[#0F4A3C] border-2 border-[#2F9E6E] rounded-[24px] shadow-2xl p-2 flex items-center justify-center relative z-10 ${
            reducedMotion ? 'opacity-100 scale-100 rotate-0' : 'opacity-0 animate-logo-bounce'
          }`}
        >
          <svg viewBox="0 0 160 160" className="w-full h-full">
            <circle cx="80" cy="80" r="80" fill="#0f4a3c"/>
            <circle cx="80" cy="80" r="66" fill="none" stroke="#2f9e6e" strokeWidth="4"/>
            <rect x="45" y="55" width="9" height="45" fill="#ffffff"/>
            <rect x="61" y="55" width="9" height="45" fill="#ffffff"/>
            <rect x="77" y="55" width="9" height="45" fill="#ffffff"/>
            <rect x="93" y="55" width="9" height="45" fill="#ffffff"/>
            <rect x="109" y="55" width="9" height="45" fill="#ffffff"/>
            <polygon points="80,30 115,50 45,50" fill="#ffffff"/>
            <rect x="42" y="103" width="76" height="8" fill="#ffffff"/>
          </svg>
        </div>
      </div>

      {/* Staggered App Name Reveal */}
      <div className="flex items-center space-x-1 mb-2 h-9 overflow-hidden">
        {appNameClusters.map((cluster, index) => (
          <span
            key={index}
            className={`inline-block ${reducedMotion ? 'opacity-100' : 'opacity-0 animate-letter-reveal'}`}
            style={{
              fontFamily: "'Tiro Devanagari Marathi', 'Noto Sans Devanagari', serif",
              fontSize: '26px',
              fontWeight: 400,
              color: '#FFFFFF',
              animationDelay: reducedMotion ? '0s' : `${0.85 + index * 0.06}s`,
              whiteSpace: cluster === ' ' ? 'pre' : 'normal',
            }}
          >
            {cluster === ' ' ? '\u00A0' : cluster}
          </span>
        ))}
      </div>

      {/* Tagline Text */}
      <p
        className={`mb-8 ${reducedMotion ? 'opacity-100' : 'opacity-0 animate-fade-in-up'}`}
        style={{
          fontFamily: "'Manrope', sans-serif",
          fontSize: '12px',
          fontWeight: 600,
          color: 'rgba(255,255,255,0.78)',
          animationDelay: reducedMotion ? '0s' : '1.5s',
          letterSpacing: '0.02em',
        }}
      >
        {tagline}
      </p>

      {/* Progress Bar (120px wide, 3px tall) */}
      {!reducedMotion && (
        <div
          className="w-[120px] h-[3px] bg-white/25 rounded-full overflow-hidden opacity-0 animate-fade-in"
          style={{ animationDelay: '1.7s' }}
        >
          <div
            className="h-full bg-[#C89A2E] rounded-full w-0 animate-progress-fill"
            style={{ animationDelay: '1.8s' }}
          />
        </div>
      )}
    </div>
  );
};
