// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AlertSettings } from "@/components/settings/AlertSettings";
import { DEFAULT_ALERT_RULES } from "@shared/alerts";

const updateRules = vi.fn().mockResolvedValue([]);
vi.mock("@/hooks/useAlerts", () => ({
  useAlerts: () => ({ rules: DEFAULT_ALERT_RULES, updateRules }),
}));

afterEach(() => {
  cleanup();
  updateRules.mockClear();
});

describe("AlertSettings", () => {
  it("toggles a rule and saves a threshold within its range", async () => {
    const user = userEvent.setup();
    render(<AlertSettings />);

    await user.click(screen.getByRole("switch", { name: "CPU" }));
    expect(updateRules).toHaveBeenLastCalledWith([
      { metric: "cpu", enabled: false, threshold: 90, durationSec: 300 },
    ]);

    const threshold = screen.getByRole("spinbutton", { name: "Memory threshold" });
    fireEvent.change(threshold, { target: { value: "75" } });
    fireEvent.keyDown(threshold, { key: "Enter" });
    expect(updateRules).toHaveBeenLastCalledWith([
      { metric: "memory", enabled: true, threshold: 75, durationSec: 300 },
    ]);
  });

  it("puts an out-of-range threshold back without saving", () => {
    render(<AlertSettings />);
    const threshold = screen.getByRole("spinbutton", { name: "CPU temperature threshold" });
    fireEvent.change(threshold, { target: { value: "500" } });
    fireEvent.blur(threshold);
    expect((threshold as HTMLInputElement).value).toBe("85");
    expect(updateRules).not.toHaveBeenCalled();
  });
});
