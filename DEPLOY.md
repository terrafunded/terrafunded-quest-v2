# DEPLOY — Quest v2 on Vercel, in two minutes

Vercel's API is reachable from the Cloud Agent VM (`api.vercel.com` answers), but the run has **no
Vercel credential**: the only secrets injected are `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`QUEST_TEST_EMAIL`, `QUEST_TEST_PASSWORD`, and `vercel login` needs a browser or e-mail round-trip.
So the deploy is prepared but not executed. Everything below is ready: `vercel.json` (Vite SPA,
every route rewritten to `index.html`, immutable cache on `/assets`), the production build, the QR
code, and a live smoke test.

Planned production URL: **https://terrafunded-quest-v2.vercel.app** (Vercel names the project after
the directory; if that alias is taken, step 5 tells you how to regenerate the QR for the real one).

## Option A — from a laptop (interactive, ~2 minutes)

```bash
# 0. Clone the deploy branch
git clone -b v2 https://github.com/terrafunded/terrafunded-quest-v2.git
cd terrafunded-quest-v2
npm ci

# 1. Sign in to Vercel (opens the browser once)
npx vercel login

# 2. Create/link the project — accept the defaults:
#    scope = your team, project name = terrafunded-quest-v2, root = ./ ,
#    framework Vite is detected from vercel.json (build: npm run build, output: dist)
npx vercel link --yes

# 3. Environment variables (production + preview). Paste the values from the Payments project;
#    the two VITE_ ones are the only ones the browser bundle needs. The QUEST_TEST_* pair is only
#    for the smoke test and Playwright and is NOT needed on Vercel — keep it in your local .env.
printf '%s' "$VITE_SUPABASE_URL"      | npx vercel env add VITE_SUPABASE_URL      production
printf '%s' "$VITE_SUPABASE_ANON_KEY" | npx vercel env add VITE_SUPABASE_ANON_KEY production
printf '%s' "$VITE_SUPABASE_URL"      | npx vercel env add VITE_SUPABASE_URL      preview
printf '%s' "$VITE_SUPABASE_ANON_KEY" | npx vercel env add VITE_SUPABASE_ANON_KEY preview

# 4. Deploy the v2 branch to production
npm run deploy            # = npx vercel deploy --prod --yes   → prints the live URL

# 5. Verify (signs in as the viewer, checks the Throne Room shows real numbers, deep links work,
#    all three themes switch and persist; writes docs/live-<theme>.jpg)
cp .env.example .env && $EDITOR .env      # fill the four values once
npm run verify:live -- https://terrafunded-quest-v2.vercel.app

# 6. If Vercel gave a different URL, regenerate the QR and commit
npm run qr -- https://<the-url-vercel-printed>
git add docs/qr-live.png docs/qr-live.svg docs/live-*.jpg && git commit -m "docs: live URL + QR" && git push
```

Then, once, in the Vercel dashboard → Project → Settings → Git: connect the GitHub repo and set the
**Production Branch to `v2`** so every push to `v2` redeploys (PR branches get preview URLs).
Equivalent API call, if you prefer the terminal:

```bash
npx vercel git connect          # links the GitHub repo to the project (asks once)
curl -X PATCH "https://api.vercel.com/v9/projects/terrafunded-quest-v2" \
  -H "Authorization: Bearer $VERCEL_TOKEN" -H "Content-Type: application/json" \
  -d '{"gitProductionBranch":"v2"}'    # append ?teamId=<id> when the project lives in a team
```

## Option B — let the Cloud Agent do it (non-interactive)

Add one secret in Cursor → Cloud Agents → Secrets for this repo:

| Secret | Where to get it |
|---|---|
| `VERCEL_TOKEN` | https://vercel.com/account/tokens → Create → scope: the team that will own the project |

Optionally also `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` (from `.vercel/project.json` after a
`vercel link` on any machine) to skip project creation.

Secrets are injected only into VMs **started after** the secret was saved: a running agent does not
see a token added mid-conversation (checked on 2026-09-11 — `VERCEL_TOKEN` was saved but absent
from every process environment on the live VM). Start a **new** Cloud Agent on `v2` and ask it to
"deploy v2 following Option B in DEPLOY.md"; it will run, with no prompts:

```bash
npx -y vercel@latest link --yes --project terrafunded-quest-v2 --token "$VERCEL_TOKEN"
printf '%s' "$VITE_SUPABASE_URL"      | npx -y vercel@latest env add VITE_SUPABASE_URL      production --token "$VERCEL_TOKEN"
printf '%s' "$VITE_SUPABASE_ANON_KEY" | npx -y vercel@latest env add VITE_SUPABASE_ANON_KEY production --token "$VERCEL_TOKEN"
npx -y vercel@latest deploy --prod --yes --token "$VERCEL_TOKEN"
npm run verify:live -- "$(npx -y vercel@latest ls --prod --token "$VERCEL_TOKEN" | awk 'NR==2{print $2}')"
```

## Exact environment variables

| Name | Scope | Value |
|---|---|---|
| `VITE_SUPABASE_URL` | Vercel production + preview; local `.env` | the Payments Supabase project URL (`https://<ref>.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Vercel production + preview; local `.env` | the Payments **anon** key. Public by design; RLS keeps the app read-only (`npm run check` proves an insert is rejected) |
| `QUEST_TEST_EMAIL` | local `.env` only (smoke test, Playwright) | the viewer login |
| `QUEST_TEST_PASSWORD` | local `.env` only | its password |

Never put the service-role key anywhere near this app. Nothing else is required: no server, no
API routes, no database of its own. `vercel.json` is the whole platform configuration.

## Checklist after the first deploy

- [ ] `npm run verify:live -- <url>` passes (prints net profit, trapped profit, three theme lines).
- [ ] Open `<url>/pipeline` directly in a fresh tab — no 404 (the rewrite works).
- [ ] Supabase → Authentication → URL Configuration: add `<url>` to the allowed redirect URLs only
      if you later enable magic links; email/password sign-in works without it.
- [ ] Scan `docs/qr-live.png` from a phone; the Throne Room should paint in under a second on 4G.
- [ ] Replace the planned URL at the top of `PROGRESS.md` if it differs.
