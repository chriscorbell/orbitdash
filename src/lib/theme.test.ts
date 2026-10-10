// @vitest-environment happy-dom

import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyAppearance, useAppliedAppearance } from "@/lib/theme";

function mockMatchMedia(prefersDark: boolean) {
  const listeners = new Set<() => void>();
  const media = {
    matches: prefersDark,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => media)
  );
  return {
    change(next: boolean) {
      media.matches = next;
      for (const listener of listeners) listener();
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.className = "";
  delete document.documentElement.dataset.accent;
});

describe("applyAppearance", () => {
  it("sets the dark class and accent on <html>", () => {
    mockMatchMedia(false);
    applyAppearance({ theme: "dark", accent: "mint" });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.dataset.accent).toBe("mint");

    applyAppearance({ theme: "light", accent: "rose" });
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.dataset.accent).toBe("rose");
  });

  it("follows the OS preference for the system theme and updates theme-color", () => {
    mockMatchMedia(true);
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = "#000";
    document.head.appendChild(meta);

    applyAppearance({ theme: "system", accent: "ice" });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    meta.remove();
  });
});

describe("useAppliedAppearance", () => {
  it("re-applies when the OS theme changes, only while following the system", () => {
    const media = mockMatchMedia(false);
    const { rerender, unmount } = renderHook(
      ({ theme }: { theme: "system" | "dark" }) => useAppliedAppearance({ theme, accent: "ice" }),
      { initialProps: { theme: "system" as "system" | "dark" } }
    );

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    media.change(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    rerender({ theme: "dark" });
    expect(media.listenerCount).toBe(0);
    unmount();
  });
});
