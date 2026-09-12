#!/usr/bin/env node
/**
 * check-pack-schema-tree-complete — a pack that ships schemas ships them at
 * EVERY published version.
 *
 * A version manifest under `registry/<tree>/packs/<name>/-/<version>.json`
 * points at per-node documents served from the flat `registry/<name>/<version>/`
 * directory (`*.config.json`, `*.input.json`, `*.output.json`). Publishing the
 * manifest without that directory yields a version whose schema paths 404 —
 * and every existing gate passes, because they validate manifests, signatures,
 * SBOMs and indexes. None of them asks whether the documents a manifest points
 * at are there.
 *
 * Found by the MyndHyve session while publishing `vendor.myndhyve.*` to the v2
 * tree (openwop-registry#53): its first commit staged 39 manifests and left 325
 * schema files untracked. `registry-check.sh` was green over that state. It was
 * caught by reading what `git status` still listed after a commit believed to
 * be complete — not by any check here.
 *
 * WHY IT READS THE MANIFEST AND NOT THE DIRECTORY. Two weaker forms were
 * written and both were measured wrong before this one:
 *
 *   1. "every published version has a schema directory" — of 155 published v2
 *      versions, 84 have one and **71 do not**, and all 71 are packs that
 *      declare no nodes at all (`core.openwop.connections.*`, `artifact-types`).
 *      71 false positives on the steward's own tree; switched off within a day.
 *   2. "a pack that ships schemas somewhere ships them everywhere" — this
 *      passed its own sabotage. Removing the ONLY schema directory of
 *      `core.openwop.a2a@1.1.1` (51 files) left the gate green at rc=0, because
 *      with that directory gone the pack looked like one that ships no schemas.
 *      A check that infers the expectation from the evidence cannot see the
 *      evidence being deleted.
 *
 * The manifest is the authority: each node declares `configSchemaRef` /
 * `inputSchemaRef` / `outputSchemaRef`, and the document it names either
 * resolves under `registry/<name>/<version>/` or 404s for every consumer. That
 * is decidable per version, needs no sibling version to compare against, and
 * reddens on exactly the deletion form (2) missed.
 *
 * A THIRD thing the weaker forms got wrong, recorded because it cut the other
 * way. Form (2) reported `core.openwop.agent-examples@1.0.0` as a real v1
 * violation — manifest published, no `registry/core.openwop.agent-examples/
 * 1.0.0/` directory — and I was one commit from shipping a `--report-only`
 * escape hatch for the frozen v1 tree on the strength of it. Reading the
 * manifest dissolves it: that version declares no schema documents at all, so
 * the absent directory is correct and there was never anything to repair. A
 * check that infers intent from the filesystem invents defects as readily as
 * it misses them. Both trees are clean under the manifest-reading form (v2:
 * 155 versions, 84 declaring refs; v1: 282 versions, 129 declaring refs), so
 * both block and neither needs an exception.
 *
 * Usage: node scripts/check-pack-schema-tree-complete.mjs [--tree v1|v2]
 */
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { treeFromArgv } from './lib/registry-tree.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TREE = treeFromArgv(process.argv);
const packsDir = join(ROOT, 'registry', TREE, 'packs');

if (!existsSync(packsDir)) {
  console.error(`✗ ${packsDir} does not exist — nothing to verify is not a pass`);
  process.exit(1);
}

/** Every `*SchemaRef` a version manifest declares, as basenames. */
function declaredRefs(manifest) {
  const refs = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node)) {
      if (/SchemaRef$/.test(k) && typeof v === 'string') refs.push(v);
      else walk(v);
    }
  };
  walk(manifest);
  return refs;
}

const violations = [];
let checked = 0;
let withRefs = 0;
for (const name of readdirSync(packsDir).sort()) {
  const verDir = join(packsDir, name, '-');
  if (!existsSync(verDir)) continue;
  for (const file of readdirSync(verDir).sort()) {
    if (!file.endsWith('.json') || file.endsWith('.sbom.json')) continue;
    const version = file.slice(0, -5);
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(join(verDir, file), 'utf-8'));
    } catch (e) {
      violations.push(`${name}@${version}: manifest does not parse — ${e.message}`);
      continue;
    }
    checked += 1;
    const refs = declaredRefs(manifest);
    if (refs.length === 0) continue; // declares no schema documents; nothing to serve
    withRefs += 1;
    const dir = join(ROOT, 'registry', name, version);
    const missing = refs.filter((r) => !existsSync(join(dir, basename(r))));
    if (missing.length) {
      violations.push(
        `${name}@${version}: declares ${refs.length} schema document(s) and ${missing.length} do not exist under registry/${name}/${version}/ — [${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ', …' : ''}] would 404 for every consumer`,
      );
    }
  }
}

if (checked === 0) {
  console.error(`✗ check-pack-schema-tree-complete [${TREE}]: examined 0 version(s) — the sweep is broken, not the tree`);
  process.exit(1);
}
if (violations.length) {
  console.error(`✗ check-pack-schema-tree-complete [${TREE}] — ${violations.length} published version(s) declare schema documents that are not there:`);
  for (const v of violations) console.error(`  – ${v}`);
  process.exit(1);
}
console.log(`OK: ${checked} published ${TREE} version(s) checked; all schema documents declared by the ${withRefs} version(s) that name any are present`);
