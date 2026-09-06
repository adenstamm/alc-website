import { formatCount, getMemberName } from "../../lib/adminPresentation";

export default function MemberManager({
  accountFilter,
  accountFilters,
  adminCount,
  authReady,
  busyMemberIds,
  canManage,
  currentMemberPage,
  error,
  getSubmitLabel,
  handleMemberTabChange,
  hasSupabaseConfig,
  isLoadingMembers,
  memberMessage,
  memberSearch,
  memberTab,
  pagedMembers,
  pendingMembers,
  requestBulkReject,
  runBulkMemberStatus,
  selectedMemberIds,
  session,
  setAccountFilter,
  setMemberPage,
  setMemberSearch,
  setSelectedMemberIds,
  successfulAction,
  toggleAllVisibleMembers,
  toggleMemberSelection,
  totalMemberPages,
  updateMembership,
  visibleMembers,
}) {
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
            onClick={() =>
              updateMembership(member.user_id, { status: "approved" })
            }
          >
            {getSubmitLabel(
              `member-${member.user_id}`,
              "Approve",
              "Working...",
              isBusy,
            )}
          </button>
        ) : null}

        {member.status !== "rejected" ? (
          <button
            aria-label={`Reject ${getMemberName(member)}`}
            className="button button-secondary"
            type="button"
            disabled={isBusy}
            onClick={() =>
              updateMembership(member.user_id, { status: "rejected" })
            }
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
            onClick={() =>
              updateMembership(member.user_id, { status: "pending" })
            }
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
              checked={
                pagedMembers.length > 0 &&
                pagedMembers.every((member) =>
                  selectedMemberIds.includes(member.user_id),
                )
              }
              onChange={toggleAllVisibleMembers}
            />
            Select this page
          </label>
          <span>
            {formatCount(selectedMemberIds.length, "selected account")}
          </span>
        </div>
        <div className="member-list">
          {pagedMembers.map((member) => (
            <article
              className={`member-row ${selectedMemberIds.includes(member.user_id) ? "is-selected" : ""}`}
              key={member.user_id}
            >
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
          <div
            className="member-bulk-bar"
            role="region"
            aria-label="Bulk member actions"
          >
            <strong>
              {formatCount(selectedMemberIds.length, "account")} selected
            </strong>
            <div className="admin-action-row">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setSelectedMemberIds([])}
              >
                Clear
              </button>
              <button
                className="button button-secondary"
                type="button"
                disabled={busyMemberIds.length > 0}
                onClick={requestBulkReject}
              >
                Reject selected
              </button>
              <button
                className={`button button-primary ${successfulAction === "bulk-approved" ? "is-success" : ""}`}
                type="button"
                disabled={busyMemberIds.length > 0}
                onClick={() => runBulkMemberStatus("approved")}
              >
                {getSubmitLabel(
                  "bulk-approved",
                  "Approve selected",
                  "Approving...",
                  busyMemberIds.length > 0,
                )}
              </button>
            </div>
          </div>
        ) : null}

        <div className="member-pagination">
          <span>
            Page {currentMemberPage} of {totalMemberPages} -{" "}
            {formatCount(visibleMembers.length, "account")}
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
              onClick={() =>
                setMemberPage((page) => Math.min(totalMemberPages, page + 1))
              }
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
            Add your Supabase environment variables and run the schema before
            managing members.
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
          <h2 className="sidebar-title">
            Sign in from the Account page first.
          </h2>
          <p className="sidebar-copy">
            Only approved ALC admins can manage member approvals.
          </p>
        </article>
      );
    }

    if (!canManage) {
      return (
        <article className="surface-card vote-form-card">
          <p className="eyebrow">Admin only</p>
          <h2 className="sidebar-title">
            This account cannot manage memberships.
          </h2>
          <p className="sidebar-copy">
            You are signed in as {session.user.email}, but this account is not
            an approved admin.
          </p>
        </article>
      );
    }

    return (
      <article
        className="surface-card vote-form-card admin-members-panel"
        id="admin-members"
      >
        <div className="form-header">
          <div>
            <span className="phase-pill phase-primary">Accounts</span>
            <h2>Manage member access</h2>
          </div>
          <p>
            Pending approvals stay separate from the full account directory.
          </p>
        </div>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {memberMessage ? (
          <p className="form-success" role="status">
            {memberMessage}
          </p>
        ) : null}

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
  return renderMemberBody();
}
