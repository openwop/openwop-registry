# core.openwop.workflows.channel-turn

RFC 0013/0133 workflow-chain pack (1 chain) — The channel agent-turn workflow (ADR 0154 Phase 4), migrated off the in-tree `registerWorkflow(DEF)` pin site (ADR 0703 / PIN_SITE_QUARANTINE drain — instance #3 of the SCWF-1 class, after assistant and scheduled-agent-chats). chainId keeps the original workflowId so every dispatch and run stamp keeps resolving.

Source of truth: openwop-app repo, `examples/workflow-chain-packs/channel-turn/`.

Chains:

- `openwop-app.channel.turn` v1.0.2 — Channel agent turn
