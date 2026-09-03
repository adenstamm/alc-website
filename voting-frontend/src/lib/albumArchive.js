export function parseArchiveLine(line) {
  const cleanLine = line.replace(/\s+/g, " ").trim();

  if (!cleanLine) {
    return null;
  }

  if (cleanLine.endsWith(":")) {
    return null;
  }

  const separator = " - ";
  const separatorIndex = cleanLine.lastIndexOf(separator);

  if (separatorIndex < 0) {
    return {
      title: cleanLine,
      artist: "",
    };
  }

  const title = cleanLine.slice(0, separatorIndex).trim();
  const artist = cleanLine.slice(separatorIndex + separator.length).trim();

  if (!title) {
    return null;
  }

  return {
    title,
    artist: /^\[artist missing\]$/i.test(artist) ? "" : artist,
  };
}

export function parseAlbumArchiveText(rawText) {
  return rawText
    .split("\n")
    .map(parseArchiveLine)
    .filter(Boolean);
}

function normalizeArchiveTitle(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function normalizeDynamicArchiveEntry(entry) {
  const title = String(entry?.album_title || "").trim();
  const artist = String(entry?.artist_name || "").trim();

  if (!title) {
    return null;
  }

  const averageRating = entry.average_rating === null
    || entry.average_rating === undefined
    ? null
    : Number(entry.average_rating);

  return {
    archivedAt: entry.archived_at || null,
    artist,
    averageRating: Number.isFinite(averageRating) ? averageRating : null,
    pollId: entry.poll_id || null,
    ratingCount: Number.isInteger(Number(entry.rating_count))
      ? Number(entry.rating_count)
      : 0,
    tenRatingCount: Number.isInteger(Number(entry.ten_rating_count))
      ? Number(entry.ten_rating_count)
      : 0,
    title,
  };
}

export function mergeAlbumArchiveEntries(baseAlbums, dynamicEntries = []) {
  const mergedAlbums = baseAlbums.map((album) => ({ ...album }));
  const albumIndexByTitle = new Map(
    mergedAlbums.map((album, index) => [normalizeArchiveTitle(album.title), index]),
  );
  const normalizedEntries = dynamicEntries
    .map(normalizeDynamicArchiveEntry)
    .filter(Boolean)
    .sort((entryA, entryB) =>
      String(entryA.archivedAt || "").localeCompare(String(entryB.archivedAt || "")),
    );

  for (const entry of normalizedEntries) {
    const archiveTitle = normalizeArchiveTitle(entry.title);
    const existingIndex = albumIndexByTitle.get(archiveTitle);

    if (existingIndex !== undefined) {
      mergedAlbums[existingIndex] = {
        ...mergedAlbums[existingIndex],
        ...entry,
        artist: entry.artist || mergedAlbums[existingIndex].artist,
      };
      continue;
    }

    albumIndexByTitle.set(archiveTitle, mergedAlbums.length);
    mergedAlbums.push(entry);
  }

  return mergedAlbums;
}
