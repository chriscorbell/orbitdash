// @vitest-environment happy-dom

import { cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePaletteShortcuts } from "@/hooks/usePaletteShortcuts";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("usePaletteShortcuts", () => {
  it("opens on Ctrl+K, Cmd+K and slash, and on a typed letter as the first query", () => {
    const onOpen = vi.fn();
    renderHook(() => usePaletteShortcuts(onOpen, { typeToSearch: true }));

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.keyDown(window, { key: "K", metaKey: true });
    fireEvent.keyDown(window, { key: "/" });
    fireEvent.keyDown(window, { key: "p" });
    fireEvent.keyDown(window, { key: "7" });
    expect(onOpen.mock.calls).toEqual([[""], [""], [""], ["p"], ["7"]]);
  });

  it("leaves fields, shortcuts, spaces and open dialogs alone", () => {
    const onOpen = vi.fn();
    renderHook(() => usePaletteShortcuts(onOpen, { typeToSearch: true }));
    const input = document.createElement("input");
    document.body.appendChild(input);

    fireEvent.keyDown(input, { key: "p" });
    fireEvent.keyDown(input, { key: "/" });
    fireEvent.keyDown(window, { key: "p", altKey: true });
    fireEvent.keyDown(window, { key: "c", ctrlKey: true });
    fireEvent.keyDown(window, { key: " " });
    fireEvent.keyDown(window, { key: "Enter" });

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.appendChild(dialog);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("can turn off type-to-search, e.g. in edit mode", () => {
    const onOpen = vi.fn();
    renderHook(() => usePaletteShortcuts(onOpen, { typeToSearch: false }));
    fireEvent.keyDown(window, { key: "p" });
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(onOpen.mock.calls).toEqual([[""]]);
  });
});
