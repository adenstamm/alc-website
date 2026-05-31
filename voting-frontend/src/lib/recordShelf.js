import bannedAlbumsText from "../bannedAlbums.txt?raw";

export const RECORD_SHELF_BUCKET = "record-shelf-covers";

const albumCoverOverrides = {
  "flying beagle": "https://is1-ssl.mzstatic.com/image/thumb/Music124/v4/3f/7e/cc/3f7ecc19-2dd8-88c5-0f1e-c2c4f997d51f/4582290397055.jpg/600x600bb.jpg",
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

export function getRecentShelfAlbums() {
  const recentAlbumTitles = bannedAlbumsText
    .split("\n")
    .map((albumTitle) => albumTitle.trim())
    .filter(Boolean)
    .slice(-5)
    .reverse();

  return recentAlbumTitles.map((title, index) => ({
    id: slugify(title) || `recent-album-${index}`,
    title,
    artist: "ALC archive",
    period: index === 0 ? "Most recent listen" : `${index + 1} listens ago`,
    note: "Recently added to the club archive.",
  }));
}

export async function fetchAlbumCover(title, signal) {
  const override = getCoverOverride(title);

  if (override) {
    return override;
  }

  const response = await fetch(
    `https://itunes.apple.com/search?term=${encodeURIComponent(title)}&entity=album&media=music&limit=1`,
    { signal },
  );

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const artworkUrl = data.results?.[0]?.artworkUrl100;

  return artworkUrl ? artworkUrl.replace("100x100bb", "600x600bb") : null;
}

export async function loadRecordShelfCoverOverrides(supabase, hasSupabaseConfig, albumIds) {
  if (!hasSupabaseConfig || !supabase || !albumIds.length) {
    return {};
  }

  const { data, error } = await supabase
    .from("record_shelf_covers")
    .select("album_id, album_title, cover_url, storage_path, updated_at")
    .in("album_id", albumIds);

  if (error) {
    return {};
  }

  return Object.fromEntries(data.map((row) => [row.album_id, row]));
}
