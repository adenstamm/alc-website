// Recovery belongs to the auth client lifetime, not a lazy page's lifetime.
export function createRecoverySessionStore() {
  let recoveryUserId = null;
  const listeners = new Set();
  function setUserId(next) {
    if (next === recoveryUserId) return;
    recoveryUserId = next;
    listeners.forEach((listener) => listener());
  }
  return {
    getSnapshot: () => Boolean(recoveryUserId),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    observe(event, session) {
      if (event === "PASSWORD_RECOVERY") setUserId(session?.user?.id || null);
      else if (!session || session.user?.id !== recoveryUserId) setUserId(null);
    },
    clear: () => setUserId(null),
  };
}
export const recoverySessionStore = createRecoverySessionStore();
