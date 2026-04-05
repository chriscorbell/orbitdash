// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
      target: { value: " https://example.com/orbit " },
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

  it("shows schema validation errors and prevents invalid submission", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<ServiceDialog open onOpenChange={vi.fn()} categoryOptions={[]} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Name *"), {
      target: { value: "Orbit" },
    });
    fireEvent.change(screen.getByLabelText("URL *"), {
      target: { value: "notaurl" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Add service" }));

    await screen.findByText("service url must be a valid http(s) URL");
    expect(onSubmit).not.toHaveBeenCalled();
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

    const newCategoryInput = screen.getByPlaceholderText(
      "e.g. Infrastructure, Media"
    ) as HTMLInputElement;
    expect(newCategoryInput.value).toBe("Monitoring");

    const previewImage = screen.getByAltText("Icon preview") as HTMLImageElement;
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
