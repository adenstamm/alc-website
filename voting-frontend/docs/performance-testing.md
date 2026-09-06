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

## Isolated 100-voter rehearsal

`performance/staging-vote-load.mjs` exercises the path used during an actual
event: 100 already-signed-in members sharing one source IP read through the
staging Azure `/api/current-poll` endpoint, query their memberships, submit
primary ballots, and submit final rankings directly to staging Supabase. It
also verifies exact committed row counts, the 18-hour final deadline, and that
a manually closed final rejects late ballots.

This is an API/database capacity rehearsal, not a replacement for Playwright.
Playwright checks what a person sees and can click; this script checks the
shared-IP proxy limit, authenticated concurrency, transaction correctness, and
database throughput. Run both before the event.

The script has deliberately strict guardrails:

- It rejects the known production Supabase project and every `albumasu.com`
  host.
- It requires the exact `ALBUMASU_STAGING_LOAD_CONFIRM=isolated-staging-only`
  acknowledgement.
- It refuses to run when staging already contains an active poll.
- It creates uniquely named disposable accounts and one disposable poll, then
  deletes only those exact resources in a `finally` cleanup.
- It caps the run at 150 voters.

Create an ignored `.env.staging-load.local` file inside `voting-frontend`:

```sh
STAGING_APP_URL=https://your-staging-app.example
STAGING_SUPABASE_URL=https://your-staging-project.supabase.co
STAGING_SUPABASE_ANON_KEY=your-staging-anon-key
STAGING_SUPABASE_SERVICE_ROLE_KEY=your-staging-service-role-key
ALBUMASU_STAGING_LOAD_CONFIRM=isolated-staging-only
LOAD_TEST_VOTERS=100
```

Never commit that file or paste the service-role key into chat. Apply the full
database migration sequence to staging first, make sure it has no active poll,
then run:

```sh
npm run test:staging-load
```

The account provisioning/sign-in setup is intentionally outside the measured
event stages because attendees are expected to arrive verified, approved, and
signed in. The measured output reports pass counts and p50/p95/p99 latency for
membership reads, Azure/API poll reads, and both ballot bursts.

## Separate availability from latency

The monitor now reports static pages and `/api/current-poll` independently.
Availability checks and latency targets have separate verdicts. The existing
p95 < 1,000 ms and p99 < 2,000 ms targets remain unchanged for each component.
A successful response above the latency target is not classified as an outage.

The one-user, one-minute smoke profile retains low traffic. Reports include
sample counts and warn that p95/p99 from a handful of requests are sensitive to
individual observations. Each component must collect at least five requests;
a slow or incomplete run cannot silently pass due to missing metrics.

Workflow artifacts also contain `samples.json.gz`: raw k6 measurements tagged
by component and route, including waiting, connection, and TLS timings. The
first observed poll request and subsequent requests are summarized separately.
API responses expose `Server-Timing: handler;dur=…`, worker first-request/reused
state, and worker age. These contain no account or token information.

For a latency failure, compare API and static durations first. A slow API TTFB
with a fast reported handler on a worker's first request is consistent with
platform startup or routing overhead, but does not prove a cold start. Slow
handler time points toward the handler/upstream database path. Correlate these
observations with Azure logs and multiple scheduled runs before changing
thresholds or infrastructure. A client's first request can reach a warm worker.

The [September 5 failing run](https://github.com/adenstamm/alc-website/actions/runs/33974441276)
had 12 requests, 100% successful checks, p95 1,209.96 ms and p99 2,049.70 ms.
Its aggregate-only artifacts cannot identify which component or request caused
the tail latency, or establish a cold start. New diagnostics support that next
investigation after deployment; the current target has not been relaxed.

### Audit measurement — September 5, 2026

A read-only, one-minute local k6 run against `https://albumasu.com` returned
successful checks for all six static-page and six poll-API requests. Static
p95/p99 were 308/368 ms; poll-API p95/p99 were 1,460/1,715 ms. Availability
passed and API p95 failed the unchanged target. The first API response took
1,779 ms; subsequent API responses had a median of 423 ms. These are observations
from one small sample and one client location, not a production latency baseline.

The live deployment did not yet include the new worker-state/handler headers.
The first-request slowdown is consistent with startup or connection effects,
but does not establish a cold start. After deploying the instrumentation, compare
worker-first versus reused responses and handler time against raw waiting,
connection, and TLS timings before selecting a hosting or caching change.
