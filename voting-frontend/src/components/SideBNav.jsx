const navItems = [
  { label: "Home", path: "/" },
  { label: "Current", path: "/current" },
  { label: "About", path: "/about" },
  { label: "Archive", path: "/archive" },
  { label: "Events", path: "/events" },
  { label: "Vote", path: "/vote" },
];

function SideBNav({ activePath, navigate, showAdminLink = false }) {
  const visibleNavItems = showAdminLink
    ? [...navItems, { label: "Admin", path: "/admin" }]
    : navItems;

  return (
    <header className="sideb-nav">
      <button className="sideb-brand" type="button" onClick={() => navigate("/")}>
        <span className="sideb-logo" aria-hidden="true">
          <span />
        </span>
        <strong>side b</strong>
      </button>

      <nav className="sideb-links" aria-label="Primary navigation">
        {visibleNavItems.map((item) => (
          <button
            className={item.path === activePath ? "is-active" : ""}
            key={item.path}
            type="button"
            onClick={() => navigate(item.path)}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </header>
  );
}

export default SideBNav;
