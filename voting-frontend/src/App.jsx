import { useCallback, useEffect, useState } from "react";

import "./App.css";
import Navbar from "./components/Navbar";
import {
  clubLinks,
  currentPoll,
  homeActions,
  instagramFeed,
  recentAlbums,
  specialEvents,
} from "./data/clubContent";
import { hasSupabaseConfig, supabase } from "./lib/supabaseClient";
import Admin from "./pages/Admin";
import About from "./pages/About";
import Home from "./pages/Home";
import Poll from "./pages/Poll";
import ResetPassword from "./pages/ResetPassword";
import Events from "./pages/Events";

function normalizePath(pathname) {
  if (pathname === "/admin" || pathname === "/admin/") {
    return "/admin";
  }

  if (pathname === "/vote" || pathname === "/vote/") {
    return "/vote";
  }

  if (pathname === "/events" || pathname === "/events/") {
    return "/events";
  }

  if (pathname === "/about" || pathname === "/about/") {
    return "/about";
  }

  if (pathname === "/reset-password" || pathname === "/reset-password/") {
    return "/reset-password";
  }

  return "/";
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

  async function loadMembership(nextSession) {
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
  }

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
  }, [refreshPoll]);

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
  }, [refreshPoll]);

  function navigate(nextPath) {
    const normalizedPath = normalizePath(nextPath);

    if (normalizedPath !== currentPath) {
      window.history.pushState({}, "", normalizedPath);
      setCurrentPath(normalizedPath);
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="page">
      <div className="page-shell">
        <Navbar
          currentPath={currentPath}
          navigate={navigate}
          showAdminLink={membership?.status === "approved" && membership?.role === "admin"}
        />

        <main className="view">
          {currentPath === "/admin" ? (
            <Admin
              authReady={authReady}
              hasSupabaseConfig={hasSupabaseConfig}
              membership={membership}
              poll={livePoll}
              pollError={pollError}
              refreshPoll={refreshPoll}
              session={session}
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
              refreshMembership={() => loadMembership(session)}
              refreshPoll={refreshPoll}
              session={session}
              supabase={supabase}
            />
          ) : currentPath === "/events" ? (
            <Events
              specialEvents={specialEvents}
              navigate={navigate}
            />
          ) : currentPath === "/about" ? (
            <About
              clubLinks={clubLinks}
              navigate={navigate}
            />
          ) : currentPath === "/reset-password" ? (
            <ResetPassword
              hasSupabaseConfig={hasSupabaseConfig}
              navigate={navigate}
              supabase={supabase}
            />
          ) : (
            <Home
              clubLinks={clubLinks}
              currentPoll={livePoll}
              hasSupabaseConfig={hasSupabaseConfig}
              homeActions={homeActions}
              instagramFeed={instagramFeed}
              navigate={navigate}
              recentAlbums={recentAlbums}
              specialEvents={specialEvents}
              supabase={supabase}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
