# core.openwop.workflows.agent-eval-regression-gate

RFC 0013/0133 workflow-chain pack (1 chain) — Run an agent's eval suite inside the app and stop for a person when it does not clear (ADR 0889 WF-EV-11). One `feature.evals.nodes.run-suite` node runs the suite (optionally against a baseline eval run, for a regression verdict); when the suite fails or regresses, an approval gate asks a reviewer to accept the result or reject it. Resolves on hosts that ship the evals feature and node pack (the OpenWOP reference app).

Source of truth: openwop-app repo, `examples/workflow-chain-packs/agent-eval-regression-gate/`.

Chains:

- `agents.eval-regression-gate` v1.0.0 — Agent eval regression gate
