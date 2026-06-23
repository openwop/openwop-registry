# vendor.openwop.card-sample

A reference **chat-card pack** (`kind: "card"`, RFC 0071) for the OpenWOP registry —
the declarative kind that distributes prompt-driven **AI chat cards**: a typed input
form + a prompt template + an output contract, with **no runtime**.

## Cards

| `cardTypeId` | Inputs | What it does |
|---|---|---|
| `vendor.openwop.card-sample.summarize` | `source` (longtext), `length` (select: one-line / short / detailed) | Summarizes the source text at the chosen length. |
| `vendor.openwop.card-sample.extract-action-items` | `notes` (longtext), `owner_hint` (text) | Extracts a checklist of assignable action items from meeting notes. |

Each card declares its inputs from the **portable field subset**
(`text|longtext|number|boolean|select|multiselect|file|artifact-ref`), a `prompt`
with a `{{placeholder}}` template + `placeholderMapping` to input paths, and a system
prompt. A host advertising `host.chat.cardPacks` resolves the card from the registry
and routes execution through its AI envelope (`core.chat.cardExecute`); card-input
content carries `contentTrust: "untrusted"` per the RFC 0071 §"Trust boundary".

## Why this exists

Card types used to be host-private free strings (`"summarize"`, `"prd.create"`) mapped
to local React components, with no cross-host meaning. RFC 0071 makes the card's prompt
+ input contract **distributable, signed, versioned, and capability-negotiable** — this
pack is the registry's reference listing for the kind.

Published to `packs.openwop.dev` under the **Card packs** tab.
