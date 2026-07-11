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
import { hasSiteEventsConfig, hasSupabaseConfig, supabase } from "./lib/supabaseClient";
import Home from "./pages/Home";
import { normalizeSiteEvent } from "./lib/siteContent";
import "./styles/sideb-mock.css";

const About = lazy(() => import("./pages/About"));
const Account = lazy(() => import("./pages/Account"));
const Admin = lazy(() => import("./pages/Admin"));
const Archive = lazy(() => import("./pages/Archive"));
const CurrentAlbum = lazy(() => import("./pages/CurrentAlbum"));
const Events = lazy(() => import("./pages/Events"));
const Poll = lazy(() => import("./pages/Poll"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));

const ROUTES = new Set(["/", "/account", "/admin", "/vote", "/events", "/about", "/archive", "/current", "/reset-password"]);
const ROUTE_REDIRECTS = new Map([
  ["/results", "/vote"],
]);
const ROUTE_TITLES = {
  "/": "Album Listening Club",
  "/account": "Account · Album Listening Club",
  "/about": "About · Album Listening Club",
  "/admin": "Admin · Album Listening Club",
  "/archive": "Archive · Album Listening Club",
  "/current": "Current Listen · Album Listening Club",
  "/events": "Events · Album Listening Club",
  "/reset-password": "Reset Password · Album Listening Club",
  "/vote": "Vote · Album Listening Club",
};
const POLL_ROUTES = new Set(["/", "/admin", "/current", "/vote"]);
const EVENT_ROUTES = new Set(["/", "/admin", "/current", "/events"]);

function normalizePath(pathname) {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  const redirectPath = ROUTE_REDIRECTS.get(normalizedPath);

  if (redirectPath) {
    return redirectPath;
  }

  return ROUTES.has(normalizedPath) ? normalizedPath : "/";
}

function getCurrentPath() {
  const normalizedPath = normalizePath(window.location.pathname);

  if (window.location.pathname !== normalizedPath) {
    window.history.replaceState({}, "", `${normalizedPath}${window.location.search}${window.location.hash}`);
  }

  return normalizedPath;
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
  const [livePoll, setLivePoll] = useState(currentPoll);
  const [liveEvents, setLiveEvents] = useState(specialEvents);
  const [pollError, setPollError] = useState(null);

  const refreshPoll = useCallback(async () => {
    if (!hasSupabaseConfig) {
      setLivePoll(currentPoll);
      return currentPoll;
    }

    const { data, error } = await supabase.rpc("get_current_poll");

    if (error) {
      setPollError(error.message);
      setLivePoll(currentPoll);
      return currentPoll;
    }

    const nextPoll = normalizeLivePoll(data);
    setPollError(null);
    setLivePoll(nextPoll);
    return nextPoll;
  }, []);

  const refreshEvents = useCallback(async () => {
    if (!hasSiteEventsConfig) {
      setLiveEvents(specialEvents);
      return specialEvents;
    }

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
    document.title = ROUTE_TITLES[currentPath] || ROUTE_TITLES["/"];

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
      refreshPoll();
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadMembership, refreshPoll]);

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
      return <Events specialEvents={liveEvents} />;
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
