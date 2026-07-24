#!/usr/bin/env node
/**
 * Auto-register — publish first-party packs that exist in `packs/` but are not
 * yet under `registry/v1/packs/<name>/-/<version>.*`.
 *
 * Scans `packs/`, and for every pack in a namespace the `openwop-team-1` key is
 * authorized to sign (`core.openwop.*`, `vendor.openwop.*`) whose CURRENT source
 * version has no published manifest, builds a signed tarball and stages the three
 * served files (`<ver>.tgz`, `<ver>.json`, raw-64-byte `<ver>.sig`). The caller
 * then runs `generate-sbom` + `build-index` and commits. Foreign namespaces
 * (`vendor.myndhyve.*`, `community.*`) are left to their own publishers.
 *
 *   node scripts/auto-register.mjs --key <private.pem> [--key-id openwop-team-1]
 *   node scripts/auto-register.mjs --dry-run              # list unpublished, no signing
 *   node scripts/auto-register.mjs --changed-base <ref>   # only packs changed vs <ref>
 *
 * `--changed-base` scopes to packs touched since <ref> (the PR base) so a PR
 * publishes what it adds, not the whole backlog; omit it (a manual dispatch) to
 * sync every unpublished first-party pack. Writes `published=<n>` to $GITHUB_OUTPUT.
 */
import { readdirSync, existsSync, readFileSync, mkdirSync, copyFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const dryRun = argv.includes('--dry-run');
const keyPath = arg('--key');
const keyId = arg('--key-id') ?? 'openwop-team-1';
const changedBase = arg('--changed-base');
// Namespaces the openwop-team-1 key is permitted to sign (see registry .well-known).
const AUTHORIZED = [/^core\.openwop\./, /^vendor\.openwop\./, /^vendor\.openwop-app\./];

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
const todo = [];
for (const name of readdirSync(packsDir).sort()) {
  const pj = join(packsDir, name, 'pack.json');
  if (!existsSync(pj)) continue;
  if (!AUTHORIZED.some((re) => re.test(name))) continue;
  if (changedPacks && !changedPacks.has(name)) continue; // PR scope: only what this PR touched
  const ver = JSON.parse(readFileSync(pj, 'utf-8')).version;
  if (existsSync(join(ROOT, 'registry/v1/packs', name, '-', `${ver}.json`))) continue; // already published
  todo.push({ name, ver });
}

if (todo.length === 0) { console.log('auto-register: nothing to publish — all first-party packs are up to date.'); emit(0); process.exit(0); }
console.log(`auto-register: ${todo.length} unpublished first-party pack(s):`);
for (const { name, ver } of todo) console.log(`  • ${name}@${ver}`);
if (dryRun) { emit(0); process.exit(0); }

for (const { name, ver } of todo) {
  execFileSync('node', ['scripts/build-pack-tarball.mjs', '--pack', name, '--signed', '--key', keyPath, '--key-id', keyId], { cwd: ROOT, stdio: 'inherit' });
  const dest = join(ROOT, 'registry/v1/packs', name, '-');
  mkdirSync(dest, { recursive: true });
  const base = join(ROOT, 'dist/packs', `${name}-${ver}`);
  copyFileSync(`${base}.tgz`, join(dest, `${ver}.tgz`));
  copyFileSync(`${base}.manifest.json`, join(dest, `${ver}.json`));
  writeFileSync(join(dest, `${ver}.sig`), Buffer.from(readFileSync(`${base}.sig.b64`, 'utf-8').trim(), 'base64'));
  console.log(`  ✓ staged ${name}@${ver}`);
}
console.log(`auto-register: staged ${todo.length} pack(s). Run generate-sbom + build-index, then commit.`);
emit(todo.length);
