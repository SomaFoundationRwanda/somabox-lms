'use client';

import { Globe, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import Typography from './Typography';
import Input from './input';
import { Button } from './button';
import NotificationBellDrawer from '../notifications/NotificationBellDrawer';

const HeaderSection = ({
  title,
  subtitle,
  breadcrumbs,
  onBreadcrumbClick
}) => {
  const { t, lang, setLang } = useLanguage();
  const [showLangMenu, setShowLangMenu] = useState(false);

  const languages = ["en", "fr", "rw", "sw", "es"];

  return (
    <div>
      {/* Main header section */}
      <header 
        className="relative min-h-[9rem] md:h-[9rem] py-6 md:py-[2%] flex flex-col justify-center text-white px-4 md:px-8 mt-2 rounded-2xl mb-4 shadow-2xl overflow-hidden"
        style={{
          background: "linear-gradient(145deg, #0d2020 0%, #112828 50%, #0a1a1a 100%)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        {/* Decorative dot grid */}
        <div
            className="absolute inset-0 pointer-events-none opacity-[0.06]"
            style={{
                backgroundImage: "radial-gradient(circle, rgba(255,255,255,1) 1px, transparent 1px)",
                backgroundSize: "18px 18px",
            }}
        />

        {/* Glow blob */}
        <div
            className="absolute -top-10 -right-10 w-64 h-64 rounded-full blur-3xl pointer-events-none"
            style={{ backgroundColor: "rgba(32,58,58,0.6)" }}
        />

        {/* Banner illustration — right side, desktop only */}
        <div className="absolute right-0 bottom-0 h-full hidden md:flex items-end pointer-events-none select-none"
          style={{ width: "280px" }}
        >
          {/* Fade mask so the image blends into the gradient */}
          <div className="absolute inset-0"
            style={{
              background: "linear-gradient(to right, #0d2020 0%, transparent 40%, transparent 80%, #0a1a1a 100%)",
            }}
          />
          <img
            src="/images/header-banner.png"
            alt="Learning illustration"
            className="h-[115%] w-auto object-contain object-bottom relative z-10 opacity-90"
            style={{ filter: "drop-shadow(0 0 20px rgba(32,180,180,0.15))" }}
          />
        </div>

        {/* Breadcrumbs section */}
        {breadcrumbs && breadcrumbs.length > 0 && (
          <div className="text-white/80 rounded-t-xl flex items-center mb-4 md:mb-2 overflow-x-auto scrollbar-hide pb-1">
            <nav className="flex items-center whitespace-nowrap">
              {breadcrumbs.map((crumb, index) => (
                <div key={index} className="flex items-center shrink-0">
                  <Typography variant="titleInv" className="text-sm md:text-base">
                    <Button
                      variant="ghost"
                      onClick={() => onBreadcrumbClick?.(crumb.path)}
                      className="cursor-pointer hover:text-white p-0 h-auto font-bold underline-offset-4 hover:underline transition-all ring-0 opacity-90 hover:opacity-100"
                    >
                      {crumb.name}
                    </Button>
                  </Typography>
                  {index < breadcrumbs.length - 1 && (
                    <ChevronRight className="mx-1 md:mx-2 w-4 h-4 text-white/40 shrink-0" />
                  )}
                </div>
              ))}
            </nav>
          </div>
        )}

        <div className="flex flex-col md:flex-row justify-between md:items-center gap-6 relative z-10">
          {/* Left section: Title, subtitle, button */}
          <div className="flex-1">
            <div className="flex flex-col gap-4">
              <div>
                <Typography variant="h2" color="white" className="text-xl md:text-4xl leading-tight">
                  {title}
                </Typography>
                <Typography variant="caption" color="white" className="opacity-80 mt-1 max-w-2xl block text-xs md:text-sm">
                  {subtitle}
                </Typography>
              </div>

            </div>
          </div>

          {/* Right section: Language selector + Notifications — pushed left of illustration */}
          <div className="shrink-0 w-full md:w-fit md:mr-[260px] flex items-center gap-3">
            <NotificationBellDrawer />
            <Input
              prefix={<Globe className="w-4 h-4 mr-2" />}
              value={lang}
              id="language-select"
              ariaLabel="Language"
              variant="select"
              options={languages.map((l) => ({ value: l, label: l.toUpperCase() }))}
              onChange={(value) => setLang(value)}
              className="bg-white/90 backdrop-blur-md text-black border-none shadow-xl h-12 w-full md:min-w-[120px] rounded-xl font-bold"
            />
          </div>
        </div>
      </header>

    </div>
  );
};

export default HeaderSection;
