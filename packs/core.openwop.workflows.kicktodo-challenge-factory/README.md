# core.openwop.workflows.kicktodo-challenge-factory

RFC 0013/0133 workflow-chain pack (2 chains) — The Challenge Factory (ADR 0458) + its lesson-batch child — migrated from the deprecated builtins (ADR 0472 P4, the terminal quarantine step). chainIds keep the original ids; build-0..3 reference lesson-batch via RFC 0133 config.subChainRef (host-default binds it to the shared same-id child); truthy/falsy reject-safe barriers ride RFC 0134; produced vars (plan/evidenceSummary/planBrief) declared per RFC 0133 §2.2.

Source of truth: openwop-app repo, `examples/workflow-chain-packs/kicktodo-challenge-factory/` (ADR 0472 builtin→chain migration).

Chains:

- `openwop-app.kicktodo.challenge-factory` v1.0.0 — Challenge Factory
- `openwop-app.kicktodo.lesson-batch` v1.0.0 — Lesson batch (Challenge Factory child) *(internal — composition-only, RFC 0135)*
