import assert from "node:assert/strict";
import test from "node:test";
import { createReport } from "./report.js";

test("a slow but successful API is reported as latency failure, not unavailable", () => {
  const metrics = {};
  for (const name of [
    "checks",
    "http_req_failed",
    "static_page_ok",
    "poll_api_ok",
    "static_page_duration",
    "static_page_requests",
    "poll_api_requests",
  ])
    metrics[name] = {
      thresholds: { target: { ok: true } },
      values: { count: 6, "p(95)": 100, "p(99)": 150, med: 80, max: 160 },
    };
  metrics.poll_api_duration = {
    thresholds: { target: { ok: false } },
    values: { "p(95)": 1210, "p(99)": 2050, med: 120, max: 2250 },
  };
  const report = createReport(
    { metrics },
    { profile: "smoke", baseUrl: "https://example.test" },
  );
  assert.match(report, /Availability: \*\*PASS\*\*/);
  assert.match(report, /Latency targets: \*\*FAIL\*\*/);
  assert.match(report, /Poll API.*1210\.00.*2050\.00/);
  assert.match(report, /not an outage/);
});
