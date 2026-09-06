export default function AlbumRating({
  canVote,
  currentAlbumRating,
  currentAlbumRatingError,
  handleCurrentAlbumRatingSubmit,
  isLoadingCurrentAlbumRating,
  isSubmittingCurrentAlbumRating,
  poll,
  pollError,
  setCurrentAlbumRating,
  setCurrentAlbumRatingError,
  storedCurrentAlbumRating,
}) {
  if (poll.phase !== "nominations" || !canVote || pollError) {
    return null;
  }

  const albumTitle = poll.albumOfWeek?.title || "Current album";
  const albumArtist = poll.albumOfWeek?.artist || "Artist not listed";

  return (
    <section
      className="current-album-rating"
      aria-labelledby="current-album-rating-title"
    >
      <div className="current-album-rating-heading">
        <div>
          <p className="eyebrow">The album we just heard</p>
          <h3 id="current-album-rating-title">Rate {albumTitle}</h3>
          <p>{albumArtist}</p>
        </div>
        <span>1–10</span>
      </div>

      {isLoadingCurrentAlbumRating ? (
        <p className="helper-note" role="status">
          Checking for your saved rating…
        </p>
      ) : storedCurrentAlbumRating ? (
        <div className="current-album-rating-saved" role="status">
          <span>Your rating</span>
          <strong>
            {storedCurrentAlbumRating.rating}
            <small>/10</small>
          </strong>
          <p>Saved for this week. Ratings lock after submission.</p>
        </div>
      ) : (
        <form
          className="current-album-rating-form"
          onSubmit={handleCurrentAlbumRatingSubmit}
        >
          <fieldset disabled={isSubmittingCurrentAlbumRating}>
            <legend>Choose one whole-number rating</legend>
            <div className="rating-scale">
              {Array.from({ length: 10 }, (_, index) => index + 1).map(
                (rating) => (
                  <label
                    className={`rating-scale-option ${currentAlbumRating === rating ? "is-selected" : ""}`}
                    key={rating}
                  >
                    <input
                      name="currentAlbumRating"
                      type="radio"
                      value={rating}
                      checked={currentAlbumRating === rating}
                      onChange={() => {
                        setCurrentAlbumRating(rating);
                        setCurrentAlbumRatingError(null);
                      }}
                    />
                    <span>{rating}</span>
                  </label>
                ),
              )}
            </div>
          </fieldset>
          <p className="helper-note">
            This is separate from the album you nominate next.
          </p>
          {currentAlbumRatingError ? (
            <p className="form-error" role="alert">
              {currentAlbumRatingError}
            </p>
          ) : null}
          <button
            className="button button-secondary"
            type="submit"
            disabled={isSubmittingCurrentAlbumRating}
          >
            {isSubmittingCurrentAlbumRating
              ? "Saving rating…"
              : "Submit album rating"}
          </button>
        </form>
      )}
    </section>
  );
}
