# vendor.openwop-app.workflows.strategy

RFC 0013/0133 workflow-chain pack (3 chains) — Strategy operating-rhythm workflows (RFC 0013, ADR 0231). The KR measurement cadence: a weekly check-in nudge that finds measured key results with no recent confirmed check-in and notifies their owners, and a metric-sync pass that refreshes every sourced key result from its configured data owner (CRM deal totals, analytics conversions) through the one governed check-in path. Both are scheduled via the strategy cadence config (GET/PUT /v1/host/openwop-app/strategy/cadence) — no auto-boot jobs. All writes ride ctx.features.strategy.checkIn: agent writes are structurally proposals; sync writes are confirmed only by a human-configured measure.source (fail-closed).

Source of truth: openwop-app repo, `examples/workflow-chain-packs/strategy/`.

Chains:

- `strategy.weekly-checkin` v1.0.0 — Strategy: Weekly Check-in Nudge
- `strategy.board-pack` v1.0.0 — Strategy: Board Pack Pre-read
- `strategy.metric-sync` v1.0.0 — Strategy: Sync Sourced Metrics
