import { useEffect, useMemo, useState } from "react";

import AuthPanel from "../components/AuthPanel";
import { phaseContent } from "../data/clubContent";
import {
  getNominationSubmissionError,
  validateNominationInput,
} from "../lib/nominationValidation";
import {
  moveRankedCandidate,
  validateFinalRanking,
  validatePrimarySelection,
} from "../lib/votingLogic";

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
      selectedCandidateIds: [],
      rankedCandidateIds: [],
    };
  }

  return {
    albumTitle: "",
    artistName: "",
    selectedCandidateIds: [],
    rankedCandidateIds: (poll.finalists || []).map((candidate) => candidate.id),
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

  const choices = (vote.choices || []).sort((a, b) => a.rank - b.rank);

  return {
    pollId: vote.poll_id,
    phase: vote.phase,
    submittedAt: vote.created_at,
    candidateIds: choices.map((choice) => choice.candidate_id),
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
  pollError,
  refreshMembership,
  refreshPoll,
  session,
  supabase,
}) {
  const [formState, setFormState] = useState(() => createDefaultFormState(poll));
  const [storedBallot, setStoredBallot] = useState(() => readStoredBallot(poll.id, poll.phase));
  const [isLoadingVote, setIsLoadingVote] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const phaseDetails = phaseContent[poll.phase] || phaseContent.nominations;
  const hasSubmitted = storedBallot?.pollId === poll.id && storedBallot?.phase === poll.phase;
  const accountStatus = getAccountStatus(session, membership);
  const canVote = hasSupabaseConfig && accountStatus === "approved";
  const candidateOptions = poll.phase === "final" ? poll.finalists || [] : poll.candidates || [];
  const rankedCandidates = useMemo(
    () =>
      formState.rankedCandidateIds
        .map((candidateId) => candidateOptions.find((candidate) => candidate.id === candidateId))
        .filter(Boolean),
    [candidateOptions, formState.rankedCandidateIds],
  );

  async function handleSignOut() {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    setStoredBallot(readStoredBallot(poll.id, poll.phase));
  }

  useEffect(() => {
    setFormState(createDefaultFormState(poll));
    setStoredBallot(readStoredBallot(poll.id, poll.phase));
    setFormError(null);
  }, [poll.id, poll.phase]);

  useEffect(() => {
    if (!supabase || !session?.user || accountStatus !== "approved") {
      return;
    }

    let isMounted = true;

    async function loadStoredVote() {
      setIsLoadingVote(true);

      const { data, error } = await supabase
        .from("votes")
        .select("poll_id, phase, album_title, artist_name, created_at, vote_choices(candidate_id, rank)")
        .eq("poll_id", poll.id)
        .eq("phase", poll.phase)
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (!isMounted) {
        return;
      }

      if (!error && data) {
        const normalizedVote = normalizeVoteRecord({
          ...data,
          choices: data.vote_choices || [],
        });
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

  function handlePrimaryToggle(candidateId) {
    setFormState((currentState) => {
      const isSelected = currentState.selectedCandidateIds.includes(candidateId);
      const selectedCandidateIds = isSelected
        ? currentState.selectedCandidateIds.filter((id) => id !== candidateId)
        : [...currentState.selectedCandidateIds, candidateId];

      return {
        ...currentState,
        selectedCandidateIds: selectedCandidateIds.slice(0, 5),
      };
    });
  }

  function handleRankMove(candidateId, direction) {
    setFormState((currentState) => ({
      ...currentState,
      rankedCandidateIds: moveRankedCandidate(
        currentState.rankedCandidateIds,
        candidateId,
        direction,
      ),
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

    setIsSubmitting(true);

    if (poll.phase === "nominations") {
      const nominationValidation = validateNominationInput(formState);

      if (!nominationValidation.isValid) {
        setFormError(nominationValidation.message);
        setIsSubmitting(false);
        return;
      }

      const { data, error } = await supabase.rpc("submit_nomination", {
        target_poll_id: poll.id,
        album_title_input: nominationValidation.albumTitle,
        artist_name_input: nominationValidation.artistName,
      });

      setIsSubmitting(false);

      if (error) {
        setFormError(getNominationSubmissionError(error));
        return;
      }

      const savedBallot = normalizeVoteRecord(data);
      window.localStorage.setItem(getStorageKey(poll.id, poll.phase), JSON.stringify(savedBallot));
      setStoredBallot(savedBallot);
      await refreshPoll();
      return;
    }

    if (poll.phase === "primary") {
      const primaryValidation = validatePrimarySelection(formState.selectedCandidateIds);

      if (!primaryValidation.isValid) {
        setFormError(primaryValidation.message);
        setIsSubmitting(false);
        return;
      }

      const { data, error } = await supabase.rpc("submit_primary_ballot", {
        target_poll_id: poll.id,
        candidate_ids: formState.selectedCandidateIds,
      });

      setIsSubmitting(false);

      if (error) {
        setFormError(error.code === "23505" ? "Your account already submitted this phase." : error.message);
        return;
      }

      const savedBallot = normalizeVoteRecord(data);
      window.localStorage.setItem(getStorageKey(poll.id, poll.phase), JSON.stringify(savedBallot));
      setStoredBallot(savedBallot);
      await refreshPoll();
      return;
    }

    const finalValidation = validateFinalRanking(formState.rankedCandidateIds);

    if (!finalValidation.isValid) {
      setFormError(finalValidation.message);
      setIsSubmitting(false);
      return;
    }

    const { data, error } = await supabase.rpc("submit_final_ballot", {
      target_poll_id: poll.id,
      ranked_candidate_ids: formState.rankedCandidateIds,
    });

    setIsSubmitting(false);

    if (error) {
      setFormError(error.code === "23505" ? "Your account already submitted this phase." : error.message);
      return;
    }

    const savedBallot = normalizeVoteRecord(data);
    window.localStorage.setItem(getStorageKey(poll.id, poll.phase), JSON.stringify(savedBallot));
    setStoredBallot(savedBallot);
    await refreshPoll();
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

    if (pollError) {
      return (
        <div className="confirmation-card">
          <p className="eyebrow">Database setup needed</p>
          <h3>The live poll could not be loaded.</h3>
          <p>{pollError}</p>
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

    if (candidateOptions.length === 0) {
      return (
        <div className="confirmation-card">
          <p className="eyebrow">Ballot unavailable</p>
          <h3>This phase needs candidates first.</h3>
          <p>Ask an admin to advance the poll when the previous phase is ready.</p>
        </div>
      );
    }

    if (poll.phase === "primary") {
      return (
        <div className="candidate-list" role="group" aria-label="Primary album choices">
          {candidateOptions.map((candidate) => {
            const isSelected = formState.selectedCandidateIds.includes(candidate.id);

            return (
              <label
                key={candidate.id}
                className={`candidate-option ${isSelected ? "is-selected" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={!isSelected && formState.selectedCandidateIds.length >= 5}
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
                className="button button-secondary"
                type="button"
                disabled={index === 0}
                onClick={() => handleRankMove(candidate.id, -1)}
              >
                Up
              </button>
              <button
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

  function renderConfirmation() {
    if (!storedBallot) {
      return null;
    }

    return (
      <div className="confirmation-card">
        <p className="eyebrow">Submission saved</p>
        <h3>Your ballot is locked for this phase.</h3>
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
              <span>{poll.phase === "final" ? "Ranked ballot" : "Selected albums"}</span>
              {storedBallot.candidateIds.map((candidateId, index) => {
                const candidate = candidateOptions.find((option) => option.id === candidateId);

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
                One verified, approved account gets one submission per phase.
              </p>

              {poll.phase === "primary" ? (
                <p className="helper-note">
                  Selected {formState.selectedCandidateIds.length}. You can submit any number from 1 to 5.
                </p>
              ) : null}

              {formError ? <p className="form-error">{formError}</p> : null}

              <button
                className="button button-primary"
                type="submit"
                disabled={isSubmitting || (poll.phase !== "nominations" && candidateOptions.length === 0)}
              >
                {isSubmitting ? "Saving..." : phaseDetails.buttonLabel}
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
