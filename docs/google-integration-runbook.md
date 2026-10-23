# Google integration — what is left, and exactly where to do it

Covers Google Business Profile (reviews, Q&A, posts, insights) and Google Ads.
Every value below is taken from the code, so it can be pasted as-is.

Status at 2026-10-23:

| Piece | State |
|---|---|
| OAuth app + consent screen | Working — Razorveda connected 17 Sep, refresh token still valid |
| Business Profile API **quota** | **0** — this is the blocker. Every call returns 429 |
| Business Profile data pulled | 0 locations, 0 reviews, 0 Q&A, 0 insights |
| Google Ads | Never connected (no rows in `google_ads_connections`) |
| Google Ads developer token | Unknown — `GOOGLE_ADS_DEVELOPER_TOKEN` must be set in Coolify |
| Code | Done. Nothing to build for either side |

The one thing that proves the diagnosis, from a live sync on 19 Oct:

```
GET 429  RESOURCE_EXHAUSTED
service:            mybusinessaccountmanagement.googleapis.com
consumer:           project_number:77637202964
quota_limit:        DefaultRequestsPerMinutePerProject
quota_limit_value:  "0"          <-- zero, not "exceeded by traffic"
```

A quota of 0 is what Google gives a project that has **not been granted access** to
the Business Profile APIs. Enabling the API in the console is not enough; access is
granted only after Google approves a separate request form. Until then the token,
the scope and our code are all fine and every call still fails.

---

## Project identity (needed on every form)

| Field | Value |
|---|---|
| Google Cloud **project number** | `77637202964` |
| Connected Google account | `razorvedamis.sonia@gmail.com` |
| App URL | `https://app.aiagentixdev.com` |

Find the project **ID** (a string, different from the number) at
console.cloud.google.com → the project picker at the top. Forms usually ask for both.

---

# PART 1 — Google Business Profile

## Step 1.1 Enable all five APIs

console.cloud.google.com → **APIs & Services → Library**, search and press *Enable*
on each. The code calls all five, so missing one breaks that feature only:

| API | What breaks without it |
|---|---|
| `Google My Business Account Management API` | Everything — this is where it fails now |
| `Google My Business Business Information API` | Location list |
| `Google My Business Q&A API` | Questions and answers |
| `Business Profile Performance API` | Insights / views / calls |
| `Google My Business API` (the legacy one) | Reviews and review replies |

## Step 1.2 Request access (**this is the actual blocker**)

Google's own criteria, from the Prerequisites page. **Both are hard requirements**,
and the first application was auto-rejected on the spot for missing them:

> In order to get access to GBP APIs, we require all applicants:
> - Manage a Google Business Profile that is **verified and active for 60+ days**.
>   This GBP can be the applicant's own office or headquarters **or it could belong
>   to one of the clients they manage**.
> - Have a **website representing the business listed on the GBP**.
>
> Make sure that you are using an **email address that is listed as an
> owner/manager** on your business's GBP.

What that means for us, concretely:

| Field | Must be |
|---|---|
| Google account used to apply | an owner/manager of that GBP — not just any account |
| Company website on the form | the website listed **on that GBP**, not our app URL |
| The GBP itself | verified, 60+ days old, and fully filled in |
| Project number | `77637202964` |

Use the **GBP API contact form** linked from the Prerequisites page and pick
**"Application for Basic API Access"** from the drop-down. The 33%→100% wizard
reachable from the Cloud Console product page is a different flow that screens
instantly and rejects without a human ever seeing it.

If AGENTiX has no verified Business Profile of its own, apply with a client's —
Google explicitly allows that. The practical candidate is Razorveda, whose
`razorvedamis.sonia@gmail.com` already connected a profile to us on 17 Sep; the
form must then be submitted from that email with `razorveda.in` as the website.
If that account needs to see the Cloud project, give it Viewer in IAM.

## Step 1.3 After the approval email, confirm the quota moved off 0

console.cloud.google.com → **IAM & Admin → Quotas** → filter by service
`mybusinessaccountmanagement.googleapis.com`. The per-minute limit must read
something above 0. Google states this outright: *"If your quota is 0 QPM, your
project has not yet been approved."*

## Step 1.4 Tell me, and I confirm end to end

I trigger the sync and read Google's actual answer. Expect
`gbp_locations` to fill, then reviews and Q&A. Nothing to deploy — the cron already
runs every 6 hours and was repaired on 19 Oct.

## Step 1.5 Only if the OAuth screen also complains

The consent screen already works, so skip this unless a *new* client sees
"unverified app" when connecting. `business.manage` is a sensitive scope, so going
past ~100 users needs app verification:

- **APIs & Services → OAuth consent screen**: publishing status **In production**
  (while it is *Testing*, refresh tokens die after 7 days)
- App domain and privacy/terms links must point at `app.aiagentixdev.com`
  (`/privacy-policy` and `/terms` already exist and were rewritten for this)
- **Authorised redirect URIs** must contain all three, exactly:
  ```
  https://app.aiagentixdev.com/api/integrations/gbp/callback
  https://app.aiagentixdev.com/api/integrations/google-ads/callback
  https://app.aiagentixdev.com/api/integrations/google-calendar/callback
  ```
- Verify `aiagentixdev.com` in **Google Search Console** with the same Google
  account that owns the Cloud project, or domain verification fails

---

# PART 2 — Google Ads

Independent of Part 1. Can be done in parallel; it has its own approval.

## Step 2.1 Get a developer token

Needs a **Google Ads Manager (MCC)** account — a normal Ads account cannot issue one.

1. ads.google.com → sign in to the **manager** account
2. **Tools & Settings → Setup → API Center**
3. Apply for a developer token

It arrives at **Test Account** access, which can only query test accounts — real
campaign data returns nothing. Apply in the same screen for **Basic Access** and
describe the same use case as above. That is a second approval wait.

## Step 2.2 Put the token in Coolify

Coolify → the app → **Environment Variables**:

```
GOOGLE_ADS_DEVELOPER_TOKEN = <the token>
```

Already set and working, do not change: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`NEXT_PUBLIC_APP_URL`. Adding a variable needs a redeploy for the app to read it.

## Step 2.3 Enable the API and connect

- Cloud console → Library → enable **Google Ads API**
- Then in the client's portal: **Settings → Integrations → Google Ads → Connect**,
  and sign in with the Google account that can see the Ads account

That writes a row into `google_ads_connections` and the 6-hourly cron starts
pulling campaigns.

## Step 2.4 If the client's Ads account sits under a manager

`google_ads_connections` holds both `customer_id` and `login_customer_id`. When the
account is accessed through an MCC, the manager's id goes in `login_customer_id` —
otherwise the API refuses. The connect flow fills these; if campaigns stay empty
after connecting, that pair is the first thing to check.

---

# PART 3 — Local Rank (small, separate)

Local Rank tracking uses a Places key, not OAuth:

- Cloud console → Library → enable **Places API**
- Coolify env: `GOOGLE_PLACES_API_KEY = <key>`
- Then add keywords per client at **Settings → Local Rank**

The 19 Oct sync reported `local_rank: {workspaces: 0, keywords: 0}` — nobody has
added keywords yet, which is a configuration gap, not a fault.

---

# Order of work

1. **Part 1, Step 1.2** — submit the Business Profile access request. Longest wait,
   so start here. Steps 1.1 and 1.3 are quick and can be done the same day.
2. **Part 2, Step 2.1** — apply for the Ads developer token and Basic Access, in
   parallel, since it is a separate queue.
3. **Part 3** — ten minutes, any time.

While both approvals are pending nothing else can move on Google, and nothing in
our code is waiting on a change.

# How to re-check the blocker yourself

Reviews, Q&A, posts and insights all sit behind Step 1.2. To see the live reason at
any time, trigger the sync and read the response:

```sql
-- queue the request (the job carries its own bearer token)
SELECT net.http_post(url := 'https://app.aiagentixdev.com/api/cron/google-sync',
  headers := (SELECT (regexp_match(command, '''(\{.*\})''::jsonb'))[1]::jsonb
              FROM cron.job WHERE jobname = 'google-sync'),
  body := '{}'::jsonb);

-- then read Google's own words out of the response
SELECT status_code, content FROM net._http_response ORDER BY created DESC LIMIT 1;
```

Simpler: run whatever `SELECT command FROM cron.job WHERE jobname='google-sync'`
prints, then read `net._http_response`. The `errors[]` array in the body names the
workspace and quotes Google's message — that reporting was added on 19 Oct, because
before it the job returned a bare `"failed": 1` and this sat broken for a month.
