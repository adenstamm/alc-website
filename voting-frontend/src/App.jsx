import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useNavigationType,
} from "react-router";

import RouteErrorBoundary from "./components/RouteErrorBoundary";
import SideBNav from "./components/SideBNav";
import SiteFooter from "./components/SiteFooter";
import {
  clubLinks,
  currentPoll,
  homeActions,
  specialEvents,
} from "./data/clubContent";
import {
  NOT_FOUND_META,
  NO_INDEX_ROUTES,
  ROUTE_META,
  ROUTES,
  SIDNEY_LETTER_ROUTE,
  SITE_ORIGIN,
} from "./data/routeMeta";
import { hasSiteEventsConfig, hasSupabaseConfig, supabase } from "./lib/supabaseClient";
import Home from "./pages/Home";
import { createLatestRequestCoordinator } from "./lib/latestRequestCoordinator";
import { fetchMembershipWithRetry } from "./lib/membershipApi";
import { fetchReliableCurrentPoll } from "./lib/pollApi";
import {
  getPollFocusRefreshDelay,
  getPollRefreshDelay,
  getPublishedAlbumRefreshDelay,
} from "./lib/pollRefresh";
import { normalizeSiteEvent } from "./lib/siteContent";
import "./styles/sideb-mock.css";

const About = lazy(() => import("./pages/About"));
const Account = lazy(() => import("./pages/Account"));
const Admin = lazy(() => import("./pages/Admin"));
const Archive = lazy(() => import("./pages/Archive"));
const CurrentAlbum = lazy(() => import("./pages/CurrentAlbum"));
const Events = lazy(() => import("./pages/Events"));
const Genres = lazy(() => import("./pages/Genres"));
const ConfirmSignup = lazy(() => import("./pages/ConfirmSignup"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Poll = lazy(() => import("./pages/Poll"));
const Privacy = lazy(() => import("./pages/Privacy"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const SidneyLetter = lazy(() => import("./pages/SidneyLetter"));

const ROUTE_REDIRECTS = new Map([
  ["/results", "/vote"],
]);
const POLL_ROUTES = new Set(["/", "/admin", "/current", "/vote"]);
const PUBLISHED_ALBUM_REFRESH_ROUTES = new Set(["/", "/current"]);
const EVENT_ROUTES = new Set(["/", "/admin", "/current", "/events"]);

function normalizePath(pathname) {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  return ROUTE_REDIRECTS.get(normalizedPath) || normalizedPath;
}

function setMetaContent(selector, content) {
  const element = document.querySelector(selector);

  if (element) {
    element.setAttribute("content", content);
  }
}

function RouteDataLoading() {
  return (
    <main className="route-data-loading" id="main-content" tabIndex="-1">
      <div className="route-data-loading-art" aria-hidden="true">
        <span />
      </div>
      <div>
        <p className="sideb-kicker">Tuning the room</p>
        <h1>Loading the latest club update.</h1>
        <p>Fetching the current album, ballot, and session details.</p>
      </div>
    </main>
  );
}

function normalizeLivePoll(data) {
  if (!data) {
    return currentPoll;
  }

  return {
    ...currentPoll,
    ...data,
    cycleLabel: data.cycle_label || data.cycleLabel || currentPoll.cycleLabel,
    albumOfWeek: data.album_of_week || data.albumOfWeek || currentPoll.albumOfWeek,
    ratingAlbumOfWeek:
      data.ratingAlbumOfWeek || data.rating_album_of_week || data.album_of_week || data.albumOfWeek,
    publishedWinner: data.publishedWinner || data.published_winner || null,
    winnerCandidateId: data.winnerCandidateId || data.winner_candidate_id || null,
    winnerPublishedAt: data.winnerPublishedAt || data.winner_published_at || null,
    candidates: data.candidates || [],
    finalists: data.finalists || [],
  };
}

function getPollRequestScope(session) {
  if (!session?.access_token) {
    return "public";
  }

  return `member:${session.user?.id || "unknown"}:${session.expires_at || "active"}`;
}

function isAbortedRequest(error) {
  return error?.name === "AbortError";
}

function App() {
  const location = useLocation();
  const routerNavigate = useNavigate();
  const navigationType = useNavigationType();
  const currentPath = normalizePath(location.pathname);
  const isPersonalLetter = currentPath === SIDNEY_LETTER_ROUTE;
  const previousPath = useRef(currentPath);
  const activeSessionUserId = useRef(null);
  const membershipRequestCoordinator = useRef(null);
  const pollRequestCoordinator = useRef(null);
  const settledPollScope = useRef(null);

  if (membershipRequestCoordinator.current == null) {
    membershipRequestCoordinator.current = createLatestRequestCoordinator();
  }

  if (pollRequestCoordinator.current == null) {
    pollRequestCoordinator.current = createLatestRequestCoordinator();
  }

  const [authReady, setAuthReady] = useState(!hasSupabaseConfig);
  const [session, setSession] = useState(null);
  const [membership, setMembership] = useState(null);
  const [membershipLookupStatus, setMembershipLookupStatus] = useState("ready");
  const [livePoll, setLivePoll] = useState(hasSupabaseConfig ? null : currentPoll);
  const [liveEvents, setLiveEvents] = useState(hasSiteEventsConfig ? null : specialEvents);
  const [pollReady, setPollReady] = useState(!hasSupabaseConfig);
  const [eventsReady, setEventsReady] = useState(!hasSiteEventsConfig);
  const [pollError, setPollError] = useState(null);
  const [pollErrorStatus, setPollErrorStatus] = useState(0);

  const refreshPoll = useCallback(({ background = false, force = true } = {}) => {
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
            setPollError(error.message || "Could not load the current ballot.");
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
  }, [authReady, membership, session]);

  const refreshEvents = useCallback(async () => {
    if (!hasSiteEventsConfig) {
      setLiveEvents(specialEvents);
      setEventsReady(true);
      return specialEvents;
    }

    try {
      const { data, error } = await supabase
        .from("site_events")
        .select("id, title, date, display_date, time, location, status, tag, description")
        .order("date", { ascending: true });

      if (error) {
        setLiveEvents(specialEvents);
        return specialEvents;
      }

      const nextEvents = data.map(normalizeSiteEvent);
      setLiveEvents(nextEvents);
      return nextEvents;
    } catch {
      setLiveEvents(specialEvents);
      return specialEvents;
    } finally {
      setEventsReady(true);
    }
  }, []);

  const loadMembership = useCallback(async (nextSession, { force = false } = {}) => {
    if (!hasSupabaseConfig || !nextSession?.user) {
      membershipRequestCoordinator.current.cancel();
      setMembership(null);
      setMembershipLookupStatus("ready");
      return null;
    }

    const userId = nextSession.user.id;

    return membershipRequestCoordinator.current.run(
      userId,
      async ({ isLatest, signal }) => {
        if (isLatest()) {
          setMembershipLookupStatus("loading");
        }

        try {
          const data = await fetchMembershipWithRetry(({ signal: lookupSignal }) => {
            let query = supabase
              .from("memberships")
              .select("user_id, email, display_name, status, role, created_at, updated_at")
              .eq("user_id", userId);

            if (typeof query.abortSignal === "function") {
              query = query.abortSignal(lookupSignal);
            }

            return query.maybeSingle();
          }, { signal });

          if (!isLatest()) {
            return null;
          }

          setMembership(data);
          setMembershipLookupStatus("ready");
          return data;
        } catch (error) {
          if (isAbortedRequest(error) || !isLatest()) {
            return null;
          }

          setMembership((currentMembership) => (
            currentMembership?.user_id === userId ? currentMembership : null
          ));
          setMembershipLookupStatus("unavailable");
          return null;
        }
      },
      { force },
    );
  }, []);

  useEffect(() => {
    if (location.pathname !== currentPath) {
      routerNavigate(`${currentPath}${location.search}${location.hash}`, { replace: true });
    }
  }, [currentPath, location.hash, location.pathname, location.search, routerNavigate]);

  useEffect(() => {
    if (POLL_ROUTES.has(currentPath) && authReady) {
      refreshPoll({ force: false });
    }

    if (EVENT_ROUTES.has(currentPath)) {
      refreshEvents();
    }
  }, [authReady, currentPath, refreshEvents, refreshPoll]);

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

  useEffect(() => () => {
    membershipRequestCoordinator.current?.cancel();
    pollRequestCoordinator.current?.cancel();
  }, []);

  useEffect(() => {
    const isKnownRoute = ROUTES.has(currentPath);
    const meta = ROUTE_META[currentPath] || NOT_FOUND_META;
    const canonicalPath = isKnownRoute ? currentPath : "/404";
    const canonicalUrl = `${SITE_ORIGIN}${canonicalPath === "/" ? "" : canonicalPath}`;
    const shouldIndex = isKnownRoute && !NO_INDEX_ROUTES.has(currentPath);
    const canonicalLink = document.querySelector('link[rel="canonical"]');

    document.title = meta.title;
    setMetaContent('meta[name="description"]', meta.description);
    setMetaContent('meta[name="robots"]', shouldIndex ? "index, follow" : "noindex, nofollow");
    setMetaContent('meta[property="og:title"]', meta.title);
    setMetaContent('meta[property="og:description"]', meta.description);
    setMetaContent('meta[property="og:url"]', canonicalUrl);
    setMetaContent('meta[name="twitter:title"]', meta.title);
    setMetaContent('meta[name="twitter:description"]', meta.description);
    canonicalLink?.setAttribute("href", canonicalUrl);

    if (previousPath.current !== currentPath) {
      if (navigationType !== "POP") {
        const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
      }

      window.requestAnimationFrame(() => {
        document.getElementById("main-content")?.focus({ preventScroll: true });
      });
    }

    previousPath.current = currentPath;
  }, [currentPath, navigationType]);

  useEffect(() => {
    if (!hasSupabaseConfig) {
      return undefined;
    }

    let isMounted = true;

    async function loadSession() {
      const { data } = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      const nextSession = data.session;
      const nextUserId = nextSession?.user?.id || null;
      activeSessionUserId.current = nextUserId;
      setSession(nextSession);
      await loadMembership(nextSession);

      if (isMounted && activeSessionUserId.current === nextUserId) {
        setAuthReady(true);
      }
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const nextUserId = nextSession?.user?.id || null;
      const userChanged = activeSessionUserId.current !== nextUserId;
      activeSessionUserId.current = nextUserId;

      if (userChanged) {
        setAuthReady(false);
      }

      setSession(nextSession);
      loadMembership(nextSession, { force: userChanged }).finally(() => {
        if (isMounted && activeSessionUserId.current === nextUserId) {
          setAuthReady(true);
        }
      });
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadMembership]);

  const navigate = useCallback((nextPath) => {
    const normalizedPath = normalizePath(nextPath);

    if (normalizedPath !== currentPath) {
      routerNavigate(normalizedPath);
    }
  }, [currentPath, routerNavigate]);

  const refreshCurrentMembership = useCallback(
    () => loadMembership(session, { force: true }),
    [loadMembership, session],
  );
  const showAdminLink = membership?.status === "approved" && membership?.role === "admin";

  function withRouteData(element, { events = false, poll = false } = {}) {
    if ((poll && !pollReady) || (events && !eventsReady)) {
      return <RouteDataLoading />;
    }

    return element;
  }

  return (
    <div className={`page ${isPersonalLetter ? "page--personal-letter" : ""}`}>
      {!isPersonalLetter && (
        <SideBNav
          authReady={authReady}
          membership={membership}
          membershipLookupStatus={membershipLookupStatus}
          session={session}
          showAdminLink={showAdminLink}
        />
      )}
      <RouteErrorBoundary resetKey={currentPath}>
        <Suspense
          fallback={(
            <div className="route-loading" role="status">
              <span className="route-loading-record" aria-hidden="true" />
              <p>Pulling the record from the shelf…</p>
            </div>
          )}
        >
          <>
            <Routes>
              <Route
                path="/"
                element={withRouteData(
                  <Home
                    clubLinks={clubLinks}
                    currentPoll={livePoll}
                    hasSupabaseConfig={hasSupabaseConfig}
                    homeActions={homeActions}
                    navigate={navigate}
                    specialEvents={liveEvents}
                    supabase={supabase}
                  />,
                  { events: true, poll: true },
                )}
              />
              <Route
                path="/account"
                element={(
                  <Account
                    authReady={authReady}
                    hasSupabaseConfig={hasSupabaseConfig}
                    membership={membership}
                    membershipLookupStatus={membershipLookupStatus}
                    navigate={navigate}
                    refreshMembership={refreshCurrentMembership}
                    session={session}
                    supabase={supabase}
                  />
                )}
              />
              <Route
                path="/admin"
                element={withRouteData(
                  <Admin
                    authReady={authReady}
                    hasSupabaseConfig={hasSupabaseConfig}
                    hasSiteEventsConfig={hasSiteEventsConfig}
                    membership={membership}
                    poll={livePoll}
                    pollError={pollError}
                    refreshEvents={refreshEvents}
                    refreshPoll={refreshPoll}
                    session={session}
                    siteEvents={liveEvents}
                    supabase={supabase}
                  />,
                  { events: true, poll: true },
                )}
              />
              <Route path="/about" element={<About clubLinks={clubLinks} navigate={navigate} />} />
              <Route path="/archive" element={<Archive />} />
              <Route
                path="/confirm-signup"
                element={<ConfirmSignup navigate={navigate} />}
              />
              <Route
                path="/current"
                element={withRouteData(
                  <CurrentAlbum
                    currentPoll={livePoll}
                    navigate={navigate}
                    specialEvents={liveEvents}
                  />,
                  { events: true, poll: true },
                )}
              />
              <Route
                path="/events"
                element={withRouteData(
                  <Events clubLinks={clubLinks} specialEvents={liveEvents} />,
                  { events: true },
                )}
              />
              <Route path="/genres" element={<Genres navigate={navigate} />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route
                path="/reset-password"
                element={(
                  <ResetPassword
                    hasSupabaseConfig={hasSupabaseConfig}
                    navigate={navigate}
                    supabase={supabase}
                  />
                )}
              />
              <Route
                path="/results"
                element={<Navigate replace to={`/vote${location.search}${location.hash}`} />}
              />
              <Route path={SIDNEY_LETTER_ROUTE} element={<SidneyLetter />} />
              <Route
                path="/vote"
                element={withRouteData(
                  <Poll
                    key={`${livePoll?.id}-${livePoll?.phase}`}
                    authReady={authReady}
                    hasSupabaseConfig={hasSupabaseConfig}
                    membership={membership}
                    membershipLookupStatus={membershipLookupStatus}
                    navigate={navigate}
                    poll={livePoll}
                    pollError={pollError}
                    pollErrorStatus={pollErrorStatus}
                    refreshMembership={refreshCurrentMembership}
                    refreshPoll={refreshPoll}
                    session={session}
                    supabase={supabase}
                  />,
                  { poll: true },
                )}
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
            {!isPersonalLetter && <SiteFooter clubLinks={clubLinks} />}
          </>
        </Suspense>
      </RouteErrorBoundary>
    </div>
  );
}

export default App;
