import { describe, expect, it } from "vitest";
import { normalizeIconUrl, normalizeServiceUrl } from "@shared/urls";

describe("normalizeServiceUrl", () => {
  it("normalizes a valid https URL", () => {
    expect(normalizeServiceUrl(" https://example.com/app ")).toBe(
      "https://example.com/app"
    );
  });

  it("rejects unsupported protocols", () => {
    expect(normalizeServiceUrl("ftp://example.com")).toBeNull();
    expect(normalizeServiceUrl("javascript:alert(1)")).toBeNull();
  });

  it("rejects invalid URLs", () => {
    expect(normalizeServiceUrl("not-a-url")).toBeNull();
  });
});

describe("normalizeIconUrl", () => {
  it("normalizes a valid http URL", () => {
    expect(normalizeIconUrl("http://example.com/icon.svg")).toBe(
      "http://example.com/icon.svg"
    );
  });

  it("rejects invalid input", () => {
    expect(normalizeIconUrl("")).toBeNull();
    expect(normalizeIconUrl("file:///tmp/icon.png")).toBeNull();
  });
});