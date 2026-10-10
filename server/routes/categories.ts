import { Hono } from "hono";
import {
  categoryCreateSchema,
  categoryRenameSchema,
  categoryReorderSchema,
  categoryUpdateSchema,
} from "@shared/server-schemas";
import { respondApiResult } from "../api-response";
import { readValidatedJson } from "../request-body";
import { renameCategory } from "../services/category-operations";
import {
  createCategory,
  deleteCategory,
  listCategories,
  renameCategoryById,
  reorderCategories,
} from "../services/category-store";

const categoriesRouter = new Hono();

/** GET /api/categories */
categoriesRouter.get("/", (c) => c.json({ categories: listCategories() }));

/** POST /api/categories — creates an (empty) category at the end */
categoriesRouter.post("/", async (c) => {
  const body = await readValidatedJson(c, categoryCreateSchema);
  if (body.response) return body.response;
  return respondApiResult(c, createCategory(body.data.name), 201);
});

/** PUT /api/categories/order — { ids } in display order */
categoriesRouter.put("/order", async (c) => {
  const body = await readValidatedJson(c, categoryReorderSchema);
  if (body.response) return body.response;
  return c.json({ categories: reorderCategories(body.data.ids) });
});

/** POST /api/categories/rename — by name; renaming onto an existing category merges them */
categoriesRouter.post("/rename", async (c) => {
  const body = await readValidatedJson(c, categoryRenameSchema);
  if (body.response) return body.response;
  return respondApiResult(c, renameCategory(body.data.from, body.data.to));
});

/** PATCH /api/categories/:id — { name } */
categoriesRouter.patch("/:id", async (c) => {
  const body = await readValidatedJson(c, categoryUpdateSchema);
  if (body.response) return body.response;
  return respondApiResult(c, renameCategoryById(c.req.param("id"), body.data.name));
});

/** DELETE /api/categories/:id — its services become uncategorized */
categoriesRouter.delete("/:id", (c) => respondApiResult(c, deleteCategory(c.req.param("id"))));

export default categoriesRouter;
