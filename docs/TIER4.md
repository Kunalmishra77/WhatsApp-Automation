# Tier 4 — Advanced AI Features

> **Priority:** MEDIUM — Competitive differentiation
> **Status:** NOT STARTED (Basic AI auto-reply done)

## Current AI State
- OpenRouter API connected (`openai/gpt-oss-120b:free`)
- Auto-reply on every inbound message
- Context: only current message (no history)

---

## 1. AI Escalation Detection

### What
Sentiment analyze karo → frustrated customer detect karo → agent ko alert.

### Implementation
In webhook handler, after AI reply is generated, check sentiment:

```typescript
async function detectEscalation(message: string): Promise<boolean> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    body: JSON.stringify({
      model: process.env.AI_MODEL,
      messages: [{
        role: 'system',
        content: 'Analyze if this message needs human escalation. Reply with only JSON: {"escalate": true/false, "reason": "..."}'
      }, {
        role: 'user', content: message
      }]
    })
  });
  // Parse response, return escalate boolean
}
```

### Trigger Words Also Check
- "complaint", "cheated", "fraud", "refund", "legal", "cancel", "worst", "useless"

### On Escalation
- `conversation.status = 'pending'`
- Create notification for all agents
- Send auto-reply: "I understand your concern. Let me connect you with a senior agent."
- Dashboard shows urgent indicator (red badge)

### Files
- `app/api/webhooks/whatsapp/route.ts` — add `detectEscalation()` call
- `modules/conversations/components/ConversationItem/` — urgency indicator

---

## 2. Smart Suggested Replies

### What
Dashboard mein agent ko 3 AI-generated reply suggestions dikhao.
One click se send.

### How
When agent opens a conversation:
1. Last N messages fetch karo
2. Send to AI: "Suggest 3 short replies"
3. Show as clickable chips above MessageInput

### API
`POST /api/ai/suggest-replies`
```typescript
{
  conversationId: '...',
  // Returns: { suggestions: ['Reply 1', 'Reply 2', 'Reply 3'] }
}
```

### Files
- `app/api/ai/suggest-replies/route.ts` — NEW
- `modules/conversations/components/MessageInput/` — suggestion chips UI

---

## 3. Auto-Categorization

### What
Incoming messages ko AI se automatically tag/categorize karo.
Categories: billing, support, sales, spam, general, complaint, inquiry

### Implementation
After message saved, async call:
```typescript
const category = await categorizeMessage(content);
// Add label to conversation
await supabase.from('conversations').update({
  labels: [...existing_labels, category]
}).eq('id', conversationId);
```

### Files
- `app/api/webhooks/whatsapp/route.ts` — add after message insert

---

## 4. Knowledge Base Bot (RAG)

### What
PDF/URL upload karo → bot usse answers dega.

### Architecture
```
Upload PDF → Extract text → Chunk → Store embeddings in pgvector
Inbound message → Embed query → Find similar chunks → Send to AI with context → Reply
```

### Requirements
- Supabase pgvector extension (enable in Supabase dashboard)
- Embedding model (OpenAI text-embedding-3-small via OpenRouter)

### DB
```sql
CREATE TABLE knowledge_base (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id),
  title        VARCHAR(255),
  content      TEXT,
  embedding    vector(1536),
  source_url   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
```

### Files
- `app/api/knowledge-base/route.ts` — upload + ingest
- `app/api/knowledge-base/search/route.ts` — semantic search
- `modules/settings/` — knowledge base management UI

---

## 5. Multi-language Auto-translate

### What
Customer kisi bhi language mein bole → agent ko English mein dikhao → agent reply karo → customer ko unki language mein jaaye.

### Flow
```
Customer: "हमें अपना ऑर्डर चाहिए" (Hindi)
  → Translate to English for agent: "We want our order"
  → Agent replies in English: "Your order is on its way"
  → Translate back to Hindi: "आपका ऑर्डर रास्ते में है"
  → Send Hindi to customer
```

### API
Use OpenRouter for translation (cheap, fast).

### Files
- `app/api/ai/translate/route.ts`
- Webhook: auto-detect language, store in `contacts.language`
- MessageBubble: show original + translated toggle
