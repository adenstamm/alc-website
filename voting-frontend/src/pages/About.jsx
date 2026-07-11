const basics = [
  {
    label: "Established",
    value: "2020",
    description: "A reason to listen closely and talk albums together.",
  },
  {
    label: "Meeting time",
    value: "Wednesdays at 7:15",
    description: "Casual, discussion-first club nights around the current album.",
  },
  {
    label: "Location",
    value: "Hayden basement, C8",
    description: "Unless a special session says otherwise.",
  },
];

const steps = [
  {
    title: "Listen before club",
    description:
      "The weekly album gives everyone a shared starting point. You do not need a perfect take to show up.",
  },
  {
    title: "Talk it out",
    description:
      "Discussion can move from favorite tracks to production, lyrics, memories, rankings, and general thoughts.",
  },
  {
    title: "Vote on what comes next",
    description:
      "Members nominate albums, vote in the primary, and rank the five finalists in the final round.",
  },
];

const firstMeetingFaq = [
  {
    question: "Where do I go?",
    answer:
      "Regular meetings are in Hayden Library basement C8 unless an event listing says otherwise.",
  },
  {
    question: "Do I need to finish the album?",
    answer:
      "No. Come with whatever you heard. Half-listened thoughts, favorite tracks, and confused first impressions all count.",
  },
  {
    question: "Do I have to talk?",
    answer:
      "No pressure. Listening is welcome, and conversation usually opens up naturally once people start comparing notes.",
  },
  {
    question: "How do voting and joining work?",
    answer:
      "Join through Sun Devil Central for official access, then create a voting account. An admin approves members before ballots open.",
  },
];

function About({ clubLinks, navigate }) {
  return (
    <div className="sideb-page sideb-subpage sideb-about-page">
      <main className="sideb-subpage-main" id="main-content" tabIndex="-1">
        <section className="sideb-page-hero" aria-labelledby="about-title">
          <p className="sideb-kicker">More Info</p>
          <h1 id="about-title">A club to meet people who love music just as much as you do</h1>
          <p>
            Album Listening Club is like a book club, but for records. We all vote an album,
            listen during the week, then share our thoughts at the meeting. Whether it is an album
            you know or something completely new, come expand your horizons, figure out what you
            like, and meet other people who love music.
          </p>
        </section>

        <section className="sideb-stat-grid" aria-label="Club basics">
          {basics.map((item) => (
            <article className="sideb-stat-card" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <p>{item.description}</p>
            </article>
          ))}
        </section>

        <section className="sideb-panel" aria-labelledby="expect-heading">
          <div className="sideb-section-heading">
            <div>
              <p>What to expect</p>
              <h2 id="expect-heading">Come curious. No homework energy required.</h2>
            </div>
          </div>

          <div className="sideb-step-grid">
            {steps.map((step, index) => (
              <article className="sideb-step-card" key={step.title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{step.title}</strong>
                <p>{step.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="sideb-panel first-meeting-panel" aria-labelledby="first-meeting-heading">
          <div className="sideb-section-heading">
            <div>
              <p>First meeting</p>
              <h2 id="first-meeting-heading">The tiny questions before you walk in.</h2>
            </div>
          </div>

          <div className="faq-grid">
            {firstMeetingFaq.map((item) => (
              <article className="faq-card" key={item.question}>
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="sideb-join-strip" aria-labelledby="join-heading">
          <div>
            <p className="sideb-kicker">Joining</p>
            <h2 id="join-heading">Start with one meeting.</h2>
            <span>
              Join through Sun Devil Central for official club access, follow Instagram
              for updates, and use the vote page once your account is approved.
            </span>
          </div>

          <div className="sideb-actions sideb-actions-compact">
            <a className="sideb-button sideb-button-primary" href={clubLinks.sunDevilCentral} rel="noreferrer" target="_blank">
              Join the Club
            </a>
            <a className="sideb-button sideb-button-ghost" href={clubLinks.instagram} rel="noreferrer" target="_blank">
              Instagram
            </a>
            <button
              className="sideb-button sideb-button-ghost"
              type="button"
              onClick={() => navigate("/vote")}
            >
              Voting Page
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

export default About;
