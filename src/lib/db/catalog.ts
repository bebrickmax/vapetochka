import { assignFamilies } from "@/lib/brands";
import { categoryFromSheet } from "@/lib/sheets/categories";
import { parseStrength, splitItemName } from "@/lib/sheets/parse";
import type { Catalog, Category, ProductGroup, ProductItem } from "@/lib/types";
import { selectAll } from "./supabase";
import { toPrice, type DbCategory, type DbItem, type DbLine, type DbSnapshot, type DbStock } from "./types";

const bySort = <T extends { sort: number }>(a: T, b: T) => a.sort - b.sort;

/** Весь каталог из базы (все точки) — для витрины и админки. */
export async function loadSnapshot(): Promise<DbSnapshot> {
  const [categories, lines, items, stock] = await Promise.all([
    // Порядок с уникальным хвостом (id): иначе страницы по 1000 строк могут пересекаться и терять строки.
    selectAll<DbCategory>("categories", { order: "sort.asc,id.asc" }),
    selectAll<DbLine>("product_lines", { order: "sort.asc,id.asc" }),
    selectAll<DbItem>("items", { order: "sort.asc,id.asc" }),
    selectAll<DbStock>("item_stock", { order: "item_id.asc,store_id.asc" }),
  ]);
  return { categories, lines, items, stock };
}

/** Категория витрины: название и иконка — как у известных листов, иначе из базы. */
function toCategory(row: DbCategory): Category {
  const known = categoryFromSheet(row.title);
  return { id: row.id, title: row.title, icon: known.icon, sheetTitle: row.title };
}

/**
 * Каталог одной точки из строк базы. В точку попадают только позиции,
 * у которых есть строка наличия для этой точки. Пустые линейки и категории скрыты.
 */
export function catalogFromSnapshot(snapshot: DbSnapshot, storeId: string): Catalog {
  const stockByItem = new Map<string, DbStock>();
  for (const row of snapshot.stock) if (row.store_id === storeId) stockByItem.set(row.item_id, row);

  const itemsByLine = new Map<string, DbItem[]>();
  for (const item of [...snapshot.items].sort(bySort)) {
    if (!stockByItem.has(item.id)) continue;
    const list = itemsByLine.get(item.line_id);
    if (list) list.push(item);
    else itemsByLine.set(item.line_id, [item]);
  }

  const categories: Category[] = [];
  const groups: ProductGroup[] = [];

  for (const categoryRow of [...snapshot.categories].sort(bySort)) {
    const lines = snapshot.lines
      .filter((line) => line.category_id === categoryRow.id && itemsByLine.has(line.id))
      .sort(bySort);
    if (lines.length === 0) continue;
    categories.push(toCategory(categoryRow));

    const parsed = lines.map((line) => {
      const items: ProductItem[] = itemsByLine.get(line.id)!.map((item) => {
        const stock = stockByItem.get(item.id)!;
        const price = toPrice(stock.price);
        // Старая цена из таблицы осталась, а цену поменяли в админке — зачёркивать уже нечего.
        const oldPrice = toPrice(stock.old_price);
        const discounted = oldPrice !== null && price !== null && oldPrice > price;
        return {
          ...splitItemName(item.title),
          ...(item.variant && { variant: item.variant }),
          price,
          ...(discounted && { oldPrice }),
          status: stock.in_stock ? "in" : "out",
          ...(item.image_url && { image: item.image_url }),
        };
      });
      const strength = parseStrength(line.name);
      const image = line.image_url ?? items.find((i) => i.image)?.image;
      return {
        line,
        group: {
          categoryId: categoryRow.id,
          line: line.name,
          ...(line.brand && { brand: line.brand }),
          ...(line.section && { section: line.section }),
          ...(strength && { strength }),
          ...(line.note && { note: line.note }),
          ...(image && { image }),
          items,
        },
      };
    });

    // Бренд для фильтра: из базы, а если не указан — по названию (как раньше с таблицей).
    const families = assignFamilies(parsed.map((p) => p.group));
    parsed.forEach(({ line, group }, index) => {
      groups.push({ ...group, id: `${categoryRow.id}-${line.id.slice(0, 8)}`, family: families[index] });
    });
  }

  return { storeId, categories, groups, updatedAt: new Date().toISOString(), source: "db" };
}
