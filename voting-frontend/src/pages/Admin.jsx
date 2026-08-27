import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  getRecentShelfAlbums,
  loadRecordShelfCoverOverrides,
  RECORD_SHELF_BUCKET,
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

function formatCount(count, noun) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function formatPhaseLabel(phase) {
  return phase.charAt(0).toUpperCase() + phase.slice(1);
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
  const phaseActionRef = useRef(null);
  const currentAlbumCoverInputRef = useRef(null);

  const canManage = hasSupabaseConfig && isAdmin(membership);
  const shelfAlbums = useMemo(() => getRecentShelfAlbums(), []);
  const selectedShelfAlbum = shelfAlbums.find((album) => album.id === selectedShelfAlbumId) || shelfAlbums[0];
  const primaryRows = useMemo(() => results?.primaryResults || [], [results?.primaryResults]);
  const nominationRows = results?.nominations || [];
  const finalRows = results?.finalists || [];
  const irvRounds = results?.irv?.rounds || [];
  const irvTie = results?.irv?.tie || null;
  const irvWinnerId = results?.irv?.winnerId || null;
  const irvWinner = finalRows.find((candidate) => candidate.id === irvWinnerId);
  const currentAlbumRatingAverage = formatAverageRating(
    results?.currentAlbumRating?.averageRating,
  );
  const currentAlbumRatingCount = results?.currentAlbumRating?.ratingCount || 0;
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

    setIsLoadingResults(true);
    setError(null);

    const { data, error: loadError } = await supabase.rpc("get_admin_poll_results", {
      target_poll_id: poll.id,
    });

    if (loadError) {
      setError(loadError.message);
      setResults(null);
    } else {
      setResults(data);
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
    loadResults();
  }, [loadResults]);

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
    if (!currentAlbumCoverFile) {
      setCurrentAlbumCoverPreviewUrl("");
      return undefined;
    }

    const previewUrl = URL.createObjectURL(currentAlbumCoverFile);
    setCurrentAlbumCoverPreviewUrl(previewUrl);

    return () => URL.revokeObjectURL(previewUrl);
  }, [currentAlbumCoverFile]);

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
      setError(createError.message);
      return;
    }

    setMessage("New poll created and set active.");
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
    await loadResults();
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

  async function updateMembership(userId, updates) {
    setError(null);
    setMessage(null);
    setMemberMessage(null);

    if (updates.role === "member") {
      const targetMember = memberships.find((member) => member.user_id === userId);

      if (targetMember?.role === "admin" && adminCount <= 1) {
        setError("You cannot remove the last admin.");
        return;
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
      return;
    }

    setMemberships((currentMemberships) =>
      currentMemberships.map((currentMembership) =>
        currentMembership.user_id === userId ? data : currentMembership,
      ),
    );
    setMemberMessage(getMembershipActionLabel(updates));
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
        setPhaseFeedback({
          message: getAdminActionErrorMessage(outcome.error),
          type: "error",
        });
        return;
      }

      const confirmationMessage = outcome.recovered
        ? alreadyMessage || successMessage
        : successMessage;
      setPhaseFeedback({ message: confirmationMessage, type: "success" });

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
      setPhaseFeedback({
        message: getAdminActionErrorMessage(actionError),
        type: "error",
      });
    } finally {
      phaseActionRef.current = null;
      setActivePhaseAction(null);
      setIsSavingPhase(false);
    }
  }

  function scrollToAdminPanel(panelId) {
    document.getElementById(panelId)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
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
      try {
        await refreshPoll();
      } catch {
        setCurrentAlbumError(
          "The album was saved, but the page could not refresh. Reload to see the latest version.",
        );
      }
    } catch (saveError) {
      setCurrentAlbumError(
        saveError.message || "The current album could not be updated. Try again.",
      );
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
      return;
    }

    setMessage(editingEventId ? "Event updated." : "Event added.");
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
      return;
    }

    if (editingEventId === eventId) {
      resetEventForm();
    }

    setMessage("Event deleted.");
    await refreshEvents();
  }

  function renderAdminSnapshot() {
    if (!canManage) {
      return null;
    }

    const phaseMetric =
      poll.phase === "nominations"
        ? {
            label: "Nominations",
            value: nominationRows.length,
            detail: "unique albums in the pool",
          }
        : poll.phase === "primary"
          ? {
              label: "Primary votes",
              value: primaryRows.reduce((total, candidate) => total + (candidate.primaryVotes || 0), 0),
              detail: `${selectedCount}/${requiredFinalistCount} finalists selected`,
            }
          : {
              label: "Final status",
              value: irvWinner ? "Winner" : irvTie ? "Tie" : irvRounds.length || 0,
              detail: irvWinner?.title || (irvTie ? "manual decision needed" : "IRV rounds ready"),
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
          <button className="button button-secondary" type="button" onClick={() => scrollToAdminPanel("admin-members")}>
            Review members
          </button>
          {hasSiteEventsConfig ? (
            <button className="button button-secondary" type="button" onClick={() => scrollToAdminPanel("admin-events")}>
              Manage events
            </button>
          ) : null}
          <button className="button button-secondary" type="button" onClick={() => scrollToAdminPanel("admin-results")}>
            View results
          </button>
          <button className="button button-primary" type="button" onClick={() => scrollToAdminPanel("admin-create-poll")}>
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
        <div className="form-header">
          <div>
            <span className="phase-pill phase-nominations">New poll</span>
            <h2>Create the next weekly poll</h2>
          </div>
          <p>This archives the current active poll and opens a fresh nominations phase.</p>
        </div>

        <form className="vote-form" onSubmit={handleCreatePoll}>
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

          <button className="button button-primary" type="submit" disabled={isSavingPhase}>
            {isSavingPhase ? "Creating..." : "Create active poll"}
          </button>
        </form>
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
              <label htmlFor="currentAlbumCover">Album cover image</label>
              <input
                ref={currentAlbumCoverInputRef}
                id="currentAlbumCover"
                type="file"
                accept={ALBUM_COVER_ACCEPT}
                aria-describedby="currentAlbumCoverHelp"
                disabled={isSavingContent}
                onChange={handleCurrentAlbumCoverChange}
              />
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

          <button className="button button-primary" type="submit" disabled={isSavingContent}>
            {isSavingContent ? "Saving..." : "Save current album"}
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
                    onClick={() => handleEventDelete(eventItem.id)}
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
              <button className="button button-primary" type="submit" disabled={isSavingContent}>
                {isSavingContent ? "Saving..." : editingEventId ? "Update event" : "Add event"}
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
                {poll.albumOfWeek?.title || "Current album"}
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
            <button
              className="button button-secondary"
              type="button"
              disabled={isLoadingResults}
              onClick={loadResults}
            >
              {isLoadingResults ? "Refreshing…" : "Refresh rating"}
            </button>
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
              onClick={() => runAdminAction(
                "advance_to_primary",
                "Poll moved to primary.",
                {},
                {
                  alreadyMessage: "The poll is already in primary voting.",
                  expectedPhase: "primary",
                },
              )}
            >
              {activePhaseAction === "advance_to_primary"
                ? "Moving to primary..."
                : "Move to primary"}
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
                {activePhaseAction === "save_finalists"
                  ? "Saving finalists..."
                  : "Save finalists"}
              </button>
              <button
                className="button button-primary"
                type="button"
                disabled={isSavingPhase || !canAdvanceToFinal}
                onClick={() =>
                  runAdminAction("advance_to_final", "Poll moved to final voting.", {
                    candidate_ids: selectedFinalistIds,
                  }, {
                    alreadyMessage: "The poll is already in final voting.",
                    expectedPhase: "final",
                  })
                }
              >
                {activePhaseAction === "advance_to_final"
                  ? "Moving to final..."
                  : "Move to final"}
              </button>
            </div>
          </>
        ) : null}

        {poll.phase === "final" ? (
          <>
            {irvWinner ? (
              <div className="confirmation-card">
                <p className="eyebrow">IRV winner</p>
                <h3>{irvWinner.title}</h3>
                <p>{irvWinner.artist}</p>
              </div>
            ) : null}
            {irvTie ? (
              <p className="form-error" role="alert">
                Manual decision needed in round {irvTie.round}: {irvTie.candidateIds.length} candidates tied for elimination.
              </p>
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
      return;
    }

    setShelfCoverOverrides((currentOverrides) => ({
      ...currentOverrides,
      [album.id]: nextOverride,
    }));
    setMessage(`${album.title} artist updated.`);
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
    const storagePath = `${selectedShelfAlbum.id}/${Date.now()}.${extension}`;
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
      return;
    }

    setShelfCoverFile(null);
    setShelfCoverOverrides((currentOverrides) => ({
      ...currentOverrides,
      [selectedShelfAlbum.id]: nextCover,
    }));
    setMessage(`${selectedShelfAlbum.title} shelf cover updated.`);
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
      return;
    }

    setShelfCoverOverrides((currentOverrides) => {
      const nextOverrides = { ...currentOverrides };
      delete nextOverrides[album.id];
      return nextOverrides;
    });
    setMessage(`${album.title} will use the automatic cover again.`);
  }

  function renderShelfCoverManager() {
    if (!canManage) {
      return null;
    }

    return (
      <article className="surface-card vote-form-card admin-shelf-panel" id="admin-shelf">
        <div className="form-header">
          <div>
            <span className="phase-pill phase-final">Shelf</span>
            <h2>Manage record shelf covers</h2>
          </div>
          <p>Upload a custom image to replace one of the five current shelf album covers.</p>
        </div>

        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {message ? <p className="form-success" role="status">{message}</p> : null}

        <div className="admin-shelf-grid">
          {shelfAlbums.map((album) => {
            const override = shelfCoverOverrides[album.id];

            return (
              <article className="admin-shelf-card" key={album.id}>
                {override?.cover_url ? (
                  <img src={override.cover_url} alt={`${album.title} custom cover`} />
                ) : (
                  <span className="cozy-album-cover cozy-generated-cover" aria-hidden="true">
                    <span>{album.title.slice(0, 2)}</span>
                  </span>
                )}
                <div>
                  <strong>{album.title}</strong>
                  <p>{override?.artist_override || "Artist uses automatic lookup"}</p>
                  <p>{override?.cover_url ? "Custom cover active" : "Using automatic cover"}</p>
                </div>
                <div className="field-group admin-shelf-artist-field">
                  <label htmlFor={`shelfArtist-${album.id}`}>Artist</label>
                  <input
                    id={`shelfArtist-${album.id}`}
                    type="text"
                    placeholder="Manual artist name"
                    value={shelfArtistDrafts[album.id] || ""}
                    onChange={(event) => handleShelfArtistChange(album.id, event.target.value)}
                  />
                </div>
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
                  Clear overrides
                </button>
              </article>
            );
          })}
        </div>

        <form className="vote-form admin-shelf-upload" onSubmit={handleShelfCoverUpload}>
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
            <label htmlFor="shelfCover">Replacement image</label>
            <input
              id="shelfCover"
              type="file"
              accept="image/*"
              onChange={handleShelfCoverFileChange}
            />
          </div>

          <button className="button button-primary" type="submit" disabled={isSavingShelfCover}>
            {isSavingShelfCover ? "Uploading..." : "Upload shelf cover"}
          </button>
        </form>

        {isLoadingShelfCovers ? <p className="helper-note">Loading custom shelf covers...</p> : null}
        <p className="helper-note">
          If this says the bucket or table is missing, run the latest Supabase SQL migration.
        </p>
      </article>
    );
  }

  function renderMemberActions(member) {
    const canRemoveAdmin =
      member.status === "approved" && member.role === "admin" && adminCount > 1;

    return (
      <div className="member-actions">
        {member.status !== "approved" ? (
          <button
            aria-label={`Approve ${getMemberName(member)}`}
            className="button button-secondary"
            type="button"
            onClick={() => updateMembership(member.user_id, { status: "approved" })}
          >
            Approve
          </button>
        ) : null}

        {member.status !== "rejected" ? (
          <button
            aria-label={`Reject ${getMemberName(member)}`}
            className="button button-secondary"
            type="button"
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
            disabled={!canRemoveAdmin}
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
        <div className="member-list">
          {pagedMembers.map((member) => (
            <article className="member-row" key={member.user_id}>
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
      <main className="sideb-subpage-main" id="main-content" tabIndex="-1">
        <section className="sideb-page-hero sideb-page-hero-split sideb-admin-hero">
          <div>
            <p className="sideb-kicker">Admin</p>
            <h1>Voting control room.</h1>
            <p>
              Manage member access, watch live results, and move the active poll
              through each phase.
            </p>
          </div>

          <aside className="sideb-next-card" aria-label="Current poll">
            <span>Current Phase</span>
            <strong>{formatPhaseLabel(poll.phase)}</strong>
            <p>{poll.status}</p>
            <small>{poll.id}</small>
          </aside>
        </section>

        {renderAdminSnapshot()}
        {renderCreatePoll()}
        {renderCurrentAlbumManager()}
        {renderEventsManager()}
        {renderCurrentResults()}
        {renderShelfCoverManager()}
        {renderMemberBody()}
      </main>
    </div>
  );
}

export default Admin;
