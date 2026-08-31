import {
  createTimedRequestSignal,
  getRetryDelayMs,
  isAbortError,
  parseRetryAfter,
  waitForRetry,
} from "./requestRetry.js";

export class PollApiError extends Error {
  constructor(message, { cause, retryAfter = 0, retryAfterMs = 0, status = 0 } = {}) {
    super(message);
    this.name = "PollApiError";
    this.cause = cause;
    this.retryAfter = retryAfter;
    this.retryAfterMs = retryAfterMs || (retryAfter * 1_000);
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

export async function fetchCurrentPoll(session, { requestTimeoutMs = 8_000, signal } = {}) {
  const headers = {
    Accept: "application/json",
  };

  if (session?.access_token) {
    headers["X-AlbumASU-Session"] = session.access_token;
  }

  let response;
  const request = createTimedRequestSignal(signal, requestTimeoutMs);

  try {
    response = await fetch("/api/current-poll", {
      cache: "no-store",
      method: "GET",
      credentials: "same-origin",
      headers,
      signal: request.signal,
    });
  } catch (error) {
    if (signal?.aborted || (isAbortError(error) && !request.didTimeOut())) {
      throw error;
    }

    throw new PollApiError(
      request.didTimeOut()
        ? "The ballot request timed out. Check your connection and try again."
        : getPollErrorMessage(0, 0), {
      cause: error,
      status: 0,
      },
    );
  } finally {
    request.cleanup();
  }

  if (!response.ok) {
    const retryAfterHeader = response.headers.get("Retry-After");
    const retryAfterMs = parseRetryAfter(retryAfterHeader);
    const retryAfter = Math.ceil(retryAfterMs / 1_000);
    throw new PollApiError(getPollErrorMessage(response.status, retryAfter), {
      retryAfter,
      retryAfterMs,
      status: response.status,
    });
  }

  try {
    return await response.json();
  } catch (error) {
    throw new PollApiError("The ballot service returned an incomplete response. Try again.", {
      cause: error,
      status: 502,
    });
  }
}

function shouldRetryPollRequest(error) {
  return error?.status === 429 || error?.status >= 500 || error?.status === 0;
}

async function fetchCurrentPollWithRetry(session, {
  baseDelayMs,
  maxAttempts,
  maxAutomaticRetryAfterMs,
  maxDelayMs,
  random,
  requestTimeoutMs,
  signal,
  sleep,
}) {
  let lastError;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await fetchCurrentPoll(session, { requestTimeoutMs, signal });
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }

      lastError = error;
      const isLastAttempt = attempt >= maxAttempts - 1;
      const retryAfterIsTooLong = error.retryAfterMs > maxAutomaticRetryAfterMs;

      if (isLastAttempt || retryAfterIsTooLong || !shouldRetryPollRequest(error)) {
        throw error;
      }

      await sleep(getRetryDelayMs(attempt, {
        baseDelayMs,
        maxDelayMs,
        random,
        retryAfterMs: error.retryAfterMs,
      }), { signal });
    }
  }

  throw lastError;
}

export async function fetchReliableCurrentPoll(
  session,
  {
    baseDelayMs = 250,
    maxAttempts = 3,
    maxAutomaticRetryAfterMs = 5_000,
    maxDelayMs = 2_000,
    random = Math.random,
    requireCandidates = Boolean(session?.access_token),
    requestTimeoutMs = 8_000,
    signal,
    sleep = waitForRetry,
  } = {},
) {
  const retryOptions = {
    baseDelayMs,
    maxAttempts,
    maxAutomaticRetryAfterMs,
    maxDelayMs,
    random,
    requestTimeoutMs,
    signal,
    sleep,
  };
  let poll = await fetchCurrentPollWithRetry(session, retryOptions);

  if (!isIncompleteMemberBallot(poll, session, { requireCandidates })) {
    return poll;
  }

  poll = await fetchCurrentPollWithRetry(session, retryOptions);

  if (isIncompleteMemberBallot(poll, session, { requireCandidates })) {
    throw new PollApiError(
      "The member ballot loaded without its candidates. Reload the ballot to try again.",
      { status: 502 },
    );
  }

  return poll;
}
