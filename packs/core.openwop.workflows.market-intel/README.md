# core.openwop.workflows.market-intel

Workflow-chain pack (RFC 0013) — a competitive / market-intelligence digest.

`market-intel.digest` discovers sources for a topic, extracts voice-of-customer
signals, scores opportunities, then synthesizes a digest with recommended actions.
Authored entirely over PUBLISHED node typeIds
(`vendor.myndhyve.market-intel-{discovery,voc,opportunity-scoring}` + `core.ai.chatCompletion`),
so it expands + runs on any conformant host (the RFC 0013 portability invariant).

Parameters: `topic` (required), `audience` (optional). Output: `digest`.

See openwop-app ADR 0149 (real-work catalog) + ADR 0152 (workflow-chain pack loader).
