import AccountGate from "../components/voting/AccountGate.jsx";
import AlbumRating from "../components/voting/AlbumRating.jsx";
import BallotChoices from "../components/voting/BallotChoices.jsx";
import BallotConfirmation from "../components/voting/BallotConfirmation.jsx";
import FinalClosed from "../components/voting/FinalClosed.jsx";
import {
  attachUserToVote,
  createDefaultFormState,
  fetchAuthoritativeStoredBallot,
  formatPhaseLabel,
  getVoteSubmissionError,
  shouldReconcileVoteSubmission,
} from "../lib/ballotState.js";
import {
  clearStoredBallot,
  readStoredBallot,
  writeStoredBallot,
} from "../lib/ballotStorage";
import { getAccountStatus } from "../lib/accountStatus";
import {
  getNominationSubmissionError,
  validateNominationInput,
} from "../lib/nominationValidation";
import {
  moveRankedCandidate,
  validateFinalRanking,
  validatePrimarySelection,
} from "../lib/votingLogic";
import { phaseContent } from "../data/clubContent";
import useAlbumRating from "../hooks/useAlbumRating.js";
import { useEffect, useMemo, useRef, useState } from "react";

function Poll({
  authReady,
  hasSupabaseConfig,
  membership,
  membershipLookupStatus,
  navigate,
  poll,
  pollError,
  pollErrorStatus,
  refreshMembership,
  refreshPoll,
  session,
  supabase,
}) {
  const [formState, setFormState] = useState(() =>
    createDefaultFormState(
      poll.phase,
      (poll.finalists || []).map((candidate) => candidate.id),
    ),
  );
  const [storedBallot, setStoredBallot] = useState(null);

  const [isLoadingVote, setIsLoadingVote] = useState(false);
  const [isRefreshingBallot, setIsRefreshingBallot] = useState(false);
  const [isRefreshingMembership, setIsRefreshingMembership] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [roundCheckMessage, setRoundCheckMessage] = useState(null);
  const lastManualRoundCheck = useRef(0);

  const phaseDetails = phaseContent[poll.phase] || phaseContent.nominations;
  const userId = session?.user?.id;
  const hasSubmitted =
    storedBallot?.pollId === poll.id &&
    storedBallot?.phase === poll.phase &&
    storedBallot?.userId === userId;
  const accountStatus = getAccountStatus(
    session,
    membership,
    membershipLookupStatus,
  );
  const {
    storedCurrentAlbumRating,
    currentAlbumRating,
    setCurrentAlbumRating,
    currentAlbumRatingError,
    setCurrentAlbumRatingError,
    isLoadingCurrentAlbumRating,
    isSubmittingCurrentAlbumRating,
    handleCurrentAlbumRatingSubmit,
  } = useAlbumRating({ accountStatus, poll, supabase, userId });

  const canVote = hasSupabaseConfig && accountStatus === "approved";
  const finalClosesAt = poll.finalClosesAt || poll.final_closes_at;
  const finalClosedAt = poll.finalClosedAt || poll.final_closed_at;
  const finalIsClosed =
    poll.phase === "final" &&
    (poll.finalIsClosed === true ||
      poll.finalIsClosed === "true" ||
      poll.final_is_closed === true ||
      poll.final_is_closed === "true" ||
      Boolean(finalClosedAt));
  const candidateOptions = useMemo(
    () =>
      poll.phase === "final" ? poll.finalists || [] : poll.candidates || [],
    [poll.candidates, poll.finalists, poll.phase],
  );
  const rankedCandidates = useMemo(
    () =>
      formState.rankedCandidateIds
        .map((candidateId) =>
          candidateOptions.find((candidate) => candidate.id === candidateId),
        )
        .filter(Boolean),
    [candidateOptions, formState.rankedCandidateIds],
  );
  const isAccountGated =
    !hasSupabaseConfig ||
    (pollError && !hasSubmitted) ||
    !authReady ||
    !session ||
    ["unverified", "unavailable", "pending", "blocked"].includes(accountStatus);

  const ballotNeedsCandidates =
    poll.phase !== "nominations" && candidateOptions.length === 0;
  const ballotChoiceIdsKey = JSON.stringify(
    poll.phase === "nominations"
      ? []
      : candidateOptions.map((candidate) => candidate.id),
  );

  useEffect(() => {
    const ballotChoiceIds = JSON.parse(ballotChoiceIdsKey);
    setFormState(
      createDefaultFormState(
        poll.phase,
        poll.phase === "final" ? ballotChoiceIds : [],
      ),
    );
    setFormError(null);
  }, [ballotChoiceIdsKey, poll.id, poll.phase]);

  useEffect(() => {
    if (!supabase || !userId || accountStatus !== "approved") {
      setStoredBallot(null);
      setIsLoadingVote(false);
      return;
    }

    let isMounted = true;

    async function loadStoredVote() {
      setIsLoadingVote(true);
      const cachedBallot = readStoredBallot(userId, poll.id, poll.phase);
      setStoredBallot(cachedBallot);

      const { ballot, error } = await fetchAuthoritativeStoredBallot(supabase, {
        pollId: poll.id,
        phase: poll.phase,
        userId,
      });

      if (!isMounted) {
        return;
      }

      if (ballot) {
        writeStoredBallot(userId, poll.id, poll.phase, ballot);
        setStoredBallot(ballot);
      } else if (!error) {
        clearStoredBallot(userId, poll.id, poll.phase);
        setStoredBallot(null);
      } else if (!cachedBallot) {
        setFormError(
          "Your saved ballot could not be checked. Your access is still active; try again in a moment.",
        );
      }

      setIsLoadingVote(false);
    }

    loadStoredVote();

    return () => {
      isMounted = false;
    };
  }, [
    accountStatus,
    ballotChoiceIdsKey,
    poll.id,
    poll.phase,
    supabase,
    userId,
  ]);

  function handleFieldChange(event) {
    const { name, value } = event.target;

    setFormState((currentState) => ({
      ...currentState,
      [name]: value,
    }));
  }

  function handlePrimaryToggle(candidateId) {
    setFormState((currentState) => {
      const isSelected =
        currentState.selectedCandidateIds.includes(candidateId);
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

  function acceptSavedBallot(savedBallot) {
    writeStoredBallot(userId, poll.id, poll.phase, savedBallot);
    setStoredBallot(savedBallot);
    setFormError(null);
  }

  async function reconcileSavedBallot() {
    const { ballot } = await fetchAuthoritativeStoredBallot(supabase, {
      pollId: poll.id,
      phase: poll.phase,
      userId,
    });

    if (!ballot) {
      return false;
    }

    acceptSavedBallot(ballot);
    return true;
  }

  async function runBallotSubmission(
    request,
    { getErrorMessage = getVoteSubmissionError, missingConfirmationMessage },
  ) {
    let data = null;
    let error;

    try {
      const result = await request();
      data = result?.data ?? null;
      error = result?.error ?? null;

      if (error && result?.status && !error.status) {
        error = {
          ...error,
          message: error.message,
          status: result.status,
        };
      }
    } catch (requestError) {
      error = requestError;
    }

    let savedBallot = attachUserToVote(data, userId);

    if (!savedBallot && shouldReconcileVoteSubmission(error)) {
      const recovered = await reconcileSavedBallot();

      if (recovered) {
        setIsSubmitting(false);
        return true;
      }
    }

    if (error) {
      setFormError(getErrorMessage(error));
      setIsSubmitting(false);
      return false;
    }

    if (!savedBallot) {
      setFormError(missingConfirmationMessage);
      setIsSubmitting(false);
      return false;
    }

    acceptSavedBallot(savedBallot);
    setIsSubmitting(false);
    return true;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError(null);

    if (hasSubmitted) {
      return;
    }

    if (finalIsClosed) {
      setFormError("Final voting is closed. No new rankings can be submitted.");
      return;
    }

    if (!canVote) {
      setFormError(
        "Your account needs verified, approved member access before voting.",
      );
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

      if (
        !window.confirm(
          `Submit ${nominationValidation.albumTitle} by ${nominationValidation.artistName}? Your nomination cannot be changed during this phase.`,
        )
      ) {
        setIsSubmitting(false);
        return;
      }

      await runBallotSubmission(
        () =>
          supabase.rpc("submit_nomination", {
            target_poll_id: poll.id,
            album_title_input: nominationValidation.albumTitle,
            artist_name_input: nominationValidation.artistName,
          }),
        {
          getErrorMessage: (error) =>
            getNominationSubmissionError(error, getVoteSubmissionError),
          missingConfirmationMessage:
            "Your nomination may have been saved, but its confirmation could not be loaded. Check again before resubmitting.",
        },
      );
      return;
    }

    if (poll.phase === "primary") {
      const primaryValidation = validatePrimarySelection(
        formState.selectedCandidateIds,
      );

      if (!primaryValidation.isValid) {
        setFormError(primaryValidation.message);
        setIsSubmitting(false);
        return;
      }

      if (
        !window.confirm(
          `Submit ${formState.selectedCandidateIds.length} album ${formState.selectedCandidateIds.length === 1 ? "choice" : "choices"}? Your ballot cannot be changed during this phase.`,
        )
      ) {
        setIsSubmitting(false);
        return;
      }

      await runBallotSubmission(
        () =>
          supabase.rpc("submit_primary_ballot", {
            target_poll_id: poll.id,
            candidate_ids: formState.selectedCandidateIds,
          }),
        {
          missingConfirmationMessage:
            "Your ballot may have been saved, but its confirmation could not be loaded. Check again before resubmitting.",
        },
      );
      return;
    }

    const finalValidation = validateFinalRanking(
      formState.rankedCandidateIds,
      candidateOptions.length,
    );

    if (!finalValidation.isValid) {
      setFormError(finalValidation.message);
      setIsSubmitting(false);
      return;
    }

    if (
      !window.confirm(
        "Submit this final ranking? Your ballot cannot be changed during this phase.",
      )
    ) {
      setIsSubmitting(false);
      return;
    }

    await runBallotSubmission(
      () =>
        supabase.rpc("submit_final_ballot", {
          target_poll_id: poll.id,
          ranked_candidate_ids: formState.rankedCandidateIds,
        }),
      {
        missingConfirmationMessage:
          "Your ranking may have been saved, but its confirmation could not be loaded. Check again before resubmitting.",
      },
    );
  }

  async function handleBallotReload() {
    const now = Date.now();

    if (isRefreshingBallot || now - lastManualRoundCheck.current < 1_500) {
      return;
    }

    lastManualRoundCheck.current = now;
    setIsRefreshingBallot(true);
    setFormError(null);
    setRoundCheckMessage(null);

    try {
      const refreshedPoll = await refreshPoll({ force: true });

      if (
        refreshedPoll?.id === poll.id &&
        refreshedPoll?.phase === poll.phase
      ) {
        setRoundCheckMessage("This ballot is up to date.");
      } else if (!refreshedPoll) {
        setRoundCheckMessage(
          "The new round could not be checked. Try again in a moment.",
        );
      }
    } finally {
      setIsRefreshingBallot(false);
    }
  }

  async function handleMembershipReload() {
    if (isRefreshingMembership || !refreshMembership) {
      return;
    }

    setIsRefreshingMembership(true);

    try {
      await refreshMembership();
    } finally {
      setIsRefreshingMembership(false);
    }
  }

  return (
    <div className="sideb-page sideb-subpage sideb-vote-page">
      <main className="sideb-subpage-main" id="main-content" tabIndex="-1">
        <section className="sideb-page-hero sideb-vote-hero">
          <div>
            <p className="eyebrow">Voting page</p>
            <h1 className="page-title">{poll.question}</h1>
            <p className="page-intro">{poll.description}</p>
          </div>
        </section>

        <section className="vote-layout">
          <article className="vote-form-card surface-card">
            <div className="form-header">
              <div>
                <span className={`phase-pill phase-${poll.phase}`}>
                  {phaseDetails.label}
                </span>
                <h2>{phaseDetails.title}</h2>
              </div>
              <p>{phaseDetails.description}</p>
            </div>

            {
              <AlbumRating
                canVote={canVote}
                currentAlbumRating={currentAlbumRating}
                currentAlbumRatingError={currentAlbumRatingError}
                handleCurrentAlbumRatingSubmit={handleCurrentAlbumRatingSubmit}
                isLoadingCurrentAlbumRating={isLoadingCurrentAlbumRating}
                isSubmittingCurrentAlbumRating={isSubmittingCurrentAlbumRating}
                poll={poll}
                pollError={pollError}
                setCurrentAlbumRating={setCurrentAlbumRating}
                setCurrentAlbumRatingError={setCurrentAlbumRatingError}
                storedCurrentAlbumRating={storedCurrentAlbumRating}
              />
            }

            {finalIsClosed && !hasSubmitted ? (
              <FinalClosed
                finalClosedAt={finalClosedAt}
                finalClosesAt={finalClosesAt}
              />
            ) : isAccountGated ? (
              <AccountGate
                accountStatus={accountStatus}
                authReady={authReady}
                handleBallotReload={handleBallotReload}
                handleMembershipReload={handleMembershipReload}
                hasSubmitted={hasSubmitted}
                hasSupabaseConfig={hasSupabaseConfig}
                isRefreshingBallot={isRefreshingBallot}
                isRefreshingMembership={isRefreshingMembership}
                navigate={navigate}
                pollError={pollError}
                pollErrorStatus={pollErrorStatus}
                session={session}
              />
            ) : isLoadingVote && !hasSubmitted ? (
              <div className="confirmation-card">
                <p className="eyebrow">Loading ballot</p>
                <h3>Checking for an existing submission.</h3>
              </div>
            ) : hasSubmitted ? (
              <BallotConfirmation
                candidateOptions={candidateOptions}
                poll={poll}
                storedBallot={storedBallot}
              />
            ) : (
              <form className="vote-form" onSubmit={handleSubmit}>
                {
                  <BallotChoices
                    candidateOptions={candidateOptions}
                    formState={formState}
                    handleBallotReload={handleBallotReload}
                    handleFieldChange={handleFieldChange}
                    handlePrimaryToggle={handlePrimaryToggle}
                    handleRankMove={handleRankMove}
                    isRefreshingBallot={isRefreshingBallot}
                    poll={poll}
                    rankedCandidates={rankedCandidates}
                  />
                }

                {!ballotNeedsCandidates ? (
                  <>
                    <p className="helper-note">
                      One verified, approved account gets one submission per
                      phase.
                    </p>

                    {poll.phase === "primary" ? (
                      <p className="helper-note">
                        Selected {formState.selectedCandidateIds.length}. You
                        can submit any number from 1 to 5.
                      </p>
                    ) : null}

                    {formError ? (
                      <p className="form-error" role="alert">
                        {formError}
                      </p>
                    ) : null}

                    <button
                      className="button button-primary"
                      type="submit"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? "Saving..." : phaseDetails.buttonLabel}
                    </button>
                  </>
                ) : null}
              </form>
            )}
          </article>

          <aside className="poll-sidebar">
            {session ? (
              <article className="surface-card sidebar-card">
                <p className="eyebrow">Voting as</p>
                <h2 className="sidebar-title">
                  {membership?.display_name || "Signed in"}
                </h2>
                <p className="sidebar-copy">{session.user.email}</p>
                <div className="member-badges compact-badges">
                  <span>{accountStatus}</span>
                  <span>{membership?.role || "member"}</span>
                </div>
                <a
                  className="button button-secondary full-width"
                  href="/account"
                  onClick={(event) => {
                    event.preventDefault();
                    navigate("/account");
                  }}
                >
                  Manage account
                </a>
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
              </dl>
              <button
                className="button button-secondary full-width"
                type="button"
                disabled={isRefreshingBallot}
                onClick={handleBallotReload}
              >
                {isRefreshingBallot
                  ? "Checking for a new round…"
                  : "Check for new round"}
              </button>
              {roundCheckMessage ? (
                <p className="helper-note" role="status">
                  {roundCheckMessage}
                </p>
              ) : null}
            </article>
          </aside>
        </section>
      </main>
    </div>
  );
}

export default Poll;
