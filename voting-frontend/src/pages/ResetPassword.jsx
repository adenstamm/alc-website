import { useState } from "react";

function ResetPassword({ hasSupabaseConfig, navigate, supabase }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus(null);
    setError(null);

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

    setPassword("");
    setConfirmPassword("");
    setStatus("Password updated. You can now sign in with your new password.");
  }

  return (
    <div className="reset-page">
      <section className="page-header surface-card">
        <div>
          <p className="eyebrow">Account</p>
          <h1 className="page-title">Reset your password.</h1>
          <p className="page-intro">
            Enter a new password after opening the reset link from your email.
          </p>
        </div>

        <button className="button button-secondary" type="button" onClick={() => navigate("/vote")}>
          Back to voting
        </button>
      </section>

      <article className="surface-card vote-form-card reset-card">
        {!hasSupabaseConfig ? (
          <div className="confirmation-card">
            <p className="eyebrow">Setup needed</p>
            <h3>Connect Supabase before password reset works.</h3>
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

            {error ? <p className="form-error">{error}</p> : null}
            {status ? <p className="form-success">{status}</p> : null}

            <button className="button button-primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Updating..." : "Update password"}
            </button>
          </form>
        )}
      </article>
    </div>
  );
}

export default ResetPassword;
