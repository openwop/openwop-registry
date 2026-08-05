# core.openwop.forms.starters

`kind: "form-content"` pack (4 templates) — the first packaged form templates on the
registry. Source of truth: openwop-app repo, `packs/core.openwop.forms.starters/`
(ADR 0516).

A form-content pack ships **declarative form templates**: a title plus a field list.
No code, no runtime, no `entry.mjs`. A host instantiates a template into an ordinary,
fully editable form through its **normal create path**, so every field is sanitized
exactly as hand-typed input is — the pack cannot define a submission surface the host
would not otherwise accept, and the resulting form belongs to the tenant to edit,
publish, or delete.

## Templates

| templateId | What it collects |
|---|---|
| `forms.contact-us` | Name, email, message — the minimum a contact form needs |
| `forms.event-rsvp` | Attendance, party size, dietary needs, and **accessibility/accommodation** requirements |
| `forms.job-application` | Name, email, role, portfolio, cover note |
| `forms.feedback` | A balanced 5-point satisfaction scale plus open-ended what-worked / what-didn't |

## Notes on the content

These field sets are researched rather than assumed, and two choices are deliberate:

- **The RSVP asks about accessibility needs.** Every RSVP guide treats accommodations
  as both an inclusivity and a legal-compliance field; omitting it is an omission, not
  restraint.
- **The feedback scale is balanced** (Very satisfied → Very dissatisfied). An earlier
  draft used Excellent/Good/Okay/Poor — two positive options, one neutral, and a single
  negative — which structurally inflates satisfaction, because a mildly happy respondent
  has two choices while an unhappy one has a floor.
- **The job application asks for no demographic information**, per
  [EEOC guidance on pre-employment inquiries](https://www.eeoc.gov/prohibited-employment-policiespractices).
  That absence is intentional.

## Field types

Templates may only use the host's closed field catalog: `text`, `email`, `textarea`,
`select`, `checkbox`. A template declaring anything else is **refused at load** rather
than silently coerced — coercion drops a `select`'s options and turns a closed choice
set into an unconstrained free-text box on a public page.
