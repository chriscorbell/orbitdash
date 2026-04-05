import { describe, expect, it } from "vitest";
import {
  categoryOrderUpdateSchema,
  getValidationMessage,
  metricsQuerySchema,
  serviceCreateSchema,
  serviceUpdateSchema,
} from "@shared/schemas";

describe("serviceCreateSchema", () => {
  it("normalizes required and optional fields", () => {
    expect(
      serviceCreateSchema.parse({
        name: " Orbit ",
        url: " https://example.com/orbit ",
        description: " Dashboard ",
        category: " Infra ",
        icon_url: " https://example.com/icon.svg ",
      })
    ).toEqual({
      name: "Orbit",
      url: "https://example.com/orbit",
      description: "Dashboard",
      category: "Infra",
      icon_url: "https://example.com/icon.svg",
      open_in_new_tab: true,
    });
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
      description: null,
      category: null,
      icon_url: null,
      open_in_new_tab: false,
    });
  });

  it("rejects invalid service and icon URLs", () => {
    const result = serviceCreateSchema.safeParse({
      name: "Orbit",
      url: "notaurl",
      icon_url: "file:///tmp/icon.svg",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(getValidationMessage(result.error)).toBe("service url must be a valid http(s) URL");
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
        url: " https://example.com/updated ",
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

  it("rejects values above the maximum window", () => {
    const result = metricsQuerySchema.safeParse({ window: "7200" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(getValidationMessage(result.error)).toBe("window must be 3600 seconds or less");
    }
  });
});

describe("getValidationMessage", () => {
  it("falls back to a generic message when no issues are present", () => {
    expect(getValidationMessage({ issues: [] } as never)).toBe("invalid request");
  });
});