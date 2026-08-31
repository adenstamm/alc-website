import assert from "node:assert/strict";
import test from "node:test";

import {
  clearStoredBallot,
  readStoredBallot,
  writeStoredBallot,
} from "./ballotStorage.js";
import { fetchMembershipWithRetry, MembershipLookupError } from "./membershipApi.js";
import {
  getPollFocusRefreshDelay,
  getPollRefreshDelay,
  getPublishedAlbumRefreshDelay,
  PUBLISHED_ALBUM_REFRESH_MAX_MS,
  PUBLISHED_ALBUM_REFRESH_MIN_MS,
  POLL_FOCUS_REFRESH_MAX_MS,
  POLL_FOCUS_REFRESH_MIN_MS,
  POLL_REFRESH_MAX_MS,
  POLL_REFRESH_MIN_MS,
} from "./pollRefresh.js";
import { parseRetryAfter } from "./requestRetry.js";

test("membership lookup retries transient failures and eventually returns approval", async () => {
  let lookupCount = 0;
  const delays = [];
  const membership = { status: "approved", user_id: "member-1" };

  const result = await fetchMembershipWithRetry(async () => {
    lookupCount += 1;

    if (lookupCount < 3) {
      return { data: null, error: { message: "Gateway unavailable" }, status: 503 };
    }

    return { data: membership, error: null, status: 200 };
  }, {
    random: () => 0,
    sleep: async (delay) => {
      delays.push(delay);
    },
  });

  assert.equal(result, membership);
  assert.equal(lookupCount, 3);
  assert.deepEqual(delays, [300, 600]);
});

test("membership lookup does not repeatedly retry a definitive authorization error", async () => {
  let lookupCount = 0;

  await assert.rejects(
    () => fetchMembershipWithRetry(async () => {
      lookupCount += 1;
      return { data: null, error: { message: "Forbidden" }, status: 403 };
    }, { sleep: async () => {} }),
    MembershipLookupError,
  );

  assert.equal(lookupCount, 1);
});

test("hung membership lookups time out and retry", async () => {
  let lookupCount = 0;

  await assert.rejects(
    () => fetchMembershipWithRetry(({ signal }) => {
      lookupCount += 1;
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(
          signal.reason || new DOMException("Aborted", "AbortError"),
        ), { once: true });
      });
    }, {
      maxAttempts: 2,
      requestTimeoutMs: 1,
      sleep: async () => {},
    }),
    MembershipLookupError,
  );

  assert.equal(lookupCount, 2);
});

test("ballot storage remains optional when browser storage is blocked", () => {
  const blockedStorage = {
    getItem() {
      throw new Error("Storage blocked");
    },
    removeItem() {
      throw new Error("Storage blocked");
    },
    setItem() {
      throw new Error("Storage blocked");
    },
  };

  assert.equal(readStoredBallot("member-1", "poll-1", "primary", blockedStorage), null);
  assert.equal(
    writeStoredBallot("member-1", "poll-1", "primary", { pollId: "poll-1" }, blockedStorage),
    false,
  );
  assert.equal(clearStoredBallot("member-1", "poll-1", "primary", blockedStorage), false);
});

test("poll refresh jitter stays inside the event-safe windows", () => {
  assert.equal(getPollRefreshDelay(() => 0), POLL_REFRESH_MIN_MS);
  assert.equal(getPollRefreshDelay(() => 1), POLL_REFRESH_MAX_MS);
  assert.equal(getPollFocusRefreshDelay(() => 0), POLL_FOCUS_REFRESH_MIN_MS);
  assert.equal(getPollFocusRefreshDelay(() => 1), POLL_FOCUS_REFRESH_MAX_MS);
  assert.equal(getPublishedAlbumRefreshDelay(() => 0), PUBLISHED_ALBUM_REFRESH_MIN_MS);
  assert.equal(getPublishedAlbumRefreshDelay(() => 1), PUBLISHED_ALBUM_REFRESH_MAX_MS);
});

test("Retry-After supports seconds and HTTP dates", () => {
  assert.equal(parseRetryAfter("1.5", 0), 1_500);
  assert.equal(parseRetryAfter("Thu, 01 Jan 1970 00:00:03 GMT", 1_000), 2_000);
});
