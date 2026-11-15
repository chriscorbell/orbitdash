import fs from "node:fs";
import path from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApp } from "./app.ts";
import { referencedIcons } from "./board.ts";
import { openDatabase } from "./db.ts";
import { createIconLibrary } from "./icon-library.ts";
import { createIconStore } from "./icons.ts";

function resolveDataDir(): string {
  if (process.env.ORBITDASH_DATA_DIR) return path.resolve(process.env.ORBITDASH_DATA_DIR);
  if (fs.existsSync("/.dockerenv")) return "/data";
  return path.resolve("data");
}

const dataDir = resolveDataDir();
const port = Number(process.env.PORT ?? 3001);
const db = openDatabase(path.join(dataDir, "orbitdash.db"));
const icons = createIconStore(path.join(dataDir, "icons"));
const iconLibrary = createIconLibrary({
  cacheFile: path.join(dataDir, "cache", "icon-library.json"),
});
const app = createApp({ db, icons, iconLibrary });

const removed = icons.removeUnused(referencedIcons(db));
if (removed > 0) console.log(`Removed ${removed} unused icon files.`);

// The built frontend. Hashed assets never change; everything else is checked on each load.
const dist = path.resolve(import.meta.dirname, "../dist");
if (fs.existsSync(dist)) {
  app.use(
    "/*",
    serveStatic({
      root: dist,
      onFound: (file, c) => {
        c.header(
          "Cache-Control",
          file.includes(`${path.sep}assets${path.sep}`)
            ? "public, max-age=31536000, immutable"
            : "no-cache"
        );
      },
    })
  );
  // Old bookmarks (1.x had /settings and /stats pages) land on the board.
  app.get("*", serveStatic({ path: path.join(dist, "index.html") }));
}

const server = serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`orbitdash is listening on port ${info.port}, with data in ${dataDir}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  // Open keep-alive connections shouldn't hold up a container stop.
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
