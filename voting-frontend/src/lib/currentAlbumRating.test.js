import assert from "node:assert/strict";
import test from "node:test";

import {
  formatAverageRating,
  getCurrentAlbumRatingError,
  normalizeCurrentAlbumRating,
  validateCurrentAlbumRating,
} from "./currentAlbumRating.js";

test("current-album ratings accept only integers from 1 to 10", () => {
  for (let rating = 1; rating <= 10; rating += 1) {
    assert.deepEqual(validateCurrentAlbumRating(String(rating)), {
      isValid: true,
      rating,
    });
  }

  for (const rating of ["", "0", "11", "7.5", "eight", null]) {
    assert.equal(validateCurrentAlbumRating(rating).isValid, false);
  }
});

test("saved rating rows are normalized and scoped to the current member", () => {
  assert.deepEqual(normalizeCurrentAlbumRating({
    poll_id: "rock-week",
    rating: 9,
    created_at: "2026-08-27T12:00:00.000Z",
  }, "member-1"), {
    pollId: "rock-week",
    rating: 9,
    submittedAt: "2026-08-27T12:00:00.000Z",
    userId: "member-1",
  });
  assert.equal(normalizeCurrentAlbumRating({ rating: 12 }, "member-1"), null);
});

test("rating errors and averages are formatted for the interface", () => {
  assert.equal(
    getCurrentAlbumRatingError({ message: "ALREADY_RATED: duplicate" }),
    "Your account already rated this album.",
  );
  assert.equal(formatAverageRating("8.6667"), "8.7");
  assert.equal(formatAverageRating(null), null);
});
