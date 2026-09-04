#!/usr/bin/env node
/**
 * v2-wave-engines — the steward's authoring act for the RFC 0177 core wave.
 *
 * RFC 0177 §A.1: a v2 host reads an `engines.openwop` range with no upper bound
 * as `<2.0.0` and refuses to install any version whose range does not admit
 * protocol major 2 (`pack_engine_unsupported`). Every published core version
 * either pins `<2.0.0` or has no ceiling, so the wave is total: each pack's
 * SOURCE manifest gets an explicit v2-admitting ceiling and a patch bump (a new
 * version is the only way to publish new bytes — signed artifacts are immutable).
 *
 * For every `packs/<filter>…/pack.json`:
 *   - `engines.openwop` becomes `>=<lower> <3.0.0`, where <lower> is the pack's
 *     EXISTING lower bound normalized to three segments (a pack that required
 *     1.1.0 still requires it; `>=1.1` is spelled `>=1.1.0` — packs.md's grammar
 *     `^>=\d+(\.\d+){0,2} <\d+\.0\.0$` admits both, RFC 0177 §A.1 says three-segment);
 *   - `version` gets a patch bump;
 *   - the README's `| Version |` / `| Engine |` rows (the pack README template)
 *     are updated when present;
 *   - every pack-internal schema `$id` is re-pointed at the new version
 *     (CONTRIBUTING.md § "Pack-internal JSON Schemas", via check-pack-schema-ids --fix).
 *
 * Idempotent: a pack whose ceiling already admits major 2 (`<3.0.0` or higher)
 * is skipped, so a second run changes nothing. `--dry-run` prints the plan.
 *
 *   node scripts/v2-wave-engines.mjs [--filter core.openwop.] [--dry-run]
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const DRY = argv.includes('--dry-run');
const FILTER = arg('--filter') ?? 'core.openwop.';
const CEILING_MAJOR = 3; // `<3.0.0` admits protocol major 2 (RFC 0177 §A.1)

const RANGE = /^>=\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\s+<\s*(\d+)\.0\.0)?$/;

function bumpPatch(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (!m) throw new Error(`version "${v}" is not a release SemVer x.y.z`);
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}

const packsDir = join(ROOT, 'packs');
const rows = [];
let skipped = 0;
for (const name of readdirSync(packsDir).sort()) {
  if (!name.startsWith(FILTER)) continue;
  const pj = join(packsDir, name, 'pack.json');
  if (!existsSync(pj)) continue;
  const manifest = JSON.parse(readFileSync(pj, 'utf8'));
  const range = manifest.engines?.openwop;
  if (typeof range !== 'string') {
    console.error(`✗ ${name}: engines.openwop is missing — refusing to invent a lower bound`);
    process.exit(1);
  }
  const m = RANGE.exec(range.trim());
  if (!m) {
    console.error(`✗ ${name}: engines.openwop "${range}" is not \`>=x[.y[.z]] [<M.0.0]\` — refusing`);
    process.exit(1);
  }
  const ceiling = m[4] === undefined ? 2 : Number(m[4]); // absent ceiling ≡ <2.0.0 (§A.1)
  if (ceiling >= CEILING_MAJOR) { skipped++; continue; } // already migrated — idempotent
  const lower = `${m[1]}.${m[2] ?? '0'}.${m[3] ?? '0'}`;
  const next = `>=${lower} <${CEILING_MAJOR}.0.0`;
  const version = bumpPatch(manifest.version);
  rows.push({ name, pj, manifest, from: range, to: next, oldVersion: manifest.version, version });
}

console.log(`v2-wave-engines: filter "${FILTER}" — ${rows.length} pack(s) to migrate, ${skipped} already at <${CEILING_MAJOR}.0.0${DRY ? ' [dry-run]' : ''}`);
for (const r of rows) console.log(`  ${r.name}  ${r.oldVersion} → ${r.version}   engines.openwop "${r.from}" → "${r.to}"`);
if (DRY || rows.length === 0) process.exit(0);

let readmes = 0;
for (const r of rows) {
  r.manifest.engines = { ...r.manifest.engines, openwop: r.to };
  r.manifest.version = r.version;
  writeFileSync(r.pj, JSON.stringify(r.manifest, null, 2) + '\n');
  const readme = join(packsDir, r.name, 'README.md');
  if (existsSync(readme)) {
    const before = readFileSync(readme, 'utf8');
    const after = before
      .replace(/^\| Version \| `[^`]+` \|$/m, `| Version | \`${r.version}\` |`)
      .replace(/^\| Engine \| OpenWOP `[^`]+` \|$/m, `| Engine | OpenWOP \`${r.to}\` |`);
    if (after !== before) { writeFileSync(readme, after); readmes++; }
  }
}
// A version bump MUST regenerate every pack-internal schema $id (CONTRIBUTING.md).
execFileSync('node', ['scripts/check-pack-schema-ids.mjs', '--fix'], { cwd: ROOT, stdio: 'inherit' });
console.log(`v2-wave-engines: migrated ${rows.length} pack(s); ${readmes} README(s) updated.`);
