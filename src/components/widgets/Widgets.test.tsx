// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeaderWidgets, WidgetRow } from "@/components/widgets/Widgets";
import { createQueryWrapper } from "@/test/query";
import {
  DEFAULT_DASHBOARD_SETTINGS,
  type DashboardWidgetSettings,
} from "@shared/dashboard-settings";
import type { AgendaResponse, WeatherReport } from "@shared/types";

const api = vi.hoisted(() => ({
  fetchWeather: vi.fn(),
  fetchAgenda: vi.fn(),
  fetchAgendaFeeds: vi.fn(),
}));

vi.mock("@/lib/api/widgets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/widgets")>()),
  ...api,
}));

const NOW = new Date(2026, 9, 10, 9, 0);
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 9, day, hour, minute).toISOString();

const report: WeatherReport = {
  timezone: "America/Los_Angeles",
  current: {
    temperature: 10.4,
    apparentTemperature: 7.6,
    weatherCode: 3,
    isDay: true,
    windSpeed: 9,
    humidity: 70,
  },
  daily: [
    { date: "2026-10-10", weatherCode: 51, max: 16.9, min: 9.2, precipitationChance: 40 },
    { date: "2026-10-11", weatherCode: 0, max: 18, min: 7, precipitationChance: 0 },
    { date: "2026-10-12", weatherCode: 61, max: 14, min: 8, precipitationChance: 80 },
  ],
  units: { temperature: "°C", windSpeed: "km/h" },
  fetchedAt: 1,
};

const agenda: AgendaResponse = {
  events: [
    {
      id: "1",
      feedId: "f",
      title: "Standup",
      location: null,
      allDay: false,
      start: at(10, 9, 30),
      end: at(10, 9, 45),
    },
    {
      id: "2",
      feedId: "f",
      title: "Dinner",
      location: "Home",
      allDay: false,
      start: at(10, 19),
      end: at(10, 21),
    },
    {
      id: "3",
      feedId: "f",
      title: "Hike",
      location: null,
      allDay: true,
      start: "2026-10-11",
      end: "2026-10-12",
    },
  ],
  errors: [],
};

const widgets = (overrides: Partial<DashboardWidgetSettings>): DashboardWidgetSettings => ({
  ...DEFAULT_DASHBOARD_SETTINGS.widgets,
  ...overrides,
});
const portland = { name: "Portland, Oregon, United States", latitude: 45.5, longitude: -122.7 };

function renderRow(settings: DashboardWidgetSettings, onOpenSettings = vi.fn()) {
  render(<WidgetRow widgets={settings} onOpenSettings={onOpenSettings} />, {
    wrapper: createQueryWrapper().wrapper,
  });
  return { onOpenSettings };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  api.fetchWeather.mockResolvedValue(report);
  api.fetchAgenda.mockResolvedValue(agenda);
  api.fetchAgendaFeeds.mockResolvedValue([{ id: "f", name: "Work", host: "cal.example.com" }]);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("WidgetRow", () => {
  it("renders nothing when every widget is off", () => {
    renderRow(DEFAULT_DASHBOARD_SETTINGS.widgets);
    expect(screen.queryByRole("region", { name: "Widgets" })).toBeNull();
  });

  it("shows the clock with a greeting and the date", () => {
    renderRow(widgets({ clock: true, greeting: true, clockFormat: "24h" }));
    const clock = screen.getByRole("group", { name: "Clock" });
    expect(within(clock).getByText("Good morning")).toBeTruthy();
    expect(within(clock).getByText("09:00")).toBeTruthy();
    expect(within(clock).getByText(/October 10/)).toBeTruthy();
  });

  it("shows current weather and the coming days", async () => {
    renderRow(widgets({ weather: true, weatherLocation: portland, weatherUnits: "imperial" }));
    const panel = await screen.findByRole("group", { name: `Weather in ${portland.name}` });
    expect(within(panel).getByText("10°")).toBeTruthy();
    expect(within(panel).getByText("Overcast")).toBeTruthy();
    expect(within(panel).getByText("Portland · H 17° L 9°")).toBeTruthy();
    expect(
      within(within(panel).getByRole("list", { name: "Forecast" })).getAllByRole("listitem")
    ).toHaveLength(2);
    expect(api.fetchWeather).toHaveBeenCalledWith(portland, "imperial");
  });

  it("asks for a place before showing weather, and reports outages", async () => {
    const { onOpenSettings } = renderRow(widgets({ weather: true }));
    await userEvent.setup().click(screen.getByRole("button", { name: "Choose a place" }));
    expect(onOpenSettings).toHaveBeenCalled();
    expect(api.fetchWeather).not.toHaveBeenCalled();

    cleanup();
    api.fetchWeather.mockRejectedValue(new Error("Weather is unavailable right now"));
    renderRow(widgets({ weather: true, weatherLocation: portland }));
    expect(await screen.findByText("Weather is unavailable right now")).toBeTruthy();
  });

  it("lists what's coming up by day", async () => {
    renderRow(widgets({ agenda: true, agendaDays: 3, clockFormat: "24h" }));
    const panel = await screen.findByRole("group", { name: "Agenda" });
    await waitFor(() => expect(within(panel).getByText("Standup")).toBeTruthy());
    expect(within(panel).getByText("Today")).toBeTruthy();
    expect(within(panel).getByText("09:30")).toBeTruthy();
    expect(within(panel).getByText("Tomorrow")).toBeTruthy();
    expect(within(panel).getByText("All day")).toBeTruthy();
    expect(api.fetchAgenda).toHaveBeenCalledWith(3);
  });

  it("caps the list and notes calendars that failed", async () => {
    api.fetchAgenda.mockResolvedValue({
      events: Array.from({ length: 6 }, (_, index) => ({
        ...agenda.events[0],
        id: `e${index}`,
        title: `Event ${index}`,
        start: at(10, 10 + index),
        end: at(10, 11 + index),
      })),
      errors: [{ feedId: "g", name: "Family", error: "HTTP 404" }],
    });
    renderRow(widgets({ agenda: true }));
    expect(await screen.findByText("2 more")).toBeTruthy();
    expect(screen.queryByText("Event 4")).toBeNull();
    expect(screen.getByText("Family couldn't be loaded")).toBeTruthy();
  });

  it("explains an empty agenda and a missing calendar", async () => {
    api.fetchAgenda.mockResolvedValue({ events: [], errors: [] });
    renderRow(widgets({ agenda: true, agendaDays: 1 }));
    expect(await screen.findByText("Nothing else today.")).toBeTruthy();

    cleanup();
    api.fetchAgendaFeeds.mockResolvedValue([]);
    const { onOpenSettings } = renderRow(widgets({ agenda: true }));
    await userEvent.setup().click(await screen.findByRole("button", { name: "Add a calendar" }));
    expect(onOpenSettings).toHaveBeenCalled();
  });
});

describe("HeaderWidgets", () => {
  it("shows the temperature and the next event as pills", async () => {
    render(
      <HeaderWidgets
        widgets={widgets({
          placement: "header",
          weather: true,
          weatherLocation: portland,
          agenda: true,
          clockFormat: "24h",
        })}
      />,
      { wrapper: createQueryWrapper().wrapper }
    );
    const weather = await screen.findByTitle(/Overcast in Portland/);
    expect(weather.textContent).toContain("10°");
    expect(await screen.findByTitle("09:30: Standup")).toBeTruthy();
  });
});
