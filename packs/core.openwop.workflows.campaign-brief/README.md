# core.openwop.workflows.campaign-brief

RFC 0013/0133 workflow-chain pack (2 chains) — Campaign-brief messaging-kernel + market-intel workflows, migrated from the deprecated builtins (ADR 0472 P4). chainIds keep the original ids; outputRoles restored at registration.

Source of truth: openwop-app repo, `examples/workflow-chain-packs/campaign-brief/` (ADR 0472 builtin→chain migration).

Chains:

- `campaign-studio.messaging-kernel` v1.0.0 — Messaging kernel
- `campaign-studio.market-intel` v1.0.0 — Market intelligence
