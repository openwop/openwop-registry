# core.openwop.workflows.creative-briefs-reel

RFC 0013/0133 workflow-chain pack (1 chain) — Generate a text-to-video reel from a creative brief (migrated from the deprecated ADR 0411 builtin `openwop-app.creative-briefs-reel`, ADR 0472 Phase 2/4). A single `generate-reel` node — the boundary-clean reel path run through the workflow engine. chainId keeps the original id so the route ignition + replay resolve unchanged; the host registers it chain-backed AND it is a gallery-editable chain.

Source of truth: openwop-app repo, `examples/workflow-chain-packs/creative-briefs-reel/` (ADR 0472 builtin→chain migration).

Chains:

- `openwop-app.creative-briefs-reel` v1.0.0 — Generate a reel
