import bannedAlbumsText from "../bannedAlbums.txt?raw";
import bannedArtistsText from "../bannedArtists.txt?raw";

function parseList(rawText) {
  return rawText
    .split("\n")
    .map((item) => sanitizeNominationValue(item))
    .filter(Boolean);
}

export function sanitizeNominationValue(value) {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeMusicName(value) {
  return sanitizeNominationValue(value)
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[!"#$%&'()*+,./:;<=>?@[\\\]^_`{|}~¡¿‘’“”«»]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const bannedAlbumNames = new Set(parseList(bannedAlbumsText).map(normalizeMusicName));
const bannedArtistNames = new Set(parseList(bannedArtistsText).map(normalizeMusicName));

export function validateNominationInput({ albumTitle, artistName }) {
  const cleanAlbumTitle = sanitizeNominationValue(albumTitle);
  const cleanArtistName = sanitizeNominationValue(artistName);

  if (!cleanAlbumTitle || !cleanArtistName) {
    return {
      isValid: false,
      message: "Add both an album title and artist before submitting.",
    };
  }

  if (bannedArtistNames.has(normalizeMusicName(cleanArtistName))) {
    return {
      isValid: false,
      message: `${cleanArtistName} is on the banned artist list, so this nomination cannot be submitted.`,
    };
  }

  if (bannedAlbumNames.has(normalizeMusicName(cleanAlbumTitle))) {
    return {
      isValid: false,
      message: `${cleanAlbumTitle} has already been used by the club, so this nomination cannot be submitted.`,
    };
  }

  return {
    isValid: true,
    albumTitle: cleanAlbumTitle,
    artistName: cleanArtistName,
  };
}

export function getNominationSubmissionError(error) {
  const message = error?.message || "";

  if (message.includes("BANNED_ARTIST")) {
    return "That artist is on the banned artist list, so this nomination cannot be submitted.";
  }

  if (message.includes("BANNED_ALBUM")) {
    return "That album has already been used by the club, so this nomination cannot be submitted.";
  }

  return error?.message || "Something went wrong while saving your nomination.";
}
