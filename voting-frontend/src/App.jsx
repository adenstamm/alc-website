import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";

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
  SITE_ORIGIN,
} from "./data/routeMeta";
import { hasSiteEventsConfig, hasSupabaseConfig, supabase } from "./lib/supabaseClient";
import Home from "./pages/Home";
import { fetchCurrentPoll } from "./lib/pollApi";
import { normalizeSiteEvent } from "./lib/siteContent";
import "./styles/sideb-mock.css";

const About = lazy(() => import("./pages/About"));
const Account = lazy(() => import("./pages/Account"));
const Admin = lazy(() => import("./pages/Admin"));
const Archive = lazy(() => import("./pages/Archive"));
const CurrentAlbum = lazy(() => import("./pages/CurrentAlbum"));
const Events = lazy(() => import("./pages/Events"));
const ConfirmSignup = lazy(() => import("./pages/ConfirmSignup"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Poll = lazy(() => import("./pages/Poll"));
const Privacy = lazy(() => import("./pages/Privacy"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));

const ROUTE_REDIRECTS = new Map([
  ["/results", "/vote"],
]);
const POLL_ROUTES = new Set(["/", "/admin", "/current", "/vote"]);
const EVENT_ROUTES = new Set(["/", "/admin", "/current", "/events"]);

function normalizePath(pathname) {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  return ROUTE_REDIRECTS.get(normalizedPath) || normalizedPath;
}

function getCurrentPath() {
  const normalizedPath = normalizePath(window.location.pathname);

  if (window.location.pathname !== normalizedPath) {
    window.history.replaceState({}, "", `${normalizedPath}${window.location.search}${window.location.hash}`);
  }

  return normalizedPath;
}

function setMetaContent(selector, content) {
  const element = document.querySelector(selector);

  if (element) {
    element.setAttribute("content", content);
  }
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
    candidates: data.candidates || [],
    finalists: data.finalists || [],
  };
}

function App() {
  const [currentPath, setCurrentPath] = useState(getCurrentPath);
  const previousPath = useRef(currentPath);
  const [authReady, setAuthReady] = useState(!hasSupabaseConfig);
  const [session, setSession] = useState(null);
  const [membership, setMembership] = useState(null);
  const [livePoll, setLivePoll] = useState(hasSupabaseConfig ? null : currentPoll);
  const [liveEvents, setLiveEvents] = useState(hasSiteEventsConfig ? null : specialEvents);
  const [pollReady, setPollReady] = useState(!hasSupabaseConfig);
  const [eventsReady, setEventsReady] = useState(!hasSiteEventsConfig);
  const [pollError, setPollError] = useState(null);

  const refreshPoll = useCallback(async () => {
    if (!hasSupabaseConfig) {
      setLivePoll(currentPoll);
      setPollReady(true);
      return currentPoll;
    }

    try {
      const data = await fetchCurrentPoll(session);
      const nextPoll = normalizeLivePoll(data);
      setPollError(null);
      setLivePoll(nextPoll);
      return nextPoll;
    } catch (error) {
      setPollError(error.message || "Could not load the current poll.");
      setLivePoll(currentPoll);
      return currentPoll;
    } finally {
      setPollReady(true);
    }
  }, [session]);

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

  const loadMembership = useCallback(async (nextSession) => {
    if (!hasSupabaseConfig || !nextSession?.user) {
      setMembership(null);
      return;
    }

    const { data, error } = await supabase
      .from("memberships")
      .select("user_id, email, display_name, status, role, created_at, updated_at")
      .eq("user_id", nextSession.user.id)
      .maybeSingle();

    if (error) {
      setMembership(null);
      return;
    }

    setMembership(data);
  }, []);

  useEffect(() => {
    function handlePopState() {
      setCurrentPath(getCurrentPath());
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    if (POLL_ROUTES.has(currentPath)) {
      refreshPoll();
    }

    if (EVENT_ROUTES.has(currentPath)) {
      refreshEvents();
    }
  }, [currentPath, refreshEvents, refreshPoll]);

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
      window.requestAnimationFrame(() => {
        document.getElementById("main-content")?.focus({ preventScroll: true });
      });
    }

    previousPath.current = currentPath;
  }, [currentPath]);

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

      setSession(data.session);
      await loadMembership(data.session);
      setAuthReady(true);
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      loadMembership(nextSession);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadMembership]);

  const navigate = useCallback((nextPath) => {
    const normalizedPath = normalizePath(nextPath);

    if (normalizedPath !== currentPath) {
      window.history.pushState({}, "", normalizedPath);
      setCurrentPath(normalizedPath);
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
  }, [currentPath]);

  const refreshCurrentMembership = useCallback(() => loadMembership(session), [loadMembership, session]);
  const showAdminLink = membership?.status === "approved" && membership?.role === "admin";

  function renderRoute() {
    const routeNeedsPoll = POLL_ROUTES.has(currentPath);
    const routeNeedsEvents = EVENT_ROUTES.has(currentPath);

    if ((routeNeedsPoll && !pollReady) || (routeNeedsEvents && !eventsReady)) {
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

    if (currentPath === "/account") {
      return (
        <Account
          authReady={authReady}
          hasSupabaseConfig={hasSupabaseConfig}
          membership={membership}
          navigate={navigate}
          refreshMembership={refreshCurrentMembership}
          session={session}
          supabase={supabase}
        />
      );
    }

    if (currentPath === "/admin") {
      return (
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
        />
      );
    }

    if (currentPath === "/vote") {
      return (
        <Poll
          key={`${livePoll.id}-${livePoll.phase}`}
          authReady={authReady}
          hasSupabaseConfig={hasSupabaseConfig}
          membership={membership}
          navigate={navigate}
          poll={livePoll}
          pollError={pollError}
          refreshPoll={refreshPoll}
          session={session}
          supabase={supabase}
        />
      );
    }

    if (currentPath === "/events") {
      return <Events clubLinks={clubLinks} specialEvents={liveEvents} />;
    }

    if (currentPath === "/about") {
      return <About clubLinks={clubLinks} navigate={navigate} />;
    }

    if (currentPath === "/archive") {
      return <Archive />;
    }

    if (currentPath === "/current") {
      return (
        <CurrentAlbum
          currentPoll={livePoll}
          navigate={navigate}
          specialEvents={liveEvents}
        />
      );
    }

    if (currentPath === "/reset-password") {
      return (
        <ResetPassword
          hasSupabaseConfig={hasSupabaseConfig}
          navigate={navigate}
          supabase={supabase}
        />
      );
    }

    if (currentPath === "/confirm-signup") {
      return <ConfirmSignup navigate={navigate} />;
    }

    if (currentPath === "/privacy") {
      return <Privacy />;
    }

    if (currentPath === "/") {
      return (
        <Home
          clubLinks={clubLinks}
          currentPoll={livePoll}
          hasSupabaseConfig={hasSupabaseConfig}
          homeActions={homeActions}
          navigate={navigate}
          specialEvents={liveEvents}
          supabase={supabase}
        />
      );
    }

    return <NotFound navigate={navigate} />;
  }

  return (
    <div className="page">
      <SideBNav
        activePath={currentPath}
        authReady={authReady}
        membership={membership}
        navigate={navigate}
        session={session}
        showAdminLink={showAdminLink}
      />
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
            {renderRoute()}
            <SiteFooter clubLinks={clubLinks} navigate={navigate} />
          </>
        </Suspense>
      </RouteErrorBoundary>
    </div>
  );
}

export default App;
