const archiveTitleCollator = new Intl.Collator("en", {
  sensitivity: "base",
  numeric: true,
});

function normalizeArchiveValue(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/ð/g, "d")
    .replace(/þ/g, "th")
    .replace(/ł/g, "l")
    .replace(/\s+/g, " ")
    .trim();
}

function getSessionSearchNumber(query) {
  const match = query.match(/^(?:session\s*)?#?\s*0*(\d+)$/);

  return match ? Number(match[1]) : null;
}

export function filterArchiveAlbums(albums, searchTerm) {
  const query = normalizeArchiveValue(searchTerm);

  if (!query) {
    return [...albums];
  }

  const sessionNumber = getSessionSearchNumber(query);
  const isExplicitSessionSearch =
    sessionNumber !== null && (query.startsWith("session") || query.startsWith("#"));
  const textQuery = sessionNumber === null ? query : String(sessionNumber);

  return albums.filter((album) => {
    if (isExplicitSessionSearch) {
      return album.sessionNumber === sessionNumber;
    }

    const albumText = normalizeArchiveValue(`${album.title} ${album.artist}`);

    return albumText.includes(textQuery) || album.sessionNumber === sessionNumber;
  });
}

export function sortArchiveAlbums(albums, sortMode = "newest") {
  return [...albums].sort((albumA, albumB) => {
    if (sortMode === "oldest") {
      return albumA.sessionNumber - albumB.sessionNumber;
    }

    if (sortMode === "az") {
      return (
        archiveTitleCollator.compare(albumA.title, albumB.title) ||
        archiveTitleCollator.compare(albumA.artist || "", albumB.artist || "") ||
        albumA.sessionNumber - albumB.sessionNumber
      );
    }

    return albumB.sessionNumber - albumA.sessionNumber;
  });
}

export function getVisibleArchiveAlbums(albums, searchTerm, sortMode) {
  return sortArchiveAlbums(filterArchiveAlbums(albums, searchTerm), sortMode);
}
