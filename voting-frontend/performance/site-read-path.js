/* global __ENV, __ITER */
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import { createReport, latencyTargets } from "./report.js";

const baseUrl = (__ENV.BASE_URL || "").replace(/\/+$/, "");
const profile = __ENV.TEST_PROFILE || "smoke";
if (!baseUrl) throw new Error("BASE_URL is required.");
if (profile !== "smoke")
  throw new Error("Production monitoring only supports smoke.");
const routes = ["/", "/about", "/archive", "/current", "/events", "/vote"];
const pageDuration = new Trend("static_page_duration", true);
const pollDuration = new Trend("poll_api_duration", true);
const pageRequests = new Counter("static_page_requests");
const pollRequests = new Counter("poll_api_requests");
const pageOk = new Rate("static_page_ok");
const pollOk = new Rate("poll_api_ok");
const firstPoll = new Trend("poll_first_duration", true);
const repeatPoll = new Trend("poll_repeat_duration", true);
const handlerDuration = new Trend("poll_handler_duration", true);
const firstWorkerRequests = new Counter("worker_first_requests");

export const options = {
  scenarios: {
    read_path: {
      executor: "constant-vus",
      vus: 1,
      duration: "1m",
      gracefulStop: "15s",
    },
  },
  thresholds: {
    checks: ["rate>0.99"],
    http_req_failed: ["rate<0.01"],
    static_page_ok: ["rate>0.99"],
    poll_api_ok: ["rate>0.99"],
    static_page_duration: latencyTargets,
    poll_api_duration: latencyTargets,
    static_page_requests: ["count>=5"],
    poll_api_requests: ["count>=5"],
  },
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
  userAgent: "albumasu-availability-monitor/2.0",
};

export default function () {
  const route = routes[__ITER % routes.length];
  const page = http.get(`${baseUrl}${route}`, {
    timeout: "10s",
    tags: { component: "static-page", route },
  });
  pageDuration.add(page.timings.duration);
  pageRequests.add(1);
  pageOk.add(
    check(
      page,
      {
        "page returns HTTP 200": (r) => r.status === 200,
        "page returns HTML": (r) =>
          r.headers["Content-Type"]?.includes("text/html"),
        "page contains app root": (r) => r.body?.includes('id="root"'),
      },
      { component: "static-page" },
    ),
  );

  const poll = http.get(`${baseUrl}/api/current-poll`, {
    timeout: "10s",
    tags: { component: "poll-api" },
  });
  pollDuration.add(poll.timings.duration);
  pollRequests.add(1);
  (__ITER === 0 ? firstPoll : repeatPoll).add(poll.timings.duration);
  firstWorkerRequests.add(
    poll.headers["X-Albumasu-Worker-State"] === "first-request" ? 1 : 0,
  );
  const handler = poll.headers["Server-Timing"]?.match(/handler;dur=([\d.]+)/);
  if (handler) handlerDuration.add(Number(handler[1]));
  pollOk.add(
    check(
      poll,
      {
        "poll returns HTTP 200": (r) => r.status === 200,
        "poll returns JSON": (r) =>
          r.headers["Content-Type"]?.includes("application/json"),
        "anonymous poll hides choices": (r) => {
          try {
            const data = r.json();
            return (
              data.candidates?.length === 0 && data.finalists?.length === 0
            );
          } catch {
            return false;
          }
        },
      },
      { component: "poll-api" },
    ),
  );

  // Retain a low traffic rate; raw output preserves component + connection timings.
  sleep(8 + Math.random() * 4);
}
export function handleSummary(data) {
  const report = createReport(data, { profile, baseUrl });
  return {
    stdout: report,
    "performance-results/report.md": report,
    "performance-results/summary.json": JSON.stringify(data, null, 2),
  };
}
