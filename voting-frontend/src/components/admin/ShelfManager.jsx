import useShelfMetadata from "../../hooks/useShelfMetadata";
import ShelfArtwork from "../ShelfArtwork";

export default function ShelfManager({
  canManage,
  cancelShelfCuration,
  error,
  getSubmitLabel,
  handleShelfArtistChange,
  handleShelfArtistSave,
  handleShelfCoverClear,
  handleShelfCoverFileChange,
  handleShelfCoverUpload,
  isLoadingShelfCovers,
  isSavingShelfCover,
  isShelfCurating,
  message,
  moveShelfAlbum,
  saveShelfOrder,
  selectedShelfAlbumId,
  setIsShelfCurating,
  setSelectedShelfAlbumId,
  shelfAlbums,
  shelfArtistDrafts,
  shelfCoverFile,
  shelfCoverInputRef,
  shelfCoverOverrides,
  successfulAction,
}) {
  const metadata = useShelfMetadata(shelfAlbums, shelfCoverOverrides);
  if (!canManage) {
    return null;
  }

  return (
    <article
      className="surface-card vote-form-card admin-shelf-panel"
      id="admin-shelf"
    >
      <div className="form-header">
        <div>
          <span className="phase-pill phase-final">Auto queue</span>
          <h2>Five records in rotation</h2>
        </div>
        <p>
          The newest archived album enters at 01. Position 05 is ejected
          automatically.
        </p>
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="form-success" role="status">
          {message}
        </p>
      ) : null}

      <div className="admin-shelf-modebar">
        <div>
          <span className="admin-status-light" aria-hidden="true" />
          <strong>
            {isShelfCurating
              ? "Manual curation active"
              : "Automatic FIFO active"}
          </strong>
        </div>
        {isShelfCurating ? (
          <div className="admin-action-row">
            <button
              className="button button-secondary"
              type="button"
              disabled={isSavingShelfCover}
              onClick={cancelShelfCuration}
            >
              Cancel
            </button>
            <button
              className={`button button-primary ${successfulAction === "shelf-order" ? "is-success" : ""}`}
              type="button"
              disabled={isSavingShelfCover}
              onClick={saveShelfOrder}
            >
              {getSubmitLabel(
                "shelf-order",
                "Save shelf order",
                "Saving...",
                isSavingShelfCover,
              )}
            </button>
          </div>
        ) : (
          <button
            className="button button-secondary"
            type="button"
            onClick={() => setIsShelfCurating(true)}
          >
            Curate shelf
          </button>
        )}
      </div>

      <div className="admin-shelf-grid">
        {shelfAlbums.map((album, index) => {
          const override = shelfCoverOverrides[album.id];

          return (
            <article
              className={`admin-shelf-card ${isShelfCurating ? "is-curating" : ""}`}
              key={album.id}
            >
              <span className="admin-shelf-position">
                {String(index + 1).padStart(2, "0")}
              </span>
              <ShelfArtwork
                coverUrl={metadata[album.id]?.coverUrl}
                fallbackCoverUrl={metadata[album.id]?.fallbackCoverUrl}
                alt={`${album.title} cover`}
                decoding="async"
                referrerPolicy="no-referrer"
                fallback={
                  <span
                    className="cozy-album-cover cozy-generated-cover"
                    aria-hidden="true"
                  >
                    <span>{album.title.slice(0, 2)}</span>
                  </span>
                }
              />
              <div>
                <strong>{album.title}</strong>
                <p>
                  {metadata[album.id]?.artist ||
                    album.artist ||
                    "Artist uses automatic lookup"}
                </p>
                <span className="admin-shelf-source">
                  {override?.cover_url ? "Custom artwork" : "Automatic artwork"}
                </span>
              </div>
              {isShelfCurating ? (
                <div className="admin-shelf-curation-controls">
                  <div
                    className="admin-shelf-move-controls"
                    aria-label={`Reorder ${album.title}`}
                  >
                    <button
                      aria-label={`Move ${album.title} up`}
                      disabled={index === 0}
                      type="button"
                      onClick={() => moveShelfAlbum(album.id, -1)}
                    >
                      Up
                    </button>
                    <button
                      aria-label={`Move ${album.title} down`}
                      disabled={index === shelfAlbums.length - 1}
                      type="button"
                      onClick={() => moveShelfAlbum(album.id, 1)}
                    >
                      Down
                    </button>
                  </div>
                  <div className="field-group admin-shelf-artist-field">
                    <label htmlFor={`shelfArtist-${album.id}`}>
                      Artist override
                    </label>
                    <input
                      id={`shelfArtist-${album.id}`}
                      type="text"
                      placeholder={album.artist || "Manual artist name"}
                      value={shelfArtistDrafts[album.id] || ""}
                      onChange={(event) =>
                        handleShelfArtistChange(album.id, event.target.value)
                      }
                    />
                  </div>
                  <div className="admin-action-row">
                    <button
                      aria-label={`Save artist for ${album.title}`}
                      className="button button-secondary"
                      type="button"
                      disabled={isSavingShelfCover}
                      onClick={() => handleShelfArtistSave(album)}
                    >
                      Save artist
                    </button>
                    <button
                      aria-label={`Clear cover and artist overrides for ${album.title}`}
                      className="button button-secondary"
                      type="button"
                      disabled={!override || isSavingShelfCover}
                      onClick={() => handleShelfCoverClear(album)}
                    >
                      Reset
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {isShelfCurating ? (
        <form
          className="vote-form admin-shelf-upload"
          onSubmit={handleShelfCoverUpload}
        >
          <div className="field-group">
            <label htmlFor="shelfAlbum">Album to replace</label>
            <select
              id="shelfAlbum"
              value={selectedShelfAlbumId}
              onChange={(event) => setSelectedShelfAlbumId(event.target.value)}
            >
              {shelfAlbums.map((album) => (
                <option key={album.id} value={album.id}>
                  {album.title}
                </option>
              ))}
            </select>
          </div>

          <div className="field-group">
            <span className="admin-field-label">Replacement image</span>
            <input
              ref={shelfCoverInputRef}
              className="admin-file-input"
              id="shelfCover"
              type="file"
              accept="image/*"
              onChange={handleShelfCoverFileChange}
            />
            <label className="admin-file-trigger" htmlFor="shelfCover">
              <span>Upload cover</span>
              <small>{shelfCoverFile?.name || "Select an image"}</small>
            </label>
          </div>

          <button
            className={`button button-primary ${successfulAction === "shelf-cover" ? "is-success" : ""}`}
            type="submit"
            disabled={isSavingShelfCover}
          >
            {getSubmitLabel(
              "shelf-cover",
              "Upload shelf cover",
              "Uploading...",
              isSavingShelfCover,
            )}
          </button>
        </form>
      ) : null}

      {isLoadingShelfCovers ? (
        <p className="helper-note">Loading custom shelf covers...</p>
      ) : null}
    </article>
  );
}
