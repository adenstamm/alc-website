# Performance and availability testing

The k6 suite in `performance/site-read-path.js` measures the production read
path without modifying election data:

- Azure Static Web Apps serves a rotating set of public React routes.
- Supabase/PostgreSQL executes the public, read-only `get_current_poll` RPC.
- Checks verify HTTP status, content type, and representative response content.
- Thresholds require fewer than 1% failed requests, more than 99% successful
  checks, p95 latency below 1 second, and p99 latency below 2 seconds.

## Test profiles

`smoke` runs one virtual user for one minute. GitHub Actions runs it against
`https://albumasu.com` every six hours as a lightweight production availability
check.

`load` ramps through 25, 50, and 100 simultaneous virtual users, holds 100 users
for two minutes, and then ramps down. Each virtual user waits 8–15 seconds
between page/RPC reads to model an active listening-club member rather than a
tight request loop.

The automated load test targets the Azure-generated hostname so Cloudflare's
per-IP abuse protection does not mistake a single GitHub Actions runner for a
real distributed audience. The Supabase RPC is still the live production
read-only endpoint.

## Run locally

Install [Grafana k6](https://grafana.com/docs/k6/latest/set-up/install-k6/),
then run from `voting-frontend`:

```sh
mkdir -p performance-results

BASE_URL=https://albumasu.com \
SUPABASE_URL=https://YOUR_PROJECT.supabase.co \
SUPABASE_ANON_KEY=YOUR_ANON_KEY \
TEST_PROFILE=smoke \
k6 run performance/site-read-path.js
```

For the controlled 100-user test, set `BASE_URL` to the Azure Static Web Apps
hostname and `TEST_PROFILE=load`.

The script writes:

- `performance-results/report.md`, a concise human-readable result.
- `performance-results/summary.json`, the complete aggregated k6 result.

These generated files are ignored by Git. GitHub Actions also uploads them as a
run artifact.

The first verified 100-user baseline is recorded in
[`performance-benchmark.md`](performance-benchmark.md).

## Safety rules

- Never point the load profile at a third-party system you do not own.
- Prefer off-peak test windows.
- Use the edge target only for smoke tests; Cloudflare rate limiting correctly
  treats many requests from one runner as a single-IP traffic burst.
- Do not add nomination or ballot submission calls to this production test.
  Write-path performance tests require an isolated Supabase test project and
  disposable accounts/polls.
