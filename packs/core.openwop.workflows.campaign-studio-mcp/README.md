# core.openwop.workflows.campaign-studio-mcp

RFC 0013/0133 workflow-chain pack (7 chains) — ADR 0962 — Campaign Studio's open agent interface: MCP read tools (core.openwop.mcp.expose-tool → a campaign-ops read node). Every tool requires a clientId and binds the run to that client (access, the client's externalAgents switch, the client stamp). Registered chain-backed by campaign-ops with the ADR 0087 MCP gates; no tool publishes, sends, spends or approves.

Source of truth: openwop-app repo, `examples/workflow-chain-packs/campaign-studio-mcp/`.

Chains:

- `campaign-studio.mcp.list` v1.0.0 — campaign_list
- `campaign-studio.mcp.get` v1.0.0 — campaign_get
- `campaign-studio.mcp.performance` v1.0.0 — campaign_performance
- `campaign-studio.mcp.pending-gates` v1.0.0 — campaign_pending_gates
- `campaign-studio.mcp.run-status` v1.0.0 — campaign_run_status
- `campaign-studio.mcp.explain` v1.0.0 — campaign_explain
- `campaign-studio.mcp.request-change` v1.0.1 — campaign_request_change
