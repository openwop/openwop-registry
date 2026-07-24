# vendor.openwop-app.workflows.cms

RFC 0013/0133 workflow-chain pack (1 chain) — CMS content workflows (RFC 0013 / ADR 0204 C6) — chains over the feature.cms.nodes governed verbs. `cms.localize-and-submit` translates ONE draft section into a target locale and submits the page for editorial review: read the draft section, AI-translate its base data (structure-preserving), store the overlay on the draft (sanitized like an editor save), then submit — the SAME approval-gate composition as the editor UI, so when `cms-approval-gate` is ON the run ends at a human ApprovalsInbox row. There is deliberately NO publish step: a node can draft and submit, never publish (the Phase-C architecture ruling). All tenant/org/page values are run parameters (replay-deterministic).

Source of truth: openwop-app repo, `examples/workflow-chain-packs/cms-localization/`.

Chains:

- `cms.localize-and-submit` v1.0.0 — Localize a draft section & submit for review
