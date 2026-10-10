// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CustomCssSettings } from "@/components/settings/CustomCssSettings";
import { DashboardTitleField } from "@/components/settings/DashboardTitleField";
import { WallpaperSettings } from "@/components/settings/WallpaperSettings";
import * as wallpapersApi from "@/lib/api/wallpapers";

vi.mock("@/lib/api/wallpapers", () => ({
  uploadWallpaper: vi.fn(),
  wallpaperUrl: (name: string) => `/api/wallpapers/${name}`,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("DashboardTitleField", () => {
  it("saves a trimmed name on Enter or blur, and only when it changed", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DashboardTitleField title="" onChange={onChange} />);

    const input = screen.getByRole("textbox", { name: "Dashboard name" });
    await user.type(input, "  Homelab {Enter}");
    expect(onChange).toHaveBeenCalledWith("Homelab");
    expect((input as HTMLInputElement).value).toBe("Homelab");

    cleanup();
    onChange.mockClear();
    render(<DashboardTitleField title="Homelab" onChange={onChange} />);
    fireEvent.blur(screen.getByRole("textbox"));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("WallpaperSettings", () => {
  const none = { wallpaper: null, wallpaperBlur: 0, wallpaperDim: 40 };
  const withWallpaper = { ...none, wallpaper: "wallpaper-0123456789abcdef.png" };

  it("uploads an image and saves it as the wallpaper", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    vi.mocked(wallpapersApi.uploadWallpaper).mockResolvedValue("wallpaper-aaaaaaaaaaaaaaaa.jpg");
    render(<WallpaperSettings appearance={none} onChange={onChange} onPreview={vi.fn()} />);

    expect(screen.queryByRole("slider")).toBeNull();
    const file = new File(["x"], "sunset.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText("Wallpaper"), file);

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({ wallpaper: "wallpaper-aaaaaaaaaaaaaaaa.jpg" })
    );
    expect(wallpapersApi.uploadWallpaper).toHaveBeenCalledWith(file);
  });

  it("explains a failed upload", async () => {
    const user = userEvent.setup();
    vi.mocked(wallpapersApi.uploadWallpaper).mockRejectedValue(new Error("Too big"));
    render(<WallpaperSettings appearance={none} onChange={vi.fn()} onPreview={vi.fn()} />);

    await user.upload(
      screen.getByLabelText("Wallpaper"),
      new File(["x"], "huge.png", { type: "image/png" })
    );

    expect((await screen.findByRole("alert")).textContent).toBe("Too big");
  });

  it("removes the wallpaper", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <WallpaperSettings appearance={withWallpaper} onChange={onChange} onPreview={vi.fn()} />
    );

    expect(screen.getByRole("img", { name: "Current wallpaper" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(onChange).toHaveBeenCalledWith({ wallpaper: null });
  });

  it("previews slider changes at once and saves them once they settle", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const onPreview = vi.fn();
    render(
      <WallpaperSettings appearance={withWallpaper} onChange={onChange} onPreview={onPreview} />
    );

    fireEvent.change(screen.getByRole("slider", { name: "Wallpaper blur" }), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByRole("slider", { name: "Wallpaper dim" }), {
      target: { value: "70" },
    });

    expect(onPreview).toHaveBeenLastCalledWith({ wallpaperBlur: 10, wallpaperDim: 70 });
    expect(screen.getByText("10px")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(400));
    expect(onChange).toHaveBeenCalledWith({ wallpaperBlur: 10, wallpaperDim: 70 });
  });

  it("saves a pending change and drops the preview when settings close", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const onPreview = vi.fn();
    const view = render(
      <WallpaperSettings appearance={withWallpaper} onChange={onChange} onPreview={onPreview} />
    );

    fireEvent.change(screen.getByRole("slider", { name: "Wallpaper dim" }), {
      target: { value: "20" },
    });
    view.unmount();

    expect(onChange).toHaveBeenCalledWith({ wallpaperDim: 20 });
    expect(onPreview).toHaveBeenLastCalledWith(null);
  });
});

describe("CustomCssSettings", () => {
  it("applies edits only when asked, and clears them", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CustomCssSettings customCss="" onChange={onChange} />);

    const apply = screen.getByRole("button", { name: "Apply" });
    expect(apply.hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();

    fireEvent.change(screen.getByRole("textbox", { name: "Custom CSS" }), {
      target: { value: "body { color: red; }" },
    });
    await user.click(apply);
    expect(onChange).toHaveBeenCalledWith("body { color: red; }");

    cleanup();
    onChange.mockClear();
    render(<CustomCssSettings customCss="body { color: red; }" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenCalledWith("");
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
  });
});
