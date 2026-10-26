# core.openwop.workflows.campaign-ops

RFC 0013/0133 workflow-chain pack (2 chains) — Agency campaign operations (ADR 0923): turn an operator's change request into a hashed change set of constrained edits on a client's landing page and email draft, for approval.

Source of truth: openwop-app repo, `examples/workflow-chain-packs/campaign-ops/`.

Chains:

- `campaign-ops.change-request` v1.0.0 — Campaign change request
- `campaign-ops.execute` v1.0.0 — Carry out an approved campaign change
