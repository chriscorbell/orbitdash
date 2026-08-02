import { Hono } from "hono";
import { jsonError } from "../api-response";
import { parseJsonBody } from "../request-body";
import { readCategoryOrder, writeCategoryOrder } from "../services/category-order-store";
import { categoryOrderUpdateSchema, getValidationMessage } from "@shared/server-schemas";
import type { CategoryOrderResponse } from "@shared/types";

const settingsRouter = new Hono();

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
    return jsonError(c, 400, getValidationMessage(result.error));
  }

  // The schema's transform already ran sanitizeCategoryOrder
  const response: CategoryOrderResponse = {
    order: writeCategoryOrder(result.data.order),
  };

  return c.json(response);
});

export default settingsRouter;
