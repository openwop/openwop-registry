#!/usr/bin/env node
/**
 * check-pack-event-names — a chain pack's trigger MUST bind an event name a
 * conformant host is allowed to emit.
 *
 * `workflow-chain-pack-manifest.schema.json` describes `trigger` but says
 * nothing about `eventName`, and no other script reads the field, so the value
 * was unconstrained from the day the surface shipped. Four published packs bind
 * names that violate `events.md` §Types — three of them `core.openwop.*`, the
 * protocol's own packs:
 *
 *   core.openwop.workflows.campaign-journeys   host.crm.contact.created
 *   core.openwop.workflows.crm-ops             host.crm.contact.created
 *   core.openwop.workflows.people-hr           host.users.user.deactivated
 *   vendor.openwop-app.workflows.forms-intake  host.forms.submission.created
 *
 * All four are FOUR segments (the grammar caps at three) under the org `host`,
 * which is not registered in `spec/v2/declaration.json` `extensions`. A pack
 * binding a trigger to a name no host may emit does not fail loudly: the chain
 * simply never fires, or — as the tier-1 host measured while renaming into one
 * of these — the chain fires, the run completes, and nothing is filed.
 *
 * WHY THE CODEMAP IS NEEDED HERE. A protocol event type is spelled `run.started`
 * — two kebab segments, NO `openwop.` prefix — which is character-for-character
 * the shape of a vendor type. The only thing that separates them is membership
 * in the codemap's v2 column. Validating the grammar alone would accept
 * `node.progres` (a typo of a protocol event) as a perfectly good vendor name,
 * which is the same confusion `persistence.md` §The reader rule exists to
 * refuse on the read side.
 *
 * Templated bindings (`{{params.triggerEventName}}`) are the CORRECT shape for a
 * core pack, because the event belongs to the host and not to the protocol.
 * Twelve bindings already do this. They are skipped, not failed.
 *
 * @see spec/v2/core/events.md §Types — the vendor branch grammar
 * @see spec/v2/declaration.json `extensions` — the org registry (RFC 0180)
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACKS = join(ROOT, 'packs');

const declaration = JSON.parse(readFileSync(join(ROOT, 'spec/v2/declaration.json'), 'utf8'));
const codemap = JSON.parse(readFileSync(join(ROOT, 'spec/v2/event-codemap.json'), 'utf8'));

const registeredOrgs = new Set(Object.keys(declaration.extensions ?? {}));
const protocolTypes = new Set((codemap.rows ?? []).map((r) => r.v2 ?? r.v1).filter(Boolean));

/** events.md §Types, vendor branch: 2 or 3 kebab segments, never `openwop.`-prefixed. */
const VENDOR = /^(?!openwop\.)[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*)?$/;
const TEMPLATE = /\{\{.*\}\}/;

function classify(name) {
  if (TEMPLATE.test(name)) return { ok: true, why: 'templated — resolved by the installing host' };
  if (protocolTypes.has(name)) return { ok: true, why: 'protocol type (codemap v2 column)' };
  if (!VENDOR.test(name)) {
    const segs = name.split('.').length;
    return { ok: false, why: segs > 3 ? `${segs} segments — events.md §Types caps the vendor branch at 3` : 'does not match the events.md §Types vendor grammar' };
  }
  const org = name.split('.')[0];
  if (!registeredOrgs.has(org)) {
    return { ok: false, why: `org \`${org}\` is not registered in spec/v2/declaration.json extensions (RFC 0180)` };
  }
  return { ok: true, why: `vendor type under registered org \`${org}\`` };
}

/** Collect every `eventName` at any depth — triggers nest differently per pack kind. */
function collect(node, out) {
  if (Array.isArray(node)) return node.forEach((n) => collect(n, out));
  if (!node || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) {
    if (k === 'eventName' && typeof v === 'string') out.push(v);
    else collect(v, out);
  }
}

const findings = [];
let bindings = 0;
const packDirs = existsSync(PACKS) ? readdirSync(PACKS).sort() : [];
for (const d of packDirs) {
  const mf = join(PACKS, d, 'pack.json');
  if (!existsSync(mf)) continue;
  let doc;
  try { doc = JSON.parse(readFileSync(mf, 'utf8')); } catch { continue; }
  const names = [];
  collect(doc, names);
  for (const n of names) {
    bindings += 1;
    const v = classify(n);
    if (!v.ok) findings.push({ pack: d, name: n, why: v.why });
  }
}

if (bindings === 0) {
  console.error('check-pack-event-names FAILED — found no `eventName` binding in any pack.');
  console.error('  The sweep is broken, not the tree: this gate cannot pass vacuously.');
  process.exit(1);
}

if (findings.length > 0) {
  console.error('=== check-pack-event-names FAILED ===');
  console.error('');
  console.error('A chain pack MUST bind its trigger to an event name a conformant host may emit.');
  console.error('A binding no host can satisfy does not fail loudly — the chain never fires, or it');
  console.error('fires and files nothing.');
  console.error('');
  for (const f of findings) console.error(`  ${f.pack}\n      eventName \`${f.name}\` — ${f.why}`);
  console.error('');
  console.error('For a CORE pack the fix is almost never a rename: the event belongs to the host,');
  console.error('so the binding belongs in `{{params.triggerEventName}}` like the other twelve.');
  process.exit(1);
}

console.log(`=== check-pack-event-names OK — ${bindings} trigger binding(s) across ${packDirs.length} pack(s); every literal names a protocol type or a registered vendor org ===`);
