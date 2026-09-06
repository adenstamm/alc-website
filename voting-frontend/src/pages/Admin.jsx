import ChevronIcon from "../components/admin/ChevronIcon";
import {
  ADMIN_PANELS,
  createPollId,
  formatAdminTimestamp,
  formatCount,
  formatPhaseLabel,
  getAdminActionDisplayError,
  getCurrentBallotCount,
  getFinalVotingState,
  isAdmin,
} from "../lib/adminPresentation";
import AdminPanel from "../components/admin/AdminPanel";
import AdminSnapshot from "../components/admin/AdminSnapshot.jsx";
import CreatePollForm from "../components/admin/CreatePollForm.jsx";
import CurrentAlbumManager from "../components/admin/CurrentAlbumManager.jsx";
import EventsManager from "../components/admin/EventsManager.jsx";
import MemberManager from "../components/admin/MemberManager.jsx";
import PollResults from "../components/admin/PollResults.jsx";
import ShelfManager from "../components/admin/ShelfManager.jsx";
import {
  executeAdminPhaseAction,
  getAdminActionErrorMessage,
} from "../lib/adminActions";
import { formatAverageRating } from "../lib/currentAlbumRating";
import { getRequiredFinalistCount } from "../lib/votingLogic";
import useAdminMembers from "../hooks/useAdminMembers.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useCurrentAlbumEditor from "../hooks/useCurrentAlbumEditor.js";
import useEventEditor from "../hooks/useEventEditor.js";
import useRecordShelfEditor from "../hooks/useRecordShelfEditor.js";

function Admin({
  authReady,
  hasSupabaseConfig,
  hasSiteEventsConfig,
  membership,
  poll,
  pollError,
  refreshEvents,
  refreshPoll,
  session,
  siteEvents,
  supabase,
}) {
  const [results, setResults] = useState(null);
  const [selectedFinalistIds, setSelectedFinalistIds] = useState([]);
  const [selectedTieCandidateId, setSelectedTieCandidateId] = useState("");
  const [lastResultsRefreshedAt, setLastResultsRefreshedAt] = useState(null);
  const [clockNow, setClockNow] = useState(() => Date.now());

  const [newPoll, setNewPoll] = useState({
    cycleLabel: "",
    pollId: "",
    question: "What should the club listen to next?",
    description:
      "Submit one album and artist pairing for the next club session.",
    albumTitle: "",
    albumArtist: "",
  });

  const [activePanel, setActivePanel] = useState("poll");
  const [isCreatePollOpen, setIsCreatePollOpen] = useState(false);

  const [successfulAction, setSuccessfulAction] = useState(null);
  const [toast, setToast] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [isSavingPhase, setIsSavingPhase] = useState(false);
  const [activePhaseAction, setActivePhaseAction] = useState(null);
  const [isSavingContent, setIsSavingContent] = useState(false);
  const [message, setMessage] = useState(null);

  const [error, setError] = useState(null);
  const [phaseFeedback, setPhaseFeedback] = useState(null);

  const phaseActionRef = useRef(null);
  const resultsRequestRef = useRef(0);
  const adminMainRef = useRef(null);
  const confirmationDialogRef = useRef(null);
  const confirmationTriggerRef = useRef(null);
  const isConfirmingRef = useRef(false);

  const successTimerRef = useRef(null);

  const canManage = hasSupabaseConfig && isAdmin(membership);
  const {
    memberTab,
    accountFilter,
    setAccountFilter,
    memberSearch,
    setMemberSearch,
    setMemberPage,
    selectedMemberIds,
    setSelectedMemberIds,
    busyMemberIds,
    isLoadingMembers,
    memberMessage,
    adminCount,
    approvedMemberCount,
    pendingMembers,
    accountFilters,
    visibleMembers,
    totalMemberPages,
    currentMemberPage,
    pagedMembers,
    handleMemberTabChange,
    updateMembership,
    toggleMemberSelection,
    toggleAllVisibleMembers,
    runBulkMemberStatus,
    requestBulkReject,
  } = useAdminMembers({
    canManage,
    openConfirmation,
    setError,
    setMessage,
    showConfirmation,
    showFailure,
    supabase,
  });
  const {
    currentAlbumForm,
    currentAlbumCoverFile,
    currentAlbumCoverPreviewUrl,
    currentAlbumError,
    currentAlbumMessage,
    currentAlbumCoverInputRef,
    handleCurrentAlbumChange,
    handleCurrentAlbumCoverChange,
    handleCurrentAlbumCoverClear,
    handleCurrentAlbumSave,
  } = useCurrentAlbumEditor({
    poll,
    refreshPoll,
    setIsSavingContent,
    showConfirmation,
    showFailure,
    supabase,
  });
  const {
    eventForm,
    editingEventId,
    sortedSiteEvents,
    nextUpcomingEvent,
    handleEventChange,
    handleEventEdit,
    resetEventForm,
    handleEventSave,
    requestEventDelete,
  } = useEventEditor({
    openConfirmation,
    refreshEvents,
    setError,
    setIsSavingContent,
    setMessage,
    showConfirmation,
    showFailure,
    siteEvents,
    supabase,
  });
  const {
    isShelfCurating,
    setIsShelfCurating,
    selectedShelfAlbumId,
    setSelectedShelfAlbumId,
    shelfArtistDrafts,
    shelfCoverFile,
    shelfCoverOverrides,
    isLoadingShelfCovers,
    isSavingShelfCover,
    shelfAlbums,
    shelfCoverInputRef,
    handleShelfCoverFileChange,
    moveShelfAlbum,
    saveShelfOrder,
    cancelShelfCuration,
    handleShelfArtistChange,
    handleShelfArtistSave,
    handleShelfCoverUpload,
    handleShelfCoverClear,
  } = useRecordShelfEditor({
    canManage,
    hasSupabaseConfig,
    session,
    setError,
    setMessage,
    showConfirmation,
    showFailure,
    supabase,
  });

  const primaryRows = useMemo(
    () => results?.primaryResults || [],
    [results?.primaryResults],
  );
  const nominationRows = results?.nominations || [];
  const finalRows = results?.finalists || [];
  const irvRounds = results?.irv?.rounds || [];
  const irvTie = results?.irv?.tie || null;
  const irvTieCandidateIds = useMemo(
    () => irvTie?.candidateIds || irvTie?.candidate_ids || [],
    [irvTie],
  );
  const irvTieSignature = irvTieCandidateIds.join("|");
  const irvWinnerId = results?.irv?.winnerId || null;
  const irvWinner = finalRows.find((candidate) => candidate.id === irvWinnerId);
  const ratingAlbum = poll.ratingAlbumOfWeek || poll.albumOfWeek;
  const publishedWinner = poll.publishedWinner || null;
  const currentAlbumRatingAverage = formatAverageRating(
    results?.currentAlbumRating?.averageRating,
  );
  const currentAlbumRatingCount = results?.currentAlbumRating?.ratingCount || 0;
  const currentBallotCount = getCurrentBallotCount(results, poll, poll.phase);
  const finalVotingState = getFinalVotingState(results, poll, clockNow);
  const selectedCount = selectedFinalistIds.length;
  const requiredFinalistCount = getRequiredFinalistCount(primaryRows.length);
  const canAdvanceToFinal =
    poll.phase === "primary" &&
    requiredFinalistCount > 0 &&
    selectedCount === requiredFinalistCount;

  const loadResults = useCallback(async () => {
    if (!canManage || !poll?.id) {
      return;
    }

    const requestId = resultsRequestRef.current + 1;
    resultsRequestRef.current = requestId;
    setIsLoadingResults(true);
    setError(null);

    const { data, error: loadError } = await supabase.rpc(
      "get_admin_poll_results",
      {
        target_poll_id: poll.id,
      },
    );

    if (requestId !== resultsRequestRef.current) {
      return;
    }

    if (loadError) {
      setError(loadError.message);
      setResults(null);
    } else {
      setResults(data);
      setLastResultsRefreshedAt(Date.now());
      const finalistIds = (data?.finalists || []).map(
        (candidate) => candidate.id,
      );
      setSelectedFinalistIds(finalistIds);
    }

    setIsLoadingResults(false);
  }, [canManage, poll?.id, supabase]);

  const sortedPrimaryRows = useMemo(
    () =>
      [...primaryRows].sort((a, b) => {
        if ((b.primaryVotes || 0) !== (a.primaryVotes || 0)) {
          return (b.primaryVotes || 0) - (a.primaryVotes || 0);
        }

        return a.title.localeCompare(b.title);
      }),
    [primaryRows],
  );

  useEffect(() => {
    resultsRequestRef.current += 1;
    setResults(null);
    setSelectedFinalistIds([]);
  }, [
    poll.id,
    poll.albumOfWeek.artist,
    poll.albumOfWeek.coverUrl,
    poll.albumOfWeek.note,
    poll.albumOfWeek.title,
  ]);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  useEffect(() => {
    if (poll.phase !== "final") {
      return undefined;
    }

    setClockNow(Date.now());
    const intervalId = window.setInterval(
      () => setClockNow(Date.now()),
      30_000,
    );

    return () => window.clearInterval(intervalId);
  }, [poll.phase]);

  useEffect(() => {
    setSelectedTieCandidateId("");
  }, [poll.id, irvTie?.round, irvTieSignature]);

  useEffect(() => {
    isConfirmingRef.current = isConfirming;
  }, [isConfirming]);

  useEffect(() => {
    if (!confirmation) {
      return undefined;
    }

    function handleConfirmationKeyDown(event) {
      if (event.key === "Escape" && !isConfirmingRef.current) {
        setConfirmation(null);
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = [
        ...(confirmationDialogRef.current?.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) || []),
      ];

      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    const backgroundElements = [
      adminMainRef.current,
      document.querySelector(".sideb-nav"),
      document.querySelector(".site-footer"),
    ].filter(Boolean);
    const previousInertStates = backgroundElements.map(
      (element) => element.inert,
    );

    backgroundElements.forEach((element) => {
      element.inert = true;
    });
    window.addEventListener("keydown", handleConfirmationKeyDown);

    return () => {
      window.removeEventListener("keydown", handleConfirmationKeyDown);
      backgroundElements.forEach((element, index) => {
        element.inert = previousInertStates[index];
      });

      const trigger = confirmationTriggerRef.current;
      confirmationTriggerRef.current = null;
      window.requestAnimationFrame(() => {
        if (trigger?.isConnected) {
          trigger.focus();
        }
      });
    };
  }, [confirmation]);

  useEffect(() => {
    if (
      !poll.winnerPublishedAt ||
      !publishedWinner?.title ||
      !publishedWinner?.artist
    ) {
      return;
    }

    setNewPoll((currentForm) => ({
      ...currentForm,
      albumTitle: currentForm.albumTitle || publishedWinner.title,
      albumArtist: currentForm.albumArtist || publishedWinner.artist,
    }));
  }, [poll.winnerPublishedAt, publishedWinner?.artist, publishedWinner?.title]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(
    () => () => {
      if (successTimerRef.current) {
        window.clearTimeout(successTimerRef.current);
      }
    },
    [],
  );

  function showConfirmation(messageText, actionKey = "saved") {
    setToast({ message: messageText, type: "success" });
    setSuccessfulAction(actionKey);

    if (successTimerRef.current) {
      window.clearTimeout(successTimerRef.current);
    }

    successTimerRef.current = window.setTimeout(() => {
      setSuccessfulAction(null);
    }, 1100);
  }

  function showFailure(messageText) {
    setToast({ message: messageText, type: "error" });
  }

  function getSubmitLabel(actionKey, idleLabel, busyLabel, isBusy) {
    if (successfulAction === actionKey) {
      return "Saved";
    }

    return isBusy ? busyLabel : idleLabel;
  }

  function toggleAdminPanel(panelId) {
    setActivePanel((currentPanel) => (currentPanel === panelId ? "" : panelId));
  }

  function openAdminPanel(panelId, targetId) {
    setActivePanel(panelId);
    window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    });
  }

  function handleNewPollChange(event) {
    const { name, value } = event.target;

    setNewPoll((currentPoll) => {
      const nextPoll = {
        ...currentPoll,
        [name]: value,
      };

      if (
        name === "cycleLabel" &&
        (!currentPoll.pollId ||
          currentPoll.pollId === createPollId(currentPoll.cycleLabel))
      ) {
        nextPoll.pollId = createPollId(value);
      }

      return nextPoll;
    });
  }

  async function handleCreatePoll(event) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (
      !newPoll.pollId ||
      !newPoll.cycleLabel ||
      !newPoll.albumTitle ||
      !newPoll.albumArtist
    ) {
      setError(
        "Add a poll id, cycle label, album title, and artist before creating a poll.",
      );
      return;
    }

    setIsSavingPhase(true);

    const { error: createError } = await supabase.rpc("create_poll", {
      new_poll_id: newPoll.pollId,
      new_cycle_label: newPoll.cycleLabel,
      new_question: newPoll.question,
      new_description: newPoll.description,
      album_title: newPoll.albumTitle,
      album_artist: newPoll.albumArtist,
    });

    setIsSavingPhase(false);

    if (createError) {
      const displayError = getAdminActionErrorMessage(createError);
      setError(displayError);
      showFailure(displayError);
      return;
    }

    setMessage("New poll created and set active.");
    showConfirmation(
      "New weekly poll created and nominations are open.",
      "create-poll",
    );
    setIsCreatePollOpen(false);
    setNewPoll({
      cycleLabel: "",
      pollId: "",
      question: "What should the club listen to next?",
      description:
        "Submit one album and artist pairing for the next club session.",
      albumTitle: "",
      albumArtist: "",
    });
    setResults(null);
    setSelectedFinalistIds([]);
    await refreshPoll();
  }

  function openConfirmation(nextConfirmation) {
    confirmationTriggerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setConfirmation(nextConfirmation);
  }

  function dismissConfirmation() {
    if (!isConfirmingRef.current) {
      setConfirmation(null);
    }
  }

  async function confirmPendingAction() {
    if (!confirmation?.onConfirm) {
      return;
    }

    isConfirmingRef.current = true;
    setIsConfirming(true);

    try {
      await confirmation.onConfirm();
    } catch (actionError) {
      const actionErrorMessage =
        actionError?.message || "The action could not be completed.";
      setError(actionErrorMessage);
      showFailure(actionErrorMessage);
    } finally {
      isConfirmingRef.current = false;
      setIsConfirming(false);
      setConfirmation(null);
    }
  }

  function toggleFinalist(candidateId) {
    setSelectedFinalistIds((currentIds) => {
      if (currentIds.includes(candidateId)) {
        return currentIds.filter((id) => id !== candidateId);
      }

      if (currentIds.length >= requiredFinalistCount) {
        return currentIds;
      }

      return [...currentIds, candidateId];
    });
  }

  function requestRemovePrimaryCandidate(candidate) {
    openConfirmation({
      confirmLabel: "Remove album",
      description: `${candidate.title} by ${candidate.artist} will be removed from this primary ballot. Existing selections for this album will be discarded; members who selected only this album will be able to submit a new ballot.`,
      eyebrow: "Primary ballot · Remove album",
      intent: "danger",
      onConfirm: () =>
        runAdminAction(
          "remove_primary_candidate",
          `${candidate.title} was removed from primary voting.`,
          { candidate_id_input: candidate.id },
        ),
      title: `Remove ${candidate.title}?`,
    });
  }

  async function runAdminAction(
    action,
    successMessage,
    params = {},
    { alreadyMessage, expectedPhase } = {},
  ) {
    if (phaseActionRef.current) {
      return;
    }

    phaseActionRef.current = action;
    setActivePhaseAction(action);
    setError(null);
    setMessage(null);
    setPhaseFeedback(null);
    setIsSavingPhase(true);

    try {
      const outcome = await executeAdminPhaseAction({
        action,
        expectedPhase,
        params,
        pollId: poll.id,
        refreshPoll,
        rpc: (actionName, payload) => supabase.rpc(actionName, payload),
      });

      if (!outcome.isSuccess) {
        const actionErrorMessage = getAdminActionDisplayError(
          action,
          outcome.error,
        );
        setPhaseFeedback({
          message: actionErrorMessage,
          type: "error",
        });
        showFailure(actionErrorMessage);
        return;
      }

      const confirmationMessage = outcome.recovered
        ? alreadyMessage || successMessage
        : successMessage;
      setPhaseFeedback({ message: confirmationMessage, type: "success" });
      showConfirmation(confirmationMessage, action);

      try {
        if (!outcome.recovered) {
          await refreshPoll();
        }
        await loadResults();
      } catch {
        setPhaseFeedback({
          message: `${confirmationMessage} Refresh the page to load the latest results.`,
          type: "success",
        });
      }
    } catch (actionError) {
      const actionErrorMessage = getAdminActionDisplayError(
        action,
        actionError,
      );
      setPhaseFeedback({
        message: actionErrorMessage,
        type: "error",
      });
      showFailure(actionErrorMessage);
    } finally {
      phaseActionRef.current = null;
      setActivePhaseAction(null);
      setIsSavingPhase(false);
    }
  }

  function requestAdvanceToPrimary() {
    openConfirmation({
      confirmLabel: "Open primary voting",
      description: `This closes nominations with ${formatCount(nominationRows.length, "album")} in the pool. Members will no longer be able to nominate, and every open ballot will move to primary voting.`,
      eyebrow: "Advance poll · Nominations → Primary",
      intent: "primary",
      onConfirm: () =>
        runAdminAction(
          "advance_to_primary",
          "Poll moved to primary.",
          {},
          {
            alreadyMessage: "The poll is already in primary voting.",
            expectedPhase: "primary",
          },
        ),
      title: "Are you ready?",
    });
  }

  function requestAdvanceToFinal() {
    openConfirmation({
      confirmLabel: "Open final voting",
      description: `This locks the ${formatCount(selectedCount, "selected finalist")} and ends primary voting. Ranked-choice final voting will open immediately and automatically close 18 hours later.`,
      eyebrow: "Advance poll · Primary → Final",
      intent: "primary",
      onConfirm: () =>
        runAdminAction(
          "advance_to_final",
          "Poll moved to final voting.",
          { candidate_ids: selectedFinalistIds },
          {
            alreadyMessage: "The poll is already in final voting.",
            expectedPhase: "final",
          },
        ),
      title: "Are you ready?",
    });
  }

  function requestResolveIrvTie() {
    const candidate = finalRows.find(
      (row) => row.id === selectedTieCandidateId,
    );

    if (!candidate || !irvTie) {
      return;
    }

    const isProvisional =
      finalVotingState.isAvailable && !finalVotingState.isClosed;

    openConfirmation({
      confirmLabel: isProvisional
        ? `Provisionally eliminate ${candidate.title}`
        : `Eliminate ${candidate.title}`,
      description: isProvisional
        ? `${candidate.title} by ${candidate.artist} will be used as the provisional manual elimination for round ${irvTie.round}. The next accepted final ballot will automatically clear this decision and recalculate the ranked-choice count.`
        : `${candidate.title} by ${candidate.artist} will be permanently recorded as the manual elimination for round ${irvTie.round}. The ranked-choice count will then continue and may produce another tie.`,
      eyebrow: "Manual IRV tie-break",
      intent: "danger",
      onConfirm: () =>
        runAdminAction(
          "resolve_irv_tie",
          isProvisional
            ? `${candidate.title} was provisionally eliminated from round ${irvTie.round}. A new final ballot will reset the decision.`
            : `${candidate.title} was eliminated from round ${irvTie.round}.`,
          {
            eliminated_candidate_id_input: candidate.id,
            target_round: irvTie.round,
          },
        ),
      title: "Are you ready?",
    });
  }

  function requestCloseFinalVoting() {
    openConfirmation({
      confirmLabel: "Close final voting now",
      description: `This immediately stops every new final ballot, before the automatic deadline${finalVotingState.closesAt ? ` at ${formatAdminTimestamp(finalVotingState.closesAt, { includeDate: true })}` : ""}. Existing ballots stay counted, the current album is archived, and the winner is published unless IRV requires an administrator tie-break.`,
      eyebrow: "Permanent voting cutoff",
      intent: "danger",
      onConfirm: () =>
        runAdminAction(
          "close_final_voting",
          "Final voting is closed. The winner is published unless a tie-break is required below.",
        ),
      title: "Close final voting now?",
    });
  }

  function requestReopenEmptyFinal() {
    openConfirmation({
      confirmLabel: "Reopen final for 18 hours",
      description:
        "No final ballots were accepted. Reopen voting with the same finalists for a new 18-hour window.",
      title: "Reopen this empty final?",
      onConfirm: () =>
        runAdminAction(
          "reopen_empty_final",
          "Final voting reopened for 18 hours.",
        ),
    });
  }

  return (
    <div className="sideb-page sideb-subpage sideb-admin-page">
      <main
        className="sideb-subpage-main"
        id="main-content"
        ref={adminMainRef}
        tabIndex="-1"
      >
        <section className="sideb-page-hero sideb-page-hero-split sideb-admin-hero">
          <div>
            <p className="sideb-kicker">ALC / Operations terminal</p>
            <h1>Club control room.</h1>
            <p>
              Run the weekly cycle, curate the public shelf, and keep member
              access moving.
            </p>
          </div>

          <aside className="sideb-next-card" aria-label="Current poll">
            <span>Current Phase</span>
            <strong>{formatPhaseLabel(poll.phase)}</strong>
            <p>{poll.status}</p>
            <small>{poll.id}</small>
          </aside>
        </section>

        {canManage ? (
          <>
            <nav
              className="admin-sticky-nav"
              aria-label="Admin workspace sections"
            >
              <button
                className="admin-sticky-brand"
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              >
                <span className="admin-status-light" aria-hidden="true" />
                Live console
              </button>
              <div>
                {ADMIN_PANELS.filter(
                  (panel) => panel.id !== "events" || hasSiteEventsConfig,
                ).map((panel) => (
                  <button
                    aria-current={activePanel === panel.id ? "page" : undefined}
                    className={activePanel === panel.id ? "is-active" : ""}
                    key={panel.id}
                    type="button"
                    onClick={() => openAdminPanel(panel.id, panel.target)}
                  >
                    {panel.label}
                    {panel.id === "members" && pendingMembers.length ? (
                      <span>{pendingMembers.length}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </nav>

            {
              <AdminSnapshot
                adminCount={adminCount}
                approvedMemberCount={approvedMemberCount}
                canManage={canManage}
                currentBallotCount={currentBallotCount}
                hasSiteEventsConfig={hasSiteEventsConfig}
                nextUpcomingEvent={nextUpcomingEvent}
                openAdminPanel={openAdminPanel}
                pendingMembers={pendingMembers}
                poll={poll}
                setIsCreatePollOpen={setIsCreatePollOpen}
              />
            }

            <div className="admin-workspace">
              <AdminPanel
                eyebrow="01 / Poll desk"
                id="admin-poll"
                isOpen={activePanel === "poll"}
                summary={`${formatPhaseLabel(poll.phase)} · ${poll.status}`}
                title="Weekly voting cycle"
                onToggle={() => toggleAdminPanel("poll")}
              >
                {
                  <CreatePollForm
                    ChevronIcon={ChevronIcon}
                    canManage={canManage}
                    getSubmitLabel={getSubmitLabel}
                    handleCreatePoll={handleCreatePoll}
                    handleNewPollChange={handleNewPollChange}
                    isCreatePollOpen={isCreatePollOpen}
                    isSavingPhase={isSavingPhase}
                    newPoll={newPoll}
                    poll={poll}
                    setIsCreatePollOpen={setIsCreatePollOpen}
                    successfulAction={successfulAction}
                  />
                }
                {
                  <PollResults
                    activePhaseAction={activePhaseAction}
                    canAdvanceToFinal={canAdvanceToFinal}
                    canManage={canManage}
                    clockNow={clockNow}
                    currentAlbumRatingAverage={currentAlbumRatingAverage}
                    currentAlbumRatingCount={currentAlbumRatingCount}
                    currentBallotCount={currentBallotCount}
                    finalRows={finalRows}
                    finalVotingState={finalVotingState}
                    getSubmitLabel={getSubmitLabel}
                    irvRounds={irvRounds}
                    irvTie={irvTie}
                    irvTieCandidateIds={irvTieCandidateIds}
                    irvWinner={irvWinner}
                    isLoadingResults={isLoadingResults}
                    isSavingPhase={isSavingPhase}
                    lastResultsRefreshedAt={lastResultsRefreshedAt}
                    loadResults={loadResults}
                    nominationRows={nominationRows}
                    phaseFeedback={phaseFeedback}
                    poll={poll}
                    pollError={pollError}
                    primaryRows={primaryRows}
                    ratingAlbum={ratingAlbum}
                    requestAdvanceToFinal={requestAdvanceToFinal}
                    requestAdvanceToPrimary={requestAdvanceToPrimary}
                    requestCloseFinalVoting={requestCloseFinalVoting}
                    requestRemovePrimaryCandidate={
                      requestRemovePrimaryCandidate
                    }
                    requestReopenEmptyFinal={requestReopenEmptyFinal}
                    requestResolveIrvTie={requestResolveIrvTie}
                    requiredFinalistCount={requiredFinalistCount}
                    results={results}
                    runAdminAction={runAdminAction}
                    selectedCount={selectedCount}
                    selectedFinalistIds={selectedFinalistIds}
                    selectedTieCandidateId={selectedTieCandidateId}
                    setSelectedTieCandidateId={setSelectedTieCandidateId}
                    sortedPrimaryRows={sortedPrimaryRows}
                    toggleFinalist={toggleFinalist}
                  />
                }
              </AdminPanel>

              <AdminPanel
                eyebrow="02 / Now playing"
                id="admin-current-album-panel"
                isOpen={activePanel === "album"}
                summary={`${poll.albumOfWeek.title} · ${poll.albumOfWeek.artist}`}
                title="Current album"
                onToggle={() => toggleAdminPanel("album")}
              >
                {
                  <CurrentAlbumManager
                    canManage={canManage}
                    currentAlbumCoverFile={currentAlbumCoverFile}
                    currentAlbumCoverInputRef={currentAlbumCoverInputRef}
                    currentAlbumCoverPreviewUrl={currentAlbumCoverPreviewUrl}
                    currentAlbumError={currentAlbumError}
                    currentAlbumForm={currentAlbumForm}
                    currentAlbumMessage={currentAlbumMessage}
                    getSubmitLabel={getSubmitLabel}
                    handleCurrentAlbumChange={handleCurrentAlbumChange}
                    handleCurrentAlbumCoverChange={
                      handleCurrentAlbumCoverChange
                    }
                    handleCurrentAlbumCoverClear={handleCurrentAlbumCoverClear}
                    handleCurrentAlbumSave={handleCurrentAlbumSave}
                    isSavingContent={isSavingContent}
                    successfulAction={successfulAction}
                  />
                }
              </AdminPanel>

              {hasSiteEventsConfig ? (
                <AdminPanel
                  eyebrow="03 / Calendar"
                  id="admin-events-panel"
                  isOpen={activePanel === "events"}
                  summary={
                    nextUpcomingEvent
                      ? `${nextUpcomingEvent.displayDate} · ${nextUpcomingEvent.title}`
                      : "No event posted"
                  }
                  title="Events"
                  onToggle={() => toggleAdminPanel("events")}
                >
                  {
                    <EventsManager
                      canManage={canManage}
                      editingEventId={editingEventId}
                      eventForm={eventForm}
                      getSubmitLabel={getSubmitLabel}
                      handleEventChange={handleEventChange}
                      handleEventEdit={handleEventEdit}
                      handleEventSave={handleEventSave}
                      hasSiteEventsConfig={hasSiteEventsConfig}
                      isSavingContent={isSavingContent}
                      requestEventDelete={requestEventDelete}
                      resetEventForm={resetEventForm}
                      sortedSiteEvents={sortedSiteEvents}
                      successfulAction={successfulAction}
                    />
                  }
                </AdminPanel>
              ) : null}

              <AdminPanel
                eyebrow="04 / FIFO 05"
                id="admin-shelf-panel"
                isOpen={activePanel === "shelf"}
                summary={`${shelfAlbums.length}/5 slots · automatic queue`}
                title="Record shelf"
                onToggle={() => toggleAdminPanel("shelf")}
              >
                {
                  <ShelfManager
                    canManage={canManage}
                    cancelShelfCuration={cancelShelfCuration}
                    error={error}
                    getSubmitLabel={getSubmitLabel}
                    handleShelfArtistChange={handleShelfArtistChange}
                    handleShelfArtistSave={handleShelfArtistSave}
                    handleShelfCoverClear={handleShelfCoverClear}
                    handleShelfCoverFileChange={handleShelfCoverFileChange}
                    handleShelfCoverUpload={handleShelfCoverUpload}
                    isLoadingShelfCovers={isLoadingShelfCovers}
                    isSavingShelfCover={isSavingShelfCover}
                    isShelfCurating={isShelfCurating}
                    message={message}
                    moveShelfAlbum={moveShelfAlbum}
                    saveShelfOrder={saveShelfOrder}
                    selectedShelfAlbumId={selectedShelfAlbumId}
                    setIsShelfCurating={setIsShelfCurating}
                    setSelectedShelfAlbumId={setSelectedShelfAlbumId}
                    shelfAlbums={shelfAlbums}
                    shelfArtistDrafts={shelfArtistDrafts}
                    shelfCoverFile={shelfCoverFile}
                    shelfCoverInputRef={shelfCoverInputRef}
                    shelfCoverOverrides={shelfCoverOverrides}
                    successfulAction={successfulAction}
                  />
                }
              </AdminPanel>

              <AdminPanel
                eyebrow="05 / Access desk"
                id="admin-members-panel"
                isOpen={activePanel === "members"}
                summary={`${formatCount(pendingMembers.length, "pending request")} · ${formatCount(approvedMemberCount, "active member")}`}
                title="Member access"
                onToggle={() => toggleAdminPanel("members")}
              >
                {
                  <MemberManager
                    accountFilter={accountFilter}
                    accountFilters={accountFilters}
                    adminCount={adminCount}
                    authReady={authReady}
                    busyMemberIds={busyMemberIds}
                    canManage={canManage}
                    currentMemberPage={currentMemberPage}
                    error={error}
                    getSubmitLabel={getSubmitLabel}
                    handleMemberTabChange={handleMemberTabChange}
                    hasSupabaseConfig={hasSupabaseConfig}
                    isLoadingMembers={isLoadingMembers}
                    memberMessage={memberMessage}
                    memberSearch={memberSearch}
                    memberTab={memberTab}
                    pagedMembers={pagedMembers}
                    pendingMembers={pendingMembers}
                    requestBulkReject={requestBulkReject}
                    runBulkMemberStatus={runBulkMemberStatus}
                    selectedMemberIds={selectedMemberIds}
                    session={session}
                    setAccountFilter={setAccountFilter}
                    setMemberPage={setMemberPage}
                    setMemberSearch={setMemberSearch}
                    setSelectedMemberIds={setSelectedMemberIds}
                    successfulAction={successfulAction}
                    toggleAllVisibleMembers={toggleAllVisibleMembers}
                    toggleMemberSelection={toggleMemberSelection}
                    totalMemberPages={totalMemberPages}
                    updateMembership={updateMembership}
                    visibleMembers={visibleMembers}
                  />
                }
              </AdminPanel>
            </div>
          </>
        ) : (
          <MemberManager
            accountFilter={accountFilter}
            accountFilters={accountFilters}
            adminCount={adminCount}
            authReady={authReady}
            busyMemberIds={busyMemberIds}
            canManage={canManage}
            currentMemberPage={currentMemberPage}
            error={error}
            getSubmitLabel={getSubmitLabel}
            handleMemberTabChange={handleMemberTabChange}
            hasSupabaseConfig={hasSupabaseConfig}
            isLoadingMembers={isLoadingMembers}
            memberMessage={memberMessage}
            memberSearch={memberSearch}
            memberTab={memberTab}
            pagedMembers={pagedMembers}
            pendingMembers={pendingMembers}
            requestBulkReject={requestBulkReject}
            runBulkMemberStatus={runBulkMemberStatus}
            selectedMemberIds={selectedMemberIds}
            session={session}
            setAccountFilter={setAccountFilter}
            setMemberPage={setMemberPage}
            setMemberSearch={setMemberSearch}
            setSelectedMemberIds={setSelectedMemberIds}
            successfulAction={successfulAction}
            toggleAllVisibleMembers={toggleAllVisibleMembers}
            toggleMemberSelection={toggleMemberSelection}
            totalMemberPages={totalMemberPages}
            updateMembership={updateMembership}
            visibleMembers={visibleMembers}
          />
        )}
      </main>

      {toast ? (
        <div
          className={`admin-toast admin-toast-${toast.type}`}
          role={toast.type === "error" ? "alert" : "status"}
        >
          <span aria-hidden="true" />
          <p>{toast.message}</p>
          <button
            aria-label="Dismiss notification"
            type="button"
            onClick={() => setToast(null)}
          >
            Close
          </button>
        </div>
      ) : null}

      {confirmation ? (
        <div
          className="admin-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isConfirming) {
              dismissConfirmation();
            }
          }}
        >
          <div
            aria-describedby="admin-confirm-description"
            aria-labelledby="admin-confirm-title"
            aria-modal="true"
            className="admin-dialog"
            ref={confirmationDialogRef}
            role="dialog"
          >
            <span className="admin-terminal-label">
              {confirmation.eyebrow || "Confirmation required"}
            </span>
            <h2 id="admin-confirm-title">{confirmation.title}</h2>
            <p id="admin-confirm-description">{confirmation.description}</p>
            <div className="admin-action-row">
              <button
                autoFocus
                className="button button-secondary"
                type="button"
                disabled={isConfirming}
                onClick={dismissConfirmation}
              >
                Cancel
              </button>
              <button
                className={`button ${confirmation.intent === "primary" ? "button-primary" : "button-danger"}`}
                type="button"
                disabled={isConfirming}
                onClick={confirmPendingAction}
              >
                {isConfirming ? "Working..." : confirmation.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default Admin;
