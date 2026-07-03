# core.openwop.workflows.content

RFC 0013 workflow-chain pack (2 chains) — part of the ADR 0190 evidence-based template catalog. Source of truth: the openwop-app repo, examples/workflow-chain-packs/. Real-work workflow pack (RFC 0013, ADR 0190 Phase 3) — the Content & Monitoring cluster: watch an RSS/Atom feed for new items and watch any web page for changes, each pairing a schedule trigger with durable seen-state in host KV storage (deterministic per-source key; the first run treats everything as new and seeds the state).
