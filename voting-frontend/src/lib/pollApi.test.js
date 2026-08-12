import assert from "node:assert/strict";
import test from "node:test";

import { fetchCurrentPoll } from "./pollApi.js";

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
});
