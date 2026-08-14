export function validatePrimarySelection(candidateIds, maxSelections = 5) {
  if (!Array.isArray(candidateIds)) {
    return {
      isValid: false,
      message: "Choose at least one album before submitting.",
    };
  }

  const uniqueCandidateIds = new Set(candidateIds);

  if (candidateIds.length < 1) {
    return {
      isValid: false,
      message: "Choose at least one album before submitting.",
    };
  }

  if (candidateIds.length > maxSelections) {
    return {
      isValid: false,
      message: `Choose up to ${maxSelections} albums before submitting.`,
    };
  }

  if (uniqueCandidateIds.size !== candidateIds.length) {
    return {
      isValid: false,
      message: "Each album can only appear once on your ballot.",
    };
  }

  return {
    isValid: true,
    message: null,
  };
}

export function getRequiredFinalistCount(availableCandidateCount, maxFinalists = 5) {
  const normalizedAvailableCount = Number.isFinite(availableCandidateCount)
    ? Math.max(0, Math.floor(availableCandidateCount))
    : 0;

  return Math.min(normalizedAvailableCount, maxFinalists);
}

export function validateFinalistSelection(
  candidateIds,
  availableCandidateCount,
  maxFinalists = 5,
) {
  const requiredCount = getRequiredFinalistCount(availableCandidateCount, maxFinalists);

  if (requiredCount < 1) {
    return {
      isValid: false,
      message: "Add at least one album before moving to final voting.",
      requiredCount,
    };
  }

  if (!Array.isArray(candidateIds) || candidateIds.length !== requiredCount) {
    return {
      isValid: false,
      message: `Select exactly ${requiredCount} ${requiredCount === 1 ? "finalist" : "finalists"}.`,
      requiredCount,
    };
  }

  if (new Set(candidateIds).size !== candidateIds.length) {
    return {
      isValid: false,
      message: "Each finalist can only appear once.",
      requiredCount,
    };
  }

  return {
    isValid: true,
    message: null,
    requiredCount,
  };
}

export function validateFinalRanking(candidateIds, requiredCount = 5) {
  if (requiredCount < 1) {
    return {
      isValid: false,
      message: "This final ballot has no finalists.",
    };
  }

  if (!Array.isArray(candidateIds) || candidateIds.length !== requiredCount) {
    return {
      isValid: false,
      message: `Rank all ${requiredCount} ${requiredCount === 1 ? "finalist" : "finalists"} before submitting.`,
    };
  }

  if (new Set(candidateIds).size !== candidateIds.length) {
    return {
      isValid: false,
      message: "Each finalist can only appear once in your ranking.",
    };
  }

  return {
    isValid: true,
    message: null,
  };
}

export function moveRankedCandidate(candidateIds, candidateId, direction) {
  const currentIndex = candidateIds.indexOf(candidateId);
  const nextIndex = currentIndex + direction;

  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= candidateIds.length) {
    return candidateIds;
  }

  const nextIds = [...candidateIds];
  const [moved] = nextIds.splice(currentIndex, 1);
  nextIds.splice(nextIndex, 0, moved);
  return nextIds;
}

export function calculateIrvResult(ballots, candidateIds) {
  let activeCandidateIds = [...candidateIds];
  const rounds = [];

  while (activeCandidateIds.length > 0) {
    const tally = new Map(activeCandidateIds.map((candidateId) => [candidateId, 0]));

    for (const ballot of ballots) {
      const nextChoice = ballot.find((candidateId) => activeCandidateIds.includes(candidateId));

      if (nextChoice) {
        tally.set(nextChoice, tally.get(nextChoice) + 1);
      }
    }

    const tallies = activeCandidateIds.map((candidateId) => ({
      candidateId,
      votes: tally.get(candidateId),
    }));
    const activeBallots = tallies.reduce((total, item) => total + item.votes, 0);
    const maxVotes = Math.max(...tallies.map((item) => item.votes));
    const minVotes = Math.min(...tallies.map((item) => item.votes));
    const winner = tallies.find((item) => item.votes === maxVotes);
    const round = {
      round: rounds.length + 1,
      activeBallots,
      tallies,
    };

    rounds.push(round);

    if (activeBallots === 0) {
      return {
        rounds,
        winnerId: null,
        tie: null,
      };
    }

    if (maxVotes > activeBallots / 2) {
      return {
        rounds,
        winnerId: winner.candidateId,
        tie: null,
      };
    }

    if (activeCandidateIds.length === 1) {
      return {
        rounds,
        winnerId: activeCandidateIds[0],
        tie: null,
      };
    }

    const eliminationTies = tallies
      .filter((item) => item.votes === minVotes)
      .map((item) => item.candidateId);

    if (eliminationTies.length > 1) {
      return {
        rounds,
        winnerId: null,
        tie: {
          round: round.round,
          candidateIds: eliminationTies,
        },
      };
    }

    const eliminatedCandidateId = eliminationTies[0];
    round.eliminatedCandidateId = eliminatedCandidateId;
    activeCandidateIds = activeCandidateIds.filter(
      (candidateId) => candidateId !== eliminatedCandidateId,
    );
  }

  return {
    rounds,
    winnerId: null,
    tie: null,
  };
}
