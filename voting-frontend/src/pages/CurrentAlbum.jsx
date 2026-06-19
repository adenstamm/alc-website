import { useEffect, useMemo, useState } from "react";

import SideBNav from "../components/SideBNav";
import { fetchAlbumMetadata } from "../lib/recordShelf";
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

function getSearchLinks(album) {
  const query = encodeURIComponent(`${album.title} ${album.artist}`);

  return [
    {
      label: "Spotify",
      href: `https://open.spotify.com/search/${query}`,
    },
    {
      label: "Apple Music",
      href: `https://music.apple.com/us/search?term=${query}`,
    },
    {
      label: "YouTube",
      href: `https://www.youtube.com/results?search_query=${query}`,
    },
  ];
}

const listeningPrompts = [
  "Which track would you replay first?",
  "Where does the album feel most like itself?",
  "What production choice or lyric stuck with you?",
  "Would you recommend this to someone outside the club?",
];

function CurrentAlbum({ currentPoll, navigate, showAdminLink, specialEvents }) {
  const album = currentPoll.albumOfWeek;
  const [metadata, setMetadata] = useState(null);
  const nextSession = getNextSession(specialEvents);
  const coverUrl = album.coverUrl || metadata?.coverUrl;
  const searchLinks = useMemo(() => getSearchLinks(album), [album]);

  useEffect(() => {
    if (album.coverUrl) {
      setMetadata(null);
      return undefined;
    }

    const controller = new AbortController();

    async function loadAlbumMetadata() {
      try {
        const nextMetadata = await fetchAlbumMetadata(album.title, controller.signal);

        if (!controller.signal.aborted) {
          setMetadata(nextMetadata);
        }
      } catch (error) {
        if (error.name !== "AbortError") {
          setMetadata(null);
        }
      }
    }

    loadAlbumMetadata();

    return () => controller.abort();
  }, [album.coverUrl, album.title]);

  return (
    <div className="sideb-page sideb-subpage sideb-current-page">
      <SideBNav activePath="/current" navigate={navigate} showAdminLink={showAdminLink} />

      <main className="sideb-subpage-main">
        <section className="current-album-hero" aria-labelledby="current-album-title">
          <div className="current-album-copy">
            <p className="sideb-kicker">Current listen</p>
            <h1 id="current-album-title">{album.title}</h1>
            <p>{album.artist}</p>
            <span>{album.note || "Current club listen"}</span>

            <div className="sideb-actions current-album-actions">
              <button
                className="sideb-button sideb-button-primary"
                type="button"
                onClick={() => navigate("/vote")}
              >
                Vote next
              </button>
              <button
                className="sideb-button sideb-button-ghost"
                type="button"
                onClick={() => navigate("/events")}
              >
                Meeting details
              </button>
            </div>
          </div>

          <figure className="current-album-cover">
            {coverUrl ? (
              <img src={coverUrl} alt={`${album.title} album cover`} />
            ) : (
              <div className="current-generated-cover" aria-hidden="true">
                <span>{album.title.slice(0, 2)}</span>
              </div>
            )}
            <figcaption>{album.artist}</figcaption>
          </figure>
        </section>

        <section className="current-album-grid">
          <article className="sideb-panel current-session-card">
            <p className="sideb-kicker">Next session</p>
            <h2>{formatSessionDetails(nextSession)}</h2>
            <p>{nextSession?.location || "Hayden Library C8"}</p>
            <span>{currentPoll.status}</span>
          </article>

          <article className="sideb-panel current-links-card">
            <p className="sideb-kicker">Listen</p>
            <div className="current-listen-links">
              {searchLinks.map((link) => (
                <a href={link.href} key={link.label} rel="noreferrer" target="_blank">
                  {link.label}
                </a>
              ))}
            </div>
          </article>
        </section>

        <section className="sideb-panel current-prompts-panel" aria-labelledby="prompts-heading">
          <div className="sideb-section-heading">
            <div>
              <p>For discussion</p>
              <h2 id="prompts-heading">Bring one thought. That is enough.</h2>
            </div>
          </div>

          <div className="current-prompt-grid">
            {listeningPrompts.map((prompt, index) => (
              <article className="current-prompt-card" key={prompt}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p>{prompt}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export default CurrentAlbum;
