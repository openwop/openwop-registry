# core.openwop.workflows.campaign-journeys

RFC 0013/0133 workflow-chain pack (3 chains) — Contact-level lifecycle journeys as RFC 0013 chains on the ONE engine (ADR 0222 / campaign gap plan C6) — NOT a journey engine. Trigger with an ADR 0208 host-event binding (e.g. host.crm.contact.created → Welcome Series), guard with the enrollment + eligibility verbs (one run per contact per journey; every send behind consent + suppression), wait with core.flow.wait, send with the existing email node, log with the CRM activity verb. Enrollment state is the run itself — monitor in Runs, reset re-enrollment via the campaign-journeys API.

Source of truth: openwop-app repo, `examples/workflow-chain-packs/campaign-journeys/` (ADR 0472 builtin→chain migration).

Chains:

- `campaign-journeys.welcome-series` v1.0.0 — Welcome Series (2-step)
- `campaign-journeys.re-engage-contact` v1.0.0 — Re-engage a Contact
- `campaign-journeys.segment-winback` v1.0.0 — Segment Winback (per-member fan-out)
