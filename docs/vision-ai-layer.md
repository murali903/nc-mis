# Vision: the AI layer

Parked on 19 Nov 2026, from a conversation between Murali and Claude. Not
scheduled. To be turned into requirements and use cases when Murali asks.

## The idea

IndentFlow should be an AI-era information system, not a traditional MIS that
only matches database entries string to string. It is one of several small
applications that together make up the Navyacon MIS, built in-house instead of
buying an ERP, so that the company can work its own way and change quickly.

The system should not only carry a request from person to person. At each
moment a decision is made, it should put the relevant history in front of the
person deciding, so they judge from facts and not from memory.

## The two moments

**The engineer, before submitting an indent.** For each item being entered:
when it was last ordered for this site, how much, and when it was received.
Prevents duplicate requests and helps them ask for a sensible quantity.

**The approver, before approving.** A side panel showing, per item: the last
indents for a similar item, quantities, dates received, and (once inventory
exists) stock in hand. Zero stock justifies an order; but "fourth order for
cutting wheels this month" should make the approver ask whether they are being
used, wasted or lost. The system raises the eyebrow; the person makes the call.

## Principles agreed

1. **People write in their own words.** No forcing site staff to pick from a
   rigid list of item codes. The system understands "4 inch cutting disc",
   "CW-4" and "cutting wheel 100mm" as the same thing.
2. **The LLM interprets; the database remembers.** The model decides once, at
   entry, which material a line refers to, and the user confirms with one tap.
   From then on counting and history are plain database arithmetic: instant,
   repeatable, auditable.
3. **Nothing from thin air.** Every figure the model mentions was computed from
   records, and every claim can be traced to them.
4. **The LLM returns at the end to explain.** Given solid numbers, it writes the
   sentence the approver reads.
5. **The AI advises and never blocks.** It can say "this looks unusual"; it
   never approves or refuses. Authority stays with people in the reporting line.

(Principle 5 was proposed by Claude and not yet explicitly confirmed by Murali.)

## How the data must be arranged

- A material catalogue curated by the AI: one entry per real item, with every
  name people have used for it, its unit and its category (consumable, bulk,
  tool, hire).
- Every indent line, PO line and receipt linked to a catalogue entry, keeping
  the user's original words alongside.
- Facts as numbers and dates, never buried in text: quantity, unit, site, date
  ordered, date received, rate, vendor.
- A record of every AI judgment: what it was shown, what it proposed, whether
  the person accepted or corrected it.
- The event log as the trigger: "indent submitted" is the moment the approver's
  panel is prepared.

## Open questions

- Compare within the site only, or across sites ("the other site of the same
  size uses half as many")?
- Consumables only, or bulk materials too, where the useful comparison is
  against the BOQ quantity and not last month's orders?
- Which model, hosted where, and what it costs per indent.
- What the system does when the model is unavailable (it must still work).

## Where this fits

Depends on version 2 (`v2/docs/design.md`): the application server is where the
model calls live, and the catalogue replaces `core.site_materials` as the item
reference. Team feedback of 19 Nov points the same way: "indent can be anything
but PO should be more structured, part of a product catalogue".
