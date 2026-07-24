# core.openwop.workflows.commerce

RFC 0013/0133 workflow-chain pack (3 chains) — Real-work workflow pack (RFC 0013, ADR 0152) — the Commerce operations cluster (ecommerce gap plan §5C C8): Post-Purchase Thank-You, Low-Stock Reorder Draft, and the Order Exception Digest. Designed to bind to the ADR 0221 host events (host.commerce.order.paid, host.commerce.inventory.low-stock — create a host-event binding to enroll; ADR 0208) or the schedule trigger. Every outbound send rides the governed email-send integration node (drafts/approval per the tenant's actionPolicy — ADR 0033) and the ONE notification seam; order data flows through feature.commerce.nodes over ctx.features.commerce, so the ADR 0221 audit rows + spend thresholds apply by construction. Enrollment state = the run itself; a binding fires one run per event.

Source of truth: openwop-app repo, `examples/workflow-chain-packs/commerce/` (ADR 0472 builtin→chain migration).

Chains:

- `commerce.post-purchase-thankyou` v1.0.0 — Post-Purchase Thank-You
- `commerce.low-stock-reorder` v1.0.0 — Low-Stock Reorder Draft
- `commerce.order-exception-digest` v1.0.0 — Order Exception Digest
