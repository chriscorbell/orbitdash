import { expect, type Page, test } from "@playwright/test";
import type { Board } from "../shared/types.ts";

test.describe.configure({ mode: "serial" });

async function addLink(page: Page, fields: { url: string; name: string; category?: string }) {
  const dialog = page.getByRole("dialog", { name: "New link" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("URL").fill(fields.url);
  await dialog.getByLabel("Name", { exact: true }).fill(fields.name);
  if (fields.category) await dialog.getByLabel("Category").fill(fields.category);
  await dialog.getByRole("button", { name: "Add link" }).click();
  await expect(dialog).toBeHidden();
}

async function board(page: Page): Promise<Board> {
  return (await page.request.get("/api/board")).json();
}

test("adds, edits, arranges and deletes links", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("No links yet.")).toBeVisible();

  await page.getByRole("button", { name: "Add a link" }).click();
  await addLink(page, { url: "example.com", name: "Example", category: "Tools" });
  await page.getByRole("button", { name: "Add a link", exact: true }).click();
  await addLink(page, { url: "media.lan", name: "Media Server", category: "Media" });

  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("link", { name: "Example" })).toHaveAttribute(
    "href",
    "https://example.com/"
  );
  await expect(page.getByRole("link", { name: "Media Server" })).toHaveAttribute(
    "href",
    "http://media.lan/"
  );
  await expect(page.getByRole("heading", { name: "Tools" })).toBeVisible();

  // Rename a link from edit mode.
  await page.getByRole("button", { name: "Edit the board" }).click();
  await page.getByRole("button", { name: /^Example\./ }).click();
  const editor = page.getByRole("dialog", { name: "Edit link" });
  await editor.getByLabel("Name", { exact: true }).fill("Example Site");
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(editor).toBeHidden();
  await expect(page.getByRole("button", { name: /^Example Site\./ })).toBeVisible();

  // Drag the media link under the example one.
  const source = page.getByRole("button", { name: /^Media Server\./ });
  const target = page.getByRole("button", { name: /^Example Site\./ });
  const from = (await source.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + 20, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + from.height / 2, { steps: 5 });
  await page.mouse.move(to.x + 20, to.y + to.height * 0.9, { steps: 15 });
  await page.mouse.move(to.x + 20, to.y + to.height * 1.1, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(async () => {
      const { categories, links } = await board(page);
      const tools = categories.find((category) => category.name === "Tools")!;
      return links.filter((link) => link.categoryId === tools.id).map((link) => link.name);
    })
    .toEqual(["Example Site", "Media Server"]);

  // Deleting a category keeps its links.
  await page.getByRole("button", { name: "Delete Tools" }).click();
  await page.getByRole("button", { name: "Delete category" }).click();
  await expect(page.getByRole("heading", { name: "No category" })).toBeVisible();
  expect((await board(page)).links.map((link) => [link.name, link.categoryId])).toEqual([
    ["Example Site", null],
    ["Media Server", null],
  ]);

  // Deleting a link asks once more.
  await page.getByRole("button", { name: /^Media Server\./ }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete Media Server" }).click();
  await expect(page.getByRole("button", { name: /^Media Server\./ })).toBeHidden();

  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("link")).toHaveCount(1);
});

test("keeps edits made in another browser in sync when the tab comes back", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Example Site" })).toBeVisible();

  const form = new FormData();
  form.set("name", "From elsewhere");
  form.set("url", "https://elsewhere.example");
  await page.request.post("/api/links", { multipart: form });

  await page.evaluate("document.dispatchEvent(new Event('visibilitychange'))");
  await expect(page.getByRole("link", { name: "From elsewhere" })).toBeVisible();
});
