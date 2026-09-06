export async function installMockSession(page, { displayName, email, userId }) {
  const expiresAt = Math.floor(Date.now() / 1000) + 3_600;

  await page.addInitScript(
    ({ activeDisplayName, activeEmail, activeUserId, sessionExpiresAt }) => {
      const encodeJwtPart = (value) =>
        btoa(JSON.stringify(value))
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

      localStorage.setItem(
        "sb-playwright-auth-token",
        JSON.stringify({
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
        }),
      );
    },
    {
      activeDisplayName: displayName,
      activeEmail: email,
      activeUserId: userId,
      sessionExpiresAt: expiresAt,
    },
  );
}

export async function installAdminPollFixture(page, { poll, results }) {
  const userId = "33333333-3333-4333-8333-333333333333";

  await installMockSession(page, {
    displayName: "Event Admin",
    email: "event-admin@albumasu.com",
    userId,
  });
  await page.route("**/rest/v1/memberships**", (route) =>
    route.fulfill({
      body: JSON.stringify([
        {
          created_at: "2026-08-30T12:00:00.000Z",
          display_name: "Event Admin",
          email: "event-admin@albumasu.com",
          role: "admin",
          status: "approved",
          updated_at: "2026-08-30T12:00:00.000Z",
          user_id: userId,
        },
      ]),
      contentType: "application/json",
      status: 200,
    }),
  );
  await page.route("**/rest/v1/record_shelf_items**", (route) =>
    route.fulfill({
      body: "[]",
      contentType: "application/json",
      status: 200,
    }),
  );
  await page.route("**/rest/v1/record_shelf_covers**", (route) =>
    route.fulfill({
      body: "[]",
      contentType: "application/json",
      status: 200,
    }),
  );
  await page.route("**/rest/v1/rpc/get_admin_poll_results", (route) =>
    route.fulfill({
      body: JSON.stringify(typeof results === "function" ? results() : results),
      contentType: "application/json",
      status: 200,
    }),
  );
  await page.route("**/api/current-poll", (route) =>
    route.fulfill({
      body: JSON.stringify(typeof poll === "function" ? poll() : poll),
      contentType: "application/json",
      status: 200,
    }),
  );
}

export async function installPublicFixtures({ page }) {
  // Keep the suite deterministic when third-party album metadata is unavailable.
  await page.route("https://musicbrainz.org/**", (route) => route.abort());
  await page.route("https://coverartarchive.org/**", (route) => route.abort());
  await page.route(
    "https://playwright.supabase.co/rest/v1/album_archive_entries**",
    (route) =>
      route.fulfill({
        body: "[]",
        contentType: "application/json",
        status: 200,
      }),
  );
  await page.route("**/api/current-poll", (route) =>
    route.fulfill({
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
    }),
  );
}
