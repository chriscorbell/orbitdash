import { Hono } from "hono";
import fs from "fs";
import path from "path";
import { jsonError, jsonNotFound, respondApiResult } from "../api-response";
import { saveWallpaper, WALLPAPER_MIME_TYPES, wallpaperPath } from "../services/wallpaper-storage";

const wallpapersRouter = new Hono();

/** POST /api/wallpapers — multipart `file`; returns `{ filename }` to save in appearance settings */
wallpapersRouter.post("/", async (c) => {
  let file: unknown;
  try {
    file = (await c.req.formData()).get("file");
  } catch {
    return jsonError(c, 400, "expected a multipart form with a file");
  }
  if (!(file instanceof File)) {
    return jsonError(c, 400, "expected a multipart form with a file");
  }
  return respondApiResult(c, saveWallpaper(Buffer.from(await file.arrayBuffer())), 201);
});

/** GET /api/wallpapers/:filename — names are content hashes, so they cache forever */
wallpapersRouter.get("/:filename", (c) => {
  const filePath = wallpaperPath(path.basename(c.req.param("filename")));
  if (!filePath || !fs.existsSync(filePath)) {
    return jsonNotFound(c);
  }

  return new Response(Bun.file(filePath), {
    headers: {
      "Content-Type": WALLPAPER_MIME_TYPES[path.extname(filePath)] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
});

export default wallpapersRouter;
