import assert from "node:assert/strict";

import {
  mergeAlbumArchiveEntries,
  parseAlbumArchiveText,
  parseArchiveLine,
} from "./albumArchive.js";

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test("archive parser supports title-only lines", () => {
  assert.deepEqual(parseArchiveLine("Heaven or Las Vegas"), {
    title: "Heaven or Las Vegas",
    artist: "",
  });
});

test("archive parser supports title and artist lines", () => {
  assert.deepEqual(parseArchiveLine("Madvillainy - Madvillain"), {
    title: "Madvillainy",
    artist: "Madvillain",
  });
});

test("archive parser splits on the last separator", () => {
  assert.deepEqual(parseArchiveLine("D>E>A>T>H>M>E>T>A>L - Panchiko"), {
    title: "D>E>A>T>H>M>E>T>A>L",
    artist: "Panchiko",
  });
});

test("archive text parser removes blank lines", () => {
  assert.deepEqual(parseAlbumArchiveText("\nBlue - Joni Mitchell\n\nGreen\n"), [
    {
      title: "Blue",
      artist: "Joni Mitchell",
    },
    {
      title: "Green",
      artist: "",
    },
  ]);
});

test("archive parser ignores heading lines and artist missing placeholders", () => {
  assert.deepEqual(parseAlbumArchiveText("Formatted album-first:\nFlying Beagle - [artist missing]\n"), [
    {
      title: "Flying Beagle",
      artist: "",
    },
  ]);
});

test("dynamic archive entries append chronologically with rating summaries", () => {
  const merged = mergeAlbumArchiveEntries(
    [{ title: "Blue", artist: "Joni Mitchell" }],
    [
      {
        poll_id: "week-2",
        album_title: "Dummy",
        artist_name: "Portishead",
        average_rating: "8.25",
        rating_count: 12,
        archived_at: "2026-08-27T12:00:00.000Z",
      },
      {
        poll_id: "week-1",
        album_title: "Pink Moon",
        artist_name: "Nick Drake",
        average_rating: "9",
        rating_count: 10,
        archived_at: "2026-08-20T12:00:00.000Z",
      },
    ],
  );

  assert.deepEqual(merged.map((album) => album.title), ["Blue", "Pink Moon", "Dummy"]);
  assert.equal(merged[2].averageRating, 8.25);
  assert.equal(merged[2].ratingCount, 12);
});

test("dynamic archive entries enrich matching static albums instead of duplicating them", () => {
  const merged = mergeAlbumArchiveEntries(
    [{ title: "Dummy", artist: "Portishead" }],
    [{
      poll_id: "week-2",
      album_title: "Dummy",
      artist_name: "Portishead",
      average_rating: 8.5,
      rating_count: 20,
    }],
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].averageRating, 8.5);
  assert.equal(merged[0].pollId, "week-2");
});
