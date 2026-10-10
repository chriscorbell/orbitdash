import { describe, expect, it } from "vitest";
import * as mini from "@/lib/api/schemas";
import * as full from "@shared/schemas";
import { dashboardSettingsResponseSchema as fullSettings } from "@shared/dashboard-settings-schemas";

const service = {
  id: "svc",
  name: "Jellyfin",
  url: "http://10.0.0.20:8096/",
  description: null,
  icon: "svc.svg",
  icon_source_url: "https://cdn.example/jellyfin.svg",
  category: "Media",
  category_id: "cat",
  position: 2,
  open_in_new_tab: true,
  created_at: 1,
  updated_at: 2,
};

const settings = {
  appearance: { accent: "mint", theme: "system" },
  layout: { gridColumns: 4, servicesFirst: true, showServices: true, showStats: false },
};

/** Each pair must agree: the browser's zod/mini schema and the shared full-zod schema. */
const pairs = [
  {
    name: "service",
    mini: mini.serviceSchema,
    full: full.serviceSchema,
    valid: service,
    invalid: [
      { ...service, position: "2" },
      { ...service, icon_source_url: undefined },
    ],
  },
  {
    name: "metrics",
    mini: mini.metricsResponseSchema,
    full: full.metricsResponseSchema,
    valid: { samples: [{ ts: 1, cpu: 2, ram: 3, disk: 4 }] },
    invalid: [{ samples: [{ ts: 1, cpu: 2, ram: 3 }] }],
  },
  {
    name: "rename",
    mini: mini.renameCategoryResponseSchema,
    full: full.renameCategoryResponseSchema,
    valid: { services: [service], order: ["Media"] },
    invalid: [{ services: [service] }],
  },
  {
    name: "snapshots",
    mini: mini.snapshotsResponseSchema,
    full: full.snapshotsResponseSchema,
    valid: { snapshots: [{ createdAt: "x", name: "n", reason: "nightly", sizeBytes: 1 }] },
    invalid: [{ snapshots: [{ createdAt: "x", name: "n", reason: "weekly", sizeBytes: 1 }] }],
  },
  {
    name: "settings",
    mini: mini.dashboardSettingsResponseSchema,
    full: fullSettings,
    valid: {
      device: { id: "device-1", name: null, overrides: { layout: { gridColumns: 3 } } },
      effective: settings,
      settings,
      stored: true,
    },
    invalid: [{ device: null, effective: settings, settings: { layout: {} }, stored: true }],
  },
];

describe("browser response schemas", () => {
  for (const pair of pairs) {
    it(`agree with the shared ${pair.name} schema`, () => {
      expect(pair.mini.parse(pair.valid)).toEqual(pair.full.parse(pair.valid));
      for (const value of pair.invalid) {
        expect(pair.mini.safeParse(value).success).toBe(false);
        expect(pair.full.safeParse(value).success).toBe(false);
      }
    });
  }

  it("parse category orders and import summaries", () => {
    expect(mini.categoryOrderResponseSchema.parse({ order: ["a"] })).toEqual({ order: ["a"] });
    expect(mini.importSummarySchema.parse({ icons: 1, services: 2, snapshot: "s" })).toEqual(
      full.importSummarySchema.parse({ icons: 1, services: 2, snapshot: "s" })
    );
  });
});
