import localFont from "next/font/local";
import "./globals.css";
import { DataProvider } from "@/context/DataContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { ToastProvider } from "@/context/ToastContext";
import NextTopLoader from "nextjs-toploader";

// Self-hosted from public/fonts/poppins/ instead of next/font/google.
// SomaBox is an offline-first app, and next/font/google needs a one-time
// network fetch from fonts.googleapis.com at BUILD time to self-host the
// files — that fetch silently fails (falls back to a system font, no error)
// in any build environment without outbound access to Google, which is
// exactly the kind of environment this app is meant to be built/deployed
// in. Vendoring the .woff2 files directly removes that dependency entirely;
// builds no longer need network access at all to get Poppins.
//
// No 900 (Black) weight on purpose: Manrope (the previous typeface) tops
// out at 800 (Extra Bold), so every existing `font-black` (font-weight:900)
// usage across the app was always silently clamping to 800. Poppins does
// ship a true 900, and loading it made those same headings render visibly
// heavier than the design was ever tuned for. Omitting 900 keeps the browser
// falling back to the nearest loaded weight (800), preserving the original
// look without having to touch every `font-black` usage individually.
const poppins = localFont({
  variable: "--font-poppins",
  display: "swap",
  src: [
    { path: "../public/fonts/poppins/poppins-400.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/poppins/poppins-500.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/poppins/poppins-600.woff2", weight: "600", style: "normal" },
    { path: "../public/fonts/poppins/poppins-700.woff2", weight: "700", style: "normal" },
    { path: "../public/fonts/poppins/poppins-800.woff2", weight: "800", style: "normal" },
  ],
});

export const metadata = {
  title: "SomaBox Digital Library",
  description: "Offline Education For All - An initiative by Soma Foundation Rwanda",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${poppins.className} antialiased flex min-h-screen`} suppressHydrationWarning>
        <NextTopLoader color="#2E8282"/>
        <DataProvider>
          <LanguageProvider>
            <ToastProvider>
              {children}
            </ToastProvider>
          </LanguageProvider>
        </DataProvider>
      </body>
    </html>
  );

}
