import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  getRecentShelfAlbums,
  loadRecordShelfAlbums,
  loadRecordShelfCoverOverrides,
  RECORD_SHELF_BUCKET,
  saveRecordShelfAlbums,
} from "../lib/recordShelf";
import {
  ALBUM_COVER_ACCEPT,
  saveCurrentAlbumWithCover,
  validateAlbumCoverFile,
} from "../lib/albumCoverUpload";
import {
  createEventId,
  emptyEventForm,
  eventToUpsertPayload,
  validateEventForm,
} from "../lib/siteContent";
import {
  executeAdminPhaseAction,
  getAdminActionErrorMessage,
} from "../lib/adminActions";
import { getRequiredFinalistCount } from "../lib/votingLogic";
import { formatAverageRating } from "../lib/currentAlbumRating";

function isAdmin(membership) {
  return membership?.status === "approved" && membership?.role === "admin";
}

const MEMBERS_PER_PAGE = 10;

const ADMIN_PANELS = [
  { id: "poll", label: "Poll", target: "admin-poll" },
  { id: "album", label: "Current album", target: "admin-current-album-panel" },
  { id: "events", label: "Events", target: "admin-events-panel" },
  { id: "shelf", label: "Record shelf", target: "admin-shelf-panel" },
  { id: "members", label: "Members", target: "admin-members-panel" },
];

function ChevronIcon({ isOpen }) {
  return (
    <svg aria-hidden="true" className={isOpen ? "is-open" : ""} viewBox="0 0 20 20">
      <path d="m5 7.5 5 5 5-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </svg>
  );
}

function AdminPanel({ children, eyebrow, id, isOpen, onToggle, summary, title }) {
  const bodyId = `${id}-body`;

  return (
    <section className={`admin-workspace-panel ${isOpen ? "is-open" : ""}`} id={id}>
      <button
        aria-controls={bodyId}
        aria-expanded={isOpen}
        className="admin-panel-trigger"
        type="button"
        onClick={onToggle}
      >
        <span className="admin-panel-index">{eyebrow}</span>
        <span className="admin-panel-heading">
          <strong>{title}</strong>
          <small>{summary}</small>
        </span>
        <ChevronIcon isOpen={isOpen} />
      </button>
      <div aria-hidden={!isOpen} className="admin-panel-reveal" id={bodyId}>
        <div className="admin-panel-reveal-inner" inert={!isOpen ? true : undefined}>
          {children}
        </div>
      </div>
    </section>
  );
}

function formatCount(count, noun) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function formatPhaseLabel(phase) {
  return phase.charAt(0).toUpperCase() + phase.slice(1);
}

function getFirstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function getNonNegativeInteger(value) {
  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) && parsedValue >= 0
    ? Math.trunc(parsedValue)
    : null;
}

function getCurrentBallotCount(results, poll, phase) {
  const resultCounts = results?.ballotCounts || results?.ballot_counts;
  const pollCounts = poll?.ballotCounts || poll?.ballot_counts;
  const camelPhase = `${phase}BallotCount`;
  const snakePhase = `${phase}_ballot_count`;

  return getNonNegativeInteger(getFirstDefined(
    resultCounts?.[phase],
    resultCounts?.[camelPhase],
    resultCounts?.[snakePhase],
    results?.[camelPhase],
    results?.[snakePhase],
    results?.currentBallotCount,
    results?.current_ballot_count,
    pollCounts?.[phase],
    poll?.[camelPhase],
    poll?.[snakePhase],
  ));
}

function getFinalVotingState(results, poll, now) {
  const resultState = results?.finalVoting || results?.final_voting || {};
  const pollState = poll?.finalVoting || poll?.final_voting || {};
  const openedAt = getFirstDefined(
    resultState.openedAt,
    resultState.opened_at,
    results?.finalOpenedAt,
    results?.final_opened_at,
    pollState.openedAt,
    pollState.opened_at,
    poll?.finalOpenedAt,
    poll?.final_opened_at,
  );
  const closesAt = getFirstDefined(
    resultState.closesAt,
    resultState.closes_at,
    results?.finalClosesAt,
    results?.final_closes_at,
    pollState.closesAt,
    pollState.closes_at,
    poll?.finalClosesAt,
    poll?.final_closes_at,
  );
  const closedAt = getFirstDefined(
    resultState.closedAt,
    resultState.closed_at,
    results?.finalClosedAt,
    results?.final_closed_at,
    pollState.closedAt,
    pollState.closed_at,
    poll?.finalClosedAt,
    poll?.final_closed_at,
  );
  const explicitClosed = getFirstDefined(
    resultState.isClosed,
    resultState.is_closed,
    results?.finalIsClosed,
    results?.final_is_closed,
    results?.isFinalClosed,
    results?.is_final_closed,
    pollState.isClosed,
    pollState.is_closed,
    poll?.finalIsClosed,
    poll?.final_is_closed,
    poll?.isFinalClosed,
    poll?.is_final_closed,
  );
  const closesAtTime = closesAt ? Date.parse(closesAt) : Number.NaN;
  const hasExplicitClosedValue = explicitClosed !== undefined && explicitClosed !== null;
  const explicitClosedValue = explicitClosed === true || explicitClosed === "true";

  return {
    closedAt,
    closesAt,
    isAvailable: Boolean(
      openedAt || closesAt || closedAt || explicitClosed !== undefined,
    ),
    isClosed: hasExplicitClosedValue
      ? explicitClosedValue
      : Boolean(closedAt) || (
          Number.isFinite(closesAtTime) && closesAtTime <= now
        ),
    openedAt,
  };
}

function formatAdminTimestamp(value, { includeDate = false } = {}) {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(undefined, {
    ...(includeDate ? { day: "numeric", month: "short" } : {}),
    hour: "numeric",
    minute: "2-digit",
    second: includeDate ? undefined : "2-digit",
  }).format(date);
}

function formatFinalCountdown(closesAt, now) {
  const closesAtTime = closesAt ? Date.parse(closesAt) : Number.NaN;

  if (!Number.isFinite(closesAtTime)) {
    return "Schedule unavailable";
  }

  const remainingMinutes = Math.max(0, Math.ceil((closesAtTime - now) / 60_000));

  if (remainingMinutes === 0) {
    return "Deadline reached";
  }

  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;

  return hours > 0
    ? `${hours}h ${minutes}m remaining`
    : `${minutes}m remaining`;
}

function getAdminActionDisplayError(action, actionError) {
  const message = `${actionError?.code || ""} ${actionError?.message || ""}`.toLowerCase();
  const isMissingFunction = actionError?.code === "PGRST202" || (
    message.includes("function") && (
      message.includes("could not find") ||
      message.includes("does not exist") ||
      message.includes("schema cache")
    )
  );

  if (isMissingFunction && action === "resolve_irv_tie") {
    return "Tie-break controls need the latest Supabase event migration. No result was changed.";
  }

  if (isMissingFunction && action === "close_final_voting") {
    return "Final close controls need the latest Supabase event migration. Voting is still open.";
  }

  return getAdminActionErrorMessage(actionError);
}

function getMemberName(member) {
  return member.display_name || "Unnamed member";
}

function createPollId(cycleLabel) {
  const slug = cycleLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return slug ? `poll-${slug}` : `poll-${new Date().toISOString().slice(0, 10)}`;
}

function getNextUpcomingEvent(siteEvents) {
  return siteEvents.find((eventItem) => eventItem.status === "upcoming") || siteEvents[0];
}

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
  const [memberships, setMemberships] = useState([]);
  const [results, setResults] = useState(null);
  const [selectedFinalistIds, setSelectedFinalistIds] = useState([]);
  const [selectedTieCandidateId, setSelectedTieCandidateId] = useState("");
  const [lastResultsRefreshedAt, setLastResultsRefreshedAt] = useState(null);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [currentAlbumForm, setCurrentAlbumForm] = useState({
    title: poll.albumOfWeek.title || "",
    artist: poll.albumOfWeek.artist || "",
    note: poll.albumOfWeek.note || "Current club listen",
    coverUrl: poll.albumOfWeek.coverUrl || "",
  });
  const [currentAlbumCoverFile, setCurrentAlbumCoverFile] = useState(null);
  const [currentAlbumCoverPreviewUrl, setCurrentAlbumCoverPreviewUrl] = useState("");
  const [currentAlbumError, setCurrentAlbumError] = useState(null);
  const [currentAlbumMessage, setCurrentAlbumMessage] = useState(null);
  const [eventForm, setEventForm] = useState(emptyEventForm);
  const [editingEventId, setEditingEventId] = useState(null);
  const [newPoll, setNewPoll] = useState({
    cycleLabel: "",
    pollId: "",
    question: "What should the club listen to next?",
    description: "Submit one album and artist pairing for the next club session.",
    albumTitle: "",
    albumArtist: "",
  });
  const [memberTab, setMemberTab] = useState("pending");
  const [accountFilter, setAccountFilter] = useState("active");
  const [memberSearch, setMemberSearch] = useState("");
  const [memberPage, setMemberPage] = useState(1);
  const [activePanel, setActivePanel] = useState("poll");
  const [isCreatePollOpen, setIsCreatePollOpen] = useState(false);
  const [isShelfCurating, setIsShelfCurating] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [busyMemberIds, setBusyMemberIds] = useState([]);
  const [successfulAction, setSuccessfulAction] = useState(null);
  const [toast, setToast] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [selectedShelfAlbumId, setSelectedShelfAlbumId] = useState("");
  const [shelfArtistDrafts, setShelfArtistDrafts] = useState({});
  const [shelfCoverFile, setShelfCoverFile] = useState(null);
  const [shelfCoverOverrides, setShelfCoverOverrides] = useState({});
  const [isLoadingShelfCovers, setIsLoadingShelfCovers] = useState(false);
  const [isSavingShelfCover, setIsSavingShelfCover] = useState(false);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [isSavingPhase, setIsSavingPhase] = useState(false);
  const [activePhaseAction, setActivePhaseAction] = useState(null);
  const [isSavingContent, setIsSavingContent] = useState(false);
  const [message, setMessage] = useState(null);
  const [memberMessage, setMemberMessage] = useState(null);
  const [error, setError] = useState(null);
  const [phaseFeedback, setPhaseFeedback] = useState(null);
  const fallbackShelfAlbums = useMemo(() => getRecentShelfAlbums(), []);
  const [shelfAlbums, setShelfAlbums] = useState(fallbackShelfAlbums);
  const phaseActionRef = useRef(null);
  const resultsRequestRef = useRef(0);
  const adminMainRef = useRef(null);
  const confirmationDialogRef = useRef(null);
  const confirmationTriggerRef = useRef(null);
  const isConfirmingRef = useRef(false);
  const currentAlbumCoverInputRef = useRef(null);
  const shelfCoverInputRef = useRef(null);
  const successTimerRef = useRef(null);

  const canManage = hasSupabaseConfig && isAdmin(membership);
  const selectedShelfAlbum = shelfAlbums.find((album) => album.id === selectedShelfAlbumId) || shelfAlbums[0];
  const primaryRows = useMemo(() => results?.primaryResults || [], [results?.primaryResults]);
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
  const sortedSiteEvents = useMemo(
    () =>
      [...siteEvents].sort((a, b) => {
        if (a.status !== b.status) {
          return a.status === "upcoming" ? -1 : 1;
        }

        return a.date.localeCompare(b.date);
      }),
    [siteEvents],
  );
  const adminCount = memberships.filter(
    (member) => member.status === "approved" && member.role === "admin",
  ).length;
  const approvedMemberCount = memberships.filter((member) => member.status === "approved").length;
  const pendingMembers = memberships.filter((member) => member.status === "pending");
  const nextUpcomingEvent = getNextUpcomingEvent(sortedSiteEvents);
  const accountFilters = [
    { id: "active", label: "Active members" },
    { id: "admins", label: "Admins" },
    { id: "pending", label: "Pending" },
    { id: "rejected", label: "Rejected" },
    { id: "all", label: "All" },
  ];
  const visibleMembers = useMemo(() => {
    const sourceMembers =
      memberTab === "pending"
        ? pendingMembers
        : memberships.filter((member) => {
            if (accountFilter === "active") {
              return member.status === "approved";
            }

            if (accountFilter === "admins") {
              return member.status === "approved" && member.role === "admin";
            }

            if (accountFilter === "pending") {
              return member.status === "pending";
            }

            if (accountFilter === "rejected") {
              return member.status === "rejected";
            }

            return true;
          });
    const normalizedSearch = memberSearch.trim().toLowerCase();

    if (!normalizedSearch) {
      return sourceMembers;
    }

    return sourceMembers.filter((member) =>
      getMemberName(member).toLowerCase().includes(normalizedSearch),
    );
  }, [accountFilter, memberSearch, memberTab, memberships, pendingMembers]);
  const totalMemberPages = Math.max(1, Math.ceil(visibleMembers.length / MEMBERS_PER_PAGE));
  const currentMemberPage = Math.min(memberPage, totalMemberPages);
  const pagedMembers = visibleMembers.slice(
    (currentMemberPage - 1) * MEMBERS_PER_PAGE,
    currentMemberPage * MEMBERS_PER_PAGE,
  );

  const loadResults = useCallback(async () => {
    if (!canManage || !poll?.id) {
      return;
    }

    const requestId = resultsRequestRef.current + 1;
    resultsRequestRef.current = requestId;
    setIsLoadingResults(true);
    setError(null);

    const { data, error: loadError } = await supabase.rpc("get_admin_poll_results", {
      target_poll_id: poll.id,
    });

    if (requestId !== resultsRequestRef.current) {
      return;
    }

    if (loadError) {
      setError(loadError.message);
      setResults(null);
    } else {
      setResults(data);
      setLastResultsRefreshedAt(Date.now());
      const finalistIds = (data?.finalists || []).map((candidate) => candidate.id);
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
    if (!canManage) {
      return;
    }

    let isMounted = true;

    async function loadMemberships() {
      setIsLoadingMembers(true);
      setError(null);

      const { data, error: loadError } = await supabase
        .from("memberships")
        .select("user_id, email, display_name, status, role, created_at, updated_at")
        .order("created_at", { ascending: false });

      if (!isMounted) {
        return;
      }

      if (loadError) {
        setError(loadError.message);
      } else {
        setMemberships(data);
      }

      setIsLoadingMembers(false);
    }

    loadMemberships();

    return () => {
      isMounted = false;
    };
  }, [canManage, supabase]);

  useEffect(() => {
    resultsRequestRef.current += 1;
    setResults(null);
    setSelectedFinalistIds([]);
    setCurrentAlbumForm({
      title: poll.albumOfWeek.title || "",
      artist: poll.albumOfWeek.artist || "",
      note: poll.albumOfWeek.note || "Current club listen",
      coverUrl: poll.albumOfWeek.coverUrl || "",
    });
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
    const intervalId = window.setInterval(() => setClockNow(Date.now()), 30_000);

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

      const focusableElements = [...(confirmationDialogRef.current?.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) || [])];

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
    const previousInertStates = backgroundElements.map((element) => element.inert);

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

  const loadShelfCovers = useCallback(async () => {
    if (!canManage) {
      return;
    }

    setIsLoadingShelfCovers(true);
    const overrides = await loadRecordShelfCoverOverrides(
      supabase,
      hasSupabaseConfig,
      shelfAlbums.map((album) => album.id),
    );
    setShelfCoverOverrides(overrides);
    setShelfArtistDrafts(
      Object.fromEntries(
        shelfAlbums.map((album) => [album.id, overrides[album.id]?.artist_override || ""]),
      ),
    );
    setIsLoadingShelfCovers(false);
  }, [canManage, hasSupabaseConfig, shelfAlbums, supabase]);

  useEffect(() => {
    let isMounted = true;

    loadRecordShelfAlbums(supabase, hasSupabaseConfig, fallbackShelfAlbums).then((albums) => {
      if (isMounted) {
        setShelfAlbums(albums);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [fallbackShelfAlbums, hasSupabaseConfig, supabase]);

  useEffect(() => {
    if (!selectedShelfAlbumId && shelfAlbums.length) {
      setSelectedShelfAlbumId(shelfAlbums[0].id);
    }
  }, [selectedShelfAlbumId, shelfAlbums]);

  useEffect(() => {
    loadShelfCovers();
  }, [loadShelfCovers]);

  useEffect(() => {
    setMemberPage(1);
  }, [accountFilter, memberSearch, memberTab]);

  useEffect(() => {
    setCurrentAlbumForm({
      title: poll.albumOfWeek.title || "",
      artist: poll.albumOfWeek.artist || "",
      note: poll.albumOfWeek.note || "Current club listen",
      coverUrl: poll.albumOfWeek.coverUrl || "",
    });
  }, [poll.albumOfWeek]);

  useEffect(() => {
    if (!poll.winnerPublishedAt || !publishedWinner?.title || !publishedWinner?.artist) {
      return;
    }

    setNewPoll((currentForm) => ({
      ...currentForm,
      albumTitle: currentForm.albumTitle || publishedWinner.title,
      albumArtist: currentForm.albumArtist || publishedWinner.artist,
    }));
  }, [poll.winnerPublishedAt, publishedWinner?.artist, publishedWinner?.title]);

  useEffect(() => {
    if (!currentAlbumCoverFile) {
      setCurrentAlbumCoverPreviewUrl("");
      return undefined;
    }

    const previewUrl = URL.createObjectURL(currentAlbumCoverFile);
    setCurrentAlbumCoverPreviewUrl(previewUrl);

    return () => URL.revokeObjectURL(previewUrl);
  }, [currentAlbumCoverFile]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => () => {
    if (successTimerRef.current) {
      window.clearTimeout(successTimerRef.current);
    }
  }, []);

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
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
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

      if (name === "cycleLabel" && (!currentPoll.pollId || currentPoll.pollId === createPollId(currentPoll.cycleLabel))) {
        nextPoll.pollId = createPollId(value);
      }

      return nextPoll;
    });
  }

  async function handleCreatePoll(event) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!newPoll.pollId || !newPoll.cycleLabel || !newPoll.albumTitle || !newPoll.albumArtist) {
      setError("Add a poll id, cycle label, album title, and artist before creating a poll.");
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
    showConfirmation("New weekly poll created and nominations are open.", "create-poll");
    setIsCreatePollOpen(false);
    setNewPoll({
      cycleLabel: "",
      pollId: "",
      question: "What should the club listen to next?",
      description: "Submit one album and artist pairing for the next club session.",
      albumTitle: "",
      albumArtist: "",
    });
    setResults(null);
    setSelectedFinalistIds([]);
    await refreshPoll();
  }

  function handleMemberTabChange(nextTab) {
    setMemberTab(nextTab);

    if (nextTab === "all" && memberTab !== "all") {
      setAccountFilter("active");
    }
  }

  function getMembershipActionLabel(updates) {
    if (updates.status === "approved") {
      return "Account approved.";
    }

    if (updates.status === "rejected") {
      return "Account rejected.";
    }

    if (updates.status === "pending") {
      return "Account moved back to pending.";
    }

    if (updates.role === "admin") {
      return "Admin role added.";
    }

    if (updates.role === "member") {
      return "Admin role removed.";
    }

    return "Membership updated.";
  }

  async function updateMembership(userId, updates, { quiet = false } = {}) {
    setError(null);
    setMessage(null);
    setMemberMessage(null);
    setBusyMemberIds((currentIds) => [...new Set([...currentIds, userId])]);

    if (updates.role === "member") {
      const targetMember = memberships.find((member) => member.user_id === userId);

      if (targetMember?.role === "admin" && adminCount <= 1) {
        setError("You cannot remove the last admin.");
        showFailure("You cannot remove the last admin.");
        setBusyMemberIds((currentIds) => currentIds.filter((id) => id !== userId));
        return false;
      }
    }

    const { data, error: updateError } = await supabase
      .from("memberships")
      .update(updates)
      .eq("user_id", userId)
      .select("user_id, email, display_name, status, role, created_at, updated_at")
      .single();

    if (updateError) {
      setError(updateError.message);
      showFailure(updateError.message);
      setBusyMemberIds((currentIds) => currentIds.filter((id) => id !== userId));
      return false;
    }

    setMemberships((currentMemberships) =>
      currentMemberships.map((currentMembership) =>
        currentMembership.user_id === userId ? data : currentMembership,
      ),
    );
    const actionMessage = getMembershipActionLabel(updates);
    if (!quiet) {
      setMemberMessage(actionMessage);
      showConfirmation(actionMessage, `member-${userId}`);
    }
    setBusyMemberIds((currentIds) => currentIds.filter((id) => id !== userId));
    setSelectedMemberIds((currentIds) => currentIds.filter((id) => id !== userId));
    return true;
  }

  function toggleMemberSelection(userId) {
    setSelectedMemberIds((currentIds) =>
      currentIds.includes(userId)
        ? currentIds.filter((id) => id !== userId)
        : [...currentIds, userId],
    );
  }

  function toggleAllVisibleMembers() {
    const visibleIds = pagedMembers.map((member) => member.user_id);
    const allSelected = visibleIds.every((id) => selectedMemberIds.includes(id));

    setSelectedMemberIds((currentIds) => {
      if (allSelected) {
        return currentIds.filter((id) => !visibleIds.includes(id));
      }

      return [...new Set([...currentIds, ...visibleIds])];
    });
  }

  async function runBulkMemberStatus(status) {
    const targetIds = selectedMemberIds.filter((id) =>
      memberships.some((member) => member.user_id === id && member.status !== status),
    );

    if (!targetIds.length) {
      return;
    }

    setBusyMemberIds((currentIds) => [...new Set([...currentIds, ...targetIds])]);
    const { data, error: updateError } = await supabase
      .from("memberships")
      .update({ status })
      .in("user_id", targetIds)
      .select("user_id, email, display_name, status, role, created_at, updated_at");

    setBusyMemberIds((currentIds) => currentIds.filter((id) => !targetIds.includes(id)));

    if (updateError) {
      setError(updateError.message);
      showFailure(updateError.message);
      return;
    }

    const updatesById = new Map(data.map((member) => [member.user_id, member]));
    setMemberships((currentMemberships) =>
      currentMemberships.map((member) => updatesById.get(member.user_id) || member),
    );
    setSelectedMemberIds([]);
    const successMessage = `${formatCount(targetIds.length, "account")} ${status === "approved" ? "approved" : "rejected"}.`;
    setMemberMessage(successMessage);
    showConfirmation(successMessage, `bulk-${status}`);
  }

  function openConfirmation(nextConfirmation) {
    confirmationTriggerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setConfirmation(nextConfirmation);
  }

  function dismissConfirmation() {
    if (!isConfirmingRef.current) {
      setConfirmation(null);
    }
  }

  function requestBulkReject() {
    openConfirmation({
      confirmLabel: `Reject ${selectedMemberIds.length}`,
      description: "These accounts will lose club access. You can restore them to pending later.",
      onConfirm: () => runBulkMemberStatus("rejected"),
      title: `Reject ${formatCount(selectedMemberIds.length, "selected account")}?`,
    });
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
      const actionErrorMessage = actionError?.message || "The action could not be completed.";
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
        const actionErrorMessage = getAdminActionDisplayError(action, outcome.error);
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
      const actionErrorMessage = getAdminActionDisplayError(action, actionError);
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
      onConfirm: () => runAdminAction(
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
      onConfirm: () => runAdminAction(
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
    const candidate = finalRows.find((row) => row.id === selectedTieCandidateId);

    if (!candidate || !irvTie) {
      return;
    }

    const isProvisional = finalVotingState.isAvailable && !finalVotingState.isClosed;

    openConfirmation({
      confirmLabel: isProvisional
        ? `Provisionally eliminate ${candidate.title}`
        : `Eliminate ${candidate.title}`,
      description: isProvisional
        ? `${candidate.title} by ${candidate.artist} will be used as the provisional manual elimination for round ${irvTie.round}. The next accepted final ballot will automatically clear this decision and recalculate the ranked-choice count.`
        : `${candidate.title} by ${candidate.artist} will be permanently recorded as the manual elimination for round ${irvTie.round}. The ranked-choice count will then continue and may produce another tie.`,
      eyebrow: "Manual IRV tie-break",
      intent: "danger",
      onConfirm: () => runAdminAction(
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
      description: `This immediately stops every new final ballot, before the automatic deadline${finalVotingState.closesAt ? ` at ${formatAdminTimestamp(finalVotingState.closesAt, { includeDate: true })}` : ""}. Existing ballots stay counted, and the poll cannot be reopened from this page.`,
      eyebrow: "Permanent voting cutoff",
      intent: "danger",
      onConfirm: () => runAdminAction(
        "close_final_voting",
        "Final voting is closed. Results are now official.",
      ),
      title: "Close final voting now?",
    });
  }

  function handleCurrentAlbumChange(event) {
    const { name, value } = event.target;

    setCurrentAlbumForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));
  }

  function handleCurrentAlbumCoverChange(event) {
    const file = event.target.files?.[0] || null;
    const validationError = file ? validateAlbumCoverFile(file) : null;

    setCurrentAlbumError(validationError);
    setCurrentAlbumMessage(null);

    if (validationError) {
      event.target.value = "";
      setCurrentAlbumCoverFile(null);
      return;
    }

    setCurrentAlbumCoverFile(file);
  }

  function handleCurrentAlbumCoverClear() {
    if (currentAlbumCoverInputRef.current) {
      currentAlbumCoverInputRef.current.value = "";
    }

    setCurrentAlbumCoverFile(null);
    setCurrentAlbumForm((currentForm) => ({
      ...currentForm,
      coverUrl: "",
    }));
    setCurrentAlbumError(null);
    setCurrentAlbumMessage(null);
  }

  async function handleCurrentAlbumSave(event) {
    event.preventDefault();
    setCurrentAlbumError(null);
    setCurrentAlbumMessage(null);

    if (!currentAlbumForm.title.trim() || !currentAlbumForm.artist.trim()) {
      setCurrentAlbumError("Add a current album title and artist before saving.");
      return;
    }

    const validationError = currentAlbumCoverFile
      ? validateAlbumCoverFile(currentAlbumCoverFile)
      : null;

    if (validationError) {
      setCurrentAlbumError(validationError);
      return;
    }

    setIsSavingContent(true);

    try {
      const { coverUrl: nextCoverUrl, uploaded } = await saveCurrentAlbumWithCover({
        album: currentAlbumForm,
        bucket: RECORD_SHELF_BUCKET,
        coverFile: currentAlbumCoverFile,
        currentCoverUrl: currentAlbumForm.coverUrl,
        pollId: poll.id,
        supabase,
      });

      setCurrentAlbumForm((currentForm) => ({
        ...currentForm,
        coverUrl: nextCoverUrl || "",
      }));
      setCurrentAlbumCoverFile(null);
      if (currentAlbumCoverInputRef.current) {
        currentAlbumCoverInputRef.current.value = "";
      }
      setCurrentAlbumMessage(
        uploaded ? "Current album and cover updated." : "Current album updated.",
      );
      showConfirmation(
        uploaded ? "Current album and cover updated." : "Current album updated.",
        "current-album",
      );
      try {
        await refreshPoll();
      } catch {
        setCurrentAlbumError(
          "The album was saved, but the page could not refresh. Reload to see the latest version.",
        );
      }
    } catch (saveError) {
      const saveErrorMessage = saveError.message || "The current album could not be updated. Try again.";
      setCurrentAlbumError(saveErrorMessage);
      showFailure(saveErrorMessage);
    } finally {
      setIsSavingContent(false);
    }
  }

  function handleEventChange(event) {
    const { name, value } = event.target;

    setEventForm((currentForm) => {
      const nextForm = {
        ...currentForm,
        [name]: value,
      };

      if ((name === "title" || name === "date") && (!currentForm.id || currentForm.id === createEventId(currentForm.title, currentForm.date))) {
        nextForm.id = createEventId(name === "title" ? value : currentForm.title, name === "date" ? value : currentForm.date);
      }

      return nextForm;
    });
  }

  function handleEventEdit(eventItem) {
    setEditingEventId(eventItem.id);
    setEventForm({
      id: eventItem.id,
      title: eventItem.title,
      date: eventItem.date,
      displayDate: eventItem.displayDate,
      time: eventItem.time,
      location: eventItem.location,
      status: eventItem.status,
      tag: eventItem.tag,
      description: eventItem.description,
    });
  }

  function resetEventForm() {
    setEditingEventId(null);
    setEventForm(emptyEventForm);
  }

  async function handleEventSave(event) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const validation = validateEventForm(eventForm);

    if (!validation.isValid) {
      setError(validation.message);
      return;
    }

    setIsSavingContent(true);

    const { error: saveError } = await supabase
      .from("site_events")
      .upsert(eventToUpsertPayload(eventForm), { onConflict: "id" });

    setIsSavingContent(false);

    if (saveError) {
      setError(saveError.message);
      showFailure(saveError.message);
      return;
    }

    const successMessage = editingEventId ? "Event updated." : "Event added.";
    setMessage(successMessage);
    showConfirmation(successMessage, "event-save");
    resetEventForm();
    await refreshEvents();
  }

  async function handleEventDelete(eventId) {
    setError(null);
    setMessage(null);
    setIsSavingContent(true);

    const { error: deleteError } = await supabase
      .from("site_events")
      .delete()
      .eq("id", eventId);

    setIsSavingContent(false);

    if (deleteError) {
      setError(deleteError.message);
      showFailure(deleteError.message);
      return;
    }

    if (editingEventId === eventId) {
      resetEventForm();
    }

    setMessage("Event deleted.");
    showConfirmation("Event deleted.", "event-delete");
    await refreshEvents();
  }

  function requestEventDelete(eventItem) {
    openConfirmation({
      confirmLabel: "Delete event",
      description: `${eventItem.title} will be removed from the home page and events page.`,
      onConfirm: () => handleEventDelete(eventItem.id),
      title: "Delete this event?",
    });
  }

  function renderAdminSnapshot() {
    if (!canManage) {
      return null;
    }

    const phaseMetric = {
      label: `${formatPhaseLabel(poll.phase)} ballots`,
      value: currentBallotCount ?? "—",
      detail: currentBallotCount === null
        ? "authoritative count unavailable"
        : "unique submitted ballots",
    };

    const snapshotItems = [
      {
        label: "Phase",
        value: formatPhaseLabel(poll.phase),
        detail: poll.status,
      },
      {
        label: "Pending",
        value: pendingMembers.length,
        detail: "accounts waiting",
      },
      {
        label: "Members",
        value: approvedMemberCount,
        detail: `${formatCount(adminCount, "admin")} approved`,
      },
      phaseMetric,
    ];

    return (
      <article className="surface-card vote-form-card admin-snapshot-panel">
        <div className="form-header">
          <div>
            <span className="phase-pill phase-primary">Snapshot</span>
            <h2>Operational snapshot</h2>
          </div>
          <p>Current voting, member, and event signals at a glance.</p>
        </div>

        <div className="admin-snapshot-grid">
          {snapshotItems.map((item) => (
            <article className="admin-snapshot-card" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>

        <div className="admin-next-event">
          <span>Next event</span>
          <strong>{nextUpcomingEvent?.title || "No event posted"}</strong>
          <p>
            {nextUpcomingEvent
              ? `${nextUpcomingEvent.displayDate} at ${nextUpcomingEvent.time} - ${nextUpcomingEvent.location}`
              : "Add an event when the next club plan is ready."}
          </p>
        </div>

        <div className="admin-action-row admin-snapshot-actions">
          <button className="button button-secondary" type="button" onClick={() => openAdminPanel("members", "admin-members-panel")}>
            Review members
          </button>
          {hasSiteEventsConfig ? (
            <button className="button button-secondary" type="button" onClick={() => openAdminPanel("events", "admin-events-panel")}>
              Manage events
            </button>
          ) : null}
          <button className="button button-secondary" type="button" onClick={() => openAdminPanel("poll", "admin-poll")}>
            View results
          </button>
          <button className="button button-primary" type="button" onClick={() => {
            setIsCreatePollOpen(true);
            openAdminPanel("poll", "admin-create-poll");
          }}>
            Create poll
          </button>
        </div>
      </article>
    );
  }

  function renderCreatePoll() {
    if (!canManage) {
      return null;
    }

    return (
      <article className="surface-card vote-form-card admin-create-poll" id="admin-create-poll">
        <div className="admin-create-poll-intro">
          <div>
            <span className="admin-terminal-label">New cycle</span>
            <h3>Create the next weekly poll</h3>
            <p>This archives the active poll and opens fresh nominations.</p>
          </div>
          <button
            aria-expanded={isCreatePollOpen}
            className="button button-primary admin-create-toggle"
            type="button"
            onClick={() => setIsCreatePollOpen((isOpen) => !isOpen)}
          >
            {isCreatePollOpen ? "Close setup" : "Create new weekly poll"}
            <ChevronIcon isOpen={isCreatePollOpen} />
          </button>
        </div>

        <div className={`admin-inline-reveal ${isCreatePollOpen ? "is-open" : ""}`}>
          <form className="vote-form admin-inline-reveal-inner" inert={!isCreatePollOpen ? true : undefined} onSubmit={handleCreatePoll}>
          <div className="admin-create-grid">
            <div className="field-group">
              <label htmlFor="cycleLabel">Cycle label</label>
              <input
                id="cycleLabel"
                name="cycleLabel"
                type="text"
                placeholder="Week 17"
                value={newPoll.cycleLabel}
                onChange={handleNewPollChange}
              />
            </div>

            <div className="field-group">
              <label htmlFor="pollId">Poll id</label>
              <input
                id="pollId"
                name="pollId"
                type="text"
                placeholder="poll-week-17"
                value={newPoll.pollId}
                onChange={handleNewPollChange}
              />
            </div>

            <div className="field-group">
              <label htmlFor="albumTitle">Current album title</label>
              <input
                id="albumTitle"
                name="albumTitle"
                type="text"
                placeholder="Heaven or Las Vegas"
                value={newPoll.albumTitle}
                onChange={handleNewPollChange}
              />
            </div>

            <div className="field-group">
              <label htmlFor="albumArtist">Current album artist</label>
              <input
                id="albumArtist"
                name="albumArtist"
                type="text"
                placeholder="Cocteau Twins"
                value={newPoll.albumArtist}
                onChange={handleNewPollChange}
              />
            </div>
          </div>

          {poll.winnerPublishedAt ? (
            <p className="helper-note" role="status">
              The official winner is filled in automatically. Add this cycle&apos;s genre and poll id when you are ready to open nominations.
            </p>
          ) : null}

          <div className="field-group">
            <label htmlFor="question">Voting question</label>
            <input
              id="question"
              name="question"
              type="text"
              value={newPoll.question}
              onChange={handleNewPollChange}
            />
          </div>

          <div className="field-group">
            <label htmlFor="description">Nomination description</label>
            <textarea
              id="description"
              name="description"
              rows="3"
              value={newPoll.description}
              onChange={handleNewPollChange}
            />
          </div>

          <button className={`button button-primary ${successfulAction === "create-poll" ? "is-success" : ""}`} type="submit" disabled={isSavingPhase}>
            {getSubmitLabel("create-poll", "Create active poll", "Creating...", isSavingPhase)}
          </button>
          </form>
        </div>
      </article>
    );
  }

  function renderCurrentAlbumManager() {
    if (!canManage) {
      return null;
    }

    return (
      <article className="surface-card vote-form-card admin-content-panel" id="admin-current-album">
        <div className="form-header">
          <div>
            <span className="phase-pill phase-primary">Home</span>
            <h2>Update current album</h2>
          </div>
          <p>This controls the album card on the home page without creating a new voting cycle.</p>
        </div>

        {currentAlbumError ? <p className="form-error" role="alert">{currentAlbumError}</p> : null}
        {currentAlbumMessage ? <p className="form-success" role="status">{currentAlbumMessage}</p> : null}

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
                JPG, PNG, or WebP. Maximum 5 MB. Leave empty to keep the current image.
              </small>
              {(currentAlbumCoverFile || currentAlbumForm.coverUrl) ? (
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
              {(currentAlbumCoverPreviewUrl || currentAlbumForm.coverUrl) ? (
                <img
                  src={currentAlbumCoverPreviewUrl || currentAlbumForm.coverUrl}
                  alt={`${currentAlbumForm.title || "Current album"} cover preview`}
                />
              ) : (
                <span className="cozy-album-cover cozy-generated-cover" aria-hidden="true">
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

          <button className={`button button-primary ${successfulAction === "current-album" ? "is-success" : ""}`} type="submit" disabled={isSavingContent}>
            {getSubmitLabel("current-album", "Save current album", "Saving...", isSavingContent)}
          </button>
        </form>
      </article>
    );
  }

  function renderEventsManager() {
    if (!canManage || !hasSiteEventsConfig) {
      return null;
    }

    return (
      <article className="surface-card vote-form-card admin-content-panel" id="admin-events">
        <div className="form-header">
          <div>
            <span className="phase-pill phase-final">Events</span>
            <h2>Manage events</h2>
          </div>
          <p>Events saved here appear on the home preview and the events page.</p>
        </div>

        <div className="admin-events-layout">
          <div className="admin-event-list">
            {sortedSiteEvents.map((eventItem) => (
              <article className="admin-event-row" key={eventItem.id}>
                <div>
                  <span>{eventItem.status}</span>
                  <strong>{eventItem.title}</strong>
                  <p>{eventItem.displayDate} at {eventItem.time} - {eventItem.location}</p>
                </div>

                <div className="admin-action-row">
                  <button
                    aria-label={`Edit ${eventItem.title}`}
                    className="button button-secondary"
                    type="button"
                    onClick={() => handleEventEdit(eventItem)}
                  >
                    Edit
                  </button>
                  <button
                    aria-label={`Delete ${eventItem.title}`}
                    className="button button-secondary"
                    type="button"
                    disabled={isSavingContent}
                    onClick={() => requestEventDelete(eventItem)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>

          <form className="vote-form admin-event-form" onSubmit={handleEventSave}>
            <div className="field-group">
              <label htmlFor="eventTitle">Title</label>
              <input
                id="eventTitle"
                name="title"
                type="text"
                value={eventForm.title}
                onChange={handleEventChange}
              />
            </div>

            <div className="admin-create-grid">
              <div className="field-group">
                <label htmlFor="eventDate">Date</label>
                <input
                  id="eventDate"
                  name="date"
                  type="date"
                  value={eventForm.date}
                  onChange={handleEventChange}
                />
              </div>

              <div className="field-group">
                <label htmlFor="eventTime">Time</label>
                <input
                  id="eventTime"
                  name="time"
                  type="text"
                  placeholder="7:15 PM"
                  value={eventForm.time}
                  onChange={handleEventChange}
                />
              </div>
            </div>

            <div className="admin-create-grid">
              <div className="field-group">
                <label htmlFor="eventStatus">Status</label>
                <select
                  id="eventStatus"
                  name="status"
                  value={eventForm.status}
                  onChange={handleEventChange}
                >
                  <option value="upcoming">Upcoming</option>
                  <option value="recent">Recent</option>
                </select>
              </div>

              <div className="field-group">
                <label htmlFor="eventTag">Tag</label>
                <input
                  id="eventTag"
                  name="tag"
                  type="text"
                  placeholder="Club night"
                  value={eventForm.tag}
                  onChange={handleEventChange}
                />
              </div>
            </div>

            <div className="field-group">
              <label htmlFor="eventLocation">Location</label>
              <input
                id="eventLocation"
                name="location"
                type="text"
                value={eventForm.location}
                onChange={handleEventChange}
              />
            </div>

            <div className="field-group">
              <label htmlFor="eventDescription">Description</label>
              <textarea
                id="eventDescription"
                name="description"
                rows="4"
                value={eventForm.description}
                onChange={handleEventChange}
              />
            </div>

            <div className="admin-action-row">
              <button className={`button button-primary ${successfulAction === "event-save" ? "is-success" : ""}`} type="submit" disabled={isSavingContent}>
                {getSubmitLabel(
                  "event-save",
                  editingEventId ? "Update event" : "Add event",
                  "Saving...",
                  isSavingContent,
                )}
              </button>
              <button className="button button-secondary" type="button" onClick={resetEventForm}>
                Clear form
              </button>
            </div>
          </form>
        </div>
      </article>
    );
  }

  function renderCurrentResults() {
    if (!canManage) {
      return null;
    }

    return (
      <article className="surface-card vote-form-card admin-results-panel" id="admin-results">
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
              <strong>{lastResultsRefreshedAt ? formatAdminTimestamp(lastResultsRefreshedAt) : "Not loaded"}</strong>
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
            {poll.phase === "final" && finalVotingState.isAvailable && !finalVotingState.isClosed ? (
              <button
                className="button button-danger"
                type="button"
                disabled={isSavingPhase}
                onClick={requestCloseFinalVoting}
              >
                Close final now
              </button>
            ) : null}
          </div>
        </section>

        {pollError ? <p className="form-error" role="alert">{pollError}</p> : null}
        {phaseFeedback ? (
          <p
            className={phaseFeedback.type === "error" ? "form-error" : "form-success"}
            role={phaseFeedback.type === "error" ? "alert" : "status"}
          >
            {phaseFeedback.message}
          </p>
        ) : null}
        {isLoadingResults ? <p className="helper-note">Loading live results...</p> : null}

        {results ? (
          <section className="admin-rating-summary" aria-labelledby="admin-rating-summary-title">
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
              {nominationRows.length ? nominationRows.map((candidate) => (
                <article className="admin-result-row" key={candidate.id}>
                  <div>
                    <strong>{candidate.title}</strong>
                    <p>{candidate.artist}</p>
                  </div>
                  <span>{formatCount(candidate.nominationCount || 0, "nomination")}</span>
                </article>
              )) : <p className="helper-note">No nominations have been submitted yet.</p>}
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
                  <label
                    className={`admin-result-row candidate-option ${isSelected ? "is-selected" : ""}`}
                    key={candidate.id}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={!isSelected && selectedCount >= requiredFinalistCount}
                      onChange={() => toggleFinalist(candidate.id)}
                    />
                    <div>
                      <strong>{candidate.title}</strong>
                      <p>{candidate.artist}</p>
                    </div>
                    <span>{formatCount(candidate.primaryVotes || 0, "vote")}</span>
                  </label>
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
                  {finalVotingState.isClosed ? "IRV winner" : "Current IRV leader"}
                </p>
                <h3>{irvWinner.title}</h3>
                <p>{irvWinner.artist}</p>
                {!finalVotingState.isClosed ? (
                  <p>Provisional until final voting closes.</p>
                ) : null}
              </div>
            ) : null}
            {irvTie ? (
              <section aria-labelledby="admin-tie-break-title" className="admin-tie-break">
                <div>
                  <span className="admin-terminal-label">Manual IRV tie-break</span>
                  <h3 id="admin-tie-break-title">Choose one album to eliminate</h3>
                  <p role="alert">
                    Round {irvTie.round} has {formatCount(irvTieCandidateIds.length, "candidate")} tied for elimination.
                  </p>
                </div>
                <fieldset disabled={isSavingPhase || !finalVotingState.isAvailable}>
                  <legend>Select the admin tie-break decision</legend>
                  {irvTieCandidateIds.map((candidateId) => {
                    const candidate = finalRows.find((row) => row.id === candidateId);

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
                          <small>{candidate?.artist || "Artist not listed"}</small>
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
                  disabled={isSavingPhase || !finalVotingState.isAvailable || !selectedTieCandidateId}
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
                    const candidate = finalRows.find((row) => row.id === tally.candidateId);
                    return (
                      <p key={tally.candidateId}>
                        {candidate?.title || tally.candidateId}: {formatCount(tally.votes, "vote")}
                      </p>
                    );
                  })}
                  {round.eliminatedCandidateId ? (
                    <span>Eliminated: {finalRows.find((row) => row.id === round.eliminatedCandidateId)?.title}</span>
                  ) : null}
                </article>
              ))}
            </div>
          </>
        ) : null}
      </article>
    );
  }

  function handleShelfCoverFileChange(event) {
    setShelfCoverFile(event.target.files?.[0] || null);
  }

  function moveShelfAlbum(albumId, direction) {
    setShelfAlbums((currentAlbums) => {
      const currentIndex = currentAlbums.findIndex((album) => album.id === albumId);
      const nextIndex = currentIndex + direction;

      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= currentAlbums.length) {
        return currentAlbums;
      }

      const nextAlbums = [...currentAlbums];
      const [movedAlbum] = nextAlbums.splice(currentIndex, 1);
      nextAlbums.splice(nextIndex, 0, movedAlbum);
      return nextAlbums;
    });
  }

  async function saveShelfOrder() {
    setIsSavingShelfCover(true);
    setError(null);

    try {
      await saveRecordShelfAlbums(supabase, shelfAlbums);
      setIsShelfCurating(false);
      showConfirmation("Record shelf order saved.", "shelf-order");
    } catch (saveError) {
      const saveErrorMessage = saveError.message || "The shelf order could not be saved.";
      setError(saveErrorMessage);
      showFailure(saveErrorMessage);
    } finally {
      setIsSavingShelfCover(false);
    }
  }

  async function cancelShelfCuration() {
    const savedAlbums = await loadRecordShelfAlbums(
      supabase,
      hasSupabaseConfig,
      fallbackShelfAlbums,
    );
    setShelfAlbums(savedAlbums);
    setIsShelfCurating(false);
  }

  function handleShelfArtistChange(albumId, artistName) {
    setShelfArtistDrafts((currentDrafts) => ({
      ...currentDrafts,
      [albumId]: artistName,
    }));
  }

  async function handleShelfArtistSave(album) {
    setError(null);
    setMessage(null);
    setIsSavingShelfCover(true);

    const currentOverride = shelfCoverOverrides[album.id];
    const artistOverride = (shelfArtistDrafts[album.id] || "").trim();
    const nextOverride = {
      album_id: album.id,
      album_title: album.title,
      artist_override: artistOverride || null,
      cover_url: currentOverride?.cover_url || null,
      storage_path: currentOverride?.storage_path || null,
      updated_by: session?.user?.id || null,
    };

    const { error: saveError } = await supabase
      .from("record_shelf_covers")
      .upsert(nextOverride, { onConflict: "album_id" });

    setIsSavingShelfCover(false);

    if (saveError) {
      setError(saveError.message);
      showFailure(saveError.message);
      return;
    }

    setShelfCoverOverrides((currentOverrides) => ({
      ...currentOverrides,
      [album.id]: nextOverride,
    }));
    const successMessage = `${album.title} artist updated.`;
    setMessage(successMessage);
    showConfirmation(successMessage, `shelf-artist-${album.id}`);
  }

  async function handleShelfCoverUpload(event) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!selectedShelfAlbum || !shelfCoverFile) {
      setError("Choose an album and an image before uploading.");
      return;
    }

    if (!shelfCoverFile.type.startsWith("image/")) {
      setError("Upload an image file for the shelf cover.");
      return;
    }

    setIsSavingShelfCover(true);

    const extension = shelfCoverFile.name.split(".").pop()?.toLowerCase() || "jpg";
    const storagePath = `${selectedShelfAlbum.id}/${shelfCoverFile.lastModified}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from(RECORD_SHELF_BUCKET)
      .upload(storagePath, shelfCoverFile, {
        cacheControl: "3600",
        contentType: shelfCoverFile.type,
        upsert: true,
      });

    if (uploadError) {
      setIsSavingShelfCover(false);
      setError(uploadError.message);
      showFailure(uploadError.message);
      return;
    }

    const { data: publicUrlData } = supabase.storage
      .from(RECORD_SHELF_BUCKET)
      .getPublicUrl(storagePath);

    const nextCover = {
      album_id: selectedShelfAlbum.id,
      album_title: selectedShelfAlbum.title,
      artist_override: shelfArtistDrafts[selectedShelfAlbum.id]?.trim() || null,
      cover_url: publicUrlData.publicUrl,
      storage_path: storagePath,
      updated_by: session?.user?.id || null,
    };
    const { error: saveError } = await supabase
      .from("record_shelf_covers")
      .upsert(nextCover, { onConflict: "album_id" });

    setIsSavingShelfCover(false);

    if (saveError) {
      setError(saveError.message);
      showFailure(saveError.message);
      return;
    }

    setShelfCoverFile(null);
    if (shelfCoverInputRef.current) {
      shelfCoverInputRef.current.value = "";
    }
    setShelfCoverOverrides((currentOverrides) => ({
      ...currentOverrides,
      [selectedShelfAlbum.id]: nextCover,
    }));
    const successMessage = `${selectedShelfAlbum.title} shelf cover updated.`;
    setMessage(successMessage);
    showConfirmation(successMessage, "shelf-cover");
  }

  async function handleShelfCoverClear(album) {
    setError(null);
    setMessage(null);
    setIsSavingShelfCover(true);

    const currentOverride = shelfCoverOverrides[album.id];

    const { error: deleteError } = await supabase
      .from("record_shelf_covers")
      .delete()
      .eq("album_id", album.id);

    if (!deleteError && currentOverride?.storage_path) {
      await supabase.storage.from(RECORD_SHELF_BUCKET).remove([currentOverride.storage_path]);
    }

    setIsSavingShelfCover(false);

    if (deleteError) {
      setError(deleteError.message);
      showFailure(deleteError.message);
      return;
    }

    setShelfCoverOverrides((currentOverrides) => {
      const nextOverrides = { ...currentOverrides };
      delete nextOverrides[album.id];
      return nextOverrides;
    });
    const successMessage = `${album.title} will use the automatic cover again.`;
    setMessage(successMessage);
    showConfirmation(successMessage, `shelf-clear-${album.id}`);
  }

  function renderShelfCoverManager() {
    if (!canManage) {
      return null;
    }

    return (
      <article className="surface-card vote-form-card admin-shelf-panel" id="admin-shelf">
        <div className="form-header">
          <div>
            <span className="phase-pill phase-final">Auto queue</span>
            <h2>Five records in rotation</h2>
          </div>
          <p>The newest archived album enters at 01. Position 05 is ejected automatically.</p>
        </div>

        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {message ? <p className="form-success" role="status">{message}</p> : null}

        <div className="admin-shelf-modebar">
          <div>
            <span className="admin-status-light" aria-hidden="true" />
            <strong>{isShelfCurating ? "Manual curation active" : "Automatic FIFO active"}</strong>
          </div>
          {isShelfCurating ? (
            <div className="admin-action-row">
              <button className="button button-secondary" type="button" disabled={isSavingShelfCover} onClick={cancelShelfCuration}>
                Cancel
              </button>
              <button className={`button button-primary ${successfulAction === "shelf-order" ? "is-success" : ""}`} type="button" disabled={isSavingShelfCover} onClick={saveShelfOrder}>
                {getSubmitLabel("shelf-order", "Save shelf order", "Saving...", isSavingShelfCover)}
              </button>
            </div>
          ) : (
            <button className="button button-secondary" type="button" onClick={() => setIsShelfCurating(true)}>
              Curate shelf
            </button>
          )}
        </div>

        <div className="admin-shelf-grid">
          {shelfAlbums.map((album, index) => {
            const override = shelfCoverOverrides[album.id];

            return (
              <article className={`admin-shelf-card ${isShelfCurating ? "is-curating" : ""}`} key={album.id}>
                <span className="admin-shelf-position">{String(index + 1).padStart(2, "0")}</span>
                {override?.cover_url ? (
                  <img src={override.cover_url} alt={`${album.title} custom cover`} />
                ) : (
                  <span className="cozy-album-cover cozy-generated-cover" aria-hidden="true">
                    <span>{album.title.slice(0, 2)}</span>
                  </span>
                )}
                <div>
                  <strong>{album.title}</strong>
                  <p>{override?.artist_override || album.artist || "Artist uses automatic lookup"}</p>
                  <span className="admin-shelf-source">{override?.cover_url ? "Custom artwork" : "Automatic artwork"}</span>
                </div>
                {isShelfCurating ? (
                  <div className="admin-shelf-curation-controls">
                    <div className="admin-shelf-move-controls" aria-label={`Reorder ${album.title}`}>
                      <button aria-label={`Move ${album.title} up`} disabled={index === 0} type="button" onClick={() => moveShelfAlbum(album.id, -1)}>Up</button>
                      <button aria-label={`Move ${album.title} down`} disabled={index === shelfAlbums.length - 1} type="button" onClick={() => moveShelfAlbum(album.id, 1)}>Down</button>
                    </div>
                    <div className="field-group admin-shelf-artist-field">
                      <label htmlFor={`shelfArtist-${album.id}`}>Artist override</label>
                      <input
                        id={`shelfArtist-${album.id}`}
                        type="text"
                        placeholder={album.artist || "Manual artist name"}
                        value={shelfArtistDrafts[album.id] || ""}
                        onChange={(event) => handleShelfArtistChange(album.id, event.target.value)}
                      />
                    </div>
                    <div className="admin-action-row">
                      <button
                        aria-label={`Save artist for ${album.title}`}
                        className="button button-secondary"
                        type="button"
                        disabled={isSavingShelfCover}
                        onClick={() => handleShelfArtistSave(album)}
                      >
                        Save artist
                      </button>
                      <button
                        aria-label={`Clear cover and artist overrides for ${album.title}`}
                        className="button button-secondary"
                        type="button"
                        disabled={!override || isSavingShelfCover}
                        onClick={() => handleShelfCoverClear(album)}
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>

        {isShelfCurating ? <form className="vote-form admin-shelf-upload" onSubmit={handleShelfCoverUpload}>
          <div className="field-group">
            <label htmlFor="shelfAlbum">Album to replace</label>
            <select
              id="shelfAlbum"
              value={selectedShelfAlbumId}
              onChange={(event) => setSelectedShelfAlbumId(event.target.value)}
            >
              {shelfAlbums.map((album) => (
                <option key={album.id} value={album.id}>
                  {album.title}
                </option>
              ))}
            </select>
          </div>

          <div className="field-group">
            <span className="admin-field-label">Replacement image</span>
            <input
              ref={shelfCoverInputRef}
              className="admin-file-input"
              id="shelfCover"
              type="file"
              accept="image/*"
              onChange={handleShelfCoverFileChange}
            />
            <label className="admin-file-trigger" htmlFor="shelfCover">
              <span>Upload cover</span>
              <small>{shelfCoverFile?.name || "Select an image"}</small>
            </label>
          </div>

          <button className={`button button-primary ${successfulAction === "shelf-cover" ? "is-success" : ""}`} type="submit" disabled={isSavingShelfCover}>
            {getSubmitLabel("shelf-cover", "Upload shelf cover", "Uploading...", isSavingShelfCover)}
          </button>
        </form> : null}

        {isLoadingShelfCovers ? <p className="helper-note">Loading custom shelf covers...</p> : null}
      </article>
    );
  }

  function renderMemberActions(member) {
    const canRemoveAdmin =
      member.status === "approved" && member.role === "admin" && adminCount > 1;
    const isBusy = busyMemberIds.includes(member.user_id);

    return (
      <div className="member-actions">
        {member.status !== "approved" ? (
          <button
            aria-label={`Approve ${getMemberName(member)}`}
            className="button button-secondary"
            type="button"
            disabled={isBusy}
            onClick={() => updateMembership(member.user_id, { status: "approved" })}
          >
            {getSubmitLabel(`member-${member.user_id}`, "Approve", "Working...", isBusy)}
          </button>
        ) : null}

        {member.status !== "rejected" ? (
          <button
            aria-label={`Reject ${getMemberName(member)}`}
            className="button button-secondary"
            type="button"
            disabled={isBusy}
            onClick={() => updateMembership(member.user_id, { status: "rejected" })}
          >
            Reject
          </button>
        ) : null}

        {member.status === "rejected" ? (
          <button
            aria-label={`Restore ${getMemberName(member)} to pending`}
            className="button button-secondary"
            type="button"
            disabled={isBusy}
            onClick={() => updateMembership(member.user_id, { status: "pending" })}
          >
            Restore pending
          </button>
        ) : null}

        {member.status === "approved" && member.role !== "admin" ? (
          <button
            aria-label={`Make ${getMemberName(member)} an admin`}
            className="button button-secondary"
            type="button"
            disabled={isBusy}
            onClick={() => updateMembership(member.user_id, { role: "admin" })}
          >
            Make admin
          </button>
        ) : null}

        {member.status === "approved" && member.role === "admin" ? (
          <button
            aria-label={`Remove admin access from ${getMemberName(member)}`}
            className="button button-secondary"
            type="button"
            disabled={!canRemoveAdmin || isBusy}
            onClick={() => updateMembership(member.user_id, { role: "member" })}
          >
            Remove admin
          </button>
        ) : null}
      </div>
    );
  }

  function renderMemberList() {
    if (isLoadingMembers) {
      return <p className="helper-note">Loading members...</p>;
    }

    if (!visibleMembers.length) {
      return (
        <p className="helper-note">
          {memberTab === "pending"
            ? "No pending approvals match this search."
            : "No accounts match this view."}
        </p>
      );
    }

    return (
      <>
        <div className="member-selection-header">
          <label>
            <input
              type="checkbox"
              checked={pagedMembers.length > 0 && pagedMembers.every((member) => selectedMemberIds.includes(member.user_id))}
              onChange={toggleAllVisibleMembers}
            />
            Select this page
          </label>
          <span>{formatCount(selectedMemberIds.length, "selected account")}</span>
        </div>
        <div className="member-list">
          {pagedMembers.map((member) => (
            <article className={`member-row ${selectedMemberIds.includes(member.user_id) ? "is-selected" : ""}`} key={member.user_id}>
              <label className="member-select-control">
                <input
                  aria-label={`Select ${getMemberName(member)}`}
                  type="checkbox"
                  checked={selectedMemberIds.includes(member.user_id)}
                  onChange={() => toggleMemberSelection(member.user_id)}
                />
              </label>
              <div>
                <strong>{getMemberName(member)}</strong>
                <p>{member.email}</p>
              </div>

              <div className="member-badges">
                <span>{member.status}</span>
                <span>{member.role}</span>
              </div>

              {renderMemberActions(member)}
            </article>
          ))}
        </div>

        {selectedMemberIds.length ? (
          <div className="member-bulk-bar" role="region" aria-label="Bulk member actions">
            <strong>{formatCount(selectedMemberIds.length, "account")} selected</strong>
            <div className="admin-action-row">
              <button className="button button-secondary" type="button" onClick={() => setSelectedMemberIds([])}>
                Clear
              </button>
              <button className="button button-secondary" type="button" disabled={busyMemberIds.length > 0} onClick={requestBulkReject}>
                Reject selected
              </button>
              <button className={`button button-primary ${successfulAction === "bulk-approved" ? "is-success" : ""}`} type="button" disabled={busyMemberIds.length > 0} onClick={() => runBulkMemberStatus("approved")}>
                {getSubmitLabel("bulk-approved", "Approve selected", "Approving...", busyMemberIds.length > 0)}
              </button>
            </div>
          </div>
        ) : null}

        <div className="member-pagination">
          <span>
            Page {currentMemberPage} of {totalMemberPages} - {formatCount(visibleMembers.length, "account")}
          </span>
          <div>
            <button
              className="button button-secondary"
              type="button"
              disabled={currentMemberPage === 1}
              onClick={() => setMemberPage((page) => Math.max(1, page - 1))}
            >
              Previous
            </button>
            <button
              className="button button-secondary"
              type="button"
              disabled={currentMemberPage === totalMemberPages}
              onClick={() => setMemberPage((page) => Math.min(totalMemberPages, page + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </>
    );
  }

  function renderMemberBody() {
    if (!hasSupabaseConfig) {
      return (
        <article className="surface-card vote-form-card">
          <p className="eyebrow">Setup needed</p>
          <h2 className="sidebar-title">Connect Supabase first.</h2>
          <p className="sidebar-copy">
            Add your Supabase environment variables and run the schema before managing members.
          </p>
        </article>
      );
    }

    if (!authReady) {
      return (
        <article className="surface-card vote-form-card">
          <p className="eyebrow">Loading</p>
          <h2 className="sidebar-title">Checking admin access.</h2>
        </article>
      );
    }

    if (!session) {
      return (
        <article className="surface-card vote-form-card">
          <p className="eyebrow">Admin only</p>
          <h2 className="sidebar-title">Sign in from the Account page first.</h2>
          <p className="sidebar-copy">Only approved ALC admins can manage member approvals.</p>
        </article>
      );
    }

    if (!canManage) {
      return (
        <article className="surface-card vote-form-card">
          <p className="eyebrow">Admin only</p>
          <h2 className="sidebar-title">This account cannot manage memberships.</h2>
          <p className="sidebar-copy">
            You are signed in as {session.user.email}, but this account is not an approved admin.
          </p>
        </article>
      );
    }

    return (
      <article className="surface-card vote-form-card admin-members-panel" id="admin-members">
        <div className="form-header">
          <div>
            <span className="phase-pill phase-primary">Accounts</span>
            <h2>Manage member access</h2>
          </div>
          <p>Pending approvals stay separate from the full account directory.</p>
        </div>

        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {memberMessage ? <p className="form-success" role="status">{memberMessage}</p> : null}

        <div className="member-tabs" role="group" aria-label="Membership views">
          <button
            aria-pressed={memberTab === "pending"}
            className={memberTab === "pending" ? "is-active" : ""}
            type="button"
            onClick={() => handleMemberTabChange("pending")}
          >
            Pending approvals ({pendingMembers.length})
          </button>
          <button
            aria-pressed={memberTab === "all"}
            className={memberTab === "all" ? "is-active" : ""}
            type="button"
            onClick={() => handleMemberTabChange("all")}
          >
            All accounts
          </button>
        </div>

        <div className="member-toolbar">
          <div className="field-group">
            <label htmlFor="memberSearch">Search by display name</label>
            <input
              id="memberSearch"
              type="search"
              placeholder="Member name"
              value={memberSearch}
              onChange={(event) => setMemberSearch(event.target.value)}
            />
          </div>

          {memberTab === "all" ? (
            <div className="member-filter-group" aria-label="Account filters">
              {accountFilters.map((filter) => (
                <button
                  aria-pressed={accountFilter === filter.id}
                  className={accountFilter === filter.id ? "is-active" : ""}
                  key={filter.id}
                  type="button"
                  onClick={() => setAccountFilter(filter.id)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {renderMemberList()}
      </article>
    );
  }

  return (
    <div className="sideb-page sideb-subpage sideb-admin-page">
      <main className="sideb-subpage-main" id="main-content" ref={adminMainRef} tabIndex="-1">
        <section className="sideb-page-hero sideb-page-hero-split sideb-admin-hero">
          <div>
            <p className="sideb-kicker">ALC / Operations terminal</p>
            <h1>Club control room.</h1>
            <p>
              Run the weekly cycle, curate the public shelf, and keep member access moving.
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
            <nav className="admin-sticky-nav" aria-label="Admin workspace sections">
              <button className="admin-sticky-brand" type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
                <span className="admin-status-light" aria-hidden="true" />
                Live console
              </button>
              <div>
                {ADMIN_PANELS.filter((panel) => panel.id !== "events" || hasSiteEventsConfig).map((panel) => (
                  <button
                    aria-current={activePanel === panel.id ? "page" : undefined}
                    className={activePanel === panel.id ? "is-active" : ""}
                    key={panel.id}
                    type="button"
                    onClick={() => openAdminPanel(panel.id, panel.target)}
                  >
                    {panel.label}
                    {panel.id === "members" && pendingMembers.length ? <span>{pendingMembers.length}</span> : null}
                  </button>
                ))}
              </div>
            </nav>

            {renderAdminSnapshot()}

            <div className="admin-workspace">
              <AdminPanel
                eyebrow="01 / Poll desk"
                id="admin-poll"
                isOpen={activePanel === "poll"}
                summary={`${formatPhaseLabel(poll.phase)} · ${poll.status}`}
                title="Weekly voting cycle"
                onToggle={() => toggleAdminPanel("poll")}
              >
                {renderCreatePoll()}
                {renderCurrentResults()}
              </AdminPanel>

              <AdminPanel
                eyebrow="02 / Now playing"
                id="admin-current-album-panel"
                isOpen={activePanel === "album"}
                summary={`${poll.albumOfWeek.title} · ${poll.albumOfWeek.artist}`}
                title="Current album"
                onToggle={() => toggleAdminPanel("album")}
              >
                {renderCurrentAlbumManager()}
              </AdminPanel>

              {hasSiteEventsConfig ? (
                <AdminPanel
                  eyebrow="03 / Calendar"
                  id="admin-events-panel"
                  isOpen={activePanel === "events"}
                  summary={nextUpcomingEvent ? `${nextUpcomingEvent.displayDate} · ${nextUpcomingEvent.title}` : "No event posted"}
                  title="Events"
                  onToggle={() => toggleAdminPanel("events")}
                >
                  {renderEventsManager()}
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
                {renderShelfCoverManager()}
              </AdminPanel>

              <AdminPanel
                eyebrow="05 / Access desk"
                id="admin-members-panel"
                isOpen={activePanel === "members"}
                summary={`${formatCount(pendingMembers.length, "pending request")} · ${formatCount(approvedMemberCount, "active member")}`}
                title="Member access"
                onToggle={() => toggleAdminPanel("members")}
              >
                {renderMemberBody()}
              </AdminPanel>
            </div>
          </>
        ) : renderMemberBody()}
      </main>

      {toast ? (
        <div className={`admin-toast admin-toast-${toast.type}`} role={toast.type === "error" ? "alert" : "status"}>
          <span aria-hidden="true" />
          <p>{toast.message}</p>
          <button aria-label="Dismiss notification" type="button" onClick={() => setToast(null)}>Close</button>
        </div>
      ) : null}

      {confirmation ? (
        <div className="admin-dialog-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !isConfirming) {
            dismissConfirmation();
          }
        }}>
          <div aria-describedby="admin-confirm-description" aria-labelledby="admin-confirm-title" aria-modal="true" className="admin-dialog" ref={confirmationDialogRef} role="dialog">
            <span className="admin-terminal-label">{confirmation.eyebrow || "Confirmation required"}</span>
            <h2 id="admin-confirm-title">{confirmation.title}</h2>
            <p id="admin-confirm-description">{confirmation.description}</p>
            <div className="admin-action-row">
              <button autoFocus className="button button-secondary" type="button" disabled={isConfirming} onClick={dismissConfirmation}>
                Cancel
              </button>
              <button className={`button ${confirmation.intent === "primary" ? "button-primary" : "button-danger"}`} type="button" disabled={isConfirming} onClick={confirmPendingAction}>
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
