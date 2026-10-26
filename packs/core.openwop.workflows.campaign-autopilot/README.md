# core.openwop.workflows.campaign-autopilot

RFC 0013/0133 workflow-chain pack (1 chain) — Campaign autopilot (ADR 0961). v0.2 is the launch spine for one campaign: a read-only preflight that waits on a checklist card while something is missing, then the drafting stage, which starts the existing campaign spine (`campaign-studio.campaign-orchestration`) as its own campaign run tagged with the same campaign. Drafts only, no external effect. A gated stage runs as its own run because a suspended sub-chain child is not resumed into its parent on this host (ADR 0961 D4 correction). Launched by the campaign-autopilot launch route, which tags the run with its campaign; every node reads that tag, never an input.

Source of truth: openwop-app repo, `examples/workflow-chain-packs/campaign-autopilot/`.

Chains:

- `campaign-studio.autopilot` v0.2.0 — Campaign autopilot
