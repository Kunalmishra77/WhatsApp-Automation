# Cron Jobs Setup — Coolify VPS

This project runs on Coolify (VPS), NOT Vercel. The `vercel.json` file is ignored.
All cron jobs must be configured via **Coolify → App → Scheduled Tasks**.

## How to Add a Scheduled Task in Coolify

1. Open your app in Coolify dashboard
2. Go to **Scheduled Tasks** tab
3. Click **+ Add**
4. Set the command and schedule (cron syntax)
5. Save and enable

---

## Required Cron Jobs

Each job calls a GET request to your app's API with the CRON_SECRET.

Replace `https://app.aiagentixdev.com` with your actual domain.
Replace `agentix2026cron` with the value of your `CRON_SECRET` env var.

### 1. Scheduled Campaigns (every 15 minutes)
```
Schedule:  */15 * * * *
Command:   curl -s "https://app.aiagentixdev.com/api/cron/run-scheduled-campaigns?secret=agentix2026cron"
```

### 2. Follow-up Sequences (daily midnight IST = 18:30 UTC)
```
Schedule:  30 18 * * *
Command:   curl -s "https://app.aiagentixdev.com/api/cron/process-follow-up-sequences?secret=agentix2026cron"
```

### 3. Automation Triggers — Birthday + Re-engagement (daily 00:30 IST = 19:00 UTC prev day)
```
Schedule:  0 19 * * *
Command:   curl -s "https://app.aiagentixdev.com/api/cron/automation-triggers?secret=agentix2026cron"
```

### 4. SLA Breach Check (daily 9am IST = 3:30 UTC)
```
Schedule:  30 3 * * *
Command:   curl -s "https://app.aiagentixdev.com/api/cron/check-sla-breaches?secret=agentix2026cron"
```

### 5. Time Triggers / Flow Resume (daily 10am IST = 4:30 UTC)
```
Schedule:  30 4 * * *
Command:   curl -s "https://app.aiagentixdev.com/api/cron/time-triggers?secret=agentix2026cron"
```

### 6. Daily Digest Email (daily 9am IST = 3:30 UTC)
```
Schedule:  30 3 * * *
Command:   curl -s "https://app.aiagentixdev.com/api/cron/daily-digest?secret=agentix2026cron"
```

### 7. Cleanup Flow Sessions (daily 2am IST = 20:30 UTC prev day)
```
Schedule:  30 20 * * *
Command:   curl -s "https://app.aiagentixdev.com/api/cron/cleanup-flow-sessions?secret=agentix2026cron"
```

### 8. Campaign Queue Processor (daily 6am IST = 00:30 UTC)
```
Schedule:  30 0 * * *
Command:   curl -s "https://app.aiagentixdev.com/api/cron/process-campaign-queue?secret=agentix2026cron"
```

---

## Notes
- All times above are in UTC. IST = UTC + 5:30.
- The `CRON_SECRET` env var must match the `?secret=` value in the URL.
- Each cron endpoint also accepts `x-vercel-cron: 1` header (from Vercel) but on Coolify, use the `?secret=` query param.
- `vercel.json` in this repo is kept for reference only — it has no effect on Coolify.
