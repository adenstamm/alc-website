const SUPABASE_AUTH_ORIGIN = "https://lbcjxqxzsmsmndapvluz.supabase.co";
const ALLOWED_REDIRECT_URLS = new Set([
  "https://albumasu.com/account",
  "https://www.albumasu.com/account",
]);
const ALLOWED_VERIFICATION_TYPES = new Set(["email", "signup"]);

function getRawConfirmationUrl() {
  const prefix = "?confirmation_url=";

  if (!window.location.search.startsWith(prefix)) {
    return null;
  }

  return window.location.search.slice(prefix.length);
}

function parseConfirmationUrl() {
  const rawConfirmationUrl = getRawConfirmationUrl();

  if (!rawConfirmationUrl) {
    return null;
  }

  const candidates = [rawConfirmationUrl];

  try {
    candidates.push(decodeURIComponent(rawConfirmationUrl));
  } catch {
    // The direct value may already be decoded by the browser.
  }

  for (const candidate of candidates) {
    try {
      const confirmationUrl = new URL(candidate);
      const redirectUrl = confirmationUrl.searchParams.get("redirect_to");
      const verificationType = confirmationUrl.searchParams.get("type");
      const hasToken = Boolean(
        confirmationUrl.searchParams.get("token")
        || confirmationUrl.searchParams.get("token_hash"),
      );

      if (
        confirmationUrl.origin === SUPABASE_AUTH_ORIGIN
        && confirmationUrl.pathname === "/auth/v1/verify"
        && hasToken
        && ALLOWED_VERIFICATION_TYPES.has(verificationType)
        && ALLOWED_REDIRECT_URLS.has(redirectUrl)
      ) {
        return confirmationUrl.toString();
      }
    } catch {
      // Ignore malformed or partially encoded values.
    }
  }

  return null;
}

function ConfirmSignup({ navigate }) {
  const confirmationUrl = parseConfirmationUrl();

  return (
    <div className="sideb-page sideb-subpage sideb-vote-page confirm-signup-page">
      <main className="sideb-subpage-main" id="main-content" tabIndex="-1">
        <section className="sideb-page-hero sideb-page-hero-split confirm-signup-hero">
          <div>
            <p className="sideb-kicker">Member verification</p>
            <h1>One last step.</h1>
            <p>
              Confirm your email address before a club admin reviews your membership.
            </p>
          </div>

          <div className="confirm-signup-stamp" aria-hidden="true">
            <span>ALC</span>
            <strong>Verified listener</strong>
            <small>Arizona State University</small>
          </div>
        </section>

        <article className="surface-card vote-form-card confirm-signup-card">
          {confirmationUrl ? (
            <div className="confirmation-card">
              <p className="eyebrow">Verification link ready</p>
              <h2>Finish creating your account.</h2>
              <p>
                Continue to our authentication provider to verify this address. The link
                can only be used once.
              </p>
              <a className="button button-primary" href={confirmationUrl} rel="noreferrer">
                Confirm email address
              </a>
              <p className="confirm-signup-security-note">
                For your security, AlbumASU only accepts verification links issued by
                its Supabase project.
              </p>
            </div>
          ) : (
            <div className="confirmation-card">
              <p className="eyebrow">Link unavailable</p>
              <h2>Request a fresh verification email.</h2>
              <p>
                This confirmation link is incomplete or does not belong to AlbumASU.
                Return to the account page and create your account again.
              </p>
              <button className="button button-secondary" type="button" onClick={() => navigate("/account")}>
                Return to account
              </button>
            </div>
          )}
        </article>
      </main>
    </div>
  );
}

export default ConfirmSignup;
