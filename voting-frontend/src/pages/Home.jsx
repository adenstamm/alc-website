import { useEffect, useMemo, useState } from "react";

import SideBNav from "../components/SideBNav";
import {
  fetchAlbumMetadata,
  getRecentShelfAlbums,
  loadRecordShelfCoverOverrides,
} from "../lib/recordShelf";
import "../styles/sideb-mock.css";

function getNextSession(specialEvents) {
  return specialEvents.find((event) => event.status === "upcoming") || specialEvents[0];
}

function formatSessionDetails(nextSession) {
  if (!nextSession) {
    return "Next club night at 7:15 PM";
  }

  return `${nextSession.displayDate} at ${nextSession.time}`;
}

function Home({
  clubLinks,
  currentPoll,
  hasSupabaseConfig,
  homeActions,
  navigate,
  showAdminLink,
  specialEvents,
  supabase,
}) {
  const [albumMetadata, setAlbumMetadata] = useState({});
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
  const nextSession = getNextSession(specialEvents);

  useEffect(() => {
    const controller = new AbortController();

    async function loadAlbumMetadata() {
      const albumIds = shelfAlbums.map((album) => album.id);
      const [metadataEntries, coverOverrides] = await Promise.all([
        Promise.all(
          shelfAlbums.map(async (album) => {
            try {
              const metadata = await fetchAlbumMetadata(album.title, controller.signal);
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

  function handleAction(event, action) {
    if (action.kind === "route") {
      event.preventDefault();
      navigate(action.target);
    }
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
      <SideBNav activePath="/" navigate={navigate} showAdminLink={showAdminLink} />

      <section
        className="sideb-hero"
        style={{ "--hero-image": "url(/sideb-turntable-hero.jpg)" }}
        aria-labelledby="home-title"
      >
        <div className="sideb-hero-copy">
          <p className="sideb-kicker">~ new album every week</p>
          <h1 id="home-title">Album Listening Club</h1>
          <p className="sideb-lede">
            Wednesday nights. Listen to the album on your time, share your thoughts on our time
          </p>

          <div className="sideb-actions" aria-label="Primary links">
            <button
              type="button"
              className="sideb-button sideb-button-primary"
              onClick={() => navigate("/events")}
            >
              Upcoming Events <span aria-hidden="true">-&gt;</span>
            </button>
            <button
              type="button"
              className="sideb-button sideb-button-ghost"
              onClick={() => navigate("/about")}
            >
              Our Story
            </button>
          </div>
        </div>
      </section>

      <section className="sideb-session-strip" aria-label="Next listening session">
        <div className="sideb-strip-label">
          <span className="sideb-strip-mark" aria-hidden="true" />
          <strong>Next Session</strong>
        </div>
        <p>
          {currentPoll.albumOfWeek.artist} - {currentPoll.albumOfWeek.title}
        </p>
        <span>{formatSessionDetails(nextSession)}</span>
        <span>{nextSession?.location || "Hayden Library C8"}</span>
        <button type="button" onClick={() => navigate("/current")}>
          Current <span aria-hidden="true">-&gt;</span>
        </button>
      </section>

      <section className="sideb-link-grid" aria-label="Club links">
        {quickLinks.map((action) => (
          <a
            key={action.id}
            className="sideb-link-card"
            href={getActionHref(action)}
            onClick={(event) => handleAction(event, action)}
            target={action.kind === "external" ? "_blank" : undefined}
            rel={action.kind === "external" ? "noreferrer" : undefined}
          >
            <span>{action.label}</span>
            <strong>{action.title}</strong>
            <p>{action.description}</p>
          </a>
        ))}
      </section>

      <section className="sideb-crates" id="recent-albums" aria-labelledby="crates-heading">
        <div className="sideb-section-heading">
          <div>
            <p>Recently listened</p>
            <h2 id="crates-heading">From the crates</h2>
          </div>
        </div>

        <div className="sideb-crate-grid">
          {shelfAlbums.map((album, index) => {
            const artist = albumMetadata[album.id]?.artist || album.artist;

            return (
              <article
                className="sideb-crate-card"
                key={album.id}
                title={`${album.title} by ${artist}`}
              >
                <div className={`sideb-record sideb-record-${(index % 3) + 1}`} aria-hidden="true">
                  <span />
                </div>
                <p>session {String(index + 1).padStart(2, "0")}</p>
                <h3>{album.title}</h3>
                <span>{artist}</span>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export default Home;
