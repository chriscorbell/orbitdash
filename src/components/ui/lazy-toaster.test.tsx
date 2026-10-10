// @vitest-environment happy-dom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LazyToaster } from "@/components/ui/lazy-toaster";
import { dismissToast, resetToastsForTesting, toast } from "@/lib/toast";

afterEach(() => {
  cleanup();
  resetToastsForTesting();
});

describe("LazyToaster", () => {
  it("renders nothing until the first toast, then shows it and stays mounted", async () => {
    const { container } = render(<LazyToaster />);
    expect(container.innerHTML).toBe("");

    let id = "";
    act(() => {
      id = toast({ title: "Added Jellyfin", tone: "success" });
    });
    expect(await screen.findByText("Added Jellyfin")).toBeTruthy();

    act(() => dismissToast(id));
    act(() => {
      toast({ title: "Changes saved" });
    });
    expect(await screen.findByText("Changes saved")).toBeTruthy();
  });
});
