# core.openwop.workflows.mcp-tool-projections

RFC 0013/0133 workflow-chain pack (19 chains) — MCP tool-projection workflows (core.openwop.mcp.expose-tool → backing node), migrated from the deprecated builtinWorkflows seam (ADR 0472 P4). chainIds keep the original *.mcp.* ids; registered chain-backed with the EXACT original metadata (the ADR 0087 mcp gates) restored, and the MCP mount enumerates them.

Source of truth: openwop-app repo, `examples/workflow-chain-packs/mcp-tool-projections/` (ADR 0472 builtin→chain migration).

Chains:

- `commerce.ucp.mcp.catalog-search` v1.0.0 — ucp-catalog-search
- `commerce.ucp.mcp.place-order` v1.0.0 — ucp-place-order
- `docs.mcp.docs_search` v1.0.0 — docs_search
- `docs.mcp.docs_get` v1.0.0 — docs_get
- `notebooks.mcp.list` v1.0.0 — notebook-list
- `notebooks.mcp.get` v1.0.0 — notebook-get
- `notebooks.mcp.list-sources` v1.0.0 — notebook-list-sources
- `notebooks.mcp.list-notes` v1.0.0 — notebook-list-notes
- `notebooks.mcp.search` v1.0.0 — notebook-search
- `notebooks.mcp.ask` v1.0.0 — notebook-ask
- `notebooks.mcp.add-source` v1.0.0 — notebook-add-source
- `notebooks.mcp.create-note` v1.0.0 — notebook-create-note
- `app-builder.mcp.create-project` v1.0.0 — app-builder-create-project
- `app-builder.mcp.open-project` v1.0.0 — app-builder-open-project
- `app-builder.mcp.get-design` v1.0.0 — app-builder-get-design
- `app-builder.mcp.catalog` v1.0.0 — app-builder-catalog
- `app-builder.mcp.render-design` v1.0.0 — app-builder-render-design
- `app-builder.mcp.get-preview-url` v1.0.0 — app-builder-get-preview-url
- `app-builder.mcp.resolve-paused-task` v1.0.0 — app-builder-resolve-paused-task
