# Tier 2 — Business Intelligence

> **Priority:** MEDIUM-HIGH — Data-driven decisions, retention
> **Status:** NOT STARTED

---

## 1. Analytics Dashboard (Enhanced)

### What
Real metrics replace karo current placeholder ke saath:
- Messages sent/delivered/read per day (line chart)
- Response time average (bar chart)
- Bot vs agent message ratio (pie chart)
- Peak hours heatmap
- Top contacted contacts

### Data Sources
All from existing `messages` table:
```sql
-- Delivery rate
SELECT 
  DATE(created_at) as date,
  COUNT(*) as sent,
  COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
  COUNT(*) FILTER (WHERE status = 'read') as read_count
FROM messages
WHERE workspace_id = $1 AND direction = 'outbound'
GROUP BY date ORDER BY date DESC LIMIT 30;

-- Response time (avg time between inbound and next outbound)
-- Bot vs human (sender_type = 'bot' vs 'agent')
```

### Library
`recharts` — already likely in package.json, or add it.

### API Route
`GET /api/analytics/overview?from=&to=&workspaceId=`

### Files
- `app/api/analytics/overview/route.ts` — NEW
- `modules/analytics/` — UPDATE existing page with real charts

---

## 2. CSAT / Feedback Collection

### What
Conversation resolve karne ke baad auto-send CSAT template:
"How was your experience? Rate us: ⭐ Poor / ⭐⭐ OK / ⭐⭐⭐ Great"

### Flow
1. Agent marks conversation as "Resolved"
2. Auto-send CSAT template (approved interactive message or template)
3. Contact replies with rating
4. Store in `csat_responses` table
5. Show aggregate score in Analytics

### DB Table
```sql
CREATE TABLE csat_responses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID REFERENCES workspaces(id),
  conversation_id UUID REFERENCES conversations(id),
  contact_id      UUID REFERENCES contacts(id),
  agent_id        UUID REFERENCES profiles(id),
  score           INTEGER CHECK (score BETWEEN 1 AND 5),
  comment         TEXT,
  responded_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### Files
- `app/api/conversations/[id]/resolve/route.ts` — trigger CSAT send
- `app/api/csat/route.ts` — store response
- Webhook handler update — detect CSAT reply (match conversation context)

---

## 3. Agent Performance Reports

### Metrics
- Average first response time per agent
- Conversations resolved per day
- CSAT score per agent
- Active hours

### API
`GET /api/analytics/agents?from=&to=`

### UI
Table in Analytics page with sortable columns + export CSV.

---

## 4. Contact Lifecycle Tracking

### What
Visual timeline of contact's journey:
- First message → Lead created → Follow-up sent → Converted / Lost

### Implementation
`activities` table already exists. Log events there:
```typescript
// On each significant event:
await supabase.from('activities').insert({
  workspace_id,
  contact_id,
  type: 'message_received' | 'lead_created' | 'campaign_sent' | 'status_changed',
  description: '...',
  metadata: {}
})
```

### UI
Timeline component in CustomerPanel / ContactDetail.

---

## 5. Custom Reports + CSV Export

### What
- Filter by: date range, agent, tag, channel, status
- Download as CSV

### API
`GET /api/reports/export?type=conversations|messages|contacts&from=&to=`

Response: CSV file download (Content-Type: text/csv)

### Files
- `app/api/reports/export/route.ts` — NEW (streaming CSV response)
- Analytics page mein "Export" button add karo
