import { Buffer } from "node:buffer";
import { expect, test } from "playwright/test";
import {
  installAdminPollFixture,
  installMockSession,
  installPublicFixtures,
} from "./fixtures";

test.beforeEach(installPublicFixtures);

test("password recovery survives a delayed lazy page", async ({ page }) => {
  const user = {
    id: "77777777-7777-4777-8777-777777777777",
    email: "recovery@example.test",
    aud: "authenticated",
    role: "authenticated",
    email_confirmed_at: "2026-01-01T00:00:00Z",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
  };
  const encode = (data) =>
    Buffer.from(JSON.stringify(data)).toString("base64url");
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated" })}.fixture`;
  await page.route("**/auth/v1/user", (route) => route.fulfill({ json: user }));
  await page.route("**/rest/v1/memberships**", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/assets/ResetPassword-*.js", async (route) => {
    // Force auth initialization to finish before the recovery view mounts.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.continue();
  });
  await page.goto(
    `/reset-password#access_token=${token}&refresh_token=fixture&expires_in=3600&token_type=bearer&type=recovery`,
  );
  await expect(page.getByLabel("New password", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Open the password reset link from your email."),
  ).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe("");
});

test("removing a sole primary choice unlocks the invalidated ballot", async ({
  page,
}) => {
  const userId = "88888888-8888-4888-8888-888888888888";
  await installMockSession(page, {
    userId,
    displayName: "Voter",
    email: "voter@example.test",
  });
  await page.route("**/rest/v1/memberships**", (route) =>
    route.fulfill({
      json: [{ user_id: userId, role: "member", status: "approved" }],
    }),
  );
  let removed = false;
  let reads = 0;
  const candidateA = { id: "choice-a", title: "Choice A", artist: "Artist A" };
  const candidateB = { id: "choice-b", title: "Choice B", artist: "Artist B" };
  await page.route("**/api/current-poll", (route) =>
    route.fulfill({
      json: {
        id: "reconcile",
        phase: "primary",
        album_of_week: { title: "Current", artist: "Artist" },
        candidates: removed ? [candidateB] : [candidateA, candidateB],
        finalists: [],
      },
    }),
  );
  await page.route("**/rest/v1/votes**", (route) => {
    reads++;
    return route.fulfill({
      json: removed
        ? []
        : [
            {
              poll_id: "reconcile",
              phase: "primary",
              created_at: "2026-09-01T00:00:00Z",
              vote_choices: [{ candidate_id: "choice-a", rank: 1 }],
            },
          ],
    });
  });
  await page.goto("/vote");
  await expect(
    page.getByText("Your ballot is locked for this phase."),
  ).toBeVisible();
  const initialReads = reads;
  removed = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("checkbox")).toHaveCount(1);
  await expect(page.getByRole("checkbox")).toBeEnabled();
  await expect(
    page.getByText("Your ballot is locked for this phase."),
  ).toHaveCount(0);
  expect(reads).toBeGreaterThan(initialReads);
});

test("an admin can reopen an empty closed final after confirmation", async ({
  page,
}) => {
  let calls = 0;
  const poll = {
    id: "empty",
    phase: "final",
    album_of_week: { title: "Current", artist: "Artist" },
    finalIsClosed: true,
    finalClosedAt: "2026-09-01T18:00:00Z",
    finalClosesAt: "2026-09-01T18:00:00Z",
    finalOpenedAt: "2026-09-01T00:00:00Z",
    finalists: [{ id: "retained", title: "Retained finalist", artist: "Fixture artist" }],
    candidates: [],
  };
  await installAdminPollFixture(page, {
    poll,
    results: {
      ballotCounts: { final: 0, nominations: 5, primary: 2 },
      nominations: [],
      primaryResults: [],
      finalists: [],
      irv: { rounds: [], winnerId: null, tie: null },
    },
  });
  await page.route("**/rest/v1/rpc/reopen_empty_final", (route) => {
    calls++;
    return route.fulfill({ json: { state: "reopened" } });
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "Reopen empty final" }).click();
  expect(calls).toBe(0);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Reopen final for 18 hours" })
    .click();
  await expect.poll(() => calls).toBe(1);
  await expect(
    page.getByText("Final voting reopened for 18 hours.").first(),
  ).toBeVisible();
});

test("production HTML and headers describe the requested route", async ({
  request,
}) => {
  const response = await request.get("/about");
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain(
    "<title>About | Album Listening Club</title>",
  );
  expect(response.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  expect((await request.get("/route-that-does-not-exist")).status()).toBe(404);
  expect((await request.get("/account")).headers()["cache-control"]).toContain(
    "no-store",
  );
});
