import {
  createTimedRequestSignal,
  getRetryDelayMs,
  isAbortError,
  waitForRetry,
} from "./requestRetry.js";

export class MembershipLookupError extends Error {
  constructor(message, { cause, status = 0 } = {}) {
    super(message);
    this.name = "MembershipLookupError";
    this.cause = cause;
    this.status = status;
  }
}

function getErrorStatus(result, error) {
  return Number(result?.status || error?.status || 0) || 0;
}

function shouldRetryMembershipLookup(status, error) {
  if (status === 429 || status >= 500) {
    return true;
  }

  if (status > 0) {
    return false;
  }

  const message = String(error?.message || "").toLowerCase();
  return (
    error instanceof TypeError ||
    message.includes("fetch") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("connection")
  );
}

export async function fetchMembershipWithRetry(lookup, {
  baseDelayMs = 300,
  maxAttempts = 4,
  maxDelayMs = 2_000,
  random = Math.random,
  requestTimeoutMs = 8_000,
  signal,
  sleep = waitForRetry,
} = {}) {
  let lastError = null;
  let lastStatus = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const attemptRequest = createTimedRequestSignal(signal, requestTimeoutMs);

    try {
      const result = await lookup({ signal: attemptRequest.signal });

      if (!result?.error) {
        return result?.data ?? null;
      }

      lastError = result.error;
      lastStatus = getErrorStatus(result, lastError);
    } catch (error) {
      if (signal?.aborted || (isAbortError(error) && !attemptRequest.didTimeOut())) {
        throw error;
      }

      lastError = attemptRequest.didTimeOut()
        ? new TypeError("The membership lookup timed out.")
        : error;
      lastStatus = Number(error?.status || 0) || 0;
    } finally {
      attemptRequest.cleanup();
    }

    const canRetry =
      attempt < maxAttempts - 1 &&
      shouldRetryMembershipLookup(lastStatus, lastError);

    if (!canRetry) {
      break;
    }

    await sleep(getRetryDelayMs(attempt, {
      baseDelayMs,
      maxDelayMs,
      random,
    }), { signal });
  }

  throw new MembershipLookupError(
    "We could not verify your club membership right now.",
    { cause: lastError, status: lastStatus },
  );
}
