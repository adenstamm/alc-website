import { formatTimestamp } from "../../lib/ballotState.js";

export default function BallotConfirmation({
  candidateOptions,
  poll,
  storedBallot,
}) {
  if (!storedBallot) {
    return null;
  }

  return (
    <div className="confirmation-card">
      <p className="eyebrow">Submission saved</p>
      <h3>Your ballot is locked for this phase.</h3>
      <p>
        The server has a saved submission for your account in this voting phase.
      </p>

      <div className="saved-ballot">
        {storedBallot.nomination ? (
          <>
            <span>Nomination</span>
            <strong>{storedBallot.nomination.albumTitle}</strong>
            <p>{storedBallot.nomination.artistName}</p>
          </>
        ) : (
          <>
            <span>
              {poll.phase === "final" ? "Ranked ballot" : "Selected albums"}
            </span>
            {storedBallot.candidateIds.map((candidateId, index) => {
              const candidate = candidateOptions.find(
                (option) => option.id === candidateId,
              );

              return candidate ? (
                <p key={candidateId}>
                  {poll.phase === "final" ? `${index + 1}. ` : ""}
                  {candidate.title} - {candidate.artist}
                </p>
              ) : null;
            })}
          </>
        )}
      </div>

      <p className="timestamp">
        Saved {formatTimestamp(storedBallot.submittedAt)}
      </p>
    </div>
  );
}
