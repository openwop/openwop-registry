# vendor.openwop-app.workflows.claude-code

RFC 0013/0133 workflow-chain pack (1 chain) — Hand a coding task to your own Claude Code from a workflow (ADR 0785). Requires the Claude Code feature and a paired device with workflow tasks allowed.

Source of truth: openwop-app repo, `examples/workflow-chain-packs/claude-code-task/`.

Chains:

- `openwop-app.claude-code.ask` v1.0.0 — Ask Claude Code to make a change
