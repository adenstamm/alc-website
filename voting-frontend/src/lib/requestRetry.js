export function isAbortError(error) {
  return error?.name === "AbortError";
}

export function createTimedRequestSignal(parentSignal, timeoutMs = 8_000) {
  const controller = new AbortController();
  let timedOut = false;

  function abortFromParent() {
    controller.abort(parentSignal?.reason);
  }

  if (parentSignal?.aborted) {
    abortFromParent();
  } else {
    parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  }

  const timeoutId = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("The request timed out.", "AbortError"));
  }, timeoutMs);

  return {
    cleanup() {
      globalThis.clearTimeout(timeoutId);
      parentSignal?.removeEventListener("abort", abortFromParent);
    },
    didTimeOut: () => timedOut,
    signal: controller.signal,
  };
}

export function parseRetryAfter(value, now = Date.now()) {
  if (!value) {
    return 0;
  }

  const seconds = Number.parseFloat(value);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1_000);
  }

  const retryAt = Date.parse(value);
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - now) : 0;
}

export function getRetryDelayMs(attempt, {
  baseDelayMs = 250,
  maxDelayMs = 2_000,
  random = Math.random,
  retryAfterMs = 0,
} = {}) {
  const exponentialDelay = Math.min(maxDelayMs, baseDelayMs * (2 ** attempt));
  const jitter = Math.floor(exponentialDelay * 0.35 * Math.max(0, Math.min(1, random())));
  return Math.max(retryAfterMs, exponentialDelay + jitter);
}

export function waitForRetry(delayMs, { signal } = {}) {
  if (signal?.aborted) {
    return Promise.reject(new DOMException("The request was aborted.", "AbortError"));
  }

  return new Promise((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, delayMs);

    function handleAbort() {
      globalThis.clearTimeout(timeoutId);
      reject(new DOMException("The request was aborted.", "AbortError"));
    }

    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}
