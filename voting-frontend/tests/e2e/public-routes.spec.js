import { expect, test } from "playwright/test";
import { installAdminPollFixture, installMockSession, installPublicFixtures } from "./fixtures";

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

test.beforeEach(installPublicFixtures);

for (const [path, heading] of publicRoutes) {
  test(`${path} renders its primary content`, async ({ page }) => {
    await page.goto(path);

    await expect(page.locator("main#main-content")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expect(page.locator("body")).not.toContainText("That page slipped off the turntable");
  });
}

test("the homepage omits the year-in-genres campaign", async ({ page }) => {
  await page.goto("/");

  const utilityGrid = page.locator(".sideb-link-grid");
  await expect(utilityGrid).toBeVisible();
  await expect(page.locator(".sideb-genres-teaser")).toHaveCount(0);
  await expect(page.locator('a[href="/genres"]')).toHaveCount(0);
});

test("the desktop record shelf stays contained and visibly framed", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const shelfFrame = page.locator(".sideb-crate-frame");
  const firstCard = page.locator(".sideb-crate-card").first();

  await expect(shelfFrame).toBeVisible();
  await expect(shelfFrame).toHaveCSS("border-top-width", "9px");
  await expect(firstCard).toBeVisible();

  const layout = await page.evaluate(() => ({
    cardWidth: document.querySelector(".sideb-crate-card")?.getBoundingClientRect().width,
    pageWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));

  expect(layout.cardWidth).toBeLessThanOrEqual(300);
  expect(layout.pageWidth).toBe(layout.viewportWidth);
});

test("the homepage shelf refreshes on focus when the queue changes", async ({ page }) => {
  let shelfRows = [{
    album_id: "fixture-original", album_title: "Fixture Original",
    artist_name: "Fixture Artist", position: 1,
  }];

  await page.route("**/rest/v1/record_shelf_items**", (route) => route.fulfill({
    body: JSON.stringify(shelfRows),
    contentType: "application/json",
    status: 200,
  }));
  await page.route("**/rest/v1/record_shelf_covers**", (route) => route.fulfill({
    body: "[]",
    contentType: "application/json",
    status: 200,
  }));
  await page.route("https://itunes.apple.com/**", (route) => route.abort());

  await page.goto("/");

  const shelfCards = page.locator("#recent-albums-track > li");
  await expect(shelfCards).toHaveCount(5);
  await expect(shelfCards.first()).toContainText("Fixture Original");

  shelfRows = [{
    album_id: "poll-week-1",
    album_title: "You Seem Pretty Sad for A Girl So In Love",
    archived_at: "2026-08-30T12:00:00.000Z",
    artist_name: "Olivia Rodrigo",
    position: 1,
  }, { ...shelfRows[0], position: 2 }];
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));

  await expect(shelfCards).toHaveCount(5);
  await expect(shelfCards.first()).toContainText("Olivia Rodrigo");
  await expect(shelfCards.nth(1)).toContainText("Fixture Original");
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

test("temporary ballot failures retry automatically before showing an error", async ({ page }) => {
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

  await expect(page.getByRole("heading", { name: "Sign in or create an account to vote." })).toBeVisible();
  expect(pollRequestCount).toBeGreaterThanOrEqual(2);
});

test("a transient membership failure retries instead of showing approval pending", async ({ page }) => {
  const userId = "33333333-3333-4333-8333-333333333333";
  let membershipRequestCount = 0;

  await installMockSession(page, {
    displayName: "Retry Tester",
    email: "retry-test@albumasu.com",
    userId,
  });
  await page.route("**/rest/v1/memberships**", async (route) => {
    membershipRequestCount += 1;

    if (membershipRequestCount < 3) {
      await route.fulfill({
        body: JSON.stringify({ message: "Temporary gateway failure" }),
        contentType: "application/json",
        status: 503,
      });
      return;
    }

    await route.fulfill({
      body: JSON.stringify([{
        created_at: "2026-08-27T12:00:00.000Z",
        display_name: "Retry Tester",
        email: "retry-test@albumasu.com",
        role: "member",
        status: "approved",
        updated_at: "2026-08-27T12:00:00.000Z",
        user_id: userId,
      }]),
      contentType: "application/json",
      status: 200,
    });
  });
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

  await page.goto("/vote");

  await expect(page.getByLabel("Album title")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your account is waiting for member approval." }))
    .toHaveCount(0);
  expect(membershipRequestCount).toBe(3);
});

test("an open voter page advances rounds without erasing an in-progress ballot", async ({ page }) => {
  const userId = "44444444-4444-4444-8444-444444444444";
  let activePhase = "nominations";
  let pollRequestCount = 0;

  await installMockSession(page, {
    displayName: "Round Sync Tester",
    email: "round-sync@albumasu.com",
    userId,
  });
  await page.route("**/rest/v1/memberships**", (route) => route.fulfill({
    body: JSON.stringify([{
      created_at: "2026-08-30T12:00:00.000Z",
      display_name: "Round Sync Tester",
      email: "round-sync@albumasu.com",
      role: "member",
      status: "approved",
      updated_at: "2026-08-30T12:00:00.000Z",
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
  await page.route("**/api/current-poll", (route) => {
    pollRequestCount += 1;
    return route.fulfill({
      body: JSON.stringify({
      album_of_week: { artist: "Fleetwood Mac", title: "Rumours" },
      candidates: activePhase === "primary" ? [{
        artist: "Geese",
        id: "getting-killed",
        nominationCount: 12,
        title: "Getting Killed",
      }] : [],
      cycle_label: "Event Week",
      description: activePhase === "primary" ? "Choose an album." : "Nominate an album.",
      finalists: [],
      id: "event-week",
      phase: activePhase,
      question: "What should the club listen to next?",
      status: activePhase === "primary" ? "Primary voting is open" : "Nominations are open",
    }),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.goto("/vote");

  await page.getByLabel("Album title").fill("Charm");
  await page.getByLabel("Artist").fill("Clairo");
  const requestCountBeforeUnchangedRefresh = pollRequestCount;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => pollRequestCount).toBeGreaterThan(requestCountBeforeUnchangedRefresh);
  await expect(page.getByLabel("Album title")).toHaveValue("Charm");
  await expect(page.getByLabel("Artist")).toHaveValue("Clairo");

  activePhase = "primary";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));

  await expect(page.getByRole("checkbox")).toHaveCount(1);
  await expect(page.getByText("Getting Killed", { exact: true })).toBeVisible();
});

test("the voter sees a locked final after the server deadline", async ({ page }) => {
  const userId = "55555555-5555-4555-8555-555555555555";

  await installMockSession(page, {
    displayName: "Closed Final Tester",
    email: "closed-final@albumasu.com",
    userId,
  });
  await page.route("**/rest/v1/memberships**", (route) => route.fulfill({
    body: JSON.stringify([{
      created_at: "2026-08-30T12:00:00.000Z",
      display_name: "Closed Final Tester",
      email: "closed-final@albumasu.com",
      role: "member",
      status: "approved",
      updated_at: "2026-08-30T12:00:00.000Z",
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
  await page.route("**/api/current-poll", (route) => route.fulfill({
    body: JSON.stringify({
      album_of_week: { artist: "Fleetwood Mac", title: "Rumours" },
      candidates: [],
      cycle_label: "Event Week",
      description: "Rank the finalists.",
      finalClosedAt: null,
      finalClosesAt: "2026-08-30T18:00:00.000Z",
      finalIsClosed: true,
      finalOpenedAt: "2026-08-30T00:00:00.000Z",
      finalists: [{ artist: "Geese", id: "getting-killed", title: "Getting Killed" }],
      id: "event-week",
      phase: "final",
      question: "Rank the finalists.",
      status: "Final voting is closed",
    }),
    contentType: "application/json",
    status: 200,
  }));
  await page.goto("/vote");

  await expect(page.getByRole("heading", { name: "The final ballot is locked." })).toBeVisible();
  await expect(page.getByRole("button", { name: /submit.*ranking/i })).toHaveCount(0);
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

  await page.getByRole("button", { name: "Create new weekly poll" }).click();
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

test("a published winner is current while the next poll waits for its genre", async ({ page }) => {
  const publishedWinner = {
    artist: "Olivia Rodrigo",
    note: "Selected by the club",
    title: "You Seem Pretty Sad for A Girl So In Love",
  };

  await page.unroute("**/api/current-poll");
  await installAdminPollFixture(page, {
    poll: {
      album_of_week: publishedWinner,
      candidates: [{ ...publishedWinner, id: "olivia-winner" }],
      cycle_label: "Pop Week",
      description: "Rank the finalists.",
      finalClosedAt: "2026-08-30T18:00:00.000Z",
      finalClosesAt: "2026-08-30T18:00:00.000Z",
      finalIsClosed: true,
      finalOpenedAt: "2026-08-30T00:00:00.000Z",
      finalists: [{ ...publishedWinner, id: "olivia-winner" }],
      id: "pop-week",
      phase: "final",
      publishedWinner,
      question: "Rank the finalists.",
      ratingAlbumOfWeek: { artist: "Fleetwood Mac", title: "Rumours" },
      status: "Winner published — next nominations have not opened",
      winnerCandidateId: "olivia-winner",
      winnerPublishedAt: "2026-08-30T18:00:30.000Z",
    },
    results: {
      ballotCounts: { final: 24, nominations: 20, primary: 18 },
      currentAlbumRating: { averageRating: 8.4, ratingCount: 20 },
      finalists: [],
      irv: { rounds: [], tie: null, winnerId: "olivia-winner" },
      nominations: [],
      primaryResults: [],
    },
  });

  await page.goto("/admin");

  await expect(page.locator(".admin-rating-summary")).toContainText("Rumours");
  await page.getByRole("button", { name: "Create new weekly poll" }).click();
  await expect(page.getByLabel("Current album title")).toHaveValue(publishedWinner.title);
  await expect(page.getByLabel("Current album artist")).toHaveValue(publishedWinner.artist);
  await expect(page.getByText("The official winner is filled in automatically.")).toBeVisible();
  await expect(page.getByLabel("Cycle label")).toHaveValue("");
});

test("admin phase changes require an in-app confirmation", async ({ page }) => {
  let advanceCalls = 0;
  const poll = {
    album_of_week: { artist: "Fleetwood Mac", title: "Rumours" },
    candidates: [],
    cycle_label: "Event Week",
    description: "Choose the next album.",
    finalists: [],
    id: "event-week",
    phase: "nominations",
    question: "What should the club listen to next?",
    status: "Nominations are open",
  };
  const results = {
    ballotCounts: { final: 0, nominations: 7, primary: 0 },
    currentAlbumRating: { averageRating: 8.4, ratingCount: 7 },
    finalists: [],
    irv: { rounds: [], tie: null, winnerId: null },
    nominations: [{
      artist: "Geese",
      id: "getting-killed",
      nominationCount: 7,
      title: "Getting Killed",
    }],
    primaryResults: [],
  };

  await installAdminPollFixture(page, { poll, results });
  await page.route("**/rest/v1/rpc/advance_to_primary", async (route) => {
    advanceCalls += 1;
    await route.fulfill({ body: "{}", contentType: "application/json", status: 200 });
  });
  await page.goto("/admin");

  await expect(page.getByText("Unique members submitted")).toBeVisible();
  const moveToPrimaryButton = page.getByRole("button", { name: "Move to primary" });
  await moveToPrimaryButton.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Are you ready?" })).toBeVisible();
  await expect(dialog).toContainText("closes nominations");
  await expect(page.locator("main#main-content")).toHaveJSProperty("inert", true);
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Open primary voting" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  expect(advanceCalls).toBe(0);

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(moveToPrimaryButton).toBeFocused();
  await moveToPrimaryButton.click();
  await page.getByRole("dialog").getByRole("button", { name: "Open primary voting" }).click();

  await expect.poll(() => advanceCalls).toBe(1);
  await expect(page.getByText("Poll moved to primary.").first()).toBeVisible();
});

test("opening final voting confirms the 18 hour consequence", async ({ page }) => {
  let advancePayload = null;
  const candidates = [
    { artist: "Geese", id: "getting-killed", primaryVotes: 12, title: "Getting Killed" },
    { artist: "Big Thief", id: "dragon", primaryVotes: 12, title: "Dragon New Warm Mountain" },
  ];

  await installAdminPollFixture(page, {
    poll: {
      album_of_week: { artist: "Fleetwood Mac", title: "Rumours" },
      candidates,
      cycle_label: "Event Week",
      description: "Choose finalists.",
      finalists: [],
      id: "event-week",
      phase: "primary",
      question: "Which albums advance?",
      status: "Primary voting is open",
    },
    results: {
      ballotCounts: { final: 0, nominations: 7, primary: 18 },
      currentAlbumRating: { averageRating: 8.4, ratingCount: 7 },
      finalists: [],
      irv: { rounds: [], tie: null, winnerId: null },
      nominations: [],
      primaryResults: candidates,
    },
  });
  await page.route("**/rest/v1/rpc/advance_to_final", async (route) => {
    advancePayload = route.request().postDataJSON();
    await route.fulfill({ body: "{}", contentType: "application/json", status: 200 });
  });
  await page.goto("/admin");

  await page.locator(".candidate-option").nth(0).click();
  await page.locator(".candidate-option").nth(1).click();
  await page.getByRole("button", { name: "Move to final" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Are you ready?" })).toBeVisible();
  await expect(dialog).toContainText("automatically close 18 hours later");
  expect(advancePayload).toBeNull();
  await dialog.getByRole("button", { name: "Open final voting" }).click();

  await expect.poll(() => advancePayload).not.toBeNull();
  expect(advancePayload.candidate_ids.sort()).toEqual(["dragon", "getting-killed"]);
});

test("an admin can remove an album from primary voting", async ({ page }) => {
  let removePayload = null;
  let candidates = [
    { artist: "Geese", id: "getting-killed", primaryVotes: 12, title: "Getting Killed" },
    { artist: "Big Thief", id: "dragon", primaryVotes: 9, title: "Dragon New Warm Mountain" },
  ];
  const currentPoll = () => ({
    album_of_week: { artist: "Fleetwood Mac", title: "Rumours" },
    candidates,
    cycle_label: "Event Week",
    description: "Choose finalists.",
    finalists: [],
    id: "event-week",
    phase: "primary",
    question: "Which albums advance?",
    status: "Primary voting is open",
  });
  const currentResults = () => ({
    ballotCounts: { final: 0, nominations: 7, primary: 18 },
    currentAlbumRating: { averageRating: 8.4, ratingCount: 7 },
    finalists: [],
    irv: { rounds: [], tie: null, winnerId: null },
    nominations: [],
    primaryResults: candidates,
  });

  await installAdminPollFixture(page, {
    poll: currentPoll,
    results: currentResults,
  });
  await page.route("**/rest/v1/rpc/remove_primary_candidate", async (route) => {
    removePayload = route.request().postDataJSON();
    candidates = candidates.filter((candidate) => candidate.id !== "getting-killed");
    await route.fulfill({
      body: JSON.stringify({
        affectedBallotCount: 12,
        candidateId: "getting-killed",
        resetBallotCount: 2,
      }),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.goto("/admin");

  const candidateRow = page.locator(".admin-primary-candidate-row", { hasText: "Getting Killed" });
  await expect(candidateRow).toBeVisible();
  await candidateRow.getByRole("button", { name: "Remove Getting Killed from primary voting" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Remove Getting Killed?" })).toBeVisible();
  await expect(dialog).toContainText("members who selected only this album will be able to submit a new ballot");
  expect(removePayload).toBeNull();
  await dialog.getByRole("button", { name: "Remove album" }).click();

  await expect.poll(() => removePayload).not.toBeNull();
  expect(removePayload).toEqual({
    candidate_id_input: "getting-killed",
    target_poll_id: "event-week",
  });
  await expect(page.locator(".candidate-option", { hasText: "Getting Killed" })).toHaveCount(0);
  await expect(page.getByText("Getting Killed was removed from primary voting.").first()).toBeVisible();
});

test("an open final tie can be resolved provisionally", async ({ page }) => {
  let tieBreakPayload = null;
  const finalists = [
    { artist: "Geese", id: "getting-killed", title: "Getting Killed" },
    { artist: "Big Thief", id: "dragon", title: "Dragon New Warm Mountain" },
    { artist: "Fleetwood Mac", id: "rumours", title: "Rumours" },
  ];

  await installAdminPollFixture(page, {
    poll: {
      album_of_week: { artist: "Fleetwood Mac", title: "Rumours" },
      candidates: finalists,
      cycle_label: "Event Week",
      description: "Rank the finalists.",
      finalClosedAt: null,
      finalClosesAt: "2099-08-30T18:00:00.000Z",
      finalIsClosed: false,
      finalOpenedAt: "2099-08-30T00:00:00.000Z",
      finalists,
      id: "event-week",
      phase: "final",
      question: "Rank the finalists.",
      status: "Final IRV voting is open",
    },
    results: {
      ballotCounts: { final: 24, nominations: 7, primary: 18 },
      currentAlbumRating: { averageRating: 8.4, ratingCount: 7 },
      finalVoting: {
        closedAt: null,
        closesAt: "2099-08-30T18:00:00.000Z",
        isClosed: false,
        openedAt: "2099-08-30T00:00:00.000Z",
      },
      finalists,
      irv: {
        rounds: [{
          eliminatedCandidateId: "rumours",
          round: 1,
          tallies: finalists.map((candidate) => ({ candidateId: candidate.id, votes: 8 })),
        }],
        tie: { candidateIds: ["getting-killed", "dragon"], round: 2 },
        winnerId: null,
      },
      nominations: [],
      primaryResults: [],
    },
  });
  await page.route("**/rest/v1/rpc/resolve_irv_tie", async (route) => {
    tieBreakPayload = route.request().postDataJSON();
    await route.fulfill({ body: "{}", contentType: "application/json", status: 200 });
  });
  await page.goto("/admin");

  await expect(page.getByText("This decision is provisional.")).toBeVisible();
  const choice = page.getByRole("radio", { name: /Getting Killed/ });
  await expect(choice).toBeEnabled();
  await choice.check();
  await page.getByRole("button", { name: "Record provisional elimination" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Are you ready?" })).toBeVisible();
  await expect(dialog).toContainText("provisional manual elimination");
  await expect(dialog).toContainText("next accepted final ballot");
  expect(tieBreakPayload).toBeNull();
  await dialog.getByRole("button", { name: "Provisionally eliminate Getting Killed" }).click();

  await expect.poll(() => tieBreakPayload).not.toBeNull();
  expect(tieBreakPayload).toEqual({
    eliminated_candidate_id_input: "getting-killed",
    target_poll_id: "event-week",
    target_round: 2,
  });
  await expect(page.getByText(/Getting Killed was provisionally eliminated/).first()).toBeVisible();
});

test("a closed final tie can be resolved through a confirmed admin decision", async ({ page }) => {
  let tieBreakPayload = null;
  const finalists = [
    { artist: "Geese", id: "getting-killed", title: "Getting Killed" },
    { artist: "Big Thief", id: "dragon", title: "Dragon New Warm Mountain" },
    { artist: "Fleetwood Mac", id: "rumours", title: "Rumours" },
  ];

  await installAdminPollFixture(page, {
    poll: {
      album_of_week: { artist: "Fleetwood Mac", title: "Rumours" },
      candidates: finalists,
      cycle_label: "Event Week",
      description: "Rank the finalists.",
      finalClosedAt: "2026-08-30T18:00:00.000Z",
      finalClosesAt: "2026-08-30T18:00:00.000Z",
      finalIsClosed: true,
      finalOpenedAt: "2026-08-30T00:00:00.000Z",
      finalists,
      id: "event-week",
      phase: "final",
      question: "Rank the finalists.",
      status: "Final voting is closed",
    },
    results: {
      ballotCounts: { final: 24, nominations: 7, primary: 18 },
      currentAlbumRating: { averageRating: 8.4, ratingCount: 7 },
      finalVoting: {
        closedAt: "2026-08-30T18:00:00.000Z",
        closesAt: "2026-08-30T18:00:00.000Z",
        isClosed: true,
        openedAt: "2026-08-30T00:00:00.000Z",
      },
      finalists,
      irv: {
        rounds: [{
          eliminatedCandidateId: "rumours",
          round: 1,
          tallies: finalists.map((candidate) => ({ candidateId: candidate.id, votes: 8 })),
        }],
        tie: { candidateIds: ["getting-killed", "dragon"], round: 2 },
        winnerId: null,
      },
      nominations: [],
      primaryResults: [],
    },
  });
  await page.route("**/rest/v1/rpc/resolve_irv_tie", async (route) => {
    tieBreakPayload = route.request().postDataJSON();
    await route.fulfill({ body: "{}", contentType: "application/json", status: 200 });
  });
  await page.goto("/admin");

  await expect(page.getByText("24", { exact: true }).first()).toBeVisible();
  await page.getByRole("radio", { name: /Getting Killed/ }).check();
  await page.getByRole("button", { name: "Record elimination and continue" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Are you ready?" })).toBeVisible();
  await expect(dialog).toContainText("permanently recorded");
  expect(tieBreakPayload).toBeNull();
  await dialog.getByRole("button", { name: "Eliminate Getting Killed" }).click();

  await expect.poll(() => tieBreakPayload).not.toBeNull();
  expect(tieBreakPayload).toEqual({
    eliminated_candidate_id_input: "getting-killed",
    target_poll_id: "event-week",
    target_round: 2,
  });
  await expect(page.getByText("Getting Killed was eliminated from round 2.").first()).toBeVisible();
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

test("archive rating summaries include the number of perfect 10s", async ({ page }) => {
  await page.route("https://playwright.supabase.co/rest/v1/album_archive_entries**", (route) => (
    route.fulfill({
      body: JSON.stringify([{
        album_title: "QA Perfect Score Album",
        archived_at: "2026-09-01T12:00:00.000Z",
        artist_name: "QA Artist",
        average_rating: 8.75,
        poll_id: "qa-perfect-score-week",
        rating_count: 12,
        ten_rating_count: 3,
      }]),
      contentType: "application/json",
      status: 200,
    })
  ));
  await page.goto("/archive");

  const archiveRow = page.locator(".archive-catalog-row", { hasText: "QA Perfect Score Album" });
  await expect(archiveRow).toBeVisible();
  await expect(archiveRow).toContainText("8.8/10");
  await expect(archiveRow).toContainText("3 perfect 10s");
  await expect(archiveRow).not.toContainText("12 ratings");
});
