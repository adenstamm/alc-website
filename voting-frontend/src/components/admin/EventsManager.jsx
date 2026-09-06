export default function EventsManager({
  canManage,
  editingEventId,
  eventForm,
  getSubmitLabel,
  handleEventChange,
  handleEventEdit,
  handleEventSave,
  hasSiteEventsConfig,
  isSavingContent,
  requestEventDelete,
  resetEventForm,
  sortedSiteEvents,
  successfulAction,
}) {
  if (!canManage || !hasSiteEventsConfig) {
    return null;
  }

  return (
    <article
      className="surface-card vote-form-card admin-content-panel"
      id="admin-events"
    >
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
                <p>
                  {eventItem.displayDate} at {eventItem.time} -{" "}
                  {eventItem.location}
                </p>
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
            <button
              className={`button button-primary ${successfulAction === "event-save" ? "is-success" : ""}`}
              type="submit"
              disabled={isSavingContent}
            >
              {getSubmitLabel(
                "event-save",
                editingEventId ? "Update event" : "Add event",
                "Saving...",
                isSavingContent,
              )}
            </button>
            <button
              className="button button-secondary"
              type="button"
              onClick={resetEventForm}
            >
              Clear form
            </button>
          </div>
        </form>
      </div>
    </article>
  );
}
