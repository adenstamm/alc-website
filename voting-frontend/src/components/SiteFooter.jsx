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

        <nav className="site-footer-links" aria-label="Footer navigation">
          {footerLinks.map((link) => (
            <a
              href={link.path}
              key={link.path}
              onClick={(event) => handleNavigate(event, link.path)}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="site-footer-external">
          <a href={clubLinks.instagram} rel="noreferrer" target="_blank">Instagram</a>
          <a href={clubLinks.sunDevilCentral} rel="noreferrer" target="_blank">Join on Sun Devil Central</a>
        </div>
      </div>

      <div className="site-footer-fineprint">
        <span>Side B · established 2020</span>
        <span>Student-led at Arizona State University</span>
      </div>
    </footer>
  );
}

export default SiteFooter;
