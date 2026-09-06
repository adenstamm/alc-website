import {
  POLL_ROUTES,
  PUBLISHED_ALBUM_REFRESH_ROUTES,
  getPollRequestScope,
  isAbortedRequest,
  normalizeLivePoll,
} from "../lib/clubPollState.js";
import { createLatestRequestCoordinator } from "../lib/latestRequestCoordinator";
import { currentPoll } from "../data/clubContent";
import { fetchReliableCurrentPoll } from "../lib/pollApi";
import {
  getPollFocusRefreshDelay,
  getPollRefreshDelay,
  getPublishedAlbumRefreshDelay,
} from "../lib/pollRefresh";
import { hasSupabaseConfig } from "../lib/supabaseClient";
import { useCallback, useEffect, useRef, useState } from "react";

export default function useClubPoll({
  authReady,
  currentPath,
  membership,
  session,
}) {
  const pollRequestCoordinator = useRef(null);

  const settledPollScope = useRef(null);

  if (pollRequestCoordinator.current == null) {
    pollRequestCoordinator.current = createLatestRequestCoordinator();
  }

  const [livePoll, setLivePoll] = useState(
    hasSupabaseConfig ? null : currentPoll,
  );

  const [pollReady, setPollReady] = useState(!hasSupabaseConfig);

  const [pollError, setPollError] = useState(null);

  const [pollErrorStatus, setPollErrorStatus] = useState(0);

  const refreshPoll = useCallback(
    ({ background = false, force = true } = {}) => {
      if (!hasSupabaseConfig) {
        setLivePoll(currentPoll);
        setPollReady(true);
        setPollError(null);
        setPollErrorStatus(0);
        return Promise.resolve(currentPoll);
      }

      if (!authReady) {
        return Promise.resolve(null);
      }

      const requireCandidates =
        membership?.status === "approved" &&
        membership?.user_id === session?.user?.id;
      const requestScope = getPollRequestScope(session);
      const requestKey = `${requestScope}:${requireCandidates ? "ballot" : "metadata"}`;
      const isScopeChange = settledPollScope.current !== requestKey;

      if (isScopeChange) {
        setPollReady(false);
      }

      return pollRequestCoordinator.current.run(
        requestKey,
        async ({ isLatest, signal }) => {
          try {
            const data = await fetchReliableCurrentPoll(session, {
              maxAttempts: background ? 1 : 3,
              requireCandidates,
              signal,
            });

            if (!isLatest()) {
              return null;
            }

            const nextPoll = normalizeLivePoll(data);
            settledPollScope.current = requestKey;
            setLivePoll(nextPoll);
            setPollError(null);
            setPollErrorStatus(0);
            return nextPoll;
          } catch (error) {
            if (isAbortedRequest(error) || !isLatest()) {
              return null;
            }

            if (!background) {
              settledPollScope.current = requestKey;
              setPollError(
                error.message || "Could not load the current ballot.",
              );
              setPollErrorStatus(error.status || 0);
            }

            if (isScopeChange && !background) {
              setLivePoll(currentPoll);
            }

            return null;
          } finally {
            if (isLatest()) {
              setPollReady(true);
            }
          }
        },
        { force },
      );
    },
    [authReady, membership, session],
  );

  useEffect(() => {
    if (POLL_ROUTES.has(currentPath) && authReady)
      refreshPoll({ force: false });
  }, [authReady, currentPath, refreshPoll]);

  useEffect(() => {
    if (currentPath !== "/vote" || !authReady) {
      return undefined;
    }

    let cancelled = false;
    let refreshTimer;

    const scheduleRefresh = () => {
      if (cancelled) {
        return;
      }

      refreshTimer = window.setTimeout(async () => {
        if (!cancelled && document.visibilityState === "visible") {
          await refreshPoll({ background: true, force: false });
        }

        scheduleRefresh();
      }, getPollRefreshDelay());
    };

    scheduleRefresh();

    return () => {
      cancelled = true;
      window.clearTimeout(refreshTimer);
    };
  }, [authReady, currentPath, refreshPoll]);

  useEffect(() => {
    if (!PUBLISHED_ALBUM_REFRESH_ROUTES.has(currentPath) || !authReady) {
      return undefined;
    }

    let cancelled = false;
    let refreshTimer;

    const scheduleRefresh = () => {
      if (cancelled) {
        return;
      }

      refreshTimer = window.setTimeout(async () => {
        if (!cancelled && document.visibilityState === "visible") {
          await refreshPoll({ background: true, force: false });
        }

        scheduleRefresh();
      }, getPublishedAlbumRefreshDelay());
    };

    scheduleRefresh();

    return () => {
      cancelled = true;
      window.clearTimeout(refreshTimer);
    };
  }, [authReady, currentPath, refreshPoll]);

  useEffect(() => {
    if (!POLL_ROUTES.has(currentPath) || !authReady) {
      return undefined;
    }

    let focusTimer;

    const queueFocusedRefresh = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      window.clearTimeout(focusTimer);
      focusTimer = window.setTimeout(() => {
        refreshPoll({ background: true, force: false });
      }, getPollFocusRefreshDelay());
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        queueFocusedRefresh();
      }
    };

    window.addEventListener("focus", queueFocusedRefresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("focus", queueFocusedRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [authReady, currentPath, refreshPoll]);

  useEffect(
    () => () => {
      pollRequestCoordinator.current?.cancel();
    },
    [],
  );
  return { livePoll, pollReady, pollError, pollErrorStatus, refreshPoll };
}
