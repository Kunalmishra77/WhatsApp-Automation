# V4You sales assistant — knowledge base

What the bot talking to **gym owners** needs to know. V4You sells gym software; this bot
answers the owner who messages to ask about it, whatever brought him.

**What is being sold is the software.** The documents below describe what it does for a gym
— members, fees, reminders, attendance — because those are its features. They are not a
gym's own rules. When an owner asks "kitne ka hai", the answer is the price of the software,
never a gym's membership fee.

Not to be confused with `bot-knowledge-base.md` in this folder, which is the **member-facing**
assistant that sits inside a gym after it buys. Different bot, different reader.

---

## 0. The job, and its limits

This bot does **one** thing: answer a gym owner's first questions well enough that he agrees
to a demo. It does not sell, quote or negotiate.

Three rules it must be given, in its own instructions:

1. **Quote only the two prices in Document 7, exactly.** ₹1,999 a month plus GST, or
   ₹30,000 once. Never invent a discount, a package or a per-member rate — a number made up
   here is one you have to honour or retract, and either is worse than "let me check".
2. **Never promise a feature that is not in section 2.** A gym owner who is told there is a
   member app will ask for it on the demo call, and the call ends there.
3. **Hand over early.** Anything about money, timelines, contracts or "can it also do…" goes
   to a person. The bot's success is a booked demo, not a long conversation.

**The ask, every time:** *"आपके जिम के हिसाब से दिखा देते हैं — कब बात कर सकते हैं?"*

---

## 1. Settle these first

The bot will be asked all three in its first week. Decide them before it is live.

| Question | Status |
|---|---|
| **What is the product called?** | **GymKhata.** Not Max Register or Max Fitness Platform — those belong to the first customer and are never said to a prospect. |
| **What does it cost?** | **Settled.** ₹1,999/month + GST, or ₹30,000 one-time. In Document 7. |
| **How long does setting up take?** | **Settled: within a week.** Each gym is set up by hand, and that is what the first one took. |

---

## 2. The documents

Paste one at a time. **Order matters** if your assistant truncates — most-asked first.

### Document 1 — What this is

> **Title:** What this is
>
> GymKhata is software for running a gym, made by V4You.
>
> It does four things. It sends your members WhatsApp reminders before their fees are due,
> so renewals stop getting missed. It gives you one screen showing who came today, whose
> fees are pending and how much came in this month. It marks attendance automatically using
> the member's face, on an ordinary mobile — no turnstile and no new machine. And it lets
> new members fill their own details from a QR code, so your staff only have to approve.
>
> It is in Hindi, with English available, and it is built for a mobile.
>
> It is already running at a gym in Indirapuram, Ghaziabad.

### Document 2 — Reminders and renewals

> **Title:** Reminders and renewals
>
> GymKhata messages a member on WhatsApp before their fees are due — 7 days before, 3
> days, 2 days, 1 day, and on the day itself. If they still have not paid, it follows up for
> up to a week afterwards. You set how many days.
>
> Messages only go between 8 am and 9 pm, and there is a limit per number per day, so a
> family sharing one phone is not flooded.
>
> If a member pays, the reminders stop immediately. If a member asks to stop, they stop and
> stay stopped.
>
> Whoever does not respond appears on your call list the next morning, with the reason they
> are on it and what was said the last time you called.
>
> These are official WhatsApp Business messages on approved templates, not a personal number
> sending bulk messages.

### Document 3 — What you can see

> **Title:** What you can see
>
> One screen shows: how many members you have, who came in today, whose fees are due this
> week, whose have already lapsed, how much money came in this month compared to last month,
> and whatever is waiting for your approval.
>
> Members: search by name, number or code. Each member has their plan, their payments, their
> attendance and their ID on file.
>
> Attendance: a month calendar, or any week, month, year or dates you choose. With a chart,
> and a download.
>
> Reports: money, new members, renewals, personal training, trials, how many renewed, who
> left, which hours are busiest, which plans sell, and what difference the reminders made.
> Over any period you choose, and downloadable.
>
> Enquiries: every enquiry, where it came from, and how many of them became members.
>
> There is also a record of who changed what and when.

### Document 4 — Attendance

> **Title:** Attendance
>
> A mobile or tablet kept at your reception counter recognises the member's face and marks
> their attendance. Nothing to press, nothing to carry.
>
> You do not need a turnstile, a fingerprint machine or any new hardware. An ordinary
> Android phone is enough, and you buy it yourself — we will tell you what to look for.
>
> If a face does not read — a cap, poor light — the member types their number on a keypad
> instead.
>
> A member who does not want face attendance can refuse, and your staff mark them by hand.
> Face data is stored encrypted and is deleted when a member leaves.

### Document 5 — New members and payments

> **Title:** New members and payments
>
> You put a QR code at your reception. A new member scans it and fills in their own details
> on their own phone — name, number, photo and ID. Your staff only have to approve it.
>
> The ID photograph is checked automatically: that it is the card they said it was, and that
> the name and date of birth match what they typed. The ID number itself is never stored.
>
> The same face cannot join twice under a different name.
>
> Members can pay by UPI, card or netbanking, or in cash at your desk. Cash is recorded too.
> Receipts are numbered and sent on WhatsApp.
>
> If you want, fees can be collected automatically every month through a UPI mandate.
>
> You also get a website for your gym, where people can find you and sign up.

### Document 6 — Getting started

> **Title:** Getting started
>
> We set your gym up for you, usually within a week.
>
> What we need from you: your gym's details and timings, your plans and prices, and a mobile
> number for the WhatsApp messages.
>
> If you already have a register or an Excel sheet of members, we import it — you do not
> start from an empty list.
>
> WhatsApp messages need Meta's approval first, which usually takes a day or two. We handle
> that, and it happens inside the same week.
>
> The best place to begin is a demo: we show you the whole thing on a call, using a gym's
> worth of real-looking data, and you decide after that.

### Document 7 — Price

> **Title:** Price
>
> There are two ways to take it.
>
> *Monthly — ₹1,999 a month plus GST.* Everything above is included and we run it for you.
> The price is the same whether your gym has fifty members or five hundred.
>
> *One-time — ₹30,000 once.* We build the whole thing for your gym, set up for your plans,
> your prices and your branding, and it is yours. No monthly fee to us after that.
>
> Most gyms start monthly, because there is nothing large to pay up front and you see it
> working with your own members first.
>
> Two things are not included, in either plan.
>
> *WhatsApp's own charge.* Meta charges for the messages, not us. A renewal reminder costs
> about 6 paise. A gym with 300 members sending five reminders a month spends under ₹100 on
> it. When a member replies to you, that costs nothing at all.
>
> *The reception phone for face attendance.* Any ordinary Android phone works and you buy
> it yourself — we will tell you what to look for.
>
> On the one-time plan, hosting the system and any changes you want later are yours to
> arrange. On the monthly plan we handle both.
>
> There is nothing to pay to see the demo.

*Two things the bot must not do with this document:*

- *Do not break the price down per member or per feature.* It is one price for the whole
  system. An owner who is quoted "per member" will ask for a cheaper tier that does not
  exist.
- *Do not confuse this with a gym's own membership fees.* When an owner asks "membership
  kitne ki hai", he is asking what the software costs: ₹1,999 a month.

### Document 8 — What it does not do

> **Title:** What it does not do
>
> There is no separate mobile app for members. Members get WhatsApp messages and a web page.
>
> There is no class or slot booking.
>
> It does not connect to a turnstile or a gate.
>
> It runs one gym at a time. If you have more than one branch, each is set up separately —
> tell us and we will explain how that works for you.
>
> It does not produce GST invoices.
>
> If you need any of these, say so and we will tell you honestly whether it is coming.

### Document 9 — Is my data safe

> **Title:** Is my data safe
>
> Your members' data is yours. It is kept on servers in India, and each gym's data is
> separated at the database level.
>
> We never store an ID card number — only the photograph, and only while it is needed.
>
> Face data is encrypted, is never shared, and is deleted when a member leaves your gym.
>
> Members are told what is collected and can refuse face attendance.
>
> You can export your members at any time.

### Document 10 — Who we are

> **Title:** Who we are
>
> We are V4You. We built this for a gym in Indirapuram, Ghaziabad that has been running
> since 2000, and it is in use there every day.
>
> We are not a large company and you will deal with the people who built it.

---

## 3. Deliberately not written down

The bot escalates on each of these, which is the right answer.

| Asked | Why a person takes it |
|---|---|
| "Can I get it cheaper / is there a discount?" | Discounts are a person's call, never the bot's. The two prices are fixed. |
| "Can you add X?" | A roadmap promise is a commitment. A person makes those. |
| "Can I see it?" | Book it with a person — that is the whole point of the bot. |
| "Do you have a contract / refund policy?" | Not written yet. |
| "Can it run my 3 branches?" | Depends on their setup, and the honest answer today is "separately". A person explains it. |
| "Who else uses it?" | One gym. Say that on a call, with the owner's permission, or not at all. One honest reference beats a vague "several gyms". |

---

## 4. Settings for this bot

- **Name:** GymKhata — so the lead knows who answered.
- **How to sound:** *"Brief and straightforward, like someone who builds the thing. Short
  sentences. Never pushy. Always offer to show it rather than describe it."*
- **Languages:** Hindi and English, replying in whichever was used.
- **On escalation:** *"मैं अभी किसी को बोलता हूँ, वो आपको थोड़ी देर में मैसेज करेंगे।"*

---

## 5. After it is live

Read every conversation for the first two weeks. Two things to look for:

- **The same question escalating repeatedly** — that is a document waiting to be written,
  or a decision V4You has not made yet. Usually the second.
- **A lead who asked a good question and went quiet** — usually something promised before
  the conversation that the product does not do. Fix whatever made the promise, not the bot.

Review the whole set whenever the product changes, and whenever the price does.

---

# Appendix — checked against the product, 2026-10-28

Added when this replaced the earlier draft. Every factual claim above was read back from
`E:\max-fitness` rather than taken on trust, because the bot will repeat them to buyers.

| Claim | Found in the product |
|---|---|
| Reminders at 7, 3, 2, 1 days, the day itself, then a week after | Rule codes `PRE_7` `PRE_3` `PRE_2` `PRE_1` `DUE_TODAY` `POST` (`POST` spans +1 to +7) ✅ |
| Messages only between 8 am and 9 pm | `DEFAULT_QUIET_HOURS` = 08:00–21:00, and sending outside it raises `QUIET_HOURS_VIOLATION` ✅ |
| The ID number itself is never stored | The schema says so on the column: *"The number itself is never stored (ADR-074)"* ✅ |
| It does not produce GST invoices | Nothing in the codebase does GST, HSN or tax invoicing ✅ |
| It runs one gym at a time | No gym switcher and no multi-gym login ✅ |

One thing worth knowing, because a buyer with three branches will push on it: the database
*is* built multi-tenant — `gymId` appears on 35 of the 38 models. So "one gym at a time" is
true of how it is deployed today, not a limit in the data model. Document 8 is right to say
it plainly, and whoever takes that call can say honestly that serving several branches from
one system is a deployment decision rather than a rebuild.

### The price, and why it is written the way it is

₹1,999/month + GST and ₹30,000 one-time are set, so the bot quotes them. An earlier draft
told it never to quote and to collect a member count instead — wrong for this product. The
price does not vary by gym size, and an owner who asks "kitna?" and is told "we will come
back to you" often does not come back.

Two failure modes the wording guards against, both easy to walk into:

- **Quoting per member.** The price is for the whole system at any size. Break it down and
  the next question is for a smaller tier, which does not exist.
- **Answering with a gym's membership fee.** This product manages memberships, so the word
  appears throughout these documents as a feature. When an *owner* asks what membership
  costs, he means the software. Document 7 says so explicitly, because the bot has every
  other document telling it about member fees and would otherwise reach for the wrong one.

What each price excludes is now settled and written into Document 7, rather than left for
a person: Meta's message charge, the reception phone, and — on the one-time plan — hosting
and later changes.

Saying so plainly is better than burying it. The 6-paise figure is not an estimate; it is
V4You's own billed rate for utility conversations, read from 60 days of Meta invoices. At
that rate a 300-member gym spends under ₹100 a month on reminders, and a member's reply
costs nothing, because inbound service conversations are free. An owner who hears "extra
charges" braces for a bill; an owner who hears "about ₹100 a month, and replies are free"
stops worrying. The same honesty that avoids an argument later also sells better here.

Marketing templates are a different matter — those bill at about ₹0.86 each, fourteen times
a reminder. If GymKhata ever sends promotional blasts on a gym's behalf, that cost needs
quoting separately, and this document would be wrong as written.
