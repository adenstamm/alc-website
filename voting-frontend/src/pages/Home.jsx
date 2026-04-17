import { phaseContent } from "../data/clubContent";

function Home({ clubPrinciples, currentPoll, navigate, recentAlbums, weeklyRhythm }) {
  const phaseLabel = phaseContent[currentPoll.phase].label;

  return (
    <div className="home-page">
      <section className="hero-panel">
        <div className="hero-copy surface-card">
          <p className="eyebrow">Your weekly dose of new music</p>
          <h1 className="hero-title">
            Album Listening Club
          </h1>
          <p className="hero-lead">
            ALC is a club dedicated to helping you expand your music taste while making new friends along the way. Yap about your week, favorite media, but most
            importantly what you thought of the album this week (whether you loved it or hated it ! )
          </p>

          <div className="hero-actions">
            <button className="button button-primary" onClick={() => navigate("/vote")}>
              Vote on next week&apos;s album!
            </button>

            <a className="button button-secondary" href="#recent-albums">
              Browse recent albums
            </a>
          </div>

          <div className="signal-grid" aria-label="Product strengths">
            <div className="signal-card">
              <span className="signal-value">Voting rules</span>
              <p>Rate this weeks album, nominate a new album, and choose your favorite from the nominations :)</p>
            </div>

            <div className="signal-card">
              <span className="signal-value">1 vote per user</span>
              <p>We want to make sure everyone has a say! </p>
            </div>

            <div className="signal-card">
              <span className="signal-value">3 phases</span>
              <p>All voting phases will be accessed on the same page</p>
            </div>
          </div>
        </div>

        <aside className="hero-aside surface-card">
          <p className="phase-pill">{currentPoll.cycleLabel}</p>
          <h2 className="aside-title">This week&apos;s album</h2>

          <div className="album-spotlight">
            <span className="album-spotlight-label">{currentPoll.albumOfWeek.note}</span>
            <strong>{currentPoll.albumOfWeek.title}</strong>
            <p>{currentPoll.albumOfWeek.artist}</p>
          </div>

          <dl className="meta-list">
            <div>
              <dt>Poll phase</dt>
              <dd>{phaseLabel}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{currentPoll.status}</dd>
            </div>
            <div>
              <dt>Ballot prompt</dt>
              <dd>{currentPoll.question}</dd>
            </div>
          </dl>

          <button className="button button-secondary full-width" onClick={() => navigate("/vote")}>
            Go to voting
          </button>
        </aside>
      </section>

      <section className="section-block" id="recent-albums">
        <div className="section-heading">
          <h2>Recent Album Listening Club Albums</h2>
        </div>

        <div className="album-grid">
          {recentAlbums.map((album) => (
            <article key={album.id} className="album-card surface-card">
              <span className="album-period">{album.period}</span>
              <h3>{album.title}</h3>
              <p className="album-artist">{album.artist}</p>
              <p className="album-note">{album.note}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export default Home;
