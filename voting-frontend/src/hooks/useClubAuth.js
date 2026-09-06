import { createLatestRequestCoordinator } from "../lib/latestRequestCoordinator";
import { fetchMembershipWithRetry } from "../lib/membershipApi";
import { hasSupabaseConfig, supabase } from "../lib/supabaseClient";
import { isAbortedRequest } from "../lib/clubPollState.js";
import { useCallback, useEffect, useRef, useState } from "react";

export default function useClubAuth() {
  const activeSessionUserId = useRef(null);

  const membershipRequestCoordinator = useRef(null);

  if (membershipRequestCoordinator.current == null) {
    membershipRequestCoordinator.current = createLatestRequestCoordinator();
  }

  const [authReady, setAuthReady] = useState(!hasSupabaseConfig);

  const [session, setSession] = useState(null);

  const [membership, setMembership] = useState(null);

  const [membershipLookupStatus, setMembershipLookupStatus] = useState("ready");

  const loadMembership = useCallback(
    async (nextSession, { force = false } = {}) => {
      if (!hasSupabaseConfig || !nextSession?.user) {
        membershipRequestCoordinator.current.cancel();
        setMembership(null);
        setMembershipLookupStatus("ready");
        return null;
      }

      const userId = nextSession.user.id;

      return membershipRequestCoordinator.current.run(
        userId,
        async ({ isLatest, signal }) => {
          if (isLatest()) {
            setMembershipLookupStatus("loading");
          }

          try {
            const data = await fetchMembershipWithRetry(
              ({ signal: lookupSignal }) => {
                let query = supabase
                  .from("memberships")
                  .select(
                    "user_id, email, display_name, status, role, created_at, updated_at",
                  )
                  .eq("user_id", userId);

                if (typeof query.abortSignal === "function") {
                  query = query.abortSignal(lookupSignal);
                }

                return query.maybeSingle();
              },
              { signal },
            );

            if (!isLatest()) {
              return null;
            }

            setMembership(data);
            setMembershipLookupStatus("ready");
            return data;
          } catch (error) {
            if (isAbortedRequest(error) || !isLatest()) {
              return null;
            }

            setMembership((currentMembership) =>
              currentMembership?.user_id === userId ? currentMembership : null,
            );
            setMembershipLookupStatus("unavailable");
            return null;
          }
        },
        { force },
      );
    },
    [],
  );

  useEffect(
    () => () => {
      membershipRequestCoordinator.current?.cancel();
    },
    [],
  );

  useEffect(() => {
    if (!hasSupabaseConfig) {
      return undefined;
    }

    let isMounted = true;

    async function loadSession() {
      const { data } = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      const nextSession = data.session;
      const nextUserId = nextSession?.user?.id || null;
      activeSessionUserId.current = nextUserId;
      setSession(nextSession);
      await loadMembership(nextSession);

      if (isMounted && activeSessionUserId.current === nextUserId) {
        setAuthReady(true);
      }
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const nextUserId = nextSession?.user?.id || null;
      const userChanged = activeSessionUserId.current !== nextUserId;
      activeSessionUserId.current = nextUserId;

      if (userChanged) {
        setAuthReady(false);
      }

      setSession(nextSession);
      loadMembership(nextSession, { force: userChanged }).finally(() => {
        if (isMounted && activeSessionUserId.current === nextUserId) {
          setAuthReady(true);
        }
      });
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadMembership]);

  const refreshCurrentMembership = useCallback(
    () => loadMembership(session, { force: true }),
    [loadMembership, session],
  );
  return {
    authReady,
    session,
    membership,
    membershipLookupStatus,
    refreshCurrentMembership,
  };
}
