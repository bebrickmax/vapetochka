import type { Metadata, Viewport } from "next";
import { AdminApp } from "@/components/admin/AdminApp";

export const metadata: Metadata = {
  title: "Админка — Vape Точка",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#000000", width: "device-width", initialScale: 1, viewportFit: "cover" };

/** Админка: вход по паролю, наличие и цены по точкам. Вся логика — на клиенте и в /api/admin. */
export default function AdminPage() {
  return <AdminApp />;
}
