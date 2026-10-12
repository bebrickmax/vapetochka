import type { Metadata, Viewport } from "next";
import { Manrope, Unbounded } from "next/font/google";
import type { ReactNode } from "react";
import { Intro, INTRO_SCRIPT } from "@/components/Intro";
import { siteConfig } from "@/config/site";
import "./globals.css";

/** Широкий геометрический шрифт — перекликается с надписью VAPE ТОЧКА на логотипе. */
const wide = Unbounded({ subsets: ["latin", "cyrillic"], variable: "--font-wide", display: "swap" });
const body = Manrope({ subsets: ["latin", "cyrillic"], variable: "--font-body", display: "swap" });

const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "https://vapetochka.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: `${siteConfig.displayName} — каталог`,
  description: siteConfig.description,
  applicationName: siteConfig.displayName,
  appleWebApp: { capable: true, title: siteConfig.displayName, statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  openGraph: {
    title: `${siteConfig.displayName} — каталог`,
    description: siteConfig.description,
    type: "website",
    locale: "ru_RU",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: скрипт заставки добавляет класс no-intro до загрузки React.
    <html lang="ru" className={`dark ${wide.variable} ${body.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: INTRO_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <Intro />
        {children}
      </body>
    </html>
  );
}
