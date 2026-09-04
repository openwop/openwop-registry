#!/usr/bin/env node
// check-vendored-sync — drift guard for vendored copies of canonical spec artifacts.
//
// schemas/ (v1 at the root, v2 under schemas/v2/), spec/v2/*.json and, where
// present, api/openapi.yaml in this repo are VENDORED copies of normative
// artifacts whose single source of truth is the openwop/openwop spec corpus.
// This script reads each canonical file from that corpus AT THE PINNED TAG and
// fails if a vendored copy has drifted. Run in CI (scheduled + on PRs that touch
// the vendored paths) so a downstream gate can never validate against a stale
// contract.
//
// PINNED (2026-09-03, RFC 0176 §E.1 / G3 + RFC 0177 §C.6 — v2 charter Phase 3,
// P3-0). The canonical ref is the corpus tag recorded in ./CORPUS_TAG — either a
// conformance-suite tag (`openwop-conformance/vX.Y.Z`) or a corpus release tag
// (`vX.Y.Z[-rc.N]`) — never `main`. The v2 tree (`schemas/v2/`, `spec/v2/`) is
// vendored BESIDE the v1 set from the same tag; the relative path of every
// vendored file equals its canonical path, so one list serves both.
//
// Modes:
//   node scripts/check-vendored-sync.mjs                    # check, over the network at the tag
//   node scripts/check-vendored-sync.mjs --source <dir>     # check, offline: `git -C <dir> show <TAG>:<path>`
//   node scripts/check-vendored-sync.mjs --write [--source <dir>]
//        re-vendor: overwrite every vendored file (and every file in VENDORED_V2
//        not yet on disk) from the tag. `--source` reads the tag out of a local
//        corpus checkout's object store — never its working tree — so an offline
//        re-vendor is still tag-pinned. CI re-vendors over the network.
//
// OPENWOP_SPEC_RAW_BASE still overrides the network base (e.g. a mirror), but
// the default is derived from CORPUS_TAG and the script refuses to run without it.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const WRITE = argv.includes('--write');
const SOURCE = arg('--source');

const TAG_FILE = join(ROOT, 'CORPUS_TAG');
const TAG = existsSync(TAG_FILE) ? readFileSync(TAG_FILE, 'utf8').trim() : '';
const TAG_RE = /^(openwop-conformance\/v\d+\.\d+\.\d+|v\d+\.\d+\.\d+(-rc\.\d+)?)$/;
if (!TAG_RE.test(TAG)) {
  console.error(`check-vendored-sync: CORPUS_TAG must name a corpus tag (openwop-conformance/vX.Y.Z or vX.Y.Z[-rc.N]); got "${TAG}" — the guard never follows main`);
  process.exit(2);
}
const BASE = process.env.OPENWOP_SPEC_RAW_BASE
  ?? `https://raw.githubusercontent.com/openwop/openwop/${TAG}`;

/**
 * The v2 vendored set (RFC 0177 §C.1 / packs.md §"The manifest schema family"):
 * the 13 manifest schemas the RFC names, plus the two leaves they `$ref`
 * (`prompt-ref`, `prompt-kind`) and `ids` (`keyId`, `templateId`, `chainId`,
 * `agentId`, `pluginId`). Listed explicitly so `--write` can vendor them on a
 * tree that does not have them yet; once on disk they are checked like any
 * other vendored file. NOTE: the tag carries no registry-index schema — the
 * registry-wide `index.json` has no canonical schema at v2.0.0-rc.0.
 */
export const VENDORED_V2 = [
  'schemas/v2/agent-manifest.schema.json',
  'schemas/v2/artifact-type-pack-manifest.schema.json',
  'schemas/v2/chat-card-pack-manifest.schema.json',
  'schemas/v2/connection-pack-manifest.schema.json',
  'schemas/v2/form-content-pack-manifest.schema.json',
  'schemas/v2/frontend-plugin-manifest.schema.json',
  'schemas/v2/node-pack-manifest.schema.json',
  'schemas/v2/pack-lockfile.schema.json',
  'schemas/v2/prompt-pack-manifest.schema.json',
  'schemas/v2/prompt-template.schema.json',
  'schemas/v2/registry-version-manifest.schema.json',
  'schemas/v2/security-advisory.schema.json',
  'schemas/v2/workflow-chain-pack-manifest.schema.json',
  'schemas/v2/prompt-ref.schema.json',
  'schemas/v2/prompt-kind.schema.json',
  'schemas/v2/ids.schema.json',
];

// Vendored paths to verify, relative to repo root. These mirror the canonical
// layout exactly, so the relative path doubles as the canonical path.
function walkJson(dirRel, out) {
  const dir = join(ROOT, dirRel);
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir).sort()) {
    const rel = `${dirRel}/${f}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walkJson(rel, out);
    else if (f.endsWith('.json')) out.push(rel);
  }
}
const vendored = [];
walkJson('schemas', vendored);
walkJson('spec/v2', vendored);
for (const extra of ['api/openapi.yaml', 'api/asyncapi.yaml']) {
  if (existsSync(join(ROOT, extra))) vendored.push(extra);
}
if (WRITE) for (const p of VENDORED_V2) if (!vendored.includes(p)) vendored.push(p);
vendored.sort();

if (vendored.length === 0) {
  console.log('check-vendored-sync: no vendored artifacts found — nothing to verify.');
  process.exit(0);
}

/** Returns the canonical text at the tag, or null when the path does not exist there. */
async function canonicalText(rel) {
  if (SOURCE) {
    try {
      execFileSync('git', ['-C', SOURCE, 'cat-file', '-e', `${TAG}:${rel}`], { stdio: 'pipe' });
    } catch {
      return null;
    }
    return execFileSync('git', ['-C', SOURCE, 'show', `${TAG}:${rel}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  }
  const res = await fetch(`${BASE}/${rel}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    console.error(`  FAIL: could not fetch canonical ${rel} (HTTP ${res.status})`);
    process.exit(2);
  }
  return res.text();
}

console.log(`check-vendored-sync: canonical ref = ${SOURCE ? `${TAG} (git object store at ${SOURCE})` : process.env.OPENWOP_SPEC_RAW_BASE ? 'OPENWOP_SPEC_RAW_BASE' : TAG}${WRITE ? ' [--write]' : ''}`);

const drift = [];
const missing = [];
let checked = 0;
let written = 0;

for (const rel of vendored) {
  const canonical = await canonicalText(rel);
  if (canonical === null) {
    missing.push(rel);
    continue;
  }
  const localPath = join(ROOT, rel);
  const local = existsSync(localPath) ? readFileSync(localPath, 'utf8') : null;
  // Normalize trailing-newline differences only; any real content delta is drift.
  const same = local !== null && local.replace(/\s+$/, '') === canonical.replace(/\s+$/, '');
  if (WRITE) {
    if (!same) {
      mkdirSync(dirname(localPath), { recursive: true });
      writeFileSync(localPath, canonical);
      written++;
      console.log(`  wrote ${rel}`);
    }
  } else if (!same) {
    drift.push(rel);
  }
  checked++;
}

if (missing.length) {
  console.error(`  FAIL: ${missing.length} vendored file(s) do not exist in the canonical corpus at ${TAG} (renamed/removed upstream, or not yet published at this tag):`);
  for (const m of missing) console.error(`    - ${m}`);
}
if (drift.length) {
  console.error(`  FAIL: ${drift.length} vendored file(s) have drifted from openwop/openwop@${TAG}:`);
  for (const d of drift) console.error(`    - ${d}  (refresh: node scripts/check-vendored-sync.mjs --write)`);
}
if (missing.length || drift.length) {
  console.error('\n  Vendored spec artifacts are out of sync with the canonical corpus. Re-vendor them.');
  process.exit(1);
}

if (WRITE) console.log(`  ok: ${written} file(s) written; ${checked} vendored spec artifact(s) now match openwop/openwop@${TAG}.`);
else console.log(`  ok: all ${checked} vendored spec artifact(s) match openwop/openwop@${TAG}.`);
