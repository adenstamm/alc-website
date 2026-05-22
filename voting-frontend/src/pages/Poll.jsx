import { useEffect, useState } from "react";

import AuthPanel from "../components/AuthPanel";
import { phaseContent } from "../data/clubContent";
import {
  getNominationSubmissionError,
  validateNominationInput,
} from "../lib/nominationValidation";

function getStorageKey(pollId, phase) {
  return `alc-ballot-${pollId}-${phase}`;
}

function readStoredBallot(pollId, phase) {
  try {
    const storedBallot = window.localStorage.getItem(getStorageKey(pollId, phase));
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

function normalizeVoteRecord(vote) {
  if (!vote) {
    return null;
  }

  return {
    pollId: vote.poll_id,
    phase: vote.phase,
    submittedAt: vote.created_at,
    candidateId: vote.candidate_id,
    nomination:
      vote.album_title && vote.artist_name
        ? {
            albumTitle: vote.album_title,
            artistName: vote.artist_name,
          }
        : null,
  };
}

function formatNominationCount(count) {
  return `${count} nomination${count === 1 ? "" : "s"}`;
}

function mapPrimaryCandidate(candidate) {
  const nominationCount = Number(candidate.nomination_count);

  return {
    id: candidate.candidate_id,
    title: candidate.album_title,
    artist: candidate.artist_name,
    note: `${formatNominationCount(nominationCount)}. Tie-breaker: most recently nominated ${formatTimestamp(
      candidate.last_nominated_at,
    )}.`,
    nominationCount,
    lastNominatedAt: candidate.last_nominated_at,
    rank: candidate.candidate_rank,
    advancesToPrimary: candidate.advances_to_primary,
  };
}

function getAccountStatus(session, membership) {
  if (!session) {
    return "signed-out";
  }

  if (!session.user.email_confirmed_at) {
    return "unverified";
  }

  if (!membership || membership.status === "pending") {
    return "pending";
  }

  if (membership.status !== "approved") {
    return "blocked";
  }

  return "approved";
}

function Poll({
  authReady,
  hasSupabaseConfig,
  membership,
  navigate,
  poll,
  refreshMembership,
  session,
  supabase,
}) {
  const [formState, setFormState] = useState(() => createDefaultFormState(poll));
  const [storedBallot, setStoredBallot] = useState(() => readStoredBallot(poll.id, poll.phase));
  const [isLoadingVote, setIsLoadingVote] = useState(false);
  const [isLoadingPrimaryCandidates, setIsLoadingPrimaryCandidates] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [candidateLoadError, setCandidateLoadError] = useState(null);
  const [primaryNominationPool, setPrimaryNominationPool] = useState([]);

  const phaseDetails = phaseContent[poll.phase];
  const hasSubmitted = storedBallot?.pollId === poll.id && storedBallot?.phase === poll.phase;
  const accountStatus = getAccountStatus(session, membership);
  const canVote = hasSupabaseConfig && accountStatus === "approved";
  const primaryCandidates = primaryNominationPool.filter(
    (candidate) => candidate.advancesToPrimary,
  );
  const candidateOptions = poll.phase === "primary" ? primaryCandidates : poll.candidates;
  const selectedCandidate = candidateOptions.find(
    (candidate) => candidate.id === storedBallot?.candidateId,
  );
  const isPrimaryUnavailable =
    poll.phase === "primary" &&
    (isLoadingPrimaryCandidates || candidateLoadError || candidateOptions.length === 0);

  async function handleSignOut() {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    setStoredBallot(readStoredBallot(poll.id, poll.phase));
  }

  useEffect(() => {
    if (poll.phase !== "primary" || !supabase || !canVote) {
      return;
    }

    let isMounted = true;

    async function loadPrimaryCandidates() {
      setIsLoadingPrimaryCandidates(true);
      setCandidateLoadError(null);

      const { data, error } = await supabase.rpc("get_primary_candidates", {
        target_poll_id: poll.id,
        candidate_limit: 5,
      });

      if (!isMounted) {
        return;
      }

      if (error) {
        setCandidateLoadError(error.message);
        setPrimaryNominationPool([]);
      } else {
        const candidates = (data ?? []).map(mapPrimaryCandidate);
        const advancingCandidates = candidates.filter((candidate) => candidate.advancesToPrimary);

        setPrimaryNominationPool(candidates);
        setFormState((currentState) => {
          if (
            currentState.candidateId &&
            advancingCandidates.some((candidate) => candidate.id === currentState.candidateId)
          ) {
            return currentState;
          }

          return {
            candidateId: advancingCandidates[0]?.id ?? "",
          };
        });
      }

      setIsLoadingPrimaryCandidates(false);
    }

    loadPrimaryCandidates();

    return () => {
      isMounted = false;
    };
  }, [canVote, poll.id, poll.phase, supabase]);

  useEffect(() => {
    if (!supabase || !session?.user || accountStatus !== "approved") {
      return;
    }

    let isMounted = true;

    async function loadStoredVote() {
      setIsLoadingVote(true);

      const { data, error } = await supabase
        .from("votes")
        .select("poll_id, phase, candidate_id, album_title, artist_name, created_at")
        .eq("poll_id", poll.id)
        .eq("phase", poll.phase)
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (!isMounted) {
        return;
      }

      if (!error && data) {
        const normalizedVote = normalizeVoteRecord(data);
        window.localStorage.setItem(getStorageKey(poll.id, poll.phase), JSON.stringify(normalizedVote));
        setStoredBallot(normalizedVote);
      }

      setIsLoadingVote(false);
    }

    loadStoredVote();

    return () => {
      isMounted = false;
    };
  }, [accountStatus, poll.id, poll.phase, session?.user, supabase]);

  function handleFieldChange(event) {
    const { name, value } = event.target;

    setFormState((currentState) => ({
      ...currentState,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError(null);

    if (hasSubmitted) {
      return;
    }

    if (!canVote) {
      setFormError("Your account needs verified, approved member access before voting.");
      return;
    }

    let nextBallot;
    let voteRecord;

    if (poll.phase === "nominations") {
      const nominationValidation = validateNominationInput(formState);

      if (!nominationValidation.isValid) {
        setFormError(nominationValidation.message);
        return;
      }

      const { albumTitle, artistName } = nominationValidation;

      nextBallot = {
        pollId: poll.id,
        phase: poll.phase,
        submittedAt: new Date().toISOString(),
        nomination: {
          albumTitle,
          artistName,
        },
      };
      voteRecord = {
        poll_id: poll.id,
        phase: poll.phase,
        user_id: session.user.id,
        album_title: albumTitle,
        artist_name: artistName,
      };
    } else {
      const candidateExists = candidateOptions.some(
        (candidate) => candidate.id === formState.candidateId,
      );

      if (!formState.candidateId || !candidateExists) {
        setFormError("Choose an album before submitting.");
        return;
      }

      nextBallot = {
        pollId: poll.id,
        phase: poll.phase,
        submittedAt: new Date().toISOString(),
        candidateId: formState.candidateId,
      };
      voteRecord = {
        poll_id: poll.id,
        phase: poll.phase,
        user_id: session.user.id,
        candidate_id: formState.candidateId,
      };
    }

    setIsSubmitting(true);

    const { data, error } = await supabase
      .from("votes")
      .insert(voteRecord)
      .select("poll_id, phase, candidate_id, album_title, artist_name, created_at")
      .single();

    setIsSubmitting(false);

    if (error) {
      setFormError(
        error.code === "23505"
          ? "Your account already has a saved submission for this poll."
          : getNominationSubmissionError(error),
      );
      return;
    }

    const savedBallot = normalizeVoteRecord(data) || nextBallot;
    window.localStorage.setItem(getStorageKey(poll.id, poll.phase), JSON.stringify(savedBallot));
    setStoredBallot(savedBallot);
  }

  function renderAccountGate() {
    if (!hasSupabaseConfig) {
      return (
        <div className="confirmation-card">
          <p className="eyebrow">Setup needed</p>
          <h3>Connect Supabase before real voting opens.</h3>
          <p>
            Add <strong>VITE_SUPABASE_URL</strong> and <strong>VITE_SUPABASE_ANON_KEY</strong>
            to your environment, then run the Supabase schema in this repo.
          </p>
        </div>
      );
    }

    if (!authReady) {
      return (
        <div className="confirmation-card">
          <p className="eyebrow">Loading account</p>
          <h3>Checking your voting access.</h3>
        </div>
      );
    }

    if (!session) {
      return (
        <div className="confirmation-card">
          <p className="eyebrow">Account required</p>
          <h3>Sign in or create an account to vote.</h3>
          <p>
            Voting opens after your email is verified and an admin approves your membership.
          </p>
          <AuthPanel supabase={supabase} />
        </div>
      );
    }

    if (accountStatus === "unverified") {
      return (
        <div className="confirmation-card">
          <p className="eyebrow">Verify email</p>
          <h3>Check your inbox before voting.</h3>
          <p>{session.user.email} needs to be verified before your account can vote.</p>
        </div>
      );
    }

    if (accountStatus === "pending") {
      return (
        <div className="confirmation-card">
          <p className="eyebrow">Approval pending</p>
          <h3>Your account is waiting for member approval.</h3>
          <p>
            You are signed in as {session.user.email}. Ask an ALC admin to approve your
            membership, then refresh your access.
          </p>
          <button className="button button-secondary" type="button" onClick={refreshMembership}>
            Refresh access
          </button>
        </div>
      );
    }

    if (accountStatus === "blocked") {
      return (
        <div className="confirmation-card">
          <p className="eyebrow">Access unavailable</p>
          <h3>This account is not approved for voting.</h3>
          <p>Ask an ALC admin if you think this is a mistake.</p>
        </div>
      );
    }

    return null;
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

    if (poll.phase === "primary") {
      if (isLoadingPrimaryCandidates) {
        return (
          <div className="confirmation-card">
            <p className="eyebrow">Building ballot</p>
            <h3>Finding the top nominated albums.</h3>
            <p>Duplicates are being grouped before the primary vote opens.</p>
          </div>
        );
      }

      if (candidateLoadError) {
        return (
          <div className="confirmation-card">
            <p className="eyebrow">Primary unavailable</p>
            <h3>Could not load the nomination pool.</h3>
            <p>{candidateLoadError}</p>
          </div>
        );
      }

      if (candidateOptions.length === 0) {
        return (
          <div className="confirmation-card">
            <p className="eyebrow">No nominations yet</p>
            <h3>The primary ballot needs nominations first.</h3>
            <p>Once members submit albums, the top five unique nominations will appear here.</p>
          </div>
        );
      }
    }

    return (
      <div className="candidate-list" role="radiogroup" aria-label="Album choices">
        {candidateOptions.map((candidate) => (
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

  function renderPrimaryNominationPool() {
    if (poll.phase !== "primary") {
      return null;
    }

    if (isLoadingPrimaryCandidates) {
      return (
        <article className="surface-card sidebar-card nomination-pool-card">
          <p className="eyebrow">Nomination pool</p>
          <h2 className="sidebar-title">Grouping duplicates...</h2>
        </article>
      );
    }

    if (!primaryNominationPool.length) {
      return null;
    }

    return (
      <article className="surface-card sidebar-card nomination-pool-card">
        <p className="eyebrow">Nomination pool</p>
        <h2 className="sidebar-title">Every unique album nominated</h2>
        <p className="sidebar-copy">
          Top five move to this ballot. Ties go to the most recent nomination.
        </p>

        <div className="nomination-pool-list">
          {primaryNominationPool.map((candidate) => (
            <div
              className={`nomination-pool-item ${
                candidate.advancesToPrimary ? "is-advancing" : ""
              }`}
              key={candidate.id}
            >
              <span>#{candidate.rank}</span>
              <div>
                <strong>{candidate.title}</strong>
                <p>
                  {candidate.artist} · {formatNominationCount(candidate.nominationCount)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </article>
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

          {renderAccountGate() ||
          (isLoadingVote ? (
            <div className="confirmation-card">
              <p className="eyebrow">Loading ballot</p>
              <h3>Checking for an existing submission.</h3>
            </div>
          ) : hasSubmitted ? (
            renderConfirmation()
          ) : (
            <form className="vote-form" onSubmit={handleSubmit}>
              {renderFormBody()}

              <p className="helper-note">
                One verified, approved account gets one submission per poll.
              </p>

              {formError ? <p className="form-error">{formError}</p> : null}

              <button
                className="button button-primary"
                type="submit"
                disabled={isSubmitting || isPrimaryUnavailable}
              >
                {isSubmitting
                  ? "Saving..."
                  : isPrimaryUnavailable
                    ? "Primary not ready"
                    : phaseDetails.buttonLabel}
              </button>
            </form>
          ))}
        </article>

        <aside className="poll-sidebar">
          {session ? (
            <article className="surface-card sidebar-card">
              <p className="eyebrow">Account</p>
              <h2 className="sidebar-title">{membership?.display_name || "Signed in"}</h2>
              <p className="sidebar-copy">{session.user.email}</p>
              <div className="member-badges compact-badges">
                <span>{accountStatus}</span>
                <span>{membership?.role || "member"}</span>
              </div>
              <button className="button button-secondary full-width" type="button" onClick={handleSignOut}>
                Sign out
              </button>
            </article>
          ) : null}

          <article className="surface-card sidebar-card">
            <p className="eyebrow">Current listen</p>
            <h2 className="sidebar-title">{poll.albumOfWeek.title}</h2>
            <p className="sidebar-copy">{poll.albumOfWeek.artist}</p>
          </article>

          {renderPrimaryNominationPool()}

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
