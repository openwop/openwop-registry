#!/usr/bin/env node
/**
 * check-pack-manifest-schemas — every v2 pack manifest validates against the
 * corpus bare-manifest schema for its kind, vendored at CORPUS_TAG.
 *
 * openwop-registry#69: 5 of 190 published v2 packs failed the corpus schemas
 * (a closed node-category enum, RFC 0120's apiHosts, RFC 0141's canonical
 * artifact-type ids) and NOTHING here said so — the gates checked signatures,
 * indexes and version manifests, never the pack.json a host actually installs.
 * A v2 host that validates installed packs (openwop-app does) rejected them.
 *
 * Two surfaces, both held:
 *   1. SOURCE  packs/<name>/pack.json for every pack whose engines admit major 2
 *      (the ones registry-v2-sign will publish). The signing block is added at
 *      sign time, so a source without one is validated with the block CI adds.
 *   2. SERVED  the pack.json inside the LATEST version tarball of every pack in
 *      registry/v2 — what a host installs by default. Published versions are
 *      immutable, so an older non-conformant version cannot be repaired, only
 *      superseded; those are COUNTED and named, and fail nothing, so long as a
 *      conformant later version exists.
 *
 * A kind with no bare-manifest schema is reported, never silently passed.
 *
 *   node scripts/check-pack-manifest-schemas.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { publicationTree, V2_SCHEME } from './lib/registry-tree.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMAS_V2 = join(ROOT, 'schemas', 'v2');
const SOURCE = join(ROOT, 'packs');
const SERVED = join(ROOT, 'registry', 'v2', 'packs');
const KIND_SCHEMA = { node: 'node', 'workflow-chain': 'workflow-chain', 'artifact-type': 'artifact-type', card: 'chat-card', 'form-content': 'form-content', prompt: 'prompt', connection: 'connection' };

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
for (const f of readdirSync(SCHEMAS_V2).filter((x) => x.endsWith('.json')).sort()) {
  const s = JSON.parse(readFileSync(join(SCHEMAS_V2, f), 'utf8'));
  ajv.addSchema(s, s.$id ?? f);
}
const validatorFor = (kind) => {
  const k = KIND_SCHEMA[kind ?? 'node'];
  return k === undefined ? null : ajv.getSchema(`https://openwop.dev/spec/v2/${k}-pack-manifest.schema.json`) ?? null;
};
const fmt = (errs) => (errs ?? []).slice(0, 3).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ');
const semverCmp = (a, b) => { const p = (v) => v.split(/[.+-]/).slice(0, 3).map(Number); const [x, y] = [p(a), p(b)]; for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };

const failures = []; const unknownKinds = new Set(); const superseded = [];
let sourceChecked = 0, servedChecked = 0;

// 1. source
for (const name of readdirSync(SOURCE).sort()) {
  const p = join(SOURCE, name, 'pack.json');
  if (!existsSync(p)) continue;
  const m = JSON.parse(readFileSync(p, 'utf8'));
  if (publicationTree(m) !== 'v2') continue;
  const validate = validatorFor(m.kind);
  if (validate === null) { unknownKinds.add(m.kind); continue; }
  const signed = m.signing ? m : { ...m, signing: { keyId: 'openwop-team-1', scheme: V2_SCHEME } };
  sourceChecked++;
  if (!validate(signed)) failures.push(`source packs/${name}/pack.json (${m.kind ?? 'node'} ${m.version}): ${fmt(validate.errors)}`);
}

// 2. served — latest version per pack; older invalid versions are counted, not failed
if (existsSync(SERVED)) {
  for (const name of readdirSync(SERVED).sort()) {
    const dir = join(SERVED, name, '-');
    if (!existsSync(dir)) continue;
    const versions = readdirSync(dir).filter((f) => f.endsWith('.tgz')).map((f) => f.slice(0, -4)).sort(semverCmp);
    versions.forEach((v, i) => {
      let m;
      try { m = JSON.parse(execFileSync('tar', ['-xzOf', join(dir, `${v}.tgz`), 'pack.json'], { encoding: 'utf8' })); } catch { failures.push(`served ${name}@${v}: no pack.json in the tarball`); return; }
      const validate = validatorFor(m.kind);
      if (validate === null) { unknownKinds.add(m.kind); return; }
      const latest = i === versions.length - 1;
      if (latest) servedChecked++;
      if (!validate(m)) {
        if (latest) failures.push(`served ${name}@${v} (latest): ${fmt(validate.errors)}`);
        else superseded.push(`${name}@${v}`);
      }
    });
  }
}

if (unknownKinds.size > 0) failures.push(`kind(s) with no vendored bare-manifest schema: ${[...unknownKinds].join(', ')} — add the mapping or the schema; a kind is never passed unchecked`);
if (superseded.length > 0) console.log(`  note: ${superseded.length} older published version(s) do not validate and are superseded by a conformant latest version (immutable, so not repairable): ${superseded.join(', ')}`);
if (failures.length > 0) {
  console.error(`=== check-pack-manifest-schemas FAILED — ${failures.length} problem(s) ===`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`=== check-pack-manifest-schemas OK — ${sourceChecked} v2 source manifest(s) and the latest version of ${servedChecked} served pack(s) validate against the vendored bare-manifest schemas (CORPUS_TAG ${readFileSync(join(ROOT, 'CORPUS_TAG'), 'utf8').trim()}) ===`);
