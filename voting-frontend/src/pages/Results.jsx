import { useEffect, useMemo, useState } from "react";

import SideBNav from "../components/SideBNav";
import "../styles/sideb-mock.css";

function formatCount(count, label) {
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

function getCandidateName(candidateId, candidates) {
  const candidate = candidates.find((item) => item.id === candidateId);
  return candidate ? `${candidate.title} - ${candidate.artist}` : candidateId;
}

function Results({
  hasSupabaseConfig,
  membership,
  navigate,
  poll,
  pollError,
  session,
  showAdminLink,
  supabase,
}) {
  const [results, setResults] = useState(null);
  const [resultsError, setResultsError] = useState(null);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const canViewAggregateResults = membership?.status === "approved" && membership?.role === "admin";
  const nominationRows = results?.nominations || [];
  const primaryRows = results?.primaryResults || [];
  const finalistRows = useMemo(
    () => results?.finalists || poll.finalists || [],
    [poll.finalists, results?.finalists],
  );
  const irvRounds = results?.irv?.rounds || [];
  const irvWinner = useMemo(
    () => finalistRows.find((candidate) => candidate.id === results?.irv?.winnerId),
    [finalistRows, results?.irv?.winnerId],
  );

  useEffect(() => {
    if (!hasSupabaseConfig || !supabase || !poll?.id || !canViewAggregateResults) {
      setResults(null);
      setResultsError(null);
      setIsLoadingResults(false);
      return;
    }

    let isMounted = true;

    async function loadResults() {
      setIsLoadingResults(true);
      setResultsError(null);

      const { data, error } = await supabase.rpc("get_admin_poll_results", {
        target_poll_id: poll.id,
      });

      if (!isMounted) {
        return;
      }

      if (error) {
        setResults(null);
        setResultsError(error.message);
      } else {
        setResults(data);
      }

      setIsLoadingResults(false);
    }

    loadResults();

    return () => {
      isMounted = false;
    };
  }, [canViewAggregateResults, hasSupabaseConfig, poll?.id, supabase]);

  function renderAdminResults() {
    if (!canViewAggregateResults) {
      return (
        <article className="surface-card vote-form-card">
          <p className="eyebrow">Results access</p>
          <h2 className="sidebar-title">Aggregate totals stay private until an admin reviews them.</h2>
          <p className="helper-note">
            {session
              ? "Your account can vote, but only admins can see live nomination counts, primary totals, and IRV rounds."
              : "Sign in on the voting page to participate. Live totals are admin-only."}
          </p>
          <button className="button button-secondary" type="button" onClick={() => navigate("/vote")}>
            Verify voting page
          </button>
        </article>
      );
    }

    return (
      <article className="surface-card vote-form-card results-panel">
        <div className="form-header">
          <div>
            <span className={`phase-pill phase-${poll.phase}`}>{poll.phase}</span>
            <h2>Live poll results</h2>
          </div>
          <p>{poll.status}</p>
        </div>

        {isLoadingResults ? <p className="helper-note">Loading live results...</p> : null}
        {resultsError ? <p className="form-error">{resultsError}</p> : null}

        {poll.phase === "nominations" ? (
          <div className="admin-result-list">
            {nominationRows.length ? nominationRows.map((candidate) => (
              <article className="admin-result-row" key={candidate.id}>
                <div>
                  <strong>{candidate.title}</strong>
                  <p>{candidate.artist}</p>
                </div>
                <span>{formatCount(candidate.nominationCount || 0, "nomination")}</span>
              </article>
            )) : <p className="helper-note">No nominations have been submitted yet.</p>}
          </div>
        ) : null}

        {poll.phase === "primary" ? (
          <div className="admin-result-list">
            {primaryRows.length ? primaryRows.map((candidate) => (
              <article className="admin-result-row" key={candidate.id}>
                <div>
                  <strong>{candidate.title}</strong>
                  <p>{candidate.artist}</p>
                </div>
                <span>{formatCount(candidate.primaryVotes || 0, "vote")}</span>
              </article>
            )) : <p className="helper-note">No primary votes have been submitted yet.</p>}
          </div>
        ) : null}

        {poll.phase === "final" ? (
          <>
            {irvWinner ? (
              <div className="confirmation-card">
                <p className="eyebrow">IRV winner</p>
                <h3>{irvWinner.title}</h3>
                <p>{irvWinner.artist}</p>
              </div>
            ) : null}

            <div className="admin-result-list">
              {irvRounds.length ? irvRounds.map((round) => (
                <article className="admin-irv-round" key={round.round}>
                  <strong>Round {round.round}</strong>
                  {round.tallies.map((tally) => (
                    <p key={tally.candidateId}>
                      {getCandidateName(tally.candidateId, finalistRows)}: {formatCount(tally.votes, "vote")}
                    </p>
                  ))}
                  {round.eliminatedCandidateId ? (
                    <span>Eliminated: {getCandidateName(round.eliminatedCandidateId, finalistRows)}</span>
                  ) : null}
                </article>
              )) : <p className="helper-note">No final round totals are available yet.</p>}
            </div>
          </>
        ) : null}
      </article>
    );
  }

  return (
    <div className="sideb-page sideb-subpage sideb-vote-page sideb-results-page">
      <SideBNav activePath="/results" navigate={navigate} showAdminLink={showAdminLink} />

      <main className="sideb-subpage-main">
        <section className="sideb-page-hero sideb-page-hero-split">
          <div>
            <p className="sideb-kicker">Results</p>
            <h1>Current poll status.</h1>
            <p>
            Follow the active voting cycle without exposing live totals to regular voters.
            </p>
          </div>

          <button className="sideb-button sideb-button-ghost" type="button" onClick={() => navigate("/vote")}>
            Verify voting page
          </button>
        </section>

        {pollError ? <p className="form-error">{pollError}</p> : null}

        <section className="vote-layout">
          {renderAdminResults()}

          <aside className="poll-sidebar">
            <article className="surface-card sidebar-card">
              <p className="eyebrow">Phase</p>
              <h2 className="sidebar-title">{poll.phase}</h2>
              <p className="sidebar-copy">{poll.description}</p>
            </article>

            <article className="surface-card sidebar-card">
              <p className="eyebrow">This week</p>
              <h2 className="sidebar-title">{poll.albumOfWeek.title}</h2>
              <p className="sidebar-copy">{poll.albumOfWeek.artist}</p>
            </article>
          </aside>
        </section>
      </main>
    </div>
  );
}

export default Results;
