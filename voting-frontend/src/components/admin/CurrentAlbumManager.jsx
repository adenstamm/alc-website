import { ALBUM_COVER_ACCEPT } from "../../lib/albumCoverUpload";

export default function CurrentAlbumManager({
  canManage,
  currentAlbumCoverFile,
  currentAlbumCoverInputRef,
  currentAlbumCoverPreviewUrl,
  currentAlbumError,
  currentAlbumForm,
  currentAlbumMessage,
  getSubmitLabel,
  handleCurrentAlbumChange,
  handleCurrentAlbumCoverChange,
  handleCurrentAlbumCoverClear,
  handleCurrentAlbumSave,
  isSavingContent,
  successfulAction,
}) {
  if (!canManage) {
    return null;
  }

  return (
    <article
      className="surface-card vote-form-card admin-content-panel"
      id="admin-current-album"
    >
      <div className="form-header">
        <div>
          <span className="phase-pill phase-primary">Home</span>
          <h2>Update current album</h2>
        </div>
        <p>
          This controls the album card on the home page without creating a new
          voting cycle.
        </p>
      </div>

      {currentAlbumError ? (
        <p className="form-error" role="alert">
          {currentAlbumError}
        </p>
      ) : null}
      {currentAlbumMessage ? (
        <p className="form-success" role="status">
          {currentAlbumMessage}
        </p>
      ) : null}

      <form className="vote-form" onSubmit={handleCurrentAlbumSave}>
        <div className="admin-create-grid">
          <div className="field-group">
            <label htmlFor="currentAlbumTitle">Album title</label>
            <input
              id="currentAlbumTitle"
              name="title"
              type="text"
              value={currentAlbumForm.title}
              onChange={handleCurrentAlbumChange}
            />
          </div>

          <div className="field-group">
            <label htmlFor="currentAlbumArtist">Artist</label>
            <input
              id="currentAlbumArtist"
              name="artist"
              type="text"
              value={currentAlbumForm.artist}
              onChange={handleCurrentAlbumChange}
            />
          </div>
        </div>

        <div className="admin-current-cover-grid">
          <div className="field-group">
            <span className="admin-field-label">Album cover image</span>
            <input
              ref={currentAlbumCoverInputRef}
              className="admin-file-input"
              id="currentAlbumCover"
              type="file"
              accept={ALBUM_COVER_ACCEPT}
              aria-describedby="currentAlbumCoverHelp"
              disabled={isSavingContent}
              onChange={handleCurrentAlbumCoverChange}
            />
            <label className="admin-file-trigger" htmlFor="currentAlbumCover">
              <span>Upload cover</span>
              <small>{currentAlbumCoverFile?.name || "JPG, PNG or WebP"}</small>
            </label>
            <small className="helper-note" id="currentAlbumCoverHelp">
              JPG, PNG, or WebP. Maximum 5 MB. Leave empty to keep the current
              image.
            </small>
            {currentAlbumCoverFile || currentAlbumForm.coverUrl ? (
              <button
                className="button button-secondary admin-current-cover-clear"
                type="button"
                disabled={isSavingContent}
                onClick={handleCurrentAlbumCoverClear}
              >
                Use automatic cover
              </button>
            ) : null}
          </div>

          <figure className="admin-current-cover-preview">
            {currentAlbumCoverPreviewUrl || currentAlbumForm.coverUrl ? (
              <img
                src={currentAlbumCoverPreviewUrl || currentAlbumForm.coverUrl}
                alt={`${currentAlbumForm.title || "Current album"} cover preview`}
              />
            ) : (
              <span
                className="cozy-album-cover cozy-generated-cover"
                aria-hidden="true"
              >
                <span>{(currentAlbumForm.title || "AL").slice(0, 2)}</span>
              </span>
            )}
            <figcaption>
              {currentAlbumCoverFile
                ? `Ready to upload: ${currentAlbumCoverFile.name}`
                : currentAlbumForm.coverUrl
                  ? "Current uploaded cover"
                  : "Automatic artwork will be used"}
            </figcaption>
          </figure>
        </div>

        <div className="field-group">
          <label htmlFor="currentAlbumNote">Short label</label>
          <input
            id="currentAlbumNote"
            name="note"
            type="text"
            value={currentAlbumForm.note}
            onChange={handleCurrentAlbumChange}
          />
        </div>

        <button
          className={`button button-primary ${successfulAction === "current-album" ? "is-success" : ""}`}
          type="submit"
          disabled={isSavingContent}
        >
          {getSubmitLabel(
            "current-album",
            "Save current album",
            "Saving...",
            isSavingContent,
          )}
        </button>
      </form>
    </article>
  );
}
