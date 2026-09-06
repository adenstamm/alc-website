export default function AccountGate({
  accountStatus,
  authReady,
  handleBallotReload,
  handleMembershipReload,
  hasSubmitted,
  hasSupabaseConfig,
  isRefreshingBallot,
  isRefreshingMembership,
  navigate,
  pollError,
  pollErrorStatus,
  session,
}) {
  if (!hasSupabaseConfig) {
    return (
      <div className="confirmation-card">
        <p className="eyebrow">Setup needed</p>
        <h3>Connect Supabase before real voting opens.</h3>
        <p>
          Add <strong>VITE_SUPABASE_URL</strong> and{" "}
          <strong>VITE_SUPABASE_ANON_KEY</strong>
          to your environment, then run the Supabase schema in this repo.
        </p>
      </div>
    );
  }

  if (pollError && !hasSubmitted) {
    const errorTitle =
      pollErrorStatus === 401
        ? "Your sign-in needs attention."
        : pollErrorStatus === 429
          ? "Too many ballot refreshes."
          : "The ballot didn’t load.";

    return (
      <div className="confirmation-card ballot-recovery" role="alert">
        <p className="eyebrow">Ballot temporarily unavailable</p>
        <h3>{errorTitle}</h3>
        <p>{pollError}</p>
        <div className="ballot-recovery-actions">
          {pollErrorStatus === 401 ? (
            <a
              className="button button-secondary"
              href="/account"
              onClick={(event) => {
                event.preventDefault();
                navigate("/account");
              }}
            >
              Open account
            </a>
          ) : (
            <button
              className="button button-secondary"
              type="button"
              disabled={isRefreshingBallot}
              onClick={handleBallotReload}
            >
              {isRefreshingBallot ? "Reloading ballot…" : "Reload ballot"}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!authReady) {
    return (
      <div className="confirmation-card">
        <p className="eyebrow">Loading account</p>
        <h3>Checking your voting access.</h3>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="confirmation-card">
        <p className="eyebrow">Account required</p>
        <h3>Sign in or create an account to vote.</h3>
        <p>
          Voting opens after your email is verified and an admin approves your
          membership.
        </p>
        <a
          className="sideb-button sideb-button-primary"
          href="/account"
          onClick={(event) => {
            event.preventDefault();
            navigate("/account");
          }}
        >
          Open your account <span aria-hidden="true">→</span>
        </a>
      </div>
    );
  }

  if (accountStatus === "unverified") {
    return (
      <div className="confirmation-card">
        <p className="eyebrow">Verify email</p>
        <h3>Check your inbox before voting.</h3>
        <p>
          {session.user.email} needs to be verified before your account can
          vote.
        </p>
        <a
          className="button button-secondary"
          href="/account"
          onClick={(event) => {
            event.preventDefault();
            navigate("/account");
          }}
        >
          View account status
        </a>
      </div>
    );
  }

  if (accountStatus === "unavailable") {
    return (
      <div className="confirmation-card ballot-recovery" role="alert">
        <p className="eyebrow">Membership check unavailable</p>
        <h3>Your approval could not be verified right now.</h3>
        <p>
          You are still signed in. We retried automatically, but the membership
          service did not answer. Wait a moment and check again.
        </p>
        <button
          className="button button-secondary"
          type="button"
          disabled={isRefreshingMembership}
          onClick={handleMembershipReload}
        >
          {isRefreshingMembership
            ? "Checking membership…"
            : "Check membership again"}
        </button>
      </div>
    );
  }

  if (accountStatus === "pending") {
    return (
      <div className="confirmation-card">
        <p className="eyebrow">Approval pending</p>
        <h3>Your account is waiting for member approval.</h3>
        <p>
          You are signed in as {session.user.email}. Ask an ALC admin to approve
          your membership, then refresh your status from the Account page.
        </p>
        <a
          className="button button-secondary"
          href="/account"
          onClick={(event) => {
            event.preventDefault();
            navigate("/account");
          }}
        >
          View account status
        </a>
      </div>
    );
  }

  if (accountStatus === "blocked") {
    return (
      <div className="confirmation-card">
        <p className="eyebrow">Access unavailable</p>
        <h3>This account is not approved for voting.</h3>
        <p>Ask an ALC admin if you think this is a mistake.</p>
        <a
          className="button button-secondary"
          href="/account"
          onClick={(event) => {
            event.preventDefault();
            navigate("/account");
          }}
        >
          View account details
        </a>
      </div>
    );
  }

  return null;
}
