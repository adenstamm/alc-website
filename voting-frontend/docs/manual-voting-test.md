# Manual Voting Test Plan

Use this when you want to manually walk the site through nominations, primary voting, and final IRV voting.

## Recommended Test Setup

Use a dedicated test poll, not the real active club poll.

You need:

- One approved admin account.
- Five approved member test accounts.
- A fresh poll created from `/admin`.
- The latest Supabase SQL applied in this order:
  1. `supabase/schema.sql`
  2. `supabase/nomination-validation.sql`
  3. `supabase/three-phase-voting.sql`
  4. `supabase/site-content.sql`, required for current album editing and optional for event editing

The five member accounts are useful because the app intentionally allows one nomination per approved account per poll. Five nominations gives you enough candidates to test the final phase properly.

## Create The Test Poll

1. Sign in as the admin.
2. Open `/admin`.
3. In "Create the next weekly poll", create a poll with an obvious test label, for example:
   - Cycle label: `QA Week`
   - Poll id: `poll-qa-week`
   - Current album title: `QA Current Album`
   - Current album artist: `QA Artist`
4. Confirm the admin page shows the new poll in the nominations phase.

Expected:

- `/vote` shows the nominations form.
- `/results` hides aggregate totals from non-admins.
- `/admin` shows phase controls and an empty nominations result list.

## Phase 1: Nominations

For each approved member test account:

1. Sign in on `/vote`.
2. Submit a unique album and artist.
3. Confirm the page locks the submission for that phase.
4. Sign out.

Suggested safe test nominations:

- `QA Album One` by `QA Artist One`
- `QA Album Two` by `QA Artist Two`
- `QA Album Three` by `QA Artist Three`
- `QA Album Four` by `QA Artist Four`
- `QA Album Five` by `QA Artist Five`

Also test one rejected nomination with an already-used album from `src/bannedAlbums.txt`, such as `Heaven or Las Vegas`.

Expected:

- Valid nominations save once per account.
- Duplicate submission from the same account is blocked.
- Banned albums or artists show a friendly validation error.
- Admin results show nomination counts.

## Move To Primary

1. Sign in as admin.
2. Open `/admin`.
3. Click "Move to primary".

Expected:

- `/vote` now shows the primary ballot.
- The ballot includes the nominated albums.
- The old nomination form is no longer available.

## Phase 2: Primary Voting

For at least one approved member account:

1. Sign in on `/vote`.
2. Select one to five albums.
3. Submit the primary ballot.
4. Confirm the page locks the ballot for the primary phase.

Also test:

- Try submitting with zero selections.
- Select five albums, then confirm additional unselected checkboxes are disabled.
- Refresh after submitting and confirm the saved ballot still appears.

Expected:

- Zero selections are rejected.
- One to five selections are accepted.
- Same account cannot submit primary twice.
- Admin results show primary vote totals.

## Move To Final

1. Sign in as admin.
2. Open `/admin`.
3. In the primary results area, select exactly five finalists.
4. Click "Save five finalists".
5. Click "Move to final".

Expected:

- The "Move to final" action is disabled until exactly five finalists are selected.
- `/vote` now shows a ranked final ballot.
- The finalist list appears in the saved order.

## Phase 3: Final IRV Voting

For at least one approved member account:

1. Sign in on `/vote`.
2. Use the up/down controls to reorder the five finalists.
3. Submit the final ranking.
4. Confirm the page locks the ballot for the final phase.

Also test:

- Refresh after submitting and confirm the saved ranking still appears.
- Sign in as admin and open `/results`.
- Confirm IRV rounds are visible only to admins.

Expected:

- All five finalists must be ranked.
- Same account cannot submit final twice.
- Admin results show IRV rounds and either a winner or a manual tie notice.

## Cleanup Options

The safest cleanup is to leave the test poll archived by creating the next real active poll from `/admin`.

If you need database cleanup, do it from the Supabase SQL editor against the test poll id only:

```sql
delete from public.polls
where id = 'poll-qa-week';
```

The related candidates and vote choices cascade from `poll_candidates`; votes do not currently reference `polls`, so remove test votes explicitly if needed:

```sql
delete from public.votes
where poll_id = 'poll-qa-week';
```

## Faster Local Demo Mode Idea

For quick design and UI testing, add a dev-only local voting demo mode. That mode would:

- Use seeded local candidates.
- Skip Supabase auth.
- Let a tester switch between nominations, primary, and final from a local-only test panel.
- Store demo ballots in `localStorage`.

That is faster for UI QA, but it does not replace the real Supabase pass above.
