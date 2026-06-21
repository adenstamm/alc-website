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

      <main className="sideb-subpage-main current-listen-main">
        <section className="current-record-room" aria-labelledby="current-album-title">
          <figure className="current-record-sleeve">
            <div className="current-cover-frame">
              {coverUrl ? (
                <img src={coverUrl} alt={`${album.title} album cover`} />
              ) : (
                <div className="current-generated-cover" aria-hidden="true">
                  <span>{album.title.slice(0, 2)}</span>
                </div>
              )}
            </div>
          </figure>

          <div className="current-record-copy">
            <p className="sideb-kicker">Current listen</p>
            <h1 id="current-album-title">{album.title}</h1>
            <p className="current-record-artist">{album.artist}</p>
            <p className="current-record-note">{album.note || "Current club listen"}</p>

            <dl className="current-record-meta">
              <div>
                <dt>Next session</dt>
                <dd>{formatSessionDetails(nextSession)}</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>{nextSession?.location || "Hayden Library C8"}</dd>
              </div>
            </dl>

            <div className="current-listen-block">
              <p className="sideb-kicker">Listen</p>
              <div className="current-listen-links">
                {searchLinks.map((link) => (
                  <a href={link.href} key={link.label} rel="noreferrer" target="_blank">
                    {link.label}
                  </a>
                ))}
              </div>
            </div>

            <div className="current-record-footer">
              <span>{currentPoll.status}</span>
              <button
                className="sideb-button sideb-button-ghost"
                type="button"
                onClick={() => navigate("/events")}
              >
                Meeting details
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default CurrentAlbum;
