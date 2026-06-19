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
