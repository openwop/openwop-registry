# core.openwop.workflows.knowledge-sync

RFC 0013/0133 workflow-chain pack (1 chain) — The workflow a knowledge-sync source (ADR 0107 / ADR 0605) fires on cadence (WF-KB-3 / KSWF-1). A single node runs one pass — list → diff → fetch+ingest → prune — over the configured Drive/OneDrive folder into the source's bound KB collection, with all the ADR 0605 hardening (pre-run lease, destructive-diff refusal, Tier-2 erasure, subject-scoped prune) behind the WF-KB-4 spend gate. `sourceId` identifies which SyncSource to sync; the per-source scheduler job registered at source creation supplies it automatically — do not bind this chain by hand. This lane replaces the retired knowledgeSyncDaemon, folding the recurring sync onto the ONE host scheduler. Resolves on hosts that ship the knowledge-sync feature + node pack (the OpenWOP reference app).

Source of truth: openwop-app repo, `examples/workflow-chain-packs/knowledge-sync/`.

Chains:

- `knowledge-sync.run` v1.0.1 — Knowledge Sync
