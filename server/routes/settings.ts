import { Hono } from "hono";
import { getDb } from "../db";
import { jsonError } from "../api-response";
import { parseJsonBody } from "../request-body";
import { CATEGORY_ORDER_SETTING_KEY, sanitizeCategoryOrder } from "@shared/category-order";
import { categoryOrderUpdateSchema, getValidationMessage } from "@shared/server-schemas";
import type { CategoryOrderResponse } from "@shared/types";

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
  const parsedBody = await parseJsonBody(c.req.raw);
  if (!parsedBody.success) {
    return jsonError(c, parsedBody.status ?? 400, parsedBody.error ?? "invalid request body");
  }

  const result = categoryOrderUpdateSchema.safeParse(parsedBody.data);

  if (!result.success) {
    const hasOrderTypeError = result.error.issues.some((issue) => issue.path[0] === "order");

    if (
      hasOrderTypeError &&
      result.error.issues[0]?.message !== '"Uncategorized" cannot be manually ordered'
    ) {
      return jsonError(c, 400, "order must be an array of category names");
    }

    return jsonError(c, 400, getValidationMessage(result.error));
  }

  const payload = result.data;

  if (!Array.isArray(payload.order) || payload.order.some((value) => typeof value !== "string")) {
    return jsonError(c, 400, "order must be an array of category names");
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
