export function createDefaultFormState(phase, finalistIds = []) {
  if (phase === "nominations") {
    return {
      albumTitle: "",
      artistName: "",
      selectedCandidateIds: [],
      rankedCandidateIds: [],
    };
  }

  return {
    albumTitle: "",
    artistName: "",
    selectedCandidateIds: [],
    rankedCandidateIds: finalistIds,
  };
}

export function formatPhaseLabel(phase) {
  return phase.charAt(0).toUpperCase() + phase.slice(1);
}

export function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function normalizeVoteRecord(vote) {
  if (!vote) {
    return null;
  }

  const choices = [...(vote.choices || [])].sort((a, b) => a.rank - b.rank);

  return {
    pollId: vote.poll_id,
    phase: vote.phase,
    submittedAt: vote.created_at,
    candidateIds: choices.map((choice) => choice.candidate_id),
    nomination:
      vote.album_title && vote.artist_name
        ? {
            albumTitle: vote.album_title,
            artistName: vote.artist_name,
          }
        : null,
  };
}

export function attachUserToVote(vote, userId) {
  const normalizedVote = normalizeVoteRecord(vote);
  return normalizedVote ? { ...normalizedVote, userId } : null;
}

export async function fetchAuthoritativeStoredBallot(
  supabase,
  { pollId, phase, userId },
) {
  try {
    const { data, error } = await supabase
      .from("votes")
      .select(
        "poll_id, phase, album_title, artist_name, created_at, vote_choices(candidate_id, rank)",
      )
      .eq("poll_id", pollId)
      .eq("phase", phase)
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) {
      return { ballot: null, error };
    }

    return {
      ballot: attachUserToVote(
        {
          ...data,
          choices: data.vote_choices || [],
        },
        userId,
      ),
      error: null,
    };
  } catch (error) {
    return { ballot: null, error };
  }
}

export function formatNominationCount(count) {
  return `${count} nomination${count === 1 ? "" : "s"}`;
}

export function getVoteSubmissionError(error) {
  const message = error?.message || "";

  if (
    error?.code === "23505" ||
    message.includes("ALREADY_VOTED") ||
    message.includes("votes_one_per_user_per_poll_phase")
  ) {
    return "Your account already submitted this phase.";
  }

  return message || "Something went wrong while saving your vote.";
}

export function shouldReconcileVoteSubmission(error) {
  if (!error) {
    return true;
  }

  const message = String(error.message || "").toLowerCase();
  const status = Number(error.status || 0) || 0;

  return (
    error.code === "23505" ||
    message.includes("already_voted") ||
    message.includes("votes_one_per_user_per_poll_phase") ||
    status === 0 ||
    status === 429 ||
    status >= 500 ||
    message.includes("fetch") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("connection") ||
    message.includes("gateway")
  );
}
