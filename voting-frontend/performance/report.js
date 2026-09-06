export const latencyTargets = ["p(95)<1000", "p(99)<2000"];
const value = (data, metric, field) => data.metrics?.[metric]?.values?.[field];
const number = (v, digits = 2) =>
  Number.isFinite(v) ? v.toFixed(digits) : "n/a";
const thresholdsPass = (data, name) => {
  const entries = Object.values(data.metrics?.[name]?.thresholds || {});
  return entries.length > 0 && entries.every((threshold) => threshold.ok);
};
export function createReport(data, { profile, baseUrl }) {
  const available = [
    "checks",
    "http_req_failed",
    "static_page_ok",
    "poll_api_ok",
  ].every((name) => thresholdsPass(data, name));
  const latencyPass = ["static_page_duration", "poll_api_duration"].every(
    (name) => thresholdsPass(data, name),
  );
  const enoughSamples = ["static_page_requests", "poll_api_requests"].every(
    (name) => thresholdsPass(data, name),
  );
  const row = (label, prefix) =>
    `| ${label} | ${number(value(data, prefix + "_requests", "count"), 0)} | ${number(value(data, prefix + "_duration", "med"))} | ${number(value(data, prefix + "_duration", "p(95)"))} | ${number(value(data, prefix + "_duration", "p(99)"))} | ${number(value(data, prefix + "_duration", "max"))} |`;
  return [
    "# AlbumASU availability and latency",
    "",
    `- Availability: **${available ? "PASS" : "FAIL"}**`,
    `- Latency targets: **${latencyPass ? "PASS" : "FAIL"}**`,
    `- Sampling completed: **${enoughSamples ? "PASS" : "INSUFFICIENT"}**`,
    `- Overall: **${available && latencyPass && enoughSamples ? "PASS" : "FAIL"}**`,
    `- Profile: ${profile}; target: ${baseUrl}`,
    "",
    "| Component | Requests | Median ms | p95 ms | p99 ms | Max ms |",
    "|---|---:|---:|---:|---:|---:|",
    row("Static pages", "static_page"),
    row("Poll API", "poll_api"),
    "",
    "- Targets are unchanged: each component p95 < 1,000 ms and p99 < 2,000 ms.",
    "- This short smoke run has few observations. Tail percentiles are descriptive and sensitive to individual requests; latency failure with successful availability checks is not an outage.",
    "",
    "## First-request diagnostics",
    "",
    `- First observed poll request: ${number(value(data, "poll_first_duration", "max"))} ms`,
    `- Subsequent poll requests (median): ${number(value(data, "poll_repeat_duration", "med"))} ms`,
    `- API worker first requests observed: ${number(value(data, "worker_first_requests", "count"), 0)}`,
    `- API-reported handler time (median): ${number(value(data, "poll_handler_duration", "med"))} ms`,
    "- First observed does not prove a cold start. Compare raw TTFB, connection/TLS timings, worker state, and Server-Timing across scheduled runs.",
    "- Requests run sequentially with one virtual user. No ballots or production data are modified.",
    "",
  ].join("\n");
}
