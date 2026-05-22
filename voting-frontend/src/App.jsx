import { useEffect, useState } from "react";

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
import Home from "./pages/Home";
import Poll from "./pages/Poll";

function normalizePath(pathname) {
  if (pathname === "/admin" || pathname === "/admin/") {
    return "/admin";
  }

  if (pathname === "/vote" || pathname === "/vote/") {
    return "/vote";
  }

  return "/";
}

function getCurrentPath() {
  return normalizePath(window.location.pathname);
}

function App() {
  const [currentPath, setCurrentPath] = useState(getCurrentPath); //single source of truth
  const [authReady, setAuthReady] = useState(!hasSupabaseConfig);
  const [session, setSession] = useState(null);
  const [membership, setMembership] = useState(null);

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

  useEffect(() => { //listener for button changes, helps url and ui stay in sync
    function handlePopState() {
      setCurrentPath(getCurrentPath());
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

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
  }, []);

  function navigate(nextPath) { // uses pushstate to not do full page reload
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
        <Navbar currentPath={currentPath} navigate={navigate} />

        <main className="view">
          {currentPath === "/admin" ? (
            <Admin
              authReady={authReady}
              hasSupabaseConfig={hasSupabaseConfig}
              membership={membership}
              session={session}
              supabase={supabase}
            />
          ) : currentPath === "/vote" ? (
            <Poll
              key={`${currentPoll.id}-${currentPoll.phase}`}
              authReady={authReady}
              hasSupabaseConfig={hasSupabaseConfig}
              membership={membership}
              navigate={navigate}
              poll={currentPoll}
              refreshMembership={() => loadMembership(session)}
              session={session}
              supabase={supabase}
            />
          ) : (
            <Home
              clubLinks={clubLinks}
              currentPoll={currentPoll}
              homeActions={homeActions}
              instagramFeed={instagramFeed}
              navigate={navigate}
              recentAlbums={recentAlbums}
              specialEvents={specialEvents}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
