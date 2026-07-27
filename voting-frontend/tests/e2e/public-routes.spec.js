import { expect, test } from "playwright/test";

const publicRoutes = [
  ["/", /Album Listening\s*Club/i],
  ["/about", /A club to meet people/i],
  ["/archive", /Every record already pulled/i],
  ["/current", /Heaven or Las Vegas|Masterpiece/i],
  ["/events", /Club plans beyond/i],
  ["/privacy", /What the club account stores/i],
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
  await expect(page).toHaveTitle("About | Album Listening Club");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://albumasu.com/about",
  );
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    /Learn how Album Listening Club/i,
  );
});

test("unknown routes preserve the URL and show a recoverable not-found page", async ({ page }) => {
  await page.goto("/missing-record");

  await expect(page).toHaveURL(/\/missing-record$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "This record is not in our crate.",
  );
  await expect(page).toHaveTitle("Page Not Found | Album Listening Club");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, nofollow",
  );
  await expect(page.getByRole("link", { name: "Return home" })).toBeVisible();
});

test("signup confirmation only accepts the AlbumASU Supabase verification URL", async ({ page }) => {
  const confirmationUrl = new URL(
    "https://lbcjxqxzsmsmndapvluz.supabase.co/auth/v1/verify",
  );
  confirmationUrl.searchParams.set("token", "test-token");
  confirmationUrl.searchParams.set("type", "signup");
  confirmationUrl.searchParams.set("redirect_to", "https://albumasu.com/account");

  await page.goto(`/confirm-signup?confirmation_url=${confirmationUrl.toString()}`);

  const confirmLink = page.getByRole("link", { name: "Confirm email address" });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("One last step.");
  await expect(confirmLink).toHaveAttribute("href", confirmationUrl.toString());
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, nofollow",
  );
});

test("signup confirmation rejects an untrusted verification URL", async ({ page }) => {
  const untrustedUrl = "https://example.com/auth/v1/verify?token=test-token&type=signup&redirect_to=https://albumasu.com/account";

  await page.goto(`/confirm-signup?confirmation_url=${untrustedUrl}`);

  await expect(page.getByText("Request a fresh verification email.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Confirm email address" })).toHaveCount(0);
});

test("archive progressively reveals the full catalog", async ({ page }) => {
  await page.goto("/archive");

  const archiveRows = page.locator(".archive-catalog-row");
  await expect(archiveRows).toHaveCount(36);
  await expect(page.getByText(/Showing 36 of \d+ archived albums/i)).toBeVisible();

  await page.getByRole("button", { name: /Load 36 more/i }).click();
  await expect(archiveRows).toHaveCount(72);
});
