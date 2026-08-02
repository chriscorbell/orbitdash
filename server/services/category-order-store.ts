import { CATEGORY_ORDER_SETTING_KEY, sanitizeCategoryOrder } from "@shared/category-order";
import { getDb } from "../db";

export function readCategoryOrder(): string[] {
  const db = getDb();
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(CATEGORY_ORDER_SETTING_KEY) as { value: string } | null;

  if (!row) {
    return [];
  }

  try {
    const parsed = JSON.parse(row.value);
    if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== "string")) {
      return [];
    }
    return sanitizeCategoryOrder(parsed);
  } catch {
    return [];
  }
}

export function writeCategoryOrder(order: readonly string[]): string[] {
  const sanitizedOrder = sanitizeCategoryOrder(order);
  const db = getDb();
  db.prepare(
    `INSERT INTO settings (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(CATEGORY_ORDER_SETTING_KEY, JSON.stringify(sanitizedOrder));

  return sanitizedOrder;
}
