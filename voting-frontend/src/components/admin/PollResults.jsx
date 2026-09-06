import {
  formatAdminTimestamp,
  formatCount,
  formatFinalCountdown,
  formatPhaseLabel,
} from "../../lib/adminPresentation";

export default function PollResults({
  activePhaseAction,
  canAdvanceToFinal,
  canManage,
  clockNow,
  currentAlbumRatingAverage,
  currentAlbumRatingCount,
  currentBallotCount,
  finalRows,
  finalVotingState,
  getSubmitLabel,
  irvRounds,
  irvTie,
  irvTieCandidateIds,
  irvWinner,
  isLoadingResults,
  isSavingPhase,
  lastResultsRefreshedAt,
  loadResults,
  nominationRows,
  phaseFeedback,
  poll,
  pollError,
  primaryRows,
  ratingAlbum,
  requestAdvanceToFinal,
  requestAdvanceToPrimary,
  requestCloseFinalVoting,
  requestRemovePrimaryCandidate,
  requestReopenEmptyFinal,
  requestResolveIrvTie,
  requiredFinalistCount,
  results,
  runAdminAction,
  selectedCount,
  selectedFinalistIds,
  selectedTieCandidateId,
  setSelectedTieCandidateId,
  sortedPrimaryRows,
  toggleFinalist,
}) {
  if (!canManage) {
    return null;
  }

  return (
    <article
      className="surface-card vote-form-card admin-results-panel"
      id="admin-results"
    >
      <div className="form-header">
        <div>
          <span className={`phase-pill phase-${poll.phase}`}>{poll.phase}</span>
          <h2>Current poll results</h2>
        </div>
        <p>{poll.status}</p>
      </div>

      <section aria-label="Live poll health" className="admin-poll-health">
        <div className="admin-poll-health-metrics">
          <div>
            <span>{formatPhaseLabel(poll.phase)} ballots</span>
            <strong>{currentBallotCount ?? "—"}</strong>
            <small>
              {currentBallotCount === null
                ? "Server count not reported"
                : "Unique members submitted"}
            </small>
          </div>
          <div>
            <span>Results freshness</span>
            <strong>
              {lastResultsRefreshedAt
                ? formatAdminTimestamp(lastResultsRefreshedAt)
                : "Not loaded"}
            </strong>
            <small>Last successful server refresh</small>
          </div>
          {poll.phase === "final" ? (
            <div className={finalVotingState.isClosed ? "is-closed" : ""}>
              <span>Final cutoff</span>
              <strong>
                {finalVotingState.isClosed
                  ? "Closed"
                  : formatFinalCountdown(finalVotingState.closesAt, clockNow)}
              </strong>
              <small>
                {finalVotingState.isAvailable
                  ? `${finalVotingState.isClosed ? "Closed" : "Closes"} ${formatAdminTimestamp(finalVotingState.closedAt || finalVotingState.closesAt, { includeDate: true })}`
                  : "Timing fields are not installed"}
              </small>
            </div>
          ) : null}
        </div>
        <div className="admin-poll-health-actions">
          <button
            className="button button-secondary"
            type="button"
            disabled={isLoadingResults}
            onClick={loadResults}
          >
            {isLoadingResults ? "Refreshing…" : "Refresh live results"}
          </button>
          {poll.phase === "final" &&
          finalVotingState.isAvailable &&
          !finalVotingState.isClosed ? (
            <button
              className="button button-danger"
              type="button"
              disabled={isSavingPhase}
              onClick={requestCloseFinalVoting}
            >
              Close final now
            </button>
          ) : null}
          {poll.phase === "final" &&
          finalVotingState.isClosed &&
          currentBallotCount === 0 &&
          !poll.winnerPublishedAt ? (
            <button
              className="button button-secondary"
              type="button"
              disabled={isSavingPhase}
              onClick={requestReopenEmptyFinal}
            >
              Reopen empty final
            </button>
          ) : null}
        </div>
      </section>

      {pollError ? (
        <p className="form-error" role="alert">
          {pollError}
        </p>
      ) : null}
      {phaseFeedback ? (
        <p
          className={
            phaseFeedback.type === "error" ? "form-error" : "form-success"
          }
          role={phaseFeedback.type === "error" ? "alert" : "status"}
        >
          {phaseFeedback.message}
        </p>
      ) : null}
      {isLoadingResults ? (
        <p className="helper-note">Loading live results...</p>
      ) : null}

      {results ? (
        <section
          className="admin-rating-summary"
          aria-labelledby="admin-rating-summary-title"
        >
          <div>
            <span>Current album rating</span>
            <h3 id="admin-rating-summary-title">
              {ratingAlbum?.title || "Current album"}
            </h3>
            <p>
              {currentAlbumRatingCount
                ? formatCount(currentAlbumRatingCount, "member rating")
                : "No member ratings yet."}
            </p>
          </div>
          <strong>
            {currentAlbumRatingAverage || "—"}
            <small>/10</small>
          </strong>
        </section>
      ) : null}

      {poll.phase === "nominations" ? (
        <>
          <div className="admin-result-list">
            {nominationRows.length ? (
              nominationRows.map((candidate) => (
                <article className="admin-result-row" key={candidate.id}>
                  <div>
                    <strong>{candidate.title}</strong>
                    <p>{candidate.artist}</p>
                  </div>
                  <span>
                    {formatCount(candidate.nominationCount || 0, "nomination")}
                  </span>
                </article>
              ))
            ) : (
              <p className="helper-note">
                No nominations have been submitted yet.
              </p>
            )}
          </div>
          <button
            className="button button-primary"
            type="button"
            disabled={isSavingPhase || nominationRows.length === 0}
            onClick={requestAdvanceToPrimary}
          >
            {getSubmitLabel(
              "advance_to_primary",
              "Move to primary",
              "Moving to primary...",
              activePhaseAction === "advance_to_primary",
            )}
          </button>
        </>
      ) : null}

      {poll.phase === "primary" ? (
        <>
          <p className="helper-note">
            {requiredFinalistCount < 1
              ? "Add at least one album before moving to final voting."
              : primaryRows.length < 5
                ? `Select all ${requiredFinalistCount} available ${requiredFinalistCount === 1 ? "album" : "albums"} to enable final voting.`
                : "Select exactly five albums for final voting."}
            {requiredFinalistCount > 0
              ? ` Selected ${selectedCount}/${requiredFinalistCount}.`
              : ""}
          </p>
          <div className="admin-result-list">
            {sortedPrimaryRows.map((candidate) => {
              const isSelected = selectedFinalistIds.includes(candidate.id);

              return (
                <div className="admin-primary-candidate-row" key={candidate.id}>
                  <label
                    className={`admin-result-row candidate-option ${isSelected ? "is-selected" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={
                        !isSelected && selectedCount >= requiredFinalistCount
                      }
                      onChange={() => toggleFinalist(candidate.id)}
                    />
                    <div>
                      <strong>{candidate.title}</strong>
                      <p>{candidate.artist}</p>
                    </div>
                    <span>
                      {formatCount(candidate.primaryVotes || 0, "vote")}
                    </span>
                  </label>
                  <button
                    aria-label={`Remove ${candidate.title} from primary voting`}
                    className="admin-candidate-remove"
                    disabled={isSavingPhase}
                    type="button"
                    onClick={() => requestRemovePrimaryCandidate(candidate)}
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
          <div className="admin-action-row">
            <button
              className="button button-secondary"
              type="button"
              disabled={isSavingPhase || !canAdvanceToFinal}
              onClick={() =>
                runAdminAction("save_finalists", "Finalists saved.", {
                  candidate_ids: selectedFinalistIds,
                })
              }
            >
              {getSubmitLabel(
                "save_finalists",
                "Save finalists",
                "Saving finalists...",
                activePhaseAction === "save_finalists",
              )}
            </button>
            <button
              className="button button-primary"
              type="button"
              disabled={isSavingPhase || !canAdvanceToFinal}
              onClick={requestAdvanceToFinal}
            >
              {getSubmitLabel(
                "advance_to_final",
                "Move to final",
                "Moving to final...",
                activePhaseAction === "advance_to_final",
              )}
            </button>
          </div>
        </>
      ) : null}

      {poll.phase === "final" ? (
        <>
          {irvWinner ? (
            <div className="confirmation-card">
              <p className="eyebrow">
                {finalVotingState.isClosed
                  ? "IRV winner"
                  : "Current IRV leader"}
              </p>
              <h3>{irvWinner.title}</h3>
              <p>{irvWinner.artist}</p>
              {!finalVotingState.isClosed ? (
                <p>Provisional until final voting closes.</p>
              ) : null}
            </div>
          ) : null}
          {irvTie ? (
            <section
              aria-labelledby="admin-tie-break-title"
              className="admin-tie-break"
            >
              <div>
                <span className="admin-terminal-label">
                  Manual IRV tie-break
                </span>
                <h3 id="admin-tie-break-title">
                  Choose one album to eliminate
                </h3>
                <p role="alert">
                  Round {irvTie.round} has{" "}
                  {formatCount(irvTieCandidateIds.length, "candidate")} tied for
                  elimination.
                </p>
              </div>
              <fieldset
                disabled={isSavingPhase || !finalVotingState.isAvailable}
              >
                <legend>Select the admin tie-break decision</legend>
                {irvTieCandidateIds.map((candidateId) => {
                  const candidate = finalRows.find(
                    (row) => row.id === candidateId,
                  );

                  return (
                    <label className="admin-tie-option" key={candidateId}>
                      <input
                        type="radio"
                        name="irv-tie-candidate"
                        value={candidateId}
                        checked={selectedTieCandidateId === candidateId}
                        onChange={() => setSelectedTieCandidateId(candidateId)}
                      />
                      <span>
                        <strong>{candidate?.title || candidateId}</strong>
                        <small>
                          {candidate?.artist || "Artist not listed"}
                        </small>
                      </span>
                    </label>
                  );
                })}
              </fieldset>
              <p className="helper-note">
                {!finalVotingState.isAvailable
                  ? "The provisional tie-break migration must be installed before recording a decision."
                  : finalVotingState.isClosed
                    ? "Final voting is closed, so this decision will remain part of the official count."
                    : "This decision is provisional. The next accepted final ballot will clear it and recalculate the count."}
              </p>
              <button
                className="button button-danger"
                type="button"
                disabled={
                  isSavingPhase ||
                  !finalVotingState.isAvailable ||
                  !selectedTieCandidateId
                }
                onClick={requestResolveIrvTie}
              >
                {activePhaseAction === "resolve_irv_tie"
                  ? "Recording decision…"
                  : finalVotingState.isClosed
                    ? "Record elimination and continue"
                    : "Record provisional elimination"}
              </button>
            </section>
          ) : null}
          <div className="admin-result-list">
            {irvRounds.map((round) => (
              <article className="admin-irv-round" key={round.round}>
                <strong>Round {round.round}</strong>
                {round.tallies.map((tally) => {
                  const candidate = finalRows.find(
                    (row) => row.id === tally.candidateId,
                  );
                  return (
                    <p key={tally.candidateId}>
                      {candidate?.title || tally.candidateId}:{" "}
                      {formatCount(tally.votes, "vote")}
                    </p>
                  );
                })}
                {round.eliminatedCandidateId ? (
                  <span>
                    Eliminated:{" "}
                    {
                      finalRows.find(
                        (row) => row.id === round.eliminatedCandidateId,
                      )?.title
                    }
                  </span>
                ) : null}
              </article>
            ))}
          </div>
        </>
      ) : null}
    </article>
  );
}
