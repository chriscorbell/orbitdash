import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import fs from "fs";
import path from "path";
import metricsRouter from "./routes/metrics";
import servicesRouter, { getIconsDir } from "./routes/services";
import { startCollection } from "./metrics";
import { getDb, getDataDir } from "./db";

const app = new Hono();

// CORS for development
app.use("/api/*", cors());

// API routes
app.route("/api/metrics", metricsRouter);
app.route("/api/services", servicesRouter);

// Serve uploaded icons
app.get("/api/icons/:filename", (c) => {
  const filename = c.req.param("filename");
  // Sanitize filename
  const safeName = path.basename(filename);
  const filePath = path.join(getIconsDir(), safeName);

  if (!fs.existsSync(filePath)) {
    return c.json({ error: "not found" }, 404);
  }

  const ext = path.extname(safeName).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
  };

  const contentType = mimeTypes[ext] || "application/octet-stream";
  const data = fs.readFileSync(filePath);

  return new Response(data, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
    },
  });
});

// In production, serve built frontend assets
const distPath = path.resolve(import.meta.dirname, "../dist");
if (fs.existsSync(distPath)) {
  app.use(
    "/*",
    serveStatic({ root: "./dist" })
  );

  // SPA fallback — serve index.html for non-API, non-asset routes
  app.get("*", (c) => {
    const indexPath = path.join(distPath, "index.html");
    if (fs.existsSync(indexPath)) {
      const html = fs.readFileSync(indexPath, "utf-8");
      return c.html(html);
    }
    return c.text("Not found", 404);
  });
}

// Initialize database
getDb();

// Start metrics collection
startCollection();

const PORT = parseInt(process.env.PORT || "3001", 10);

console.log(`🚀 orbitdash server starting on port ${PORT}`);
console.log(`📁 Data directory: ${getDataDir()}`);

export default {
  port: PORT,
  fetch: app.fetch,
};
