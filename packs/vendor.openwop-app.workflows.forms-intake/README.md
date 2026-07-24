# vendor.openwop-app.workflows.forms-intake

RFC 0013/0133 workflow-chain pack (1 chain) — Self-serve intake portal (ADR 0246/0247, STRAT-PORTAL). Bridges the forms feature to priority-matrix idea intake WITHOUT either feature importing the other: a public/authed form submission emits host.forms.submission.created (ADR 0208), this chain re-reads the submission under authz via ctx.features.forms.getSubmission, and — when the form's owner has configured an intake binding — files it as an idea on the bound priority-matrix list through the existing submit-idea verb, which also stamps the idea's intake overlay with sourceChannel='form' + the sourceSubmissionId for provenance (ADR 0247 OQ-5). A form with no binding cleanly no-ops (the conditional edge). The anonymous submitter never chooses the list (owner-configured binding); the target list's org-ownership is enforced at the submit-idea write boundary (expectedOrgId). Bind it per tenant to host.forms.submission.created via the ADR 0208 event→workflow bindings.

Source of truth: openwop-app repo, `examples/workflow-chain-packs/forms-intake/`.

Chains:

- `forms-intake.route-submission` v1.1.0 — Forms: Route Submission to Intake
