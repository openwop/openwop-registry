# core.openwop.workflows.csm-ops

RFC 0013/0133 workflow-chain pack (2 chains) — CSM↔CRM linkage workflows (ADR 0212, RFC 0013). Where feature.csm.agents.health-insights is read-only, these two chains carry the CSM write surface: computing an Account's healthScore/healthFactors from its linked CRM company's deals/tasks (the scoring recipe as visible, editable workflow configuration rather than buried code — ADR 0212 §3), and a human-gated renewal-risk follow-up over the deal-hygiene shape (ADR 0212 §4 — renewals are deals, not a new entity). All tenant/org-specific values are run parameters (replay-deterministic). Resolves on hosts that ship the feature.crm + feature.csm features + node packs (the OpenWOP reference app).

Source of truth: openwop-app repo, `examples/workflow-chain-packs/csm-ops/` (ADR 0472 builtin→chain migration).

Chains:

- `csm-ops.health-from-crm` v1.0.0 — Compute Health From CRM
- `csm-ops.renewal-risk` v1.0.0 — Renewal Risk Review
