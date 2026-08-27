import assert from "node:assert/strict";
import test from "node:test";

import {
  checkRateLimit,
  checkPollRateLimit,
  getClientAddress,
  hasUserAccessToken,
  loadCurrentPoll,
  resetRateLimitsForTests,
  sanitizePublicPoll,
} from "../src/lib/pollProxy.js";

test("only JWT-shaped bearer values are treated as member sessions", () => {
  assert.equal(hasUserAccessToken("Bearer header.payload.signature"), true);
  assert.equal(hasUserAccessToken("Bearer azure-platform-token"), false);
  assert.equal(hasUserAccessToken(null), false);
});

test("anonymous poll responses exclude ballot candidates and unexpected fields", () => {
  const result = sanitizePublicPoll({
    id: "week-1",
    phase: "final",
    question: "Pick one",
    candidates: [{ id: "secret" }],
    finalists: [{ id: "secret" }],
    internal_note: "do not expose",
  });

  assert.deepEqual(result, {
    id: "week-1",
    phase: "final",
    question: "Pick one",
    candidates: [],
    finalists: [],
  });
});

test("the local limiter rejects sustained requests and reports a retry window", () => {
  resetRateLimitsForTests();

  for (let requestNumber = 0; requestNumber < 60; requestNumber += 1) {
    assert.equal(checkRateLimit("test-client", {
      maxRequests: 60,
      now: 1_000,
    }).allowed, true);
  }

  const blocked = checkRateLimit("test-client", {
    maxRequests: 60,
    now: 1_000,
  });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.retryAfter, 60);

  assert.equal(checkRateLimit("test-client", {
    maxRequests: 60,
    now: 61_001,
  }).allowed, true);
});

test("150 signed-in attendees can load a poll from one shared IP", () => {
  resetRateLimitsForTests();

  for (let attendee = 0; attendee < 150; attendee += 1) {
    const result = checkPollRateLimit({
      clientAddress: "203.0.113.50",
      sessionToken: `header.${attendee}.signature`,
    }, 1_000);

    assert.equal(result.allowed, true);
    assert.equal(result.scope, "session");
  }
});

test("signed-in refreshes are limited per session instead of per room", () => {
  resetRateLimitsForTests();
  const client = {
    clientAddress: "203.0.113.50",
    sessionToken: "header.member.signature",
  };

  for (let requestNumber = 0; requestNumber < 30; requestNumber += 1) {
    assert.equal(checkPollRateLimit(client, 1_000).allowed, true);
  }

  const blocked = checkPollRateLimit(client, 1_000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.scope, "session");
  assert.equal(blocked.limit, 30);
});

test("anonymous room traffic has capacity for a meeting-sized burst", () => {
  resetRateLimitsForTests();
  const client = { clientAddress: "203.0.113.50", sessionToken: null };

  for (let requestNumber = 0; requestNumber < 300; requestNumber += 1) {
    assert.equal(checkPollRateLimit(client, 1_000).allowed, true);
  }

  const blocked = checkPollRateLimit(client, 1_000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.scope, "anonymous-network");
  assert.equal(blocked.limit, 300);
});

test("the emergency network ceiling still stops token rotation", () => {
  resetRateLimitsForTests();

  for (let requestNumber = 0; requestNumber < 1_000; requestNumber += 1) {
    const result = checkPollRateLimit({
      clientAddress: "203.0.113.50",
      sessionToken: `header.rotated-${requestNumber}.signature`,
    }, 1_000);
    assert.equal(result.allowed, true);
  }

  const blocked = checkPollRateLimit({
    clientAddress: "203.0.113.50",
    sessionToken: "header.one-more.signature",
  }, 1_000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.scope, "network");
  assert.equal(blocked.limit, 1_000);
});

test("Cloudflare's connecting address takes precedence over forwarded values", () => {
  const request = {
    headers: new Headers({
      "cf-connecting-ip": "203.0.113.12",
      "x-forwarded-for": "198.51.100.4, 198.51.100.5",
    }),
  };

  assert.equal(getClientAddress(request), "203.0.113.12");
});

test("the limiter caps tracked clients to avoid attacker-controlled memory growth", () => {
  resetRateLimitsForTests();

  for (let index = 0; index < 10_050; index += 1) {
    const result = checkRateLimit(`198.51.100.${index}`, { now: 1_000 });
    assert.equal(result.allowed, true);
  }

  const evictedClient = checkRateLimit("198.51.100.0", { now: 1_001 });
  assert.equal(evictedClient.remaining, 299);
});

test("anonymous reads use the server credential and sanitize the response", async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "public-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "server-only-key";

  const requests = [];
  const fetchMock = async (url, options) => {
    requests.push({ url, options });
    return Response.json({ id: "poll-1", candidates: [{ id: "private" }] });
  };

  const poll = await loadCurrentPoll(null, fetchMock);

  assert.equal(requests[0].options.headers.apikey, "server-only-key");
  assert.equal(requests[0].options.headers.Authorization, "Bearer server-only-key");
  assert.deepEqual(poll, { id: "poll-1", candidates: [], finalists: [] });
});

test("member reads forward the bearer token with the public API key", async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "public-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "server-only-key";

  let forwardedHeaders;
  const fetchMock = async (_url, options) => {
    forwardedHeaders = options.headers;
    return Response.json({ id: "poll-1", candidates: [{ id: "member-visible" }] });
  };

  const poll = await loadCurrentPoll("Bearer header.payload.signature", fetchMock);

  assert.equal(forwardedHeaders.apikey, "public-anon-key");
  assert.equal(forwardedHeaders.Authorization, "Bearer header.payload.signature");
  assert.equal(poll.candidates[0].id, "member-visible");
});

test("platform bearer headers use the anonymous server path", async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "public-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "server-only-key";

  let forwardedHeaders;
  const fetchMock = async (_url, options) => {
    forwardedHeaders = options.headers;
    return Response.json({ id: "poll-1", candidates: [{ id: "private" }] });
  };

  const poll = await loadCurrentPoll("Bearer azure-platform-token", fetchMock);

  assert.equal(forwardedHeaders.apikey, "server-only-key");
  assert.equal(forwardedHeaders.Authorization, "Bearer server-only-key");
  assert.deepEqual(poll, { id: "poll-1", candidates: [], finalists: [] });
});
