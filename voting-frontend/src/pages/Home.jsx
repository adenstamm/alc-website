import { useEffect, useMemo, useRef, useState } from "react";

import genresPoster from "../assets/genres-this-year.png";
import {
  fetchAlbumMetadata,
  getRecentShelfAlbums,
  loadRecordShelfCoverOverrides,
} from "../lib/recordShelf";

function Home({
  clubLinks,
  currentPoll,
  hasSupabaseConfig,
  homeActions,
  navigate,
  supabase,
}) {
  const [albumMetadata, setAlbumMetadata] = useState({});
  const [failedAlbumCover, setFailedAlbumCover] = useState(null);
  const [crateWheelState, setCrateWheelState] = useState({
    hasOverflow: true,
    canScrollBack: false,
    canScrollForward: true,
  });
  const crateWheelRef = useRef(null);
  const shelfAlbums = useMemo(() => getRecentShelfAlbums(), []);
  const quickLinks = useMemo(
    () => [
      ...homeActions,
      {
        id: "about",
        label: "About",
        title: "Our story",
        description: "How the club works, what to expect, and where we meet.",
        kind: "route",
        target: "/about",
      },
      {
        id: "instagram",
        label: "Social",
        title: "Instagram",
        description: "Follow the public club page for posts and meeting updates.",
        kind: "external",
        target: "instagram",
      },
    ],
    [homeActions],
  );
  const currentAlbum = currentPoll.albumOfWeek;
  const configuredAlbumCover = currentAlbum.coverUrl || null;
  const albumCover = configuredAlbumCover === failedAlbumCover ? null : configuredAlbumCover;

  useEffect(() => {
    const controller = new AbortController();

    async function loadAlbumMetadata() {
      const albumIds = shelfAlbums.map((album) => album.id);
      const [metadataEntries, coverOverrides] = await Promise.all([
        Promise.all(
          shelfAlbums.map(async (album) => {
            try {
              const metadata = await fetchAlbumMetadata(album.title, controller.signal, album.artist);
              return [album.id, metadata];
            } catch (error) {
              if (error.name !== "AbortError") {
                return [album.id, null];
              }

              return null;
            }
          }),
        ),
        loadRecordShelfCoverOverrides(supabase, hasSupabaseConfig, albumIds),
      ]);

      if (controller.signal.aborted) {
        return;
      }

      const fetchedMetadata = Object.fromEntries(metadataEntries.filter(Boolean));
      const manualMetadata = Object.fromEntries(
        Object.entries(coverOverrides)
          .filter(([, row]) => row.artist_override)
          .map(([albumId, row]) => [
            albumId,
            {
              ...fetchedMetadata[albumId],
              artist: row.artist_override,
            },
          ]),
      );

      setAlbumMetadata({ ...fetchedMetadata, ...manualMetadata });
    }

    loadAlbumMetadata();

    return () => controller.abort();
  }, [hasSupabaseConfig, shelfAlbums, supabase]);

  useEffect(() => {
    const track = crateWheelRef.current;

    if (!track) {
      return undefined;
    }

    const edgeTolerance = 3;
    let measurementFrame = 0;

    function measureWheel() {
      const maximumScroll = Math.max(0, track.scrollWidth - track.clientWidth);
      const nextState = {
        hasOverflow: maximumScroll > edgeTolerance,
        canScrollBack: track.scrollLeft > edgeTolerance,
        canScrollForward: track.scrollLeft < maximumScroll - edgeTolerance,
      };

      setCrateWheelState((previousState) => (
        previousState.hasOverflow === nextState.hasOverflow
        && previousState.canScrollBack === nextState.canScrollBack
        && previousState.canScrollForward === nextState.canScrollForward
          ? previousState
          : nextState
      ));
    }

    function scheduleMeasurement() {
      if (measurementFrame) {
        return;
      }

      measurementFrame = window.requestAnimationFrame(() => {
        measurementFrame = 0;
        measureWheel();
      });
    }

    function handleWheel(event) {
      if (
        event.ctrlKey
        || !event.deltaY
        || Math.abs(event.deltaX) >= Math.abs(event.deltaY)
      ) {
        return;
      }

      const deltaMultiplier = event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? track.clientWidth
          : 1;
      const horizontalDelta = event.deltaY * deltaMultiplier;
      const maximumScroll = Math.max(0, track.scrollWidth - track.clientWidth);
      const canMove = horizontalDelta > 0
        ? track.scrollLeft < maximumScroll - edgeTolerance
        : track.scrollLeft > edgeTolerance;

      if (!canMove) {
        return;
      }

      event.preventDefault();
      track.scrollLeft += horizontalDelta;
    }

    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(scheduleMeasurement);

    measureWheel();
    resizeObserver?.observe(track);
    track.addEventListener("scroll", scheduleMeasurement, { passive: true });
    track.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      if (measurementFrame) {
        window.cancelAnimationFrame(measurementFrame);
      }

      resizeObserver?.disconnect();
      track.removeEventListener("scroll", scheduleMeasurement);
      track.removeEventListener("wheel", handleWheel);
    };
  }, [shelfAlbums.length]);

  function scrollCrateWheel(direction) {
    const track = crateWheelRef.current;

    if (!track) {
      return;
    }

    const items = track.querySelectorAll("[data-carousel-item]");
    const itemDistance = items.length > 1
      ? items[1].offsetLeft - items[0].offsetLeft
      : track.clientWidth * 0.85;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    track.scrollBy({
      left: direction * itemDistance,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }

  function handleCrateWheelKeyDown(event) {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      scrollCrateWheel(event.key === "ArrowLeft" ? -1 : 1);
      return;
    }

    if (event.key !== "Home" && event.key !== "End") {
      return;
    }

    const track = crateWheelRef.current;

    if (!track) {
      return;
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    event.preventDefault();
    track.scrollTo({
      left: event.key === "Home" ? 0 : track.scrollWidth - track.clientWidth,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }

  function handleAction(event, action) {
    if (action.kind === "route") {
      event.preventDefault();
      navigate(action.target);
    }
  }

  function handleRouteLink(event, path) {
    event.preventDefault();
    navigate(path);
  }

  function getActionHref(action) {
    if (action.kind === "route") {
      return action.target;
    }

    if (action.kind === "external") {
      return clubLinks[action.target] || "#";
    }

    return action.target;
  }

  return (
    <div className="sideb-page">
      <main id="main-content" tabIndex="-1">
        <section
          className="sideb-hero"
          aria-labelledby="home-title"
        >
          <div className="sideb-hero-copy">
            <p className="sideb-kicker">Album Listening Club at ASU</p>
            <h1 id="home-title">
              <span>Album Listening</span>
              <span>Club</span>
            </h1>
            <p className="sideb-lede">
              One record. One week. A room full of opinions. Wednesday nights at ASU.
            </p>

            <div className="sideb-actions" aria-label="Primary links">
              <a
                className="sideb-button sideb-button-primary"
                href="/events"
                onClick={(event) => handleRouteLink(event, "/events")}
              >
                Upcoming events <span aria-hidden="true">→</span>
              </a>
              <a
                className="sideb-button sideb-button-ghost"
                href="/about"
                onClick={(event) => handleRouteLink(event, "/about")}
              >
                Our story
              </a>
            </div>
          </div>

          <aside className="sideb-floating-album" aria-labelledby="home-current-album-title">
            <a
              className="sideb-floating-album-link"
              href="/current"
              onClick={(event) => handleRouteLink(event, "/current")}
            >
              <span className="sideb-floating-album-label">
                <i aria-hidden="true" /> Now spinning
              </span>
              <span className="sideb-floating-album-art" aria-hidden="true">
                {albumCover ? (
                  <img
                    alt=""
                    decoding="async"
                    height="176"
                    onError={() => setFailedAlbumCover(configuredAlbumCover)}
                    referrerPolicy="no-referrer"
                    src={albumCover}
                    width="176"
                  />
                ) : (
                  <span />
                )}
              </span>
              <span className="sideb-floating-album-copy">
                <span>{currentPoll.cycleLabel}</span>
                <h2 id="home-current-album-title">{currentAlbum.title}</h2>
                <span>{currentAlbum.artist}</span>
                <small>Open listening notes <span aria-hidden="true">→</span></small>
              </span>
            </a>
          </aside>
        </section>

        <section className="sideb-genres-teaser" aria-labelledby="genres-teaser-title">
          <a
            className="sideb-genres-teaser-link"
            href="/genres"
            onClick={(event) => handleRouteLink(event, "/genres")}
          >
            <span className="sideb-genres-teaser-copy">
              <h2 id="genres-teaser-title">Take a look at our upcoming genres!</h2>
              <span className="sideb-genres-teaser-action">
                View the genres this year <span aria-hidden="true">→</span>
              </span>
            </span>

            <span className="sideb-genres-teaser-art" aria-hidden="true">
              <img
                alt=""
                decoding="async"
                height="1350"
                loading="lazy"
                src={genresPoster}
                width="1080"
              />
            </span>
          </a>
        </section>

        <section className="sideb-link-grid" aria-label="Club links">
          {quickLinks.map((action, index) => (
            <a
              key={action.id}
              className="sideb-link-card"
              href={getActionHref(action)}
              onClick={(event) => handleAction(event, action)}
              target={action.kind === "external" ? "_blank" : undefined}
              rel={action.kind === "external" ? "noopener noreferrer" : undefined}
            >
              <span className="sideb-link-card-channel">
                <span>{action.label}</span>
                <small>CH {String(index + 1).padStart(2, "0")}</small>
              </span>
              <strong>{action.title}</strong>
              <p>{action.description}</p>
            </a>
          ))}
        </section>

        <section
          aria-labelledby="crates-heading"
          aria-roledescription="carousel"
          className="sideb-crates"
          id="recent-albums"
        >
          <div className="sideb-section-heading">
            <div>
              <p>Recently listened</p>
              <h2 id="crates-heading">From the crates</h2>
            </div>
            <div className="sideb-crate-heading-actions">
              {crateWheelState.hasOverflow ? (
                <div
                  aria-label="Recently listened album controls"
                  className="sideb-crate-controls"
                  role="group"
                >
                  <button
                    aria-controls="recent-albums-track"
                    disabled={!crateWheelState.canScrollBack}
                    onClick={() => scrollCrateWheel(-1)}
                    type="button"
                  >
                    Previous
                  </button>
                  <button
                    aria-controls="recent-albums-track"
                    disabled={!crateWheelState.canScrollForward}
                    onClick={() => scrollCrateWheel(1)}
                    type="button"
                  >
                    Next
                  </button>
                </div>
              ) : null}
              <a href="/archive" onClick={(event) => handleRouteLink(event, "/archive")}>Full archive <span aria-hidden="true">→</span></a>
            </div>
          </div>

          <ul
            aria-label="Five most recently listened albums"
            className="sideb-crate-wheel"
            id="recent-albums-track"
            onKeyDown={handleCrateWheelKeyDown}
            ref={crateWheelRef}
            tabIndex="0"
          >
            {shelfAlbums.map((album, index) => {
              const metadata = albumMetadata[album.id];
              const artist = metadata?.artist || album.artist;

              return (
                <li
                  aria-label={`${index + 1} of ${shelfAlbums.length}: ${album.title} by ${artist}`}
                  aria-roledescription="slide"
                  className="sideb-crate-slide"
                  data-carousel-item
                  key={album.id}
                >
                  <article
                    className="sideb-crate-card"
                    title={`${album.title} by ${artist}`}
                  >
                    <div className="sideb-album-art">
                      <div className={`sideb-record sideb-record-${(index % 3) + 1}`} aria-hidden="true">
                        <span />
                      </div>
                      {metadata?.coverUrl ? (
                        <img
                          alt=""
                          decoding="async"
                          height="600"
                          loading="lazy"
                          onError={(event) => {
                            event.currentTarget.hidden = true;
                          }}
                          referrerPolicy="no-referrer"
                          src={metadata.coverUrl}
                          width="600"
                        />
                      ) : null}
                    </div>
                    <p>Session {String(index + 1).padStart(2, "0")}</p>
                    <h3>{album.title}</h3>
                    <span>{artist}</span>
                  </article>
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </div>
  );
}

export default Home;
