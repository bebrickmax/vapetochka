import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { siteConfig } from "@/config/site";
import "./globals.css";

export const metadata: Metadata = {
  title: `${siteConfig.name} — каталог`,
  description: siteConfig.description,
  applicationName: siteConfig.name,
  appleWebApp: { capable: true, title: siteConfig.name, statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  openGraph: {
    title: `${siteConfig.name} — каталог`,
    description: siteConfig.description,
    type: "website",
    locale: "ru_RU",
  },
};

export const viewport: Viewport = {
  themeColor: "#07070c",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className="dark">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
