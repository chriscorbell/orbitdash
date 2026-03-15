import { Hono } from "hono";
import { getDb } from "../db";
import {
  CATEGORY_ORDER_SETTING_KEY,
  UNCATEGORIZED_CATEGORY,
  sanitizeCategoryOrder,
} from "@shared/category-order";
import type {
  CategoryOrderResponse,
  UpdateCategoryOrderPayload,
} from "@shared/types";

const settingsRouter = new Hono();

function readCategoryOrder(): string[] {
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

settingsRouter.get("/category-order", (c) => {
  const response: CategoryOrderResponse = {
    order: readCategoryOrder(),
  };

  return c.json(response);
});

settingsRouter.put("/category-order", async (c) => {
  const payload = await c.req.json<UpdateCategoryOrderPayload>();

  if (!Array.isArray(payload.order) || payload.order.some((value) => typeof value !== "string")) {
    return c.json({ error: "order must be an array of category names" }, 400);
  }

  if (payload.order.some((value) => value.trim() === UNCATEGORIZED_CATEGORY)) {
    return c.json({ error: `"${UNCATEGORIZED_CATEGORY}" cannot be manually ordered` }, 400);
  }

  const sanitizedOrder = sanitizeCategoryOrder(payload.order);
  const db = getDb();
  db.prepare(
    `INSERT INTO settings (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(CATEGORY_ORDER_SETTING_KEY, JSON.stringify(sanitizedOrder));

  const response: CategoryOrderResponse = {
    order: sanitizedOrder,
  };

  return c.json(response);
});

export default settingsRouter;
