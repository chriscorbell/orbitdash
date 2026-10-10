import { describe, expect, it } from "vitest";
import {
  importApplyRequestSchema,
  importPreviewRequestSchema,
  importPreviewSchema,
  importResultSchema,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_SERVICES,
} from "./import-schemas";
import type { ImportPreview, ImportResult } from "./types";

const service = {
  name: " Jellyfin ",
  url: "http://10.0.0.20:8096",
  description: null,
  iconUrl: "https://cdn.example.com/jellyfin.svg",
  category: "Media",
};

describe("import request schemas", () => {
  it("accept file contents within the size limit", () => {
    expect(importPreviewRequestSchema.parse({ content: "- Media: []" })).toEqual({
      content: "- Media: []",
    });
    for (const invalid of [
      { content: "" },
      { content: "x".repeat(MAX_IMPORT_BYTES + 1) },
      { content: "x", extra: true },
      {},
    ]) {
      expect(importPreviewRequestSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("accept picked services and trim their fields", () => {
    expect(importApplyRequestSchema.parse({ services: [service] })).toEqual({
      services: [{ ...service, name: "Jellyfin" }],
    });
  });

  it("reject empty, oversized or malformed picks", () => {
    const messages = (value: unknown) =>
      importApplyRequestSchema.safeParse(value).error?.issues.map((issue) => issue.message);

    expect(messages({ services: [] })).toEqual(["pick at least one service"]);
    expect(messages({ services: Array(MAX_IMPORT_SERVICES + 1).fill(service) })).toEqual([
      `import at most ${MAX_IMPORT_SERVICES} services at a time`,
    ]);
    for (const invalid of [
      { ...service, name: "  " },
      { ...service, category: undefined },
      { ...service, description: "x".repeat(501) },
      { ...service, color: "red" },
    ]) {
      expect(importApplyRequestSchema.safeParse({ services: [invalid] }).success).toBe(false);
    }
  });
});

describe("import response schemas", () => {
  it("parse previews and results", () => {
    const preview: ImportPreview = {
      format: "dashy",
      groups: [
        {
          name: "Media",
          services: [
            {
              name: "Plex",
              url: "http://plex.lan",
              description: null,
              iconUrl: null,
              duplicate: true,
            },
          ],
        },
      ],
      warnings: ["note"],
    };
    const result: ImportResult = {
      created: 1,
      failed: [{ name: "Bad", error: "service url must be a valid URL" }],
      iconFailures: 0,
      snapshot: null,
    };
    expect(importPreviewSchema.parse(preview)).toEqual(preview);
    expect(importResultSchema.parse(result)).toEqual(result);
    expect(importPreviewSchema.safeParse({ ...preview, format: "heimdall" }).success).toBe(false);
    expect(importResultSchema.safeParse({ ...result, snapshot: undefined }).success).toBe(false);
  });
});
