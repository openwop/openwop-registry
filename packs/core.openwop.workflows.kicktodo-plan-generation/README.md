# core.openwop.workflows.kicktodo-plan-generation

RFC 0013/0133 workflow-chain pack (1 chain) — KickTodo plan generation as an RFC 0013 / RFC 0133 chain pack (migrated from the deprecated ADR 0072 builtin `openwop-app.kicktodo.plan-generation`). Generate a validated challenge plan with the run-scoped provider (closed-world validatePlan + one bounded repair inside the node; fails closed on stub providers), then decompose it into a draft. Demonstrates RFC 0133 produced variables: `generate` writes the validated `plan` to the run bag and `decompose` reads it by name — no typed output port, so an explicit edge is not the right shape.

Source of truth: openwop-app repo, `examples/workflow-chain-packs/kicktodo-plan-generation/` (ADR 0472 builtin→chain migration).

Chains:

- `kicktodo.plan-generation` v1.0.0 — Generate a challenge plan
