import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Layout } from "../shared/types.ts";
import {
  arrange,
  ConflictError,
  createCategory,
  createLink,
  deleteCategory,
  deleteLink,
  getBoard,
  InputError,
  type LinkFields,
  NotFoundError,
  renameCategory,
  updateLink,
} from "./board.ts";
import type { IconLibrary } from "./icon-library.ts";
import { ICON_TYPES, type IconStore, MAX_ICON_BYTES } from "./icons.ts";
import { normalizeLinkUrl } from "./urls.ts";

const MAX_NAME_LENGTH = 100;
const MAX_URL_LENGTH = 2048;

interface AppOptions {
  db: DatabaseSync;
  icons: IconStore;
  iconLibrary: IconLibrary;
  /** Downloads icons; tests pass a stub. */
  fetchIcon?: typeof fetch;
}

function text(value: unknown, field: string, maxLength: number): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed.length > maxLength) throw new InputError(`The ${field} is too long.`);
  return trimmed;
}

function requiredText(value: unknown, field: string, maxLength: number): string {
  const trimmed = text(value, field, maxLength);
  if (!trimmed) throw new InputError(`The ${field} is required.`);
  return trimmed;
}

function linkFields(form: FormData): LinkFields {
  const name = requiredText(form.get("name"), "name", MAX_NAME_LENGTH);
  const url = normalizeLinkUrl(requiredText(form.get("url"), "URL", MAX_URL_LENGTH));
  if (!url) throw new InputError("The URL must be a web address, like https://example.com.");
  return {
    name,
    url,
    category: text(form.get("category"), "category", MAX_NAME_LENGTH),
    newTab: form.get("newTab") !== "false",
  };
}

async function readJson(c: Context): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await c.req.json();
    if (typeof body === "object" && body !== null && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
  } catch {
    // Answered below.
  }
  throw new InputError("Expected a JSON object.");
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function parseLayout(body: Record<string, unknown>): Layout {
  const { ungrouped, categories } = body;
  if (
    isStringList(ungrouped) &&
    Array.isArray(categories) &&
    categories.every(
      (category: unknown) =>
        typeof category === "object" &&
        category !== null &&
        typeof (category as { id?: unknown }).id === "string" &&
        isStringList((category as { links?: unknown }).links)
    )
  ) {
    return { ungrouped, categories: categories as Layout["categories"] };
  }
  throw new InputError("Expected { ungrouped, categories }.");
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function createApp({ db, icons, iconLibrary, fetchIcon = fetch }: AppOptions) {
  const app = new Hono();

  /**
   * The icon a link form asks for: a new upload, a URL to download, removal (null), or undefined
   * to keep what the link has.
   */
  async function iconFromForm(form: FormData, linkId: string): Promise<string | null | undefined> {
    const file = form.get("iconFile");
    if (file instanceof File && file.size > 0) return icons.saveUpload(linkId, file);
    const url = form.get("iconUrl");
    if (typeof url === "string" && url.trim()) return icons.saveFromUrl(linkId, url, fetchIcon);
    if (form.get("removeIcon") === "true") return null;
    return undefined;
  }

  app.onError((error, c) => {
    if (error instanceof InputError) return c.json({ error: error.message }, 400);
    if (error instanceof NotFoundError) return c.json({ error: error.message }, 404);
    if (error instanceof ConflictError) return c.json({ error: error.message }, 409);
    console.error(`${c.req.method} ${c.req.path} failed:`, error);
    return c.json({ error: "Something went wrong on the server." }, 500);
  });

  // There's no sign-in, so refuse writes a browser sends on behalf of another site. Requests
  // without browser headers (curl, scripts) pass.
  app.use("/api/*", async (c, next) => {
    if (SAFE_METHODS.has(c.req.method)) return next();
    const site = c.req.header("sec-fetch-site");
    const origin = c.req.header("origin");
    let originHost: string | null;
    try {
      originHost = origin ? new URL(origin).host : null;
    } catch {
      originHost = "invalid";
    }
    if (
      (site && site !== "same-origin" && site !== "none") ||
      (origin && originHost !== c.req.header("host"))
    ) {
      return c.json({ error: "Cross-site requests are not allowed." }, 403);
    }
    return next();
  });

  app.get("/healthz", (c) => c.json({ status: "ok" }));

  app.get("/readyz", (c) => {
    try {
      db.prepare("SELECT 1").get();
      return c.json({ status: "ok" });
    } catch {
      return c.json({ status: "error" }, 503);
    }
  });

  app.get("/api/board", (c) => {
    c.header("Cache-Control", "no-store");
    return c.json(getBoard(db));
  });

  const formLimit = bodyLimit({
    maxSize: MAX_ICON_BYTES + 64 * 1024,
    onError: (c) => c.json({ error: "That icon is larger than 2 MB." }, 413),
  });

  app.post("/api/links", formLimit, async (c) => {
    const form = await c.req.formData();
    const fields = linkFields(form);
    const id = crypto.randomUUID();
    const icon = (await iconFromForm(form, id)) ?? null;
    try {
      return c.json(createLink(db, id, fields, icon), 201);
    } catch (error) {
      icons.remove(icon);
      throw error;
    }
  });

  app.patch("/api/links/:id", formLimit, async (c) => {
    const id = c.req.param("id");
    const form = await c.req.formData();
    const fields = linkFields(form);
    const icon = await iconFromForm(form, id);
    try {
      const { board, replacedIcon } = updateLink(db, id, fields, icon);
      icons.remove(replacedIcon);
      return c.json(board);
    } catch (error) {
      if (icon) icons.remove(icon);
      throw error;
    }
  });

  app.delete("/api/links/:id", (c) => {
    const { board, icon } = deleteLink(db, c.req.param("id"));
    icons.remove(icon);
    return c.json(board);
  });

  app.post("/api/categories", async (c) => {
    const body = await readJson(c);
    return c.json(createCategory(db, requiredText(body.name, "name", MAX_NAME_LENGTH)), 201);
  });

  app.patch("/api/categories/:id", async (c) => {
    const body = await readJson(c);
    const name = requiredText(body.name, "name", MAX_NAME_LENGTH);
    return c.json(renameCategory(db, c.req.param("id"), name));
  });

  app.delete("/api/categories/:id", (c) => c.json(deleteCategory(db, c.req.param("id"))));

  app.put("/api/layout", async (c) => c.json(arrange(db, parseLayout(await readJson(c)))));

  app.get("/api/icons/:name", (c) => {
    const file = icons.resolve(c.req.param("name"));
    if (!file) return c.json({ error: "No such icon." }, 404);
    return c.body(fs.readFileSync(file), 200, {
      "Content-Type": ICON_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
      // Icon files are never rewritten; a new icon gets a new name.
      "Cache-Control": "public, max-age=31536000, immutable",
      // Scripts in an uploaded SVG must not run if someone opens the file directly.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    });
  });

  app.get("/api/icon-library", async (c) => {
    const query = c.req.query("q") ?? "";
    try {
      const { entries } = await iconLibrary.search(query, 24);
      return c.json(entries);
    } catch {
      return c.json({ error: "The icon libraries can't be reached right now." }, 503);
    }
  });

  app.all("/api/*", (c) => c.json({ error: "Not found." }, 404));

  return app;
}
