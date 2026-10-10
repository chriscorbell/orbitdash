// @vitest-environment happy-dom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Wallpaper } from "@/components/Wallpaper";

afterEach(() => cleanup());

describe("Wallpaper", () => {
  it("renders nothing and clears the page flag without a wallpaper", () => {
    document.documentElement.dataset.wallpaper = "";
    const { container } = render(
      <Wallpaper wallpaper={null} wallpaperBlur={0} wallpaperDim={40} />
    );
    expect(container.firstChild).toBeNull();
    expect(document.documentElement.dataset.wallpaper).toBeUndefined();
  });

  it("fades the image in once loaded, blurred, scaled and dimmed", () => {
    const { container, unmount } = render(
      <Wallpaper wallpaper="wallpaper-0123456789abcdef.png" wallpaperBlur={16} wallpaperDim={60} />
    );
    expect(document.documentElement.dataset.wallpaper).toBe("");

    const image = container.querySelector("img")!;
    expect(image.getAttribute("src")).toBe("/api/wallpapers/wallpaper-0123456789abcdef.png");
    expect(image.style.opacity).toBe("0");
    expect(image.style.filter).toBe("blur(16px)");
    expect(image.style.transform).toBe("scale(1.08)");
    fireEvent.load(image);
    expect(image.style.opacity).toBe("1");

    // The dimming layer sits over the image (its color-mix() style is beyond happy-dom).
    expect(image.nextElementSibling).not.toBeNull();

    unmount();
    expect(document.documentElement.dataset.wallpaper).toBeUndefined();
  });

  it("leaves a sharp image unscaled", () => {
    const { container } = render(
      <Wallpaper wallpaper="wallpaper-0123456789abcdef.png" wallpaperBlur={0} wallpaperDim={0} />
    );
    const image = container.querySelector("img")!;
    expect(image.style.filter).toBe("");
    expect(image.style.transform).toBe("scale(1)");
  });
});
