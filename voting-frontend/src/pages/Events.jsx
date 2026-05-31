function Events({ specialEvents, navigate }) {
  const upcomingEvents = specialEvents.filter((event) => event.status === "upcoming");
  const recentEvents = specialEvents.filter((event) => event.status === "recent");

  function renderEventCard(event) {
    return (
      <article className="event-detail-card" key={event.id}>
        <div>
          <span className="event-tag">{event.tag || event.status}</span>
          <h3>{event.title}</h3>
          <p>{event.description}</p>
        </div>

        <dl className="event-meta">
          <div>
            <dt>Date</dt>
            <dd>{event.displayDate}</dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd>{event.time}</dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>{event.location}</dd>
          </div>
        </dl>
      </article>
    );
  }

  return (
    <div className="events-page cozy-events-page">
      <section className="events-hero surface-card">
        <div>
          <p className="eyebrow">Events</p>
          <h1 className="page-title">Club plans beyond the weekly vote.</h1>
          <p className="page-intro">
            Keep up with listening nights, record store runs, concerts, and the occasional
            low-key hang outside the regular meeting rhythm.
          </p>
        </div>

        <button
          className="button button-secondary"
          type="button"
          onClick={() => navigate("/")}
        >
          Back home
        </button>
      </section>

      <section className="events-section-block" aria-labelledby="upcoming-events-heading">
        <div className="section-heading">
          <span className="eyebrow">Upcoming</span>
          <h2 id="upcoming-events-heading">What is next.</h2>
        </div>

        {upcomingEvents.length > 0 ? (
          <div className="event-detail-grid">
            {upcomingEvents.map(renderEventCard)}
          </div>
        ) : (
          <p className="events-empty">No upcoming events are posted yet.</p>
        )}
      </section>

      <section className="events-section-block" aria-labelledby="recent-events-heading">
        <div className="section-heading">
          <span className="eyebrow">Recent</span>
          <h2 id="recent-events-heading">What we just did.</h2>
        </div>

        {recentEvents.length > 0 ? (
          <div className="event-detail-grid">
            {recentEvents.map(renderEventCard)}
          </div>
        ) : (
          <p className="events-empty">No recent events are posted yet.</p>
        )}
      </section>
    </div>
  );
}

export default Events;
