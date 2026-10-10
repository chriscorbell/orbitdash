// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationSettings } from "@/components/settings/notifications/NotificationSettings";
import * as api from "@/lib/api/notifications";
import { createTestQueryClient } from "@/test/query";
import { DEFAULT_NOTIFICATION_OPTIONS } from "@shared/notifications";
import type {
  NotificationChannel,
  NotificationDelivery,
  NotificationsResponse,
} from "@shared/types";

vi.mock("@/lib/api/notifications", () => ({
  fetchNotifications: vi.fn(),
  createNotificationChannel: vi.fn(),
  updateNotificationChannel: vi.fn(),
  deleteNotificationChannel: vi.fn(),
  testNotificationChannel: vi.fn(),
  updateNotificationOptions: vi.fn(),
}));
vi.mock("@/hooks/useConfigChanges", () => ({ useConfigChanges: vi.fn() }));

const channelBase = { events: { status: true, alerts: true }, createdAt: 1, updatedAt: 1 };
const phone: NotificationChannel = {
  ...channelBase,
  id: "phone",
  name: "Phone",
  type: "ntfy",
  config: { server: "https://ntfy.sh", topic: "••••erts", token: null, priority: 4, tags: [] },
};
const hook: NotificationChannel = {
  ...channelBase,
  id: "hook",
  name: "Home Assistant",
  events: { status: false, alerts: true },
  type: "webhook",
  config: {
    url: "https://ha.example.com/••••abcd",
    headers: [{ name: "Authorization", value: "••••" }],
  },
};

function delivery(id: number, overrides: Partial<NotificationDelivery> = {}): NotificationDelivery {
  return {
    id,
    channelId: "phone",
    channelName: "Phone",
    channelType: "ntfy",
    event: "service.down",
    title: `Message ${id}`,
    ok: true,
    attempts: 1,
    error: null,
    sentAt: Date.now(),
    ...overrides,
  };
}

function respond(overrides: Partial<NotificationsResponse> = {}) {
  vi.mocked(api.fetchNotifications).mockResolvedValue({
    channels: [],
    options: DEFAULT_NOTIFICATION_OPTIONS,
    deliveries: [],
    serverTimeZone: "Etc/UTC",
    ...overrides,
  });
}

function renderSettings() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <NotificationSettings />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.mocked(api.updateNotificationOptions).mockImplementation(async (options) => options);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("NotificationSettings", () => {
  it("adds a first channel from the empty state", async () => {
    const user = userEvent.setup();
    respond();
    const created: NotificationChannel = {
      ...channelBase,
      id: "d",
      name: "Discord",
      type: "discord",
      config: { webhookUrl: "https://discord.com/••••" },
    };
    vi.mocked(api.createNotificationChannel).mockResolvedValue(created);
    renderSettings();

    expect(await screen.findByText("No channels yet")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Add channel" }));
    const dialog = await screen.findByRole("dialog", { name: "Add channel" });
    await user.click(within(dialog).getByRole("radio", { name: "Discord" }));
    await user.type(
      within(dialog).getByLabelText("Webhook URL"),
      "https://discord.com/api/webhooks/1/abc"
    );
    await user.click(within(dialog).getByRole("button", { name: "Add channel" }));

    expect(api.createNotificationChannel).toHaveBeenCalledWith({
      name: "Discord",
      events: { status: true, alerts: true },
      type: "discord",
      config: { webhookUrl: "https://discord.com/api/webhooks/1/abc" },
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("list", { name: "Notification channels" }).textContent).toContain(
      "discord.com"
    );
  });

  it("points at the field that needs attention", async () => {
    const user = userEvent.setup();
    respond();
    renderSettings();
    await user.click(await screen.findByRole("button", { name: "Add channel" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Add channel" }));

    const topic = within(dialog).getByLabelText("Topic");
    expect(within(dialog).getByRole("alert").textContent).toBe("Enter a topic.");
    expect(topic.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(topic);
    expect(api.createNotificationChannel).not.toHaveBeenCalled();

    await user.type(topic, "alerts");
    expect(topic.getAttribute("aria-invalid")).toBeNull();
  });

  it("tests an unsaved channel from the form and shows the answer", async () => {
    const user = userEvent.setup();
    respond();
    vi.mocked(api.testNotificationChannel).mockResolvedValue({
      ok: false,
      error: "HTTP 401: unauthorized",
      delivery: null,
    });
    renderSettings();
    await user.click(await screen.findByRole("button", { name: "Add channel" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Topic"), "alerts");
    await user.type(within(dialog).getByLabelText(/Access token/), "tk_x");
    await user.click(within(dialog).getByRole("button", { name: "Send test" }));

    expect(api.testNotificationChannel).toHaveBeenCalledWith(null, {
      name: "ntfy",
      events: { status: true, alerts: true },
      type: "ntfy",
      config: {
        server: "https://ntfy.sh",
        topic: "alerts",
        token: "tk_x",
        priority: 4,
        tags: [],
      },
    });
    expect(await within(dialog).findByText("HTTP 401: unauthorized")).toBeTruthy();

    vi.mocked(api.testNotificationChannel).mockRejectedValue(new Error("network down"));
    await user.click(within(dialog).getByRole("button", { name: "Send test" }));
    expect(await within(dialog).findByText("Network down.")).toBeTruthy();
  });

  it("tests saved channels from the list and adds them to the log", async () => {
    const user = userEvent.setup();
    respond({ channels: [phone, hook] });
    vi.mocked(api.testNotificationChannel).mockResolvedValue({
      ok: true,
      error: null,
      delivery: delivery(9, { event: "test", title: "Test notification" }),
    });
    renderSettings();

    await user.click(await screen.findByRole("button", { name: "Send a test to Phone" }));
    expect(api.testNotificationChannel).toHaveBeenCalledWith("phone", undefined);
    expect(await screen.findByText("Test sent")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Recent deliveries" })).toBeTruthy();
    expect(screen.getByText("Test notification")).toBeTruthy();

    vi.mocked(api.testNotificationChannel).mockRejectedValue(new Error("sign in to make changes"));
    await user.click(screen.getByRole("button", { name: "Send a test to Home Assistant" }));
    expect(await screen.findByText("Sign in to make changes.")).toBeTruthy();
    expect(screen.getByText(/ha\.example\.com/).textContent).toContain("Alerts only");
  });

  it("saves edits without resending secrets, and deletes after confirming", async () => {
    const user = userEvent.setup();
    respond({ channels: [hook] });
    vi.mocked(api.updateNotificationChannel).mockResolvedValue({ ...hook, name: "HA" });
    vi.mocked(api.deleteNotificationChannel).mockResolvedValue();
    renderSettings();

    await user.click(await screen.findByRole("button", { name: "Edit Home Assistant" }));
    let dialog = await screen.findByRole("dialog", { name: "Edit Home Assistant" });
    expect(within(dialog).queryByRole("radiogroup")).toBeNull();
    expect(within(dialog).getByLabelText("URL").getAttribute("placeholder")).toBe(
      "Saved (https://ha.example.com/••••abcd)"
    );
    const name = within(dialog).getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "HA");
    await user.click(within(dialog).getByRole("checkbox", { name: "Status changes" }));
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(api.updateNotificationChannel).toHaveBeenCalledWith("hook", {
      name: "HA",
      events: { status: true, alerts: true },
      type: "webhook",
      config: { headers: [{ name: "Authorization" }] },
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await user.click(screen.getByRole("button", { name: "Edit HA" }));
    dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(api.deleteNotificationChannel).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Delete channel?" }));
    expect(api.deleteNotificationChannel).toHaveBeenCalledWith("hook");
    expect(await screen.findByText("No channels yet")).toBeTruthy();
  });

  it("edits webhook headers in the form", async () => {
    const user = userEvent.setup();
    respond({ channels: [hook] });
    vi.mocked(api.updateNotificationChannel).mockRejectedValue(
      new Error("header X-New needs a value")
    );
    renderSettings();
    await user.click(await screen.findByRole("button", { name: "Edit Home Assistant" }));
    const dialog = await screen.findByRole("dialog");

    await user.click(within(dialog).getByRole("button", { name: "Remove header Authorization" }));
    await user.click(within(dialog).getByRole("button", { name: "Add header" }));
    await user.type(within(dialog).getByLabelText("Header 1 name"), "X-New");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(within(dialog).getByRole("alert").textContent).toBe("Enter a value for X-New.");

    await user.type(within(dialog).getByLabelText("Header 1 value"), "1");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(await within(dialog).findByText("Header X-New needs a value.")).toBeTruthy();
  });

  it("removes a saved ntfy token on request", async () => {
    const user = userEvent.setup();
    respond({
      channels: [
        { ...phone, config: { ...phone.config, token: "••••1234" } } as NotificationChannel,
      ],
    });
    vi.mocked(api.updateNotificationChannel).mockResolvedValue(phone);
    renderSettings();
    await user.click(await screen.findByRole("button", { name: "Edit Phone" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Remove token" }));
    expect(
      within(dialog)
        .getByLabelText(/Access token/)
        .hasAttribute("disabled")
    ).toBe(true);
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(vi.mocked(api.updateNotificationChannel).mock.calls[0][1].config).toMatchObject({
      token: null,
    });
  });

  it("saves quiet hours and keeps an empty window from saving", async () => {
    const user = userEvent.setup();
    respond();
    renderSettings();

    // The mutation function also receives TanStack's context; only the options matter.
    const lastSaved = () => vi.mocked(api.updateNotificationOptions).mock.calls.at(-1)?.[0];

    await user.click(await screen.findByRole("switch", { name: "Quiet hours" }));
    await waitFor(() =>
      expect(lastSaved()).toEqual({
        ...DEFAULT_NOTIFICATION_OPTIONS,
        quietHours: { enabled: true, start: "22:00", end: "07:00" },
      })
    );

    const start = await screen.findByLabelText("Quiet hours start");
    fireEvent.change(start, { target: { value: "23:30" } });
    fireEvent.keyDown(start, { key: "Enter" });
    await waitFor(() =>
      expect(lastSaved()).toEqual({
        ...DEFAULT_NOTIFICATION_OPTIONS,
        quietHours: { enabled: true, start: "23:30", end: "07:00" },
      })
    );
    expect((start as HTMLInputElement).value).toBe("23:30");

    // Leaving one field for the other saves without taking focus away.
    const end = screen.getByLabelText("Quiet hours end");
    start.focus();
    fireEvent.change(start, { target: { value: "22:15" } });
    await user.tab();
    expect(document.activeElement).toBe(end);
    await waitFor(() =>
      expect(lastSaved()).toMatchObject({ quietHours: { start: "22:15", end: "07:00" } })
    );

    // A window that starts and ends at the same time goes back to the saved one.
    const calls = vi.mocked(api.updateNotificationOptions).mock.calls.length;
    fireEvent.change(end, { target: { value: "22:15" } });
    expect((end as HTMLInputElement).value).toBe("22:15");
    fireEvent.blur(end);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(vi.mocked(api.updateNotificationOptions).mock.calls.length).toBe(calls);
    expect((end as HTMLInputElement).value).toBe("07:00");
  });

  it("shows the newest deliveries and the rest on request", async () => {
    const user = userEvent.setup();
    respond({
      channels: [phone],
      deliveries: [
        delivery(7, { ok: false, error: "HTTP 502", attempts: 3, title: "Plex is down" }),
        ...Array.from({ length: 6 }, (_, index) => delivery(6 - index)),
      ],
    });
    renderSettings();

    expect(await screen.findByText("Plex is down")).toBeTruthy();
    expect(screen.getByText(/HTTP 502 after 3 tries/)).toBeTruthy();
    expect(screen.queryByText("Message 1")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Show all 7" }));
    expect(screen.getByText("Message 1")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(screen.queryByText("Message 1")).toBeNull();
  });

  it("says when notifications can't load", async () => {
    vi.mocked(api.fetchNotifications).mockRejectedValue(new Error("Failed to load notifications"));
    renderSettings();
    expect((await screen.findByRole("alert")).textContent).toBe("Failed to load notifications");
  });
});
