import { expect, test, type Locator, type Page } from "@playwright/test";

/** A service card's link; role-based so toasts mentioning the same name don't also match. */
function serviceLink(page: Page, name: string) {
  return page.locator("main").getByRole("link", { name: new RegExp(`^${name}`) });
}

/** A card in edit mode, which is a drag handle that opens the editor rather than a link. */
function editableCard(page: Page, name: string) {
  return page.locator("main").getByRole("button", { name: new RegExp(`^${name}\\.`) });
}

/** Drags with several pointer moves, the way a person does, so dnd-kit sees the drag start. */
async function dragTo(page: Page, source: Locator, target: Locator) {
  const from = (await source.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + 20, { steps: 20 });
  await page.mouse.up();
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
  await page.getByRole("button", { name: "Add service" }).first().click();
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

  const stats = page.getByRole("region", { name: "Live stats" });
  await expect(stats).toBeVisible();
  // Live values arrive over the event stream and replace the placeholders.
  await expect(stats.getByLabel(/^CPU \d+(\.\d)? percent$/)).toBeVisible();
  await expect(stats.getByLabel(/^Memory \d+(\.\d)? percent$/)).toBeVisible();
  await expect(stats.getByLabel(/^Disk \d+(\.\d)? percent$/)).toBeVisible();

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

  // Edit mode: cards open their editor instead of the link.
  await page.getByRole("button", { name: "Edit layout" }).click();
  await expect(page.getByText("Editing layout")).toBeVisible();
  await editableCard(page, "Orbit Admin").click();
  await expect(page.getByRole("dialog", { name: "Edit Service" })).toBeVisible();

  await page.getByLabel("Name *").fill("Orbit Control");
  await page.getByLabel("Description").fill("Updated service description");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByRole("dialog", { name: "Edit Service" })).toBeHidden();
  await expect(editableCard(page, "Orbit Control")).toBeVisible();

  // Categories rename in place and drag by their handle.
  await page.getByRole("button", { name: "Rename Media category" }).click();
  await page.getByRole("textbox", { name: "Category name" }).fill("Movies");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Rename Movies category" })).toBeVisible();

  await dragTo(
    page,
    page.getByRole("button", { name: "Move Movies category" }),
    page.getByRole("region", { name: "Infrastructure category" })
  );

  // A new category opens with its name ready to type, and an empty one deletes at once.
  await page.getByRole("button", { name: "New category" }).click();
  await page.getByRole("textbox", { name: "Category name" }).fill("Games");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Games category" })).toBeVisible();
  await page.getByRole("button", { name: "Delete Games category" }).click();
  await expect(page.getByRole("region", { name: "Games category" })).toBeHidden();

  await page.getByRole("button", { name: "Done" }).click();
  await expect(serviceLink(page, "Orbit Control")).toBeVisible();
  await expect(page.locator("main").getByText("Updated service description").first()).toBeVisible();

  await expect
    .poll(async () =>
      page
        .locator("main h3 button")
        .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")))
    )
    .toEqual(["Collapse Movies category", "Collapse Infrastructure category"]);

  // The order was saved, not just shown.
  await page.reload();
  await expect
    .poll(async () =>
      page
        .locator("main h3 button")
        .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")))
    )
    .toEqual(["Collapse Movies category", "Collapse Infrastructure category"]);
});

test("the Stats page shows live readings and switches ranges", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Stats" }).click();
  await expect(page).toHaveURL(/\/stats$/);

  const readings = page.getByRole("region", { name: "Current readings" });
  await expect(readings).toBeVisible();
  await expect(page.getByRole("img", { name: "CPU over time" })).toBeVisible();

  await page.getByRole("radio", { name: "1h" }).click();
  await expect(page.getByRole("radio", { name: "1h" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("region", { name: "Memory chart" })).toBeVisible();

  await page.getByRole("link", { name: "Services" }).click();
  await expect(page.getByRole("heading", { name: "Services" })).toBeAttached();
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
