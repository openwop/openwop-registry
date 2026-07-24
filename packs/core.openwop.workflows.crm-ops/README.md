# core.openwop.workflows.crm-ops

RFC 0013/0133 workflow-chain pack (3 chains) — Governed CRM write-verb workflows (RFC 0013, ADR 0208 §2, ADR 0252). Where feature.crm.agents.sales-ops is read-mostly (plus two assistive writes), these chains carry the riskier CRM mutations — owner assignment off a new-lead event, stale-deal follow-up, and the scheduler-fired Gmail inbox sync — with a human in the loop where the ADR calls for one. All tenant-specific values are run parameters (replay-deterministic). Resolves on hosts that ship the feature.crm feature + node pack (the OpenWOP reference app).

Source of truth: openwop-app repo, `examples/workflow-chain-packs/crm-ops/` (ADR 0472 builtin→chain migration).

Chains:

- `crm-ops.route-new-lead` v1.0.0 — Route New Lead
- `crm-ops.deal-hygiene` v1.0.0 — Deal Hygiene Sweep
- `crm-ops.gmail-sync` v1.0.0 — Gmail Inbox Sync
