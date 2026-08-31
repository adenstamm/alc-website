export function getBallotStorageKey(userId, pollId, phase) {
  return `alc-ballot-${userId}-${pollId}-${phase}`;
}

function getDefaultStorage() {
  try {
    return globalThis.window?.localStorage || null;
  } catch {
    return null;
  }
}

export function readStoredBallot(userId, pollId, phase, storage = getDefaultStorage()) {
  if (!userId || !storage) {
    return null;
  }

  try {
    const storedBallot = storage.getItem(getBallotStorageKey(userId, pollId, phase));
    return storedBallot ? JSON.parse(storedBallot) : null;
  } catch {
    return null;
  }
}

export function writeStoredBallot(
  userId,
  pollId,
  phase,
  ballot,
  storage = getDefaultStorage(),
) {
  if (!userId || !ballot || !storage) {
    return false;
  }

  try {
    storage.setItem(getBallotStorageKey(userId, pollId, phase), JSON.stringify(ballot));
    return true;
  } catch {
    return false;
  }
}

export function clearStoredBallot(userId, pollId, phase, storage = getDefaultStorage()) {
  if (!userId || !storage) {
    return false;
  }

  try {
    storage.removeItem(getBallotStorageKey(userId, pollId, phase));
    return true;
  } catch {
    return false;
  }
}
