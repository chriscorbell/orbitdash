import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import { getDb, getDataDir } from "../db";
import type { Service, CreateServicePayload, UpdateServicePayload } from "@shared/types";
import { normalizeIconUrl, normalizeServiceUrl } from "@shared/urls";
import fs from "fs";
import path from "path";

const servicesRouter = new Hono();

const ICONS_DIR_NAME = "icons";
const ALLOWED_ICON_EXTS = new Set([".png", ".svg", ".jpg", ".jpeg", ".gif", ".webp", ".ico"]);
const MAX_ICON_BYTES = 2 * 1024 * 1024;
const CONTENT_TYPE_TO_EXT: Record<string, string> = {
    "image/png": ".png",
    "image/svg+xml": ".svg",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/x-icon": ".ico",
    "image/vnd.microsoft.icon": ".ico",
};

type ServiceRecord = Omit<Service, "open_in_new_tab"> & {
    open_in_new_tab: boolean | number;
};
type RequestFormData = Awaited<ReturnType<Request["formData"]>>;

interface ParsedServicePayload<TPayload> {
    iconFile: File | null;
    iconUrl: string | null;
    payload: TPayload;
    removeIcon: boolean;
}

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
    const normalizedIconUrl = normalizeIconUrl(iconUrl);
    if (!normalizedIconUrl) {
        throw new Error("Icon URL must be a valid http(s) URL");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
        const res = await fetch(normalizedIconUrl, {
            redirect: "follow",
            signal: controller.signal,
        });
        if (!res.ok) {
            throw new Error("Failed to download icon");
        }

        const contentLength = Number(res.headers.get("content-length") || "0");
        if (contentLength > MAX_ICON_BYTES) {
            throw new Error("Icon file is too large");
        }

        const contentType = res.headers.get("content-type");
        const ext = resolveIconExt(normalizedIconUrl, contentType);
        if (!ext) {
            throw new Error("Unsupported icon type");
        }

        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.byteLength > MAX_ICON_BYTES) {
            throw new Error("Icon file is too large");
        }

        return { buffer: buf, ext };
    } finally {
        clearTimeout(timeout);
    }
}

function getUploadedIconExt(file: File): string | null {
    const ext = path.extname(file.name).toLowerCase();
    if (ALLOWED_ICON_EXTS.has(ext)) {
        return ext;
    }

    const normalizedType = file.type.split(";")[0].trim().toLowerCase();
    return CONTENT_TYPE_TO_EXT[normalizedType] || null;
}

function trimToNull(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

function normalizeServiceRecord(service: ServiceRecord): Service {
    return {
        ...service,
        open_in_new_tab: Boolean(service.open_in_new_tab),
    };
}

function readOptionalString(formData: RequestFormData, key: string): string | undefined {
    const value = formData.get(key);
    if (value === null) {
        return undefined;
    }

    return String(value);
}

async function parseServicePayload<TPayload extends CreateServicePayload | UpdateServicePayload>(
    request: Request,
    createPayload: (formData: RequestFormData) => TPayload
): Promise<ParsedServicePayload<TPayload>> {
    const contentType = request.headers.get("content-type") || "";

    if (!contentType.includes("multipart/form-data")) {
        const payload = (await request.json()) as TPayload;
        return {
            iconFile: null,
            iconUrl: trimToNull(payload.icon_url),
            payload,
            removeIcon: false,
        };
    }

    const formData = await request.formData();
    const file = formData.get("icon_file");
    const iconFile = file instanceof File && file.size > 0 ? file : null;

    return {
        iconFile,
        iconUrl: trimToNull(readOptionalString(formData, "icon_url")),
        payload: createPayload(formData),
        removeIcon: formData.get("remove_icon") === "true",
    };
}

function createServicePayloadFromFormData(formData: RequestFormData): CreateServicePayload {
    return {
        name: String(formData.get("name") ?? ""),
        url: String(formData.get("url") ?? ""),
        description: trimToNull(readOptionalString(formData, "description")),
        category: trimToNull(readOptionalString(formData, "category")),
        open_in_new_tab: formData.get("open_in_new_tab") !== "false",
    };
}

function updateServicePayloadFromFormData(formData: RequestFormData): UpdateServicePayload {
    const payload: UpdateServicePayload = {};
    const name = readOptionalString(formData, "name");
    const url = readOptionalString(formData, "url");
    const description = readOptionalString(formData, "description");
    const category = readOptionalString(formData, "category");
    const openInNewTab = formData.get("open_in_new_tab");

    if (name !== undefined) {
        payload.name = name;
    }
    if (url !== undefined) {
        payload.url = url;
    }
    if (description !== undefined) {
        payload.description = trimToNull(description);
    }
    if (category !== undefined) {
        payload.category = trimToNull(category);
    }
    if (openInNewTab !== null) {
        payload.open_in_new_tab = openInNewTab !== "false";
    }

    return payload;
}

function persistIcon(filename: string, buffer: Buffer) {
    fs.writeFileSync(path.join(getIconsDir(), filename), buffer);
}

function removeIconFile(iconFilename: string | null) {
    if (!iconFilename) {
        return;
    }

    const iconPath = path.join(getIconsDir(), iconFilename);
    if (fs.existsSync(iconPath)) {
        fs.unlinkSync(iconPath);
    }
}

/** GET /api/services */
servicesRouter.get("/", (c) => {
    const db = getDb();
    const services = db
        .prepare("SELECT * FROM services ORDER BY category ASC, name ASC")
        .all() as ServiceRecord[];

    return c.json(services.map(normalizeServiceRecord));
});

/** POST /api/services */
servicesRouter.post("/", async (c) => {
    const { payload, iconFile, iconUrl } = await parseServicePayload(
        c.req.raw,
        createServicePayloadFromFormData
    );

    const normalizedName = trimToNull(payload.name);
    const normalizedUrl = normalizeServiceUrl(payload.url ?? "");
    if (!normalizedName) {
        return c.json({ error: "name is required" }, 400);
    }
    if (!normalizedUrl) {
        return c.json({ error: "service url must be a valid http(s) URL" }, 400);
    }

    const id = uuidv4();
    const now = Date.now();

    let iconFilename: string | null = null;
    if (iconFile) {
        if (iconFile.size > MAX_ICON_BYTES) {
            return c.json({ error: "icon file is too large" }, 400);
        }
        const ext = getUploadedIconExt(iconFile);
        if (!ext) {
            return c.json({ error: "unsupported icon type" }, 400);
        }
        iconFilename = `${id}${ext}`;
        const buf = Buffer.from(await iconFile.arrayBuffer());
        persistIcon(iconFilename, buf);
    } else if (iconUrl) {
        try {
            const { buffer, ext } = await downloadIcon(iconUrl);
            iconFilename = `${id}${ext}`;
            persistIcon(iconFilename, buffer);
        } catch (error) {
            return c.json({
                error: error instanceof Error ? error.message : "failed to download icon",
            }, 400);
        }
    }

    const db = getDb();
    db.prepare(
        `INSERT INTO services (id, name, url, description, icon, category, open_in_new_tab, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
        id,
        normalizedName,
        normalizedUrl,
        payload.description?.trim() || null,
        iconFilename,
        payload.category?.trim() || null,
        payload.open_in_new_tab !== false ? 1 : 0,
        now,
        now
    );

    const service = db.prepare("SELECT * FROM services WHERE id = ?").get(id) as ServiceRecord;
    return c.json(normalizeServiceRecord(service), 201);
});

/** PUT /api/services/:id */
servicesRouter.put("/:id", async (c) => {
    const id = c.req.param("id");
    const db = getDb();

    const existing = db.prepare("SELECT * FROM services WHERE id = ?").get(id) as
        | ServiceRecord
        | undefined;
    if (!existing) {
        return c.json({ error: "not found" }, 404);
    }

    const { payload, iconFile, iconUrl, removeIcon } = await parseServicePayload(
        c.req.raw,
        updateServicePayloadFromFormData
    );

    const now = Date.now();
    const nextName = payload.name !== undefined ? trimToNull(payload.name) : existing.name;
    const nextUrl = payload.url !== undefined ? normalizeServiceUrl(payload.url) : existing.url;
    if (!nextName) {
        return c.json({ error: "name is required" }, 400);
    }
    if (!nextUrl) {
        return c.json({ error: "service url must be a valid http(s) URL" }, 400);
    }
    let iconFilename = existing.icon;

    const replacingIcon = Boolean(iconFile || iconUrl);

    // Handle icon removal when not replacing
    if (!replacingIcon && removeIcon && existing.icon) {
        removeIconFile(existing.icon);
        iconFilename = null;
    }

    // Replace icon via file upload
    if (iconFile) {
        if (iconFile.size > MAX_ICON_BYTES) {
            return c.json({ error: "icon file is too large" }, 400);
        }
        const ext = getUploadedIconExt(iconFile);
        if (!ext) {
            return c.json({ error: "unsupported icon type" }, 400);
        }
        removeIconFile(existing.icon);
        iconFilename = `${id}${ext}`;
        const buf = Buffer.from(await iconFile.arrayBuffer());
        persistIcon(iconFilename, buf);
    }

    // Replace icon via URL download
    if (!iconFile && iconUrl) {
        try {
            const { buffer, ext } = await downloadIcon(iconUrl);
            removeIconFile(existing.icon);
            iconFilename = `${id}${ext}`;
            persistIcon(iconFilename, buffer);
        } catch (error) {
            return c.json({
                error: error instanceof Error ? error.message : "failed to download icon",
            }, 400);
        }
    }

    db.prepare(
        `UPDATE services SET
       name = ?, url = ?, description = ?, icon = ?, category = ?,
       open_in_new_tab = ?, updated_at = ?
     WHERE id = ?`
    ).run(
        nextName,
        nextUrl,
        payload.description !== undefined ? payload.description?.trim() || null : existing.description,
        iconFilename,
        payload.category !== undefined ? payload.category?.trim() || null : existing.category,
        payload.open_in_new_tab !== undefined ? (payload.open_in_new_tab ? 1 : 0) : (existing.open_in_new_tab ? 1 : 0),
        now,
        id
    );

    const updated = db.prepare("SELECT * FROM services WHERE id = ?").get(id) as ServiceRecord;
    return c.json(normalizeServiceRecord(updated));
});

/** DELETE /api/services/:id */
servicesRouter.delete("/:id", (c) => {
    const id = c.req.param("id");
    const db = getDb();

    const existing = db.prepare("SELECT * FROM services WHERE id = ?").get(id) as
        | ServiceRecord
        | undefined;
    if (!existing) {
        return c.json({ error: "not found" }, 404);
    }

    // Remove icon file if exists
    removeIconFile(existing.icon);

    db.prepare("DELETE FROM services WHERE id = ?").run(id);
    return c.json({ success: true });
});

export { getIconsDir };
export default servicesRouter;
