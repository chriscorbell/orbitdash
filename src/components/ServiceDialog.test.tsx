// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { toHaveNoViolations } from "vitest-axe/dist/matchers.js";
import { ServiceDialog } from "@/components/ServiceDialog";
import type { Service } from "@shared/types";

afterEach(() => {
  cleanup();
});

const baseService: Service = {
  id: "svc-1",
  name: "Orbit",
  url: "https://example.com/orbit",
  description: "Dashboard",
  icon: "orbit.svg",
  category: "Monitoring",
  open_in_new_tab: true,
  created_at: 1,
  updated_at: 1,
};

describe("ServiceDialog", () => {
  it("submits a new service with normalized payload values", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();

    render(
      <ServiceDialog
        open
        onOpenChange={onOpenChange}
        categoryOptions={["Infra"]}
        onSubmit={onSubmit}
      />
    );

    fireEvent.change(screen.getByLabelText("Name *"), {
      target: { value: " Orbit " },
    });
    fireEvent.change(screen.getByLabelText("URL *"), {
      target: { value: " example.com/orbit " },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: " Dashboard " },
    });
    fireEvent.change(screen.getByLabelText("Icon URL"), {
      target: { value: " https://example.com/icon.svg " },
    });

    fireEvent.click(screen.getByRole("button", { name: "Add service" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    expect(onSubmit).toHaveBeenCalledWith(
      {
        name: "Orbit",
        url: "https://example.com/orbit",
        description: "Dashboard",
        icon_url: "https://example.com/icon.svg",
        category: null,
        open_in_new_tab: true,
      },
      undefined,
      false
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("supports accessible dialog semantics and keyboard toggle behavior", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <ServiceDialog open onOpenChange={vi.fn()} categoryOptions={["Infra"]} onSubmit={onSubmit} />
    );

    expect(screen.getByRole("dialog", { name: "Add Service" })).toBeTruthy();

    const results = await axe(container);
    expect(toHaveNoViolations(results).pass).toBe(true);

    const switchControl = screen.getByRole("switch", { name: "Open in new tab" });
    expect(switchControl.getAttribute("aria-checked")).toBe("true");

    switchControl.focus();
    expect(document.activeElement).toBe(switchControl);

    await user.keyboard("[Space]");
    expect(switchControl.getAttribute("aria-checked")).toBe("false");

    fireEvent.change(screen.getByLabelText("Name *"), {
      target: { value: "Orbit" },
    });
    fireEvent.change(screen.getByLabelText("URL *"), {
      target: { value: "https://example.com/orbit" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Add service" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        open_in_new_tab: false,
      }),
      undefined,
      false
    );
  });

  it("shows schema validation errors and prevents invalid submission", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<ServiceDialog open onOpenChange={vi.fn()} categoryOptions={[]} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Name *"), {
      target: { value: "Orbit" },
    });
    fireEvent.change(screen.getByLabelText("URL *"), {
      target: { value: "not a url" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Add service" }));

    await screen.findByText("service url must be a valid URL");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("includes a dashboardicons link for finding icon URLs", () => {
    render(<ServiceDialog open onOpenChange={vi.fn()} categoryOptions={[]} onSubmit={vi.fn()} />);

    const iconLink = screen.getByRole("link", { name: "dashboardicons.com" });

    expect(iconLink.getAttribute("href")).toBe("https://dashboardicons.com/");
    expect(iconLink.getAttribute("target")).toBe("_blank");
    expect(iconLink.getAttribute("rel")).toBe("noreferrer");
  });

  it("supports icon preview removal and delete flow in edit mode", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();

    render(
      <ServiceDialog
        open
        onOpenChange={onOpenChange}
        service={baseService}
        categoryOptions={["Infra"]}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onDelete={onDelete}
      />
    );

    const newCategoryInput = screen.getByPlaceholderText("e.g. Infrastructure, Media");
    if (!(newCategoryInput instanceof HTMLInputElement)) {
      throw new Error("Expected new category input to be an HTMLInputElement");
    }
    expect(newCategoryInput.value).toBe("Monitoring");

    const previewImage = screen.getByAltText("Icon preview");
    if (!(previewImage instanceof HTMLImageElement)) {
      throw new Error("Expected preview image to be an HTMLImageElement");
    }
    expect(previewImage.getAttribute("src")).toContain("orbit.svg");

    fireEvent.click(screen.getByLabelText("Remove icon"));
    await waitFor(() => {
      expect(screen.queryByAltText("Icon preview")).toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledTimes(1);
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
