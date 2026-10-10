// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UseCategoryOrderResult } from "@/hooks/useCategoryOrder";
import type { Service } from "@shared/types";

interface MockHeaderProps {
  servicesFirst: boolean;
  showServicesSection: boolean;
  showStatsSection: boolean;
  onServicesFirstChange: (enabled: boolean) => void;
  onShowServicesSectionChange: (enabled: boolean) => void;
  onShowStatsSectionChange: (enabled: boolean) => void;
}

function createLocalStorageMock() {
  let store = new Map<string, string>();

  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store = new Map<string, string>();
    }),
  };
}

const localStorageMock = createLocalStorageMock();

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
  configurable: true,
});

vi.mock("@/components/Footer", () => ({
  Footer: () => <div data-testid="footer" />,
}));

vi.mock("@/components/Header", () => ({
  Header: ({
    servicesFirst,
    showServicesSection,
    showStatsSection,
    onServicesFirstChange,
    onShowServicesSectionChange,
    onShowStatsSectionChange,
  }: MockHeaderProps) => (
    <div>
      <div data-testid="services-first-state">{String(servicesFirst)}</div>
      <button type="button" onClick={() => onServicesFirstChange(!servicesFirst)}>
        Toggle services first
      </button>
      <button type="button" onClick={() => onShowServicesSectionChange(!showServicesSection)}>
        Toggle services section
      </button>
      <button type="button" onClick={() => onShowStatsSectionChange(!showStatsSection)}>
        Toggle stats section
      </button>
    </div>
  ),
}));

vi.mock("@/components/MetricCard", () => ({
  MetricCard: ({ title }: { title: string }) => <div>{title} metric</div>,
}));

vi.mock("@/components/MetricCharts", () => ({
  MetricCharts: () => <div>Charts</div>,
}));

vi.mock("@/components/ServicesSection", () => ({
  ServicesSection: () => <section data-testid="services-section">Services section</section>,
}));

vi.mock("@/hooks/useCategoryOrder", () => ({
  useCategoryOrder: vi.fn(),
}));

vi.mock("@/hooks/useMetrics", () => ({
  useMetrics: vi.fn(),
}));

vi.mock("@/hooks/useServices", () => ({
  useServices: vi.fn(),
}));

vi.mock("@/lib/api/dashboard-settings", async () => {
  const shared = await import("@shared/dashboard-settings");
  let stored = shared.DEFAULT_DASHBOARD_SETTINGS;
  const view = () => ({ device: null, effective: stored, settings: stored, stored: true });
  return {
    fetchDashboardSettings: vi.fn(async () => view()),
    updateSharedSettings: vi.fn(
      async (patch: Parameters<typeof shared.mergeDashboardSettings>[1]) => {
        stored = shared.mergeDashboardSettings(stored, patch);
        return view();
      }
    ),
    updateDeviceSettings: vi.fn(async () => view()),
    resetForTesting: () => {
      stored = shared.DEFAULT_DASHBOARD_SETTINGS;
    },
  };
});

import App from "@/App";
import { useCategoryOrder } from "@/hooks/useCategoryOrder";
import { useMetrics } from "@/hooks/useMetrics";
import { useServices } from "@/hooks/useServices";

const mockedUseCategoryOrder = vi.mocked(useCategoryOrder);
const mockedUseMetrics = vi.mocked(useMetrics);
const mockedUseServices = vi.mocked(useServices);

const categoryOrderStub: UseCategoryOrderResult = {
  draftOrder: [],
  error: null,
  hasNamedCategories: false,
  isDirty: false,
  isReorderMode: false,
  loading: false,
  namedCategories: [],
  saveState: "idle",
  saving: false,
  visibleCategoryOrder: [],
  applyOrder: vi.fn(),
  beginReorder: vi.fn(),
  cancelReorder: vi.fn(),
  moveCategory: vi.fn().mockResolvedValue(undefined),
  reorderCategories: vi.fn().mockResolvedValue(undefined),
  saveOrder: vi.fn().mockResolvedValue(undefined),
};

const serviceStub: Service = {
  id: "svc-1",
  name: "Orbit",
  url: "https://example.com/orbit",
  description: null,
  icon: null,
  icon_source_url: null,
  category: null,
  category_id: null,
  position: 0,
  open_in_new_tab: true,
  created_at: 1,
  updated_at: 1,
};

beforeEach(async () => {
  window.localStorage.clear();
  const settingsApi = (await import("@/lib/api/dashboard-settings")) as unknown as {
    resetForTesting: () => void;
  };
  settingsApi.resetForTesting();

  mockedUseMetrics.mockReturnValue({
    samples: [],
    latest: null,
    status: "connecting",
    error: null,
    recoveredAt: null,
  });

  mockedUseServices.mockReturnValue({
    services: [serviceStub],
    loading: false,
    error: null,
    create: vi.fn().mockResolvedValue(serviceStub),
    update: vi.fn().mockResolvedValue(serviceStub),
    duplicate: vi.fn().mockResolvedValue(serviceStub),
    remove: vi.fn().mockResolvedValue(undefined),
    renameCategory: vi.fn().mockResolvedValue({ services: [], order: [] }),
    reload: vi.fn().mockResolvedValue(undefined),
  });

  mockedUseCategoryOrder.mockReturnValue(categoryOrderStub);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("App", () => {
  it("shows services before stats by default", async () => {
    render(<App />);

    const servicesSection = await screen.findByTestId("services-section");
    const statsHeading = screen.getByRole("heading", { name: "Stats" });

    expect(
      servicesSection.compareDocumentPosition(statsHeading) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.getByTestId("services-first-state").textContent).toBe("true");
  });

  it("can hide each section independently and shows an empty state when both are hidden", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Toggle services section" }));
    expect(screen.queryByTestId("services-section")).toBeNull();
    expect(screen.getByRole("heading", { name: "Stats" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Toggle stats section" }));
    expect(screen.queryByRole("heading", { name: "Stats" })).toBeNull();
    expect(screen.getByText("Nothing is visible")).toBeTruthy();
  });
});
