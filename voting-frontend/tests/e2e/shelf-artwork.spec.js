import { Buffer } from "node:buffer";
import { expect, test } from "playwright/test";
import { installAdminPollFixture, installPublicFixtures } from "./fixtures";

const automaticUrl =
  "https://is1-ssl.mzstatic.com/image/thumb/fixture/600x600bb.jpg";
const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);
const albums = Array.from({ length: 5 }, (_, i) => ({
  position: i + 1,
  album_id: `fixture-${i}`,
  album_title: `Fixture ${i}`,
  artist_name: "Fixture Artist",
}));
test.beforeEach(installPublicFixtures);

async function setup(page) {
  await installAdminPollFixture(page, {
    poll: {
      id: "shelf-test",
      phase: "nominations",
      candidates: [],
      finalists: [],
      album_of_week: { title: "Current", artist: "Artist" },
    },
    results: {
      ballotCounts: { nominations: 0, primary: 0, final: 0 },
      nominations: [],
      primaryResults: [],
      finalists: [],
    },
  });
  await page.route("**/rest/v1/record_shelf_items**", (route) =>
    route.fulfill({ json: albums }),
  );
  await page.route("https://itunes.apple.com/search**", (route) => {
    const term = new URL(route.request().url()).searchParams.get("term");
    return route.fulfill({
      json: {
        results: [
          {
            collectionName: term.replace(" Fixture Artist", ""),
            artistName: "Fixture Artist",
            artworkUrl100: automaticUrl,
          },
        ],
      },
    });
  });
  await page.route("https://is1-ssl.mzstatic.com/**", (route) =>
    route.fulfill({ body: image, contentType: "image/png" }),
  );
  await page.route("**/storage/v1/object/**", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ body: image, contentType: "image/png" })
      : route.fulfill({ json: { Key: "fixture" } }),
  );
}

test("uploaded shelf artwork and automatic fallbacks agree in Admin and Home", async ({
  page,
}) => {
  await setup(page);
  let covers = [];
  await page.route("**/rest/v1/record_shelf_covers**", (route) => {
    if (route.request().method() === "POST")
      covers = [route.request().postDataJSON()];
    if (route.request().method() === "DELETE") covers = [];
    return route.fulfill({ json: covers });
  });
  await page.goto("/admin");
  const adminImages = page.locator(".admin-shelf-card img");
  await expect(adminImages).toHaveCount(5);
  await expect(adminImages.first()).toHaveAttribute("src", automaticUrl);
  await page.locator("#admin-shelf-panel > button").click();
  await page.getByRole("button", { name: "Curate shelf", exact: true }).click();
  await page
    .locator("#shelfCover")
    .setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: image });
  await page
    .getByRole("button", { name: "Upload shelf cover", exact: true })
    .click();
  await expect.poll(() => covers.length).toBe(1);
  expect(covers[0].artist_override).toBeNull();
  const uploadedUrl = covers[0].cover_url;
  await expect(adminImages.first()).toHaveAttribute("src", uploadedUrl);
  await page.goto("/");
  const homeImages = page.locator("#recent-albums-track .sideb-album-art img");
  await expect(homeImages).toHaveCount(5);
  await expect(homeImages.first()).toHaveAttribute("src", uploadedUrl);
  await expect(homeImages.nth(1)).toHaveAttribute("src", automaticUrl);
  // A cover-only edit from another tab must refresh even when album IDs stay put.
  covers = [{ ...covers[0], cover_url: uploadedUrl + "?revision=2" }];
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(homeImages.first()).toHaveAttribute("src", covers[0].cover_url);
  await page.goto("/admin");
  await expect(adminImages.first()).toHaveAttribute("src", covers[0].cover_url);
  await page.locator("#admin-shelf-panel > button").click();
  await page.getByRole("button", { name: "Curate shelf", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Clear cover and artist overrides for Fixture 0",
    })
    .click();
  await expect(adminImages.first()).toHaveAttribute("src", automaticUrl);
  await page.goto("/");
  await expect(homeImages.first()).toHaveAttribute("src", automaticUrl);
});

test("broken custom artwork falls back to automatic artwork on both screens", async ({
  page,
}) => {
  await setup(page);
  const brokenUrl =
    "https://playwright.supabase.co/storage/v1/object/public/record-shelf-covers/broken.png";
  await page.route("**/rest/v1/record_shelf_covers**", (route) =>
    route.fulfill({ json: [{ album_id: "fixture-0", cover_url: brokenUrl }] }),
  );
  await page.route(brokenUrl, (route) =>
    route.fulfill({ status: 404, body: "missing" }),
  );
  for (const path of ["/", "/admin"]) {
    await page.goto(path);
    const first = page
      .locator(
        path === "/"
          ? "#recent-albums-track .sideb-album-art img"
          : ".admin-shelf-card img",
      )
      .first();
    await expect(first).toHaveAttribute("src", automaticUrl);
    await expect(first).toBeVisible();
  }
});
