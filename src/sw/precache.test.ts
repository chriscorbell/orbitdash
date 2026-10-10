import { describe, expect, it } from "vitest";
import { selectPrecacheUrls } from "./precache";

describe("selectPrecacheUrls", () => {
  it("takes the shell, every script, stylesheet and image, and the Latin fonts", () => {
    const urls = selectPrecacheUrls([
      "index.html",
      "assets/index-tqPRhTOG.js",
      "assets/SettingsDialog-NNK2894e.js",
      "assets/index-DpwI0APG.css",
      "assets/logo-abc12345.svg",
      "assets/geist-latin-wght-normal-BgDaEnEv.woff2",
      "assets/geist-mono-latin-wght-normal-XN7g48iV.woff2",
    ]);

    expect(urls).toEqual([
      "/",
      "/assets/SettingsDialog-NNK2894e.js",
      "/assets/geist-latin-wght-normal-BgDaEnEv.woff2",
      "/assets/geist-mono-latin-wght-normal-XN7g48iV.woff2",
      "/assets/index-DpwI0APG.css",
      "/assets/index-tqPRhTOG.js",
      "/assets/logo-abc12345.svg",
    ]);
  });

  it("leaves out other font scripts, source maps and files outside assets/", () => {
    const urls = selectPrecacheUrls([
      "assets/geist-latin-ext-wght-normal-DC-KSUi6.woff2",
      "assets/geist-cyrillic-wght-normal-BEAKL7Jp.woff2",
      "assets/geist-vietnamese-wght-normal-6IgcOCM7.woff",
      "assets/index-tqPRhTOG.js.map",
      "index.html",
      "orbitdash.svg",
      "sw.js",
    ]);

    expect(urls).toEqual(["/"]);
  });
});
