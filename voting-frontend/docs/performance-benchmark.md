# Production read-path benchmark

## July 25, 2026 baseline

The `load` profile in `performance/site-read-path.js` was run from a local k6
1.7.1 container against:

- Azure Static Web Apps:
  `https://thankful-sand-0f7aa4a10.7.azurestaticapps.net`
- The production Supabase/PostgreSQL `get_current_poll` RPC.

The workload ramped through 25, 50, and 100 virtual users, held 100 users for
two minutes, and used an 8–15 second think time between read-only user journeys.

| Metric | Result |
| --- | ---: |
| Maximum concurrent virtual users | 100 |
| Completed user journeys | 1,511 |
| HTTP requests | 3,022 |
| Throughput | 12.02 requests/second |
| p95 response time | 151.57 ms |
| p99 response time | 649.55 ms |
| HTTP failure rate | 0.00% |
| Successful checks | 100.00% |

The run passed every configured service-level threshold:

- HTTP failure rate below 1%.
- Successful checks above 99%.
- p95 response time below 1 second.
- p99 response time below 2 seconds.

## Scope

This benchmark supports a precise claim about **100 concurrent, read-active
sessions** across the production Azure and Supabase read path. It does not claim
that 100 users submitted ballots simultaneously.

Authenticated write-path capacity must be tested separately against an isolated
Supabase test project with disposable accounts and election data. The production
suite intentionally avoids nominations, ballots, membership updates, and other
writes.
