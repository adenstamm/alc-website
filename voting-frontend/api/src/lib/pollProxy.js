import { createHash } from "node:crypto";

const RATE_LIMIT_WINDOW_MS = 60_000;
const AUTHENTICATED_REQUESTS_PER_WINDOW = 30;
const ANONYMOUS_REQUESTS_PER_WINDOW = 300;
const NETWORK_REQUESTS_PER_WINDOW = 1_000;
const MAX_TRACKED_CLIENTS = 10_000;
const requestBuckets = new Map();

const PUBLIC_POLL_FIELDS = [
  "album_of_week",
  "cycle_label",
  "description",
  "id",
  "phase",
  "question",
  "status",
];

function cleanClientAddress(value = "") {
  return value.split(",")[0].trim().slice(0, 80) || "unknown";
}

export function getClientAddress(request) {
  return cleanClientAddress(
    request.headers.get("cf-connecting-ip")
      || request.headers.get("x-azure-clientip")
      || request.headers.get("x-forwarded-for")
      || "unknown",
  );
}

export function checkRateLimit(
  identifier,
  {
    maxRequests = ANONYMOUS_REQUESTS_PER_WINDOW,
    now = Date.now(),
    windowMs = RATE_LIMIT_WINDOW_MS,
  } = {},
) {
  const currentBucket = requestBuckets.get(identifier);

  if (!currentBucket || now - currentBucket.startedAt >= windowMs) {
    if (!currentBucket && requestBuckets.size >= MAX_TRACKED_CLIENTS) {
      for (const [address, bucket] of requestBuckets) {
        if (now - bucket.startedAt >= windowMs) {
          requestBuckets.delete(address);
        }
      }

      while (requestBuckets.size >= MAX_TRACKED_CLIENTS) {
        const oldestAddress = requestBuckets.keys().next().value;
        requestBuckets.delete(oldestAddress);
      }
    }

    requestBuckets.set(identifier, { count: 1, startedAt: now });
    return {
      allowed: true,
      limit: maxRequests,
      remaining: maxRequests - 1,
      retryAfter: 0,
    };
  }

  currentBucket.count += 1;

  const retryAfter = Math.max(
    1,
    Math.ceil((windowMs - (now - currentBucket.startedAt)) / 1000),
  );

  return {
    allowed: currentBucket.count <= maxRequests,
    limit: maxRequests,
    remaining: Math.max(0, maxRequests - currentBucket.count),
    retryAfter,
  };
}

function fingerprintSessionToken(sessionToken) {
  return createHash("sha256").update(sessionToken).digest("base64url");
}

export function checkPollRateLimit(
  { clientAddress, sessionToken },
  now = Date.now(),
) {
  const networkLimit = checkRateLimit(`network:${clientAddress}`, {
    maxRequests: NETWORK_REQUESTS_PER_WINDOW,
    now,
  });

  if (!networkLimit.allowed) {
    return { ...networkLimit, scope: "network" };
  }

  const isAuthenticatedRequest = hasUserAccessToken(
    sessionToken ? `Bearer ${sessionToken}` : null,
  );
  const requestLimit = isAuthenticatedRequest
    ? checkRateLimit(`session:${fingerprintSessionToken(sessionToken)}`, {
        maxRequests: AUTHENTICATED_REQUESTS_PER_WINDOW,
        now,
      })
    : checkRateLimit(`anonymous:${clientAddress}`, {
        maxRequests: ANONYMOUS_REQUESTS_PER_WINDOW,
        now,
      });

  return {
    ...requestLimit,
    remaining: Math.min(networkLimit.remaining, requestLimit.remaining),
    scope: isAuthenticatedRequest ? "session" : "anonymous-network",
  };
}

export function sanitizePublicPoll(poll) {
  if (!poll || typeof poll !== "object" || Array.isArray(poll)) {
    return null;
  }

  const publicPoll = {};

  for (const field of PUBLIC_POLL_FIELDS) {
    if (Object.hasOwn(poll, field)) {
      publicPoll[field] = poll[field];
    }
  }

  publicPoll.candidates = [];
  publicPoll.finalists = [];
  return publicPoll;
}

function getSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    throw new Error("Supabase API settings are incomplete.");
  }

  const parsedUrl = new URL(supabaseUrl);

  if (parsedUrl.protocol !== "https:" || !parsedUrl.hostname.endsWith(".supabase.co")) {
    throw new Error("SUPABASE_URL must be an HTTPS Supabase project URL.");
  }

  return { supabaseAnonKey, supabaseServiceRoleKey, supabaseUrl };
}

export function hasUserAccessToken(authorizationHeader) {
  return /^Bearer\s+[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/i
    .test(authorizationHeader || "");
}

export async function loadCurrentPoll(authorizationHeader, fetchImpl = fetch) {
  const { supabaseAnonKey, supabaseServiceRoleKey, supabaseUrl } = getSupabaseConfig();
  const hasUserToken = hasUserAccessToken(authorizationHeader);
  const apiKey = hasUserToken ? supabaseAnonKey : supabaseServiceRoleKey;
  const authorization = hasUserToken
    ? authorizationHeader
    : `Bearer ${supabaseServiceRoleKey}`;
  const response = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/get_current_poll`, {
    method: "POST",
    headers: {
      apikey: apiKey,
      Authorization: authorization,
      "Content-Type": "application/json",
      "X-Client-Info": "albumasu-api/1.0",
    },
    body: "{}",
    signal: AbortSignal.timeout(6_000),
  });

  if (!response.ok) {
    const error = new Error(`Supabase poll request failed with ${response.status}.`);
    error.status = hasUserToken && [401, 403].includes(response.status) ? 401 : 502;
    throw error;
  }

  const poll = await response.json();
  return hasUserToken ? poll : sanitizePublicPoll(poll);
}

export function resetRateLimitsForTests() {
  requestBuckets.clear();
}
