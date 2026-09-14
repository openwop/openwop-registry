#!/usr/bin/env node
/**
 * check-pack-chain-params-declared — every `{{params.<name>}}` a chain
 * interpolates MUST be declared in that chain's `parameters.properties`.
 *
 * This gate exists because the author of the previous one walked straight into
 * the hole it now covers. Three chain packs bound their trigger to a literal
 * host event name that no conformant host may emit; the fix was to replace the
 * literal with `{{params.triggerEventName}}`, matching the twelve bindings that
 * already did so. That half was right. The other half was missed: those three
 * chains never DECLARED the parameter.
 *
 *   vendor.openwop-app.workflows.forms-intake  parameters: {properties:{}, additionalProperties:false}
 *
 * With `additionalProperties: false` and an empty `properties`, an installer
 * cannot supply `triggerEventName` even deliberately — so the published fix
 * swapped a binding that was wrong for one that was unsatisfiable, and the
 * observable behaviour is identical either way: the chain fires, the run
 * completes, and nothing is filed. The tier-1 host measured both spellings at
 * 4-of-9 red and reported that the template changed nothing, which is exactly
 * what an unresolvable placeholder looks like from the outside.
 *
 * A template is not a binding until the parameter exists. Nothing checked that:
 * 516 template references across the tree were correctly declared, three were
 * not, and the three were the ones just edited.
 *
 * @see scripts/check-pack-event-names.mjs — the sibling gate, and the change
 *      that made this one necessary
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACKS = join(ROOT, 'packs');
const REF = /\{\{params\.([A-Za-z0-9_]+)\}\}/g;

const findings = [];
let refs = 0;
let chains = 0;
const dirs = existsSync(PACKS) ? readdirSync(PACKS).sort() : [];
for (const d of dirs) {
  const mf = join(PACKS, d, 'pack.json');
  if (!existsSync(mf)) continue;
  let doc;
  try { doc = JSON.parse(readFileSync(mf, 'utf8')); } catch { continue; }
  for (const [i, chain] of (doc.chains ?? []).entries()) {
    const serialised = JSON.stringify(chain);
    const used = new Set([...serialised.matchAll(REF)].map((m) => m[1]));
    if (used.size === 0) continue;
    chains += 1;
    refs += used.size;
    const declared = new Set(Object.keys(chain?.parameters?.properties ?? {}));
    const missing = [...used].filter((n) => !declared.has(n)).sort();
    if (missing.length > 0) {
      findings.push({
        pack: d,
        chain: chain?.chainId ?? chain?.id ?? `chains[${i}]`,
        missing,
        declared: [...declared].sort(),
        closed: chain?.parameters?.additionalProperties === false,
      });
    }
  }
}

if (chains === 0) {
  console.error('check-pack-chain-params-declared FAILED — found no chain interpolating a parameter.');
  console.error('  The sweep is broken, not the tree: this gate cannot pass vacuously.');
  process.exit(1);
}

if (findings.length > 0) {
  console.error('=== check-pack-chain-params-declared FAILED ===');
  console.error('');
  console.error('A `{{params.<name>}}` placeholder is not a binding until the parameter is');
  console.error('declared. An undeclared one resolves to nothing, and a chain whose trigger');
  console.error('resolves to nothing still fires and still files nothing.');
  console.error('');
  for (const f of findings) {
    console.error(`  ${f.pack}  chain ${f.chain}`);
    console.error(`      interpolates but does not declare: ${f.missing.join(', ')}`);
    console.error(`      declared: ${f.declared.length ? f.declared.join(', ') : '(none)'}`);
    if (f.closed) console.error('      parameters.additionalProperties is false — an installer CANNOT supply it.');
  }
  console.error('');
  console.error('Add each name to the chain\'s `parameters.properties` (and `required` when the');
  console.error('chain cannot run without it).');
  process.exit(1);
}

console.log(`=== check-pack-chain-params-declared OK — ${refs} template parameter reference(s) across ${chains} chain(s); every one is declared ===`);
