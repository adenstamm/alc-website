import { app } from "@azure/functions";

import {
  checkRateLimit,
  getClientAddress,
  hasUserAccessToken,
  loadCurrentPoll,
} from "../lib/pollProxy.js";

const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
};

app.http("current-poll", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "current-poll",
  handler: async (request, context) => {
    const rateLimit = checkRateLimit(getClientAddress(request));

    if (!rateLimit.allowed) {
      return {
        status: 429,
        jsonBody: { error: "Too many requests. Please wait before refreshing again." },
        headers: {
          ...SECURITY_HEADERS,
          "Cache-Control": "no-store",
          "Retry-After": String(rateLimit.retryAfter),
          "X-RateLimit-Remaining": "0",
        },
      };
    }

    const authorizationHeader = request.headers.get("authorization");

    try {
      const poll = await loadCurrentPoll(authorizationHeader);
      const isAuthenticated = hasUserAccessToken(authorizationHeader);

      return {
        status: 200,
        jsonBody: poll,
        headers: {
          ...SECURITY_HEADERS,
          "Cache-Control": isAuthenticated
            ? "private, no-store"
            : "public, max-age=15, s-maxage=30, stale-while-revalidate=120",
          "X-RateLimit-Remaining": String(rateLimit.remaining),
        },
      };
    } catch (error) {
      context.error("Current poll proxy failed", {
        message: error.message,
        status: error.status || 500,
      });

      return {
        status: error.status || 500,
        jsonBody: {
          error: error.status === 401
            ? "Your session is no longer valid. Sign in again."
            : "The current poll is temporarily unavailable.",
        },
        headers: {
          ...SECURITY_HEADERS,
          "Cache-Control": "no-store",
        },
      };
    }
  },
});
