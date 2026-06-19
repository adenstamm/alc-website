import assert from "node:assert/strict";

import { parseAlbumArchiveText, parseArchiveLine } from "./albumArchive.js";

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
