import { useEffect, useState } from "react";

import { phaseContent } from "../data/clubContent";

function getStorageKey(pollId) {
  return `alc-ballot-${pollId}`;
}

function readStoredBallot(pollId) {
  try {
    const storedBallot = window.localStorage.getItem(getStorageKey(pollId));
    return storedBallot ? JSON.parse(storedBallot) : null;
  } catch {
    return null;
  }
}

function createDefaultFormState(poll) {
  if (poll.phase === "nominations") {
    return {
      albumTitle: "",
      artistName: "",
    };
  }

  return {
    candidateId: poll.candidates[0]?.id ?? "",
  };
}

function formatPhaseLabel(phase) {
  return phase.charAt(0).toUpperCase() + phase.slice(1);
}

function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Poll({ navigate, poll }) {
  const [formState, setFormState] = useState(() => createDefaultFormState(poll));
  const [storedBallot, setStoredBallot] = useState(() => readStoredBallot(poll.id));

  const phaseDetails = phaseContent[poll.phase];
  const hasSubmitted = storedBallot?.pollId === poll.id;
  const selectedCandidate = poll.candidates.find(
    (candidate) => candidate.id === storedBallot?.candidateId,
  );

  useEffect(() => {
    setFormState(createDefaultFormState(poll));
    setStoredBallot(readStoredBallot(poll.id));
  }, [poll]);

  function handleFieldChange(event) {
    const { name, value } = event.target;

    setFormState((currentState) => ({
      ...currentState,
      [name]: value,
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (hasSubmitted) {
      return;
    }

    let nextBallot;

    if (poll.phase === "nominations") {
      const albumTitle = formState.albumTitle.trim();
      const artistName = formState.artistName.trim();

      if (!albumTitle || !artistName) {
        return;
      }

      nextBallot = {
        pollId: poll.id,
        phase: poll.phase,
        submittedAt: new Date().toISOString(),
        nomination: {
          albumTitle,
          artistName,
        },
      };
    } else {
      if (!formState.candidateId) {
        return;
      }

      nextBallot = {
        pollId: poll.id,
        phase: poll.phase,
        submittedAt: new Date().toISOString(),
        candidateId: formState.candidateId,
      };
    }

    window.localStorage.setItem(getStorageKey(poll.id), JSON.stringify(nextBallot));
    setStoredBallot(nextBallot);
  }

  function renderFormBody() {
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

    return (
      <div className="candidate-list" role="radiogroup" aria-label="Album choices">
        {poll.candidates.map((candidate) => (
          <label
            key={candidate.id}
            className={`candidate-option ${
              formState.candidateId === candidate.id ? "is-selected" : ""
            }`}
          >
            <input
              type="radio"
              name="candidateId"
              value={candidate.id}
              checked={formState.candidateId === candidate.id}
              onChange={handleFieldChange}
            />

            <div>
              <strong>{candidate.title}</strong>
              <p className="candidate-artist">{candidate.artist}</p>
              <p className="candidate-note">{candidate.note}</p>
            </div>
          </label>
        ))}
      </div>
    );
  }

  function renderConfirmation() {
    if (!storedBallot) {
      return null;
    }

    return (
      <div className="confirmation-card">
        <p className="eyebrow">Submission saved</p>
        <h3>Your ballot is locked for this poll.</h3>
        <p>
          This browser already has a saved submission for <strong>{poll.id}</strong>.
          Refreshing the page won&apos;t remove it.
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
              <span>Selected option</span>
              <strong>{selectedCandidate?.title}</strong>
              <p>{selectedCandidate?.artist}</p>
            </>
          )}
        </div>

        <p className="timestamp">Saved {formatTimestamp(storedBallot.submittedAt)}</p>
      </div>
    );
  }

  return (
    <div className="poll-page">
      <section className="page-header surface-card">
        <div>
          <p className="eyebrow">Voting page</p>
          <h1 className="page-title">{poll.question}</h1>
          <p className="page-intro">{poll.description}</p>
        </div>

        <button className="button button-secondary" onClick={() => navigate("/")}>
          Back to home
        </button>
      </section>

      <section className="vote-layout">
        <article className="vote-form-card surface-card">
          <div className="form-header">
            <div>
              <span className={`phase-pill phase-${poll.phase}`}>{phaseDetails.label}</span>
              <h2>{phaseDetails.title}</h2>
            </div>
            <p>{phaseDetails.description}</p>
          </div>

          {hasSubmitted ? (
            renderConfirmation()
          ) : (
            <form className="vote-form" onSubmit={handleSubmit}>
              {renderFormBody()}

              <p className="helper-note">
                One submission is saved per browser for each poll id.
              </p>

              <button className="button button-primary" type="submit">
                {phaseDetails.buttonLabel}
              </button>
            </form>
          )}
        </article>

        <aside className="poll-sidebar">
          <article className="surface-card sidebar-card">
            <p className="eyebrow">Current listen</p>
            <h2 className="sidebar-title">{poll.albumOfWeek.title}</h2>
            <p className="sidebar-copy">{poll.albumOfWeek.artist}</p>
          </article>

          <article className="surface-card sidebar-card">
            <p className="eyebrow">Poll details</p>
            <dl className="meta-list compact">
              <div>
                <dt>Phase</dt>
                <dd>{formatPhaseLabel(poll.phase)}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{poll.status}</dd>
              </div>
              <div>
                <dt>Current poll id</dt>
                <dd>{poll.id}</dd>
              </div>
            </dl>
          </article>
        </aside>
      </section>
    </div>
  );
}

export default Poll;
