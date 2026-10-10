// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WidgetSettings } from "@/components/settings/WidgetSettings";
import { createQueryWrapper } from "@/test/query";
import {
  DEFAULT_DASHBOARD_SETTINGS,
  type DashboardWidgetSettings,
} from "@shared/dashboard-settings";

const api = vi.hoisted(() => ({
  searchPlaces: vi.fn(),
  fetchAgendaFeeds: vi.fn(),
  addAgendaFeed: vi.fn(),
  removeAgendaFeed: vi.fn(),
}));

vi.mock("@/lib/api/widgets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/widgets")>()),
  ...api,
}));

function renderSettings(overrides: Partial<DashboardWidgetSettings>) {
  const onChange = vi.fn();
  render(
    <WidgetSettings
      widgets={{ ...DEFAULT_DASHBOARD_SETTINGS.widgets, ...overrides }}
      onChange={onChange}
    />,
    { wrapper: createQueryWrapper().wrapper }
  );
  return { onChange, user: userEvent.setup() };
}

beforeEach(() => {
  api.searchPlaces.mockResolvedValue([
    {
      id: 1,
      name: "Portland",
      region: "Oregon",
      country: "United States",
      latitude: 45.5,
      longitude: -122.7,
    },
  ]);
  api.fetchAgendaFeeds.mockResolvedValue([{ id: "f1", name: "Work", host: "cal.example.com" }]);
  api.addAgendaFeed.mockResolvedValue({ id: "f2", name: "Family", host: "family.example.com" });
  api.removeAgendaFeed.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("WidgetSettings", () => {
  it("picks a weather place from search and switches units", async () => {
    const { onChange, user } = renderSettings({ weather: true });
    await user.type(screen.getByLabelText("Place"), "Portl");
    await user.click(
      await screen.findByRole("button", { name: "Portland, Oregon, United States" })
    );
    expect(onChange).toHaveBeenCalledWith({
      weatherLocation: {
        name: "Portland, Oregon, United States",
        latitude: 45.5,
        longitude: -122.7,
      },
    });
    expect(api.searchPlaces).toHaveBeenCalledWith("Portl");
    await user.click(screen.getByRole("radio", { name: "°F" }));
    expect(onChange).toHaveBeenLastCalledWith({ weatherUnits: "imperial" });
  });

  it("clears the place and says when nothing matches", async () => {
    api.searchPlaces.mockResolvedValue([]);
    const { onChange, user } = renderSettings({
      weather: true,
      weatherLocation: { name: "Portland", latitude: 1, longitude: 2 },
    });
    await user.click(screen.getByRole("button", { name: "Clear the place" }));
    expect(onChange).toHaveBeenCalledWith({ weatherLocation: null });
    await user.type(screen.getByLabelText("Place"), "zzzz");
    expect(await screen.findByText("No places match.")).toBeTruthy();
  });

  it("adds and removes calendars and changes how far ahead to look", async () => {
    const { onChange, user } = renderSettings({ agenda: true });
    expect(await screen.findByText("Work")).toBeTruthy();

    await user.type(screen.getByLabelText("Calendar link"), "webcal://family.example.com/x.ics");
    await user.type(screen.getByLabelText("Calendar name"), "Family");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(api.addAgendaFeed).toHaveBeenCalled());
    expect(api.addAgendaFeed.mock.calls[0][0]).toEqual({
      name: "Family",
      url: "webcal://family.example.com/x.ics",
    });
    await waitFor(() =>
      expect((screen.getByLabelText("Calendar link") as HTMLInputElement).value).toBe("")
    );

    await user.click(screen.getByRole("button", { name: "Remove Work" }));
    await waitFor(() => expect(api.removeAgendaFeed).toHaveBeenCalled());
    expect(api.removeAgendaFeed.mock.calls[0][0]).toBe("f1");

    await user.click(screen.getByRole("radio", { name: "2 weeks" }));
    expect(onChange).toHaveBeenCalledWith({ agendaDays: 14 });
  });

  it("shows why a calendar couldn't be added", async () => {
    api.addAgendaFeed.mockRejectedValue(new Error("The calendar answered HTTP 404"));
    const { user } = renderSettings({ agenda: true });
    await user.type(screen.getByLabelText("Calendar link"), "https://cal.example.com/x.ics");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect((await screen.findByRole("alert")).textContent).toBe("The calendar answered HTTP 404");
  });
});
