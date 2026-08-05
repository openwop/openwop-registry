#!/usr/bin/env node
/**
 * Pack-internal schema `$id` must name the pack's CURRENT version.
 *
 * CONTRIBUTING.md § "Pack-internal JSON Schemas" makes this normative: the `$id`
 * MUST be `https://packs.openwop.dev/<pack>/<version>/<file>`, the version
 * segment MUST match `pack.json.version`, and *"Pack `version` bump: regenerate
 * every `$id` in the pack's `schemas/` directory to the new version."*
 *
 * WHY THIS IS A FILE AND NOT A HEREDOC. This check previously existed ONLY as an
 * inline `node -e` block inside `.github/workflows/packs-check.yml`. That meant
 * it could not be run locally, could not be unit-tested, could not be
 * sabotage-probed, and was absent from `scripts/registry-check.sh` — the repo's
 * own `npm run check`. So a routine version bump turned `main` red and stayed
 * red for four days, because the only way to observe the gate was to push.
 *
 * CONTRIBUTING.md also claimed `scripts/precheck-packs.mjs` "SHOULD catch drift".
 * It does not check `$id` at all. An unrunnable gate plus a false claim about a
 * different gate is how this became invisible.
 *
 * Usage:  node scripts/check-pack-schema-ids.mjs [--fix]
 *   (no flag) report drift and exit 1
 *   --fix     rewrite each drifted `$id` in place, then report
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const FIX = process.argv.includes('--fix');
const PACKS = 'packs';

if (!existsSync(PACKS)) {
  console.error(`✗ check-pack-schema-ids: no ${PACKS}/ directory — run from the registry repo root.`);
  process.exit(1);
}

const drifts = [];
let packsScanned = 0;
let schemasScanned = 0;

for (const dir of readdirSync(PACKS)) {
  const manifest = join(PACKS, dir, 'pack.json');
  if (!existsSync(manifest)) continue;
  let pack;
  try {
    pack = JSON.parse(readFileSync(manifest, 'utf8'));
  } catch (err) {
    console.error(`✗ ${manifest} is not valid JSON: ${err.message}`);
    process.exit(1);
  }
  packsScanned += 1;
  // The directory name IS the pack name in this repo (verified: 155/155 agree).
  // Using the directory keeps the expected `$id` identical to the URL the
  // registry actually serves from, which is what a caching consumer resolves.
  const version = pack.version;
  const schemasDir = join(PACKS, dir, 'schemas');
  if (!version || !existsSync(schemasDir)) continue;

  for (const file of readdirSync(schemasDir)) {
    if (!file.endsWith('.json')) continue;
    const path = join(schemasDir, file);
    const raw = readFileSync(path, 'utf8');
    let schema;
    try {
      schema = JSON.parse(raw);
    } catch (err) {
      console.error(`✗ ${path} is not valid JSON: ${err.message}`);
      process.exit(1);
    }
    // A schema with no `$id` makes no identity claim, so it cannot drift.
    if (typeof schema.$id !== 'string') continue;
    schemasScanned += 1;
    const expected = `https://packs.openwop.dev/${dir}/${version}/${file}`;
    if (schema.$id === expected) continue;

    drifts.push({ path, actual: schema.$id, expected });
    if (FIX) writeFileSync(path, raw.replace(`"${schema.$id}"`, `"${expected}"`));
  }
}

// Anti-vacuity: a gate that scanned nothing must not report success. This is the
// failure mode that let a sibling tripwire in openwop-app read 1407 files while
// examining zero nodes — it guarded on the FILE count, not on what it asserted.
if (packsScanned === 0 || schemasScanned === 0) {
  console.error(
    `✗ check-pack-schema-ids: scanned ${packsScanned} pack(s) and ${schemasScanned} schema(s) with an $id — `
    + 'nothing was actually checked. Refusing to report success.',
  );
  process.exit(1);
}

if (drifts.length === 0) {
  console.log(`✓ check-pack-schema-ids: ${schemasScanned} schema $id(s) across ${packsScanned} packs all match <pack>/<version>/.`);
  process.exit(0);
}

if (FIX) {
  console.log(`✓ check-pack-schema-ids --fix: rewrote ${drifts.length} $id(s).`);
  for (const d of drifts) console.log(`  ${d.path}\n    ${d.actual}\n    → ${d.expected}`);
  process.exit(0);
}

console.error(`✗ check-pack-schema-ids: ${drifts.length} pack-internal schema $id mismatch(es).`);
for (const d of drifts) {
  console.error(`  ${d.path}\n    $id      ${d.actual}\n    expected ${d.expected}`);
}
console.error(
  '\n  CONTRIBUTING.md § "Pack-internal JSON Schemas": a version bump must regenerate\n'
  + '  every $id in the pack\'s schemas/ directory. Run with --fix to do that.\n'
  + '\n  NOTE: this corrects SOURCE only. Tarballs already published under the old\n'
  + '  version are immutable and stay as they were — re-cutting one would break the\n'
  + '  integrity hash in its version manifest.',
);
process.exit(1);
