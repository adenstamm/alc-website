import { useState } from "react";

function AuthPanel({ supabase }) {
  const [mode, setMode] = useState("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOAuthSubmitting, setIsOAuthSubmitting] = useState(false);

  const isSignUp = mode === "sign-up";
  const isReset = mode === "reset";

  function handleModeChange(nextMode) {
    setMode(nextMode);
    setStatus(null);
    setError(null);
  }

  async function handleGoogleSignIn() {
    setError(null);
    setStatus(null);
    setIsOAuthSubmitting(true);

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/vote`,
      },
    });

    if (oauthError) {
      setError(oauthError.message || "Could not start Google sign in.");
      setIsOAuthSubmitting(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setStatus(null);
    setIsSubmitting(true);

    const cleanEmail = email.trim();

    try {
      if (isReset) {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: `${window.location.origin}/reset-password`,
        });

        if (resetError) {
          throw resetError;
        }

        setStatus("Check your email for a password reset link.");
        return;
      }

      const response = isSignUp
        ? await supabase.auth.signUp({
            email: cleanEmail,
            password,
            options: {
              data: {
                display_name: displayName.trim(),
              },
            },
          })
        : await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password,
          });

      if (response.error) {
        throw response.error;
      }

      setStatus(
        isSignUp
          ? "Check your email to verify your account. An admin can approve your membership after that."
          : "Signed in.",
      );
    } catch (authError) {
      setError(authError.message || "Something went wrong. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-panel">
      <div className="auth-mode-switch" role="tablist" aria-label="Account mode">
        <button
          className={mode === "sign-in" ? "is-active" : ""}
          type="button"
          onClick={() => handleModeChange("sign-in")}
        >
          Sign in
        </button>
        <button
          className={mode === "sign-up" ? "is-active" : ""}
          type="button"
          onClick={() => handleModeChange("sign-up")}
        >
          Create account
        </button>
      </div>

      <button
        className="button button-oauth"
        type="button"
        disabled={isOAuthSubmitting || isSubmitting}
        onClick={handleGoogleSignIn}
      >
        {isOAuthSubmitting ? "Opening Google..." : "Continue with Google"}
      </button>

      <form className="vote-form" onSubmit={handleSubmit}>
        {isSignUp ? (
          <div className="field-group">
            <label htmlFor="displayName">Name</label>
            <input
              id="displayName"
              name="displayName"
              type="text"
              autoComplete="name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>
        ) : null}

        <div className="field-group">
          <label htmlFor="accountEmail">Email</label>
          <input
            id="accountEmail"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        {!isReset ? (
          <div className="field-group">
            <label htmlFor="accountPassword">Password</label>
            <input
              id="accountPassword"
              name="password"
              type="password"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
        ) : null}

        {error ? <p className="form-error">{error}</p> : null}
        {status ? <p className="form-success">{status}</p> : null}

        <button className="button button-primary" type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? "Working..."
            : isReset
              ? "Send reset link"
              : isSignUp
                ? "Create account"
                : "Sign in"}
        </button>

        {!isSignUp ? (
          <button
            className="auth-link-button"
            type="button"
            onClick={() => handleModeChange(isReset ? "sign-in" : "reset")}
          >
            {isReset ? "Back to sign in" : "Forgot password?"}
          </button>
        ) : null}
      </form>
    </div>
  );
}

export default AuthPanel;
