import { useEffect, useMemo, useState } from "react";

import {
  fetchAlbumCover,
  getRecentShelfAlbums,
  loadRecordShelfCoverOverrides,
} from "../lib/recordShelf";
import "../styles/cozy.css";

const coverUrls = {
  blonde: "https://upload.wikimedia.org/wikipedia/en/a/a0/Blonde_-_Frank_Ocean.jpeg",
  currents: "https://upload.wikimedia.org/wikipedia/en/9/9b/Tame_Impala_-_Currents.png",
  discovery: "https://upload.wikimedia.org/wikipedia/en/a/ae/Daft_Punk_-_Discovery.jpg",
  ctrl: "https://upload.wikimedia.org/wikipedia/en/b/bf/SZA_-_Ctrl_cover.png",
  vespertine: "https://upload.wikimedia.org/wikipedia/en/8/8a/Bjork-vespertine.jpg",
};
const feedImages = [
  coverUrls.currents,
  "https://upload.wikimedia.org/wikipedia/en/6/67/Cocteau_Twins-Heaven_or_Las_Vegas.jpg",
  coverUrls.blonde,
  coverUrls.discovery,
  coverUrls.ctrl,
  coverUrls.vespertine,
];

function getEventPreview(specialEvents) {
  const upcoming = specialEvents.find((event) => event.status === "upcoming");
  const recent = specialEvents.find((event) => event.status === "recent");

  return [upcoming, recent].filter(Boolean);
}

function Home({
  clubLinks,
  currentPoll,
  hasSupabaseConfig,
  homeActions,
  instagramFeed,
  navigate,
  specialEvents,
  supabase,
}) {
  const [activeAlbumId, setActiveAlbumId] = useState(null);
  const [albumCoverUrls, setAlbumCoverUrls] = useState({});
  const eventPreview = getEventPreview(specialEvents);
  const shelfAlbums = useMemo(() => getRecentShelfAlbums(), []);
  const currentAlbumCover =
    currentPoll.albumOfWeek.coverUrl ||
    "https://upload.wikimedia.org/wikipedia/en/6/67/Cocteau_Twins-Heaven_or_Las_Vegas.jpg";
  const quickLinks = [
    ...homeActions,
    {
      id: "info",
      label: "Info",
      title: "How ALC works",
      description: "Meeting rhythm, cost, location details, and what to expect.",
      kind: "route",
      target: "/about",
    },
  ];

  useEffect(() => {
    const controller = new AbortController();

    async function loadAlbumCovers() {
      const albumIds = shelfAlbums.map((album) => album.id);
      const [coverEntries, coverOverrides] = await Promise.all([
        Promise.all(
          shelfAlbums.map(async (album) => {
            try {
              const coverUrl = await fetchAlbumCover(album.title, controller.signal);
              return [album.id, coverUrl];
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

      if (!controller.signal.aborted) {
        const fetchedCovers = Object.fromEntries(coverEntries.filter(Boolean));
        const uploadedCovers = Object.fromEntries(
          Object.entries(coverOverrides).map(([albumId, row]) => [albumId, row.cover_url]),
        );
        setAlbumCoverUrls({ ...fetchedCovers, ...uploadedCovers });
      }
    }

    loadAlbumCovers();

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
    <div className="home-page cozy-home">
      <section className="cozy-hero" aria-labelledby="home-title">
        <div className="cozy-hero-copy">
          <h1 id="home-title" className="cozy-title">
            Album
            <span>Listening</span>
            Club
          </h1>

          <p className="cozy-tagline">Like a book club, but for albums.</p>
          <p className="cozy-intro">
            A warm little home base for the record everyone is sitting with this week.
            Vote together, listen on your own time, then show up ready to talk like
            friends on a dorm room floor with the lights low.
          </p>

          <div className="cozy-hero-actions" aria-label="Primary links">
            <button className="cozy-button cozy-button-primary" onClick={() => navigate("/vote")}>
              Go to weekly voting
            </button>

            <a className="cozy-button cozy-button-secondary" href={clubLinks.sunDevilCentral}>
              Join the club
            </a>
          </div>
        </div>

        <article className="cozy-current-album" aria-label="This week's album">
          <img
            src={currentAlbumCover}
            alt={`${currentPoll.albumOfWeek.title} album cover`}
            className="cozy-current-cover"
          />

          <div className="cozy-current-copy">
            <p>This week&apos;s album</p>
            <h2>{currentPoll.albumOfWeek.title}</h2>
            <span>{currentPoll.albumOfWeek.artist}</span>
          </div>
        </article>
      </section>

      <section className="cozy-link-grid" aria-label="Club links">
        {quickLinks.map((action) => (
          <a
            key={action.id}
            className={`cozy-link-card cozy-link-${action.id}`}
            href={getActionHref(action)}
            onClick={(event) => handleAction(event, action)}
          >
            <span>{action.label}</span>
            <strong>{action.title}</strong>
            <p>{action.description}</p>
          </a>
        ))}
      </section>

      <section className="cozy-record-shelf" id="recent-albums" aria-labelledby="recent-heading">
        <div className="cozy-section-heading">
          <p>Recent listens</p>
          <h2 id="recent-heading">Records on the shelf.</h2>
          <span>Built from the five newest entries in the club archive.</span>
        </div>

        <div className="cozy-album-grid">
          {shelfAlbums.map((album) => {
            const isActive = activeAlbumId === album.id;
            const albumCoverUrl = albumCoverUrls[album.id];

            return (
              <button
                key={album.id}
                type="button"
                className={`cozy-album-card ${isActive ? "is-active" : ""}`}
                aria-pressed={isActive}
                onClick={() => setActiveAlbumId(isActive ? null : album.id)}
              >
                {albumCoverUrl ? (
                  <img
                    src={albumCoverUrl}
                    alt={`${album.title} album cover`}
                    className="cozy-album-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="cozy-album-cover cozy-generated-cover" aria-hidden="true">
                    <span>{album.title.slice(0, 2)}</span>
                  </span>
                )}

                <span className="cozy-album-overlay">
                  <strong>{album.title}</strong>
                  <span>{album.artist}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="cozy-social-and-info" aria-label="Club social and information">
        <div className="cozy-instagram" aria-labelledby="instagram-heading">
          <div className="cozy-instagram-profile">
            <div className="cozy-avatar">ALC</div>

            <div>
              <h2 id="instagram-heading">@albumasu</h2>
              <p>Album Listening Club</p>
            </div>

            <a href={clubLinks.instagram}>Follow</a>
          </div>

          <div className="cozy-instagram-stats" aria-label="Instagram profile stats">
            <span>
              <strong>24</strong> posts
            </span>
            <span>
              <strong>48</strong> members
            </span>
            <span>
              <strong>weekly</strong> club
            </span>
          </div>

          <div className="cozy-instagram-feed" aria-label="Instagram feed preview">
            {instagramFeed.map((post, index) => (
              <img
                key={post.id}
                src={post.imageUrl || feedImages[index % feedImages.length]}
                alt={post.label}
              />
            ))}
          </div>
        </div>

        <div className="cozy-info-stack">
          <section className="cozy-info-panel" id="more-info" aria-labelledby="info-heading">
            <p>More info</p>
            <h2 id="info-heading">What to expect.</h2>
            <span>
              We meet every week in Hayden basement, room C8 at 7:15. Come to yap about your favorite albums.
            </span>
            <button
              className="cozy-button cozy-button-secondary cozy-events-button"
              type="button"
              onClick={() => navigate("/about")}
            >
              More info
            </button>
          </section>

          <section className="cozy-info-panel" id="events" aria-labelledby="events-heading">
            <p>Events</p>
            <h2 id="events-heading">Recent and upcoming.</h2>
            {eventPreview.length > 0 ? (
              <div className="cozy-event-list">
                {eventPreview.map((event) => (
                  <article key={event.id}>
                    <span>{event.status === "upcoming" ? "Upcoming" : "Recent"}</span>
                    <strong>{event.title}</strong>
                    <small>{event.displayDate} at {event.time}</small>
                    <em>{event.location}</em>
                  </article>
                ))}
              </div>
            ) : (
              <span>No events posted yet. Check back after the next club update.</span>
            )}
            <button
              className="cozy-button cozy-button-secondary cozy-events-button"
              type="button"
              onClick={() => navigate("/events")}
            >
              See all events
            </button>
          </section>
        </div>
      </section>
    </div>
  );
}

export default Home;
