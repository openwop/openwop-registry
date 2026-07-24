# core.openwop.workflows.workflow-author

RFC 0013/0133 workflow-chain pack (1 chain) — The AI workflow-author meta-workflow (draft → validate → persist), migrated from the deprecated builtin `openwop-app.workflow-author` (ADR 0472 P4). chainId keeps the original id so the Create-with-AI route ignition + replay resolve unchanged; also a gallery-editable chain.

Source of truth: openwop-app repo, `examples/workflow-chain-packs/workflow-author/` (ADR 0472 builtin→chain migration).

Chains:

- `openwop-app.workflow-author` v1.0.0 — Author a workflow with AI
