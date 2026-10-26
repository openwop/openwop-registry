# core.openwop.workflows.scheduled-chat-turn

RFC 0013/0133 workflow-chain pack (1 chain) — The scheduled-agent-chat turn workflow (ADR 0125), migrated off the in-tree `registerWorkflow(DEF)` pin site (ADR 0701 / PIN_SITE_QUARANTINE drain). chainId keeps the original workflowId so every existing scheduler job row, run stamp and dispatch keeps resolving. One agent-runner node; the recurring tick supplies agentId/task/conversationId per fire through the run's `configurable`, which `registerChainBackedWorkflow`'s deferred expansion materializes as run-overridable variables (RFC 0124).

Source of truth: openwop-app repo, `examples/workflow-chain-packs/scheduled-chat-turn/`.

Chains:

- `openwop-app.scheduled-chat.turn` v1.0.1 — Scheduled agent chat — one turn
