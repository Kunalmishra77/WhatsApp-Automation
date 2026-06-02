# Phase 3: Chats / Inbox Page

**Goal:** 3-pane WhatsApp-style inbox — conversation list (left) | message thread (center) | contact details + actions (right).

**APIs used (all existing):**
- GET /api/sessions?client_id&filter
- GET /api/sessions/:id?client_id  (messages)
- POST /api/sessions/:id/reply     (send message)
- POST /api/sessions/:id/pause     (pause bot)
- POST /api/sessions/:id/resume    (resume bot)
- POST /api/sessions/:id/note      (internal note)
- POST /api/sessions/:id/assign    (assign agent)
- POST /api/chats/summarize        (AI summary)
- GET /api/contacts?client_id
- GET /api/team?client_id
