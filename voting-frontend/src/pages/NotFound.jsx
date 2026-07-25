function NotFound({ navigate }) {
  function handleNavigate(event, path) {
    event.preventDefault();
    navigate(path);
  }

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
            <a
              className="sideb-button sideb-button-primary"
              href="/"
              onClick={(event) => handleNavigate(event, "/")}
            >
              Return home
            </a>
            <a
              className="sideb-button sideb-button-ghost"
              href="/archive"
              onClick={(event) => handleNavigate(event, "/archive")}
            >
              Browse archive
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}

export default NotFound;
