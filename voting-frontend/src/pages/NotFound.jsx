import { Link } from "react-router";

function NotFound() {
  return (
    <div className="sideb-page sideb-subpage sideb-not-found-page">
      <main className="not-found-main" id="main-content" tabIndex="-1">
        <div className="not-found-art" aria-hidden="true">
          <span />
        </div>
        <div className="not-found-copy">
          <p className="sideb-kicker">Page not found</p>
          <h1>This record is not in our crate.</h1>
          <p>
            The address may be outdated or mistyped. Return home or browse the club archive.
          </p>
          <div className="not-found-actions">
            <Link
              className="sideb-button sideb-button-primary"
              to="/"
            >
              Return home
            </Link>
            <Link
              className="sideb-button sideb-button-ghost"
              to="/archive"
            >
              Browse archive
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

export default NotFound;
