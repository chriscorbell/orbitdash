import { describe, expect, it } from "vitest";
import { LINK_LABEL_MAX_LENGTH, MAX_SERVICE_LINKS, normalizeServiceLinks } from "./service-links";

describe("normalizeServiceLinks", () => {
  it("trims labels and normalizes URLs like the main link", () => {
    expect(
      normalizeServiceLinks([
        { label: " Admin ", url: " 10.0.0.20:8096/admin " },
        { label: "Docs", url: "docs.example.com" },
      ])
    ).toEqual({
      ok: true,
      value: [
        { label: "Admin", url: "http://10.0.0.20:8096/admin" },
        { label: "Docs", url: "https://docs.example.com/" },
      ],
    });
  });

  it("drops rows that were left completely blank", () => {
    expect(
      normalizeServiceLinks([
        { label: "", url: "" },
        { label: "Logs", url: "https://logs.test" },
        { label: "  ", url: " " },
      ])
    ).toEqual({ ok: true, value: [{ label: "Logs", url: "https://logs.test/" }] });
  });

  it("needs both halves of a row", () => {
    expect(normalizeServiceLinks([{ label: "", url: "https://x.test" }])).toEqual({
      ok: false,
      error: "each link needs a label",
    });
    expect(normalizeServiceLinks([{ label: "Admin", url: "" }])).toEqual({
      ok: false,
      error: "Admin: link url must be a valid URL",
    });
  });

  it("rejects URLs that aren't http(s) and labels that are too long", () => {
    expect(normalizeServiceLinks([{ label: "Shell", url: "ssh://nas" }])).toEqual({
      ok: false,
      error: "Shell: link url must be a valid URL",
    });
    expect(
      normalizeServiceLinks([
        { label: "x".repeat(LINK_LABEL_MAX_LENGTH + 1), url: "https://x.test" },
      ])
    ).toEqual({ ok: false, error: "link labels must be 40 characters or fewer" });
  });

  it("allows up to the limit of links", () => {
    const links = Array.from({ length: MAX_SERVICE_LINKS }, (_, index) => ({
      label: `Link ${index}`,
      url: `https://${index}.test`,
    }));
    expect(normalizeServiceLinks(links)).toMatchObject({ ok: true });
    expect(normalizeServiceLinks([...links, { label: "More", url: "https://more.test" }])).toEqual({
      ok: false,
      error: "a service can have up to 5 links",
    });
  });
});
