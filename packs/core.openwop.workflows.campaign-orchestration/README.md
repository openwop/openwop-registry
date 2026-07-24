# core.openwop.workflows.campaign-orchestration

RFC 0013/0133 workflow-chain pack (1 chain) — Campaign Studio orchestration spine (ADR 0158/RFC 0118), parallel channel fan-out shape — migrated from the deprecated builtin (ADR 0472 P4). chainId keeps the original id; the 5 channel children resolve by id at runtime via core.dispatch.

Source of truth: openwop-app repo, `examples/workflow-chain-packs/campaign-orchestration/` (ADR 0472 builtin→chain migration).

Chains:

- `campaign-studio.campaign-orchestration` v1.0.0 — Campaign orchestration
