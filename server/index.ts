import { serveStatic } from "hono/bun";
import fs from "fs";
import path from "path";
import { app } from "./app";
import { initializeServer } from "./runtime";

// In production, serve built frontend assets
const distPath = path.resolve(import.meta.dirname, "../dist");
if (fs.existsSync(distPath)) {
  app.use(
    "/*",
    serveStatic({ root: "./dist" })
  );

  // SPA fallback — serve index.html for non-API, non-asset routes
  app.get("*", (c) => {
    if (c.req.path.startsWith("/api/")) {
      return c.json({ error: "not found" }, 404);
    }

    const indexPath = path.join(distPath, "index.html");
    if (fs.existsSync(indexPath)) {
      const html = fs.readFileSync(indexPath, "utf-8");
      return c.html(html);
    }
    return c.text("Not found", 404);
  });
}

const PORT = parseInt(process.env.PORT || "3001", 10);

if (import.meta.main) {
  initializeServer({ port: PORT });
}

export default {
  port: PORT,
  hostname: "0.0.0.0",
  fetch: (request: Request, server?: Parameters<typeof app.fetch>[1]) => {
    initializeServer({ port: PORT });
    return app.fetch(request, server);
  },
};
