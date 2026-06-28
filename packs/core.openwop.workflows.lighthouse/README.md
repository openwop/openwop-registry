# core.openwop.workflows.lighthouse

RFC 0013 workflow-chain pack — the five zero-config "lighthouse" real-work
workflows from ADR 0149: **Lead Triage**, **Account Brief**, **Renewal &
Churn-Risk Digest**, **RFP Response**, and **Post-Meeting Follow-up**.

Each composes the feature node packs (`feature.crm/kb/analytics`) for real tenant
data, `core.ai.chatCompletion` for reasoning, `core.chat.approvalGate` to gate
every external send behind a human, and `core.openwop.integration.*` for delivery.
Tenant-specific values (company id, RFP text, transcript, …) are run parameters,
so the frozen expansion stays replay-deterministic.

Install it, then pick a workflow in the builder ("Use template") to get a real,
editable, runnable, assignable workflow. Resolves fully on hosts that ship the
feature packs; elsewhere the unmet node types surface as a connect/install prompt.
