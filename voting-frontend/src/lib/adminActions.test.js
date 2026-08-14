import assert from "node:assert/strict";

import {
  executeAdminPhaseAction,
  getAdminActionErrorMessage,
} from "./adminActions.js";

async function runTest(name, callback) {
  try {
    await callback();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

await runTest("admin action errors remove database error codes", () => {
  assert.equal(
    getAdminActionErrorMessage({
      message: "FINALIST_COUNT_REQUIRED: Select every available finalist.",
    }),
    "Select every available finalist.",
  );
  assert.equal(
    getAdminActionErrorMessage(null),
    "The poll could not be updated. Try again.",
  );
});

await runTest("successful admin actions do not require recovery", async () => {
  let refreshCount = 0;
  const result = await executeAdminPhaseAction({
    action: "advance_to_final",
    expectedPhase: "final",
    params: { candidate_ids: ["album-1"] },
    pollId: "poll-1",
    refreshPoll: async () => {
      refreshCount += 1;
      return { phase: "final" };
    },
    rpc: async (action, payload) => {
      assert.equal(action, "advance_to_final");
      assert.deepEqual(payload, {
        target_poll_id: "poll-1",
        candidate_ids: ["album-1"],
      });
      return { error: null };
    },
  });

  assert.deepEqual(result, {
    error: null,
    isSuccess: true,
    recovered: false,
  });
  assert.equal(refreshCount, 0);
});

await runTest("an ambiguous response is recovered when the phase advanced", async () => {
  const result = await executeAdminPhaseAction({
    action: "advance_to_final",
    expectedPhase: "final",
    pollId: "poll-1",
    refreshPoll: async () => ({ phase: "final" }),
    rpc: async () => ({ error: new Error("Network response was interrupted.") }),
  });

  assert.deepEqual(result, {
    error: null,
    isSuccess: true,
    recovered: true,
  });
});

await runTest("a rejected transition remains an error when the phase did not change", async () => {
  const actionError = new Error("FINALIST_COUNT_REQUIRED: Select every finalist.");
  const result = await executeAdminPhaseAction({
    action: "advance_to_final",
    expectedPhase: "final",
    pollId: "poll-1",
    refreshPoll: async () => ({ phase: "primary" }),
    rpc: async () => ({ error: actionError }),
  });

  assert.equal(result.isSuccess, false);
  assert.equal(result.recovered, false);
  assert.equal(result.error, actionError);
});

await runTest("verification failures preserve the original transition error", async () => {
  const actionError = new Error("Request failed.");
  const result = await executeAdminPhaseAction({
    action: "advance_to_primary",
    expectedPhase: "primary",
    pollId: "poll-1",
    refreshPoll: async () => {
      throw new Error("Refresh failed.");
    },
    rpc: async () => {
      throw actionError;
    },
  });

  assert.equal(result.isSuccess, false);
  assert.equal(result.recovered, false);
  assert.equal(result.error, actionError);
});
