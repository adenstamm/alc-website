import { formatNominationCount } from "../../lib/ballotState.js";

export default function BallotChoices({
  candidateOptions,
  formState,
  handleBallotReload,
  handleFieldChange,
  handlePrimaryToggle,
  handleRankMove,
  isRefreshingBallot,
  poll,
  rankedCandidates,
}) {
  if (poll.phase === "nominations") {
    return (
      <>
        <div className="field-group">
          <label htmlFor="albumTitle">Album title</label>
          <input
            id="albumTitle"
            name="albumTitle"
            type="text"
            placeholder="Heaven or Las Vegas"
            value={formState.albumTitle}
            onChange={handleFieldChange}
          />
        </div>

        <div className="field-group">
          <label htmlFor="artistName">Artist</label>
          <input
            id="artistName"
            name="artistName"
            type="text"
            placeholder="Cocteau Twins"
            value={formState.artistName}
            onChange={handleFieldChange}
          />
        </div>
      </>
    );
  }

  if (candidateOptions.length === 0) {
    return (
      <div className="confirmation-card ballot-recovery" role="status">
        <p className="eyebrow">Ballot didn’t finish loading</p>
        <h3>Your album choices are temporarily missing.</h3>
        <p>
          Your account is still signed in. Reload the ballot to request the
          choices again.
        </p>
        <div className="ballot-recovery-actions">
          <button
            className="button button-secondary"
            type="button"
            disabled={isRefreshingBallot}
            onClick={handleBallotReload}
          >
            {isRefreshingBallot ? "Reloading ballot…" : "Reload ballot"}
          </button>
        </div>
      </div>
    );
  }

  if (poll.phase === "primary") {
    return (
      <div
        className="candidate-list"
        role="group"
        aria-label="Primary album choices"
      >
        {candidateOptions.map((candidate) => {
          const isSelected = formState.selectedCandidateIds.includes(
            candidate.id,
          );

          return (
            <label
              key={candidate.id}
              className={`candidate-option ${isSelected ? "is-selected" : ""}`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                disabled={
                  !isSelected && formState.selectedCandidateIds.length >= 5
                }
                onChange={() => handlePrimaryToggle(candidate.id)}
              />

              <div>
                <strong>{candidate.title}</strong>
                <p className="candidate-artist">{candidate.artist}</p>
                <p className="candidate-note">
                  {formatNominationCount(candidate.nominationCount || 0)}
                </p>
              </div>
            </label>
          );
        })}
      </div>
    );
  }

  return (
    <div className="ranked-ballot" aria-label="Final IRV ranking">
      {rankedCandidates.map((candidate, index) => (
        <article className="ranked-choice" key={candidate.id}>
          <span>#{index + 1}</span>
          <div>
            <strong>{candidate.title}</strong>
            <p>{candidate.artist}</p>
          </div>
          <div className="ranked-actions">
            <button
              aria-label={`Move ${candidate.title} up one rank`}
              className="button button-secondary"
              type="button"
              disabled={index === 0}
              onClick={() => handleRankMove(candidate.id, -1)}
            >
              Up
            </button>
            <button
              aria-label={`Move ${candidate.title} down one rank`}
              className="button button-secondary"
              type="button"
              disabled={index === rankedCandidates.length - 1}
              onClick={() => handleRankMove(candidate.id, 1)}
            >
              Down
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
