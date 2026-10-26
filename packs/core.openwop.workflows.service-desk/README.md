# core.openwop.workflows.service-desk

RFC 0013/0133 workflow-chain pack (1 chain) — Service-desk workflow pack (RFC 0013, ADR 0878 D8): SLA escalation for the host's own support tickets. Bind it to the host's SLA-breach event (ADR 0683 — the event name belongs to the installing host and is a parameter here) or run it for one ticket by id. The ticket is read over feature.service-desk.nodes (the run person's org floor applies), an AI summary is grounded in the thread, and the people who work the ticket — its assignee, else its org's writers — are notified. Never a tenant broadcast; nothing is sent to the customer.

Source of truth: openwop-app repo, `examples/workflow-chain-packs/service-desk/`.

Chains:

- `service-desk.sla-escalation` v1.1.0 — SLA Breach Escalation
