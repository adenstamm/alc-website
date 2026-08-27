export class PollApiError extends Error {
  constructor(message, { retryAfter = 0, status = 0 } = {}) {
    super(message);
    this.name = "PollApiError";
    this.retryAfter = retryAfter;
    this.status = status;
  }
}

export function isIncompleteMemberBallot(
  poll,
  session,
  { requireCandidates = Boolean(session?.access_token) } = {},
) {
  if (!requireCandidates || !session?.access_token || !poll) {
    return false;
  }

  if (poll.phase === "primary") {
    return !Array.isArray(poll.candidates) || poll.candidates.length === 0;
  }

  if (poll.phase === "final") {
    return !Array.isArray(poll.finalists) || poll.finalists.length === 0;
  }

  return false;
}

function getPollErrorMessage(status, retryAfter) {
  if (status === 401) {
    return "Your voting session expired. Sign in again, then reload the ballot.";
  }

  if (status === 429) {
    const retryCopy = retryAfter > 0
      ? ` Try again in about ${retryAfter} seconds.`
      : " Wait a moment, then try again.";
    return `The ballot is receiving too many refreshes.${retryCopy}`;
  }

  if (status >= 500) {
    return "The ballot service is temporarily unavailable. Your vote has not been lost.";
  }

  return "Could not load the current ballot. Check your connection and try again.";
}

export async function fetchCurrentPoll(session, { signal } = {}) {
  const headers = {
    Accept: "application/json",
  };

  if (session?.access_token) {
    headers["X-AlbumASU-Session"] = session.access_token;
  }

  const response = await fetch("/api/current-poll", {
    cache: "no-store",
    method: "GET",
    credentials: "same-origin",
    headers,
    signal,
  });

  if (!response.ok) {
    const retryAfter = Number.parseInt(response.headers.get("Retry-After") || "0", 10) || 0;
    throw new PollApiError(getPollErrorMessage(response.status, retryAfter), {
      retryAfter,
      status: response.status,
    });
  }

  return response.json();
}

export async function fetchReliableCurrentPoll(
  session,
  { requireCandidates = Boolean(session?.access_token), signal } = {},
) {
  let poll = await fetchCurrentPoll(session, { signal });

  if (!isIncompleteMemberBallot(poll, session, { requireCandidates })) {
    return poll;
  }

  poll = await fetchCurrentPoll(session, { signal });

  if (isIncompleteMemberBallot(poll, session, { requireCandidates })) {
    throw new PollApiError(
      "The member ballot loaded without its candidates. Reload the ballot to try again.",
      { status: 502 },
    );
  }

  return poll;
}
