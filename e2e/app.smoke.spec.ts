import { expect, test, type Locator, type Page } from "@playwright/test";

/** A service card's link; role-based so toasts mentioning the same name don't also match. */
function serviceLink(page: Page, name: string) {
  return page.locator("main").getByRole("link", { name: new RegExp(`^${name}`) });
}

/** A card in edit mode, which is a drag handle that opens the editor rather than a link. */
function editableCard(page: Page, name: string) {
  return page.locator("main").getByRole("button", { name: new RegExp(`^${name}\\.`) });
}

// Names no icon library has, so the preview never downloads an icon.
const HOMEPAGE_SERVICES = `
- Reading:
    - Orbit Wiki:
        href: http://127.0.0.1:9/wiki
        description: Team notes
    - Orbit Tracker:
        href: http://127.0.0.1:9/tracker
`;

/** The header tab back to the board. */
function goToServices(page: Page) {
  return page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "Services" });
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
    check?: boolean;
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

  if (options.check) {
    await page.getByRole("switch", { name: "Status check" }).click();
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

test("the command palette opens by typing and runs actions", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Services" })).toBeAttached();

  await page.keyboard.press("s");
  const input = page.getByRole("combobox", { name: "Search services and commands" });
  await expect(input).toHaveValue("s");
  await input.fill("settings");
  await expect(page.getByRole("option", { name: /Open settings/ })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
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

test("status checks show on a card only when turned on", async ({ page }) => {
  await page.goto("/");

  await createService(page, {
    category: "Links",
    name: "Plain Link",
    url: "https://example.com/plain",
  });
  await expect(serviceLink(page, "Plain Link").locator("[data-status]")).toHaveCount(0);

  // The backend checks its own health endpoint, so the test needs no outside network.
  await createService(page, {
    category: "Checked",
    check: true,
    name: "Self Check",
    url: "http://127.0.0.1:3001/healthz",
  });
  const card = serviceLink(page, "Self Check");
  await expect(card.locator('[data-status="up"]')).toBeVisible({ timeout: 15_000 });

  // Hovering the card shows the details with the 24h uptime bar.
  await card.hover();
  await expect(page.getByRole("img", { name: "100% up in 24 hours" })).toBeVisible();
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

test("cards offer their extra links, and tags are searchable", async ({ page }) => {
  const created = await page.request.post("/api/services", {
    data: {
      name: "Linked Grafana",
      url: "http://grafana.lan:3000",
      external_url: "https://grafana.example.com",
      links: [{ label: "Explore", url: "http://grafana.lan:3000/explore" }],
      tags: ["E2E Metrics"],
      category: "Linked",
    },
  });
  expect(created.status()).toBe(201);
  await page.goto("/");

  // The test page is on 127.0.0.1, your own network, so the card opens the main URL.
  const card = serviceLink(page, "Linked Grafana");
  await expect(card).toHaveAttribute("href", "http://grafana.lan:3000/");
  await card.hover();
  await page.getByRole("button", { name: "More links for Linked Grafana" }).click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: /^External URL/ })).toHaveAttribute(
    "href",
    "https://grafana.example.com/"
  );
  await expect(menu.getByRole("menuitem", { name: /^Explore/ })).toHaveAttribute(
    "href",
    "http://grafana.lan:3000/explore"
  );
  await page.keyboard.press("Escape");

  await page.keyboard.press("/");
  await page.getByRole("combobox", { name: "Search services and commands" }).fill("e2e metr");
  await expect(page.getByRole("option", { name: /Linked Grafana/ })).toContainText("#e2e metrics");
});

test("selected cards move, change checks and delete together, with one undo", async ({ page }) => {
  for (const name of ["Bulk One", "Bulk Two", "Bulk Three"]) {
    const response = await page.request.post("/api/services", {
      data: { name, url: `https://${name.replace(" ", "-").toLowerCase()}.test`, category: "Bulk" },
    });
    expect(response.status()).toBe(201);
  }
  expect((await page.request.post("/api/categories", { data: { name: "Bulk Target" } })).ok()).toBe(
    true
  );
  await page.goto("/");

  await page.getByRole("button", { name: "Edit layout" }).click();
  await expect(page.getByText("Editing layout")).toBeVisible();
  await page.getByRole("checkbox", { name: "Select Bulk One" }).click();
  await page.getByRole("checkbox", { name: "Select Bulk Two" }).click({ modifiers: ["Shift"] });
  const bar = page.getByRole("toolbar", { name: "Selected services" });
  await expect(bar.getByText("2 selected")).toBeVisible();

  await bar.getByRole("button", { name: "Status checks" }).click();
  await page.getByRole("menuitem", { name: "5 min", exact: true }).click();
  await expect(page.getByText("Checking 2 services every 5 min", { exact: true })).toBeVisible();

  await bar.getByRole("button", { name: "Move", exact: true }).click();
  await page.getByRole("menuitem", { name: "Bulk Target", exact: true }).click();
  await expect(bar).toBeHidden();
  const target = page.getByRole("region", { name: "Bulk Target category" });
  await expect(target.getByRole("button", { name: /^Bulk One\./ })).toBeVisible();
  await expect(target.getByRole("button", { name: /^Bulk Two\./ })).toBeVisible();

  await page.getByRole("checkbox", { name: "Select all in Bulk Target" }).click();
  await bar.getByRole("button", { name: "Delete" }).click();
  await expect(target.getByRole("button", { name: /^Bulk One\./ })).toBeHidden();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Restored 2 services", { exact: true })).toBeVisible();
  await expect(target.getByRole("button", { name: /^Bulk One\./ })).toBeVisible();
  await expect(target.getByRole("button", { name: /^Bulk Two\./ })).toBeVisible();

  // The interval change was saved with the services.
  const services = (await (await page.request.get("/api/services")).json()) as Array<{
    check_interval: number;
    name: string;
  }>;
  const intervals = Object.fromEntries(
    services.map((service) => [service.name, service.check_interval])
  );
  expect(intervals).toMatchObject({ "Bulk One": 300, "Bulk Two": 300, "Bulk Three": 60 });
});

test("services import from another dashboard's file in Settings, Data", async ({ page }) => {
  await page.goto("/settings/data");
  await page.getByLabel("Dashboard file to import").setInputFiles({
    name: "services.yaml",
    mimeType: "text/yaml",
    buffer: Buffer.from(HOMEPAGE_SERVICES),
  });

  const dialog = page.getByRole("dialog", { name: "Import from Homepage" });
  await expect(dialog.getByText("2 services in 1 group.")).toBeVisible();
  // One service stays behind, and the group lands in a category of another name.
  await dialog.getByRole("checkbox", { name: /^Orbit Tracker/ }).click();
  await dialog.getByRole("combobox", { name: "Category for Reading" }).fill("Docs");
  await dialog.getByRole("button", { name: "Import 1 service" }).click();

  const finished = page.getByRole("dialog", { name: "Added 1 service" });
  await expect(finished).toBeVisible();
  await finished.getByRole("button", { name: "Done" }).click();
  await expect(finished).toBeHidden();

  await goToServices(page).click();
  const board = page.locator("main");
  await expect(board.getByRole("button", { name: "Collapse Docs category" })).toBeVisible();
  await expect(board.getByRole("link", { name: /^Orbit Wiki/ })).toBeVisible();
  await expect(board.getByRole("link", { name: /^Orbit Tracker/ })).toHaveCount(0);
});

test("the clock widget turns on and keeps its format from Settings, Widgets", async ({ page }) => {
  await page.goto("/settings/widgets");
  const settings = page.getByRole("main");
  await settings.getByRole("switch", { name: "Clock", exact: true }).click();
  await settings.getByRole("switch", { name: "Greeting", exact: true }).click();
  await settings
    .getByRole("radiogroup", { name: "Time format" })
    .getByRole("radio", { name: "24-hour" })
    .click();

  await goToServices(page).click();
  const clock = page.getByRole("region", { name: "Widgets" }).getByRole("group", { name: "Clock" });
  await expect(clock.getByText(/^Good (morning|afternoon|evening|night)$/)).toBeVisible();
  await expect(clock.locator("time")).toHaveText(/^\d{2}:\d{2}$/);

  // Saved for the dashboard, not just this page.
  await page.reload();
  await expect(clock.locator("time")).toHaveText(/^\d{2}:\d{2}$/);

  await page.goto("/settings/widgets");
  await settings.getByRole("switch", { name: "Clock", exact: true }).click();
  await goToServices(page).click();
  await expect(page.getByRole("region", { name: "Widgets" })).toHaveCount(0);
});
