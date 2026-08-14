export function getAdminActionErrorMessage(error) {
  const message = error?.message || "The poll could not be updated. Try again.";
  const [, readableMessage] = message.match(/^[A-Z_]+:\s*(.+)$/) || [];

  return readableMessage || message;
}

export async function executeAdminPhaseAction({
  action,
  expectedPhase,
  params = {},
  pollId,
  refreshPoll,
  rpc,
}) {
  let actionError;

  try {
    const result = await rpc(action, {
      target_poll_id: pollId,
      ...params,
    });
    actionError = result?.error || null;
  } catch (error) {
    actionError = error;
  }

  if (!actionError) {
    return {
      error: null,
      isSuccess: true,
      recovered: false,
    };
  }

  if (expectedPhase) {
    try {
      const refreshedPoll = await refreshPoll();

      if (refreshedPoll?.phase === expectedPhase) {
        return {
          error: null,
          isSuccess: true,
          recovered: true,
        };
      }
    } catch {
      // Preserve the original action error when verification cannot be loaded.
    }
  }

  return {
    error: actionError,
    isSuccess: false,
    recovered: false,
  };
}
