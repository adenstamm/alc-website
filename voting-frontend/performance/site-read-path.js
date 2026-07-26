/* global __ENV, __ITER, __VU */

import http from "k6/http";
import { check, sleep } from "k6";

const baseUrl = (__ENV.BASE_URL || "").replace(/\/+$/, "");
const supabaseUrl = (__ENV.SUPABASE_URL || __ENV.VITE_SUPABASE_URL || "").replace(
  /\/+$/,
  "",
);
const supabaseAnonKey =
  __ENV.SUPABASE_ANON_KEY || __ENV.VITE_SUPABASE_ANON_KEY || "";
const profile = __ENV.TEST_PROFILE || "smoke";

if (!baseUrl) {
  throw new Error("BASE_URL is required.");
}

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_ANON_KEY are required to exercise the full read path.",
  );
}

const profiles = {
  smoke: {
    executor: "constant-vus",
    vus: 1,
    duration: "1m",
    gracefulStop: "10s",
  },
  load: {
    executor: "ramping-vus",
    startVUs: 0,
    stages: [
      { duration: "30s", target: 25 },
      { duration: "30s", target: 50 },
      { duration: "30s", target: 100 },
      { duration: "2m", target: 100 },
      { duration: "30s", target: 0 },
    ],
    gracefulRampDown: "15s",
    gracefulStop: "15s",
  },
};

if (!profiles[profile]) {
  throw new Error(
    `Unknown TEST_PROFILE "${profile}". Choose "smoke" or "load".`,
  );
}

const publicRoutes = [
  "/",
  "/about",
  "/archive",
  "/current",
  "/events",
  "/vote",
];

export const options = {
  scenarios: {
    member_read_path: profiles[profile],
  },
  thresholds: {
    checks: ["rate>0.99"],
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1000", "p(99)<2000"],
  },
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
  userAgent: "albumasu-k6-capacity-test/1.0",
};

const supabaseHeaders = {
  apikey: supabaseAnonKey,
  Authorization: `Bearer ${supabaseAnonKey}`,
  "Content-Type": "application/json",
  "X-Client-Info": "albumasu-k6-capacity-test/1.0",
};

export default function () {
  const route = publicRoutes[(__VU + __ITER) % publicRoutes.length];
  const pageResponse = http.get(`${baseUrl}${route}`, {
    tags: { component: "azure-static-web-app", route },
    headers: { "X-Load-Test": "albumasu-capacity-test" },
  });

  check(pageResponse, {
    "page returns HTTP 200": (response) => response.status === 200,
    "page returns HTML": (response) =>
      response.headers["Content-Type"]?.includes("text/html"),
    "page contains the React root": (response) =>
      response.body?.includes('id="root"'),
  });

  const pollResponse = http.post(
    `${supabaseUrl}/rest/v1/rpc/get_current_poll`,
    "{}",
    {
      tags: { component: "supabase-postgres", operation: "get_current_poll" },
      headers: supabaseHeaders,
    },
  );

  check(pollResponse, {
    "poll RPC returns HTTP 200": (response) => response.status === 200,
    "poll RPC returns JSON": (response) =>
      response.headers["Content-Type"]?.includes("application/json"),
  });

  // Active users read or navigate periodically; they do not continuously
  // refresh. This think time models 100 simultaneous sessions without turning
  // the capacity test into an unrealistic denial-of-service pattern.
  sleep(8 + Math.random() * 7);
}

function formatNumber(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "n/a";
}

function metricValue(data, metricName, valueName) {
  return data.metrics?.[metricName]?.values?.[valueName];
}

export function handleSummary(data) {
  const requestCount = metricValue(data, "http_reqs", "count");
  const requestsPerSecond = metricValue(data, "http_reqs", "rate");
  const p95 = metricValue(data, "http_req_duration", "p(95)");
  const p99 = metricValue(data, "http_req_duration", "p(99)");
  const failureRate = metricValue(data, "http_req_failed", "rate");
  const checkRate = metricValue(data, "checks", "rate");
  const maxVirtualUsers = metricValue(data, "vus_max", "max");
  const passed =
    failureRate < 0.01 &&
    checkRate > 0.99 &&
    p95 < 1000 &&
    p99 < 2000;

  const report = [
    "# AlbumASU performance test",
    "",
    `- Result: **${passed ? "PASS" : "FAIL"}**`,
    `- Profile: \`${profile}\``,
    `- Web target: \`${baseUrl}\``,
    `- Maximum virtual users: ${formatNumber(maxVirtualUsers, 0)}`,
    `- HTTP requests: ${formatNumber(requestCount, 0)}`,
    `- Throughput: ${formatNumber(requestsPerSecond)} requests/second`,
    `- p95 response time: ${formatNumber(p95)} ms`,
    `- p99 response time: ${formatNumber(p99)} ms`,
    `- HTTP failure rate: ${formatNumber(failureRate * 100)}%`,
    `- Successful checks: ${formatNumber(checkRate * 100)}%`,
    "",
    "The test exercises read-only Azure Static Web Apps routes and the",
    "Supabase/PostgreSQL `get_current_poll` RPC. It never submits ballots or",
    "modifies production election data.",
    "",
  ].join("\n");

  return {
    stdout: report,
    "performance-results/report.md": report,
    "performance-results/summary.json": JSON.stringify(data, null, 2),
  };
}
