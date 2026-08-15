import assert from "node:assert/strict";

import {
  ALBUM_COVER_MAX_BYTES,
  createAlbumCoverStoragePath,
  getManagedAlbumCoverStoragePath,
  saveCurrentAlbumWithCover,
  validateAlbumCoverFile,
} from "./albumCoverUpload.js";

async function test(name, callback) {
  try {
    await callback();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

await test("album cover uploads accept supported image formats", () => {
  assert.equal(validateAlbumCoverFile({ type: "image/jpeg", size: 1024 }), null);
  assert.equal(validateAlbumCoverFile({ type: "image/png", size: ALBUM_COVER_MAX_BYTES }), null);
  assert.equal(validateAlbumCoverFile({ type: "image/webp", size: 2048 }), null);
});

await test("album cover uploads reject unsupported and oversized files", () => {
  assert.equal(
    validateAlbumCoverFile({ type: "image/svg+xml", size: 1024 }),
    "Choose a JPG, PNG, or WebP image.",
  );
  assert.equal(
    validateAlbumCoverFile({ type: "image/png", size: ALBUM_COVER_MAX_BYTES + 1 }),
    "Choose an image smaller than 5 MB.",
  );
});

await test("album cover storage paths use safe poll ids and MIME-derived extensions", () => {
  assert.equal(
    createAlbumCoverStoragePath("Poll: Summer / 2026", { type: "image/webp" }, 1723456789012),
    "current-albums/poll-summer-2026/1723456789012.webp",
  );
});

await test("only managed current-album public URLs resolve to removable storage paths", () => {
  const managedUrl = "https://example.supabase.co/storage/v1/object/public/record-shelf-covers/current-albums/poll-one/cover%201.jpg";

  assert.equal(
    getManagedAlbumCoverStoragePath(managedUrl, "record-shelf-covers"),
    "current-albums/poll-one/cover 1.jpg",
  );
  assert.equal(
    getManagedAlbumCoverStoragePath("https://images.example.com/cover.jpg", "record-shelf-covers"),
    null,
  );
  assert.equal(
    getManagedAlbumCoverStoragePath(
      "https://example.supabase.co/storage/v1/object/public/record-shelf-covers/album-one/cover.jpg",
      "record-shelf-covers",
    ),
    null,
  );
});

await test("saving an album uploads its cover before writing the public URL", async () => {
  const storageCalls = [];
  let rpcPayload = null;
  const publicUrl = "https://example.supabase.co/storage/v1/object/public/record-shelf-covers/current-albums/poll-one/2000.webp";
  const supabase = {
    rpc: async (name, payload) => {
      assert.equal(name, "update_current_album");
      rpcPayload = payload;
      return { error: null };
    },
    storage: {
      from: (bucket) => {
        assert.equal(bucket, "record-shelf-covers");
        return {
          getPublicUrl: (path) => {
            storageCalls.push(["publicUrl", path]);
            return { data: { publicUrl } };
          },
          remove: async (paths) => {
            storageCalls.push(["remove", paths]);
            return { error: null };
          },
          upload: async (path, file, options) => {
            storageCalls.push(["upload", path, file, options]);
            return { error: null };
          },
        };
      },
    },
  };
  const coverFile = { name: "cover.webp", size: 4096, type: "image/webp" };

  const result = await saveCurrentAlbumWithCover({
    album: { title: " Album One ", artist: " Artist One ", note: " New listen " },
    bucket: "record-shelf-covers",
    coverFile,
    currentCoverUrl: "https://images.example.com/old.jpg",
    pollId: "Poll One",
    supabase,
    uploadedAt: 2000,
  });

  assert.deepEqual(result, { coverUrl: publicUrl, uploaded: true });
  assert.equal(storageCalls[0][0], "upload");
  assert.equal(storageCalls[0][1], "current-albums/poll-one/2000.webp");
  assert.equal(storageCalls[1][0], "publicUrl");
  assert.deepEqual(rpcPayload, {
    album_title: "Album One",
    album_artist: "Artist One",
    album_note: "New listen",
    cover_url: publicUrl,
  });
});

await test("a failed album update removes the cover uploaded for that attempt", async () => {
  const removedPaths = [];
  const supabase = {
    rpc: async () => ({ error: new Error("Database unavailable") }),
    storage: {
      from: () => ({
        getPublicUrl: () => ({
          data: {
            publicUrl: "https://example.supabase.co/storage/v1/object/public/record-shelf-covers/current-albums/poll-one/3000.jpg",
          },
        }),
        remove: async (paths) => {
          removedPaths.push(paths);
          return { error: null };
        },
        upload: async () => ({ error: null }),
      }),
    },
  };

  await assert.rejects(
    saveCurrentAlbumWithCover({
      album: { title: "Album One", artist: "Artist One", note: "" },
      bucket: "record-shelf-covers",
      coverFile: { name: "cover.jpg", size: 4096, type: "image/jpeg" },
      currentCoverUrl: "",
      pollId: "poll-one",
      supabase,
      uploadedAt: 3000,
    }),
    /The album could not be updated\. Database unavailable/,
  );
  assert.deepEqual(removedPaths, [["current-albums/poll-one/3000.jpg"]]);
});
