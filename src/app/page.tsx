import { Catalog } from "@/components/Catalog";
import { getCatalog } from "@/lib/catalog";

export default async function HomePage() {
  const catalog = await getCatalog();
  return <Catalog catalog={catalog} />;
}
