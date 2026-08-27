import { app } from "@azure/functions";

import {
  checkPollRateLimit,
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
    // Azure Static Web Apps may populate Authorization with its own platform
    // token. Only trust the application-specific session value set by our
    // same-origin client and rebuild the Supabase bearer header server-side.
    const sessionToken = request.headers.get("x-albumasu-session");
    const authorizationHeader = sessionToken ? `Bearer ${sessionToken}` : null;
    const rateLimit = checkPollRateLimit({
      clientAddress: getClientAddress(request),
      sessionToken,
    });

    if (!rateLimit.allowed) {
      return {
        status: 429,
        jsonBody: { error: "Too many requests. Please wait before refreshing again." },
        headers: {
          ...SECURITY_HEADERS,
          "Cache-Control": "no-store",
          "Retry-After": String(rateLimit.retryAfter),
          "Vary": "X-AlbumASU-Session",
          "X-RateLimit-Limit": String(rateLimit.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Scope": rateLimit.scope,
        },
      };
    }

    try {
      const poll = await loadCurrentPoll(authorizationHeader);
      const isAuthenticated = hasUserAccessToken(authorizationHeader);

      return {
        status: 200,
        jsonBody: poll,
        headers: {
          ...SECURITY_HEADERS,
          "Cache-Control": "no-store",
          "Vary": "X-AlbumASU-Session",
          "X-AlbumASU-Poll-Scope": isAuthenticated ? "member" : "public",
          "X-RateLimit-Limit": String(rateLimit.limit),
          "X-RateLimit-Remaining": String(rateLimit.remaining),
          "X-RateLimit-Scope": rateLimit.scope,
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
          "Vary": "X-AlbumASU-Session",
        },
      };
    }
  },
});
