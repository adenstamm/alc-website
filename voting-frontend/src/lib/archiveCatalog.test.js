import assert from "node:assert/strict";

import {
  filterArchiveAlbums,
  getVisibleArchiveAlbums,
  sortArchiveAlbums,
} from "./archiveCatalog.js";

const albums = [
  { id: "one", title: "Blue", artist: "Joni Mitchell", sessionNumber: 1 },
  { id: "twenty-four", title: "Hounds of Love", artist: "Kate Bush", sessionNumber: 24 },
  { id: "forty-two", title: "Ágætis byrjun", artist: "Sigur Rós", sessionNumber: 42 },
  { id: "latest", title: "24 Carat Black", artist: "The 24-Carat Black", sessionNumber: 243 },
];

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test("empty archive query returns every album", () => {
  assert.equal(filterArchiveAlbums(albums, "  ").length, albums.length);
});

test("archive search matches titles and artists case-insensitively", () => {
  assert.deepEqual(filterArchiveAlbums(albums, "  KATE bush ").map((album) => album.id), ["twenty-four"]);
  assert.deepEqual(filterArchiveAlbums(albums, "blue").map((album) => album.id), ["one"]);
});

test("archive search ignores diacritics", () => {
  assert.deepEqual(filterArchiveAlbums(albums, "agaetis").map((album) => album.id), ["forty-two"]);
});

test("archive search supports exact session-number formats", () => {
  assert.deepEqual(
    filterArchiveAlbums(albums, "24").map((album) => album.id),
    ["twenty-four", "latest"],
  );

  for (const query of ["#24", "session 24", "session #024"]) {
    assert.deepEqual(
      filterArchiveAlbums(albums, query).map((album) => album.id),
      ["twenty-four"],
    );
  }
});

test("archive search returns an empty list when nothing matches", () => {
  assert.deepEqual(filterArchiveAlbums(albums, "not in the archive"), []);
});

test("archive sorting supports newest, oldest, and natural A-Z order", () => {
  assert.deepEqual(sortArchiveAlbums(albums, "newest").map((album) => album.id), ["latest", "forty-two", "twenty-four", "one"]);
  assert.deepEqual(sortArchiveAlbums(albums, "oldest").map((album) => album.id), ["one", "twenty-four", "forty-two", "latest"]);
  assert.deepEqual(sortArchiveAlbums(albums, "az").map((album) => album.id), ["latest", "forty-two", "one", "twenty-four"]);
});

test("archive filtering and sorting do not mutate the source array", () => {
  const originalOrder = albums.map((album) => album.id);

  getVisibleArchiveAlbums(albums, "", "oldest");

  assert.deepEqual(albums.map((album) => album.id), originalOrder);
});
