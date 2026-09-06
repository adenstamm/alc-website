import {
  MEMBERS_PER_PAGE,
  formatCount,
  getMemberName,
} from "../lib/adminPresentation";
import { useEffect, useMemo, useState } from "react";

export default function useAdminMembers({
  canManage,
  openConfirmation,
  setError,
  setMessage,
  showConfirmation,
  showFailure,
  supabase,
}) {
  const [memberships, setMemberships] = useState([]);

  const [memberTab, setMemberTab] = useState("pending");

  const [accountFilter, setAccountFilter] = useState("active");

  const [memberSearch, setMemberSearch] = useState("");

  const [memberPage, setMemberPage] = useState(1);

  const [selectedMemberIds, setSelectedMemberIds] = useState([]);

  const [busyMemberIds, setBusyMemberIds] = useState([]);

  const [isLoadingMembers, setIsLoadingMembers] = useState(false);

  const [memberMessage, setMemberMessage] = useState(null);

  const adminCount = memberships.filter(
    (member) => member.status === "approved" && member.role === "admin",
  ).length;

  const approvedMemberCount = memberships.filter(
    (member) => member.status === "approved",
  ).length;

  const pendingMembers = memberships.filter(
    (member) => member.status === "pending",
  );

  const accountFilters = [
    { id: "active", label: "Active members" },
    { id: "admins", label: "Admins" },
    { id: "pending", label: "Pending" },
    { id: "rejected", label: "Rejected" },
    { id: "all", label: "All" },
  ];

  const visibleMembers = useMemo(() => {
    const sourceMembers =
      memberTab === "pending"
        ? pendingMembers
        : memberships.filter((member) => {
            if (accountFilter === "active") {
              return member.status === "approved";
            }

            if (accountFilter === "admins") {
              return member.status === "approved" && member.role === "admin";
            }

            if (accountFilter === "pending") {
              return member.status === "pending";
            }

            if (accountFilter === "rejected") {
              return member.status === "rejected";
            }

            return true;
          });
    const normalizedSearch = memberSearch.trim().toLowerCase();

    if (!normalizedSearch) {
      return sourceMembers;
    }

    return sourceMembers.filter((member) =>
      getMemberName(member).toLowerCase().includes(normalizedSearch),
    );
  }, [accountFilter, memberSearch, memberTab, memberships, pendingMembers]);

  const totalMemberPages = Math.max(
    1,
    Math.ceil(visibleMembers.length / MEMBERS_PER_PAGE),
  );

  const currentMemberPage = Math.min(memberPage, totalMemberPages);

  const pagedMembers = visibleMembers.slice(
    (currentMemberPage - 1) * MEMBERS_PER_PAGE,
    currentMemberPage * MEMBERS_PER_PAGE,
  );

  useEffect(() => {
    if (!canManage) {
      return;
    }

    let isMounted = true;

    async function loadMemberships() {
      setIsLoadingMembers(true);
      setError(null);

      const { data, error: loadError } = await supabase
        .from("memberships")
        .select(
          "user_id, email, display_name, status, role, created_at, updated_at",
        )
        .order("created_at", { ascending: false });

      if (!isMounted) {
        return;
      }

      if (loadError) {
        setError(loadError.message);
      } else {
        setMemberships(data);
      }

      setIsLoadingMembers(false);
    }

    loadMemberships();

    return () => {
      isMounted = false;
    };
  }, [canManage, setError, supabase]);

  useEffect(() => {
    setMemberPage(1);
  }, [accountFilter, memberSearch, memberTab]);

  function handleMemberTabChange(nextTab) {
    setMemberTab(nextTab);

    if (nextTab === "all" && memberTab !== "all") {
      setAccountFilter("active");
    }
  }

  function getMembershipActionLabel(updates) {
    if (updates.status === "approved") {
      return "Account approved.";
    }

    if (updates.status === "rejected") {
      return "Account rejected.";
    }

    if (updates.status === "pending") {
      return "Account moved back to pending.";
    }

    if (updates.role === "admin") {
      return "Admin role added.";
    }

    if (updates.role === "member") {
      return "Admin role removed.";
    }

    return "Membership updated.";
  }

  async function updateMembership(userId, updates, { quiet = false } = {}) {
    setError(null);
    setMessage(null);
    setMemberMessage(null);
    setBusyMemberIds((currentIds) => [...new Set([...currentIds, userId])]);

    if (updates.role === "member") {
      const targetMember = memberships.find(
        (member) => member.user_id === userId,
      );

      if (targetMember?.role === "admin" && adminCount <= 1) {
        setError("You cannot remove the last admin.");
        showFailure("You cannot remove the last admin.");
        setBusyMemberIds((currentIds) =>
          currentIds.filter((id) => id !== userId),
        );
        return false;
      }
    }

    const { data, error: updateError } = await supabase
      .from("memberships")
      .update(updates)
      .eq("user_id", userId)
      .select(
        "user_id, email, display_name, status, role, created_at, updated_at",
      )
      .single();

    if (updateError) {
      setError(updateError.message);
      showFailure(updateError.message);
      setBusyMemberIds((currentIds) =>
        currentIds.filter((id) => id !== userId),
      );
      return false;
    }

    setMemberships((currentMemberships) =>
      currentMemberships.map((currentMembership) =>
        currentMembership.user_id === userId ? data : currentMembership,
      ),
    );
    const actionMessage = getMembershipActionLabel(updates);
    if (!quiet) {
      setMemberMessage(actionMessage);
      showConfirmation(actionMessage, `member-${userId}`);
    }
    setBusyMemberIds((currentIds) => currentIds.filter((id) => id !== userId));
    setSelectedMemberIds((currentIds) =>
      currentIds.filter((id) => id !== userId),
    );
    return true;
  }

  function toggleMemberSelection(userId) {
    setSelectedMemberIds((currentIds) =>
      currentIds.includes(userId)
        ? currentIds.filter((id) => id !== userId)
        : [...currentIds, userId],
    );
  }

  function toggleAllVisibleMembers() {
    const visibleIds = pagedMembers.map((member) => member.user_id);
    const allSelected = visibleIds.every((id) =>
      selectedMemberIds.includes(id),
    );

    setSelectedMemberIds((currentIds) => {
      if (allSelected) {
        return currentIds.filter((id) => !visibleIds.includes(id));
      }

      return [...new Set([...currentIds, ...visibleIds])];
    });
  }

  async function runBulkMemberStatus(status) {
    const targetIds = selectedMemberIds.filter((id) =>
      memberships.some(
        (member) => member.user_id === id && member.status !== status,
      ),
    );

    if (!targetIds.length) {
      return;
    }

    setBusyMemberIds((currentIds) => [
      ...new Set([...currentIds, ...targetIds]),
    ]);
    const { data, error: updateError } = await supabase
      .from("memberships")
      .update({ status })
      .in("user_id", targetIds)
      .select(
        "user_id, email, display_name, status, role, created_at, updated_at",
      );

    setBusyMemberIds((currentIds) =>
      currentIds.filter((id) => !targetIds.includes(id)),
    );

    if (updateError) {
      setError(updateError.message);
      showFailure(updateError.message);
      return;
    }

    const updatesById = new Map(data.map((member) => [member.user_id, member]));
    setMemberships((currentMemberships) =>
      currentMemberships.map(
        (member) => updatesById.get(member.user_id) || member,
      ),
    );
    setSelectedMemberIds([]);
    const successMessage = `${formatCount(targetIds.length, "account")} ${status === "approved" ? "approved" : "rejected"}.`;
    setMemberMessage(successMessage);
    showConfirmation(successMessage, `bulk-${status}`);
  }

  function requestBulkReject() {
    openConfirmation({
      confirmLabel: `Reject ${selectedMemberIds.length}`,
      description:
        "These accounts will lose club access. You can restore them to pending later.",
      onConfirm: () => runBulkMemberStatus("rejected"),
      title: `Reject ${formatCount(selectedMemberIds.length, "selected account")}?`,
    });
  }
  return {
    memberTab,
    accountFilter,
    setAccountFilter,
    memberSearch,
    setMemberSearch,
    setMemberPage,
    selectedMemberIds,
    setSelectedMemberIds,
    busyMemberIds,
    isLoadingMembers,
    memberMessage,
    adminCount,
    approvedMemberCount,
    pendingMembers,
    accountFilters,
    visibleMembers,
    totalMemberPages,
    currentMemberPage,
    pagedMembers,
    handleMemberTabChange,
    updateMembership,
    toggleMemberSelection,
    toggleAllVisibleMembers,
    runBulkMemberStatus,
    requestBulkReject,
  };
}
