#!/usr/bin/env node
/**
 * codemod-pack-manifest-v2 — batch driver for `openwop.codemod.pack-manifest-v2`
 * (RFC 0177 rows C10.4, C10.6, C10.8 — and C10.1/C10.7 when a source manifest
 * carries a signing block) over the pack SOURCES in `packs/`.
 *
 * The peer-dependency identifier in v2 IS the declaration-file key (RFC 0177
 * §B.1, packs.md §"Peer-dependency identifiers"): every `peerDependencies` key
 * MUST be a root key of spec/v2/declaration.json (a family whose anchor is
 * `core` or `ext`; a `deleted` family is not an identifier). The four v1
 * grammars in the wild (`host.*` dotted, bare, `openwop.*`, facet paths) are
 * rewritten through the GENERATED alias table spec/v2/peer-dependency-aliases.json
 * (§B.2): `alias → family`, with facets moved into
 * `peerDependenciesMeta.<family>.facets[]`. Both files are vendored from the
 * pinned corpus tag (CORPUS_TAG) — the driver never invents an alias: a key
 * that is neither a declaration key nor an alias row is a FINDING, the pack is
 * left untouched, and the run exits non-zero under --apply.
 *
 * Also applied per pack:
 *   - C10.8  `kind` written as `node` when absent (the v1 "absent ≡ node" reading
 *            does not exist in v2; `kind` is REQUIRED);
 *   - C10.4  refuse (finding) a manifest whose `engines.openwop` does not admit
 *            protocol major 2 — run scripts/v2-wave-engines.mjs first;
 *   - C10.1  `signing.publicKeyRef → keyId` and C10.7 `signing.method: manual →
 *            scheme: ed25519-canonical-json` if a source carries a signing block
 *            (refuses `ed25519`-over-tarball / `sigstore` / disagreeing key ids —
 *            those need a re-sign, not a relabel). Source packs in this repo
 *            carry none; the block is minted at build time.
 *
 *   node scripts/codemod-pack-manifest-v2.mjs                    # dry-run report, core.openwop.* (default filter)
 *   node scripts/codemod-pack-manifest-v2.mjs --all              # dry-run report over every pack
 *   node scripts/codemod-pack-manifest-v2.mjs --apply [--filter <prefix>]
 *
 * Idempotent: a manifest already in v2 shape produces no diff.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const APPLY = argv.includes('--apply');
const ALL = argv.includes('--all');
const FILTER = ALL ? '' : (arg('--filter') ?? 'core.openwop.');
const SCHEME = 'ed25519-canonical-json';
const RANGE = /^>=\s*(\d+)(?:\.\d+){0,2}\s+<\s*(\d+)\.0\.0$/;

// ─── the two vendored inputs (never a sibling checkout, never hand-kept) ─────

const declaration = JSON.parse(readFileSync(join(ROOT, 'spec/v2/declaration.json'), 'utf8'));
const aliasTable = JSON.parse(readFileSync(join(ROOT, 'spec/v2/peer-dependency-aliases.json'), 'utf8'));

/** declaration root keys that are identifiers: families anchored core|ext. */
const DECLARED = new Map();
const DELETED = new Map();
for (const f of declaration.families ?? []) {
  const id = f.peerDependencyId ?? f.key;
  if (f.anchor === 'deleted') DELETED.set(id, f.reason ?? 'deleted');
  else if (f.anchor === 'core' || f.anchor === 'ext') DECLARED.set(id, f);
}
/** alias → { family, facets? } from the generated table; every row must resolve to a declared family. */
const ALIASES = new Map();
for (const row of aliasTable.rows ?? []) {
  if (row.unresolved) continue; // a row the declaration cannot explain fails the corpus gate, not us
  if (!DECLARED.has(row.family)) {
    console.error(`✗ alias table row "${row.alias}" names family "${row.family}", which spec/v2/declaration.json does not declare — the vendored inputs disagree; re-vendor from one tag`);
    process.exit(2);
  }
  ALIASES.set(row.alias, { family: row.family, facets: row.facets ?? [] });
}

// ─── the codemod ────────────────────────────────────────────────────────────

/**
 * Returns { out, changes[], findings[] }. `out` is null when a finding refuses
 * the pack (the caller writes nothing for it).
 */
export function transform(doc) {
  const changes = [];
  const findings = [];
  const out = { ...doc };

  // C10.4 — the author declares compatibility; the codemod only checks.
  const range = out.engines?.openwop;
  const m = typeof range === 'string' ? RANGE.exec(range.trim()) : null;
  if (!m) findings.push(`engines.openwop "${range}" has no explicit \`<M.0.0\` ceiling — run v2-wave-engines.mjs`);
  else if (Number(m[2]) <= 2) findings.push(`engines.openwop "${range}" does not admit protocol major 2 (RFC 0177 §A.1)`);

  // C10.8 — kind required.
  if (!('kind' in out)) { out.kind = 'node'; changes.push('kind: absent → "node"'); }

  // C10.1 + C10.7 — only when a source carries a signing block.
  if (out.signing && typeof out.signing === 'object') {
    const s = { ...out.signing };
    if ('publicKeyRef' in s) {
      if ('keyId' in s && s.keyId !== s.publicKeyRef) findings.push('signing.keyId and signing.publicKeyRef disagree');
      else { s.keyId = s.publicKeyRef; delete s.publicKeyRef; changes.push('signing.publicKeyRef → keyId'); }
    }
    if ('method' in s) {
      if (s.method === 'manual') { delete s.method; s.scheme = SCHEME; changes.push(`signing.method: manual → scheme: ${SCHEME}`); }
      else findings.push(`signing.method "${s.method}" signs different bytes — re-sign under ${SCHEME}, do not relabel`);
    } else if (s.scheme !== SCHEME) findings.push('signing names neither method nor the v2 scheme');
    out.signing = { keyId: s.keyId, scheme: s.scheme, ...s };
  }

  // C10.6 — identifiers.
  if (out.peerDependencies && typeof out.peerDependencies === 'object') {
    const peers = {};
    const meta = {};
    const oldMeta = out.peerDependenciesMeta ?? {};
    const facetsFor = new Map();
    const setPeer = (family, value, from) => {
      if (family in peers) {
        if (peers[family] !== value) findings.push(`"${from}" and an earlier key both map to "${family}" with different values ("${peers[family]}" vs "${value}")`);
      } else peers[family] = value;
      if (from in oldMeta) meta[family] = { ...(meta[family] ?? {}), ...oldMeta[from] };
    };
    for (const [key, value] of Object.entries(out.peerDependencies)) {
      if (DECLARED.has(key)) { setPeer(key, value, key); continue; }
      const a = ALIASES.get(key);
      if (a) {
        setPeer(a.family, value, key);
        if (a.facets.length) facetsFor.set(a.family, [...new Set([...(facetsFor.get(a.family) ?? []), ...a.facets])]);
        changes.push(`peerDependencies["${key}"] → "${a.family}"${a.facets.length ? ` + facets [${a.facets.join(', ')}]` : ''}`);
        continue;
      }
      if (DELETED.has(key)) findings.push(`peerDependencies["${key}"] names a DELETED declaration family (${DELETED.get(key)}) — no v2 identifier`);
      else findings.push(`peerDependencies["${key}"] is neither a declaration-file key nor an alias-table row (would be pack_peer_dependency_undefined on a v2 host)`);
    }
    for (const [family, facets] of facetsFor) {
      const have = meta[family]?.facets ?? [];
      meta[family] = { ...(meta[family] ?? {}), facets: [...new Set([...have, ...facets])] };
    }
    // keys of the old meta that were not peers (stray) are kept under their name
    for (const [k, v] of Object.entries(oldMeta)) if (!(k in out.peerDependencies)) meta[k] = v;
    if (findings.length === 0) {
      out.peerDependencies = peers;
      if (Object.keys(meta).length) out.peerDependenciesMeta = meta; else delete out.peerDependenciesMeta;
    }
  }

  return { out: findings.length ? null : out, changes, findings };
}

// ─── batch ──────────────────────────────────────────────────────────────────

const packsDir = join(ROOT, 'packs');
const keyTally = new Map(); // key → { to, packs }
const report = [];
let unchanged = 0;
for (const name of readdirSync(packsDir).sort()) {
  if (!name.startsWith(FILTER)) continue;
  const pj = join(packsDir, name, 'pack.json');
  if (!existsSync(pj)) continue;
  const doc = JSON.parse(readFileSync(pj, 'utf8'));
  const { out, changes, findings } = transform(doc);
  for (const key of Object.keys(doc.peerDependencies ?? {})) {
    const to = DECLARED.has(key) ? key : ALIASES.get(key)?.family ?? null;
    const t = keyTally.get(key) ?? { to, facets: ALIASES.get(key)?.facets ?? [], packs: 0 };
    t.packs++; keyTally.set(key, t);
  }
  if (changes.length === 0 && findings.length === 0) { unchanged++; continue; }
  report.push({ name, pj, out, changes, findings });
}

console.log(`codemod-pack-manifest-v2: ${ALL ? 'all packs' : `filter "${FILTER}"`} — ${report.length} pack(s) with work, ${unchanged} already v2-shaped${APPLY ? ' [--apply]' : ' [dry-run]'}`);
console.log('\nPeer-dependency keys seen → v2 identifier:');
for (const [key, t] of [...keyTally].sort((a, b) => b[1].packs - a[1].packs || (a[0] < b[0] ? -1 : 1))) {
  const to = t.to === null ? 'FINDING (no alias, not declared)' : (t.to === key ? '(declared, kept)' : `→ ${t.to}${t.facets.length ? ` + facets [${t.facets.join(', ')}]` : ''}`);
  console.log(`  ${String(t.packs).padStart(3)}  ${key.padEnd(34)} ${to}`);
}

const refused = report.filter((r) => r.findings.length);
const applicable = report.filter((r) => !r.findings.length);
console.log(`\nPer pack: ${applicable.length} rewritable, ${refused.length} refused by a finding.`);
for (const r of report) {
  console.log(`  ${r.name}`);
  for (const c of r.changes) console.log(`      ${c}`);
  for (const f of r.findings) console.log(`      FINDING: ${f}`);
}

if (!APPLY) process.exit(0);
let written = 0;
for (const r of applicable) { writeFileSync(r.pj, JSON.stringify(r.out, null, 2) + '\n'); written++; }
console.log(`\ncodemod-pack-manifest-v2: wrote ${written} manifest(s).`);
if (refused.length) {
  console.error(`✗ ${refused.length} pack(s) refused — findings above; nothing invented.`);
  process.exit(1);
}
