#!/usr/bin/env node
/**
 * check-pack-engines-admit-major — every pack in the v2 tree must be
 * INSTALLABLE by a v2 host.
 *
 * RFC 0177 §A.1 / `packs.md` §engines: a v2 host reads an `engines.openwop`
 * range with no upper bound as `<2.0.0`, and refuses any version whose range
 * does not admit its protocol major with `pack_engine_unsupported`. So a pack
 * left at `<2.0.0` — or with no ceiling at all — is not "slightly stale", it is
 * uninstallable on every v2 host.
 *
 * WHY THIS FILE EXISTS. `v2-wave-engines.mjs` performs the migration and
 * `registry-check.sh` was described as its gate, but the gate does not check
 * this property: reverting a single pack to `>=1.0.0 <2.0.0` and re-running
 * `registry-check.sh` leaves it fully green (measured 2026-09-10). The wave's
 * correctness rested on the tool being run, not on anything that would notice
 * if it had not been. This closes that.
 *
 *   node scripts/check-pack-engines-admit-major.mjs [--major 2] [--filter <prefix>]
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const valueOf = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const major = Number.parseInt(valueOf('--major', '2'), 10);
const filter = valueOf('--filter', '');

const PACKS = 'packs';
if (!existsSync(PACKS)) {
  console.error(`FAIL: no ${PACKS}/ directory — run from the registry root`);
  process.exit(1);
}

/** `>=1.0.0 <3.0.0` → 3 ; a range with no `<` clause means `<2.0.0` (§A.1). */
function ceilingMajorOf(range) {
  const m = /<\s*(\d+)\.\d+\.\d+/.exec(range ?? '');
  return m ? Number.parseInt(m[1], 10) : 2;
}

const offenders = [];
let checked = 0;
for (const dir of readdirSync(PACKS).sort()) {
  if (filter && !dir.startsWith(filter)) continue;
  const manifest = join(PACKS, dir, 'pack.json');
  if (!existsSync(manifest)) continue;
  let doc;
  try {
    doc = JSON.parse(readFileSync(manifest, 'utf8'));
  } catch (err) {
    console.error(`FAIL: ${manifest} is not valid JSON — ${err.message}`);
    process.exit(1);
  }
  const range = doc?.engines?.openwop;
  checked += 1;
  // A pack with no declared range is unbounded, which §A.1 reads as <2.0.0.
  if (ceilingMajorOf(range) <= major) {
    offenders.push({ pack: dir, range: range ?? '(none — read as <2.0.0)' });
  }
}

// Non-vacuity: an empty sweep must fail loudly rather than report agreement.
if (checked === 0) {
  console.error(`FAIL: matched 0 packs${filter ? ` for --filter ${filter}` : ''} — the sweep is broken, not the packs`);
  process.exit(1);
}

if (offenders.length > 0) {
  console.error(`FAIL: ${offenders.length} of ${checked} pack(s) are uninstallable on a major-${major} host:`);
  for (const o of offenders) console.error(`  ${o.pack}  engines.openwop = ${o.range}`);
  console.error('');
  console.error(`Fix: node scripts/v2-wave-engines.mjs --filter <prefix>   (--dry-run first)`);
  process.exit(1);
}

console.log(`OK: ${checked} pack(s) admit protocol major ${major}${filter ? ` [filter ${filter}]` : ''}`);
