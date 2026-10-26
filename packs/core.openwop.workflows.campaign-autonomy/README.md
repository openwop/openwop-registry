# core.openwop.workflows.campaign-autonomy

RFC 0013/0133 workflow-chain pack (1 chain) — Campaign Studio autonomy policy (ADR 0942 D7): the daily digest of notify-after steps. One chain per workspace, scheduled host-side when a client or campaign policy asks for a daily digest. It sends each named person one notice listing the campaign steps that ran without waiting for them the day before.

Source of truth: openwop-app repo, `examples/workflow-chain-packs/campaign-autonomy/`.

Chains:

- `campaign-autonomy.daily-digest` v1.0.0 — Campaign autonomy daily digest
