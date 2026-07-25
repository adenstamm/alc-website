import { expect, test } from "playwright/test";

const publicRoutes = [
  ["/", /Album Listening\s*Club/i],
  ["/about", /A club to meet people/i],
  ["/archive", /Every record already pulled/i],
  ["/current", /Heaven or Las Vegas|Masterpiece/i],
  ["/events", /Club plans beyond/i],
  ["/vote", /What .*should the club listen to next/i],
];

test.beforeEach(async ({ page }) => {
  // Keep the suite deterministic when third-party album metadata is unavailable.
  await page.route("https://musicbrainz.org/**", (route) => route.abort());
  await page.route("https://coverartarchive.org/**", (route) => route.abort());
});

for (const [path, heading] of publicRoutes) {
  test(`${path} renders its primary content`, async ({ page }) => {
    await page.goto(path);

    await expect(page.locator("main#main-content")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expect(page.locator("body")).not.toContainText("That page slipped off the turntable");
  });
}

test("keyboard navigation exposes and uses the skip link", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");

  const skipLink = page.getByRole("link", { name: "Skip to content" });
  await expect(skipLink).toBeFocused();
  await skipLink.press("Enter");
  await expect(page.locator("main#main-content")).toBeFocused();
});

test("client-side navigation preserves route semantics", async ({ page }) => {
  await page.goto("/");
  await page.locator('a[href="/about"]').first().evaluate((link) => link.click());

  await expect(page).toHaveURL(/\/about$/);
  await expect(page).toHaveTitle("About · Album Listening Club");
});
