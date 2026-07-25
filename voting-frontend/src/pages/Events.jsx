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

function EventSection({ children, events, id, title }) {
  return (
    <section className="sideb-panel events-section" aria-labelledby={id}>
      <div className="sideb-section-heading">
        <h2 id={id}>{title}</h2>
      </div>

      {events.length > 0 ? (
        <div className="sideb-event-grid">
          {events.map((event) => (
            <EventCard event={event} key={event.id} />
          ))}
        </div>
      ) : (
        children
      )}
    </section>
  );
}

function Events({ clubLinks, specialEvents }) {
  const upcomingEvents = getUpcomingEvents(specialEvents);
  const recentEvents = getRecentEvents(specialEvents);
  const nextEvent = upcomingEvents[0];

  return (
    <div className="sideb-page sideb-subpage sideb-events-page">
      <main className="sideb-subpage-main" id="main-content" tabIndex="-1">
        <section
          className={`sideb-page-hero ${nextEvent ? "sideb-page-hero-split" : "events-page-hero-empty"}`}
          aria-labelledby="events-title"
        >
          <div>
            <p className="sideb-kicker">Events</p>
            <h1 id="events-title">Club plans beyond the weekly vote.</h1>
            <p>
              Listening nights, record-store runs, concerts, and low-key hangs
              beyond the regular meeting.
            </p>
          </div>

          {nextEvent ? (
            <aside className="sideb-next-card" aria-label="Next session">
              <span>Next session</span>
              <strong>{nextEvent.title}</strong>
              <p>{nextEvent.displayDate} at {nextEvent.time}</p>
              <small>{nextEvent.location}</small>
            </aside>
          ) : null}
        </section>

        <EventSection
          events={upcomingEvents}
          id="upcoming-events-heading"
          title="Upcoming gatherings"
        >
          <div className="events-empty-state">
            <div>
              <h3>No dates are posted yet.</h3>
              <p>New sessions and club plans are announced through our official channels.</p>
            </div>
            <div className="events-empty-actions">
              <a
                className="sideb-button sideb-button-primary"
                href={clubLinks.instagram}
                rel="noreferrer"
                target="_blank"
              >
                Check Instagram
              </a>
              <a
                className="sideb-button sideb-button-ghost"
                href={clubLinks.sunDevilCentral}
                rel="noreferrer"
                target="_blank"
              >
                Join the club
              </a>
            </div>
          </div>
        </EventSection>

        <EventSection
          events={recentEvents}
          id="recent-events-heading"
          title="Recent gatherings"
        >
          <div className="events-empty-state events-empty-state-quiet">
            <div>
              <h3>No recent events are listed.</h3>
              <p>Past sessions will appear here after club updates are published.</p>
            </div>
          </div>
        </EventSection>
      </main>
    </div>
  );
}

export default Events;
