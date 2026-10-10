import fs from "fs";
import path from "path";
import { app } from "./app";
import { initializeServer } from "./runtime";
import { createStaticAssetHandler } from "./static-assets";

// In production, serve the built frontend, falling back to index.html for
// non-API routes.
const distPath = path.resolve(import.meta.dirname, "../dist");
if (fs.existsSync(distPath)) {
  app.get("*", createStaticAssetHandler(distPath));
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
