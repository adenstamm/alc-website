# Performance and availability testing

The k6 suite in `performance/site-read-path.js` measures the production read
path without modifying election data:

- Cloudflare and Azure Static Web Apps serve rotating public React routes.
- The same-origin `/api/current-poll` function performs the poll read and strips
  member-only candidate data from anonymous responses.
- Checks verify HTTP status, content type, representative content, and the
  anonymous response boundary.
- Thresholds require fewer than 1% failed requests, more than 99% successful
  checks, p95 latency below 1 second, and p99 latency below 2 seconds.

The `smoke` profile runs one virtual user for one minute. GitHub Actions runs it
against `https://albumasu.com` every six hours as a lightweight production
availability check.

## Run locally

Install [Grafana k6](https://grafana.com/docs/k6/latest/set-up/install-k6/),
then run from `voting-frontend`:

```sh
mkdir -p performance-results

BASE_URL=https://albumasu.com \
TEST_PROFILE=smoke \
k6 run performance/site-read-path.js
```

The script writes:

- `performance-results/report.md`, a concise human-readable result.
- `performance-results/summary.json`, the complete aggregated k6 result.

These generated files are ignored by Git. GitHub Actions also uploads them as a
run artifact.

The historical pre-hardening 100-user baseline is recorded in
[`performance-benchmark.md`](performance-benchmark.md); it is not the current
production test contract.

## Safety rules

- Production automation is smoke-only. Do not bypass Cloudflare by targeting
  the Azure hostname. The Free plan leaves that hostname reachable, but it is
  intentionally excluded from normal traffic and test automation.
- Run capacity/load testing only against a separate staging deployment with
  isolated Supabase data and explicitly raised test limits.
- Do not add nomination or ballot submission calls to this production test.
  Write-path performance tests require an isolated Supabase test project and
  disposable accounts and polls.
