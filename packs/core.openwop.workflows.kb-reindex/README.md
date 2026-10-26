# core.openwop.workflows.kb-reindex

RFC 0013/0133 workflow-chain pack (1 chain) — The workflow a KB collection's embedding-spec REINDEX (ADR 0398 P3 / ADR 0643 D1b) fires on cadence so the rebuild completes without a browser. One node drains ONE bounded slice — embed the next chunks into the staging namespace, cut over when the staging space is whole — and the host tears the per-collection scheduler job down the moment the job reaches a terminal status (the transient definition is archived while a recorded run replays against it). `orgId`/`collectionId` are supplied by the per-collection job the admin-gated `POST …/reindex` registers; do NOT bind this chain by hand — the surface refuses the node unless a running/paused job already exists AND the executing run is the host-minted `kb.reindex:<tenantId>:<orgId>:<collectionId>` workflow. This lane replaces the SPA's `for (i < 10000) drain()` loop as the DRIVER; the SPA loop stays as the interactive fast path, calling the same route. Resolves on hosts that ship the kb feature + node pack (the OpenWOP reference app).

Source of truth: openwop-app repo, `examples/workflow-chain-packs/kb-reindex/`.

Chains:

- `kb.reindex` v1.0.3 — KB Reindex
