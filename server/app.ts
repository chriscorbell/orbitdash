import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import fs from "fs";
import path from "path";
import metricsRouter from "./routes/metrics";
import settingsRouter from "./routes/settings";
import servicesRouter, { getIconsDir } from "./routes/services";
import { isDbHealthy } from "./db";
import { getRequestMetricsSnapshot, logOperationalError, recordRequest } from "./observability";

export const app = new Hono();

function createHealthPayload(status: "ok" | "error") {
  return {
    observability: getRequestMetricsSnapshot(),
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
  logOperationalError(error, {
    method: c.req.method,
    path: c.req.path,
  });
  return c.json({ error: "internal server error" }, 500);
});

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) {
    return c.json({ error: "not found" }, 404);
  }

  return c.text("Not found", 404);
});

app.use("/api/*", cors());

app.use("*", async (c, next) => {
  const start = Date.now();

  try {
    await next();
    recordRequest(c.req.method, c.req.path, c.res.status, Date.now() - start);
  } catch (error) {
    recordRequest(c.req.method, c.req.path, 500, Date.now() - start);
    throw error;
  }
});

app.get("/healthz", (c) => {
  return respondWithHealth(c, 200, createHealthPayload("ok"));
});

app.get("/readyz", (c) => {
  const databaseHealthy = isDbHealthy();

  return respondWithHealth(c, databaseHealthy ? 200 : 503, {
    ...createHealthPayload(databaseHealthy ? "ok" : "error"),
    checks: {
      database: databaseHealthy ? "ok" : "error",
    },
  });
});

app.route("/api/metrics", metricsRouter);
app.route("/api/settings", settingsRouter);
app.route("/api/services", servicesRouter);

app.get("/api/health", (c) => {
  const databaseHealthy = isDbHealthy();

  return respondWithHealth(c, databaseHealthy ? 200 : 503, {
    ...createHealthPayload(databaseHealthy ? "ok" : "error"),
    checks: {
      database: databaseHealthy ? "ok" : "error",
    },
  });
});

app.get("/api/icons/:filename", (c) => {
  const filename = c.req.param("filename");
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
