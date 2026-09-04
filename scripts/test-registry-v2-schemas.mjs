#!/usr/bin/env node
/**
 * test-registry-v2-schemas — the v2 tree conforms to the VENDORED v2 schemas.
 *
 * RFC 0177 §A.2 / §C.3–§C.5 (packs.md §"Signing", §"Version manifests"): every
 * `registry/v2/packs/<name>/-/<version>.json` MUST validate against
 * schemas/v2/registry-version-manifest.schema.json (pinned to CORPUS_TAG), carry
 * `signing: { keyId, scheme: ed25519-canonical-json }` and `kind`, and every
 * catalog row MUST use `/v2/` templates. The registry-wide index.json has NO
 * canonical schema at the tag (check-vendored-sync.mjs says so), so it gets
 * structural checks only.
 *
 * Two layers, so the test is never vacuous:
 *   1. self-tests on the vendored schema (always run): a synthetic v2 manifest
 *      validates; one carrying `method`, `publicKeyRef`, no `kind`, or an
 *      unbounded engines range is REJECTED. If a re-vendor ever loosens the
 *      schema, this layer goes red before any tree does.
 *   2. tree tests (skipped with a printed reason while registry/v2 is absent —
 *      the signed tree is produced only by the CI job holding the signing key).
 *
 *   node --test scripts/test-registry-v2-schemas.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { V2_SCHEME, signerOf } from './lib/registry-tree.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMAS_V2 = join(ROOT, 'schemas', 'v2');
const TREE_DIR = join(ROOT, 'registry', 'v2');
const PACKS_DIR = join(TREE_DIR, 'packs');
const RVM_ID = 'https://openwop.dev/spec/v2/registry-version-manifest.schema.json';

function ajvWithVendoredV2() {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  for (const f of readdirSync(SCHEMAS_V2).filter((f) => f.endsWith('.json')).sort()) {
    const schema = JSON.parse(readFileSync(join(SCHEMAS_V2, f), 'utf8'));
    ajv.addSchema(schema, schema.$id ?? f);
  }
  return ajv;
}
const ajv = ajvWithVendoredV2();
const validateRvm = ajv.getSchema(RVM_ID);
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const fmt = (errors) => (errors ?? []).slice(0, 4).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ');

// ─── layer 1: the vendored schema enforces RFC 0177 ─────────────────────────

const good = {
  name: 'core.openwop.fixture',
  version: '1.0.0',
  kind: 'node',
  engines: { openwop: '>=1.0.0 <3.0.0' },
  runtime: { language: 'javascript', entry: './index.mjs' },
  nodes: [{ typeId: 'core.openwop.fixture.echo', version: '1.0.0', category: 'utility', role: 'pure' }],
  signing: { keyId: 'openwop-team-1', scheme: V2_SCHEME },
  integrity: 'sha256-AAAA',
};

test('vendored v2 registry-version-manifest schema is present and compiles', () => {
  assert.ok(validateRvm, `schema ${RVM_ID} not found under schemas/v2/ — re-vendor (check-vendored-sync --write)`);
});

test('self-test: a v2-shaped manifest validates', () => {
  assert.ok(validateRvm(good), fmt(validateRvm.errors));
});

for (const [label, mutate] of [
  ['signing.method is rejected (RFC 0177 §C.3)', (m) => { m.signing = { ...m.signing, method: 'manual' }; }],
  ['signing.publicKeyRef is rejected (RFC 0177 §C.4)', (m) => { m.signing = { keyId: 'k', scheme: V2_SCHEME, publicKeyRef: 'k' }; }],
  ['a scheme other than ed25519-canonical-json is rejected', (m) => { m.signing = { keyId: 'k', scheme: 'ed25519' }; }],
  ['signing without keyId is rejected', (m) => { m.signing = { scheme: V2_SCHEME }; }],
  ['absent kind is rejected (RFC 0177 §C.5)', (m) => { delete m.kind; }],
  ['an engines range with no ceiling is rejected (RFC 0177 §A.1)', (m) => { m.engines = { openwop: '>=1.0.0' }; }],
]) {
  test(`self-test: ${label}`, () => {
    const m = structuredClone(good);
    mutate(m);
    assert.equal(validateRvm(m), false, 'the vendored schema accepted a manifest RFC 0177 forbids');
  });
}

// ─── layer 2: the tree ───────────────────────────────────────────────────────

const treePresent = existsSync(PACKS_DIR);
const skipReason = 'registry/v2 is absent — the signed v2 tree is produced only by the registry-v2-sign CI job (OPENWOP_TEAM_1_SIGNING_KEY); nothing to validate locally';
const packs = treePresent ? readdirSync(PACKS_DIR).filter((d) => existsSync(join(PACKS_DIR, d, '-'))).sort() : [];
const versionsOf = (pack) => readdirSync(join(PACKS_DIR, pack, '-')).filter((f) => /^[^/]+\.json$/.test(f) && !f.endsWith('.sbom.json')).map((f) => f.slice(0, -5)).sort();

test('every registry/v2 version manifest validates against the vendored v2 schema', { skip: treePresent ? false : skipReason }, () => {
  const failures = [];
  let checked = 0;
  for (const pack of packs) {
    for (const ver of versionsOf(pack)) {
      const manifest = readJson(join(PACKS_DIR, pack, '-', `${ver}.json`));
      checked++;
      if (!validateRvm(manifest)) failures.push(`${pack}@${ver}: ${fmt(validateRvm.errors)}`);
    }
  }
  assert.ok(checked > 0, 'registry/v2/packs exists but holds no version manifests');
  assert.deepEqual(failures, [], `${failures.length}/${checked} v2 manifest(s) fail the vendored schema:\n  ${failures.slice(0, 12).join('\n  ')}${failures.length > 12 ? `\n  … ${failures.length - 12} more` : ''}`);
});

test('every registry/v2 version manifest carries exactly { keyId, scheme } and kind (RFC 0177 §C.3–§C.5)', { skip: treePresent ? false : skipReason }, () => {
  const failures = [];
  for (const pack of packs) {
    for (const ver of versionsOf(pack)) {
      const manifest = readJson(join(PACKS_DIR, pack, '-', `${ver}.json`));
      const { problems } = signerOf(manifest, 'v2');
      if (problems.length) failures.push(`${pack}@${ver}: ${problems.join('; ')}`);
      if (Object.keys(manifest.signing ?? {}).join(',') !== 'keyId,scheme') failures.push(`${pack}@${ver}: signing keys are [${Object.keys(manifest.signing ?? {})}], expected [keyId, scheme] in that order`);
      if (typeof manifest.kind !== 'string') failures.push(`${pack}@${ver}: kind absent`);
      if (!/^>=\d+(\.\d+){0,2} <([3-9]|\d{2,})\.0\.0$/.test(manifest.engines?.openwop ?? '')) failures.push(`${pack}@${ver}: engines.openwop "${manifest.engines?.openwop}" does not admit protocol major 2`);
    }
  }
  assert.deepEqual(failures, [], failures.join('\n'));
});

test('every registry/v2 per-pack index row uses /v2/ templates and names the manifest signer', { skip: treePresent ? false : skipReason }, () => {
  const failures = [];
  for (const pack of packs) {
    const idx = readJson(join(PACKS_DIR, pack, 'index.json'));
    if (typeof idx.kind !== 'string') failures.push(`${pack}: index.json kind absent`);
    for (const row of idx.versions ?? []) {
      for (const k of ['manifestUrl', 'tarballUrl', 'signatureUrl', 'sbomUrl']) {
        if (!(row[k] ?? '').startsWith(`/v2/packs/${pack}/-/${row.version}`)) failures.push(`${pack}@${row.version}: ${k}=${row[k]} is not a /v2/ template`);
      }
      if (row.signingScheme !== V2_SCHEME) failures.push(`${pack}@${row.version}: signingScheme=${row.signingScheme}`);
      const manifest = readJson(join(PACKS_DIR, pack, '-', `${row.version}.json`));
      if (row.signingKeyId !== manifest.signing?.keyId) failures.push(`${pack}@${row.version}: signingKeyId=${row.signingKeyId} ≠ manifest keyId=${manifest.signing?.keyId}`);
      if ('signingMethod' in row || 'deprecated' in row) failures.push(`${pack}@${row.version}: v1 row fields (signingMethod/deprecated) present`);
    }
  }
  assert.deepEqual(failures, [], failures.join('\n'));
});

test('registry/v2/index.json is structurally a registry index (no canonical schema at CORPUS_TAG)', { skip: treePresent ? false : skipReason }, () => {
  const idx = readJson(join(TREE_DIR, 'index.json'));
  assert.equal(idx.packCount, packs.length, 'packCount ≠ number of packs under registry/v2/packs');
  assert.deepEqual(idx.packs.map((p) => p.name), packs, 'index.json packs[] ≠ on-disk packs');
  for (const p of idx.packs) {
    assert.equal(typeof p.kind, 'string', `${p.name}: kind absent in index.json`);
    assert.match(p.latestVersion, /^\d+\.\d+\.\d+/, `${p.name}: latestVersion`);
  }
});
