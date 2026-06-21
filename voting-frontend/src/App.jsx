import { useCallback, useEffect, useState } from "react";

import "./App.css";
import Navbar from "./components/Navbar";
import {
  clubLinks,
  currentPoll,
  homeActions,
  specialEvents,
} from "./data/clubContent";
import { hasSiteEventsConfig, hasSupabaseConfig, supabase } from "./lib/supabaseClient";
import Admin from "./pages/Admin";
import About from "./pages/About";
import Archive from "./pages/Archive";
import CurrentAlbum from "./pages/CurrentAlbum";
import Home from "./pages/Home";
import Poll from "./pages/Poll";
import ResetPassword from "./pages/ResetPassword";
import Events from "./pages/Events";
import { normalizeSiteEvent } from "./lib/siteContent";

const ROUTES = new Set(["/", "/admin", "/vote", "/events", "/about", "/archive", "/current", "/reset-password"]);

function normalizePath(pathname) {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  return ROUTES.has(normalizedPath) ? normalizedPath : "/";
}

function getCurrentPath() {
  return normalizePath(window.location.pathname);
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
    setLiveEvents(nextEvents.length ? nextEvents : specialEvents);
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
    refreshPoll();
    refreshEvents();
  }, [refreshEvents, refreshPoll]);

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

    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentPath]);

  const refreshCurrentMembership = useCallback(() => loadMembership(session), [loadMembership, session]);
  const showAdminLink = membership?.status === "approved" && membership?.role === "admin";

  return (
    <div className="page">
      <div className="page-shell">
        <Navbar
          currentPath={currentPath}
          navigate={navigate}
          showAdminLink={showAdminLink}
        />

        <main className="view">
          {currentPath === "/admin" ? (
            <Admin
              authReady={authReady}
              hasSupabaseConfig={hasSupabaseConfig}
              hasSiteEventsConfig={hasSiteEventsConfig}
              membership={membership}
              navigate={navigate}
              poll={livePoll}
              pollError={pollError}
              refreshEvents={refreshEvents}
              refreshPoll={refreshPoll}
              session={session}
              showAdminLink={showAdminLink}
              siteEvents={liveEvents}
              supabase={supabase}
            />
          ) : currentPath === "/vote" ? (
            <Poll
              key={`${livePoll.id}-${livePoll.phase}`}
              authReady={authReady}
              hasSupabaseConfig={hasSupabaseConfig}
              membership={membership}
              navigate={navigate}
              poll={livePoll}
              pollError={pollError}
              refreshMembership={refreshCurrentMembership}
              refreshPoll={refreshPoll}
              session={session}
              showAdminLink={showAdminLink}
              supabase={supabase}
            />
          ) : currentPath === "/events" ? (
            <Events
              specialEvents={liveEvents}
              navigate={navigate}
              showAdminLink={showAdminLink}
            />
          ) : currentPath === "/about" ? (
            <About
              clubLinks={clubLinks}
              navigate={navigate}
              showAdminLink={showAdminLink}
            />
          ) : currentPath === "/archive" ? (
            <Archive
              navigate={navigate}
              showAdminLink={showAdminLink}
            />
          ) : currentPath === "/current" ? (
            <CurrentAlbum
              currentPoll={livePoll}
              navigate={navigate}
              showAdminLink={showAdminLink}
              specialEvents={liveEvents}
            />
          ) : currentPath === "/reset-password" ? (
            <ResetPassword
              hasSupabaseConfig={hasSupabaseConfig}
              navigate={navigate}
              showAdminLink={showAdminLink}
              supabase={supabase}
            />
          ) : (
            <Home
              clubLinks={clubLinks}
              currentPoll={livePoll}
              hasSupabaseConfig={hasSupabaseConfig}
              homeActions={homeActions}
              navigate={navigate}
              showAdminLink={showAdminLink}
              specialEvents={liveEvents}
              supabase={supabase}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
