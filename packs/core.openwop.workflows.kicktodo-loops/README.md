# core.openwop.workflows.kicktodo-loops

RFC 0013/0133 workflow-chain pack (3 chains) — KickTodo enrollment + scheduled loops (enrollment, daily-loop, reminder-loop), migrated from the deprecated builtins (ADR 0472 P4). chainIds keep the original ids so scheduler-continuation ignition + replay resolve unchanged. Enrollment demonstrates RFC 0133 produced variables: `enroll` writes `enrollmentId` to the bag, `materialize` reads it.

Source of truth: openwop-app repo, `examples/workflow-chain-packs/kicktodo-loops/` (ADR 0472 builtin→chain migration).

Chains:

- `openwop-app.kicktodo.enrollment` v1.0.0 — Enroll in a challenge
- `openwop-app.kicktodo.daily-loop` v1.0.0 — Daily checkpoint
- `openwop-app.kicktodo.reminder-loop` v1.0.0 — Reminder checkpoint
