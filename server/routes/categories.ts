import { Hono } from "hono";
import { categoryRenameSchema, getValidationMessage } from "@shared/server-schemas";
import { jsonError, respondApiResult } from "../api-response";
import { parseJsonBody } from "../request-body";
import { renameCategory } from "../services/category-operations";

const categoriesRouter = new Hono();

/** POST /api/categories/rename */
categoriesRouter.post("/rename", async (c) => {
  const parsedBody = await parseJsonBody(c.req.raw);
  if (!parsedBody.success) {
    return jsonError(c, parsedBody.status ?? 400, parsedBody.error ?? "invalid request body");
  }

  const result = categoryRenameSchema.safeParse(parsedBody.data);
  if (!result.success) {
    return jsonError(c, 400, getValidationMessage(result.error));
  }

  return respondApiResult(c, renameCategory(result.data.from, result.data.to));
});

export default categoriesRouter;
