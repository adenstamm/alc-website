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
- Re-enable DNSSEC in Cloudflare, then add the generated DS record at Porkbun.

## Azure Static Web Apps

- Add `albumasu.com` as a custom domain on the production Static Web App.
- Complete Azure's DNS ownership validation.
- Confirm the managed certificate is healthy.
- Keep the Free plan while traffic is modest. It is sufficient for a static
  React frontend, but it does not support private endpoints or origin IP
  restrictions.

## Supabase and Google

- Set the Supabase Site URL to `https://albumasu.com`.
- Allow redirects to:
  - `https://albumasu.com/account`
  - `https://albumasu.com/reset-password`
  - `http://localhost:5173/account` for local development
- Keep Google Cloud's authorized redirect URI set to the callback URL displayed
  by the Supabase Google provider.
- Configure custom SMTP before inviting a large group.
- Run the Supabase Security Advisor and review
  [`supabase-security-checklist.md`](supabase-security-checklist.md).

## Release

- Add the GitHub Actions secrets named in `.github/workflows/quality.yml`.
- Run `npm run check`.
- Push to `main` and confirm the **Quality and deploy** workflow succeeds.
- Confirm `/`, `/current`, `/events`, `/archive`, `/vote`, `/account`, and
  `/privacy` on desktop and mobile.
- Confirm a made-up URL returns the branded HTTP 404 page.
- Complete one production Google sign-in, password reset, admin approval, and
  vote.
- Confirm the response includes CSP, HSTS, frame-denial, referrer, and
  permissions-policy headers.

