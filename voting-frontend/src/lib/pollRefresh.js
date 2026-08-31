export const POLL_REFRESH_MIN_MS = 12_000;
export const POLL_REFRESH_MAX_MS = 18_000;
export const POLL_FOCUS_REFRESH_MIN_MS = 350;
export const POLL_FOCUS_REFRESH_MAX_MS = 1_250;
export const PUBLISHED_ALBUM_REFRESH_MIN_MS = 45_000;
export const PUBLISHED_ALBUM_REFRESH_MAX_MS = 75_000;

function randomDelay(minimum, maximum, random) {
  const normalizedRandom = Math.max(0, Math.min(1, random()));
  return Math.round(minimum + ((maximum - minimum) * normalizedRandom));
}

export function getPollRefreshDelay(random = Math.random) {
  return randomDelay(POLL_REFRESH_MIN_MS, POLL_REFRESH_MAX_MS, random);
}

export function getPollFocusRefreshDelay(random = Math.random) {
  return randomDelay(POLL_FOCUS_REFRESH_MIN_MS, POLL_FOCUS_REFRESH_MAX_MS, random);
}

export function getPublishedAlbumRefreshDelay(random = Math.random) {
  return randomDelay(PUBLISHED_ALBUM_REFRESH_MIN_MS, PUBLISHED_ALBUM_REFRESH_MAX_MS, random);
}
