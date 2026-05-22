import { useState } from "react";

function AuthPanel({ supabase }) {
  const [mode, setMode] = useState("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSignUp = mode === "sign-up";

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setStatus(null);
    setIsSubmitting(true);

    const cleanEmail = email.trim();

    try {
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
          onClick={() => setMode("sign-in")}
        >
          Sign in
        </button>
        <button
          className={mode === "sign-up" ? "is-active" : ""}
          type="button"
          onClick={() => setMode("sign-up")}
        >
          Create account
        </button>
      </div>

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

        {error ? <p className="form-error">{error}</p> : null}
        {status ? <p className="form-success">{status}</p> : null}

        <button className="button button-primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Working..." : isSignUp ? "Create account" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

export default AuthPanel;
