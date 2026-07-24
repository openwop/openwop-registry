# core.openwop.workflows.destination-sync

RFC 0013/0133 workflow-chain pack (1 chain) — CDP → peer-OpenWOP-host onward-sync (ADR 0289/RFC 0128), migrated from the deprecated builtin (ADR 0472 P4). chainId keeps the original id; peerIngestUrl resolves at runtime via the http node config template.

Source of truth: openwop-app repo, `examples/workflow-chain-packs/destination-sync/` (ADR 0472 builtin→chain migration).

Chains:

- `openwop-app.cdp.sync-to-openwop-host` v1.0.0 — Sync CDP records to a peer host
