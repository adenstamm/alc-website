import bannedAlbumsText from "../bannedAlbums.txt?raw";
import { parseAlbumArchiveText } from "./albumArchive";

export const RECORD_SHELF_BUCKET = "record-shelf-covers";

const albumCoverOverrides = {
  "flying beagle": "https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/3f/7e/cc/3f7ecc19-2dd8-88c5-0f1e-c2c4f997d51f/4582290397055.jpg/600x600bb.jpg",
};

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

function getCoverOverride(title) {
  return albumCoverOverrides[normalizeAlbumTitle(title)];
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

export function getAlbumArchive() {
  return parseAlbumArchiveText(bannedAlbumsText).map((album, index, albums) => ({
    ...album,
    id: `${slugify(album.title) || "archive-album"}-${index}`,
    sessionNumber: index + 1,
    reverseSessionNumber: albums.length - index,
  }));
}

export async function fetchAlbumCover(title, signal) {
  const metadata = await fetchAlbumMetadata(title, signal);
  return metadata.coverUrl;
}

export async function fetchAlbumMetadata(title, signal) {
  const response = await fetch(
    `https://itunes.apple.com/search?term=${encodeURIComponent(title)}&entity=album&media=music&limit=1`,
    { signal },
  );

  const coverOverride = getCoverOverride(title);
  const artistOverride = getArtistOverride(title);

  if (!response.ok) {
    return {
      artist: artistOverride || "Unknown artist",
      coverUrl: coverOverride || null,
    };
  }

  const data = await response.json();
  const result = data.results?.[0];
  const artworkUrl = result?.artworkUrl100;

  return {
    artist: artistOverride || result?.artistName || "Unknown artist",
    coverUrl: coverOverride || (artworkUrl ? artworkUrl.replace("100x100bb", "600x600bb") : null),
  };
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
