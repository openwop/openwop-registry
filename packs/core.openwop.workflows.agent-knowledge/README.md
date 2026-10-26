# core.openwop.workflows.agent-knowledge

RFC 0013/0133 workflow-chain pack (1 chain) — WF-KB-1 — the ADR 0038 §B auto-ingest workflow, migrated off the in-tree `registerWorkflow({...})` pin site in features/agent-knowledge/feature.ts. A trigger (webhook/email/form, RFC 0099) ignites this chain; the single `feature.agent-knowledge.nodes.ingest` node writes an UNTRUSTED, cited KB document into a collection bound to the agent. Registered chain-backed under the ORIGINAL id `feature.agent-knowledge.auto-ingest`, so the seeded demo trigger subscription keeps resolving and replay is unchanged — and it is now gallery-visible and builder-editable like every other chain.

Source of truth: openwop-app repo, `examples/workflow-chain-packs/agent-knowledge/`.

Chains:

- `feature.agent-knowledge.auto-ingest` v1.0.1 — Agent knowledge — auto-ingest a triggered document
