#!/usr/bin/env node
/**
 * Auto-register — publish first-party packs that exist in `packs/` but are not
 * yet under `registry/<tree>/packs/<name>/-/<version>.*`.
 *
 * Scans `packs/`, and for every pack in a namespace the `openwop-team-1` key is
 * authorized to sign (`core.openwop.*`, `vendor.openwop.*`, `vendor.openwop-app.*`)
 * whose CURRENT source version has no published manifest in the selected tree,
 * builds a signed tarball and stages the three served files (`<ver>.tgz`,
 * `<ver>.json`, raw-64-byte `<ver>.sig`). Foreign namespaces
 * (`vendor.myndhyve.*`, `community.*`) are left to their own publishers.
 *
 *   node scripts/auto-register.mjs --key <private.pem> [--key-id openwop-team-1]
 *   node scripts/auto-register.mjs --tree v2 --key-file <pem> --scheme ed25519-canonical-json
 *   node scripts/auto-register.mjs --dry-run              # list unpublished, no signing
 *   node scripts/auto-register.mjs --changed-base <ref>   # only packs changed vs <ref>
 *
 * `--tree v1|v2` (RFC 0177 §A.2, default v1) selects the registry tree. A source
 * manifest belongs to exactly one tree (scripts/lib/registry-tree.mjs
 * `publicationTree`): a manifest migrated for the v2 wave — explicit ceiling
 * admitting protocol major 2, declaration-key peer dependencies — is a v2
 * manifest a v1 host would refuse (`pack_peer_dependency_undefined`), so the v1
 * run SKIPS it with a printed reason and the v1 tree stays read-only; the v2 run
 * publishes only such manifests. Under v2 the tarball is built with
 * `--tree v2 --scheme ed25519-canonical-json` (RFC 0177 §C.3; `--scheme` is
 * required, no default). For v1 the caller then runs `generate-sbom` +
 * `build-index`; for v2 this script runs both for the v2 tree itself
 * (`--no-reindex` to skip) so `--tree v2` writes registry/v2/index.json + the
 * per-pack indexes in one step.
 *
 * `--changed-base` scopes to packs touched since <ref> (the PR base) so a PR
 * publishes what it adds, not the whole backlog; omit it (a manual dispatch) to
 * sync every unpublished first-party pack. Writes `published=<n>` to $GITHUB_OUTPUT.
 */
import { readdirSync, existsSync, readFileSync, mkdirSync, copyFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { treeFromArgv, publicationTree, V2_SCHEME } from './lib/registry-tree.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const dryRun = argv.includes('--dry-run');
const tree = treeFromArgv(argv);
const keyPath = arg('--key') ?? arg('--key-file');
const keyId = arg('--key-id') ?? 'openwop-team-1';
const scheme = arg('--scheme');
const changedBase = arg('--changed-base');
const reindex = tree === 'v2' && !argv.includes('--no-reindex');
// Namespaces the openwop-team-1 key is permitted to sign (see registry .well-known).
const AUTHORIZED = [/^core\.openwop\./, /^vendor\.openwop\./, /^vendor\.openwop-app\./];

if (tree === 'v2' && !dryRun && scheme !== V2_SCHEME) {
  console.error(`auto-register: --tree v2 requires --scheme ${V2_SCHEME} (RFC 0177 §C.3 — one scheme, no default)`);
  process.exit(2);
}
if (tree === 'v1' && scheme !== undefined) {
  console.error('auto-register: --scheme applies to --tree v2 only');
  process.exit(2);
}

// When scoping to a PR, only consider packs whose source changed since the base.
let changedPacks = null;
if (changedBase) {
  const out = execFileSync('git', ['diff', '--name-only', `${changedBase}...HEAD`, '--', 'packs/'], { cwd: ROOT, encoding: 'utf8' });
  changedPacks = new Set(out.split('\n').map((l) => l.match(/^packs\/([^/]+)\//)?.[1]).filter(Boolean));
  console.log(`auto-register: scoped to ${changedPacks.size} pack(s) changed since ${changedBase}.`);
}

const emit = (n) => { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `published=${n}\n`); };

if (!dryRun && !keyPath) { console.error('auto-register: --key <pem> is required (or --dry-run)'); process.exit(2); }

const packsDir = join(ROOT, 'packs');
const treeDir = join(ROOT, 'registry', tree, 'packs');
const todo = [];
const otherTree = [];
for (const name of readdirSync(packsDir).sort()) {
  const pj = join(packsDir, name, 'pack.json');
  if (!existsSync(pj)) continue;
  if (!AUTHORIZED.some((re) => re.test(name))) continue;
  if (changedPacks && !changedPacks.has(name)) continue; // PR scope: only what this PR touched
  const manifest = JSON.parse(readFileSync(pj, 'utf-8'));
  const ver = manifest.version;
  if (existsSync(join(treeDir, name, '-', `${ver}.json`))) continue; // already published in this tree
  const belongs = publicationTree(manifest);
  if (belongs !== tree) { otherTree.push({ name, ver, belongs }); continue; }
  todo.push({ name, ver });
}

if (otherTree.length) {
  console.log(`auto-register [${tree}]: skipping ${otherTree.length} pack(s) whose publication tree is not ${tree} (RFC 0177 §A.1/§A.2 — the engines ceiling decides):`);
  for (const { name, ver, belongs } of otherTree) console.log(`  – ${name}@${ver} → ${belongs}`);
}
if (todo.length === 0) { console.log(`auto-register [${tree}]: nothing to publish — all first-party packs are up to date.`); emit(0); process.exit(0); }
console.log(`auto-register [${tree}]: ${todo.length} unpublished first-party pack(s):`);
for (const { name, ver } of todo) console.log(`  • ${name}@${ver}`);
if (dryRun) { emit(0); process.exit(0); }

for (const { name, ver } of todo) {
  const build = ['scripts/build-pack-tarball.mjs', '--pack', name, '--signed', '--key', keyPath, '--key-id', keyId, '--tree', tree];
  if (tree === 'v2') build.push('--scheme', scheme);
  execFileSync('node', build, { cwd: ROOT, stdio: 'inherit' });
  const dest = join(treeDir, name, '-');
  mkdirSync(dest, { recursive: true });
  const base = join(ROOT, 'dist/packs', `${name}-${ver}`);
  copyFileSync(`${base}.tgz`, join(dest, `${ver}.tgz`));
  copyFileSync(`${base}.manifest.json`, join(dest, `${ver}.json`));
  writeFileSync(join(dest, `${ver}.sig`), Buffer.from(readFileSync(`${base}.sig.b64`, 'utf-8').trim(), 'base64'));
  console.log(`  ✓ staged ${name}@${ver} → registry/${tree}`);
}
if (reindex) {
  execFileSync('node', ['registry/scripts/generate-sbom.mjs', '--tree', tree], { cwd: ROOT, stdio: 'inherit' });
  execFileSync('node', ['registry/scripts/build-index.mjs', '--tree', tree], { cwd: ROOT, stdio: 'inherit' });
  console.log(`auto-register [${tree}]: staged ${todo.length} pack(s); registry/${tree}/index.json + per-pack indexes + SBOMs written. Commit.`);
} else {
  console.log(`auto-register [${tree}]: staged ${todo.length} pack(s). Run generate-sbom + build-index (--tree ${tree}), then commit.`);
}
emit(todo.length);
