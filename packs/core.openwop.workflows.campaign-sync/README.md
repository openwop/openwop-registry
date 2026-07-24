# core.openwop.workflows.campaign-sync

RFC 0013/0133 workflow-chain pack (2 chains) — Campaign Studio metrics-sync chain (RFC 0013; campaign gap plan C2 on ADR 0159). Pulls yesterday's ad metrics for every dispatched campaign through the acting user's platform connection (ctx.ads, window-scoped so rows never double-count) into the unified performance store, then delivers a short sync summary as a notification. Schedule it daily on the ONE scheduler, or run it ad hoc — the 15-minute cooldown makes overlapping fires harmless. Also carries the daily budget-pacing check (ADR 0220).

Source of truth: openwop-app repo, `examples/workflow-chain-packs/campaign-sync/` (ADR 0472 builtin→chain migration).

Chains:

- `campaign-sync.daily-metrics` v1.0.0 — Daily Ad-Metrics Sync
- `campaign-sync.pacing-check` v1.0.0 — Daily Budget Pacing Check
