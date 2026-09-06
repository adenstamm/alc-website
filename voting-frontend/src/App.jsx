import Home from "./pages/Home";
import {
  NOT_FOUND_META,
  NO_INDEX_ROUTES,
  ROUTES,
  ROUTE_META,
  SIDNEY_LETTER_ROUTE,
  SITE_ORIGIN,
} from "./data/routeMeta";
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
import { Suspense, lazy, useCallback, useEffect, useRef } from "react";
import { clubLinks, homeActions } from "./data/clubContent";
import {
  hasSiteEventsConfig,
  hasSupabaseConfig,
  supabase,
} from "./lib/supabaseClient";
import useClubAuth from "./hooks/useClubAuth.js";
import useClubEvents from "./hooks/useClubEvents.js";
import useClubPoll from "./hooks/useClubPoll.js";
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

const ROUTE_REDIRECTS = new Map([["/results", "/vote"]]);

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

function App() {
  const location = useLocation();
  const routerNavigate = useNavigate();
  const navigationType = useNavigationType();
  const currentPath = normalizePath(location.pathname);
  const isPersonalLetter = currentPath === SIDNEY_LETTER_ROUTE;
  const previousPath = useRef(currentPath);
  const {
    authReady,
    session,
    membership,
    membershipLookupStatus,
    refreshCurrentMembership,
  } = useClubAuth();
  const { livePoll, pollReady, pollError, pollErrorStatus, refreshPoll } =
    useClubPoll({ authReady, currentPath, membership, session });
  const { liveEvents, eventsReady, refreshEvents } = useClubEvents({
    currentPath,
  });

  useEffect(() => {
    if (location.pathname !== currentPath) {
      routerNavigate(`${currentPath}${location.search}${location.hash}`, {
        replace: true,
      });
    }
  }, [
    currentPath,
    location.hash,
    location.pathname,
    location.search,
    routerNavigate,
  ]);

  useEffect(() => {
    const isKnownRoute = ROUTES.has(currentPath);
    const meta = ROUTE_META[currentPath] || NOT_FOUND_META;
    const canonicalPath = isKnownRoute ? currentPath : "/404";
    const canonicalUrl = `${SITE_ORIGIN}${canonicalPath === "/" ? "" : canonicalPath}`;
    const shouldIndex = isKnownRoute && !NO_INDEX_ROUTES.has(currentPath);
    const canonicalLink = document.querySelector('link[rel="canonical"]');

    document.title = meta.title;
    setMetaContent('meta[name="description"]', meta.description);
    setMetaContent(
      'meta[name="robots"]',
      shouldIndex ? "index, follow" : "noindex, nofollow",
    );
    setMetaContent('meta[property="og:title"]', meta.title);
    setMetaContent('meta[property="og:description"]', meta.description);
    setMetaContent('meta[property="og:url"]', canonicalUrl);
    setMetaContent('meta[name="twitter:title"]', meta.title);
    setMetaContent('meta[name="twitter:description"]', meta.description);
    canonicalLink?.setAttribute("href", canonicalUrl);

    if (previousPath.current !== currentPath) {
      if (navigationType !== "POP") {
        const prefersReducedMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        window.scrollTo({
          top: 0,
          behavior: prefersReducedMotion ? "auto" : "smooth",
        });
      }

      window.requestAnimationFrame(() => {
        document.getElementById("main-content")?.focus({ preventScroll: true });
      });
    }

    previousPath.current = currentPath;
  }, [currentPath, navigationType]);

  const navigate = useCallback(
    (nextPath) => {
      const normalizedPath = normalizePath(nextPath);

      if (normalizedPath !== currentPath) {
        routerNavigate(normalizedPath);
      }
    },
    [currentPath, routerNavigate],
  );

  const showAdminLink =
    membership?.status === "approved" && membership?.role === "admin";

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
          fallback={
            <div className="route-loading" role="status">
              <span className="route-loading-record" aria-hidden="true" />
              <p>Pulling the record from the shelf…</p>
            </div>
          }
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
                element={
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
                }
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
              <Route
                path="/about"
                element={<About clubLinks={clubLinks} navigate={navigate} />}
              />
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
                element={
                  <ResetPassword
                    hasSupabaseConfig={hasSupabaseConfig}
                    navigate={navigate}
                    supabase={supabase}
                  />
                }
              />
              <Route
                path="/results"
                element={
                  <Navigate
                    replace
                    to={`/vote${location.search}${location.hash}`}
                  />
                }
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
