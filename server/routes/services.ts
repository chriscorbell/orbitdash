import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import { getDb, getDataDir } from "../db";
import type { Service, CreateServicePayload, UpdateServicePayload } from "../../src/shared/types";
import fs from "fs";
import path from "path";

const servicesRouter = new Hono();

const ICONS_DIR_NAME = "icons";
const ALLOWED_ICON_EXTS = new Set([".png", ".svg", ".jpg", ".jpeg", ".gif", ".webp", ".ico"]);
const CONTENT_TYPE_TO_EXT: Record<string, string> = {
    "image/png": ".png",
    "image/svg+xml": ".svg",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/x-icon": ".ico",
    "image/vnd.microsoft.icon": ".ico",
};

function getIconsDir(): string {
    const dir = path.join(getDataDir(), ICONS_DIR_NAME);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function resolveIconExt(iconUrl: string, contentType?: string | null): string | null {
    const normalized = contentType?.split(";")[0].trim().toLowerCase();
    if (normalized && CONTENT_TYPE_TO_EXT[normalized]) {
        return CONTENT_TYPE_TO_EXT[normalized];
    }
    try {
        const parsed = new URL(iconUrl);
        const ext = path.extname(parsed.pathname).toLowerCase();
        return ALLOWED_ICON_EXTS.has(ext) ? ext : null;
    } catch {
        return null;
    }
}

async function downloadIcon(iconUrl: string): Promise<{ buffer: Buffer; ext: string }> {
    const res = await fetch(iconUrl, { redirect: "follow" });
    if (!res.ok) {
        throw new Error("Failed to download icon");
    }

    const contentType = res.headers.get("content-type");
    const ext = resolveIconExt(iconUrl, contentType);
    if (!ext) {
        throw new Error("Unsupported icon type");
    }

    const buf = Buffer.from(await res.arrayBuffer());
    return { buffer: buf, ext };
}

/** GET /api/services */
servicesRouter.get("/", (c) => {
    const db = getDb();
    const services = db
        .prepare("SELECT * FROM services ORDER BY category ASC, name ASC")
        .all() as Service[];
    // Convert open_in_new_tab from 0/1 to boolean
    const result = services.map((s) => ({
        ...s,
        open_in_new_tab: Boolean(s.open_in_new_tab),
    }));
    return c.json(result);
});

/** POST /api/services */
servicesRouter.post("/", async (c) => {
    const contentType = c.req.header("content-type") || "";
    let payload: CreateServicePayload;
    let iconFile: File | null = null;
    let iconUrl: string | null = null;

    if (contentType.includes("multipart/form-data")) {
        const formData = await c.req.formData();
        payload = {
            name: formData.get("name") as string,
            url: formData.get("url") as string,
            description: (formData.get("description") as string) || null,
            category: (formData.get("category") as string) || null,
            open_in_new_tab: formData.get("open_in_new_tab") !== "false",
        };
        const file = formData.get("icon_file");
        if (file && file instanceof File && file.size > 0) {
            iconFile = file;
        }
        const iconUrlValue = formData.get("icon_url");
        if (iconUrlValue) {
            const url = String(iconUrlValue).trim();
            if (url) iconUrl = url;
        }
    } else {
        payload = await c.req.json<CreateServicePayload>();
        iconUrl = payload.icon_url ? payload.icon_url.trim() : null;
    }

    if (!payload.name || !payload.url) {
        return c.json({ error: "name and url are required" }, 400);
    }

    const id = uuidv4();
    const now = Date.now();

    let iconFilename: string | null = null;
    if (iconFile) {
        const ext = path.extname(iconFile.name) || ".png";
        iconFilename = `${id}${ext}`;
        const buf = Buffer.from(await iconFile.arrayBuffer());
        fs.writeFileSync(path.join(getIconsDir(), iconFilename), buf);
    } else if (iconUrl) {
        try {
            const { buffer, ext } = await downloadIcon(iconUrl);
            iconFilename = `${id}${ext}`;
            fs.writeFileSync(path.join(getIconsDir(), iconFilename), buffer);
        } catch {
            return c.json({ error: "failed to download icon" }, 400);
        }
    }

    const db = getDb();
    db.prepare(
        `INSERT INTO services (id, name, url, description, icon, category, open_in_new_tab, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
        id,
        payload.name,
        payload.url,
        payload.description || null,
        iconFilename,
        payload.category || null,
        payload.open_in_new_tab !== false ? 1 : 0,
        now,
        now
    );

    const service = db.prepare("SELECT * FROM services WHERE id = ?").get(id) as Service;
    return c.json({ ...service, open_in_new_tab: Boolean(service.open_in_new_tab) }, 201);
});

/** PUT /api/services/:id */
servicesRouter.put("/:id", async (c) => {
    const id = c.req.param("id");
    const db = getDb();

    const existing = db.prepare("SELECT * FROM services WHERE id = ?").get(id) as Service | undefined;
    if (!existing) {
        return c.json({ error: "not found" }, 404);
    }

    const contentType = c.req.header("content-type") || "";
    let payload: UpdateServicePayload;
    let iconFile: File | null = null;
    let removeIcon = false;
    let iconUrl: string | null = null;

    if (contentType.includes("multipart/form-data")) {
        const formData = await c.req.formData();
        payload = {};
        const name = formData.get("name");
        if (name !== null) payload.name = name as string;
        const url = formData.get("url");
        if (url !== null) payload.url = url as string;
        const desc = formData.get("description");
        if (desc !== null) payload.description = (desc as string) || null;
        const cat = formData.get("category");
        if (cat !== null) payload.category = (cat as string) || null;
        const newTab = formData.get("open_in_new_tab");
        if (newTab !== null) payload.open_in_new_tab = newTab !== "false";

        const file = formData.get("icon_file");
        if (file && file instanceof File && file.size > 0) {
            iconFile = file;
        }
        const iconUrlValue = formData.get("icon_url");
        if (iconUrlValue !== null) {
            const url = String(iconUrlValue).trim();
            if (url) iconUrl = url;
        }
        if (formData.get("remove_icon") === "true") {
            removeIcon = true;
        }
    } else {
        payload = await c.req.json<UpdateServicePayload>();
        iconUrl = payload.icon_url ? payload.icon_url.trim() : null;
    }

    const now = Date.now();
    let iconFilename = existing.icon;

    const replacingIcon = Boolean(iconFile || iconUrl);

    // Handle icon removal when not replacing
    if (!replacingIcon && removeIcon && existing.icon) {
        const oldPath = path.join(getIconsDir(), existing.icon);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        iconFilename = null;
    }

    // Replace icon via file upload
    if (iconFile) {
        if (existing.icon) {
            const oldPath = path.join(getIconsDir(), existing.icon);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
        const ext = path.extname(iconFile.name) || ".png";
        iconFilename = `${id}${ext}`;
        const buf = Buffer.from(await iconFile.arrayBuffer());
        fs.writeFileSync(path.join(getIconsDir(), iconFilename), buf);
    }

    // Replace icon via URL download
    if (!iconFile && iconUrl) {
        if (existing.icon) {
            const oldPath = path.join(getIconsDir(), existing.icon);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
        try {
            const { buffer, ext } = await downloadIcon(iconUrl);
            iconFilename = `${id}${ext}`;
            fs.writeFileSync(path.join(getIconsDir(), iconFilename), buffer);
        } catch {
            return c.json({ error: "failed to download icon" }, 400);
        }
    }

    db.prepare(
        `UPDATE services SET
       name = ?, url = ?, description = ?, icon = ?, category = ?,
       open_in_new_tab = ?, updated_at = ?
     WHERE id = ?`
    ).run(
        payload.name ?? existing.name,
        payload.url ?? existing.url,
        payload.description !== undefined ? payload.description : existing.description,
        iconFilename,
        payload.category !== undefined ? payload.category : existing.category,
        payload.open_in_new_tab !== undefined ? (payload.open_in_new_tab ? 1 : 0) : (existing.open_in_new_tab ? 1 : 0),
        now,
        id
    );

    const updated = db.prepare("SELECT * FROM services WHERE id = ?").get(id) as Service;
    return c.json({ ...updated, open_in_new_tab: Boolean(updated.open_in_new_tab) });
});

/** DELETE /api/services/:id */
servicesRouter.delete("/:id", (c) => {
    const id = c.req.param("id");
    const db = getDb();

    const existing = db.prepare("SELECT * FROM services WHERE id = ?").get(id) as Service | undefined;
    if (!existing) {
        return c.json({ error: "not found" }, 404);
    }

    // Remove icon file if exists
    if (existing.icon) {
        const iconPath = path.join(getIconsDir(), existing.icon);
        if (fs.existsSync(iconPath)) fs.unlinkSync(iconPath);
    }

    db.prepare("DELETE FROM services WHERE id = ?").run(id);
    return c.json({ success: true });
});

export { getIconsDir };
export default servicesRouter;
