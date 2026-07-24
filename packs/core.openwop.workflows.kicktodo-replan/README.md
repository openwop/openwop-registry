# core.openwop.workflows.kicktodo-replan

RFC 0013/0133 workflow-chain pack (1 chain) — Participant-replan workflow (ADR 0459/0463), migrated from the deprecated builtin (ADR 0472 P4). chainId keeps the original id; the falsy reject-safe barrier rides RFC 0134.

Source of truth: openwop-app repo, `examples/workflow-chain-packs/kicktodo-replan/` (ADR 0472 builtin→chain migration).

Chains:

- `openwop-app.kicktodo.replan` v1.0.0 — Replan a participant's plan
