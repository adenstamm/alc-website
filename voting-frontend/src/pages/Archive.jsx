import { useMemo, useState } from "react";

import { getAlbumArchive } from "../lib/recordShelf";

function Archive() {
  const [searchTerm, setSearchTerm] = useState("");
  const archiveAlbums = useMemo(() => getAlbumArchive().toReversed(), []);
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const visibleAlbums = useMemo(() => {
    if (!normalizedSearch) {
      return archiveAlbums;
    }

    return archiveAlbums.filter((album) =>
      `${album.title} ${album.artist}`.toLowerCase().includes(normalizedSearch),
    );
  }, [archiveAlbums, normalizedSearch]);
  const recentAlbums = visibleAlbums.slice(0, 12);
  const olderAlbums = visibleAlbums.slice(12);

  function renderAlbumCard(album) {
    return (
      <article className="archive-card" key={album.id}>
        <span className="archive-card-number">
          Session {String(album.sessionNumber).padStart(3, "0")}
        </span>
        <h3>{album.title}</h3>
        {album.artist ? <p>{album.artist}</p> : null}
      </article>
    );
  }

  return (
    <div className="sideb-page sideb-subpage sideb-archive-page">
      <main className="sideb-subpage-main" id="main-content" tabIndex="-1">
        <section className="sideb-page-hero sideb-page-hero-split" aria-labelledby="archive-title">
          <div>
            <p className="sideb-kicker">Archive</p>
            <h1 id="archive-title">Every record already pulled from the shelf.</h1>
            <p>
              A living history of Album Listening Club picks, newest listens first.
            </p>
          </div>

          <aside className="sideb-next-card archive-count-card" aria-label="Archive count">
            <span>Total listens</span>
            <strong>{archiveAlbums.length}</strong>
            <p>Albums retired from future nominations.</p>
          </aside>
        </section>

        <section className="sideb-panel archive-search-panel" aria-label="Search archive">
          <div className="field-group">
            <label htmlFor="archiveSearch">Search archive</label>
            <input
              id="archiveSearch"
              aria-controls="archive-results"
              type="search"
              placeholder="Album or artist"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <p aria-live="polite">
            Showing {visibleAlbums.length} of {archiveAlbums.length} archived albums.
          </p>
        </section>

        <div id="archive-results">
        {visibleAlbums.length ? (
          <>
            <section className="sideb-panel archive-section" aria-labelledby="recent-archive-heading">
              <div className="sideb-section-heading">
                <div>
                  <p>Newest</p>
                  <h2 id="recent-archive-heading">Recent archive entries.</h2>
                </div>
              </div>

              <div className="archive-grid">
                {recentAlbums.map(renderAlbumCard)}
              </div>
            </section>

            {olderAlbums.length ? (
              <section className="sideb-panel archive-section" aria-labelledby="older-archive-heading">
                <div className="sideb-section-heading">
                  <div>
                    <p>History</p>
                    <h2 id="older-archive-heading">Earlier listens.</h2>
                  </div>
                </div>

                <div className="archive-grid archive-grid-compact">
                  {olderAlbums.map(renderAlbumCard)}
                </div>
              </section>
            ) : null}
          </>
        ) : (
          <section className="sideb-panel archive-empty" aria-live="polite">
            <p className="sideb-kicker">No match</p>
            <h2>No archived albums match that search.</h2>
            <p>Try another album title or artist.</p>
          </section>
        )}
        </div>
      </main>
    </div>
  );
}

export default Archive;
