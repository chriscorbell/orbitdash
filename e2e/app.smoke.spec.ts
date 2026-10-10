import { expect, test, type Page } from "@playwright/test";

/** A service card's link; role-based so toasts mentioning the same name don't also match. */
function serviceLink(page: Page, name: string) {
  return page.locator("main").getByRole("link", { name: new RegExp(`^${name}`) });
}

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
  await expect(serviceLink(page, options.name)).toBeVisible();
}

test("primary dashboard journey works end to end", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Services" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Stats" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "CPU", selected: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "RAM" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Disk" })).toBeVisible();
  await expect(page.getByRole("img", { name: /CPU usage over the last 30 seconds/ })).toBeVisible();

  await page.getByRole("tab", { name: "RAM" }).click();
  await expect(page.getByRole("img", { name: /RAM usage over the last 30 seconds/ })).toBeVisible();

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
  await expect(serviceLink(page, "Orbit Control")).toBeVisible();
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
    .poll(async () =>
      page
        .locator("main h3 button")
        .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")))
    )
    .toEqual(["Collapse Media category", "Collapse Infrastructure category"]);
});

test("changes made in one browser show up in another without a reload", async ({ browser }) => {
  const first = await browser.newPage();
  const second = await browser.newPage();
  await first.goto("/");
  await second.goto("/");
  await expect(second.getByRole("heading", { name: "Services" })).toBeVisible();

  await createService(first, {
    category: "Synced",
    name: "Synced Service",
    url: "https://example.com/synced",
  });

  await expect(serviceLink(second, "Synced Service")).toBeVisible({ timeout: 5_000 });
  await first.close();
  await second.close();
});
