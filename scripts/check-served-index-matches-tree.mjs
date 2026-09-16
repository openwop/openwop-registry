#!/usr/bin/env node
/**
 * check-served-index-matches-tree — every served index names the version its
 * own tree is supposed to publish, and nothing else.
 *
 * ## Why this exists
 *
 * The registry is versioned by TREE (RFC 0177 §A.2), and the two trees hold
 * deliberately different things: `auto-register` SKIPS any manifest whose
 * engines ceiling admits protocol major 2, so the v1 tree stays read-only
 * through the overlap while v2-wave packs publish into `registry/v2/`.
 *
 * That design is correct and it is also invisible to anyone measuring it. On
 * 2026-09-16 a host operator compared `packs/` against `registry/v1/index.json`
 * and found 154 of 156 packs "drifted"; a second session reproduced the number
 * and confirmed the finding; both were measuring a comparison the overlap
 * contract makes meaningless. Against the tree that actually serves major-2
 * clients, the drift was ZERO.
 *
 * Two things let that run: the v1 index legitimately differs from `packs/` and
 * nothing said so, and `generatedAt` had been a frozen literal since the first
 * build, so a current file advertised itself as four months old.
 *
 * ## What it checks
 *
 * The two trees are held to DIFFERENT rules, because they are different kinds
 * of object. Getting this wrong is how the original misdiagnosis happened, and
 * the first draft of this very script repeated it — it asserted that no
 * v2-publishing pack may appear in the v1 index and reported 154 violations,
 * every one of them correct behaviour.
 *
 *   v2 — the LIVE tree. Every manifest whose publicationTree() is `v2` MUST
 *        appear at its highest on-disk version. This is the tree a major-2
 *        client resolves against, so drift here is a real defect.
 *
 *   v1 — a FROZEN HISTORICAL RECORD. `auto-register` stops *updating* entries
 *        whose manifest grew a major-2 ceiling; it does not remove them, and it
 *        must not. A v1 client keeps resolving what it always resolved. So a v1
 *        entry may legitimately name an OLD version of a pack that now
 *        publishes to v2 — what it may NOT do is name a version that never
 *        existed on disk, or one NEWER than disk (which would mean the freeze
 *        leaked).
 *
 *   both — `generatedAt` parses and is not the frozen 2026-05-10 literal.
 *
 * Found on its first honest run: `community.openwop-team.demo` is 0.1.1 on
 * disk and admits major 2, so it belongs in the v2 tree — and is absent from
 * it, still pinned at 0.1.0 in v1. One real omission inside a reported 154.
 *
 * Usage: node scripts/check-served-index-matches-tree.mjs
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicationTree } from './lib/registry-tree.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FROZEN = '2026-05-10T00:00:00Z';

/**
 * Packs that belong in the v2 tree and are not there yet, each because
 * registering one needs an ed25519 signature that ONLY the `auto-register`
 * workflow can mint (`.github/workflows/auto-register.yml` — "the signing key
 * exists ONLY here"). A local run cannot clear these; a `workflow_dispatch` of
 * auto-register can.
 *
 * This list is SHRINK-ONLY: the check fails if an entry here is already
 * registered (stale waiver) as loudly as it fails for an unwaived gap, so the
 * list cannot quietly become the place unregistered packs go to be forgotten.
 */
const PENDING_V2_REGISTRATION = new Map([
  ['community.openwop-team.demo', '0.1.1 is on disk and admits major 2; the v2 tree still has no signed tarball for it. Found 2026-09-16 by this check\'s first honest run.'],
]);

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const cmp = (a, b) => {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
};

/** Highest on-disk version per pack name, with the tree its manifest publishes to. */
function sourceManifests() {
  const out = new Map();
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!e.endsWith('.json')) continue;
      let m;
      try { m = readJson(p); } catch { continue; }
      if (!m || typeof m.name !== 'string' || typeof m.version !== 'string') continue;
      const prev = out.get(m.name);
      if (!prev || cmp(m.version, prev.version) > 0) out.set(m.name, { version: m.version, tree: publicationTree(m) });
    }
  };
  walk(join(ROOT, 'packs'));
  return out;
}

/**
 * Versions a tree has actually published for a pack. This is the per-pack
 * index, NOT `packs/` — `packs/` carries one manifest per pack (the current
 * one), so it can never testify about history.
 */
function archivedVersions(tree, name) {
  const p = join(ROOT, 'registry', tree, 'packs', name, 'index.json');
  if (!existsSync(p)) return new Set();
  try { return new Set((readJson(p).versions ?? []).map((v) => v.version)); } catch { return new Set(); }
}

const problems = [];
const pending = [];
const source = sourceManifests();

for (const tree of ['v1', 'v2']) {
  const idxPath = join(ROOT, 'registry', tree, 'index.json');
  if (!existsSync(idxPath)) { problems.push(`registry/${tree}/index.json is missing`); continue; }
  const idx = readJson(idxPath);
  const served = new Map((idx.packs ?? []).map((p) => [p.name, p.latestVersion]));

  // 3. the timestamp must not lie
  if (idx.generatedAt === FROZEN) {
    problems.push(`registry/${tree}/index.json: generatedAt is the frozen ${FROZEN} literal — a current index that advertises itself as stale sends readers hunting the wrong defect`);
  } else if (Number.isNaN(Date.parse(idx.generatedAt ?? ''))) {
    problems.push(`registry/${tree}/index.json: generatedAt is not a parseable timestamp (${JSON.stringify(idx.generatedAt)})`);
  }

  if (tree === 'v2') {
    // The live tree: everything assigned here is here, at the current version.
    for (const [name, { version, tree: belongs }] of source) {
      if (belongs !== 'v2') continue;
      if (!served.has(name)) {
        const why = PENDING_V2_REGISTRATION.get(name);
        if (why) pending.push(`${name} — ${why}`);
        else problems.push(`registry/v2: ${name} admits major 2 (publishes to v2) but the v2 index does not name it — a major-2 client cannot resolve it`);
      } else if (PENDING_V2_REGISTRATION.has(name)) {
        problems.push(`registry/v2: ${name} is waived as PENDING_V2_REGISTRATION but IS registered — drop the waiver`);
      } else if (served.get(name) !== version) {
        problems.push(`registry/v2: ${name} is ${version} on disk, ${served.get(name)} in the index`);
      }
    }
  } else {
    // The frozen tree: entries are historical. They may lag; they may not be
    // invented, and they may not run AHEAD of disk.
    for (const [name, served_v] of served) {
      // The version ARCHIVE is the per-pack index, not packs/ — packs/ holds
      // only each pack's current manifest. (This script's second draft asserted
      // the served version must appear under packs/ and reported ~150
      // violations, all of them the single-version source layout.)
      if (!archivedVersions('v1', name).has(served_v)) {
        problems.push(`registry/v1: ${name} is served at ${served_v}, which its own registry/v1/packs/${name}/index.json does not list`);
        continue;
      }
      const src = source.get(name);
      if (src && cmp(served_v, src.version) > 0) {
        problems.push(`registry/v1: ${name} is served at ${served_v}, AHEAD of the ${src.version} under packs/ — the overlap freeze leaked`);
      }
    }
  }
}

if (problems.length) {
  console.error(`=== check-served-index-matches-tree FAILED — ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ${p}`);
  console.error('===');
  process.exit(1);
}
for (const p of pending) console.warn(`  PENDING v2 registration (needs the auto-register signing key): ${p}`);
console.log(`=== check-served-index-matches-tree OK — both trees serve exactly what their publication rule assigns them (${source.size} source manifests, ${pending.length} pending registration) ===`);
