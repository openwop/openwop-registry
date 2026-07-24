# core.openwop.workflows.insights-suite

RFC 0013/0133 workflow-chain pack (3 chains) — Insights & Drafting meta-workflows as an RFC 0013 chain pack (migrated from the deprecated ADR 0082/0072 builtins, ADR 0472 Phase 2). Three real source→analysis→LLM→draft→notify pipelines over BYOK-connected sources (BigQuery, Workday, chat completion, email-draft, notification-push). chainIds keep the original `openwop-app.insights.*` ids so scheduler/trigger ignition + replay are unchanged; the host registers them chain-backed (resolve-by-id, stable id) AND they are gallery-editable chains. Per-node outputRole (not expressible in the portable fragment) is re-applied at registration via the feature's postProcess.

Source of truth: openwop-app repo, `examples/workflow-chain-packs/insights-suite/` (ADR 0472 builtin→chain migration).

Chains:

- `openwop-app.insights.weekly-variance` v1.0.0 — Weekly variance (Actual vs Plan)
- `openwop-app.insights.anniversary-draft` v1.0.0 — Work-anniversary recognition draft
- `openwop-app.insights.talent-prep` v1.0.0 — Talent readiness prep
