import { describe, expect, it } from "vitest";
import {
  bulkDeleteServicesResponseSchema,
  categoriesResponseSchema,
  categoryOrderResponseSchema,
  iconLibraryResponseSchema,
  categorySchema,
  importSummarySchema,
  snapshotsResponseSchema,
  metricsResponseSchema,
  metricSampleSchema,
  serviceSchema,
  servicesResponseSchema,
} from "@shared/schemas";
import {
  categoryCreateSchema,
  categoryOrderUpdateSchema,
  categoryRenameSchema,
  categoryReorderSchema,
  categoryUpdateSchema,
  metricHistoryQuerySchema,
  metricsQuerySchema,
  serviceBulkChecksSchema,
  serviceBulkIdsSchema,
  serviceBulkMoveSchema,
  serviceMoveSchema,
  serviceReorderSchema,
} from "@shared/server-schemas";
import {
  getValidationMessage,
  serviceCreateSchema,
  serviceUpdateSchema,
} from "@shared/service-schemas";

describe("serviceCreateSchema", () => {
  it("normalizes required and optional fields", () => {
    expect(
      serviceCreateSchema.parse({
        name: " Orbit ",
        url: " example.com/orbit ",
        description: " Dashboard ",
        category: " Infra ",
        icon_url: " https://example.com/icon.svg ",
      })
    ).toEqual({
      name: "Orbit",
      url: "https://example.com/orbit",
      external_url: null,
      links: [],
      tags: [],
      description: "Dashboard",
      category: "Infra",
      icon_url: "https://example.com/icon.svg",
      open_in_new_tab: true,
    });
  });

  it("defaults schemeless LAN addresses to http", () => {
    expect(serviceCreateSchema.parse({ name: "Jellyfin", url: "10.0.0.20:8096" }).url).toBe(
      "http://10.0.0.20:8096/"
    );
    expect(serviceUpdateSchema.parse({ url: " nas:5000 " }).url).toBe("http://nas:5000/");
  });

  it("converts empty optional text fields and icon URLs to null", () => {
    expect(
      serviceCreateSchema.parse({
        name: "Orbit",
        url: "https://example.com/orbit",
        description: " ",
        category: "",
        icon_url: "  ",
        open_in_new_tab: false,
      })
    ).toEqual({
      name: "Orbit",
      url: "https://example.com/orbit",
      external_url: null,
      links: [],
      tags: [],
      description: null,
      category: null,
      icon_url: null,
      open_in_new_tab: false,
    });
  });

  it("rejects invalid service and icon URLs", () => {
    const result = serviceCreateSchema.safeParse({
      name: "Orbit",
      url: "not a url",
      icon_url: "file:///tmp/icon.svg",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(getValidationMessage(result.error)).toBe("service url must be a valid URL");
    }
  });

  it("rejects non-string required fields", () => {
    const result = serviceCreateSchema.safeParse({
      name: 123,
      url: "https://example.com/orbit",
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid icon URLs when the service URL is valid", () => {
    const result = serviceCreateSchema.safeParse({
      name: "Orbit",
      url: "https://example.com/orbit",
      icon_url: "file:///tmp/icon.svg",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(getValidationMessage(result.error)).toBe("icon url must be a valid http(s) URL");
    }
  });
});

describe("service check fields", () => {
  it("are optional and left for service-operations to default", () => {
    const parsed = serviceCreateSchema.parse({ name: "Orbit", url: "nas.lan" });
    expect(parsed.check_enabled).toBeUndefined();
    expect(parsed.check_interval).toBeUndefined();
  });

  it("validate types and ranges, and blank targets become null", () => {
    expect(
      serviceUpdateSchema.parse({
        check_enabled: true,
        check_method: "tcp",
        check_target: "  ",
        check_interval: 15,
        check_ignore_tls: false,
      })
    ).toEqual({
      check_enabled: true,
      check_method: "tcp",
      check_target: null,
      check_interval: 15,
      check_ignore_tls: false,
    });

    for (const [patch, message] of [
      [
        { check_interval: 3601 },
        "check interval must be a whole number of seconds from 15 to 3600",
      ],
      [
        { check_interval: "60" },
        "check interval must be a whole number of seconds from 15 to 3600",
      ],
      [{ check_method: "ping" }, "check method must be http or tcp"],
      [{ check_target: 22 }, "check target must be a string"],
      [{ check_ignore_tls: "yes" }, "check_ignore_tls must be true or false"],
    ] as const) {
      const result = serviceUpdateSchema.safeParse(patch);
      expect(result.success).toBe(false);
      if (!result.success) expect(getValidationMessage(result.error)).toBe(message);
    }
  });
});

describe("serviceUpdateSchema", () => {
  it("allows partial updates and preserves omitted fields as undefined", () => {
    expect(
      serviceUpdateSchema.parse({
        description: "  ",
        open_in_new_tab: false,
      })
    ).toEqual({
      description: null,
      open_in_new_tab: false,
    });
  });

  it("normalizes optional URLs and nullable fields", () => {
    expect(
      serviceUpdateSchema.parse({
        url: " example.com/updated ",
        icon_url: " https://example.com/icon.svg ",
        category: "  ",
      })
    ).toEqual({
      url: "https://example.com/updated",
      icon_url: "https://example.com/icon.svg",
      category: null,
    });
  });

  it("rejects blank names when a name is provided", () => {
    const result = serviceUpdateSchema.safeParse({ name: "   " });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(getValidationMessage(result.error)).toBe("name is required");
    }
  });
});

describe("service external URL, links and tags", () => {
  const base = { name: "Jellyfin", url: "10.0.0.20:8096" };
  const messageOf = (input: Record<string, unknown>) =>
    serviceCreateSchema.safeParse({ ...base, ...input }).error?.issues[0]?.message;

  it("normalize like the form does", () => {
    expect(
      serviceCreateSchema.parse({
        ...base,
        external_url: " jellyfin.example.com ",
        links: [
          { label: " Admin ", url: "10.0.0.20:8096/admin" },
          { label: " ", url: "" },
        ],
        tags: ["Media", "media", " Home  Lab "],
      })
    ).toMatchObject({
      external_url: "https://jellyfin.example.com/",
      links: [{ label: "Admin", url: "http://10.0.0.20:8096/admin" }],
      tags: ["media", "home lab"],
    });
    expect(serviceCreateSchema.parse({ ...base, external_url: "  " }).external_url).toBeNull();
  });

  it("are left out of updates that don't send them, and clear when sent empty", () => {
    expect(serviceUpdateSchema.parse({ name: "Jelly" })).toEqual({ name: "Jelly" });
    expect(serviceUpdateSchema.parse({ external_url: "", links: [], tags: [] })).toEqual({
      external_url: null,
      links: [],
      tags: [],
    });
    expect(serviceUpdateSchema.parse({ external_url: null }).external_url).toBeNull();
    expect(serviceUpdateSchema.parse({ external_url: "nas:5000" }).external_url).toBe(
      "http://nas:5000/"
    );
  });

  it("report the first problem in a readable way", () => {
    expect(messageOf({ external_url: "ftp://files" })).toBe("external url must be a valid URL");
    expect(messageOf({ external_url: 5 })).toBe("external url must be a valid URL");
    expect(messageOf({ links: {} })).toBe("links must be a list of { label, url }");
    expect(messageOf({ links: ["Admin"] })).toBe("links must be a list of { label, url }");
    expect(messageOf({ links: [{ label: 1, url: "x" }] })).toBe(
      "links must be a list of { label, url }"
    );
    expect(messageOf({ links: [{ label: "Admin", url: "" }] })).toBe(
      "Admin: link url must be a valid URL"
    );
    expect(messageOf({ tags: "media" })).toBe("tags must be a list of strings");
    expect(messageOf({ tags: [1] })).toBe("tags must be a list of strings");
    expect(messageOf({ tags: Array.from({ length: 11 }, (_, index) => `t${index}`) })).toBe(
      "a service can have up to 10 tags"
    );
  });
});

describe("categoryOrderUpdateSchema", () => {
  it("sanitizes duplicate and empty category names", () => {
    expect(
      categoryOrderUpdateSchema.parse({
        order: [" Media ", "", "Infra", "Media"],
      })
    ).toEqual({
      order: ["Media", "Infra"],
    });
  });

  it("rejects manual ordering of the uncategorized section", () => {
    const result = categoryOrderUpdateSchema.safeParse({
      order: ["Infra", "Uncategorized"],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(getValidationMessage(result.error)).toBe('"Uncategorized" cannot be manually ordered');
    }
  });
});

describe("categoryRenameSchema", () => {
  it("trims both names", () => {
    expect(categoryRenameSchema.parse({ from: " Media ", to: " Streaming " })).toEqual({
      from: "Media",
      to: "Streaming",
    });
  });

  it("requires non-empty names", () => {
    const result = categoryRenameSchema.safeParse({ from: "Media", to: "   " });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(getValidationMessage(result.error)).toBe("to is required");
    }
  });

  it("rejects renaming the uncategorized group", () => {
    const result = categoryRenameSchema.safeParse({ from: "Uncategorized", to: "Misc" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(getValidationMessage(result.error)).toBe("the Uncategorized group cannot be renamed");
    }
  });

  it("rejects the reserved uncategorized name as a target", () => {
    const result = categoryRenameSchema.safeParse({ from: "Media", to: "Uncategorized" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(getValidationMessage(result.error)).toBe(
        '"Uncategorized" is a reserved category name'
      );
    }
  });

  it("rejects renaming a category to its current name", () => {
    const result = categoryRenameSchema.safeParse({ from: "Media", to: " Media " });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(getValidationMessage(result.error)).toBe(
        "the new name must be different from the current name"
      );
    }
  });
});

describe("response schemas", () => {
  it("validates metric samples and metric responses", () => {
    const sample = {
      ts: 1,
      cpu: 42,
      ram: 58,
      disk: 73,
    };

    expect(metricSampleSchema.parse(sample)).toEqual(sample);
    expect(metricsResponseSchema.parse({ samples: [sample] })).toEqual({ samples: [sample] });
  });

  it("validates services and service collections", () => {
    const service = {
      id: "svc-1",
      name: "Orbit",
      url: "https://example.com/orbit",
      description: null,
      icon: null,
      icon_source_url: null,
      category: "Infra",
      category_id: "cat-infra",
      position: 3,
      open_in_new_tab: true,
      created_at: 1,
      updated_at: 2,
      check_enabled: false,
      check_method: "http",
      check_target: null,
      check_interval: 60,
      check_ignore_tls: false,
    };

    const parsed = { ...service, external_url: null, links: [], tags: [] };
    expect(serviceSchema.parse(service)).toEqual(parsed);
    expect(servicesResponseSchema.parse([service])).toEqual([parsed]);

    const extras = {
      external_url: "https://orbit.example.com/",
      links: [{ label: "Admin", url: "https://orbit.example.com/admin" }],
      tags: ["infra"],
    };
    expect(serviceSchema.parse({ ...service, ...extras })).toEqual({ ...service, ...extras });

    const downloaded = {
      ...parsed,
      icon: "svc-1-a1b2c3d4.svg",
      icon_source_url: "https://example.com/icon.svg",
    };
    expect(serviceSchema.parse(downloaded)).toEqual(downloaded);

    const { icon_source_url: _omitted, ...withoutSourceUrl } = service;
    expect(serviceSchema.safeParse(withoutSourceUrl).success).toBe(false);
  });

  it("validates categories", () => {
    const category = { id: "c", name: "Media", position: 0, created_at: 1, updated_at: 1 };
    expect(categoriesResponseSchema.parse({ categories: [category] })).toEqual({
      categories: [category],
    });
    expect(categorySchema.safeParse({ ...category, position: "0" }).success).toBe(false);
  });

  it("validates category order responses", () => {
    expect(categoryOrderResponseSchema.parse({ order: ["Infra", "Media"] })).toEqual({
      order: ["Infra", "Media"],
    });
  });
});

describe("metricsQuerySchema", () => {
  it("provides a default window and parses valid values", () => {
    expect(metricsQuerySchema.parse({})).toEqual({ window: 30 });
    expect(metricsQuerySchema.parse({ window: "45" })).toEqual({ window: 45 });
  });

  it("rejects invalid window values", () => {
    const result = metricsQuerySchema.safeParse({ window: "abc" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(getValidationMessage(result.error)).toBe("window must be a positive integer");
    }
  });

  it("rejects windows beyond the sample retention period", () => {
    const result = metricsQuerySchema.safeParse({ window: "61" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(getValidationMessage(result.error)).toBe("window must be 60 seconds or less");
    }
  });
});

describe("metricHistoryQuerySchema", () => {
  it("defaults to the last hour and accepts every served range", () => {
    expect(metricHistoryQuerySchema.parse({})).toEqual({ range: "1h" });
    for (const range of ["1h", "24h", "7d", "30d"]) {
      expect(metricHistoryQuerySchema.parse({ range })).toEqual({ range });
    }
  });

  it("names the accepted ranges when given another", () => {
    for (const range of ["2h", "", "7D", "30"]) {
      const result = metricHistoryQuerySchema.safeParse({ range });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getValidationMessage(result.error)).toBe("range must be one of 1h, 24h, 7d, 30d");
      }
    }
  });
});

describe("getValidationMessage", () => {
  it("falls back to a generic message when no issues are present", () => {
    expect(getValidationMessage({ issues: [] } as never)).toBe("invalid request");
  });
});

describe("backup response schemas", () => {
  it("accepts snapshot lists and import summaries", () => {
    const snapshot = {
      createdAt: "2026-10-10T03:00:00.000Z",
      name: "2026-10-10T03-00-00-000Z-nightly",
      reason: "nightly",
      sizeBytes: 4096,
    };

    expect(snapshotsResponseSchema.parse({ snapshots: [snapshot] })).toEqual({
      snapshots: [snapshot],
    });
    expect(importSummarySchema.parse({ icons: 2, services: 3, snapshot: snapshot.name })).toEqual({
      icons: 2,
      services: 3,
      snapshot: snapshot.name,
    });
  });

  it("rejects unknown snapshot reasons", () => {
    expect(
      snapshotsResponseSchema.safeParse({
        snapshots: [{ createdAt: "x", name: "y", reason: "weekly", sizeBytes: 1 }],
      }).success
    ).toBe(false);
  });
});

describe("category request schemas", () => {
  it("trims names and rejects empty, oversized and reserved ones", () => {
    expect(categoryCreateSchema.parse({ name: "  Media " })).toEqual({ name: "Media" });
    expect(categoryUpdateSchema.parse({ name: "Infra" })).toEqual({ name: "Infra" });
    expect(categoryCreateSchema.safeParse({ name: "   " }).error?.issues[0]?.message).toBe(
      "name is required"
    );
    expect(categoryCreateSchema.safeParse({ name: "x".repeat(81) }).error?.issues[0]?.message).toBe(
      "name must be 80 characters or fewer"
    );
    expect(
      categoryCreateSchema.safeParse({ name: "Uncategorized" }).error?.issues[0]?.message
    ).toBe('"Uncategorized" is a reserved category name');
    expect(categoryCreateSchema.safeParse({ name: 5 }).error?.issues[0]?.message).toBe(
      "name must be a string"
    );
  });

  it("validates reorder id lists", () => {
    expect(categoryReorderSchema.parse({ ids: ["a", "b"] })).toEqual({ ids: ["a", "b"] });
    expect(categoryReorderSchema.safeParse({ ids: "a" }).error?.issues[0]?.message).toBe(
      "ids must be an array of ids"
    );
    expect(categoryReorderSchema.safeParse({ ids: [1] }).error?.issues[0]?.message).toBe(
      "ids must be an array of ids"
    );
  });
});

describe("service ordering schemas", () => {
  it("accepts moves into a category or out of all categories", () => {
    expect(serviceMoveSchema.parse({ category_id: "c", index: 2 })).toEqual({
      category_id: "c",
      index: 2,
    });
    expect(serviceMoveSchema.parse({ category_id: null, index: 0 })).toEqual({
      category_id: null,
      index: 0,
    });
  });

  it("rejects negative, fractional and missing indexes", () => {
    for (const index of [-1, 1.5, "1", undefined]) {
      expect(
        serviceMoveSchema.safeParse({ category_id: null, index }).error?.issues[0]?.message
      ).toBe("index must be a non-negative integer");
    }
    expect(
      serviceMoveSchema.safeParse({ category_id: 3, index: 0 }).error?.issues[0]?.message
    ).toBe("category_id must be a string or null");
  });

  it("validates service reorders", () => {
    expect(serviceReorderSchema.parse({ category_id: null, ids: ["a"] })).toEqual({
      category_id: null,
      ids: ["a"],
    });
  });
});

describe("bulk service schemas", () => {
  it("drop repeated ids and require at least one", () => {
    expect(serviceBulkIdsSchema.parse({ ids: ["a", "b", "a"] })).toEqual({ ids: ["a", "b"] });
    for (const ids of [[], [""], "a", undefined]) {
      expect(serviceBulkIdsSchema.safeParse({ ids }).error?.issues[0]?.message).toBe(
        "ids must be a non-empty array of service ids"
      );
    }
    expect(
      serviceBulkIdsSchema.safeParse({ ids: Array.from({ length: 1001 }, (_, i) => `s${i}`) }).error
        ?.issues[0]?.message
    ).toBe("ids can list up to 1000 services");
  });

  it("move to a category or out of all of them", () => {
    expect(serviceBulkMoveSchema.parse({ ids: ["a"], category_id: null })).toEqual({
      ids: ["a"],
      category_id: null,
    });
    expect(serviceBulkMoveSchema.safeParse({ ids: ["a"] }).success).toBe(false);
  });

  it("change check settings only when one is given", () => {
    expect(serviceBulkChecksSchema.parse({ ids: ["a"], check_enabled: false })).toEqual({
      ids: ["a"],
      check_enabled: false,
    });
    expect(serviceBulkChecksSchema.parse({ ids: ["a"], check_interval: 300 })).toEqual({
      ids: ["a"],
      check_interval: 300,
    });
    expect(serviceBulkChecksSchema.safeParse({ ids: ["a"] }).error?.issues[0]?.message).toBe(
      "nothing to change: give check_enabled or check_interval"
    );
    expect(
      serviceBulkChecksSchema.safeParse({ ids: ["a"], check_interval: 10 }).error?.issues[0]
        ?.message
    ).toBe("check interval must be a whole number of seconds from 15 to 3600");
    expect(
      serviceBulkChecksSchema.safeParse({ ids: ["a"], check_enabled: "yes" }).error?.issues[0]
        ?.message
    ).toBe("check_enabled must be true or false");
  });

  it("parse bulk delete replies", () => {
    const reply = { success: true, deleted: 2, restorableUntil: 5 };
    expect(bulkDeleteServicesResponseSchema.parse(reply)).toEqual(reply);
    expect(bulkDeleteServicesResponseSchema.safeParse({ ...reply, deleted: "2" }).success).toBe(
      false
    );
  });
});

describe("iconLibraryResponseSchema", () => {
  it("accepts library results and rejects unknown sources", () => {
    const entry = {
      id: "selfhst:plex",
      source: "selfhst",
      slug: "plex",
      name: "Plex",
      url: "https://x/plex.svg",
    };
    expect(
      iconLibraryResponseSchema.parse({ entries: [entry], updatedAt: 1 }).entries
    ).toHaveLength(1);
    expect(
      iconLibraryResponseSchema.safeParse({
        entries: [{ ...entry, source: "other" }],
        updatedAt: 1,
      }).success
    ).toBe(false);
  });
});
