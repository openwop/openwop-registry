#!/usr/bin/env node
/**
 * check-pack-namespace-authority — every PUBLISHED version manifest was signed
 * by a key the registry permits for that pack's namespace.
 *
 * `packs.md` §Signing: *"A verifier MUST verify the signature against the
 * issuing registry's key for `keyId` and MUST check the pack name against that
 * key's `permittedNamespaces`."* `pack_signature_invalid` is raised when *"the
 * signature, key, or namespace check fails"* — three checks, and until now this
 * registry enforced two of them. `check-pack-tarball-signatures` verifies the
 * signature and that the key exists on disk; `check-registry-signer-consistency`
 * verifies the index and the manifest name the same key. **Nothing checked the
 * key against the namespace**, so a manifest signed by `myndhyve-internal-1`
 * naming `core.openwop.anything` passed every gate in the repo: valid
 * signature, key present, ids agreed. The binding that makes a namespace mean
 * something was the one nobody asked about.
 *
 * This matters the moment a third party publishes into the shared tree, which
 * is exactly what `vendor.myndhyve.*` is about to do (assigned to
 * `myndhyve-internal-1` since 2026-05-11, `writeApi.publishMethod:
 * "github-pull-request"` — their bytes, their key, this repo's review). A
 * review that cannot mechanically answer "may this key sign this name?" is a
 * review that will eventually say yes to the wrong one.
 *
 * Usage: node scripts/check-pack-namespace-authority.mjs [--tree v1|v2]
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { treeFromArgv, signerOf } from './lib/registry-tree.mjs';
import { keyMaySign, keyRegistry } from './lib/namespace-authority.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TREE = treeFromArgv(process.argv);
const packsDir = join(ROOT, 'registry', TREE, 'packs');

if (!existsSync(packsDir)) {
  console.error(`✗ ${packsDir} does not exist — nothing to verify is not a pass`);
  process.exit(1);
}

const registry = keyRegistry();
if (registry.keys.length === 0) {
  console.error('✗ the registry .well-known document declares no signingKeys — every check below would vacuously pass');
  process.exit(1);
}

const violations = [];
let checked = 0;
for (const pack of readdirSync(packsDir).sort()) {
  const verDir = join(packsDir, pack, '-');
  if (!existsSync(verDir)) continue;
  for (const file of readdirSync(verDir).sort()) {
    if (!file.endsWith('.json') || file.endsWith('.sbom.json')) continue;
    const ver = file.slice(0, -5);
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(join(verDir, file), 'utf-8'));
    } catch (e) {
      violations.push(`${pack}@${ver}: manifest does not parse — ${e.message}`);
      continue;
    }
    const signer = signerOf(manifest, TREE);
    if (!signer?.keyId) {
      violations.push(`${pack}@${ver}: no signing key id in the manifest, so the namespace check cannot run (this is a failure, not a skip)`);
      continue;
    }
    checked += 1;
    const verdict = keyMaySign(signer.keyId, pack, registry);
    if (!verdict.ok) violations.push(`${pack}@${ver}: signed by "${signer.keyId}" — ${verdict.reason}`);
  }
}

// An empty sweep is a broken instrument, not agreement.
if (checked === 0) {
  console.error(`✗ check-pack-namespace-authority [${TREE}]: examined 0 version manifest(s) — the sweep is broken, not the tree`);
  process.exit(1);
}

if (violations.length) {
  console.error(`✗ check-pack-namespace-authority [${TREE}] — ${violations.length} version(s) signed outside their key's permittedNamespaces (packs.md §Signing; pack_signature_invalid):`);
  for (const v of violations) console.error(`  – ${v}`);
  process.exit(1);
}
console.log(`OK: ${checked} published ${TREE} version manifest(s) were signed by a key the registry permits for their namespace`);
