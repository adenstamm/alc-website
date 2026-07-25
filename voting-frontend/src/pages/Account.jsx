import { useEffect, useState } from "react";

import AuthPanel from "../components/AuthPanel";
import {
  accountStatusContent,
  getAccountName,
  getAccountStatus,
} from "../lib/accountStatus";

function Account({
  authReady,
  hasSupabaseConfig,
  membership,
  navigate,
  refreshMembership,
  session,
  supabase,
}) {
  const [displayNameDraft, setDisplayNameDraft] = useState(membership?.display_name || "");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [profileMessage, setProfileMessage] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const accountStatus = getAccountStatus(session, membership);
  const statusContent = accountStatusContent[accountStatus];
  const accountName = getAccountName(session, membership);

  useEffect(() => {
    setDisplayNameDraft(membership?.display_name || session?.user?.user_metadata?.display_name || "");
  }, [membership?.display_name, session?.user?.user_metadata?.display_name]);

  function handleRouteLink(event, path) {
    event.preventDefault();
    navigate(path);
  }

  async function handleProfileSave(event) {
    event.preventDefault();
    setProfileMessage(null);
    setProfileError(null);

    const cleanDisplayName = displayNameDraft.trim();

    if (!cleanDisplayName) {
      setProfileError("Add the name you want club admins to see.");
      return;
    }

    if (!supabase || !session?.user) {
      setProfileError("Sign in again before updating your name.");
      return;
    }

    setIsSavingProfile(true);
    const { error } = await supabase.rpc("update_own_display_name", {
      display_name_input: cleanDisplayName,
    });
    setIsSavingProfile(false);

    if (error) {
      setProfileError(error.message || "Could not update your name.");
      return;
    }

    await refreshMembership();
    setProfileMessage("Display name updated.");
  }

  async function handleSignOut() {
    if (!supabase) {
      return;
    }

    setProfileError(null);
    setIsSigningOut(true);
    const { error } = await supabase.auth.signOut();
    setIsSigningOut(false);

    if (error) {
      setProfileError(error.message || "Could not sign out. Try again.");
    }
  }

  function renderAccountBody() {
    if (!hasSupabaseConfig) {
      return (
        <article className="surface-card account-message-card">
          <p className="eyebrow">Setup needed</p>
          <h2>Connect Supabase to open club accounts.</h2>
          <p>
            Add the project URL and publishable key to the environment, then apply the
            database schema and security hardening migration.
          </p>
        </article>
      );
    }

    if (!authReady) {
      return (
        <article className="surface-card account-message-card" role="status">
          <p className="eyebrow">Checking the guest list</p>
          <h2>Loading your account.</h2>
          <p>Your session and membership status will appear here in a moment.</p>
        </article>
      );
    }

    if (!session) {
      return (
        <div className="account-signin-layout">
          <article className="surface-card account-auth-card">
            <p className="eyebrow">Member access</p>
            <h2>Sign in or join the club.</h2>
            <p className="account-card-intro">
              Your account carries across the whole site. Verified and approved members
              can nominate records and cast one ballot per voting phase.
            </p>
            <AuthPanel redirectPath="/account" supabase={supabase} />
          </article>

          <aside className="account-side-note" aria-label="How account approval works">
            <p className="eyebrow">How membership works</p>
            <h3>Join the room in three steps.</h3>
            <ol className="account-steps">
              <li>
                <span>01</span>
                <div>
                  <strong>Create your account</strong>
                  <p>Use Google or sign up with your email.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>Verify your email</strong>
                  <p>Confirm the link we send to your inbox.</p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>Get club access</strong>
                  <p>Once approved, you can nominate albums and vote.</p>
                </div>
              </li>
            </ol>
          </aside>
        </div>
      );
    }

    return (
      <div className="account-dashboard">
        <article className="surface-card account-pass-card">
          <div className="account-pass-topline">
            <p className="eyebrow">Listening club pass</p>
            <span className={`account-status-pill status-${accountStatus}`}>
              {statusContent.label}
            </span>
          </div>

          <div className="account-identity">
            <span className="account-monogram" aria-hidden="true">
              {accountName.charAt(0).toUpperCase()}
            </span>
            <div>
              <h2>{accountName}</h2>
              <p>{session.user.email}</p>
            </div>
          </div>

          <dl className="account-details">
            <div>
              <dt>Membership</dt>
              <dd>{statusContent.label}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{membership?.role || "Member"}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{session.user.email_confirmed_at ? "Verified" : "Verification needed"}</dd>
            </div>
          </dl>

          <div className="account-pass-actions">
            {accountStatus === "approved" ? (
              <a
                className="sideb-button sideb-button-primary"
                href="/vote"
                onClick={(event) => handleRouteLink(event, "/vote")}
              >
                Open the ballot <span aria-hidden="true">→</span>
              </a>
            ) : (
              <button className="button button-secondary" type="button" onClick={refreshMembership}>
                Refresh membership
              </button>
            )}
          </div>
        </article>

        <article className="surface-card account-settings-card">
          <p className="eyebrow">Account details</p>
          <h2>{statusContent.title}</h2>
          <p className="account-card-intro">
            Keep the name club admins see up to date, or securely end this session.
          </p>

          <form className="profile-form" onSubmit={handleProfileSave}>
            <div className="field-group">
              <label htmlFor="accountDisplayName">Display name</label>
              <input
                autoComplete="name"
                id="accountDisplayName"
                type="text"
                placeholder="Your name"
                value={displayNameDraft}
                onChange={(event) => setDisplayNameDraft(event.target.value)}
              />
            </div>

            {profileError ? <p className="form-error" role="alert">{profileError}</p> : null}
            {profileMessage ? <p className="form-success" role="status">{profileMessage}</p> : null}

            <button className="button button-primary full-width" type="submit" disabled={isSavingProfile}>
              {isSavingProfile ? "Saving…" : "Save display name"}
            </button>
          </form>

          <div className="account-signout-row">
            <div>
              <strong>Finished listening?</strong>
              <p>Sign out on shared or public devices.</p>
            </div>
            <button className="button button-secondary" type="button" disabled={isSigningOut} onClick={handleSignOut}>
              {isSigningOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </article>
      </div>
    );
  }

  return (
    <div className="sideb-page sideb-subpage sideb-account-page">
      <main className="sideb-subpage-main" id="main-content" tabIndex="-1">
        <section className="sideb-page-hero account-page-hero">
          <div>
            <p className="sideb-kicker">Your account</p>
            <h1>One pass for every side.</h1>
            <p>
              Sign in once, keep tabs on membership approval, and take your place in the
              next listening-club vote.
            </p>
          </div>
        </section>

        {renderAccountBody()}
      </main>
    </div>
  );
}

export default Account;
