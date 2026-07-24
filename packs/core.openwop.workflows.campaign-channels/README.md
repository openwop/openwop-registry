# core.openwop.workflows.campaign-channels

RFC 0013/0133 workflow-chain pack (5 chains) — The five campaign channel child workflows (ADR 0157) — generate→approve DAGs the orchestration fans out over — migrated from the deprecated builtins (ADR 0472 P4). chainIds keep the original ids.

Source of truth: openwop-app repo, `examples/workflow-chain-packs/campaign-channels/` (ADR 0472 builtin→chain migration).

Chains:

- `campaign-studio.channel.landing-page` v1.0.0 — Landing page
- `campaign-studio.channel.ad-variants` v1.0.0 — Ad variants
- `campaign-studio.channel.email-sequence` v1.0.0 — Email sequence
- `campaign-studio.channel.creative-briefs` v1.0.0 — Creative briefs
- `campaign-studio.channel.social-posts` v1.0.0 — Social posts
