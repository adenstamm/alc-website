import { useEffect, useMemo, useRef, useState } from "react";

import { getVisibleArchiveAlbums } from "../lib/archiveCatalog";
import { getAlbumArchive } from "../lib/recordShelf";

const archiveSortLabels = {
  newest: "Newest first",
  oldest: "Oldest first",
  az: "A-Z",
};
const ARCHIVE_PAGE_SIZE = 36;

function Archive() {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortMode, setSortMode] = useState("newest");
  const [visibleCount, setVisibleCount] = useState(ARCHIVE_PAGE_SIZE);
  const searchInputRef = useRef(null);
  const archiveAlbums = useMemo(() => getAlbumArchive(), []);
  const visibleAlbums = useMemo(
    () => getVisibleArchiveAlbums(archiveAlbums, searchTerm, sortMode),
    [archiveAlbums, searchTerm, sortMode],
  );
  const renderedAlbums = visibleAlbums.slice(0, visibleCount);
  const remainingCount = Math.max(0, visibleAlbums.length - renderedAlbums.length);
  const hasSearchTerm = Boolean(searchTerm.trim());

  useEffect(() => {
    setVisibleCount(ARCHIVE_PAGE_SIZE);
  }, [searchTerm, sortMode]);

  function handleClearSearch() {
    setSearchTerm("");
    searchInputRef.current?.focus();
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

        <form
          className="archive-toolbar"
          onSubmit={(event) => event.preventDefault()}
          role="search"
        >
          <div className="field-group archive-search-field">
            <label htmlFor="archiveSearch">Search archive</label>
            <div className="archive-search-control">
              <input
                id="archiveSearch"
                aria-controls="archive-results"
                aria-describedby="archive-results-summary"
                autoComplete="off"
                placeholder="Album, artist, or session number"
                ref={searchInputRef}
                spellCheck="false"
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
              {searchTerm ? (
                <button
                  aria-label="Clear archive search"
                  className="archive-clear-button"
                  onClick={handleClearSearch}
                  type="button"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>

          <div className="field-group archive-sort-field">
            <label htmlFor="archiveSort">Sort by</label>
            <select
              id="archiveSort"
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value)}
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="az">A-Z</option>
            </select>
          </div>

          <p id="archive-results-summary" aria-live="polite" role="status">
            Showing {renderedAlbums.length} of {visibleAlbums.length}
            {hasSearchTerm ? " matching" : ""} archived albums.
          </p>
        </form>

        <div id="archive-results">
          {visibleAlbums.length ? (
            <section className="archive-catalog-section" aria-labelledby="archive-results-heading">
              <div className="archive-catalog-heading">
                <div>
                  <h2 id="archive-results-heading">
                    {hasSearchTerm ? "Matching records." : "Full listening history."}
                  </h2>
                </div>
                <span>{archiveSortLabels[sortMode]}</span>
              </div>

              <ul className="archive-catalog" aria-label="Archived albums">
                {renderedAlbums.map((album) => (
                  <li className="archive-catalog-row" key={album.id}>
                    <span className="archive-catalog-session">
                      Session {String(album.sessionNumber).padStart(3, "0")}
                    </span>
                    <span className="archive-catalog-title">{album.title}</span>
                    <span
                      className={album.artist
                        ? "archive-catalog-artist"
                        : "archive-catalog-artist archive-catalog-artist-missing"}
                    >
                      {album.artist || "Artist not listed"}
                    </span>
                  </li>
                ))}
              </ul>

              {remainingCount > 0 ? (
                <div className="archive-load-more">
                  <button
                    className="button button-secondary"
                    onClick={() => setVisibleCount((count) => count + ARCHIVE_PAGE_SIZE)}
                    type="button"
                  >
                    Load {Math.min(ARCHIVE_PAGE_SIZE, remainingCount)} more
                  </button>
                  <span>{remainingCount} records remain</span>
                </div>
              ) : null}
            </section>
          ) : (
            <section className="archive-empty" aria-labelledby="archive-empty-heading">
              <p className="sideb-kicker">No match</p>
              <h2 id="archive-empty-heading">No archived albums match that search.</h2>
              <p>Try another album title, artist, or session number.</p>
              <button className="button button-secondary" onClick={handleClearSearch} type="button">
                Clear search
              </button>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

export default Archive;
