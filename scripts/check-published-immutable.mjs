#!/usr/bin/env node
/**
 * A published v2 version is immutable, and a new one is signed by an `active`
 * key (openwop RFC 0222; spec/v2/core/packs.md §Signing and §"Version manifests").
 *
 * Compares the working tree's `registry/v2/packs/**` against a base ref (the PR
 * base in CI, `origin/main` locally) and refuses:
 *
 *   (a) a published version — one whose `<version>.json` exists at the base —
 *       whose `.tgz` or `.sig` changed or disappeared (the tarball carries the
 *       signed `pack.json`, so its bytes cover that too), or whose version
 *       manifest changed anything but the unsigned lifecycle fields:
 *       `yanked`, `yankedReason`, `versionDeprecated`, `deprecationReason`,
 *       `supersededBy`, `advisoryUrl`. Republishing a version is `version_conflict`.
 *   (b) a version NEW in the diff whose `signing.keyId` does not name a
 *       `signingKeys[]` entry with `status: "active"` in the working tree's
 *       `.well-known/openwop-registry.json`. Only an active key signs a new
 *       publication; a key that is not active keeps verifying what it signed.
 *
 * The served tree cannot decide (b) — `publishedAt` is unsigned and a key has no
 * retirement time — so this diff is the one place it is enforced.
 *
 * Usage: node scripts/check-published-immutable.mjs [--base <ref>]
 *   default base: origin/$GITHUB_BASE_REF in a pull_request run, else origin/main.
 *   A base ref that does not resolve is a SKIP with the reason (a push to main
 *   was already checked on its PR; a shallow local clone has no base).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PACKS = 'registry/v2/packs';
const DISCOVERY = 'registry/.well-known/openwop-registry.json';
export const LIFECYCLE_FIELDS = new Set(['yanked', 'yankedReason', 'versionDeprecated', 'deprecationReason', 'supersededBy', 'advisoryUrl']);

const argv = process.argv.slice(2);
const i = argv.indexOf('--base');
const base = i >= 0 ? argv[i + 1] : process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'origin/main';

const git = (args, opts = {}) => execFileSync('git', args, { cwd: ROOT, maxBuffer: 1 << 28, ...opts });

try {
  git(['rev-parse', '--verify', '--quiet', `${base}^{commit}`], { stdio: 'ignore' });
} catch {
  console.log(`⚠ check-published-immutable — SKIP: base ref ${base} does not resolve here (fetch it, or pass --base <ref>)`);
  process.exit(0);
}

const baseFiles = new Set(git(['ls-tree', '-r', '--name-only', base, '--', PACKS], { encoding: 'utf8' }).split('\n').filter(Boolean));
const baseBytes = (p) => git(['show', `${base}:${p}`]);
const VERSION_JSON = /^registry\/v2\/packs\/([^/]+)\/-\/([^/]+)\.json$/;
const isVersionManifest = (p) => VERSION_JSON.test(p) && !p.endsWith('.sbom.json');

/** Stable JSON with the lifecycle fields removed, for "nothing else changed". */
function frozen(obj) {
  const strip = Object.fromEntries(Object.entries(obj).filter(([k]) => !LIFECYCLE_FIELDS.has(k)));
  const canon = (v) => Array.isArray(v) ? `[${v.map(canon).join(',')}]`
    : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`
    : JSON.stringify(v);
  return canon(strip);
}

const problems = [];
let published = 0;

// (a) every version published at the base
for (const p of [...baseFiles].filter(isVersionManifest)) {
  published += 1;
  const [, name, version] = VERSION_JSON.exec(p);
  const at = `${name}@${version}`;
  const stem = p.slice(0, -'.json'.length);
  if (!existsSync(join(ROOT, p))) { problems.push(`${at}: the published version manifest was deleted`); continue; }
  for (const ext of ['.tgz', '.sig']) {
    const f = stem + ext;
    if (!baseFiles.has(f)) continue;
    if (!existsSync(join(ROOT, f))) problems.push(`${at}: published ${ext} was deleted`);
    else if (!baseBytes(f).equals(readFileSync(join(ROOT, f)))) problems.push(`${at}: published ${ext} was modified`);
  }
  let before, after;
  try { before = JSON.parse(baseBytes(p).toString('utf8')); after = JSON.parse(readFileSync(join(ROOT, p), 'utf8')); }
  catch (e) { problems.push(`${at}: version manifest does not parse (${e.message})`); continue; }
  if (frozen(before) !== frozen(after)) {
    const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .filter((k) => !LIFECYCLE_FIELDS.has(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
    problems.push(`${at}: published version manifest changed outside the lifecycle fields (${changed.join(', ')})`);
  }
}

// (b) every version new in the working tree
const discovery = JSON.parse(readFileSync(join(ROOT, DISCOVERY), 'utf8'));
const keys = new Map((discovery.signingKeys ?? []).map((k) => [k.keyId, k]));
const current = git(['ls-files', '--cached', '--others', '--exclude-standard', '--', PACKS], { encoding: 'utf8' }).split('\n').filter(Boolean);
let added = 0;
for (const p of current.filter((f) => isVersionManifest(f) && !baseFiles.has(f) && existsSync(join(ROOT, f)))) {
  added += 1;
  const [, name, version] = VERSION_JSON.exec(p);
  const keyId = JSON.parse(readFileSync(join(ROOT, p), 'utf8')).signing?.keyId;
  const key = keys.get(keyId);
  if (!key) problems.push(`${name}@${version}: new version signed by ${keyId ?? '(no keyId)'}, which signingKeys[] does not list`);
  else if (key.status !== 'active') problems.push(`${name}@${version}: new version signed by ${keyId}, whose status is "${key.status}" — only an active key signs a new publication`);
}

if (problems.length) {
  console.error(`✗ check-published-immutable (base ${base}) — ${problems.length} problem(s) (packs.md §Signing / §"Version manifests"; version_conflict / pack_signature_invalid):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`✓ check-published-immutable (base ${base}): ${published} published v2 version(s) unchanged outside lifecycle fields; ${added} new version(s) signed by an active key`);
