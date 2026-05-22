import { useEffect, useState } from "react";

function isAdmin(membership) {
  return membership?.status === "approved" && membership?.role === "admin";
}

function Admin({ authReady, hasSupabaseConfig, membership, session, supabase }) {
  const [memberships, setMemberships] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const canManageMembers = hasSupabaseConfig && isAdmin(membership);

  useEffect(() => {
    if (!canManageMembers) {
      return;
    }

    let isMounted = true;

    async function loadMemberships() {
      setIsLoading(true);
      setError(null);

      const { data, error: loadError } = await supabase
        .from("memberships")
        .select("user_id, email, display_name, status, role, created_at, updated_at")
        .order("created_at", { ascending: false });

      if (!isMounted) {
        return;
      }

      if (loadError) {
        setError(loadError.message);
      } else {
        setMemberships(data);
      }

      setIsLoading(false);
    }

    loadMemberships();

    return () => {
      isMounted = false;
    };
  }, [canManageMembers, supabase]);

  async function updateMembership(userId, updates) {
    setError(null);
    setMessage(null);

    const { data, error: updateError } = await supabase
      .from("memberships")
      .update(updates)
      .eq("user_id", userId)
      .select("user_id, email, display_name, status, role, created_at, updated_at")
      .single();

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setMemberships((currentMemberships) =>
      currentMemberships.map((currentMembership) =>
        currentMembership.user_id === userId ? data : currentMembership,
      ),
    );
    setMessage("Membership updated.");
  }

  function renderBody() {
    if (!hasSupabaseConfig) {
      return (
        <article className="surface-card vote-form-card">
          <p className="eyebrow">Setup needed</p>
          <h2 className="sidebar-title">Connect Supabase first.</h2>
          <p className="sidebar-copy">
            Add your Supabase environment variables and run the schema before managing members.
          </p>
        </article>
      );
    }

    if (!authReady) {
      return (
        <article className="surface-card vote-form-card">
          <p className="eyebrow">Loading</p>
          <h2 className="sidebar-title">Checking admin access.</h2>
        </article>
      );
    }

    if (!session) {
      return (
        <article className="surface-card vote-form-card">
          <p className="eyebrow">Admin only</p>
          <h2 className="sidebar-title">Sign in on the vote page first.</h2>
          <p className="sidebar-copy">Only approved ALC admins can manage member approvals.</p>
        </article>
      );
    }

    if (!canManageMembers) {
      return (
        <article className="surface-card vote-form-card">
          <p className="eyebrow">Admin only</p>
          <h2 className="sidebar-title">This account cannot manage memberships.</h2>
          <p className="sidebar-copy">
            You are signed in as {session.user.email}, but this account is not an approved admin.
          </p>
        </article>
      );
    }

    return (
      <article className="surface-card vote-form-card">
        <div className="form-header">
          <div>
            <span className="phase-pill phase-primary">Member approval</span>
            <h2>Approve voting access</h2>
          </div>
          <p>Approved members get one database-enforced submission per poll.</p>
        </div>

        {error ? <p className="form-error">{error}</p> : null}
        {message ? <p className="form-success">{message}</p> : null}

        {isLoading ? (
          <p className="helper-note">Loading members...</p>
        ) : (
          <div className="member-list">
            {memberships.map((member) => (
              <article className="member-row" key={member.user_id}>
                <div>
                  <strong>{member.display_name || member.email}</strong>
                  <p>{member.email}</p>
                </div>

                <div className="member-badges">
                  <span>{member.status}</span>
                  <span>{member.role}</span>
                </div>

                <div className="member-actions">
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => updateMembership(member.user_id, { status: "approved" })}
                  >
                    Approve
                  </button>
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => updateMembership(member.user_id, { status: "rejected" })}
                  >
                    Reject
                  </button>
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => updateMembership(member.user_id, { role: "admin" })}
                  >
                    Make admin
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </article>
    );
  }

  return (
    <div className="admin-page">
      <section className="page-header surface-card">
        <div>
          <p className="eyebrow">Admin</p>
          <h1 className="page-title">Membership approvals.</h1>
          <p className="page-intro">
            This is where account creation turns into real voting access.
          </p>
        </div>
      </section>

      {renderBody()}
    </div>
  );
}

export default Admin;
