import { getAdminActionErrorMessage } from "./adminActions";

export function isAdmin(membership) {
  return membership?.status === "approved" && membership?.role === "admin";
}

export const MEMBERS_PER_PAGE = 10;

export const ADMIN_PANELS = [
  { id: "poll", label: "Poll", target: "admin-poll" },
  { id: "album", label: "Current album", target: "admin-current-album-panel" },
  { id: "events", label: "Events", target: "admin-events-panel" },
  { id: "shelf", label: "Record shelf", target: "admin-shelf-panel" },
  { id: "members", label: "Members", target: "admin-members-panel" },
];

export function formatCount(count, noun) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function formatPhaseLabel(phase) {
  return phase.charAt(0).toUpperCase() + phase.slice(1);
}

export function getFirstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

export function getNonNegativeInteger(value) {
  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) && parsedValue >= 0
    ? Math.trunc(parsedValue)
    : null;
}

export function getCurrentBallotCount(results, poll, phase) {
  const resultCounts = results?.ballotCounts || results?.ballot_counts;
  const pollCounts = poll?.ballotCounts || poll?.ballot_counts;
  const camelPhase = `${phase}BallotCount`;
  const snakePhase = `${phase}_ballot_count`;

  return getNonNegativeInteger(
    getFirstDefined(
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
    ),
  );
}

export function getFinalVotingState(results, poll, now) {
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
  const hasExplicitClosedValue =
    explicitClosed !== undefined && explicitClosed !== null;
  const explicitClosedValue =
    explicitClosed === true || explicitClosed === "true";

  return {
    closedAt,
    closesAt,
    isAvailable: Boolean(
      openedAt || closesAt || closedAt || explicitClosed !== undefined,
    ),
    isClosed: hasExplicitClosedValue
      ? explicitClosedValue
      : Boolean(closedAt) ||
        (Number.isFinite(closesAtTime) && closesAtTime <= now),
    openedAt,
  };
}

export function formatAdminTimestamp(value, { includeDate = false } = {}) {
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

export function formatFinalCountdown(closesAt, now) {
  const closesAtTime = closesAt ? Date.parse(closesAt) : Number.NaN;

  if (!Number.isFinite(closesAtTime)) {
    return "Schedule unavailable";
  }

  const remainingMinutes = Math.max(
    0,
    Math.ceil((closesAtTime - now) / 60_000),
  );

  if (remainingMinutes === 0) {
    return "Deadline reached";
  }

  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;

  return hours > 0
    ? `${hours}h ${minutes}m remaining`
    : `${minutes}m remaining`;
}

export function getAdminActionDisplayError(action, actionError) {
  const message =
    `${actionError?.code || ""} ${actionError?.message || ""}`.toLowerCase();
  const isMissingFunction =
    actionError?.code === "PGRST202" ||
    (message.includes("function") &&
      (message.includes("could not find") ||
        message.includes("does not exist") ||
        message.includes("schema cache")));

  if (isMissingFunction && action === "resolve_irv_tie") {
    return "Tie-break controls need the latest Supabase event migration. No result was changed.";
  }

  if (isMissingFunction && action === "close_final_voting") {
    return "Final close controls need the latest Supabase event migration. Voting is still open.";
  }

  if (isMissingFunction && action === "remove_primary_candidate") {
    return "Album removal needs the latest Supabase archive and primary-controls migration. Nothing was removed.";
  }

  return getAdminActionErrorMessage(actionError);
}

export function getMemberName(member) {
  return member.display_name || "Unnamed member";
}

export function createPollId(cycleLabel) {
  const slug = cycleLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return slug
    ? `poll-${slug}`
    : `poll-${new Date().toISOString().slice(0, 10)}`;
}

export function getNextUpcomingEvent(siteEvents) {
  return (
    siteEvents.find((eventItem) => eventItem.status === "upcoming") ||
    siteEvents[0]
  );
}
