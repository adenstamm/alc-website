import { useEffect, useState } from "react";

import "./App.css";
import Navbar from "./components/Navbar";
import {
  clubPrinciples,
  currentPoll,
  recentAlbums,
  weeklyRhythm,
} from "./data/clubContent";
import Home from "./pages/Home";
import Poll from "./pages/Poll";

function normalizePath(pathname) {
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

  useEffect(() => { //listener for button changes, helps url and ui stay in sync
    function handlePopState() {
      setCurrentPath(getCurrentPath());
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
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
          {currentPath === "/vote" ? (
            <Poll navigate={navigate} poll={currentPoll} />
          ) : (
            <Home
              clubPrinciples={clubPrinciples}
              currentPoll={currentPoll}
              navigate={navigate}
              recentAlbums={recentAlbums}
              weeklyRhythm={weeklyRhythm}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
