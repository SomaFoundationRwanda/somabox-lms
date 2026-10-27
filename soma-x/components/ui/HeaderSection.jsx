'use client';

import { ChevronRight } from 'lucide-react';
import { useContext } from 'react';
import DataContext from '@/context/DataContext';
import { useLanguage } from '@/context/LanguageContext';
import { Heading, Text } from '@/components/typography';

import { Button } from './button';
import NotificationBellDrawer from '../notifications/NotificationBellDrawer';

const HeaderSection = ({
  title,
  subtitle,
  breadcrumbs,
  onBreadcrumbClick
}) => {
  const { t } = useLanguage();
  // Guests (exploring without an account) have no notifications.
  const { authenticated } = useContext(DataContext) || {};

  return (
    <div>
      {/* Main header section: dark in both modes, tinted with the school colour */}
      <header 
        className="dark relative min-h-[9rem] md:h-[9rem] py-6 md:py-[2%] flex flex-col justify-center text-fg border border-line-strong px-4 md:px-8 mt-2 rounded-2xl mb-4 shadow-2xl overflow-hidden"
        style={{
          background: "linear-gradient(145deg, color-mix(in srgb, var(--brand-strong) 25%, var(--surface)) 0%, color-mix(in srgb, var(--brand-strong) 15%, var(--surface)) 50%, var(--surface) 100%)",
        }}
      >
        {/* Decorative dot grid */}
        <div
            className="absolute inset-0 pointer-events-none opacity-[0.06]"
            style={{
                backgroundImage: "radial-gradient(circle, var(--fg) 1px, transparent 1px)",
                backgroundSize: "18px 18px",
            }}
        />

        {/* Glow blob */}
        <div
            className="absolute -top-10 -right-10 w-64 h-64 rounded-full blur-3xl pointer-events-none bg-brand-strong/30"
        />

        {/* Banner illustration — right side, desktop only */}
        <div className="absolute right-0 bottom-0 h-full hidden md:flex items-end pointer-events-none select-none"
          style={{ width: "280px" }}
        >
          {/* Fade mask so the image blends into the gradient */}
          <div className="absolute inset-0"
            style={{
              background: "linear-gradient(to right, color-mix(in srgb, var(--brand-strong) 15%, var(--surface)) 0%, transparent 40%, transparent 80%, var(--surface) 100%)",
            }}
          />
          <img
            src="/images/header-banner.png"
            alt={t("shell.headerSection.illustrationAlt")}
            className="h-[115%] w-auto object-contain object-bottom relative z-10 opacity-90"
            style={{ filter: "drop-shadow(0 0 20px color-mix(in srgb, var(--brand) 15%, transparent))" }}
          />
        </div>

        {/* Breadcrumbs section */}
        {breadcrumbs && breadcrumbs.length > 0 && (
          <div className="text-fg-muted rounded-t-xl flex items-center mb-4 md:mb-2 overflow-x-auto scrollbar-hide pb-1">
            <nav className="flex items-center whitespace-nowrap">
              {breadcrumbs.map((crumb, index) => (
                <div key={index} className="flex items-center shrink-0">
                  <Text as="span" tone="inherit" className="md:text-body">
                    <Button
                      variant="ghost"
                      onClick={() => onBreadcrumbClick?.(crumb.path)}
                      className="cursor-pointer hover:text-fg p-0 h-auto font-bold underline-offset-4 hover:underline transition-all ring-0 opacity-90 hover:opacity-100"
                    >
                      {crumb.name}
                    </Button>
                  </Text>
                  {index < breadcrumbs.length - 1 && (
                    <ChevronRight className="mx-1 md:mx-2 w-4 h-4 text-fg-subtle shrink-0" />
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
                <Heading level={2} variant="section" className="md:text-display leading-tight">
                  {title}
                </Heading>
                <Text variant="caption" tone="muted" className="mt-1 max-w-2xl md:text-ui">
                  {subtitle}
                </Text>
              </div>

            </div>
          </div>

          {/* Right section: notifications (the language picker is in the page header on every screen) */}
          <div className="shrink-0 w-full md:w-fit md:mr-[260px] flex items-center gap-3">
            {authenticated ? <NotificationBellDrawer /> : null}
          </div>
        </div>
      </header>

    </div>
  );
};

export default HeaderSection;
