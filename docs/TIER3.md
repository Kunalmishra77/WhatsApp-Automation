# Tier 3 — CRM & Sales Automation

> **Priority:** MEDIUM — Revenue generation features
> **Status:** NOT STARTED (CRM Pipeline basic UI exists)

---

## 1. Full Deal Pipeline (Enhanced Kanban)

### Current State
Basic Kanban exists in `modules/crm/`. Needs full functionality.

### Add
- Drag-drop between stages (react-dnd or @dnd-kit)
- Deal value tracking
- Due date + reminders
- Filter by agent, tag, value range
- Deal detail modal (full history, notes, attached conversation)

### DB
`leads` table already has: `stage`, `value`, `currency`, `priority`, `follow_up_at`, `notes`

### Files
- `modules/crm/components/PipelineBoard/` — enhance with drag-drop
- `modules/crm/components/DealModal/` — NEW detail view

---

## 2. Follow-up Reminders / Drip Sequences

### What
"Agar X din mein reply nahi aaya toh automatically follow-up bhejo"

### DB Table
```sql
CREATE TABLE follow_up_sequences (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id),
  name         VARCHAR(255),
  steps        JSONB DEFAULT '[]',
  -- steps: [{ delay_hours: 24, template_id: '...', message: '...' }]
  is_active    BOOLEAN DEFAULT true
);

CREATE TABLE contact_sequences (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id  UUID REFERENCES follow_up_sequences(id),
  contact_id   UUID REFERENCES contacts(id),
  current_step INTEGER DEFAULT 0,
  next_send_at TIMESTAMPTZ,
  status       VARCHAR(20) DEFAULT 'active' -- active, paused, completed, cancelled
);
```

### Execution
Cron job (same as broadcast scheduler) checks `contact_sequences` where `next_send_at <= NOW()`.

---

## 3. Product Catalog Integration

### What
WhatsApp native catalog — product details directly in chat.

### How
Meta Catalog API:
```
POST /api/messages/catalog
{
  conversationId: '...',
  catalogId: '...',
  productId: '...'
}
```

### WhatsApp Format
```json
{
  "type": "interactive",
  "interactive": {
    "type": "product",
    "action": {
      "catalog_id": "...",
      "product_retailer_id": "..."
    }
  }
}
```

### Files
- `app/api/catalog/route.ts` — sync from Meta catalog
- `modules/conversations/components/MessageInput/` — Add "Send Product" option

---

## 4. Order Status Bot

### What
User sends order ID → bot auto-fetches status from external system → replies.

### Integration
Webhook from e-commerce platform (Shopify/WooCommerce) OR manual order entry.

### Flow
```
User: "Order 12345 status?"
→ Bot detects order ID pattern
→ Calls /api/orders/status?orderId=12345
→ Returns status from DB or external API
→ Replies: "Your order 12345 is out for delivery. Expected: June 5"
```

### Files
- `app/api/orders/route.ts` — order management
- `database/migrations/004_orders.sql`
- Webhook handler: detect order ID pattern in message

---

## 5. Payment Link Auto-send

### What
Razorpay/Stripe payment link generate karo aur conversation mein send karo.

### Integration
Razorpay API:
```typescript
// Create payment link
POST https://api.razorpay.com/v1/payment_links
{
  amount: 50000, // in paise
  currency: "INR",
  description: "V4TOU Tech Service",
  customer: { name, contact, email }
}
// Returns: short_url
```

### Files
- `app/api/payments/create-link/route.ts`
- `modules/conversations/components/MessageInput/` — "Send Payment Link" button
- Settings → Razorpay API key storage
