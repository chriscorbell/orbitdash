// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IntegrationLayer } from "@/components/integrations/IntegrationLayer";
import { IntegrationStats } from "@/components/integrations/IntegrationStats";
import { setIntegrationReadings, useIntegrationReading } from "@/lib/integration-readings";
import { createQueryWrapper } from "@/test/query";
import type { IntegrationReading } from "@shared/types";

const api = vi.hoisted(() => ({
  fetchIntegrationReadings: vi.fn(),
  listener: null as null | ((serviceId: string, reading: IntegrationReading) => void),
}));
vi.mock("@/lib/api/integrations", () => ({
  fetchIntegrationReadings: api.fetchIntegrationReadings,
  subscribeIntegrations: (listener: (serviceId: string, reading: IntegrationReading) => void) => {
    api.listener = listener;
    return () => {};
  },
}));

const reading = (
  stats: IntegrationReading["stats"],
  error: string | null = null
): IntegrationReading => ({
  type: "sonarr",
  stats,
  error,
  updatedAt: 1,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("IntegrationStats", () => {
  it("shows figures with their tones, or the reason they're missing", () => {
    render(
      <IntegrationStats
        reading={reading([
          { label: "Queue", value: "3", tone: "good" },
          { label: "Missing", value: "12", tone: "warning" },
          { label: "Nodes", value: "1/2", tone: "bad" },
          { label: "This week", value: "4" },
        ])}
      />
    );
    expect(screen.getByText("3").className).toContain("text-success");
    expect(screen.getByText("12").className).toContain("text-warning");
    expect(screen.getByText("1/2").className).toContain("text-destructive");
    expect(screen.getByText("This week")).toBeTruthy();

    cleanup();
    render(<IntegrationStats reading={reading([], "It refused the credentials")} />);
    expect(screen.getByText("It refused the credentials")).toBeTruthy();
    cleanup();
    const { container } = render(<IntegrationStats reading={reading([])} />);
    expect(container.textContent).toBe("");
  });
});

function Reading({ id }: { id: string }) {
  const value = useIntegrationReading(id);
  return <p data-testid={id}>{value ? value.stats.map((stat) => stat.value).join(",") : "none"}</p>;
}

describe("IntegrationLayer", () => {
  it("loads readings for cards and applies live updates", async () => {
    api.fetchIntegrationReadings.mockResolvedValue({
      a: reading([{ label: "Queue", value: "3" }]),
    });
    setIntegrationReadings({});
    const { wrapper } = createQueryWrapper();
    render(
      <>
        <IntegrationLayer />
        <Reading id="a" />
        <Reading id="b" />
      </>,
      { wrapper }
    );
    await waitFor(() => expect(screen.getByTestId("a").textContent).toBe("3"));
    expect(screen.getByTestId("b").textContent).toBe("none");

    api.listener?.("b", reading([{ label: "Queue", value: "7" }]));
    await waitFor(() => expect(screen.getByTestId("b").textContent).toBe("7"));
  });
});
