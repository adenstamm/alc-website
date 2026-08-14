import assert from "node:assert/strict";

import {
  calculateIrvResult,
  getRequiredFinalistCount,
  moveRankedCandidate,
  validateFinalistSelection,
  validateFinalRanking,
  validatePrimarySelection,
} from "./votingLogic.js";

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test("primary allows fewer than five selections", () => {
  assert.equal(validatePrimarySelection(["album-a"]).isValid, true);
  assert.equal(validatePrimarySelection(["album-a", "album-b", "album-c"]).isValid, true);
});

test("primary rejects empty, duplicate, and over-limit ballots", () => {
  assert.equal(validatePrimarySelection([]).isValid, false);
  assert.equal(validatePrimarySelection(["a", "a"]).isValid, false);
  assert.equal(validatePrimarySelection(["a", "b", "c", "d", "e", "f"]).isValid, false);
});

test("finalist selection requires every available album up to five", () => {
  assert.equal(getRequiredFinalistCount(0), 0);
  assert.equal(getRequiredFinalistCount(3), 3);
  assert.equal(getRequiredFinalistCount(8), 5);
  assert.equal(validateFinalistSelection(["a", "b", "c"], 3).isValid, true);
  assert.equal(validateFinalistSelection(["a", "b"], 3).isValid, false);
  assert.equal(validateFinalistSelection(["a", "a", "c"], 3).isValid, false);
  assert.equal(validateFinalistSelection(["a", "b", "c", "d", "e"], 8).isValid, true);
});

test("final ranking requires the actual finalist count exactly once", () => {
  assert.equal(validateFinalRanking(["a", "b", "c", "d", "e"]).isValid, true);
  assert.equal(validateFinalRanking(["a", "b", "c", "d"]).isValid, false);
  assert.equal(validateFinalRanking(["a", "b", "c", "d", "d"]).isValid, false);
  assert.equal(validateFinalRanking(["a", "b", "c"], 3).isValid, true);
  assert.equal(validateFinalRanking(["a", "b"], 3).isValid, false);
  assert.equal(validateFinalRanking(["a"], 0).isValid, false);
});

test("ranked candidates move within bounds", () => {
  assert.deepEqual(moveRankedCandidate(["a", "b", "c"], "b", -1), ["b", "a", "c"]);
  assert.deepEqual(moveRankedCandidate(["a", "b", "c"], "a", -1), ["a", "b", "c"]);
  assert.deepEqual(moveRankedCandidate(["a", "b", "c"], "c", 1), ["a", "b", "c"]);
});

test("IRV transfers ballots after elimination", () => {
  const result = calculateIrvResult(
    [
      ["a", "b", "c"],
      ["b", "a", "c"],
      ["c", "b", "a"],
      ["c", "b", "a"],
      ["a", "b", "c"],
    ],
    ["a", "b", "c"],
  );

  assert.equal(result.winnerId, "a");
  assert.equal(result.rounds[0].eliminatedCandidateId, "b");
  assert.equal(result.rounds.length, 2);
});

test("IRV reports manual tie states", () => {
  const result = calculateIrvResult(
    [
      ["a", "b"],
      ["b", "a"],
    ],
    ["a", "b"],
  );

  assert.equal(result.winnerId, null);
  assert.deepEqual(result.tie.candidateIds, ["a", "b"]);
});
