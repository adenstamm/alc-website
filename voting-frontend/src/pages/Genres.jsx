import genresPoster from "../assets/genres-this-year.png";

import { genreSchedule } from "../data/genreSchedule";

function Genres({ navigate }) {
  function handleHomeLink(event) {
    event.preventDefault();
    navigate("/");
  }

  return (
    <div className="sideb-page sideb-subpage sideb-genres-page">
      <main
        className="sideb-subpage-main genres-main"
        id="main-content"
        tabIndex="-1"
      >
        <section className="genres-showcase" aria-labelledby="genres-title">
          <div className="genres-showcase-copy">
            <p className="sideb-kicker">This year in genres</p>
            <h1 id="genres-title">This is what this year will sound like.</h1>
            <p>
              Every meeting will add another corner to the club&apos;s listening
              map. Open the poster at full size to explore the genres ahead.
            </p>
            <a
              className="sideb-button sideb-button-ghost"
              href="/"
              onClick={handleHomeLink}
            >
              Back to the club
            </a>
          </div>

          <figure className="genres-poster-figure">
            <a
              className="genres-poster-link"
              href={genresPoster}
              rel="noreferrer"
              target="_blank"
              aria-label="Open the year in genres poster at full size in a new tab"
            >
              <img
                alt="Hot-pink collage poster mapping this year's club meeting dates to featured genres."
                decoding="async"
                fetchPriority="high"
                height="1350"
                src={genresPoster}
                width="1080"
              />
            </a>
            <figcaption>
              <span>Album Listening Club · Year in genres</span>
              <a href={genresPoster} rel="noreferrer" target="_blank">
                Open full-size poster <span aria-hidden="true">↗</span>
              </a>
            </figcaption>
          </figure>
        </section>
        <section
          aria-labelledby="genre-schedule-title"
          className="genres-schedule"
        >
          <h2 id="genre-schedule-title">Dates and genres</h2>
          <p>The schedule shown in the poster.</p>
          <dl>
            {genreSchedule.map(([date, genre]) => (
              <div key={date}>
                <dt>{date}</dt>
                <dd>{genre}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
    </div>
  );
}

export default Genres;
