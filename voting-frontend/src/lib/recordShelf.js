import bannedAlbumsText from "../bannedAlbums.txt?raw";
import { mergeAlbumArchiveEntries, parseAlbumArchiveText } from "./albumArchive";

export const RECORD_SHELF_BUCKET = "record-shelf-covers";

const albumMetadataCache = new Map();

const albumArtistOverrides = {
  "flying beagle": "Himiko Kikuchi",
};

export function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function normalizeAlbumTitle(value) {
  return value.trim().toLowerCase();
}

function normalizeLookupValue(value = "") {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getArtistOverride(title) {
  return albumArtistOverrides[normalizeAlbumTitle(title)];
}

export function getRecentShelfAlbums() {
  const recentAlbums = parseAlbumArchiveText(bannedAlbumsText)
    .slice(-5)
    .reverse();

  return recentAlbums.map((album, index) => ({
    id: slugify(album.title) || `recent-album-${index}`,
    title: album.title,
    artist: album.artist || "ALC archive",
    period: index === 0 ? "Most recent listen" : `${index + 1} listens ago`,
    note: "Recently added to the club archive.",
  }));
}

function normalizeShelfRow(row) {
  return {
    id: row.album_id,
    title: row.album_title,
    artist: row.artist_name || "ALC archive",
    period: row.position === 1 ? "Most recent listen" : `${row.position} listens ago`,
    note: "Recently added to the club archive.",
  };
}

export async function loadRecordShelfAlbums(supabase, hasSupabaseConfig, fallbackAlbums = getRecentShelfAlbums()) {
  if (!hasSupabaseConfig || !supabase) {
    return fallbackAlbums;
  }

  const { data, error } = await supabase
    .from("record_shelf_items")
    .select("position, album_id, album_title, artist_name, archived_at")
    .order("position", { ascending: true });

  if (error || !data?.length) {
    return fallbackAlbums;
  }

  const configuredAlbums = data.map(normalizeShelfRow);
  const configuredTitles = new Set(
    configuredAlbums.map((album) => normalizeAlbumTitle(album.title)),
  );
  const fallbackFill = fallbackAlbums.filter(
    (album) => !configuredTitles.has(normalizeAlbumTitle(album.title)),
  );

  return [...configuredAlbums, ...fallbackFill]
    .slice(0, 5)
    .map((album, index) => ({
      ...album,
      period: index === 0 ? "Most recent listen" : `${index + 1} listens ago`,
    }));
}

export async function saveRecordShelfAlbums(supabase, albums) {
  const shelfItems = albums.slice(0, 5).map((album) => ({
    album_id: album.id,
    album_title: album.title,
    artist_name: album.artist || "ALC archive",
  }));
  const { error } = await supabase.rpc("save_record_shelf_order", {
    shelf_items: shelfItems,
  });

  if (error) {
    throw error;
  }

  return albums.slice(0, 5);
}

export function getAlbumArchive(dynamicEntries = []) {
  const archiveAlbums = mergeAlbumArchiveEntries(
    parseAlbumArchiveText(bannedAlbumsText),
    dynamicEntries,
  );

  return archiveAlbums.map((album, index, albums) => ({
    ...album,
    id: album.pollId
      ? `archive-${slugify(album.pollId) || index}`
      : `${slugify(album.title) || "archive-album"}-${index}`,
    sessionNumber: index + 1,
    reverseSessionNumber: albums.length - index,
  }));
}

export async function fetchAlbumCover(title, signal, artist = "") {
  const metadata = await fetchAlbumMetadata(title, signal, artist);
  return metadata.coverUrl;
}

export async function fetchAlbumMetadata(title, signal, artist = "") {
  const cacheKey = `${normalizeAlbumTitle(title)}::${normalizeAlbumTitle(artist)}`;

  if (albumMetadataCache.has(cacheKey)) {
    return albumMetadataCache.get(cacheKey);
  }

  const searchTerm = [title, artist].filter(Boolean).join(" ");
  const response = await fetch(
    `https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&entity=album&media=music&limit=8`,
    { signal },
  );

  const artistOverride = getArtistOverride(title);

  if (!response.ok) {
    const fallbackMetadata = {
      artist: artistOverride || artist || "Unknown artist",
      coverUrl: null,
    };

    albumMetadataCache.set(cacheKey, fallbackMetadata);
    return fallbackMetadata;
  }

  const data = await response.json();
  const normalizedTitle = normalizeLookupValue(title);
  const normalizedArtist = normalizeLookupValue(artist);
  const results = data.results || [];
  const result = results.find((item) => {
    const resultTitle = normalizeLookupValue(item.collectionName);
    const resultArtist = normalizeLookupValue(item.artistName);
    const titleMatches = resultTitle === normalizedTitle || resultTitle.includes(normalizedTitle);
    const artistMatches = !normalizedArtist || resultArtist.includes(normalizedArtist) || normalizedArtist.includes(resultArtist);

    return titleMatches && artistMatches;
  }) || results.find((item) => normalizeLookupValue(item.collectionName) === normalizedTitle);
  const artworkUrl = result?.artworkUrl100;

  const metadata = {
    artist: artistOverride || artist || result?.artistName || "Unknown artist",
    coverUrl: artworkUrl ? artworkUrl.replace("100x100bb", "600x600bb") : null,
  };

  albumMetadataCache.set(cacheKey, metadata);
  return metadata;
}

export async function loadRecordShelfCoverOverrides(supabase, hasSupabaseConfig, albumIds) {
  if (!hasSupabaseConfig || !supabase || !albumIds.length) {
    return {};
  }

  const { data, error } = await supabase
    .from("record_shelf_covers")
    .select("album_id, album_title, artist_override, cover_url, storage_path, updated_at")
    .in("album_id", albumIds);

  if (error) {
    return {};
  }

  return Object.fromEntries(data.map((row) => [row.album_id, row]));
}
