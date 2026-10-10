import { Hono } from "hono";
import { jsonError } from "../api-response";
import { writeLog } from "../observability";
import { iconLibrary, MAX_RESULTS } from "../services/icon-library";

const iconLibraryRouter = new Hono();

/** GET /api/icon-library?q=plex&limit=24 — icons from dashboard-icons and selfh.st */
iconLibraryRouter.get("/", async (c) => {
  const query = (c.req.query("q") ?? "").slice(0, 100);
  const limit = Math.max(1, Math.min(MAX_RESULTS, Number(c.req.query("limit")) || 48));
  try {
    return c.json(await iconLibrary.search(query, limit));
  } catch (error) {
    writeLog("warn", "icon-library.unavailable", {
      message: error instanceof Error ? error.message : String(error),
    });
    return jsonError(c, 503, "The icon library is unavailable right now");
  }
});

export default iconLibraryRouter;
