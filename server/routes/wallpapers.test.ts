import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "fs";
import path from "path";
import { app } from "../app";
import type { BackupDocument } from "../services/backup-transfer";
import {
  detectWallpaperExt,
  getWallpapersDir,
  purgeUnusedWallpapers,
  saveWallpaper,
} from "../services/wallpaper-storage";
import { cleanupTestDatabase, createTestDataDir } from "../test-utils";
import { initializeServer, shutdown } from "../runtime";

let testDataDir: string;

const PNG_BYTES = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082",
  "hex"
);
const AVIF_BYTES = Buffer.concat([
  Buffer.from([0, 0, 0, 0x1c]),
  Buffer.from("ftypavif", "ascii"),
  Buffer.alloc(16),
]);

async function upload(file: File | string) {
  const form = new FormData();
  form.set("file", file);
  return await app.request("/api/wallpapers", { method: "POST", body: form });
}

async function setWallpaper(wallpaper: string | null, device?: string) {
  const url = device ? `/api/settings/devices/${device}` : "/api/settings";
  const body = device
    ? { overrides: { appearance: { wallpaper } } }
    : { appearance: { wallpaper } };
  const response = await app.request(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(200);
}

function age(filename: string, hours: number) {
  const past = new Date(Date.now() - hours * 60 * 60 * 1000);
  fs.utimesSync(path.join(getWallpapersDir(), filename), past, past);
}

beforeEach(() => {
  testDataDir = createTestDataDir("orbitdash-wallpapers-");
  initializeServer({
    dataDir: testDataDir,
    logStartup: false,
    registerSignalHandlers: false,
    startJobs: false,
    startMetrics: false,
  });
});

afterEach(() => {
  shutdown();
  cleanupTestDatabase(testDataDir);
});

describe("wallpaper uploads", () => {
  it("stores an image under its content hash and serves it with long caching", async () => {
    const response = await upload(new File([PNG_BYTES], "sunset.png", { type: "image/png" }));
    expect(response.status).toBe(201);
    const { filename } = (await response.json()) as { filename: string };
    expect(filename).toMatch(/^wallpaper-[a-f0-9]{16}\.png$/);

    const again = await upload(new File([PNG_BYTES], "copy.png"));
    expect(((await again.json()) as { filename: string }).filename).toBe(filename);

    const served = await app.request(`/api/wallpapers/${filename}`);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(served.headers.get("cache-control")).toContain("immutable");
    expect(Buffer.from(await served.arrayBuffer()).equals(PNG_BYTES)).toBe(true);
  });

  it("refuses non-images, SVG, empty files, missing files and odd names", async () => {
    expect((await upload(new File(["<svg></svg>"], "x.svg"))).status).toBe(400);
    expect((await upload(new File([], "empty.png"))).status).toBe(400);
    expect((await upload("not a file")).status).toBe(400);
    expect(
      (await app.request("/api/wallpapers", { method: "POST", body: "plain text" })).status
    ).toBe(400);
    expect((await app.request("/api/wallpapers/wallpaper-0000000000000000.png")).status).toBe(404);
    expect((await app.request("/api/wallpapers/..%2Forbitdash.db")).status).toBe(404);
  });

  it("refuses images over the size limit", () => {
    const huge = Buffer.concat([PNG_BYTES, Buffer.alloc(10 * 1024 * 1024)]);
    expect(saveWallpaper(huge)).toMatchObject({ success: false, status: 413 });
  });

  it("recognizes AVIF and rejects other ISO media", () => {
    expect(detectWallpaperExt(AVIF_BYTES)).toBe(".avif");
    const mp4 = Buffer.concat([
      Buffer.from([0, 0, 0, 0x1c]),
      Buffer.from("ftypisom"),
      Buffer.alloc(16),
    ]);
    expect(detectWallpaperExt(mp4)).toBeNull();
  });
});

describe("wallpaper cleanup", () => {
  it("keeps wallpapers in use or freshly uploaded and deletes the rest", async () => {
    const shared = (saveWallpaper(PNG_BYTES) as { value: { filename: string } }).value.filename;
    const onDevice = (saveWallpaper(AVIF_BYTES) as { value: { filename: string } }).value.filename;
    const unused = (
      saveWallpaper(Buffer.concat([PNG_BYTES, Buffer.from([1])])) as { value: { filename: string } }
    ).value.filename;
    const fresh = (
      saveWallpaper(Buffer.concat([PNG_BYTES, Buffer.from([2])])) as { value: { filename: string } }
    ).value.filename;
    await setWallpaper(shared);
    await setWallpaper(onDevice, "device-12345");
    for (const filename of [shared, onDevice, unused]) age(filename, 3);

    expect(purgeUnusedWallpapers()).toBe(1);
    expect(fs.readdirSync(getWallpapersDir()).sort()).toEqual([fresh, onDevice, shared].sort());
  });
});

describe("wallpapers in backups", () => {
  it("exports the wallpapers settings point at and restores them on import", async () => {
    const { filename } = (saveWallpaper(PNG_BYTES) as { value: { filename: string } }).value;
    saveWallpaper(Buffer.concat([PNG_BYTES, Buffer.from([9])]));
    await setWallpaper(filename);

    const document = (await (await app.request("/api/backup/export")).json()) as BackupDocument;
    expect(document.wallpapers.map((wallpaper) => wallpaper.filename)).toEqual([filename]);

    fs.rmSync(getWallpapersDir(), { recursive: true, force: true });
    const imported = await app.request("/api/backup/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(document),
    });
    expect(imported.status).toBe(200);
    expect(fs.existsSync(path.join(getWallpapersDir(), filename))).toBe(true);
  });

  it("imports older backups that have no wallpapers", async () => {
    const document = (await (await app.request("/api/backup/export")).json()) as Record<
      string,
      unknown
    >;
    delete document.wallpapers;
    const imported = await app.request("/api/backup/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(document),
    });
    expect(imported.status).toBe(200);
  });
});
