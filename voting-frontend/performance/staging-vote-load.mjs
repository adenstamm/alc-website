import { randomBytes } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

const REQUIRED_CONFIRMATION = "isolated-staging-only";
const PRODUCTION_SUPABASE_HOST = "lbcjxqxzsmsmndapvluz.supabase.co";
const PRODUCTION_APP_HOSTS = new Set(["albumasu.com", "www.albumasu.com"]);
const DEFAULT_VOTER_COUNT = 100;
const MAX_VOTER_COUNT = 150;

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function parseTarget(name, value) {
  let target;

  try {
    target = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }

  if (!["https:", "http:"].includes(target.protocol)) {
    throw new Error(`${name} must use HTTP or HTTPS.`);
  }

  return target;
}

function assertIsolatedStagingTargets({ appUrl, supabaseUrl }) {
  if (process.env.ALBUMASU_STAGING_LOAD_CONFIRM !== REQUIRED_CONFIRMATION) {
    throw new Error(
      `Set ALBUMASU_STAGING_LOAD_CONFIRM=${REQUIRED_CONFIRMATION} after verifying both targets are disposable staging resources.`,
    );
  }

  if (
    supabaseUrl.hostname === PRODUCTION_SUPABASE_HOST
    || PRODUCTION_APP_HOSTS.has(appUrl.hostname)
    || appUrl.hostname.endsWith(".albumasu.com")
  ) {
    throw new Error("Refusing to run the write load test against a production target.");
  }

  if (
    supabaseUrl.protocol !== "https:"
    || !supabaseUrl.hostname.endsWith(".supabase.co")
  ) {
    throw new Error("STAGING_SUPABASE_URL must be an HTTPS Supabase project URL.");
  }
}

function percentile(values, fraction) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index];
}

function formatDuration(value) {
  return `${value.toFixed(0)} ms`;
}

function reportStage(label, results) {
  const failures = results.filter((result) => !result.ok);
  const durations = results.map((result) => result.durationMs);

  console.log(
    `${label}: ${results.length - failures.length}/${results.length} passed; `
      + `p50 ${formatDuration(percentile(durations, 0.5))}; `
      + `p95 ${formatDuration(percentile(durations, 0.95))}; `
      + `p99 ${formatDuration(percentile(durations, 0.99))}`,
  );

  if (failures.length > 0) {
    const examples = failures
      .slice(0, 3)
      .map((failure) => failure.message || "Unknown failure")
      .join(" | ");
    throw new Error(`${label} had ${failures.length} failure(s): ${examples}`);
  }
}

async function measured(operation) {
  const startedAt = performance.now();

  try {
    await operation();
    return { ok: true, durationMs: performance.now() - startedAt };
  } catch (error) {
    return {
      ok: false,
      durationMs: performance.now() - startedAt,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function mapWithConcurrency(items, concurrency, operation) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await operation(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

function throwIfSupabaseError(error, context) {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }
}

function createSupabaseClient(url, key) {
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

async function readPollThroughApp(
  appUrl,
  accessToken,
  expectedPollId,
  expectedPhase,
  expectedChoices,
) {
  const response = await fetch(new URL("/api/current-poll", appUrl), {
    headers: {
      "Cache-Control": "no-store",
      "X-AlbumASU-Session": accessToken,
      "X-Load-Test": "albumasu-staging-vote-load",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const retryAfter = response.headers.get("retry-after");
    throw new Error(
      `poll proxy returned ${response.status}${retryAfter ? ` (Retry-After ${retryAfter}s)` : ""}`,
    );
  }

  const poll = await response.json();
  const choices = expectedPhase === "final" ? poll.finalists : poll.candidates;

  if (
    poll.id !== expectedPollId
    || poll.phase !== expectedPhase
    || choices?.length !== expectedChoices
  ) {
    throw new Error(
      `expected poll ${expectedPollId} in ${expectedPhase} with ${expectedChoices} choices; `
        + `received ${poll.id || "no poll"} in ${poll.phase} with ${choices?.length ?? 0}`,
    );
  }
}

async function countRows(query, context) {
  const { count, error } = await query;
  throwIfSupabaseError(error, context);
  return count ?? 0;
}

async function verifyBallotRows(serviceClient, pollId, phase, voters, choicesPerVote) {
  const { data: votes, error: voteError } = await serviceClient
    .from("votes")
    .select("id")
    .eq("poll_id", pollId)
    .eq("phase", phase);
  throwIfSupabaseError(voteError, `read ${phase} ballots`);

  if (votes.length !== voters) {
    throw new Error(`Expected ${voters} ${phase} ballots; found ${votes.length}.`);
  }

  const choiceCount = await countRows(
    serviceClient
      .from("vote_choices")
      .select("id", { count: "exact", head: true })
      .in("vote_id", votes.map((vote) => vote.id)),
    `count ${phase} choices`,
  );
  const expectedChoiceCount = voters * choicesPerVote;

  if (choiceCount !== expectedChoiceCount) {
    throw new Error(
      `Expected ${expectedChoiceCount} ${phase} choices; found ${choiceCount}.`,
    );
  }
}

async function main() {
  const rawSupabaseUrl = requiredEnvironment("STAGING_SUPABASE_URL").replace(/\/+$/, "");
  const rawAppUrl = requiredEnvironment("STAGING_APP_URL").replace(/\/+$/, "");
  const anonKey = requiredEnvironment("STAGING_SUPABASE_ANON_KEY");
  const serviceRoleKey = requiredEnvironment("STAGING_SUPABASE_SERVICE_ROLE_KEY");
  const voterCount = Number(process.env.LOAD_TEST_VOTERS || DEFAULT_VOTER_COUNT);

  if (!Number.isInteger(voterCount) || voterCount < 1 || voterCount > MAX_VOTER_COUNT) {
    throw new Error(`LOAD_TEST_VOTERS must be an integer from 1 to ${MAX_VOTER_COUNT}.`);
  }

  const supabaseUrl = parseTarget("STAGING_SUPABASE_URL", rawSupabaseUrl);
  const appUrl = parseTarget("STAGING_APP_URL", rawAppUrl);
  assertIsolatedStagingTargets({ appUrl, supabaseUrl });

  const serviceClient = createSupabaseClient(rawSupabaseUrl, serviceRoleKey);
  const runSuffix = `${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
  const pollId = `load-test-${runSuffix}`;
  const password = `Load-${randomBytes(24).toString("base64url")}!9a`;
  const createdUserIds = [];
  let pollCreated = false;
  let testError = null;

  console.log(`Target app: ${appUrl.hostname}`);
  console.log(`Target database: ${supabaseUrl.hostname}`);
  console.log(`Disposable voters: ${voterCount}`);

  try {
    const { data: activePolls, error: activePollError } = await serviceClient
      .from("polls")
      .select("id, phase, final_closes_at")
      .eq("is_active", true)
      .limit(1);
    throwIfSupabaseError(
      activePollError,
      "staging readiness check (apply event hardening before this rehearsal)",
    );

    if (activePolls.length > 0) {
      throw new Error(
        `Staging already has active poll ${activePolls[0].id}. Refusing to alter existing election data.`,
      );
    }

    const identities = [
      { kind: "admin", email: `albumasu-load-${runSuffix}-admin@load-test.invalid` },
      ...Array.from({ length: voterCount }, (_, index) => ({
        kind: "voter",
        email: `albumasu-load-${runSuffix}-${index + 1}@load-test.invalid`,
      })),
    ];

    console.log("Provisioning disposable, pre-approved staging accounts...");
    await mapWithConcurrency(identities, 8, async (identity) => {
      const { data, error } = await serviceClient.auth.admin.createUser({
        email: identity.email,
        email_confirm: true,
        password,
        user_metadata: { display_name: `Load test ${identity.kind}` },
      });
      throwIfSupabaseError(error, `create ${identity.kind} account`);
      identity.userId = data.user.id;
      createdUserIds.push(data.user.id);
    });

    const { error: membershipError } = await serviceClient.from("memberships").upsert(
      identities.map((identity) => ({
        user_id: identity.userId,
        email: identity.email,
        display_name: `Load test ${identity.kind}`,
        status: "approved",
        role: identity.kind === "admin" ? "admin" : "member",
      })),
      { onConflict: "user_id" },
    );
    throwIfSupabaseError(membershipError, "approve staging accounts");

    await mapWithConcurrency(identities, 12, async (identity) => {
      identity.client = createSupabaseClient(rawSupabaseUrl, anonKey);
      const { data, error } = await identity.client.auth.signInWithPassword({
        email: identity.email,
        password,
      });
      throwIfSupabaseError(error, `sign in ${identity.kind} account`);
      identity.accessToken = data.session?.access_token;
      if (!identity.accessToken) {
        throw new Error(`No access token returned for ${identity.kind} account.`);
      }
    });

    const adminIdentity = identities[0];
    const voters = identities.slice(1);
    const candidates = Array.from({ length: 5 }, (_, index) => ({
      id: `${pollId}-candidate-${index + 1}`,
      poll_id: pollId,
      album_title: `Load Test Album ${index + 1}`,
      artist_name: `Load Test Artist ${index + 1}`,
      normalized_album_title: `load test album ${index + 1}`,
      normalized_artist_name: `load test artist ${index + 1}`,
      nomination_count: voterCount - index,
    }));

    const { error: pollError } = await serviceClient.from("polls").insert({
      id: pollId,
      phase: "nominations",
      status: "Load test nominations",
      question: "Disposable staging load test",
      description: "Automatically removed after the rehearsal.",
      cycle_label: "Load test",
      album_of_week: {
        title: "Load Test Current Album",
        artist: "Load Test Artist",
        note: "Disposable staging data",
      },
      is_active: true,
    });
    throwIfSupabaseError(pollError, "create disposable poll");
    pollCreated = true;

    const { error: candidateError } = await serviceClient
      .from("poll_candidates")
      .insert(candidates);
    throwIfSupabaseError(candidateError, "seed disposable candidates");

    const { error: primaryAdvanceError } = await adminIdentity.client.rpc(
      "advance_to_primary",
      { target_poll_id: pollId },
    );
    throwIfSupabaseError(primaryAdvanceError, "advance disposable poll to primary");

    const membershipResults = await Promise.all(
      voters.map((voter) => measured(async () => {
        const { data, error } = await voter.client
          .from("memberships")
          .select("status, role")
          .eq("user_id", voter.userId)
          .single();
        throwIfSupabaseError(error, "membership lookup");
        if (data.status !== "approved") throw new Error(`membership is ${data.status}`);
      })),
    );
    reportStage("100-way membership lookup", membershipResults);

    const primaryReadResults = await Promise.all(
      voters.map((voter) => measured(() => readPollThroughApp(
        appUrl,
        voter.accessToken,
        pollId,
        "primary",
        candidates.length,
      ))),
    );
    reportStage("100-way Azure/API primary read", primaryReadResults);

    const candidateIds = candidates.map((candidate) => candidate.id);
    const primaryWriteResults = await Promise.all(
      voters.map((voter) => measured(async () => {
        const { error } = await voter.client.rpc("submit_primary_ballot", {
          target_poll_id: pollId,
          candidate_ids: candidateIds,
        });
        throwIfSupabaseError(error, "primary ballot");
      })),
    );
    reportStage("100-way primary ballot write", primaryWriteResults);
    await verifyBallotRows(serviceClient, pollId, "primary", voterCount, candidates.length);

    const { error: finalAdvanceError } = await adminIdentity.client.rpc(
      "advance_to_final",
      { target_poll_id: pollId, candidate_ids: candidateIds },
    );
    throwIfSupabaseError(finalAdvanceError, "advance disposable poll to final");

    const { data: finalPoll, error: finalPollError } = await serviceClient
      .from("polls")
      .select("final_opened_at, final_closes_at")
      .eq("id", pollId)
      .single();
    throwIfSupabaseError(finalPollError, "read final deadline");
    const finalWindowMs = new Date(finalPoll.final_closes_at).getTime()
      - new Date(finalPoll.final_opened_at).getTime();
    if (Math.abs(finalWindowMs - 18 * 60 * 60 * 1_000) > 1_000) {
      throw new Error(`Expected an 18-hour final window; found ${finalWindowMs} ms.`);
    }

    const finalReadResults = await Promise.all(
      voters.map((voter) => measured(() => readPollThroughApp(
        appUrl,
        voter.accessToken,
        pollId,
        "final",
        candidates.length,
      ))),
    );
    reportStage("100-way Azure/API final read", finalReadResults);

    const finalWriteResults = await Promise.all(
      voters.map((voter, voterIndex) => measured(async () => {
        const rotation = voterIndex % candidateIds.length;
        const ranking = [
          ...candidateIds.slice(rotation),
          ...candidateIds.slice(0, rotation),
        ];
        const { error } = await voter.client.rpc("submit_final_ballot", {
          target_poll_id: pollId,
          ranked_candidate_ids: ranking,
        });
        throwIfSupabaseError(error, "final ballot");
      })),
    );
    reportStage("100-way final ballot write", finalWriteResults);
    await verifyBallotRows(serviceClient, pollId, "final", voterCount, candidates.length);

    const { data: results, error: resultsError } = await adminIdentity.client.rpc(
      "get_admin_poll_results",
      { target_poll_id: pollId },
    );
    throwIfSupabaseError(resultsError, "read admin results");

    if (
      results?.ballotCounts?.primary !== voterCount
      || results?.ballotCounts?.final !== voterCount
    ) {
      throw new Error("Admin ballot counts did not match the committed staging ballots.");
    }

    const { error: closeError } = await adminIdentity.client.rpc(
      "close_final_voting",
      { target_poll_id: pollId },
    );
    throwIfSupabaseError(closeError, "close disposable final vote");

    const { error: lateVoteError } = await adminIdentity.client.rpc(
      "submit_final_ballot",
      { target_poll_id: pollId, ranked_candidate_ids: candidateIds },
    );
    if (!lateVoteError) {
      throw new Error("A ballot was accepted after final voting closed.");
    }

    console.log("Integrity: exact ballot/choice counts, 18-hour deadline, and closed-vote rejection passed.");
    console.log("STAGING REHEARSAL PASSED");
  } catch (error) {
    testError = error;
    throw error;
  } finally {
    const cleanupErrors = [];

    if (pollCreated) {
      const { error } = await serviceClient.from("polls").delete().eq("id", pollId);
      if (error) cleanupErrors.push(`poll ${pollId}: ${error.message}`);
    }

    await mapWithConcurrency(createdUserIds, 8, async (userId) => {
      const { error } = await serviceClient.auth.admin.deleteUser(userId);
      if (error) cleanupErrors.push(`user ${userId}: ${error.message}`);
    });

    if (cleanupErrors.length > 0) {
      console.error(`Cleanup needs attention: ${cleanupErrors.join(" | ")}`);
      if (!testError) process.exitCode = 1;
    } else if (pollCreated || createdUserIds.length > 0) {
      console.log("Cleanup: disposable poll and accounts removed.");
    }
  }
}

main().catch((error) => {
  console.error(`STAGING REHEARSAL FAILED: ${error.message}`);
  process.exitCode = 1;
});
