function Navbar({ currentPath, navigate }) {
  const links = [
    { path: "/", label: "Home" },
    { path: "/vote", label: "Vote" },
  ];

  function handleNavigate(event, path) {
    event.preventDefault();
    navigate(path);
  }

  //handle nav helps with no full reload
  return (
    <header className="site-nav">
      <a href="/" className="brand" onClick={(event) => handleNavigate(event, "/")}> 
        <span className="brand-mark">ALC</span>

        <span className="brand-copy">
          <strong>Weekly Listening Club</strong>
          <span>Album Listening Club</span>
        </span>
      </a>

      <nav className="nav-links" aria-label="Primary">
        {links.map((link) => (
          <a
            key={link.path}
            href={link.path}
            className={`nav-link ${currentPath === link.path ? "is-active" : ""}`}
            onClick={(event) => handleNavigate(event, link.path)}
          >
            {link.label}
          </a>
        ))}
      </nav>
    </header>
  );
}

export default Navbar;
