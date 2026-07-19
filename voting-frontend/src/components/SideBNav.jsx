import { useEffect, useRef, useState } from "react";

import { accountStatusContent, getAccountName, getAccountStatus } from "../lib/accountStatus";

const navItems = [
  { label: "Home", path: "/" },
  { label: "Current", path: "/current" },
  { label: "About", path: "/about" },
  { label: "Archive", path: "/archive" },
  { label: "Events", path: "/events" },
  { label: "Vote", path: "/vote" },
];

function SideBNav({
  activePath,
  authReady,
  membership,
  navigate,
  session,
  showAdminLink = false,
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCompactNav, setIsCompactNav] = useState(() => window.matchMedia("(max-width: 760px)").matches);
  const headerRef = useRef(null);
  const menuButtonRef = useRef(null);
  const visibleNavItems = showAdminLink
    ? [...navItems, { label: "Admin", path: "/admin" }]
    : navItems;
  const accountStatus = getAccountStatus(session, membership);
  const accountName = getAccountName(session, membership);
  const accountLabel = authReady ? (session ? accountName : "Sign in") : "Account";

  function handleNavigate(event, path) {
    event.preventDefault();
    setIsMenuOpen(false);
    navigate(path);
  }

  useEffect(() => {
    const compactNavQuery = window.matchMedia("(max-width: 760px)");

    function handleCompactNavChange(event) {
      setIsCompactNav(event.matches);

      if (!event.matches) {
        setIsMenuOpen(false);
      }
    }

    compactNavQuery.addEventListener("change", handleCompactNavChange);

    return () => compactNavQuery.removeEventListener("change", handleCompactNavChange);
  }, []);

  useEffect(() => {
    if (!isMenuOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    }

    function handlePointerDown(event) {
      if (!headerRef.current?.contains(event.target)) {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isMenuOpen]);

  return (
    <header
      className="sideb-nav"
      ref={headerRef}
    >
      <a className="skip-link" href="#main-content">Skip to content</a>

      <div className="sideb-nav-inner">
        <a
          aria-label="Album Listening Club home"
          className="sideb-brand sideb-brand-image-link"
          href="/"
          onClick={(event) => handleNavigate(event, "/")}
        >
          <span className="sideb-brand-image-frame" aria-hidden="true">
            <img
              alt=""
              className="sideb-brand-image"
              height="1200"
              src="/alc-logo.png"
              width="1200"
            />
          </span>
        </a>

        <button
          aria-controls="primary-navigation"
          aria-expanded={isMenuOpen}
          aria-label={isMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          className="sideb-menu-toggle"
          onClick={() => setIsMenuOpen((isOpen) => !isOpen)}
          ref={menuButtonRef}
          type="button"
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span className="sideb-menu-label">Menu</span>
        </button>

        <nav
          className={`sideb-links ${isMenuOpen ? "is-open" : ""}`}
          hidden={isCompactNav && !isMenuOpen}
          id="primary-navigation"
          aria-label="Primary navigation"
        >
          {visibleNavItems.map((item, index) => {
            const isActive = item.path === activePath;

            return (
              <a
                aria-current={isActive ? "page" : undefined}
                className={isActive ? "is-active" : ""}
                href={item.path}
                key={item.path}
                onClick={(event) => handleNavigate(event, item.path)}
              >
                <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                {item.label}
              </a>
            );
          })}
        </nav>

        <a
          aria-current={activePath === "/account" ? "page" : undefined}
          aria-label={session ? `Open account for ${accountName}` : "Sign in or create an account"}
          className={`sideb-account-link ${activePath === "/account" ? "is-active" : ""}`}
          href="/account"
          onClick={(event) => handleNavigate(event, "/account")}
        >
          <span className={`sideb-account-dot status-${accountStatus}`} aria-hidden="true" />
          <span className="sideb-account-meta">
            <strong>{accountLabel}</strong>
            <small>{authReady ? accountStatusContent[accountStatus].label : "Checking session"}</small>
          </span>
        </a>
      </div>
    </header>
  );
}

export default SideBNav;
