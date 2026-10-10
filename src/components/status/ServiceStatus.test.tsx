// @vitest-environment happy-dom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceStatusIndicator, ServiceStatusTooltip } from "@/components/status/ServiceStatus";
import * as statusApi from "@/lib/api/status";
import type { ConnectionEvent, EventStream } from "@/lib/live/event-stream";
import { createQueryWrapper } from "@/test/query";
import type { StatusEvent } from "@shared/events";
import type { Service, ServiceStatus, StatusHistory } from "@shared/types";

vi.mock("@/lib/api/status", () => ({
  fetchStatuses: vi.fn(),
  fetchStatusHistory: vi.fn(),
}));

const fetchStatuses = vi.mocked(statusApi.fetchStatuses);
const fetchStatusHistory = vi.mocked(statusApi.fetchStatusHistory);

const NOW = new Date(2026, 9, 10, 15, 30).getTime();

const service: Service = {
  id: "svc",
  name: "Jellyfin",
  url: "http://media.lan:8096/",
  description: "Movies and shows",
  icon: null,
  icon_source_url: null,
  category: null,
  category_id: null,
  position: 0,
  open_in_new_tab: true,
  created_at: 1,
  updated_at: 1,
  check_enabled: true,
  check_method: "http",
  check_target: null,
  check_interval: 60,
  check_ignore_tls: false,
  external_url: null,
  links: [],
  tags: [],
};

const up: ServiceStatus = {
  id: "svc",
  state: "up",
  latencyMs: 42,
  statusCode: 200,
  error: null,
  checkedAt: NOW - 10_000,
  changedAt: NOW - (3 * 60 + 12) * 60_000,
};

function history(overrides: Partial<StatusHistory> = {}): StatusHistory {
  return {
    id: "svc",
    range: "24h",
    resolutionMs: 1_800_000,
    from: NOW - 86_400_000,
    to: NOW,
    uptime: 99.93,
    buckets: Array.from({ length: 48 }, (_, index) => ({
      ts: NOW - (48 - index) * 1_800_000,
      checks: index === 0 ? 0 : 30,
      failures: index === 47 ? 30 : index === 46 ? 1 : 0,
      slow: 0,
      latencyMs: 40,
    })),
    ...overrides,
  };
}

/** An event stream the test drives by hand. */
function createFakeStream() {
  const statusListeners = new Set<(event: StatusEvent) => void>();
  const connectionListeners = new Set<(event: ConnectionEvent) => void>();
  const stream: EventStream = {
    onConnection: (listener) => {
      connectionListeners.add(listener);
      return () => connectionListeners.delete(listener);
    },
    subscribe: ((topic: string, listener: (event: StatusEvent) => void) => {
      if (topic !== "status") throw new Error(`unexpected topic ${topic}`);
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    }) as EventStream["subscribe"],
  };
  return {
    stream,
    emit: (event: StatusEvent) => act(() => statusListeners.forEach((listener) => listener(event))),
    connection: (event: ConnectionEvent) =>
      act(() => connectionListeners.forEach((listener) => listener(event))),
    listenerCount: () => statusListeners.size,
  };
}

function renderWithClient(ui: ReactNode) {
  const { wrapper: Wrapper, client } = createQueryWrapper();
  return { client, ...render(<Wrapper>{ui}</Wrapper>) };
}

const dot = () => document.querySelector<HTMLElement>("[data-status]");

let animate: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  fetchStatuses.mockResolvedValue([up]);
  fetchStatusHistory.mockResolvedValue(history());
  animate = vi.fn();
  Element.prototype.animate = animate as unknown as Element["animate"];
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ServiceStatusIndicator", () => {
  it("shows the dot and, in the comfortable density, the response time", async () => {
    const { stream } = createFakeStream();
    renderWithClient(
      <ServiceStatusIndicator density="comfortable" serviceId="svc" stream={stream} />
    );

    await waitFor(() => expect(dot()?.dataset.status).toBe("up"));
    expect(screen.getByText("42 ms")).toBeTruthy();
    expect(screen.getByText("Up").className).toContain("sr-only");
  });

  it("leaves the response time to the details in compact cards and tiles", async () => {
    const { stream } = createFakeStream();
    renderWithClient(
      <>
        <ServiceStatusIndicator density="compact" serviceId="svc" stream={stream} />
        <ServiceStatusIndicator density="tiles" serviceId="svc" stream={stream} />
      </>
    );

    await waitFor(() => expect(document.querySelectorAll('[data-status="up"]')).toHaveLength(2));
    expect(screen.queryByText("42 ms")).toBeNull();
  });

  it("is grey until the first check", async () => {
    fetchStatuses.mockResolvedValue([]);
    const { stream } = createFakeStream();
    renderWithClient(
      <ServiceStatusIndicator density="comfortable" serviceId="svc" stream={stream} />
    );

    await waitFor(() => expect(dot()?.dataset.status).toBe("unknown"));
    expect(screen.getByText("Not checked yet")).toBeTruthy();
    expect(animate).not.toHaveBeenCalled();
  });

  it("follows status events and animates only real changes", async () => {
    const fake = createFakeStream();
    renderWithClient(
      <ServiceStatusIndicator density="comfortable" serviceId="svc" stream={fake.stream} />
    );
    await waitFor(() => expect(dot()?.dataset.status).toBe("up"));
    expect(animate).not.toHaveBeenCalled();

    // The first status to load fades in without the change animation.
    fake.emit({ type: "status", id: "svc", status: { ...up, latencyMs: 55 } });
    expect(await screen.findByText("55 ms")).toBeTruthy();
    expect(animate).not.toHaveBeenCalled();

    fake.emit({
      type: "status",
      id: "svc",
      status: { ...up, state: "down", latencyMs: null, error: "Timed out" },
    });
    await waitFor(() => expect(dot()?.dataset.status).toBe("down"));
    expect(screen.queryByText(/ms$/)).toBeNull();
    // The dot pops and one ring goes out.
    expect(animate).toHaveBeenCalledTimes(2);

    fake.emit({ type: "status", id: "other", status: { ...up, id: "other" } });
    fake.emit({ type: "status", id: "svc", status: null });
    await waitFor(() => expect(dot()?.dataset.status).toBe("unknown"));
    fake.emit({ type: "status", id: "svc", status: null });
    expect(dot()?.dataset.status).toBe("unknown");
  });

  it("keeps still for people who asked for less motion", async () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    const fake = createFakeStream();
    renderWithClient(
      <ServiceStatusIndicator density="comfortable" serviceId="svc" stream={fake.stream} />
    );
    await waitFor(() => expect(dot()?.dataset.status).toBe("up"));

    fake.emit({ type: "status", id: "svc", status: { ...up, state: "degraded" } });
    await waitFor(() => expect(dot()?.dataset.status).toBe("degraded"));
    expect(animate).not.toHaveBeenCalled();
  });

  it("shares one subscription and refetches after missing events", async () => {
    const fake = createFakeStream();
    const view = renderWithClient(
      <>
        <ServiceStatusIndicator density="compact" serviceId="svc" stream={fake.stream} />
        <ServiceStatusIndicator density="tiles" serviceId="svc" stream={fake.stream} />
      </>
    );
    await waitFor(() => expect(fetchStatuses).toHaveBeenCalledTimes(1));
    expect(fake.listenerCount()).toBe(1);

    fake.connection("open");
    expect(fetchStatuses).toHaveBeenCalledTimes(1);

    fake.connection("error");
    fake.connection("open");
    await waitFor(() => expect(fetchStatuses).toHaveBeenCalledTimes(2));

    fake.connection("resumed");
    await waitFor(() => expect(fetchStatuses).toHaveBeenCalledTimes(3));

    view.unmount();
    expect(fake.listenerCount()).toBe(0);
  });
});

describe("ServiceStatusTooltip", () => {
  function renderTooltip(density: "comfortable" | "compact" | "tiles", target = service) {
    const fake = createFakeStream();
    renderWithClient(
      <ServiceStatusTooltip density={density} service={target} stream={fake.stream}>
        <a href={target.url}>{target.name}</a>
      </ServiceStatusTooltip>
    );
    return fake;
  }

  async function open() {
    await waitFor(() => expect(fetchStatuses).toHaveBeenCalled());
    act(() => screen.getByRole("link").focus());
    return screen.findByRole("tooltip");
  }

  it("shows the status, how long it has held and a 24h uptime bar on focus", async () => {
    renderTooltip("comfortable");
    const tooltip = await open();

    expect(tooltip.textContent).toBe("Up. 42 ms. Up for 3h 12m");
    expect(screen.getByText("42 ms")).toBeTruthy();
    expect(screen.getByText("Up for 3h 12m")).toBeTruthy();
    expect(await screen.findByText("99.93% up")).toBeTruthy();

    const segments = [...document.querySelectorAll<HTMLElement>("[data-bucket]")];
    expect(segments).toHaveLength(48);
    expect(segments.map((segment) => segment.dataset.bucket).slice(-3)).toEqual([
      "up",
      "degraded",
      "down",
    ]);
    expect(segments[0].dataset.bucket).toBe("none");
    expect(screen.getByRole("img", { name: "99.93% up in 24 hours" })).toBeTruthy();
    expect(fetchStatusHistory).toHaveBeenCalledWith("svc", "24h");
    // The comfortable card already shows the name and description.
    expect(screen.queryByText("Movies and shows")).toBeNull();
  });

  it("repeats what tiles hide, and says since when a service is down", async () => {
    fetchStatuses.mockResolvedValue([
      {
        ...up,
        state: "down",
        latencyMs: null,
        error: "Connection refused",
        changedAt: NOW - 60_000,
      },
    ]);
    fetchStatusHistory.mockResolvedValue(history({ uptime: null, buckets: [] }));
    renderTooltip("tiles");
    await open();

    expect(screen.getByText("Jellyfin", { selector: "p" })).toBeTruthy();
    expect(screen.getByText("Movies and shows")).toBeTruthy();
    expect(screen.getByText(/^Down since /)).toBeTruthy();
    expect(screen.getByText("Connection refused").className).toContain("text-destructive");
    expect(await screen.findByText("No checks yet")).toBeTruthy();
  });

  it("mentions a single failed check without calling it an outage", async () => {
    fetchStatuses.mockResolvedValue([{ ...up, error: "Timed out" }]);
    renderTooltip("compact");
    await open();

    expect(screen.getByText("Last check failed: Timed out").className).toContain(
      "text-muted-foreground"
    );
    expect(screen.getByText("Movies and shows")).toBeTruthy();
  });

  it("says so when the history can't be loaded", async () => {
    fetchStatuses.mockResolvedValue([]);
    fetchStatusHistory.mockRejectedValue(new Error("offline"));
    renderTooltip("comfortable");
    const tooltip = await open();

    expect(tooltip.textContent).toBe("Not checked yet");
    expect(await screen.findByText("History unavailable")).toBeTruthy();
  });
});
