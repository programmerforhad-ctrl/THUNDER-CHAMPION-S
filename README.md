# THUNDER CHAMPION'S (TC) - Website + Coaching Zone

Vanilla HTML/CSS/JS + Supabase. No build step beyond the tiny env-var script, deploys
straight to Vercel. This project is a sibling build of the earlier THE CHAIRMAN ESPORTS
site, rebranded and with a different login system (UID-based) and a different
revenue-share setup — see the differences at the bottom.

## 1. Supabase (5 minutes)
1. Open Supabase > SQL Editor > New query, paste **supabase/schema.sql**, click Run.
   It creates all tables, security rules (RLS), storage buckets (Logo, Roaster,
   Highlight, Achievment, Extra) and 60+ seed knowledge items (25 team rules, roles,
   IGL guide, etc, in Bangla).
2. Authentication > Sign In / Providers > Email: turn **"Confirm email" OFF**.
   This is required — players log in with a UID, not a real inbox, so there is no
   email to confirm.
3. Authentication > URL Configuration: set **Site URL** to your Vercel URL.
4. Create the Super Admin account directly (do NOT use the website's player sign-up
   for this): Authentication > Users > **Add user** > enter your real email + a
   password > tick **Auto Confirm User**. Then in SQL Editor:
   `insert into public.admins(email, role) values ('you@example.com','admin');`
5. Log in on the website with that same email + password — the same login box
   accepts either a UID (players) or a full email (staff).

## 2. GitHub
```
cd tc-thunder
git init && git add . && git commit -m "THUNDER CHAMPION'S website"
git branch -M main
git remote add origin https://github.com/YOUR-USER/YOUR-REPO.git
git push -u origin main
```

## 3. Vercel
Vercel > Add New > Project > import the repo. Framework Preset: **Other**. Add
Environment Variables `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (optional — the
site falls back to the values baked into config.js if you skip this). Deploy.

## 4. First setup inside the site (Admin panel)
Team details (logo, cover, social links, WhatsApp, Sponsor/Management %, developer
photo + link) > Squad > Management > Achievements > Notices > Schedule > Finance
(then "Set finance password").

## How players get access (UID login, not email)

1. Admin adds the player in **Squad** with their **UID** (their in-game UID is also
   their login name — nothing else to type here).
2. The player opens the site > **Sign up** > enters that same UID + picks a password.
3. They can log in immediately, but Coaching Zone / Finance / Team chat stay **locked**
   until Admin ticks **"Approved"** for them in Admin Panel > Squad.
4. **Forgot password:** the player's "Forgot password?" link opens their email app,
   addressed to your Team email (Team details > Team email), with their UID already
   in the subject. To actually reset it: Supabase > Authentication > Users > search
   the player's UID (their login email is `p<uid>@players.tc.local`) > set a new
   password directly, then tell the player.

Players can NOT change their own kills, earnings, tournaments, role, UID or approval
status (blocked in the database) — only Admin can.

## Team chat: Captains and voice messages
Tick **Captain** for a player in Squad to let them send voice messages in Team chat
(everyone else is text-only). Under every voice message the app shows who has
listened and how much (%), live.

## Finance: revenue share, participants, monthly summary
- Set the split in Admin Panel > Team details: **Sponsor %**, **Management %** (Owner
  % and Squad Fund % are also there if you ever want to use them — leave at 0
  otherwise), and each player's own % in Admin Panel > Squad ("Revenue share %").
  Make these add up to 100% (Sponsor + Management + every player's %).
- Adding a tournament (Admin Panel > Finance > Add new): tick which players played
  it. Their "Tournaments played" and "Total earning" on the public roster update
  automatically from that — nothing to type by hand.
- **Who sees what:** the full breakdown (every tournament, and exactly how much
  Sponsor/Management/each player earned) is Super Admin only. A player who opens
  Finance with the finance password sees three numbers only: total tournaments,
  total entry fee, total prize pool.
- **Monthly summary:** Admin Panel > Finance > "Monthly summary" — pick a month,
  see the totals, download as an image.

## Strategy system
Coaching Zone > Strategy: import a map/photo/video frame, draw rotations, mark
players/entry points/danger/safe areas, save versions, get team feedback/comments.

## Security notes
- `config.js` holds only the publishable key, which is meant to be public.
- NEVER put `sb_secret_...` in this project or in Vercel env vars for the browser.
- All permissions are enforced by Postgres Row Level Security.
- Finance password and the approval gate are both enforced server-side, not just by
  hiding buttons.

## Differences from THE CHAIRMAN ESPORTS build
- **Login is UID-based** for players (synthetic email `p<uid>@players.tc.local`
  generated automatically from their UID), with an Admin-approval step before they
  get member access. The earlier site used real player emails with Supabase's normal
  email-confirmation flow.
- **Revenue share** defaults to Sponsor 15% / Management 20% / each player 13% (no
  Owner or Squad Fund by default) instead of Owner/Sponsor/Manager/Squad Fund.
- **Storage buckets** are named Logo / Roaster / Highlight / Achievment / Extra
  instead of Logo / Roaster / Video / Ach / Strategy / Voice.
- **Developer Info section** (photo + link) on the Team page and footer.
- **Social links** render as icon pills (FB / YouTube / TikTok / Discord) instead of
  plain text links.
- Accent colour is gold/amber instead of lime-green.
