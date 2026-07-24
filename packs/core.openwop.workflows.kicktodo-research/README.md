# core.openwop.workflows.kicktodo-research

RFC 0013/0133 workflow-chain pack (1 chain) — KickTodo research spine as an RFC 0013 chain pack (migrated from the deprecated ADR 0072 builtin `openwop-app.kicktodo.research`, ADR 0472 Phase 2). Frame deterministic research questions, search the web (honestly demo or live per the host adapter), normalize to canonical source records, and build a structure-checked evidence graph. Conversion tightened the builtin's implicit ordering into EXPLICIT edge dataflow (the audit's honesty note): search's `{results,engine}` flows to normalize, normalize's sources flow to the evidence graph.

Source of truth: openwop-app repo, `examples/workflow-chain-packs/kicktodo-research/` (ADR 0472 builtin→chain migration).

Chains:

- `kicktodo.research` v1.0.0 — Research a challenge topic
