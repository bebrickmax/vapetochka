import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Catalog } from "@/components/Catalog";
import { siteConfig } from "@/config/site";
import { getStore, storeInfo, stores } from "@/config/stores";
import { getCatalog } from "@/lib/catalog";
import { CATALOG_VERSION_META } from "@/lib/sheets/version";

export function generateStaticParams() {
  return stores.map((store) => ({ store: store.id }));
}

export async function generateMetadata({ params }: PageProps<"/[store]">): Promise<Metadata> {
  const store = getStore((await params).store);
  if (!store) return {};
  return { title: `${siteConfig.displayName} — ${store.title}` };
}

export default async function StorePage({ params }: PageProps<"/[store]">) {
  const store = getStore((await params).store);
  if (!store) notFound();
  const catalog = await getCatalog(store.id);
  return (
    <>
      {/* Версия таблицы, из которой собрана страница: по ней автообновление видит, что пересобирать нечего. */}
      {catalog.version && <meta name={CATALOG_VERSION_META} content={catalog.version} />}
      <Catalog catalog={catalog} store={storeInfo(store)} />
    </>
  );
}
