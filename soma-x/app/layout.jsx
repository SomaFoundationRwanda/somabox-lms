import { Manrope } from "next/font/google";
import "./globals.css";
import { DataProvider } from "@/context/DataContext";
import { LanguageProvider } from "@/context/LanguageContext";
import NextTopLoader from "nextjs-toploader";

const manRope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

export const metadata = {
  title: "SomaBox Digital Library",
  description: "Offline Education For All - An initiative by Soma Foundation Rwanda",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${manRope.className} antialiased flex min-h-screen`} suppressHydrationWarning>
        <NextTopLoader color="#2E8282"/>
        <DataProvider>
          <LanguageProvider>
            {children}
          </LanguageProvider>
        </DataProvider>
      </body>
    </html>
  );

}
