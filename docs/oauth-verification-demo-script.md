# OAuth verification — demo video script and reply

Written for whoever records the video (currently the founder), with the narration
text addressed to Google's reviewer.

Google's reply of 17 Sep 2026 on project `77637202964` asked for three things: a
stronger scope justification, a video covering **every** configured scope, and an
exact match between the scopes the code requests and the scopes in the Cloud
Console. The case has been waiting on our reply since then — it is not in review.

This file holds the shot list, the word-for-word narration, the justification text
and the email reply. Record in one take if possible; a cut is fine between scenes.

---

## Before recording — three things to fix

**1. Scope alignment (Google's complaint (c)).** The code requests three scopes;
the Console has two:

| Scope | Code | Console |
|---|---|---|
| `calendar.events` | yes | yes |
| `adwords` | yes | yes |
| `business.manage` | yes (GBP connect) | **missing** |

Google requires a strict string match. `business.manage` cannot be demonstrated —
the Business Profile API returns quota 0 until that separate application is
approved — so the honest fix is to make the GBP connect button unreachable until
that approval lands, leaving the app genuinely requesting only the two scopes being
verified. Do this before recording, or the mismatch recurs.

**2. The Google Calendar connect button does not exist.** The API route
`/api/integrations/google-calendar/connect` works, but nothing in the UI links to
it. Recording a reviewer-facing video that navigates to a raw API URL looks evasive
and invites another round. Add a **Connect Google Calendar** button to the
**Bookings** page, mirroring what the Google Ads page already does: when the
integration is not connected it shows a short line of explanation and a connect
button. Bookings is the right home for it — that is where the synced appointments
appear, and the green "Google Calendar" badge on each row already lives there.

**3. Recording setup.** Windows: `Win + G` (Game Bar) or OBS. Record the **whole
browser window including the address bar** — Google needs the client ID, which
appears in the consent URL. 1080p. Check the audio before recording six minutes.

---

## Shot list

Total runtime ~6 minutes. Timings are a guide, not a target.

### Scene 0 — Identity (0:00–0:30)

**Screen:** Cloud Console → Google Auth Platform → **Clients**, with the OAuth
client ID visible on screen.

> "This is the verification demo for AI Agentix, Google Cloud project number
> 7-7-6-3-7-2-0-2-9-6-4, project ID agentix-automation. On screen is the OAuth
> client ID this application uses. I will demonstrate every scope this project has
> configured."

### Scene 1 — What the app is, and the least-privilege model (0:30–1:05)

**Screen:** `https://app.aiagentixdev.com` signed in, dashboard visible, address
bar in frame.

> "AI Agentix is a WhatsApp and Instagram customer-communication platform used by
> small businesses in India. It is an integration platform: each business connects
> only the Google services it needs, and each integration requests exactly one
> scope on its own consent screen. A business that uses only Google Ads is never
> asked for calendar access. This project has two scopes configured, and I will
> show the full user-facing feature behind each one."

This answers the invitation in Google's own email to say so if the application is
an integration platform under a least-privilege model. Do not skip it.

### Scene 2 — `calendar.events`: the consent flow (1:05–2:00)

**Screen:** the **Bookings** page, showing the **Connect Google Calendar** button.

> "First scope: calendar dot events. A business owner connects their own Google
> Calendar here, on the page where their appointments live."

Click Connect. Let the account chooser appear. Pick the account.

> "This is the unverified-app screen, which is expected while this verification is
> in progress."

Click **Advanced → Go to AI Agentix**.

**Pause on the consent screen for a full three seconds. Zoom if the text is small.**

> "The consent screen requests one scope only: view and edit events on the user's
> calendars. Nothing else is requested."

Click **Allow**, land back in the app showing Calendar connected.

### Scene 3 — `calendar.events`: the feature, and the effect in the user's account (2:00–3:25)

**Screen:** a real WhatsApp conversation with the business.

> "Here is what that scope is for. A customer messages the business on WhatsApp and
> asks for an appointment."

Send a booking message from the customer phone, e.g. *"Can I book an appointment
for tomorrow at 4 pm?"* Let the assistant reply and confirm.

**Screen:** the app's **Bookings** page; point at the new row and the green
**Google Calendar** badge.

> "The appointment is captured here, and the badge confirms it was written to the
> owner's Google Calendar."

**Screen:** open `calendar.google.com` in the same browser.

> "And here is the same appointment on the owner's own Google Calendar, created by
> the app — the customer's name, phone number and the conversation in the
> description."

Open the event so the detail is readable. **This shot is mandatory** — Google asks
for write permissions to be shown reflected in the user's Google account.

> "We write appointments to the calendar the owner chooses, which defaults to their
> primary calendar, so bookings sit alongside the rest of their day. We never read
> or change events the app did not create."

### Scene 4 — `adwords`: the consent flow (3:25–4:20)

**Screen:** the **Google Ads** page in the app, showing *"Connect your Google Ads
account to see campaigns, spend and conversions here"* and the **Connect Google
Ads** button.

> "Second scope: adwords. A business that advertises on Google connects their own
> Google Ads account here."

Click Connect, choose the account, pass the unverified screen again.

**Pause on the consent screen for three seconds.**

> "Again a single scope is requested. Google Ads publishes only one OAuth scope —
> there is no read-only variant — so this is the narrowest permission available for
> reading campaign performance."

Click **Allow**.

### Scene 5 — `adwords`: the feature (4:20–5:35)

**Screen:** the **Google Ads** page in the app, campaigns loaded.

> "This is the entire use of that scope. We show the owner their own campaign
> performance — campaign name, impressions, clicks, cost and conversions."

Scroll the table slowly so the data is legible.

**Screen:** the **Marketing ROI** page.

> "And here is why they need it: their Google Ads spend next to the WhatsApp leads
> those campaigns produced, so they can see which campaigns actually bring
> customers. The application issues read-only GAQL select queries. It does not
> create, edit, pause or delete campaigns, budgets or any other Google Ads entity,
> and there is no screen in this product that could."

### Scene 6 — Close (5:35–6:00)

**Screen:** the app's sidebar, with the Bookings and Google Ads pages visible.

> "To summarise: calendar dot events writes appointments booked over WhatsApp to the
> owner's own calendar, and adwords reads the owner's own campaign performance to
> report it back to them. Those are the only two scopes this project requests, and
> each is requested separately by the integration that needs it. Thank you for
> reviewing."

---

## Scope justification (paste into Data Access → "How will the scopes be used?")

Under the 1000-character limit.

```
AI Agentix is a WhatsApp/Instagram customer-communication platform for small businesses in India. It is an integration platform: each business connects only the Google services it needs, and each integration requests exactly one scope.

calendar.events: when a customer books an appointment in the business's WhatsApp chat, we create that appointment on the owner's own calendar (default: primary) so it appears alongside their existing schedule. Write access is required to create the event. calendar.app.created is not sufficient because it confines events to a separate app-created calendar, which defeats the purpose of putting bookings in the owner's real schedule. We never read or modify events the app did not create.

adwords: we display the owner's own campaign metrics beside the WhatsApp leads those campaigns produced. We issue read-only GAQL SELECT queries and never create or modify campaigns. Google Ads publishes no read-only scope; adwords is the only one offered.
```

## Email reply

Reply **directly to the 17 Sep thread** from `api-oauth-dev-verification-reply+...@google.com`
— a new email starts a new case and loses the history.

```
Hello,

We have addressed all three items for project 77637202964 (project ID: agentix-automation).

1. Integration platform

AI Agentix is an integration platform offering granular permissions under a least
privilege auth model, as your email invited us to confirm. Each business connects
only the Google services it needs, and each integration requests exactly one scope
on its own consent screen. A business that uses only Google Ads is never asked for
calendar access.

2. Scope discrepancy — resolved

The application now requests exactly the two scopes configured in the Cloud Console:

  https://www.googleapis.com/auth/calendar.events
  https://www.googleapis.com/auth/adwords

3. Scope justification — updated on the Data Access screen

calendar.events: when a customer books an appointment in the business's WhatsApp
chat, we create that appointment on the owner's own calendar (default: primary).
Write access is required to create the event. calendar.app.created is insufficient
because it confines events to a separate app-created calendar, defeating the
purpose of placing bookings in the owner's real schedule. We never read or modify
events the app did not create.

adwords: we display the owner's own campaign metrics beside the WhatsApp leads
those campaigns produced. We issue read-only GAQL SELECT queries and never create
or modify campaigns. Google Ads publishes no read-only scope; adwords is the only
scope offered, so it is the narrowest permission available for this feature.

4. New demo video

<YOUTUBE LINK>

It shows the OAuth client ID, the consent screen for each scope separately, the
full user-facing feature behind each scope, and — for calendar.events, which
writes — the resulting event in the user's own Google Calendar.

Thank you,
AI Agentix
```

---

## After recording

1. Upload to YouTube as **Unlisted** (not Private — reviewers cannot open Private).
2. Paste the link into **Data Access → Demo video → YouTube link**, replacing the
   old one, and update the justification text in the same pass. **Save.**
3. Send the reply above with the same link.

Publishing status stays **In Production** throughout, as Google's email instructs.
