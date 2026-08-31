import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchCurrentPoll,
  fetchReliableCurrentPoll,
  isIncompleteMemberBallot,
} from "./pollApi.js";

test("member poll requests use the application-specific session header", async () => {
  const originalFetch = globalThis.fetch;
  let requestOptions;

  globalThis.fetch = async (_url, options) => {
    requestOptions = options;
    return Response.json({ id: "poll-1" });
  };

  try {
    await fetchCurrentPoll({ access_token: "header.payload.signature" });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(
    requestOptions.headers["X-AlbumASU-Session"],
    "header.payload.signature",
  );
  assert.equal(requestOptions.headers.Authorization, undefined);
  assert.equal(requestOptions.cache, "no-store");
});

test("anonymous poll requests do not send a session header", async () => {
  const originalFetch = globalThis.fetch;
  let requestOptions;

  globalThis.fetch = async (_url, options) => {
    requestOptions = options;
    return Response.json({ id: "poll-1" });
  };

  try {
    await fetchCurrentPoll(null);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requestOptions.headers["X-AlbumASU-Session"], undefined);
  assert.equal(requestOptions.headers.Authorization, undefined);
  assert.equal(requestOptions.cache, "no-store");
});

test("poll requests forward abort signals", async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  let requestOptions;

  globalThis.fetch = async (_url, options) => {
    requestOptions = options;
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(
        options.signal.reason || new DOMException("Aborted", "AbortError"),
      ), { once: true });
    });
  };

  try {
    const pendingRequest = fetchCurrentPoll(null, { signal: controller.signal });
    await Promise.resolve();
    controller.abort();
    await assert.rejects(pendingRequest, (error) => error.name === "AbortError");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requestOptions.signal.aborted, true);
});

test("hung poll requests time out and enter bounded retry recovery", async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;

  globalThis.fetch = async (_url, options) => {
    requestCount += 1;
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(
        options.signal.reason || new DOMException("Aborted", "AbortError"),
      ), { once: true });
    });
  };

  try {
    await assert.rejects(
      () => fetchReliableCurrentPoll(null, {
        maxAttempts: 2,
        requestTimeoutMs: 1,
        sleep: async () => {},
      }),
      (error) => error.status === 0 && /timed out/i.test(error.message),
    );
    assert.equal(requestCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rate-limit responses include a useful retry window", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => new Response(null, {
    headers: { "Retry-After": "12" },
    status: 429,
  });

  try {
    await assert.rejects(
      () => fetchCurrentPoll(null),
      (error) => {
        assert.equal(error.status, 429);
        assert.equal(error.retryAfter, 12);
        assert.match(error.message, /12 seconds/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("expired member sessions are distinguished from network failures", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => new Response(null, { status: 401 });

  try {
    await assert.rejects(
      () => fetchCurrentPoll({ access_token: "header.payload.signature" }),
      (error) => {
        assert.equal(error.status, 401);
        assert.match(error.message, /session expired/i);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("transient poll failures retry with bounded backoff", async () => {
  const originalFetch = globalThis.fetch;
  const delays = [];
  let requestCount = 0;

  globalThis.fetch = async () => {
    requestCount += 1;
    return requestCount < 3
      ? new Response(null, { status: 503 })
      : Response.json({ id: "poll-1", phase: "nominations" });
  };

  try {
    const poll = await fetchReliableCurrentPoll(null, {
      random: () => 0,
      sleep: async (delay) => {
        delays.push(delay);
      },
    });

    assert.equal(poll.id, "poll-1");
    assert.equal(requestCount, 3);
    assert.deepEqual(delays, [250, 500]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("automatic poll retry never runs before Retry-After", async () => {
  const originalFetch = globalThis.fetch;
  const delays = [];
  let requestCount = 0;

  globalThis.fetch = async () => {
    requestCount += 1;
    return requestCount === 1
      ? new Response(null, { headers: { "Retry-After": "2" }, status: 429 })
      : Response.json({ id: "poll-1", phase: "nominations" });
  };

  try {
    await fetchReliableCurrentPoll(null, {
      random: () => 0,
      sleep: async (delay) => {
        delays.push(delay);
      },
    });

    assert.deepEqual(delays, [2_000]);
    assert.equal(requestCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("long Retry-After windows remain manual instead of retrying too early", async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;

  globalThis.fetch = async () => {
    requestCount += 1;
    return new Response(null, { headers: { "Retry-After": "12" }, status: 429 });
  };

  try {
    await assert.rejects(
      () => fetchReliableCurrentPoll(null, { sleep: async () => {} }),
      (error) => error.status === 429 && error.retryAfter === 12,
    );
    assert.equal(requestCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("only signed-in primary and final ballots require candidates", () => {
  const session = { access_token: "header.payload.signature" };

  assert.equal(isIncompleteMemberBallot({ phase: "primary", candidates: [] }, session), true);
  assert.equal(isIncompleteMemberBallot({ phase: "final", finalists: [] }, session), true);
  assert.equal(isIncompleteMemberBallot({ phase: "nominations" }, session), false);
  assert.equal(isIncompleteMemberBallot({ phase: "final", finalists: [] }, null), false);
  assert.equal(isIncompleteMemberBallot(
    { phase: "primary", candidates: [] },
    session,
    { requireCandidates: false },
  ), false);
});

test("pending members can receive the intentionally hidden ballot without retrying", async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;

  globalThis.fetch = async () => {
    requestCount += 1;
    return Response.json({ phase: "primary", candidates: [] });
  };

  try {
    const poll = await fetchReliableCurrentPoll(
      { access_token: "header.payload.signature" },
      { requireCandidates: false },
    );
    assert.deepEqual(poll.candidates, []);
    assert.equal(requestCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an incomplete member ballot is retried once before rendering", async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;

  globalThis.fetch = async () => {
    requestCount += 1;
    return Response.json(requestCount === 1
      ? { phase: "primary", candidates: [] }
      : { phase: "primary", candidates: [{ id: "candidate-1" }] });
  };

  try {
    const poll = await fetchReliableCurrentPoll({
      access_token: "header.payload.signature",
    });
    assert.equal(poll.candidates[0].id, "candidate-1");
    assert.equal(requestCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("persistently incomplete member ballots become a recoverable error", async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;

  globalThis.fetch = async () => {
    requestCount += 1;
    return Response.json({ phase: "final", finalists: [] });
  };

  try {
    await assert.rejects(
      () => fetchReliableCurrentPoll({ access_token: "header.payload.signature" }),
      /without its candidates/i,
    );
    assert.equal(requestCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
