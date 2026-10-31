#!/usr/bin/env node
/**
 * check-pack-peer-dependencies — every peer-dependency key a pack declares
 * names a capability family that actually exists.
 *
 * `spec/v2/core/packs.md` §"Peer-dependency identifiers": a key MUST be a
 * `families[].key` in `spec/v2/declaration.json` whose `anchor` is not
 * `deleted` — equivalently a root key of the generated capabilities schema — or
 * carry a row in `spec/v2/peer-dependency-aliases.json`, which is how a v1-era
 * key reaches a v2 family through the overlap. A host refuses an unknown key
 * with `pack_peer_dependency_undefined`.
 *
 * WHY THIS FILE EXISTS. Nothing checked it here. The rule is enforced at INSTALL
 * by a host, which means a registry could publish a pack naming a family that
 * does not exist and nobody would learn until someone tried to install it. The
 * corpus's own witness (`check-declaration.mjs` rule 7) reads
 * `evidence/cross-repo-manifests.json`, which is generated from `registry/v1`
 * ONLY — so a v2 rule was being witnessed against the one tree it does not bind.
 *
 * WHY STRICT ON v2 AND ALIAS-TOLERANT ON v1. The overlap alias is a v1 grammar
 * (`removalTrigger: v1-end-of-support`). Measured at CORPUS_TAG when this landed:
 * source `packs/` 21 distinct keys / 0 failures, `registry/v2` 21 / 0, and
 * `registry/v1` 28 keys of which 23 are alias-only (`host.agentRuntime` x41,
 * `openwop.agents.memoryBackends` x11, ...) and every one has an alias row. So
 * the strictest available rule already passes the v2 surfaces and the frozen v1
 * tree needs the hatch its own era defined. This gate is GREEN on day one: it is
 * a regression floor, not a burn-down.
 *
 * The declaration and the alias table are VENDORED beside the schemas at
 * CORPUS_TAG, so this needs no network and no sibling checkout. Family KEYS are
 * stable across pins in a way facets are not, which is why this gate asserts
 * keys only — a facet assertion against a pinned facet set would red on a corpus
 * that had since moved.
 *
 * WHY ONLY THE CURRENT VERSION IS STRICT (RFC 0255 §D, 2026-10-31). A published
 * manifest is immutable, so when the corpus deletes a family (RFC 0255 deleted
 * `aiEnvelope`), every old version naming it would red this gate forever with no
 * fix available. Source packs and each pack's newest non-yanked version (by its
 * `index.json`) are judged strictly: that is what a host installs by default and
 * what a publisher can still change. Earlier and yanked versions are REPORTED, not
 * failed; a fully yanked pack has no current version. The frozen v1 tree cannot
 * be republished either, so a v1 key naming a deleted family is reported there.
 * An alias row with no family (`deletedFamily`) is not an alias.
 *
 *   node scripts/check-pack-peer-dependencies.mjs [--tree v1|v2|source]
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n) => { const i = process.argv.indexOf(n); return i === -1 ? undefined : process.argv[i + 1]; };
const tree = arg('--tree') ?? 'all';

const declPath = join(ROOT, 'spec', 'v2', 'declaration.json');
const aliasPath = join(ROOT, 'spec', 'v2', 'peer-dependency-aliases.json');
if (!existsSync(declPath)) { console.error('check-pack-peer-dependencies: vendored spec/v2/declaration.json is missing — run the vendor sync'); process.exit(1); }

const decl = JSON.parse(readFileSync(declPath, 'utf8'));
const families = new Set((decl.families ?? []).filter((f) => f.anchor !== 'deleted').map((f) => f.key));
const aliasRows = existsSync(aliasPath) ? (JSON.parse(readFileSync(aliasPath, 'utf8')).rows ?? []) : [];
const aliases = new Set(aliasRows.filter((r) => r.family).map((r) => r.alias));
/** v1-era keys of a family the corpus deleted: the frozen v1 tree cannot be republished, so these are reported there. */
const deletedAliases = new Set(aliasRows.filter((r) => r.deletedFamily).map((r) => r.alias));

/** The newest non-yanked version of a published pack, by its index.json, or null. */
const semver = (v) => String(v).split(/[.+-]/).slice(0, 3).map((x) => Number.parseInt(x, 10) || 0);
const newer = (a, b) => { const x = semver(a), y = semver(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; };
function currentVersion(packDir) {
  let index; try { index = JSON.parse(readFileSync(join(packDir, 'index.json'), 'utf8')); } catch { return null; }
  let latest = null;
  for (const v of index.versions ?? []) if (!v.yanked && (latest === null || newer(v.version, latest))) latest = v.version;
  return latest;
}

const manifests = (t) => {
  const out = [];
  if (t === 'source') {
    const d = join(ROOT, 'packs');
    if (!existsSync(d)) return out;
    for (const p of readdirSync(d)) { const f = join(d, p, 'pack.json'); if (existsSync(f)) out.push({ file: f, strict: true }); }
    return out;
  }
  const d = join(ROOT, 'registry', t, 'packs');
  if (!existsSync(d)) return out;
  for (const p of readdirSync(d)) {
    const v = join(d, p, '-');
    if (!existsSync(v)) continue;
    const current = currentVersion(join(d, p));
    for (const f of readdirSync(v)) if (f.endsWith('.json') && !f.endsWith('.sbom.json')) out.push({ file: join(v, f), strict: current !== null && f === `${current}.json` });
  }
  return out;
};

let failures = [], reported = [], checked = 0;
const keys = new Map();
for (const t of tree === 'all' ? ['source', 'v2', 'v1'] : [tree]) {
  // The alias hatch is a v1 grammar: a manifest in the v2 tree (or a source pack,
  // which is what the v2 tree is cut from) may not reach a family through it.
  const allowAlias = t === 'v1';
  for (const { file, strict } of manifests(t)) {
    let m; try { m = JSON.parse(readFileSync(file, 'utf8')); } catch { continue; }
    const pd = m.peerDependencies ?? {};
    if (!Object.keys(pd).length) continue;
    checked += 1;
    for (const k of Object.keys(pd)) {
      keys.set(k, (keys.get(k) ?? 0) + 1);
      if (families.has(k)) continue;
      if (allowAlias && aliases.has(k)) continue;
      const why = aliases.has(k)
        ? `is an OVERLAP ALIAS (spec/v2/peer-dependency-aliases.json), which a ${t} manifest may not use — a v2-admitting pack names the family directly`
        : 'names no family in spec/v2/declaration.json and has no overlap-alias row — a host refuses it with pack_peer_dependency_undefined';
      (strict && !(t === 'v1' && deletedAliases.has(k)) ? failures : reported).push(`  ${file.replace(ROOT + '/', '')}: peerDependencies["${k}"] ${why}`);
    }
  }
}

if (reported.length) console.log(`  reported, not failed — ${reported.length} key(s) in earlier or yanked published versions, which are immutable:\n${reported.join('\n')}`);
console.log(`  ${checked} manifest(s) with peerDependencies; ${keys.size} distinct key(s); ${families.size} family key(s) + ${aliases.size} overlap alias(es) vendored at CORPUS_TAG`);
if (failures.length) {
  console.error(`=== check-pack-peer-dependencies FAILED — ${failures.length} undefined peer-dependency key(s) ===\n${failures.join('\n')}`);
  process.exit(1);
}
console.log('=== check-pack-peer-dependencies OK — every peer-dependency key resolves to a declared family (v1 may use an overlap alias; v2 and source may not) ===');
