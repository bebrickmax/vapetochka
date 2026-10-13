import { itemTitle } from "@/lib/db/import";
import type { DbCategory, DbItem, DbLine, DbStock } from "@/lib/db/types";
import { applyOverrides, num, sheetInStock, type SheetInfo, type SheetOverride } from "@/lib/overrides";
import { toProduct } from "@/lib/products";
import type { Catalog } from "@/lib/types";

/** Строка наличия в админке: для точки «от таблицы» — со значениями таблицы рядом. */
export type AdminStock = DbStock & { sheet?: SheetInfo };

/** Товары точки «от таблицы» в том же виде, что и база, — админка показывает их теми же экранами. */
export interface SheetData {
  categories: DbCategory[];
  lines: DbLine[];
  items: DbItem[];
  stock: AdminStock[];
  /** Сколько сейчас действует правок поверх таблицы. */
  overrides: number;
}

export function sheetAdminData(catalog: Catalog, overrides: SheetOverride[]): SheetData {
  const { groups: effective, active } = applyOverrides(catalog.groups, overrides);
  const categories = catalog.categories.map<DbCategory>((c, index) => ({ id: c.id, title: c.title, sort: index }));
  const lines: DbLine[] = [];
  const items: DbItem[] = [];
  const stock: AdminStock[] = [];

  catalog.groups.forEach((group, lineIndex) => {
    lines.push({
      id: group.id,
      category_id: group.categoryId,
      brand: group.family ?? group.brand ?? null,
      section: group.section ?? null,
      name: group.line,
      note: group.note ?? null,
      image_url: group.image ?? null,
      sort: lineIndex,
    });
    group.items.forEach((item, index) => {
      const id = toProduct(group, index).id;
      const now = effective[lineIndex].items[index];
      const flags = active.get(id);
      items.push({
        id,
        line_id: group.id,
        title: itemTitle(item),
        variant: item.variant ?? null,
        image_url: item.image && item.image !== group.image ? item.image : null,
        sort: index,
      });
      stock.push({
        item_id: id,
        store_id: catalog.storeId,
        price: num(now.price),
        old_price: item.oldPrice ?? null,
        in_stock: sheetInStock(now.status),
        sheet: {
          inStock: sheetInStock(item.status),
          price: num(item.price),
          stockOverridden: !!flags?.stock,
          priceOverridden: !!flags?.price,
        },
      });
    });
  });

  return { categories, lines, items, stock, overrides: active.size };
}
