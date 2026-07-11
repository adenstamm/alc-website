# Auth Launch Checklist

Use this before launch to reduce email deliverability and rate-limit risk.

## Google OAuth

In Google Cloud:

1. Create or open the project for Album Listening Club.
2. Configure the OAuth consent screen.
3. Create an OAuth client for a web application.
4. Add the Supabase callback URL from the Supabase Google provider settings as an authorized redirect URI.
5. Copy the Google client id and client secret.

In Supabase:

1. Open Authentication > Providers.
2. Enable Google.
3. Paste the Google client id and client secret.
4. Open Authentication > URL Configuration.
5. Add the production site URL.
6. Add redirect URLs for:
   - `http://localhost:5173/account`
   - Production `/account`
   - Production `/reset-password`

In the app:

- The Account page includes "Continue with Google".
- Google OAuth redirects users back to `/account`.
- New Google users still land in `memberships` as pending until an admin approves them.

## SMTP

Use custom SMTP before launch so account confirmation and password reset emails do not depend on Supabase's shared/default sending limits.

In Supabase:

1. Open Authentication > SMTP Settings.
2. Enable custom SMTP.
3. Add the SMTP host, port, username, password, sender email, and sender name.
4. Send a test email from the dashboard.
5. Confirm SPF, DKIM, and DMARC records are configured with the email provider.

Recommended providers:

- Resend
- Postmark
- SendGrid
- Amazon SES

## Launch Smoke Test

Test these before sharing the site:

1. Create account with email/password.
2. Confirm the account email arrives.
3. Reset password and confirm the reset email arrives.
4. Continue with Google.
5. Confirm the Google account appears in `/admin` as pending.
6. Approve the Google account.
7. Confirm that account can vote.
8. Sign in as that user on `/account`, save a display name, and confirm `/admin` shows the updated name.

## Important Notes

- OAuth avoids most signup confirmation email pressure, but password reset and email/password signup still need SMTP.
- Google OAuth does not bypass approval. It only proves identity; admins still control voting access.
- Keep email/password enabled as a fallback unless launch policy says Google-only.
