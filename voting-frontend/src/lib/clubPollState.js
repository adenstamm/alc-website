import { currentPoll } from "../data/clubContent";

export const POLL_ROUTES = new Set(["/", "/admin", "/current", "/vote"]);

export const PUBLISHED_ALBUM_REFRESH_ROUTES = new Set(["/", "/current"]);

export const EVENT_ROUTES = new Set(["/", "/admin", "/current", "/events"]);

export function normalizeLivePoll(data) {
  if (!data) {
    return currentPoll;
  }

  return {
    ...currentPoll,
    ...data,
    cycleLabel: data.cycle_label || data.cycleLabel || currentPoll.cycleLabel,
    albumOfWeek:
      data.album_of_week || data.albumOfWeek || currentPoll.albumOfWeek,
    ratingAlbumOfWeek:
      data.ratingAlbumOfWeek ||
      data.rating_album_of_week ||
      data.album_of_week ||
      data.albumOfWeek,
    publishedWinner: data.publishedWinner || data.published_winner || null,
    winnerCandidateId:
      data.winnerCandidateId || data.winner_candidate_id || null,
    winnerPublishedAt:
      data.winnerPublishedAt || data.winner_published_at || null,
    candidates: data.candidates || [],
    finalists: data.finalists || [],
  };
}

export function getPollRequestScope(session) {
  if (!session?.access_token) {
    return "public";
  }

  return `member:${session.user?.id || "unknown"}:${session.expires_at || "active"}`;
}

export function isAbortedRequest(error) {
  return error?.name === "AbortError";
}
