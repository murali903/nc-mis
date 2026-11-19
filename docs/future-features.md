# Future features

Ideas raised and parked, to pick from later. Proposed 19 Nov 2026 after the full
test pass; Murali chose to build only "Share PO on WhatsApp" for now. Sizes are
rough: small = an afternoon, medium = a day or two.

## Parked from the 19 Nov proposal

| # | Feature | What it solves | Size | Notes |
|---|---|---|---|---|
| 1 | **"Ordered recently" notice** on the indent form and for the approver: last orders of the same item at that site, quantity, received or not | Duplicate requests; unusual consumption (the cutting-wheels question) | Medium | Plain text matching first; the real version is the AI layer in `vision-ai-layer.md` |
| 2 | **Waiting-time flags and reminders**: "with you for 3 days" on lists; a nudge when an indent or PO sits too long | Records silently stuck with one person | Small | Needs a scheduled job for the nudges; the flags alone need none |
| 3 | **Overdue deliveries**: POs past their delivery date and not fully received, highlighted for procurement and the storekeeper | Nobody chasing late vendors | Small | |
| 4 | **Rate check on PO**: last three rates paid for the item, with vendor and date; a warning when the new rate is well above | Overpaying; gives the approver a basis | Small | "Last rate" already shows on the create-PO screen |
| 5 | **Vendor scorecard**: on-time deliveries, damaged or rejected receipts, shown when choosing a vendor | Repeat orders to poor vendors | Medium | Data is already in the GRNs |
| 7 | **Camera on phone**: photo buttons open the camera directly | Bill and delivery photos at site | Small | |
| 8 | **Download to Excel** on every list | Reports without asking for them | Small | |
| 9 | **BOQ check**: quantity indented so far against the BOQ quantity; warning when an indent would exceed it | Ordering beyond the estimate unnoticed | Medium | Depends on how complete the BOQ data is |
| 10 | **Urgency report**: share of urgent and short-notice indents per site and engineer | "Not everything should be urgent" (team session, 19 Nov) | Small | |

Suggested first batch when the time comes: 2, 3, 4, 7, 8.

## From the team session of 19 Nov, not yet built

| Feature | Where it is planned |
|---|---|
| One indent split across several POs; unordered items visible to procurement | Version 2 |
| Item-wise approve or escalate (PM accepts some items, sends others up) | Version 2 |
| PO rates hidden from site staff | Version 2 |
| Procurement remarks on an indent before raising a PO | Not scheduled |
| Invoice upload on a goods receipt (beyond the photo) | Not scheduled |
| Excess stock at another site flagged before buying | Inventory module |
| PO sent to the vendor automatically on issue (email) | Version 2 server |

## Larger pieces, documented elsewhere

- Version 2 rebuild: `v2/docs/design.md`
- The AI layer: `docs/vision-ai-layer.md`
- Going to production: `docs/production-roadmap.md`
- Architecture for scale: `docs/architecture-for-scale.md`

## Built

| Feature | When |
|---|---|
| Share PO on WhatsApp (item 6 of the proposal) | 19 Nov 2026 |
| Local and emergency purchases without an indent | 19 Nov 2026 |
| PO without an indent, linked later | 19 Nov 2026 |
| PO on the company letterhead, with terms | 19 Nov 2026 |
