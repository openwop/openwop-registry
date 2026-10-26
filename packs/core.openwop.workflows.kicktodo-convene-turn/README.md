# core.openwop.workflows.kicktodo-convene-turn

RFC 0013/0133 workflow-chain pack (1 chain) — The KickTodo convene turn-workflow (ADR 0442 P5, ADR 0689), migrated off the in-tree `registerWorkflow(DEF)` pin site — the last PRODUCT entry in PIN_SITE_QUARANTINE, drained the way ADR 0701 and ADR 0703 drained the scheduled-chat and channel turns. chainId keeps the original workflowId so every scheduler job and run stamp keeps resolving.

Source of truth: openwop-app repo, `examples/workflow-chain-packs/kicktodo-convene-turn/`.

Chains:

- `openwop-app.kicktodo.convene-turn` v1.0.0 — KickTodo convene turn
