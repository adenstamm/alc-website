import assert from "node:assert/strict";
import test from "node:test";

import { createLatestRequestCoordinator } from "./latestRequestCoordinator.js";

test("identical in-flight requests share one promise", async () => {
  const coordinator = createLatestRequestCoordinator();
  let requestCount = 0;
  let releaseRequest;
  const pendingRequest = new Promise((resolve) => {
    releaseRequest = resolve;
  });
  const request = async () => {
    requestCount += 1;
    await pendingRequest;
    return "loaded";
  };

  const first = coordinator.run("member-1", request);
  const second = coordinator.run("member-1", request);

  assert.equal(first, second);
  releaseRequest();
  assert.equal(await first, "loaded");
  assert.equal(requestCount, 1);
});

test("a newer request aborts and invalidates the older response", async () => {
  const coordinator = createLatestRequestCoordinator();
  let firstSignal;
  let firstIsLatest;
  let releaseFirst;
  const firstPending = new Promise((resolve) => {
    releaseFirst = resolve;
  });

  const first = coordinator.run("anonymous", async ({ isLatest, signal }) => {
    firstSignal = signal;
    await firstPending;
    firstIsLatest = isLatest();
    return "anonymous";
  });
  const second = coordinator.run("member-1", async ({ isLatest }) => {
    assert.equal(isLatest(), true);
    return "member";
  });

  await second;
  assert.equal(firstSignal.aborted, true);
  releaseFirst();
  await first;
  assert.equal(firstIsLatest, false);
});

test("forced refreshes replace identical in-flight requests", async () => {
  const coordinator = createLatestRequestCoordinator();
  let firstSignal;

  const first = coordinator.run("member-1", async ({ signal }) => {
    firstSignal = signal;
    return new Promise((resolve) => {
      signal.addEventListener("abort", () => resolve("aborted"), { once: true });
    });
  });
  await Promise.resolve();
  const second = coordinator.run("member-1", async () => "fresh", { force: true });

  assert.equal(firstSignal.aborted, true);
  assert.equal(await first, "aborted");
  assert.equal(await second, "fresh");
});
