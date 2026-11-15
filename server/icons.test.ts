import { describe, expect, it } from "vitest";
import { detectIconExt } from "./icons.ts";

const svg = (text: string) => detectIconExt(Buffer.from(text));

describe("detectIconExt", () => {
  it("recognizes SVG behind a BOM, XML declaration, comments and doctype", () => {
    expect(svg('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).toBe(".svg");
    expect(svg("﻿  <svg>")).toBe(".svg");
    expect(svg('<?xml version="1.0" encoding="UTF-8"?>\n<svg viewBox="0 0 1 1"/>')).toBe(".svg");
    expect(
      svg(
        '<?xml version="1.0"?>\n<!-- Generator: Sketch -->\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x.dtd">\n<!-- more -->\n<SVG>'
      )
    ).toBe(".svg");
  });

  it("rejects text that isn't an SVG", () => {
    expect(svg("<html><svg></svg></html>")).toBeNull();
    expect(svg("<svgfoo>")).toBeNull();
    expect(svg("<!-- never closed <svg>")).toBeNull();
    expect(svg('<?xml version="1.0"')).toBeNull();
    expect(svg("plain text")).toBeNull();
  });

  it("answers quickly on a long run of comments", () => {
    const started = performance.now();
    expect(svg(`<!--${"--><!--".repeat(70)}x`)).toBeNull();
    expect(performance.now() - started).toBeLessThan(50);
  });
});
