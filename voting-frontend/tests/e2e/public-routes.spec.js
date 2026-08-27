import { expect, test } from "playwright/test";

const publicRoutes = [
  ["/", /Album Listening\s*Club/i],
  ["/about", /A club to meet people/i],
  ["/archive", /Every record already pulled/i],
  ["/current", /Heaven or Las Vegas|Masterpiece/i],
  ["/events", /Club plans beyond/i],
  ["/genres", /This is what this year will sound like/i],
  ["/privacy", /What the club account stores/i],
  ["/vote", /What .*should the club listen to next/i],
];

async function installMockSession(page, {
  displayName,
  email,
  userId,
}) {
  const expiresAt = Math.floor(Date.now() / 1000) + 3_600;

  await page.addInitScript(({
    activeDisplayName,
    activeEmail,
    activeUserId,
    sessionExpiresAt,
  }) => {
    const encodeJwtPart = (value) => btoa(JSON.stringify(value))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    const accessToken = [
      encodeJwtPart({ alg: "HS256", typ: "JWT" }),
      encodeJwtPart({
        aud: "authenticated",
        email: activeEmail,
        exp: sessionExpiresAt,
        role: "authenticated",
        sub: activeUserId,
      }),
      "test-signature",
    ].join(".");

    localStorage.setItem("sb-playwright-auth-token", JSON.stringify({
      access_token: accessToken,
      expires_at: sessionExpiresAt,
      expires_in: 3_600,
      refresh_token: "test-refresh-token",
      token_type: "bearer",
      user: {
        app_metadata: { provider: "email", providers: ["email"] },
        aud: "authenticated",
        created_at: "2026-08-27T12:00:00.000Z",
        email: activeEmail,
        email_confirmed_at: "2026-08-27T12:00:00.000Z",
        id: activeUserId,
        role: "authenticated",
        updated_at: "2026-08-27T12:00:00.000Z",
        user_metadata: { display_name: activeDisplayName },
      },
    }));
  }, {
    activeDisplayName: displayName,
    activeEmail: email,
    activeUserId: userId,
    sessionExpiresAt: expiresAt,
  });
}

test.beforeEach(async ({ page }) => {
  // Keep the suite deterministic when third-party album metadata is unavailable.
  await page.route("https://musicbrainz.org/**", (route) => route.abort());
  await page.route("https://coverartarchive.org/**", (route) => route.abort());
  await page.route("https://playwright.supabase.co/rest/v1/album_archive_entries**", (route) => (
    route.fulfill({ body: "[]", contentType: "application/json", status: 200 })
  ));
  await page.route("**/api/current-poll", (route) => route.fulfill({
    body: JSON.stringify({
      album_of_week: {
        artist: "Cocteau Twins",
        title: "Heaven or Las Vegas",
      },
      candidates: [],
      cycle_label: "Test Week",
      description: "Submit one album for the next club session.",
      finalists: [],
      id: "test-poll",
      phase: "nominations",
      question: "What should the club listen to next?",
      status: "Nominations are open",
    }),
    contentType: "application/json",
    status: 200,
  }));
});

for (const [path, heading] of publicRoutes) {
  test(`${path} renders its primary content`, async ({ page }) => {
    await page.goto(path);

    await expect(page.locator("main#main-content")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expect(page.locator("body")).not.toContainText("That page slipped off the turntable");
  });
}

test("the homepage genre feature leads into the dedicated poster page", async ({ page }) => {
  await page.goto("/");

  const teaser = page.locator(".sideb-genres-teaser");
  const utilityGrid = page.locator(".sideb-link-grid");
  const genreLink = page.getByRole("link", { name: /View the genres this year/i });

  await expect(teaser).toBeVisible();
  await expect(genreLink).toHaveAttribute("href", "/genres");
  const teaserPrecedesUtilityGrid = await teaser.evaluate((element) => (
    element.compareDocumentPosition(document.querySelector(".sideb-link-grid"))
    & Node.DOCUMENT_POSITION_FOLLOWING
  ));
  expect(teaserPrecedesUtilityGrid).toBeTruthy();
  await expect(utilityGrid).toBeVisible();

  await genreLink.click();
  await expect(page).toHaveURL(/\/genres$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This is what this year will sound like.");
  await expect(page.getByRole("link", { name: /Open the year in genres poster at full size/i })).toBeVisible();
});

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

test("legacy routes redirect and preserve URL parameters", async ({ page }) => {
  await page.goto("/results?source=bookmark#ballot");

  await expect(page).toHaveURL(/\/vote\?source=bookmark#ballot$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /What .*should the club listen to next/i,
  );
});

test("browser history works after client-side navigation", async ({ page }) => {
  await page.goto("/");
  await page.locator('a[href="/about"]').first().evaluate((link) => link.click());
  await expect(page).toHaveURL(/\/about$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Album Listening\s*Club/i);
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

test("temporary ballot failures offer a working reload action", async ({ page }) => {
  let pollRequestCount = 0;

  await page.route("**/api/current-poll", async (route) => {
    pollRequestCount += 1;

    if (pollRequestCount === 1) {
      await route.fulfill({
        body: JSON.stringify({ error: "Too many requests" }),
        contentType: "application/json",
        headers: { "Retry-After": "1" },
        status: 429,
      });
      return;
    }

    await route.fulfill({
      body: JSON.stringify({
        candidates: [],
        description: "Submit one album for the next club session.",
        finalists: [],
        id: "test-poll",
        phase: "nominations",
        question: "What should the club listen to next?",
        status: "Nominations are open",
      }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.goto("/vote");

  await expect(page.getByRole("heading", { name: "Too many ballot refreshes." })).toBeVisible();
  const reloadButton = page.getByRole("button", { name: "Reload ballot" });
  await expect(reloadButton).toBeVisible();
  await reloadButton.click();

  await expect(page.getByRole("heading", { name: "Sign in or create an account to vote." })).toBeVisible();
  expect(pollRequestCount).toBeGreaterThanOrEqual(2);
});

test("approved members can rate the current album separately from their nomination", async ({ page }) => {
  const userId = "11111111-1111-4111-8111-111111111111";
  await installMockSession(page, {
    displayName: "Rating Tester",
    email: "rating-test@albumasu.com",
    userId,
  });

  await page.route("**/rest/v1/memberships**", (route) => route.fulfill({
    body: JSON.stringify([{
      created_at: "2026-08-27T12:00:00.000Z",
      display_name: "Rating Tester",
      email: "rating-test@albumasu.com",
      role: "member",
      status: "approved",
      updated_at: "2026-08-27T12:00:00.000Z",
      user_id: userId,
    }]),
    contentType: "application/json",
    status: 200,
  }));
  await page.route("**/rest/v1/votes**", (route) => route.fulfill({
    body: "[]",
    contentType: "application/json",
    status: 200,
  }));
  await page.route("**/rest/v1/album_ratings**", (route) => route.fulfill({
    body: "[]",
    contentType: "application/json",
    status: 200,
  }));
  await page.route("**/rest/v1/rpc/submit_current_album_rating", async (route) => {
    const requestBody = route.request().postDataJSON();
    expect(requestBody.rating_input).toBe(8);
    await route.fulfill({
      body: JSON.stringify({
        created_at: "2026-08-27T12:30:00.000Z",
        poll_id: "rock-week",
        rating: 8,
      }),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.route("**/api/current-poll", (route) => route.fulfill({
    body: JSON.stringify({
      album_of_week: {
        artist: "Big Thief",
        title: "Dragon New Warm Mountain I Believe in You",
      },
      candidates: [],
      cycle_label: "Rock Week",
      description: "Nominate an album for next week.",
      finalists: [],
      id: "rock-week",
      phase: "nominations",
      question: "What should the club listen to next?",
      status: "Nominations are open",
    }),
    contentType: "application/json",
    status: 200,
  }));

  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/vote");

  await expect(page.getByRole("heading", {
    name: "Rate Dragon New Warm Mountain I Believe in You",
  })).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(10);
  await page.getByRole("radio", { name: "8" }).check();
  await page.getByRole("button", { name: "Submit album rating" }).click();

  await expect(page.getByText("Your rating", { exact: true })).toBeVisible();
  await expect(page.getByText("8/10", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Album title")).toBeVisible();
});

test("creating a poll never reloads the archived poll results", async ({ page }) => {
  const userId = "22222222-2222-4222-8222-222222222222";
  let pollCreated = false;
  const resultRequests = [];

  await installMockSession(page, {
    displayName: "Admin Tester",
    email: "admin-test@albumasu.com",
    userId,
  });

  await page.route("**/rest/v1/memberships**", (route) => route.fulfill({
    body: JSON.stringify([{
      created_at: "2026-08-27T12:00:00.000Z",
      display_name: "Admin Tester",
      email: "admin-test@albumasu.com",
      role: "admin",
      status: "approved",
      updated_at: "2026-08-27T12:00:00.000Z",
      user_id: userId,
    }]),
    contentType: "application/json",
    status: 200,
  }));
  await page.route("**/rest/v1/record_shelf_covers**", (route) => route.fulfill({
    body: "[]",
    contentType: "application/json",
    status: 200,
  }));
  await page.route("**/rest/v1/rpc/get_admin_poll_results", async (route) => {
    const { target_poll_id: targetPollId } = route.request().postDataJSON();
    resultRequests.push({ afterCreate: pollCreated, pollId: targetPollId });
    const nominations = targetPollId === "finished-poll"
      ? [{
          artist: "Previous Artist",
          id: "previous-candidate",
          nominationCount: 1,
          title: "Old nomination that must disappear",
        }]
      : [];

    await route.fulfill({
      body: JSON.stringify({
        currentAlbumRating: { averageRating: null, ratingCount: 0 },
        finalists: [],
        irv: { rounds: [], tie: null, winnerId: null },
        nominations,
        primaryResults: [],
      }),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.route("**/rest/v1/rpc/create_poll", async (route) => {
    const requestBody = route.request().postDataJSON();
    expect(requestBody.new_poll_id).toBe("poll-week-3-jazz");
    pollCreated = true;
    await route.fulfill({
      body: JSON.stringify({ id: requestBody.new_poll_id }),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.route("**/api/current-poll", (route) => route.fulfill({
    body: JSON.stringify(pollCreated ? {
      album_of_week: { artist: "Tame Impala", title: "Currents" },
      candidates: [],
      cycle_label: "Week 3 - Jazz",
      description: "Nominate a jazz album for next week.",
      finalists: [],
      id: "poll-week-3-jazz",
      phase: "nominations",
      question: "What jazz album should the club listen to next?",
      status: "Nominations are open",
    } : {
      album_of_week: { artist: "Fleetwood Mac", title: "Rumours" },
      candidates: [{
        artist: "Previous Artist",
        id: "previous-candidate",
        title: "Old nomination that must disappear",
      }],
      cycle_label: "Finished Week",
      description: "The finished poll.",
      finalists: [{
        artist: "Previous Artist",
        id: "previous-candidate",
        title: "Old nomination that must disappear",
      }],
      id: "finished-poll",
      phase: "final",
      question: "Final ranking",
      status: "Final voting is complete",
    }),
    contentType: "application/json",
    status: 200,
  }));

  await page.goto("/admin");
  await expect(page.locator(".admin-rating-summary")).toBeVisible();
  const requestCountBeforeCreate = resultRequests.length;

  await page.getByLabel("Cycle label").fill("Week 3 - Jazz");
  await page.getByLabel("Current album title").fill("Currents");
  await page.getByLabel("Current album artist").fill("Tame Impala");
  await page.getByRole("button", { name: "Create active poll" }).click();

  await expect(page.getByText("New poll created and set active.")).toBeVisible();
  await expect.poll(() => resultRequests.length).toBeGreaterThan(requestCountBeforeCreate);
  expect(
    resultRequests
      .slice(requestCountBeforeCreate)
      .every(({ pollId }) => pollId === "poll-week-3-jazz"),
  ).toBeTruthy();
  await expect(page.getByText("Old nomination that must disappear", { exact: true })).toHaveCount(0);
  await expect(page.getByText("No nominations have been submitted yet.")).toBeVisible();
});

test("the unlisted Sidney letter opens from its sealed envelope", async ({ page }) => {
  await page.goto("/for-sidney-7x4m9q");

  await expect(page).toHaveTitle("For Sidney, With Love");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, nofollow",
  );
  await expect(page.locator(".sideb-nav")).toHaveCount(0);
  await expect(page.locator(".site-footer")).toHaveCount(0);

  const envelope = page.getByRole("button", { name: "Open Sidney's birthday letter" });
  await expect(envelope).toBeVisible();
  await envelope.click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "To the Wonderful Sidney —",
  );
  await expect(page.locator(".sidney-letter-page")).toHaveClass(/is-open/);
  await expect(page.locator(".sidney-letter-sheet")).toHaveAttribute("aria-hidden", "false");
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
