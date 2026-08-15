export const ALBUM_COVER_ACCEPT = "image/jpeg,image/png,image/webp";
export const ALBUM_COVER_MAX_BYTES = 5 * 1024 * 1024;

const extensionByMimeType = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function validateAlbumCoverFile(file) {
  if (!file || !extensionByMimeType[file.type?.toLowerCase()]) {
    return "Choose a JPG, PNG, or WebP image.";
  }

  if (file.size > ALBUM_COVER_MAX_BYTES) {
    return "Choose an image smaller than 5 MB.";
  }

  return null;
}

export function createAlbumCoverStoragePath(pollId, file, uploadedAt = Date.now()) {
  const extension = extensionByMimeType[file.type?.toLowerCase()] || "jpg";
  const safePollId = String(pollId || "active-poll")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "active-poll";

  return `current-albums/${safePollId}/${Math.trunc(uploadedAt)}.${extension}`;
}

export function getManagedAlbumCoverStoragePath(publicUrl, bucket) {
  if (!publicUrl || !bucket) {
    return null;
  }

  try {
    const marker = `/storage/v1/object/public/${bucket}/`;
    const pathname = new URL(publicUrl).pathname;
    const markerIndex = pathname.indexOf(marker);

    if (markerIndex === -1) {
      return null;
    }

    const storagePath = decodeURIComponent(pathname.slice(markerIndex + marker.length));
    return storagePath.startsWith("current-albums/") ? storagePath : null;
  } catch {
    return null;
  }
}

export async function saveCurrentAlbumWithCover({
  album,
  bucket,
  coverFile,
  currentCoverUrl,
  pollId,
  supabase,
  uploadedAt = Date.now(),
}) {
  const validationError = coverFile ? validateAlbumCoverFile(coverFile) : null;

  if (validationError) {
    throw new Error(validationError);
  }

  let nextCoverUrl = currentCoverUrl?.trim() || null;
  let uploadedStoragePath = null;

  try {
    if (coverFile) {
      uploadedStoragePath = createAlbumCoverStoragePath(pollId, coverFile, uploadedAt);
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(uploadedStoragePath, coverFile, {
          cacheControl: "31536000",
          contentType: coverFile.type,
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`The cover could not be uploaded. ${uploadError.message}`);
      }

      const { data: publicUrlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(uploadedStoragePath);

      if (!publicUrlData.publicUrl) {
        throw new Error("The cover uploaded, but its public URL could not be created. Try again.");
      }

      nextCoverUrl = publicUrlData.publicUrl;
    }

    const { error: updateError } = await supabase.rpc("update_current_album", {
      album_title: album.title.trim(),
      album_artist: album.artist.trim(),
      album_note: album.note.trim() || "Current club listen",
      cover_url: nextCoverUrl,
    });

    if (updateError) {
      throw new Error(`The album could not be updated. ${updateError.message}`);
    }
  } catch (saveError) {
    if (uploadedStoragePath) {
      try {
        await supabase.storage.from(bucket).remove([uploadedStoragePath]);
      } catch {
        // Preserve the actionable upload or album-update error if cleanup also fails.
      }
    }

    throw saveError;
  }

  const previousStoragePath = getManagedAlbumCoverStoragePath(currentCoverUrl, bucket);

  if (uploadedStoragePath && previousStoragePath && previousStoragePath !== uploadedStoragePath) {
    try {
      await supabase.storage.from(bucket).remove([previousStoragePath]);
    } catch {
      // The album is already updated; stale-file cleanup must not turn that into a failed save.
    }
  }

  return {
    coverUrl: nextCoverUrl,
    uploaded: Boolean(uploadedStoragePath),
  };
}
