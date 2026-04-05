import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import fs from "fs";
import path from "path";
import metricsRouter from "./routes/metrics";
import settingsRouter from "./routes/settings";
import servicesRouter, { getIconsDir } from "./routes/services";
import { startCollection, stopCollection } from "./metrics";
import { closeDb, getDataDir, initializeDb, isDbHealthy } from "./db";

interface InitializeServerOptions {
  dataDir?: string;
  dbPath?: string;
  logStartup?: boolean;
  registerSignalHandlers?: boolean;
  startMetrics?: boolean;
}

const app = new Hono();
let runtimeInitialized = false;
let signalHandlersRegistered = false;

function createHealthPayload(status: "ok" | "error") {
  return {
    status,
    service: "orbitdash",
    observedAt: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  };
}

function respondWithHealth(c: Context, statusCode: 200 | 503, payload: Record<string, unknown>) {
  c.header("Cache-Control", "no-store, no-cache, must-revalidate");
  return c.json(payload, statusCode);
}

app.onError((error, c) => {
  console.error(error);
  return c.json({ error: "internal server error" }, 500);
});

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) {
    return c.json({ error: "not found" }, 404);
  }

  return c.text("Not found", 404);
});

// CORS for development
app.use("/api/*", cors());

app.get("/healthz", (c) => {
  return respondWithHealth(c, 200, createHealthPayload("ok"));
});

app.get("/readyz", (c) => {
  const databaseHealthy = isDbHealthy();

  return respondWithHealth(
    c,
    databaseHealthy ? 200 : 503,
    {
      ...createHealthPayload(databaseHealthy ? "ok" : "error"),
      checks: {
        database: databaseHealthy ? "ok" : "error",
      },
    }
  );
});

// API routes
app.route("/api/metrics", metricsRouter);
app.route("/api/settings", settingsRouter);
app.route("/api/services", servicesRouter);
app.get("/api/health", (c) => {
  const databaseHealthy = isDbHealthy();

  return respondWithHealth(
    c,
    databaseHealthy ? 200 : 503,
    {
      ...createHealthPayload(databaseHealthy ? "ok" : "error"),
      checks: {
        database: databaseHealthy ? "ok" : "error",
      },
    }
  );
});

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

export function shutdown() {
  stopCollection();
  closeDb();
  runtimeInitialized = false;
}

function registerSignalHandlers() {
  if (signalHandlersRegistered) {
    return;
  }

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  signalHandlersRegistered = true;
}

export function initializeServer(options: InitializeServerOptions = {}) {
  if (runtimeInitialized) {
    return;
  }

  initializeDb({
    dataDir: options.dataDir,
    dbPath: options.dbPath,
  });

  if (options.startMetrics !== false) {
    startCollection();
  }

  if (options.registerSignalHandlers !== false) {
    registerSignalHandlers();
  }

  if (options.logStartup !== false) {
    console.log(`🚀 orbitdash server starting on port ${PORT}`);
    console.log(`📁 Data directory: ${getDataDir()}`);
  }

  runtimeInitialized = true;
}

const PORT = parseInt(process.env.PORT || "3001", 10);

if (import.meta.main) {
  initializeServer();
}

export { app };

export default {
  port: PORT,
  hostname: "0.0.0.0",
  fetch: (request: Request, server?: Parameters<typeof app.fetch>[1]) => {
    initializeServer();
    return app.fetch(request, server);
  },
};
