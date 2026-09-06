export default function CreatePollForm({
  ChevronIcon,
  canManage,
  getSubmitLabel,
  handleCreatePoll,
  handleNewPollChange,
  isCreatePollOpen,
  isSavingPhase,
  newPoll,
  poll,
  setIsCreatePollOpen,
  successfulAction,
}) {
  if (!canManage) {
    return null;
  }

  return (
    <article
      className="surface-card vote-form-card admin-create-poll"
      id="admin-create-poll"
    >
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

      <div
        className={`admin-inline-reveal ${isCreatePollOpen ? "is-open" : ""}`}
      >
        <form
          className="vote-form admin-inline-reveal-inner"
          inert={!isCreatePollOpen ? true : undefined}
          onSubmit={handleCreatePoll}
        >
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
              The official winner is filled in automatically. Add this
              cycle&apos;s genre and poll id when you are ready to open
              nominations.
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

          <button
            className={`button button-primary ${successfulAction === "create-poll" ? "is-success" : ""}`}
            type="submit"
            disabled={isSavingPhase}
          >
            {getSubmitLabel(
              "create-poll",
              "Create active poll",
              "Creating...",
              isSavingPhase,
            )}
          </button>
        </form>
      </div>
    </article>
  );
}
