# core.openwop.workflows.slides-design

RFC 0013/0133 workflow-chain pack (1 chain) — The slides design workflow (outline → gate → draft → deepen → notes → audit → review), migrated from the deprecated builtin `slides.design` (ADR 0472 P4). Explicit port dataflow + two HITL approval gates (ordering, not conditional). chainId keeps the original id so ignition + replay resolve unchanged; also a gallery-editable chain.

Source of truth: openwop-app repo, `examples/workflow-chain-packs/slides-design/` (ADR 0472 builtin→chain migration).

Chains:

- `slides.design` v1.0.0 — Design a slide deck
