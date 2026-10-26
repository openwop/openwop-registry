# core.openwop.workflows.experiments

RFC 0013/0133 workflow-chain pack (2 chains) — ADR 0949 P4 — the Optimize loop. One node reallocates a running Optimize experiment by Thompson sampling, every arm kept at or above its floor. Schedule it with the existing scheduler at the experiment's epoch cadence: a run that comes too early returns `too_soon` and changes nothing, and a replay or a :fork finds its epoch already appended (the epoch number comes from the run's frozen start instant), so it never re-allocates. It only reallocates an experiment a human launched; it never launches, stops or promotes. Resolves on hosts that ship the experiments feature + node pack (the OpenWOP reference app). ADR 0950 adds `experiments.promote` (internal): the governed, staged promotion of a Decide winner, started from the experiment.

Source of truth: openwop-app repo, `examples/workflow-chain-packs/experiments/`.

Chains:

- `experiments.optimize-loop` v1.0.0 — Optimize Experiment Loop
- `experiments.promote` v1.0.0 — Promote an Experiment Winner
