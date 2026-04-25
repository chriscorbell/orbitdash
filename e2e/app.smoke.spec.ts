import { expect, test, type Page } from "@playwright/test";

async function createService(
  page: Page,
  options: {
    category: string;
    description?: string;
    name: string;
    url: string;
  }
) {
  await page.getByRole("button", { name: "Add service" }).click();
  await expect(page.getByRole("dialog", { name: "Add Service" })).toBeVisible();

  await page.getByLabel("Name *").fill(options.name);
  await page.getByLabel("URL *").fill(options.url);

  if (options.description) {
    await page.getByLabel("Description").fill(options.description);
  }

  await page.getByRole("combobox", { name: "Category" }).click();
  await page.getByRole("option", { name: "New category…" }).click();
  await page.getByLabel("New category name").fill(options.category);
  await page.getByRole("button", { name: "Add service" }).click();

  await expect(page.getByRole("dialog", { name: "Add Service" })).toBeHidden();
  await expect(page.getByText(options.name)).toBeVisible();
}

test("primary dashboard journey works end to end", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Services" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Stats" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "CPU", selected: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "RAM" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Disk" })).toBeVisible();

  await createService(page, {
    category: "Infrastructure",
    description: "Primary service",
    name: "Orbit Admin",
    url: "https://example.com/admin",
  });

  await createService(page, {
    category: "Media",
    description: "Secondary service",
    name: "Orbit Media",
    url: "https://example.com/media",
  });

  await page.getByRole("button", { name: "Actions for Orbit Admin" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await expect(page.getByRole("dialog", { name: "Edit Service" })).toBeVisible();

  await page.getByLabel("Name *").fill("Orbit Control");
  await page.getByLabel("Description").fill("Updated service description");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByRole("dialog", { name: "Edit Service" })).toBeHidden();
  await expect(page.getByText("Orbit Control")).toBeVisible();
  await expect(page.locator("main").getByText("Updated service description").first()).toBeVisible();

  await page.getByRole("button", { name: "Open settings" }).click();
  const settingsDialog = page.getByRole("dialog", { name: "Dashboard settings" });
  await expect(settingsDialog).toBeVisible();

  await settingsDialog.getByRole("button", { name: "Move Media up" }).click();
  await settingsDialog
    .locator('[data-slot="dialog-footer"]')
    .getByRole("button", { name: "Close" })
    .click();
  await expect(settingsDialog).toBeHidden();

  await expect
    .poll(async () => page.locator("main h3").allTextContents())
    .toEqual(["Media", "Infrastructure"]);
});
