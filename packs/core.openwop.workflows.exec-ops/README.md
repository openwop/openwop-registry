# core.openwop.workflows.exec-ops

RFC 0013 workflow-chain pack — the ADR 0149 Executive / Chief-of-Staff cluster:
**Daily Executive Briefing**, **Meeting Prep & Attendee Dossier**, and
**Board / Investor Update Pack**.

Reasons with `core.ai.chatCompletion` over real tenant data (`feature.crm` /
`feature.analytics`). Connector-touching steps bind a connection pack via
`core.openwop.http.openapi-call` `connectionRef` — Meeting Prep reads the
Microsoft 365 calendar, Board Update pulls NetSuite finance figures. A configured
connection runs live; an unconfigured one surfaces a connect prompt. Every external
send is gated by `core.chat.approvalGate`; the read-only briefing is ungated.
Tenant-specific values are run parameters, so the frozen expansion stays
replay-deterministic. Pair the briefing/prep/update with operator-registered
scheduled triggers.
