# core.openwop.workflows.tutorial-connect-your-ai

RFC 0013/0133 workflow-chain pack (4 chains) — ADR 0488 D2 — the NESTING PROOF. The 'Connect Your AI' tutorial expressed as phase-granular sub-chains: one child chain per driveable phase, plus a parent chain that composes them via core.subWorkflow + subChainRef (RFC 0133). 'Show me this phase' runs a child; 'Drive the whole tutorial' runs the parent. Deliberately ONE tutorial: the ADR requires proving nesting on a single tutorial before converting the library.

Source of truth: openwop-app repo, `examples/workflow-chain-packs/tutorial-connect-your-ai/`.

Chains:

- `tutorial.connect-your-ai.phase-2` v1.0.1 — Connect Your AI — Phase 2: Add your provider key
- `tutorial.connect-your-ai.phase-3` v1.0.1 — Connect Your AI — Phase 3: Choose your models
- `tutorial.connect-your-ai.phase-4` v1.0.1 — Connect Your AI — Phase 4: Your first conversation
- `tutorial.connect-your-ai` v1.0.1 — Connect Your AI — drive the whole tutorial
