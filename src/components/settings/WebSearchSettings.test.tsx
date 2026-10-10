// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSearchSettings } from "@/components/settings/WebSearchSettings";

afterEach(() => cleanup());

describe("WebSearchSettings", () => {
  it("hides the URL field unless the engine is custom", () => {
    render(<WebSearchSettings search={{ engine: "google", customUrl: "" }} onChange={vi.fn()} />);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("saves a valid custom URL on blur or Enter and explains an invalid one", () => {
    const onChange = vi.fn();
    render(<WebSearchSettings search={{ engine: "custom", customUrl: "" }} onChange={onChange} />);
    const input = screen.getByRole("textbox", { name: /Search URL/ });

    fireEvent.change(input, { target: { value: "https://example.com/search" } });
    expect(screen.getByText("Use an http or https address that contains %s.")).toBeTruthy();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: " https://searx.lan/search?q=%s " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith({ customUrl: "https://searx.lan/search?q=%s" });
  });
});
