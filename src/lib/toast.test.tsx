// @vitest-environment happy-dom

import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/toaster";
import { dismissToast, resetToastsForTesting, toast, toastError } from "@/lib/toast";

afterEach(() => {
  cleanup();
  act(() => resetToastsForTesting());
});

describe("toasts", () => {
  it("shows titles, descriptions and tones", () => {
    render(<Toaster />);

    act(() => {
      toast({ title: "Added Jellyfin", tone: "success" });
      toast({ title: "Plain", description: "Details here" });
    });

    expect(screen.getByText("Added Jellyfin")).toBeTruthy();
    expect(screen.getByText("Details here")).toBeTruthy();
  });

  it("runs an action and can be dismissed", async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    render(<Toaster />);

    act(() => {
      toast({ title: "Deleted Sonarr", action: { label: "Undo", onClick: onUndo } });
    });
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalled();
  });

  it("dismisses by id and closes from the close button", async () => {
    const user = userEvent.setup();
    render(<Toaster />);

    let first = "";
    act(() => {
      first = toast({ title: "First" });
      toast({ title: "Second" });
    });
    act(() => dismissToast(first));
    expect(screen.queryByText("First")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    await vi.waitFor(() => expect(screen.queryByText("Second")).toBeNull());

    // Dismissing something already gone is a no-op.
    act(() => dismissToast("missing"));
  });

  it("keeps only the newest four", () => {
    render(<Toaster />);
    act(() => {
      for (let index = 1; index <= 6; index++) toast({ title: `Toast ${index}` });
    });

    expect(screen.queryByText("Toast 2")).toBeNull();
    expect(screen.getByText("Toast 3")).toBeTruthy();
    expect(screen.getByText("Toast 6")).toBeTruthy();
  });

  it("builds error toasts from thrown errors", () => {
    render(<Toaster />);
    act(() => {
      toastError(new Error("disk full"), "Couldn't save");
      toastError("weird", "Couldn't load");
      toastError(new Error("Couldn't sync"), "Couldn't sync");
    });

    expect(screen.getByText("disk full")).toBeTruthy();
    expect(screen.getByText("Couldn't load")).toBeTruthy();
    expect(screen.getAllByText("Couldn't sync")).toHaveLength(1);
  });
});
