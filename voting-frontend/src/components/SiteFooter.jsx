import { Link } from "react-router";

const footerLinks = [
  { label: "Current listen", path: "/current" },
  { label: "Archive", path: "/archive" },
  { label: "Events", path: "/events" },
  { label: "Vote", path: "/vote" },
];

function SiteFooter({ clubLinks }) {
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
            <Link
              key={link.path}
              to={link.path}
            >
              <span>{link.label}</span>
              <span className="site-footer-link-arrow" aria-hidden="true">↗</span>
            </Link>
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
        <Link to="/privacy">Privacy</Link>
        <span>Student-led at Arizona State University</span>
      </div>
    </footer>
  );
}

export default SiteFooter;
