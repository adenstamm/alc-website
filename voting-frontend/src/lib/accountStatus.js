export function getAccountStatus(session, membership, membershipLookupStatus = "ready") {
  if (!session) {
    return "signed-out";
  }

  if (!session.user.email_confirmed_at) {
    return "unverified";
  }

  const hasCurrentMembership = membership?.user_id === session.user.id;

  if (hasCurrentMembership && membership.status === "approved") {
    return "approved";
  }

  if (membershipLookupStatus === "unavailable") {
    return "unavailable";
  }

  if (hasCurrentMembership && membership.status === "pending") {
    return "pending";
  }

  if (hasCurrentMembership) {
    return "blocked";
  }

  return "pending";
}

export const accountStatusContent = {
  "signed-out": {
    label: "Signed out",
    title: "Sign in to your club account",
  },
  unverified: {
    label: "Verify email",
    title: "Check your inbox to finish joining",
  },
  pending: {
    label: "Approval pending",
    title: "Your membership is in the queue",
  },
  unavailable: {
    label: "Status unavailable",
    title: "Membership could not be checked",
  },
  blocked: {
    label: "Access unavailable",
    title: "Your membership needs attention",
  },
  approved: {
    label: "Approved member",
    title: "Your club account is ready",
  },
};

export function getAccountName(session, membership) {
  return membership?.display_name?.trim() || session?.user?.user_metadata?.display_name?.trim() || "Account";
}
