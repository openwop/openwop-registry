# core.openwop.workflows.assistant

RFC 0013/0133 workflow-chain pack (6 chains) — WF-COS-1 — the ADR 0023 assistant's six boot-path workflows, migrated off the in-tree `registerWorkflow({...})` pin sites in `features/assistant/loops.ts` and `features/assistant/actionExecution.ts`. THREE PERCEPTION LOOPS (calendar ingest, drive ingest, morning briefing) fired by the RFC 0052 scheduler, and THREE APPROVED-ACTION EXECUTIONS (email send, calendar invite, calendar reschedule) dispatched by the winning approval claim. Each is registered chain-backed under its ORIGINAL workflowId, so the per-tenant scheduler job rows, the `EXEC_WORKFLOW_BY_KIND` dispatch and every existing run stamp keep resolving — and all six become gallery-visible and builder-editable like every other chain. NO credential or connection material lives in any node config: the ADR 0024 §4 Option-C opt-in is RUN-LEVEL (`configurable.connections`), set on the scheduler job / at dispatch, exactly as it was before the migration.

Source of truth: openwop-app repo, `examples/workflow-chain-packs/assistant/`.

Chains:

- `assistant.loop.calendar-ingest` v1.0.1 — Assistant — calendar ingestion loop
- `assistant.loop.drive-ingest` v1.0.1 — Assistant — drive ingestion loop
- `assistant.loop.morning-briefing` v1.0.1 — Assistant — morning briefing
- `assistant.action.email-send` v1.0.1 — Assistant — send an approved email
- `assistant.action.calendar-invite` v1.0.1 — Assistant — send an approved calendar invite
- `assistant.action.calendar-reschedule` v1.0.1 — Assistant — apply an approved reschedule
