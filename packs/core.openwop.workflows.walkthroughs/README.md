# core.openwop.workflows.walkthroughs

RFC 0013/0133 workflow-chain pack (25 chains) — The first-party SYSTEM guided walkthroughs (single-step page tours), migrated from the deprecated builtinWorkflows seam (ADR 0472 P4). Each chainId keeps its original walkthrough.* id so the FE player + replay resolve unchanged; registered chain-backed with metadata.walkthrough=true so the walkthroughs surface lists them.

Source of truth: openwop-app repo, `examples/workflow-chain-packs/walkthroughs/` (ADR 0472 builtin→chain migration).

Chains:

- `tour.campaign-studio.first-brief` v1.0.0 — Campaign Studio: your first brief
- `walkthrough.agents.roster` v1.0.0 — Agents: meet the roster
- `walkthrough.workflows.dashboard` v1.0.0 — Workflows: the dashboard
- `walkthrough.runs.index` v1.0.0 — Runs: the run history
- `walkthrough.keys.providers` v1.0.0 — Keys: provider credentials
- `walkthrough.funnels.list` v1.0.0 — Funnels: your sales funnels
- `walkthrough.models.hub` v1.0.0 — Models: pick your models
- `walkthrough.boards.kanban` v1.0.0 — Boards: the kanban
- `walkthrough.workforces.gallery` v1.0.0 — Workforces: the gallery
- `walkthrough.inbox.notifications` v1.0.0 — Inbox: notifications
- `walkthrough.projects.list` v1.0.0 — Projects: your projects
- `walkthrough.agent-templates.list` v1.0.0 — Agents: templates
- `walkthrough.roster.orgchart` v1.0.0 — Roster: the org chart
- `walkthrough.media.library` v1.0.0 — Media: the library
- `walkthrough.cms.pages` v1.0.0 — CMS: your pages
- `walkthrough.publishing.settings` v1.0.0 — Publishing: settings
- `walkthrough.prompts.library` v1.0.0 — Prompts: the library
- `walkthrough.memory.ledger` v1.0.0 — Memory: the ledger
- `walkthrough.capabilities.panel` v1.0.0 — Capabilities: the panel
- `walkthrough.cli.quickstart` v1.0.0 — CLI: quickstart
- `walkthrough.feature-toggles.list` v1.0.0 — Feature toggles
- `walkthrough.orgs.list` v1.0.0 — Orgs: your workspaces
- `walkthrough.users.list` v1.0.0 — Users: members
- `walkthrough.connections.list` v1.0.0 — Connections: providers
- `walkthrough.example-data.dashboard` v1.0.0 — Example data
