const footerLinks = [
  { label: "Current listen", path: "/current" },
  { label: "Archive", path: "/archive" },
  { label: "Events", path: "/events" },
  { label: "Vote", path: "/vote" },
];

function SiteFooter({ clubLinks, navigate }) {
  function handleNavigate(event, path) {
    event.preventDefault();
    navigate(path);
  }

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-statement">
          <span className="sideb-logo" aria-hidden="true"><span /></span>
          <div>
            <p>Album Listening Club</p>
            <strong>One record. One week. A room full of opinions.</strong>
          </div>
        </div>

        <nav className="site-footer-links" aria-label="Explore Album Listening Club">
          <p className="site-footer-column-label">Keep listening</p>
          {footerLinks.map((link) => (
            <a
              href={link.path}
              key={link.path}
              onClick={(event) => handleNavigate(event, link.path)}
            >
              <span>{link.label}</span>
              <span className="site-footer-link-arrow" aria-hidden="true">↗</span>
            </a>
          ))}
        </nav>

        <div className="site-footer-external">
          <p className="site-footer-column-label">Find the room</p>
          <a href={clubLinks.instagram} rel="noreferrer" target="_blank">
            <span>Instagram</span><span aria-hidden="true">↗</span>
          </a>
          <a href={clubLinks.sunDevilCentral} rel="noreferrer" target="_blank">
            <span>Sun Devil Central</span><span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>

      <div className="site-footer-fineprint">
        <span>Album Listening Club</span>
        <a href="/privacy" onClick={(event) => handleNavigate(event, "/privacy")}>Privacy</a>
        <span>Student-led at Arizona State University</span>
      </div>
    </footer>
  );
}

export default SiteFooter;
