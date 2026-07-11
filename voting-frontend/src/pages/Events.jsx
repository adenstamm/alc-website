import { getRecentEvents, getUpcomingEvents } from "../lib/siteContent";

function EventCard({ event }) {
  return (
    <article className="sideb-event-card">
      <div className="sideb-event-copy">
        <span>{event.tag || event.status}</span>
        <h3>{event.title}</h3>
        <p>{event.description}</p>
      </div>

      <dl className="sideb-event-meta">
        <div>
          <dt>Date</dt>
          <dd><time dateTime={event.date}>{event.displayDate}</time></dd>
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

function EventSection({ emptyMessage, events, eyebrow, title }) {
  return (
    <section className="sideb-panel" aria-labelledby={`${eyebrow.toLowerCase()}-events-heading`}>
      <div className="sideb-section-heading">
        <div>
          <p>{eyebrow}</p>
          <h2 id={`${eyebrow.toLowerCase()}-events-heading`}>{title}</h2>
        </div>
      </div>

      {events.length > 0 ? (
        <div className="sideb-event-grid">
          {events.map((event) => (
            <EventCard event={event} key={event.id} />
          ))}
        </div>
      ) : (
        <p className="sideb-empty">{emptyMessage}</p>
      )}
    </section>
  );
}

function Events({ specialEvents }) {
  const upcomingEvents = getUpcomingEvents(specialEvents);
  const recentEvents = getRecentEvents(specialEvents);
  const nextEvent = upcomingEvents[0];

  return (
    <div className="sideb-page sideb-subpage sideb-events-page">
      <main className="sideb-subpage-main" id="main-content" tabIndex="-1">
        <section className="sideb-page-hero sideb-page-hero-split" aria-labelledby="events-title">
          <div>
            <p className="sideb-kicker">Events</p>
            <h1 id="events-title">Club plans beyond the weekly vote.</h1>
            <p>
              Keep up with listening nights, record store runs, concerts, and the
              occasional low-key hang outside the regular meeting rhythm.
            </p>
          </div>

          <aside className="sideb-next-card" aria-label="Next session">
            <span>Next Session</span>
            <strong>{nextEvent?.title || "Nothing posted yet"}</strong>
            <p>
              {nextEvent
                ? `${nextEvent.displayDate} at ${nextEvent.time}`
                : "Check back after the next club update."}
            </p>
            <small>{nextEvent?.location || "Album Listening Club"}</small>
          </aside>
        </section>

        <EventSection
          emptyMessage="No upcoming events are posted yet."
          events={upcomingEvents}
          eyebrow="Upcoming"
          title="What is next."
        />

        <EventSection
          emptyMessage="No recent events are posted yet."
          events={recentEvents}
          eyebrow="Recent"
          title="What we just did."
        />
      </main>
    </div>
  );
}

export default Events;
