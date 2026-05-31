function About({ clubLinks, navigate }) {
  const basics = [
    {
      label: "Established",
      value: "2020",
      description: "ALC has been giving people a reason to listen closely and talk albums together since 2020.",
    },
    {
      label: "Meeting time",
      value: "Wednesdays at 7:15",
      description: "Regular club nights are casual, discussion-first, and built around the current album.",
    },
    {
      label: "Location",
      value: "Hayden basement, C8",
      description: "We meet in Hayden Library basement room C8 unless a special event says otherwise.",
    },
  ];

  const steps = [
    {
      title: "Listen before club",
      description:
        "The weekly album gives everyone a shared starting point, but you do not need a perfect take to show up.",
    },
    {
      title: "Talk it out",
      description:
        "Discussion can move from favorite tracks to production, lyrics, memories, rankings, and side quests.",
    },
    {
      title: "Vote on what comes next",
      description:
        "Members nominate albums, vote in the primary, and rank the five finalists in the final round.",
    },
  ];

  return (
    <div className="about-page cozy-about-page">
      <section className="about-hero surface-card">
        <div>
          <p className="eyebrow">More info</p>
          <h1 className="page-title">A listening club for album people.</h1>
          <p className="page-intro">
            Album Listening Club is like a book club, but for records. We pick an album,
            listen during the week, then meet up to yap, compare notes, and choose what
            everyone should hear next.
          </p>
        </div>

        <div className="about-established">
          <span>Est.</span>
          <strong>2020</strong>
        </div>
      </section>

      <section className="about-grid" aria-label="Club basics">
        {basics.map((item) => (
          <article className="about-card" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <p>{item.description}</p>
          </article>
        ))}
      </section>

      <section className="about-section surface-card">
        <div className="section-heading">
          <span className="eyebrow">What to expect</span>
          <h2>Come curious. No homework energy required.</h2>
          <p>
            You can be the person with a deep read, the person who only liked two songs,
            or the person discovering the artist for the first time. The point is to make
            listening feel social.
          </p>
        </div>

        <div className="about-step-grid">
          {steps.map((step, index) => (
            <article className="about-step" key={step.title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{step.title}</strong>
              <p>{step.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="about-section surface-card">
        <div className="section-heading">
          <span className="eyebrow">Joining</span>
          <h2>Start with one meeting.</h2>
          <p>
            Join through Sun Devil Central if you want official club access, follow the
            Instagram for updates, and use the vote page once your account is approved.
          </p>
        </div>

        <div className="about-actions">
          <a className="button button-primary" href={clubLinks.sunDevilCentral}>
            Join the club
          </a>
          <a className="button button-secondary" href={clubLinks.instagram}>
            Instagram
          </a>
          <button className="button button-secondary" type="button" onClick={() => navigate("/vote")}>
            Voting page
          </button>
        </div>
      </section>
    </div>
  );
}

export default About;
