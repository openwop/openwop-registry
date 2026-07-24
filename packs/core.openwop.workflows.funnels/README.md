# core.openwop.workflows.funnels

RFC 0013/0133 workflow-chain pack (1 chain) — Funnel optimization chains (ADR 0294 / Funnel A, Phase 6) — read-only analysis over the funnels feature nodes: per-step stats in, a grounded optimization proposal out. Proposals only: publishing, step edits, and experiment starts remain human actions in the Funnels page.

Source of truth: openwop-app repo, `examples/workflow-chain-packs/funnels/` (ADR 0472 builtin→chain migration).

Chains:

- `funnels.optimize-step` v1.0.0 — Funnel Step Optimization Proposal
