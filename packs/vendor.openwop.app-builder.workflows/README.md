# vendor.openwop.app-builder.workflows

RFC 0013/0133 workflow-chain pack (2 chains) — The App Builder production chains (ADR 0346 / RFC 0013). The design chain is the portable source of truth for `app-builder.design` — the host registers it at boot via the feature's registration adapter (RFC 0124 deferred expansion), and it remains instantiable from the chain gallery like any chain.

Source of truth: openwop-app repo, `examples/workflow-chain-packs/app-builder/` (ADR 0472 builtin→chain migration).

Chains:

- `app-builder.design` v1.3.0 — App design (PRD → research → plan → screens → audit → review)
- `app-builder.repair` v1.0.0 — App repair (governed: candidate → re-audit → review → apply)
