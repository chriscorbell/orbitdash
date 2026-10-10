// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleLinkClick, navigate, usePathname } from "@/lib/router";

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("router", () => {
  it("follows navigation and the back button", () => {
    const { result } = renderHook(() => usePathname());
    expect(result.current).toBe("/");

    act(() => navigate("/stats"));
    expect(result.current).toBe("/stats");
    expect(window.location.pathname).toBe("/stats");

    act(() => {
      window.history.replaceState(null, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current).toBe("/");
  });

  it("ignores navigation to the current page", () => {
    const push = vi.spyOn(window.history, "pushState");
    navigate("/");
    expect(push).not.toHaveBeenCalled();
  });

  it("handles plain clicks but leaves modified ones to the browser", () => {
    const click = (init: Partial<MouseEvent>) => {
      const event = {
        button: 0,
        defaultPrevented: false,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        preventDefault: vi.fn(),
        ...init,
      };
      handleLinkClick(event as never, "/stats");
      return event.preventDefault;
    };

    expect(click({ metaKey: true })).not.toHaveBeenCalled();
    expect(click({ button: 1 })).not.toHaveBeenCalled();
    expect(click({})).toHaveBeenCalled();
    expect(window.location.pathname).toBe("/stats");
  });
});
