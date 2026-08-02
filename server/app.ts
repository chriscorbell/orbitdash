import { Hono, type Context } from "hono";
import path from "path";
import categoriesRouter from "./routes/categories";
import metricsRouter from "./routes/metrics";
import settingsRouter from "./routes/settings";
import servicesRouter from "./routes/services";
import { jsonError, jsonNotFound } from "./api-response";
import { isDbHealthy } from "./db";
import { getRequestMetricsSnapshot, logOperationalError, recordRequest } from "./observability";
import { getIconsDir } from "./services/icon-storage";

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
  return jsonError(c, 500, "internal server error");
});

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) {
    return jsonNotFound(c);
  }

  return c.text("Not found", 404);
});

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

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// The API is unauthenticated, and browsers can submit multipart forms
// cross-origin without CORS — so reject browser-issued mutations coming from
// another site. Requests without browser headers (curl, scripts) pass.
app.use("/api/*", async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) {
    return next();
  }

  const secFetchSite = c.req.header("sec-fetch-site");
  if (secFetchSite && secFetchSite !== "same-origin" && secFetchSite !== "none") {
    return jsonError(c, 403, "cross-site requests are not allowed");
  }

  const origin = c.req.header("origin");
  if (origin) {
    let originHost: string | null;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = null;
    }

    if (originHost === null || originHost !== c.req.header("host")) {
      return jsonError(c, 403, "cross-site requests are not allowed");
    }
  }

  return next();
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

app.route("/api/categories", categoriesRouter);
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

app.get("/api/icons/:filename", async (c) => {
  const safeName = path.basename(c.req.param("filename"));
  const file = Bun.file(path.join(getIconsDir(), safeName));

  if (!(await file.exists())) {
    return jsonNotFound(c);
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

  return new Response(file, {
    headers: {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": "public, max-age=3600",
      // Neutralizes scripts in user-supplied SVGs opened directly
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
});
