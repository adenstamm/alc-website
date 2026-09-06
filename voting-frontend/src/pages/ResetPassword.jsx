import { useEffect, useState, useSyncExternalStore } from "react";

import { recoverySessionStore } from "../lib/recoverySession";

function ResetPassword({ hasSupabaseConfig, navigate, supabase }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const isRecoverySession = useSyncExternalStore(
    recoverySessionStore.subscribe,
    recoverySessionStore.getSnapshot,
  );
  const [isCheckingRecovery, setIsCheckingRecovery] = useState(
    Boolean(hasSupabaseConfig),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!hasSupabaseConfig || !supabase) {
      setIsCheckingRecovery(false);
      return undefined;
    }

    let isMounted = true;

    supabase.auth
      .getSession()
      .catch(() => {
        if (isMounted)
          setError(
            "Could not check your recovery session. Reload to try again.",
          );
      })
      .finally(() => {
        if (isMounted) setIsCheckingRecovery(false);
      });
    return () => {
      isMounted = false;
    };
  }, [hasSupabaseConfig, supabase]);

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus(null);
    setError(null);

    if (!isRecoverySession) {
      setError(
        "Open the password reset link from your email before setting a new password.",
      );
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    setIsSubmitting(false);

    if (updateError) {
      setError(updateError.message || "Could not update your password.");
      return;
    }

    recoverySessionStore.clear();
    setPassword("");
    setConfirmPassword("");
    setStatus("Password updated. You can now sign in with your new password.");
  }

  return (
    <div className="sideb-page sideb-subpage sideb-vote-page sideb-reset-page">
      <main className="sideb-subpage-main" id="main-content" tabIndex="-1">
        <section className="sideb-page-hero sideb-page-hero-split">
          <div>
            <p className="sideb-kicker">Account</p>
            <h1>Reset your password.</h1>
            <p>
              Enter a new password after opening the reset link from your email.
            </p>
          </div>

          <button
            className="sideb-button sideb-button-ghost"
            type="button"
            onClick={() => navigate("/account")}
          >
            Back to account
          </button>
        </section>

        <article className="surface-card vote-form-card reset-card">
          {!hasSupabaseConfig ? (
            <div className="confirmation-card">
              <p className="eyebrow">Setup needed</p>
              <h3>Connect Supabase before password reset works.</h3>
            </div>
          ) : isCheckingRecovery ? (
            <div className="confirmation-card">
              <p className="eyebrow">Checking reset link</p>
              <h3>Verifying your password recovery session.</h3>
            </div>
          ) : status ? (
            <div className="confirmation-card" role="status">
              <h3>Password updated.</h3>
              <p>{status}</p>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => navigate("/account")}
              >
                Back to account
              </button>
            </div>
          ) : !isRecoverySession ? (
            <div className="confirmation-card">
              <p className="eyebrow">Reset link needed</p>
              <h3>Open the password reset link from your email.</h3>
              <p>
                Supabase only allows password changes after the recovery link
                creates a temporary session.
              </p>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => navigate("/account")}
              >
                Back to account
              </button>
            </div>
          ) : (
            <form className="vote-form" onSubmit={handleSubmit}>
              <div className="field-group">
                <label htmlFor="newPassword">New password</label>
                <input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>

              <div className="field-group">
                <label htmlFor="confirmPassword">Confirm password</label>
                <input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </div>

              {error ? (
                <p className="form-error" role="alert">
                  {error}
                </p>
              ) : null}
              {status ? (
                <p className="form-success" role="status">
                  {status}
                </p>
              ) : null}

              <button
                className="button button-primary"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Updating..." : "Update password"}
              </button>
            </form>
          )}
        </article>
      </main>
    </div>
  );
}

export default ResetPassword;
