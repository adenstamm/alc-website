import { formatCount, formatPhaseLabel } from "../../lib/adminPresentation";

export default function AdminSnapshot({
  adminCount,
  approvedMemberCount,
  canManage,
  currentBallotCount,
  hasSiteEventsConfig,
  nextUpcomingEvent,
  openAdminPanel,
  pendingMembers,
  poll,
  setIsCreatePollOpen,
}) {
  if (!canManage) {
    return null;
  }

  const phaseMetric = {
    label: `${formatPhaseLabel(poll.phase)} ballots`,
    value: currentBallotCount ?? "—",
    detail:
      currentBallotCount === null
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
        <button
          className="button button-secondary"
          type="button"
          onClick={() => openAdminPanel("members", "admin-members-panel")}
        >
          Review members
        </button>
        {hasSiteEventsConfig ? (
          <button
            className="button button-secondary"
            type="button"
            onClick={() => openAdminPanel("events", "admin-events-panel")}
          >
            Manage events
          </button>
        ) : null}
        <button
          className="button button-secondary"
          type="button"
          onClick={() => openAdminPanel("poll", "admin-poll")}
        >
          View results
        </button>
        <button
          className="button button-primary"
          type="button"
          onClick={() => {
            setIsCreatePollOpen(true);
            openAdminPanel("poll", "admin-create-poll");
          }}
        >
          Create poll
        </button>
      </div>
    </article>
  );
}
