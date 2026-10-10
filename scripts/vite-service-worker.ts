import { createHash } from "node:crypto";
import path from "node:path";
import { build, type Plugin } from "vite";
import { selectPrecacheUrls } from "../src/sw/precache.ts";

interface ServiceWorkerPluginOptions {
  /** The worker's source, relative to the project root. */
  entry: string;
  /** Output file name at the site root, which is also the worker's scope. */
  fileName?: string;
}

/**
 * Builds the service worker into the site root as part of `vite build`, with the build's precache
 * list and a version hash compiled in. The worker is bundled on its own (no shared chunks, classic
 * script format), so it never pulls in or changes app chunks. Dev mode never runs this.
 */
export function serviceWorker({ entry, fileName = "sw.js" }: ServiceWorkerPluginOptions): Plugin {
  let root = process.cwd();

  return {
    name: "orbitdash:service-worker",
    apply: "build",
    configResolved(config) {
      root = config.root;
    },
    generateBundle: {
      // After Vite has added index.html to the bundle.
      order: "post",
      async handler(_options, bundle) {
        const precacheUrls = selectPrecacheUrls(Object.keys(bundle));

        // The version changes whenever any precached file does (index.html stands in for "/").
        const hash = createHash("sha256");
        for (const url of precacheUrls) {
          const file = bundle[url === "/" ? "index.html" : url.slice(1)];
          if (!file) throw new Error(`service worker: ${url} is not in the build output`);
          hash.update(url).update(file.type === "chunk" ? file.code : file.source);
        }
        const version = hash.digest("hex").slice(0, 12);

        const result = await build({
          configFile: false,
          root,
          logLevel: "warn",
          publicDir: false,
          define: {
            __PRECACHE_URLS__: JSON.stringify(precacheUrls),
            __SW_VERSION__: JSON.stringify(version),
          },
          build: {
            write: false,
            emptyOutDir: false,
            copyPublicDir: false,
            modulePreload: false,
            reportCompressedSize: false,
            rolldownOptions: {
              input: path.resolve(root, entry),
              output: { format: "iife", entryFileNames: fileName },
            },
          },
        });

        const outputs = (Array.isArray(result) ? result : [result]).flatMap((item) =>
          "output" in item ? item.output : []
        );
        const chunk = outputs.find((item) => item.type === "chunk" && item.isEntry);
        if (!chunk || chunk.type !== "chunk") {
          throw new Error("service worker: the worker build produced no script");
        }

        this.emitFile({ type: "asset", fileName, source: chunk.code });
      },
    },
  };
}
