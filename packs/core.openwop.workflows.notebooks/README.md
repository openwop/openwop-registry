# core.openwop.workflows.notebooks

RFC 0013/0133 workflow-chain pack (4 chains) — Notebooks workflows (summarize, transform, ingest-audio, ingest-youtube), migrated from the deprecated builtins (ADR 0472 P4). chainIds keep the original ids so ignition + replay resolve unchanged; node outputRoles restored at registration.

Source of truth: openwop-app repo, `examples/workflow-chain-packs/notebooks/` (ADR 0472 builtin→chain migration).

Chains:

- `notebooks.summarize` v1.0.0 — notebooks.summarize
- `notebooks.transform` v1.0.0 — notebooks.transform
- `notebooks.ingest-audio` v1.0.0 — notebooks.ingest-audio
- `notebooks.ingest-youtube` v1.0.0 — notebooks.ingest-youtube
