import { Hono } from "hono";
import { importApplyRequestSchema, importPreviewRequestSchema } from "@shared/import-schemas";
import { jsonError } from "../api-response";
import { ImportFormatError } from "../importers/formats";
import { applyImport, previewImport } from "../importers/service";
import { readValidatedJson } from "../request-body";

const importRouter = new Hono();

/** POST /api/import/preview — { content } of a Homepage, Dashy, Homer, Homarr or bookmarks file */
importRouter.post("/preview", async (c) => {
  const body = await readValidatedJson(c, importPreviewRequestSchema);
  if (body.response) return body.response;
  try {
    return c.json(await previewImport(body.data.content));
  } catch (error) {
    if (error instanceof ImportFormatError) return jsonError(c, 400, error.message);
    throw error;
  }
});

/** POST /api/import/apply — { services } picked from a preview, each with its category */
importRouter.post("/apply", async (c) => {
  const body = await readValidatedJson(c, importApplyRequestSchema);
  if (body.response) return body.response;
  return c.json(await applyImport(body.data.services));
});

export default importRouter;
