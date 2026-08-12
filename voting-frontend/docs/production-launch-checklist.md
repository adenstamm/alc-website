# Production Launch Checklist

Use this checklist for the `https://albumasu.com` launch.

## Cloudflare and DNS

- Confirm Cloudflare reports the zone as active.
- Confirm the apex record for `albumasu.com` reaches the Azure Static Web App.
- Add `www` and redirect it permanently to `https://albumasu.com`.
- Keep the application record proxied through Cloudflare.
- Set SSL/TLS encryption mode to **Full (strict)** after Azure has issued the
  custom-domain certificate.
- Enable Cloudflare's managed security rules available on the current plan.
- Enable Bot Fight Mode and Browser Integrity Check.
- Apply the exploit-probe and `/api/current-poll` rate-limit rules recorded in
  `infra/cloudflare-security.json`.
- Keep `Cache-Control: no-transform` on HTML responses. This prevents Cloudflare
  from injecting JavaScript Detections and automatic Web Analytics snippets that
  conflict with the site's nonce-free CSP. Use Cloudflare's edge analytics for
  traffic reporting unless a separately reviewed CSP-compatible beacon is added.
- Do not add `unsafe-inline` to `script-src` to accommodate an injected script.
- Re-enable DNSSEC in Cloudflare, then add the generated DS record at Porkbun.

## Azure Static Web Apps

- Add `albumasu.com` as a custom domain on the production Static Web App.
- Complete Azure's DNS ownership validation.
- Confirm the managed certificate is healthy.
- Keep the Free plan to avoid a recurring hosting charge. Document that its
  Azure-generated hostname remains reachable outside Cloudflare; application
  rate limiting and Supabase authorization are the compensating controls.
- Add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
  `SUPABASE_SERVICE_ROLE_KEY` as Static Web App application settings. Never put
  the service-role key in a `VITE_` variable.

## Supabase and Google

- Set the Supabase Site URL to `https://albumasu.com`.
- Allow redirects to:
  - `https://albumasu.com/account`
  - `https://albumasu.com/reset-password`
  - `http://localhost:5173/account` for local development
- Keep Google Cloud's authorized redirect URI set to the callback URL displayed
  by the Supabase Google provider.
- Configure custom SMTP before inviting a large group.
- Create a Cloudflare Turnstile widget for the production domains, store its
  public site key as `VITE_TURNSTILE_SITE_KEY`, and configure its secret in
  Supabase Authentication CAPTCHA protection.
- Apply `supabase/security-hardening.sql` last and confirm anonymous users have
  no application RPC grants.
- Run the Supabase Security Advisor and review
  [`supabase-security-checklist.md`](supabase-security-checklist.md).

## Release

- Add the GitHub Actions secrets named in `.github/workflows/quality.yml`.
- Run `npm run check`.
- Push to `main` and confirm the **Quality and deploy** workflow succeeds.
- Confirm `/`, `/current`, `/events`, `/archive`, `/vote`, `/account`, and
  `/privacy` on desktop and mobile.
- Confirm a made-up URL returns the branded HTTP 404 page.
- Confirm normal traffic and monitoring use the Cloudflare-proxied custom
  domain, not the publicly reachable Azure-generated hostname.
- Confirm anonymous `POST /rest/v1/rpc/get_current_poll` is denied and anonymous
  `GET /api/current-poll` returns empty candidate/finalist arrays.
- Confirm repeated `/api/current-poll` requests receive `429` after the
  configured per-IP limit.
- Complete one production Google sign-in, password reset, admin approval, and
  vote.
- Confirm the response includes CSP, HSTS, frame-denial, referrer, and
  permissions-policy headers.
- Confirm HTML responses include `Cache-Control: no-transform`, page source has
  route-specific metadata and an H1, and the browser console has no CSP errors.
