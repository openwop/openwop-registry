#!/usr/bin/env node
/**
 * Rebuild the registry index files from the on-disk pack tree.
 *
 * Scans `registry/<tree>/packs/{name}/-/*.json` (`--tree`, default v2) and regenerates:
 *   - `registry/<tree>/packs/{name}/index.json` (per-pack metadata aggregate)
 *   - `registry/<tree>/index.json` (registry-wide index)
 *
 * Also recomputes the `integrity` field on each version manifest by
 * hashing the corresponding `.tgz` file when present. Manifests whose
 * tarball is missing (e.g., not yet built locally) keep their existing
 * `integrity` value AND the script emits a warning to stderr so CI
 * doesn't accept partial submissions.
 *
 * Pure Node 20 stdlib — no `npm install` required.
 *
 * Usage:
 *   node registry/scripts/build-index.mjs [--tree v1|v2]
 *   node registry/scripts/build-index.mjs --check   # fail if files would change
 *
 * `--tree v2` (RFC 0177 §A.2/§A.3, the default; `--tree v1` rebuilds the frozen v1 tree) rebuilds `registry/v2/`:
 * every URL template carries the `/v2/` prefix (the registry is versioned by
 * tree — the prefix IS the version), catalog rows carry `signingScheme` +
 * `signingKeyId` read from the manifest's `signing.keyId` with NO default (the
 * v1 `'ed25519'` / `'openwop-registry-root'` fallbacks are the thing RFC 0177
 * §C.3 retires — a v2 manifest without a v2 signing block fails loudly), and
 * `versionDeprecated` (RFC 0178 C11.2) replaces `deprecated` on the manifest.
 * The landing page and robots.txt are emitted by the v1 run only (they describe
 * the whole registry); the schema mirror at /{name}/{version}/ is shared.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync, mkdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';

/** Drop the `generatedAt` line so --check compares catalog content, not clocks. */
function stripGeneratedAt(text) {
  return text.replace(/^\s*"generatedAt":\s*"[^"]*",?\n/m, '');
}

import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { treeFromArgv, signerOf, V2_SCHEME } from '../../scripts/lib/registry-tree.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url))); // registry/
const TREE = treeFromArgv();
const PACKS_DIR = join(ROOT, TREE, 'packs');
const REGISTRY_INDEX = join(ROOT, TREE, 'index.json');

const args = new Set(process.argv.slice(2));
const checkMode = args.has('--check');
const fatal = [];

const warnings = [];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, data) {
  const text = JSON.stringify(data, null, 2) + '\n';
  if (checkMode) {
    const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
    // `generatedAt` is a live timestamp, so it differs on every run by
    // construction. --check asks "is the CONTENT current", which is a question
    // about the catalog, not about when the file was written; comparing the
    // timestamp would make this gate red on every unrelated PR and teach
    // everyone to ignore it.
    //
    // The timestamp is not unchecked — `scripts/check-served-index-matches-tree.mjs`
    // fails if it is missing, unparseable, or the frozen 2026-05-10 literal it
    // used to be. Content here, honesty there.
    if (stripGeneratedAt(existing) !== stripGeneratedAt(text)) {
      console.error(`[build-index --check] ${path} would change`);
      process.exitCode = 1;
    }
    return;
  }
  writeFileSync(path, text, 'utf8');
}

function sha256Base64(filePath) {
  const buf = readFileSync(filePath);
  const hash = createHash('sha256').update(buf).digest('base64');
  return `sha256-${hash}`;
}

function semverCmp(a, b) {
  const parse = (v) => v.split('.').map((n) => Number(n.split('-')[0]) || 0);
  const [a1, a2, a3] = parse(a);
  const [b1, b2, b3] = parse(b);
  return a1 - b1 || a2 - b2 || a3 - b3;
}

function listPackNames() {
  if (!existsSync(PACKS_DIR)) return [];
  return readdirSync(PACKS_DIR).filter((entry) => {
    const stat = statSync(join(PACKS_DIR, entry));
    return stat.isDirectory();
  });
}

function listVersionManifests(packName) {
  const dir = join(PACKS_DIR, packName, '-');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !f.endsWith('.sbom.json'))
    .map((f) => f.replace(/\.json$/, ''));
}

/**
 * Extract schemas/*.json from a signed pack tarball into the schema-mirror
 * tree at registry/{packName}/{version}/<schema>.json.
 *
 * The mirror is a derived view of the signed tarball — consumers wanting
 * cryptographic integrity should verify against the tarball, not the
 * mirrored URL. The mirror exists so JSON Schema validators that resolve
 * `$id` URLs (per the schemas' declared identifiers) get a real document
 * back instead of a 404.
 *
 * In --check mode, we write to a temp location and compare; the
 * writeJson helper handles the same flow for the index/manifest files.
 */
function extractSchemaMirror(packName, version, tarballPath) {
  const mirrorDir = join(ROOT, packName, version);
  // Extract just the `schemas/` subtree from the tarball into a temp dir,
  // then move the .json files into place. Using tar with a wildcard would
  // be cleaner, but BSD tar (macOS) and GNU tar differ in syntax; the
  // temp-extract approach is portable.
  const tmp = join(tmpdir(), `openwop-mirror-${packName}-${version}-${process.pid}`);
  try {
    mkdirSync(tmp, { recursive: true });
    try {
      execFileSync('tar', ['-xzf', tarballPath, '-C', tmp], { stdio: 'pipe' });
    } catch (err) {
      warnings.push(
        `pack ${packName}@${version}: tar extraction failed (${err.message ?? 'unknown'}); ` +
          `schema mirror not updated.`,
      );
      return;
    }
    const schemasDir = join(tmp, 'schemas');
    if (!existsSync(schemasDir) || !statSync(schemasDir).isDirectory()) {
      // Pack has no schemas/ subdirectory (e.g., WASM packs that pass JSON
      // via the ABI rather than declaring per-port schemas). That's valid;
      // just emit no mirror entries for this version.
      return;
    }
    const schemaFiles = readdirSync(schemasDir).filter((f) => f.endsWith('.json'));
    if (schemaFiles.length === 0) return;
    if (!checkMode) {
      mkdirSync(mirrorDir, { recursive: true });
    }
    for (const file of schemaFiles) {
      const src = join(schemasDir, file);
      const dst = join(mirrorDir, file);
      const content = readFileSync(src, 'utf8');
      if (checkMode) {
        const existing = existsSync(dst) ? readFileSync(dst, 'utf8') : '';
        if (existing !== content) {
          console.error(`[build-index --check] schema mirror ${dst} would change`);
          process.exitCode = 1;
        }
      } else {
        writeFileSync(dst, content, 'utf8');
      }
    }
  } finally {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}

function rebuildPack(packName) {
  const versions = listVersionManifests(packName);
  if (versions.length === 0) {
    warnings.push(`pack ${packName} has no version manifests`);
    return null;
  }
  versions.sort(semverCmp);

  const versionEntries = [];
  let pack;
  for (const version of versions) {
    const manifestPath = join(PACKS_DIR, packName, '-', `${version}.json`);
    const manifest = readJson(manifestPath);

    const tarballPath = join(PACKS_DIR, packName, '-', `${version}.tgz`);
    if (existsSync(tarballPath)) {
      const integrity = sha256Base64(tarballPath);
      if (manifest.integrity !== integrity) {
        manifest.integrity = integrity;
        writeJson(manifestPath, manifest);
      }
      // Derive the schema mirror at /{name}/{version}/<schema>.json from the
      // tarball. The tarball is the signed source-of-truth; the mirror is a
      // view. See spec/v1/node-packs.md §"Schema $id resolution" for the
      // consumer contract.
      extractSchemaMirror(packName, version, tarballPath);
    } else {
      warnings.push(
        `pack ${packName}@${version}: tarball ${tarballPath} not found; ` +
          `integrity field + schema mirror NOT updated. Bundle the pack ` +
          `(\`tar -czf .../${version}.tgz ...\`) and sign before re-running.`,
      );
    }

    if (TREE === 'v2') {
      // RFC 0177 §C.3/§C.4/§C.5 — no defaults. A v2 manifest names its signer
      // as `signing.keyId` under the one scheme, and carries `kind`; anything
      // else is a build failure, not a mislabeled row.
      const signer = signerOf(manifest, 'v2');
      if (signer.problems.length) fatal.push(`${packName}@${version}: ${signer.problems.join('; ')}`);
      if (typeof manifest.kind !== 'string') fatal.push(`${packName}@${version}: \`kind\` is REQUIRED on a v2 manifest (RFC 0177 §C.5)`);
      const row = {
        version,
        // No fabricated first-publish date on the v2 tree: the row carries
        // `publishedAt` only when the manifest records one (the v1 fallback
        // stamped the MVP date on everything). build-index is deterministic
        // (--check), so "now" is not an option either.
        ...(manifest.publishedAt ? { publishedAt: manifest.publishedAt } : {}),
        manifestUrl: `/v2/packs/${packName}/-/${version}.json`,
        tarballUrl: `/v2/packs/${packName}/-/${version}.tgz`,
        signatureUrl: `/v2/packs/${packName}/-/${version}.sig`,
        sbomUrl: `/v2/packs/${packName}/-/${version}.sbom.json`,
        signingScheme: V2_SCHEME,
        signingKeyId: signer.keyId,
        integrity: manifest.integrity ?? 'sha256-PENDING-FIRST-BUILD',
        versionDeprecated: Boolean(manifest.versionDeprecated),
        yanked: Boolean(manifest.yanked),
      };
      versionEntries.push(row);
    } else {
      versionEntries.push({
        version,
        publishedAt: manifest.publishedAt ?? '2026-05-10T00:00:00Z',
        manifestUrl: `/v1/packs/${packName}/-/${version}.json`,
        tarballUrl: `/v1/packs/${packName}/-/${version}.tgz`,
        signatureUrl: `/v1/packs/${packName}/-/${version}.sig`,
        signingMethod: manifest.signing?.method ?? 'ed25519',
        // The signed manifest records the publisher key as `signing.publicKeyRef`
        // (node-pack-manifest.schema.json §Signing); `signing.keyId` is a legacy
        // alias. Read publicKeyRef FIRST — reading only `keyId` made this always
        // fall through to the hardcoded default, mislabeling every pack's signer
        // as `openwop-registry-root` (the drift check-registry-signer-consistency
        // guards). Verified by verify-signatures.mjs against registry/keys/<id>.pub.
        signingKeyId: manifest.signing?.publicKeyRef ?? manifest.signing?.keyId ?? 'openwop-registry-root',
        integrity: manifest.integrity ?? 'sha256-PENDING-FIRST-BUILD',
        deprecated: Boolean(manifest.deprecated),
        yanked: Boolean(manifest.yanked),
      });
    }

    pack = manifest;
  }

  // v2 (spec/v2/core/packs.md §"Version manifests"): `latest` never names a
  // yanked version while the pack has one that is not yanked, and the
  // registry-wide row is `yanked` only when every version is. The v1 tree is
  // frozen through the overlap and keeps highest-semver.
  const unyanked = versionEntries.filter((v) => !v.yanked).map((v) => v.version);
  const latest = TREE === 'v2' && unyanked.length > 0 ? unyanked[unyanked.length - 1] : versions[versions.length - 1];
  const allYanked = TREE === 'v2' && unyanked.length === 0;
  // Pack kind per RFC 0013. Node packs (the default and original kind)
  // either omit `kind` or set it to "node"; workflow-chain packs set
  // `kind: "workflow-chain"`. Consumers MUST inspect `kind` before
  // assuming dispatch semantics (workflow-chain packs aren't directly
  // dispatchable — they expand at workflow-author time).
  const kind = TREE === 'v2' ? pack?.kind : (pack?.kind ?? 'node');
  // Per-pack typeIds[] surfaced for catalog/discovery. The semantics:
  //   - node packs (kind=node, the default): merge nodes[].typeId AND
  //     agents[].agentId so pure-agent packs (per RFC 0003) and mixed
  //     node+agent packs both surface their full id set. Without the
  //     agentId merge, agent-only packs would carry an empty typeIds[]
  //     even though they ship real consumer-facing ids.
  //   - workflow-chain packs (kind=workflow-chain, RFC 0013): chains[].chainId.
  // All three id types share the same reverse-DNS shape; consumers MUST
  // inspect `kind` if they need to discriminate dispatch semantics
  // (node typeIds dispatch directly; chainIds expand at edit time;
  // agentIds are resolved as AgentRef references).
  // Declarative kinds (RFC 0107) surface their consumer-facing ids the same way:
  // artifact-type → artifactTypes[].artifactTypeId; connection → provider.id.
  const typeIds =
    kind === 'workflow-chain'
      ? (pack?.chains ?? []).map((c) => c.chainId).filter(Boolean)
      : kind === 'prompt'
      ? (pack?.prompts ?? []).map((p) => p.templateId).filter(Boolean)
      : kind === 'card'
      ? (pack?.cards ?? []).map((c) => c.cardTypeId).filter(Boolean)
      : kind === 'artifact-type'
      ? (pack?.artifactTypes ?? []).map((t) => t.artifactTypeId).filter(Boolean)
      : kind === 'connection'
      ? (pack?.provider?.id ? [pack.provider.id] : [])
      : kind === 'form-content'
      ? (pack?.templates ?? []).map((t) => t.templateId).filter(Boolean)
      : [
          ...(pack?.nodes ?? []).map((n) => n.typeId),
          ...(pack?.agents ?? []).map((a) => a.agentId),
        ].filter(Boolean);

  // Per-pack composition counts so the catalog landing can bucket by kind
  // without re-reading each manifest. Mixed node+agent packs appear in BOTH
  // those tabs. Additive fields per RFC 0003 / RFC 0013 / RFC 0107; unknown-key
  // tolerance covers older clients.
  const nodeCount  = Array.isArray(pack?.nodes)  ? pack.nodes.length  : 0;
  const agentCount = Array.isArray(pack?.agents) ? pack.agents.length : 0;
  const artifactTypeCount = Array.isArray(pack?.artifactTypes) ? pack.artifactTypes.length : 0;
  const providerCount = pack?.provider?.id ? 1 : 0;
  const chainCount = Array.isArray(pack?.chains) ? pack.chains.length : 0;
  const promptCount = Array.isArray(pack?.prompts) ? pack.prompts.length : 0;
  const templateCount = Array.isArray(pack?.templates) ? pack.templates.length : 0;
  const cardCount = Array.isArray(pack?.cards) ? pack.cards.length : 0;

  const indexDoc = {
    name: packName,
    kind,
    description: pack?.description ?? '',
    author: pack?.author ?? '',
    license: pack?.license ?? '',
    homepage: pack?.homepage,
    repository: pack?.repository,
    tags: pack?.tags ?? [],
    typeIds,
    nodeCount,
    agentCount,
    artifactTypeCount,
    providerCount,
    chainCount,
    promptCount,
    templateCount,
    cardCount,
    versions: versionEntries,
    latest,
    deprecated: versionEntries.every((v) => TREE === 'v2' ? v.versionDeprecated : v.deprecated),
  };
  if (!indexDoc.homepage) delete indexDoc.homepage;
  if (!indexDoc.repository) delete indexDoc.repository;
  // RFC 0107 declarative counts are additive + only meaningful for their kind —
  // omit when zero so existing node/agent pack index.json stay byte-identical.
  if (!artifactTypeCount) delete indexDoc.artifactTypeCount;
  if (!providerCount) delete indexDoc.providerCount;
  if (!chainCount) delete indexDoc.chainCount;
  if (!promptCount) delete indexDoc.promptCount;
  if (!templateCount) delete indexDoc.templateCount;
  if (!cardCount) delete indexDoc.cardCount;

  writeJson(join(PACKS_DIR, packName, 'index.json'), indexDoc);
  return { ...indexDoc, allYanked };
}

function rebuildRegistryIndex(packDocs) {
  // `generatedAt` was a hardcoded '2026-05-10T00:00:00Z' literal from the first
  // build until 2026-09-16. The v2 tree's CONTENTS stayed current the whole
  // time — the field simply stopped tracking them, which is worse than having
  // no field: three sessions read staleness into a correct index and went
  // hunting for a missing generator instead of a wrong tree.
  //
  // A live timestamp does not churn here: this index is rebuilt only when
  // `packs/**` changes (`.github/workflows/auto-register.yml`), so the value
  // moves exactly when the contents move. `emitLandingPage` has always done
  // this; only the JSON was frozen.
  const registryDoc = {
    registryVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    packCount: packDocs.length,
    packs: packDocs.map((p) => ({
      name: p.name,
      kind: p.kind,
      latestVersion: p.latest,
      description: p.description,
      license: p.license,
      tags: p.tags,
      typeIds: p.typeIds,
      nodeCount: p.nodeCount,
      agentCount: p.agentCount,
      deprecated: p.deprecated,
      yanked: Boolean(p.allYanked),
    })),
  };
  writeJson(REGISTRY_INDEX, registryDoc);
}

/**
 * HTML-escape a value for safe interpolation into the landing page.
 * Pack descriptions / authors / etc. are author-controlled — never trust
 * them to be HTML-safe.
 */
function htmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Emit registry/index.html — a derived view of the registry catalog.
 *
 * Single source of truth: the same `docs` array `rebuildRegistryIndex`
 * uses to write `v1/index.json`. The HTML is generated at build time
 * and re-deployed alongside the JSON; it can't drift from the catalog
 * because the generator reads the same data.
 *
 * Properties:
 *   - Zero JavaScript
 *   - Inline CSS, plus one Google Fonts <link> for the type triple
 *     shared with openwop.dev and app.openwop.dev: Bricolage Grotesque
 *     (display, 600; openwop-app ADR 0883 replaced Instrument Serif),
 *     Geist and Geist Mono. font-display: swap means the system font
 *     shows immediately, so the page is still functional offline.
 *   - OG + Twitter card meta for shareable unfurls
 *   - Light and dark palettes follow the OS setting (no toggle, no JS),
 *     mirroring openwop.dev's tokens. The packs film is linked from
 *     openwop.dev (CORS-open), not copied.
 *   - All author-controlled strings HTML-escaped
 *   - Tokens mirror public/styles.css :root per DESIGN.md §4 — keep in
 *     lockstep across surfaces (marketing site, app, registry)
 */
function emitLandingPage(packDocs) {
  const generatedAt = new Date().toISOString();
  const total = packDocs.length;
  const totalVersions = packDocs.reduce((acc, p) => acc + (p.versions?.length ?? 0), 0);

  // Bucket packs into "node" + "agent" categories. Mixed packs (both
  // arrays non-empty in the manifest) appear in BOTH tabs since they
  // ship both kinds of consumer-facing artifacts.
  const nodePacks  = packDocs.filter((p) => (p.nodeCount  ?? 0) > 0);
  const agentPacks = packDocs.filter((p) => (p.agentCount ?? 0) > 0);
  // Declarative kinds (RFC 0107) — bucket by kind discriminator.
  const artifactTypePacks = packDocs.filter((p) => p.kind === 'artifact-type');
  const connectionPacks   = packDocs.filter((p) => p.kind === 'connection');
  const workflowChainPacks = packDocs.filter((p) => p.kind === 'workflow-chain');
  const promptPacks        = packDocs.filter((p) => p.kind === 'prompt');
  const cardPacks          = packDocs.filter((p) => p.kind === 'card');
  const formContentPacks   = packDocs.filter((p) => p.kind === 'form-content');

  const rowFor = (p, kindHint) => {
    const v = p.versions[p.versions.length - 1];
    const flags = [];
    if (p.deprecated || v?.deprecated) flags.push('<span class="flag flag-deprecated">deprecated</span>');
    if (v?.yanked) flags.push('<span class="flag flag-yanked">yanked</span>');
    // Mark mixed packs so a user scanning one tab knows the same pack
    // also lives in the other tab.
    if (kindHint === 'node' && (p.agentCount ?? 0) > 0) flags.push('<span class="flag flag-mixed">+ agent</span>');
    if (kindHint === 'agent' && (p.nodeCount ?? 0) > 0) flags.push('<span class="flag flag-mixed">+ nodes</span>');
    const countCell =
      kindHint === 'node'
        ? `<td class="count" title="nodes in latest manifest">${p.nodeCount ?? 0}</td>`
        : kindHint === 'agent'
        ? `<td class="count" title="agents in latest manifest">${p.agentCount ?? 0}</td>`
        : kindHint === 'artifact-type'
        ? `<td class="count" title="artifact types in latest manifest">${p.artifactTypeCount ?? 0}</td>`
        : kindHint === 'workflow-chain'
        ? `<td class="count" title="chains in latest manifest">${p.chainCount ?? 0}</td>`
        : kindHint === 'prompt'
        ? `<td class="count" title="prompt templates in latest manifest">${p.promptCount ?? 0}</td>`
        : kindHint === 'card'
        ? `<td class="count" title="cards in latest manifest">${p.cardCount ?? 0}</td>`
        : `<td class="count" title="provider in latest manifest">${p.providerCount ?? 0}</td>`;
    return `        <tr>
          <td class="name"><code>${htmlEscape(p.name)}</code> ${flags.join(' ')}</td>
          <td class="version">${htmlEscape(p.latest)}</td>
          ${countCell}
          <td class="desc">${htmlEscape(p.description || '—')}</td>
          <td class="license">${htmlEscape(p.license || '—')}</td>
          <td class="artifacts">
            <a href="${htmlEscape(v?.manifestUrl ?? '#')}" title="version manifest (JSON)">manifest</a>
            · <a href="${htmlEscape(v?.tarballUrl ?? '#')}" title="signed tarball (tgz)">tgz</a>
            · <a href="${htmlEscape(v?.signatureUrl ?? '#')}" title="Ed25519 signature">sig</a>
          </td>
        </tr>`;
  };

  const buildRows = (packs, kindHint) =>
    packs
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => rowFor(p, kindHint))
      .join('\n');

  const nodeRows  = buildRows(nodePacks,  'node');
  const agentRows = buildRows(agentPacks, 'agent');
  const artifactTypeRows = buildRows(artifactTypePacks, 'artifact-type');
  // Connection packs group by commercial VENDOR (Microsoft 365 / Google / Workday …)
  // so a company scans the catalog by the vendors it does business with. Vendor is
  // derived host-side from the provider id (typeIds[0] for kind:"connection") — it is
  // presentational, NOT a manifest field (the RFC 0095 provider schema is
  // additionalProperties:false; a normative `vendor` field would need an openwop RFC).
  // A provider with no mapping falls back to a titleised provider id, so nothing hides.
  const CONNECTION_VENDOR = {
    github: 'GitHub', jira: 'Atlassian', microsoft365: 'Microsoft 365',
    notion: 'Notion', salesforce: 'Salesforce', workday: 'Workday',
    google: 'Google', gmail: 'Google', bigquery: 'Google', slack: 'Slack',
    servicenow: 'ServiceNow', zoom: 'Zoom', dropbox: 'Dropbox', box: 'Box',
  };
  const vendorOf = (p) => {
    const providerId = p.typeIds?.[0] ?? p.name.split('.').pop() ?? '';
    if (CONNECTION_VENDOR[providerId]) return CONNECTION_VENDOR[providerId];
    return providerId ? providerId.charAt(0).toUpperCase() + providerId.slice(1) : '—';
  };
  const buildConnectionRows = (packs) => {
    const groups = new Map();
    for (const p of packs) {
      const v = vendorOf(p);
      const bucket = groups.get(v);
      if (bucket) bucket.push(p); else groups.set(v, [p]);
    }
    return [...groups.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([vendor, ps]) => {
        const header = `        <tr class="vendor-row"><th class="vendor-group" colspan="6" scope="colgroup">${htmlEscape(vendor)}</th></tr>`;
        const rows = ps.slice().sort((a, b) => a.name.localeCompare(b.name)).map((p) => rowFor(p, 'connection')).join('\n');
        return `${header}\n${rows}`;
      })
      .join('\n');
  };
  const connectionRows   = buildConnectionRows(connectionPacks);
  const workflowChainRows = buildRows(workflowChainPacks, 'workflow-chain');
  const promptRows         = buildRows(promptPacks,        'prompt');
  const cardRows           = buildRows(cardPacks,          'card');
  const formContentRows    = buildRows(formContentPacks,   'form-content');

  const tableFor = (rows, countHeader) =>
    `    <div class="table-box"><table>
      <thead>
        <tr><th>Name</th><th>Version</th><th class="count-h">${countHeader}</th><th>Description</th><th>License</th><th>Artifacts</th></tr>
      </thead>
      <tbody>
${rows}
      </tbody>
    </table></div>`;

  // Namespace tiers, counted for the trust section.
  const nsCount = (prefix) => packDocs.filter((p) => p.name.startsWith(`${prefix}.`)).length;
  const coreCount = nsCount('core');
  const vendorCount = nsCount('vendor');
  const communityCount = nsCount('community');
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  // The packs film lives on openwop.dev (served with ACAO: *), so the registry
  // links it rather than keeping a second copy. Bump FILM_V when openwop.dev
  // re-renders the packs film (openwop-site site/src/designed-pages.mjs `packs`).
  const FILM_BASE = 'https://openwop.dev/assets/video/openwop-packs';
  const FILM_V = '2026-10-14.2';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OpenWOP registry — packs.openwop.dev</title>
<meta name="description" content="The signed pack registry for OpenWOP: reusable nodes, agents and workflow chains, verified by every host before it runs them. ${total} pack(s), ${totalVersions} version(s) published.">
<meta name="robots" content="index, follow">
<meta name="theme-color" content="#f4f1ea" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1a1a17" media="(prefers-color-scheme: dark)">

<meta property="og:type" content="website">
<meta property="og:url" content="https://packs.openwop.dev/">
<meta property="og:title" content="OpenWOP registry">
<meta property="og:description" content="Building blocks for workflows, signed and checked. Reusable nodes, agents and workflow chains for OpenWOP.">
<meta property="og:image" content="${FILM_BASE}-poster.jpg?v=${FILM_V}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="OpenWOP registry">
<meta name="twitter:description" content="Building blocks for workflows, signed and checked.">

<link rel="alternate" type="application/json" title="Discovery" href="/.well-known/openwop-registry">
<link rel="alternate" type="application/json" title="Registry index" href="/v1/index.json">

<!-- Fonts — the openwop.dev display face (ADR 0883: Bricolage Grotesque 600)
     plus Geist and Geist Mono. font-display: swap paints system fonts first. -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..700&family=Geist:wght@300;400;500;600&family=Geist+Mono:wght@400;500&display=swap">

<style>
  /* Tokens mirror openwop.dev public/styles.css :root (light + dark). Zero JS:
     the dark palette follows the OS setting; there is no toggle. */
  :root {
    color-scheme: light;
    --paper:     #f4f1ea;
    --paper-2:   #ece8de;
    --rule:      #d9d4c5;
    --rule-2:    #c4bfae;
    --ink:       #1a1a17;
    --ink-2:     #4a4842;
    --ink-3:     #6b675b;
    --clay:      oklch(58% 0.13 40);
    --clay-text: color-mix(in oklch, var(--clay) 78%, var(--ink));
    --clay-soft: oklch(58% 0.13 40 / 0.10);
    --stage:       #1c1c18;
    --stage-text:  #f4f1ea;
    --stage-muted: #a8a39a;
    --stage-rule:  #3a3833;
    --serif: "Bricolage Grotesque", ui-sans-serif, system-ui, sans-serif;
    --weight-display: 600;
    --sans:  "Geist", ui-sans-serif, system-ui, sans-serif;
    --mono:  "Geist Mono", ui-monospace, "SF Mono", Menlo, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      color-scheme: dark;
      --paper:     #1a1a17;
      --paper-2:   #232220;
      --rule:      #3a3833;
      --rule-2:    #4a4842;
      --ink:       #f4f1ea;
      --ink-2:     #d9d4c5;
      --ink-3:     #a8a39a;
      --clay:      oklch(68% 0.13 40);
      --clay-text: oklch(74% 0.12 40);
      --clay-soft: oklch(68% 0.13 40 / 0.14);
      --stage:       #121210;
      --stage-rule:  #34322c;
    }
  }

  *, *::before, *::after { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body {
    margin: 0;
    background: var(--paper);
    color: var(--ink);
    font: 400 16px/1.6 var(--sans);
    -webkit-font-smoothing: antialiased;
  }
  a { color: var(--clay-text); text-decoration-thickness: 1px; text-underline-offset: 3px; }
  a:hover { color: var(--ink); }
  :focus-visible { outline: 2px solid var(--clay); outline-offset: 3px; border-radius: 4px; }
  code, pre { font-family: var(--mono); }
  code { font-size: 0.92em; }
  p code, li code, .step-b code { overflow-wrap: anywhere; }
  .wrap { max-width: 1200px; margin: 0 auto; padding-inline: 32px; }
  .eyebrow { font-family: var(--mono); font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--clay-text); margin: 0; }
  .display { font-family: var(--serif); font-weight: var(--weight-display); letter-spacing: -0.02em; margin: 0; text-wrap: balance; }
  .accent { color: var(--clay); }
  section { padding-bottom: 96px; }
  h2.display { font-size: clamp(32px, 4.4vw, 44px); line-height: 1.05; }
  .section-head { display: flex; flex-direction: column; gap: 10px; margin-bottom: 28px; }
  .section-head p { margin: 0; max-width: 62ch; color: var(--ink-2); }
  .btn {
    display: inline-flex; align-items: center; gap: 8px;
    font-family: var(--mono); font-size: 14px; text-decoration: none;
    border-radius: 10px; padding: 13px 20px; border: 1px solid var(--rule-2); color: var(--ink);
  }
  .btn:hover { border-color: var(--ink); color: var(--ink); }
  .btn-solid { background: var(--ink); color: var(--paper); border-color: var(--ink); }
  .btn-solid:hover { color: var(--paper); opacity: 0.88; }

  /* ─── Header ─────────────────────────────────────────────────────────── */
  .site-header { border-bottom: 1px solid var(--rule); }
  .site-header .wrap { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; padding-block: 18px; }
  .brand { display: flex; align-items: center; gap: 10px; color: var(--ink); text-decoration: none; }
  .brand img { width: 30px; height: auto; }
  .brand-word { font-family: var(--serif); font-weight: var(--weight-display); font-size: 22px; letter-spacing: -0.01em; }
  .brand-sub { font-family: var(--mono); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3); }
  .site-nav { display: flex; flex-wrap: wrap; align-items: center; gap: 22px; font-size: 14px; }
  .site-nav a { color: var(--ink-2); text-decoration: none; }
  .site-nav a:hover { color: var(--clay-text); }
  .site-nav .nav-pill { border: 1px solid var(--ink); border-radius: 999px; padding: 7px 15px; color: var(--ink); font-weight: 500; }

  /* ─── Hero ───────────────────────────────────────────────────────────── */
  .hero { display: flex; flex-wrap: wrap; gap: 56px; align-items: flex-end; padding-block: 88px 64px; }
  .hero-copy { flex: 999 1 560px; min-width: 0; display: flex; flex-direction: column; gap: 24px; }
  .hero h1 { font-size: clamp(44px, 6.4vw, 84px); line-height: 0.98; letter-spacing: -0.025em; }
  .hero .lede { margin: 0; max-width: 60ch; font-size: 19px; color: var(--ink-2); }
  .hero-actions { display: flex; flex-wrap: wrap; gap: 12px; }
  .stats { flex: 1 1 300px; margin: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; background: var(--rule); border: 1px solid var(--rule); border-radius: 14px; overflow: hidden; }
  .stats > div { background: var(--paper); padding: 20px 22px; }
  .stats dt { font-family: var(--mono); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3); }
  .stats dd { margin: 6px 0 0; font-family: var(--serif); font-weight: var(--weight-display); font-size: 40px; line-height: 1; font-variant-numeric: tabular-nums; }
  .stats dd.small { font-size: 20px; line-height: 1.25; }

  /* ─── Film + publish stages ──────────────────────────────────────────── */
  .stage { background: var(--stage); color: var(--stage-text); border-radius: 22px; padding: 40px; display: flex; flex-wrap: wrap; gap: 40px; align-items: center; }
  .stage a { color: var(--stage-text); }
  .stage .muted { color: var(--stage-muted); margin: 0; max-width: 46ch; }
  .stage-copy { flex: 1 1 320px; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
  .stage-copy .eyebrow { color: var(--stage-muted); }
  .stage-copy .eyebrow b { color: var(--clay); font-weight: 400; }
  .stage-media { flex: 2 1 520px; min-width: 0; }
  .stage-media video { display: block; width: 100%; aspect-ratio: 16 / 9; border-radius: 14px; background: #000; border: 1px solid var(--stage-rule); }
  .stage-links { display: flex; flex-wrap: wrap; gap: 20px; font-size: 14px; }
  .stage .btn { border-color: var(--stage-rule); color: var(--stage-text); }
  .stage .btn-solid { background: var(--stage-text); color: var(--stage); border-color: var(--stage-text); }
  .stage pre { flex: 1 1 360px; min-width: 0; margin: 0; overflow-x: auto; background: rgb(0 0 0 / 0.33); border: 1px solid var(--stage-rule); border-radius: 14px; padding: 20px; font-size: 13px; line-height: 1.8; }
  .stage pre .c { color: var(--stage-muted); }

  /* ─── Catalog: kind cards are the (zero-JS) radio tabs ───────────────── */
  .tabs { margin: 0; }
  .tab-radio { position: absolute; opacity: 0; pointer-events: none; }
  .tab-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 14px; margin-bottom: 32px; }
  .tab {
    display: flex; flex-direction: column; gap: 8px; cursor: pointer;
    background: var(--paper); border: 1px solid var(--rule); border-radius: 14px; padding: 18px 20px;
  }
  .tab:hover { border-color: var(--rule-2); }
  .tab-top { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .tab-label { font-family: var(--serif); font-weight: var(--weight-display); font-size: 19px; color: var(--ink); }
  .tab-count { font-family: var(--mono); font-size: 14px; color: var(--clay-text); font-variant-numeric: tabular-nums; }
  .tab-blurb { font-size: 14px; color: var(--ink-2); line-height: 1.5; }
  #tab-nodes:focus-visible ~ .tab-list .tab[for="tab-nodes"],
  #tab-agents:focus-visible ~ .tab-list .tab[for="tab-agents"],
  #tab-artifact-types:focus-visible ~ .tab-list .tab[for="tab-artifact-types"],
  #tab-connections:focus-visible ~ .tab-list .tab[for="tab-connections"],
  #tab-workflow-chains:focus-visible ~ .tab-list .tab[for="tab-workflow-chains"],
  #tab-prompts:focus-visible ~ .tab-list .tab[for="tab-prompts"],
  #tab-cards:focus-visible ~ .tab-list .tab[for="tab-cards"],
  #tab-form-content:focus-visible ~ .tab-list .tab[for="tab-form-content"] {
    outline: 2px solid var(--clay); outline-offset: 3px;
  }
  #tab-nodes:checked ~ .tab-list .tab[for="tab-nodes"],
  #tab-agents:checked ~ .tab-list .tab[for="tab-agents"],
  #tab-artifact-types:checked ~ .tab-list .tab[for="tab-artifact-types"],
  #tab-connections:checked ~ .tab-list .tab[for="tab-connections"],
  #tab-workflow-chains:checked ~ .tab-list .tab[for="tab-workflow-chains"],
  #tab-prompts:checked ~ .tab-list .tab[for="tab-prompts"],
  #tab-cards:checked ~ .tab-list .tab[for="tab-cards"],
  #tab-form-content:checked ~ .tab-list .tab[for="tab-form-content"] {
    border-color: var(--clay); background: var(--clay-soft);
  }
  .tab-panel { display: none; }
  #tab-nodes:checked ~ .tab-panel-nodes,
  #tab-agents:checked ~ .tab-panel-agents,
  #tab-artifact-types:checked ~ .tab-panel-artifact-types,
  #tab-connections:checked ~ .tab-panel-connections,
  #tab-workflow-chains:checked ~ .tab-panel-workflow-chains,
  #tab-prompts:checked ~ .tab-panel-prompts,
  #tab-cards:checked ~ .tab-panel-cards,
  #tab-form-content:checked ~ .tab-panel-form-content { display: block; }
  .tab-desc { margin: 0 0 20px; max-width: 78ch; color: var(--ink-2); font-size: 15px; }
  .table-box { overflow-x: auto; border: 1px solid var(--rule); border-radius: 14px; }
  table { width: 100%; min-width: 760px; border-collapse: collapse; font-size: 14px; }
  th, td { padding-inline: 14px; }
  th { text-align: left; font-family: var(--mono); font-size: 11px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3); background: var(--paper-2); padding: 12px 16px; }
  td { padding: 16px; border-top: 1px solid var(--rule); vertical-align: top; }
  tbody tr:hover td { background: var(--paper-2); }
  td.name { min-width: 200px; }
  td.name code { font-size: 13px; color: var(--ink); }
  td.version { font-family: var(--mono); font-size: 13px; color: var(--ink-2); font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.count, th.count-h { text-align: right; font-family: var(--mono); font-variant-numeric: tabular-nums; }
  td.desc { color: var(--ink-2); max-width: 48ch; }
  td.license { color: var(--ink-2); white-space: nowrap; }
  td.artifacts { white-space: nowrap; font-family: var(--mono); font-size: 12px; }
  tr.vendor-row th.vendor-group { background: var(--paper); color: var(--clay-text); border-top: 1px solid var(--rule); }
  .flag { display: inline-block; font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.06em; text-transform: uppercase; border: 1px solid var(--rule-2); border-radius: 999px; padding: 1px 8px; margin-left: 6px; color: var(--ink-3); vertical-align: 1px; }
  .flag-deprecated, .flag-yanked { color: var(--clay-text); border-color: var(--clay); }
  .empty { padding: 32px; border: 1px dashed var(--rule-2); border-radius: 14px; color: var(--ink-3); text-align: center; font-family: var(--mono); font-size: 13px; }

  /* ─── Trust, API, namespaces ─────────────────────────────────────────── */
  .steps { list-style: none; margin: 0 0 24px; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
  .steps li { border: 1px solid var(--rule); border-radius: 14px; padding: 24px; display: flex; flex-direction: column; gap: 10px; }
  .step-n { font-family: var(--mono); font-size: 13px; color: var(--clay-text); }
  .step-t { font-family: var(--serif); font-weight: var(--weight-display); font-size: 22px; line-height: 1.2; }
  .step-b { color: var(--ink-2); font-size: 15px; }
  .split { display: flex; flex-wrap: wrap; gap: 24px; }
  .split > * { flex: 1 1 380px; min-width: 0; }
  .panel { border: 1px solid var(--rule); border-radius: 14px; padding: 24px; }
  .panel h3 { font-family: var(--serif); font-weight: var(--weight-display); font-size: 20px; margin: 0 0 12px; }
  .panel p { margin: 0 0 12px; color: var(--ink-2); font-size: 15px; }
  .panel pre { margin: 0; overflow-x: auto; background: var(--paper-2); border-radius: 10px; padding: 16px; font-size: 12.5px; line-height: 1.7; }
  .endpoint-list { list-style: none; margin: 0; padding: 0; }
  .endpoint-list li { display: flex; flex-wrap: wrap; gap: 4px 12px; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--rule); }
  .endpoint-list li:last-child { border-bottom: 0; }
  .endpoint-list code { font-size: 13px; }
  .endpoint-list .note { color: var(--ink-3); font-size: 13px; }
  .tiers { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1px; background: var(--rule); border: 1px solid var(--rule); border-radius: 14px; overflow: hidden; }
  .tiers > div { background: var(--paper); padding: 20px 24px; }
  .tiers code { font-size: 14px; color: var(--ink); }
  .tiers p { margin: 4px 0 0; color: var(--ink-2); font-size: 14px; }
  .fine { color: var(--ink-3); font-size: 14px; margin: 16px 0 0; }

  /* ─── Footer ─────────────────────────────────────────────────────────── */
  .site-footer { border-top: 1px solid var(--rule); }
  .site-footer .wrap { display: flex; flex-wrap: wrap; gap: 16px 24px; justify-content: space-between; padding-block: 28px; font-size: 13px; color: var(--ink-3); }
  .site-footer nav { display: flex; flex-wrap: wrap; gap: 20px; }

  @media (max-width: 640px) {
    .wrap { padding-inline: 16px; }
    .hero { padding-block: 56px 48px; }
    .stage { padding: 24px; }
    section { padding-bottom: 72px; }
  }
  @media (prefers-reduced-motion: reduce) {
    html { scroll-behavior: auto; }
    *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
  }
</style>
</head>
<body>
<header class="site-header">
  <div class="wrap">
    <a class="brand" href="/" aria-label="OpenWOP registry home">
      <img src="/assets/OpenWOP.svg" alt="" aria-hidden="true">
      <span class="brand-word">Open<span class="accent">WOP</span></span>
      <span class="brand-sub">packs.openwop.dev</span>
    </a>
    <nav class="site-nav" aria-label="Registry">
      <a href="#catalog">Catalog</a>
      <a href="#trust">How packs are checked</a>
      <a href="#api">API</a>
      <a href="#publish">Publish</a>
      <a href="https://openwop.dev/">openwop.dev ↗</a>
      <a class="nav-pill" href="https://github.com/openwop/openwop-registry">GitHub →</a>
    </nav>
  </div>
</header>

<main>
  <div class="wrap hero">
    <div class="hero-copy">
      <p class="eyebrow">The OpenWOP registry</p>
      <h1 class="display">Building blocks for workflows, <span class="accent">signed and checked.</span></h1>
      <p class="lede">Reusable nodes, agents and whole workflow chains, published once and verified by every host before it runs them. Browse ${plural(total, 'pack', 'packs')}, or publish your own.</p>
      <div class="hero-actions">
        <a class="btn btn-solid" href="#catalog">Browse the catalog</a>
        <a class="btn" href="#publish">Publish a pack</a>
      </div>
    </div>
    <dl class="stats">
      <div><dt>Packs published</dt><dd>${total}</dd></div>
      <div><dt>Versions</dt><dd>${totalVersions}</dd></div>
      <div><dt>Signatures</dt><dd class="small">Ed25519</dd></div>
      <div><dt>Namespaces</dt><dd class="small">core<br>vendor<br>community</dd></div>
    </dl>
  </div>

  <section class="wrap" aria-labelledby="film-h">
    <div class="stage">
      <div class="stage-copy">
        <p class="eyebrow"><b>The film</b> · 1:13</p>
        <h2 id="film-h" class="display">Package it once. <span class="accent">Anyone can check it.</span></h2>
        <p class="muted">How a pack is signed, published and verified, with real output from the signing recipe and this registry's own discovery document.</p>
        <div class="stage-links">
          <a href="https://openwop.dev/for/pack-authors/">For pack authors →</a>
          <a href="https://openwop.dev/videos/">All films →</a>
        </div>
      </div>
      <div class="stage-media">
        <video controls preload="none" playsinline crossorigin="anonymous" poster="${FILM_BASE}-poster.jpg?v=${FILM_V}" aria-label="Film: Package it once. Anyone can check it. 1 minute 13 seconds.">
          <source src="${FILM_BASE}.mp4?v=${FILM_V}" type="video/mp4">
          <track kind="captions" srclang="en" label="English" src="${FILM_BASE}.en.vtt?v=${FILM_V}">
          <a href="${FILM_BASE}.mp4?v=${FILM_V}">Watch the packs film</a>
        </video>
      </div>
    </div>
  </section>

  <section id="catalog" class="wrap" aria-labelledby="catalog-h">
    <div class="section-head">
      <p class="eyebrow">Catalog</p>
      <h2 id="catalog-h" class="display">Eight kinds of pack.</h2>
      <p>Each kind plugs into a different part of a host, and a host reads the kind before it loads anything. Choose a kind to see its packs.</p>
    </div>
${
  total === 0
    ? '    <div class="empty">No packs published yet. The first one lands soon.</div>'
    : `    <div class="tabs">
      <input type="radio" name="catalog-tab" id="tab-nodes" class="tab-radio" checked>
      <input type="radio" name="catalog-tab" id="tab-agents" class="tab-radio">
      <input type="radio" name="catalog-tab" id="tab-artifact-types" class="tab-radio">
      <input type="radio" name="catalog-tab" id="tab-connections" class="tab-radio">
      <input type="radio" name="catalog-tab" id="tab-workflow-chains" class="tab-radio">
      <input type="radio" name="catalog-tab" id="tab-prompts" class="tab-radio">
      <input type="radio" name="catalog-tab" id="tab-cards" class="tab-radio">
      <input type="radio" name="catalog-tab" id="tab-form-content" class="tab-radio">

      <div class="tab-list" role="tablist" aria-label="Pack categories">
        <label class="tab" for="tab-nodes" role="tab">
          <span class="tab-top"><span class="tab-label">Node packs</span><span class="tab-count">${nodePacks.length}</span></span>
          <span class="tab-blurb">Typed nodes for the canvas: control flow, approval gates, HTTP, storage and MCP.</span>
        </label>
        <label class="tab" for="tab-agents" role="tab">
          <span class="tab-top"><span class="tab-label">Agent packs</span><span class="tab-count">${agentPacks.length}</span></span>
          <span class="tab-blurb">Agent personas: a system prompt, allowed tools, memory and handoffs.</span>
        </label>
        <label class="tab" for="tab-artifact-types" role="tab">
          <span class="tab-top"><span class="tab-label">Artifact types</span><span class="tab-count">${artifactTypePacks.length}</span></span>
          <span class="tab-blurb">Typed schemas for the work products a run creates and exports.</span>
        </label>
        <label class="tab" for="tab-connections" role="tab">
          <span class="tab-top"><span class="tab-label">Connections</span><span class="tab-count">${connectionPacks.length}</span></span>
          <span class="tab-blurb">Provider definitions: auth, scopes and reach. Never credentials.</span>
        </label>
        <label class="tab" for="tab-workflow-chains" role="tab">
          <span class="tab-top"><span class="tab-label">Workflow chains</span><span class="tab-count">${workflowChainPacks.length}</span></span>
          <span class="tab-blurb">Whole sub-workflows that a caller runs as one step.</span>
        </label>
        <label class="tab" for="tab-prompts" role="tab">
          <span class="tab-top"><span class="tab-label">Prompts</span><span class="tab-count">${promptPacks.length}</span></span>
          <span class="tab-blurb">Versioned, parameterized prompt templates.</span>
        </label>
        <label class="tab" for="tab-cards" role="tab">
          <span class="tab-top"><span class="tab-label">Chat cards</span><span class="tab-count">${cardPacks.length}</span></span>
          <span class="tab-blurb">AI chat cards: an input form, a prompt and an output contract.</span>
        </label>
        <label class="tab" for="tab-form-content" role="tab">
          <span class="tab-top"><span class="tab-label">Form content</span><span class="tab-count">${formContentPacks.length}</span></span>
          <span class="tab-blurb">Form templates a host turns into an ordinary, editable form.</span>
        </label>
      </div>

      <div class="tab-panel tab-panel-nodes" role="tabpanel" aria-labelledby="tab-nodes">
        <p class="tab-desc">
          <strong>Node packs</strong> ship reusable workflow building blocks — typed
          input/output handlers, control nodes (flow / branching / approval gates),
          and integrations (HTTP, storage, MCP). Authors drop them into the canvas
          at edit time; hosts load and verify them at runtime. See the
          <a href="https://openwop.dev/spec/v1/node-packs.md">node-packs.md</a>
          spec for the manifest contract and the SRI + Ed25519 trust model.
          Mixed packs that also ship agents are flagged
          <span class="flag flag-mixed">+ agent</span>.
        </p>
        ${nodePacks.length === 0
          ? '<div class="empty">No node packs published yet.</div>'
          : tableFor(nodeRows, 'Nodes')}
      </div>

      <div class="tab-panel tab-panel-agents" role="tabpanel" aria-labelledby="tab-agents">
        <p class="tab-desc">
          <strong>Agent packs</strong> ship reusable agent personas — each one bundles
          a system prompt, a tool allowlist, a memory shape, and handoff schemas. They
          are addressed by <code>AgentRef</code> and resolved at run time through the
          host's agent runtime, so the same pack can plug into supervisor, ReAct, or
          deep-research orchestration patterns. See
          <a href="https://github.com/openwop/openwop/blob/main/RFCS/0003-agent-packs.md">RFC 0003 (Active)</a>
          for the manifest contract. Mixed packs that also ship nodes are flagged
          <span class="flag flag-mixed">+ nodes</span>.
        </p>
        ${agentPacks.length === 0
          ? '<div class="empty">No agent packs published yet — the first pure-agent packs are in the <code>core.openwop.agents.*</code> family.</div>'
          : tableFor(agentRows, 'Agents')}
      </div>

      <div class="tab-panel tab-panel-artifact-types" role="tabpanel" aria-labelledby="tab-artifact-types">
        <p class="tab-desc">
          <strong>Artifact-type packs</strong> register typed artifact schemas (a
          JSON Schema + export targets) into a host's artifact registry — so workflow
          outputs (one-pagers, brand kits, SOWs) are typed, validated, and exportable.
          They are <em>declarative</em>: a manifest with <code>kind: "artifact-type"</code>
          and an <code>artifactTypes[]</code> array, no runtime. See
          <a href="https://github.com/openwop/openwop/blob/main/RFCS/0075-artifact-type-packs-realworld-amendment.md">RFC 0075</a>
          (publishable per <a href="https://github.com/openwop/openwop/blob/main/RFCS/0107-publishable-declarative-pack-kinds.md">RFC 0107</a>).
        </p>
        ${artifactTypePacks.length === 0
          ? '<div class="empty">No artifact-type packs published yet.</div>'
          : tableFor(artifactTypeRows, 'Types')}
      </div>

      <div class="tab-panel tab-panel-connections" role="tabpanel" aria-labelledby="tab-connections">
        <p class="tab-desc">
          <strong>Connection packs</strong> ship portable provider definitions — OAuth /
          API-key auth, scopes, and reach (MCP / OpenAPI / integration) — that make a
          host's connection registry installable for third-party providers. They are
          <em>declarative</em>: a manifest with <code>kind: "connection"</code> and a
          <code>provider</code> object, no runtime and <strong>no credential material</strong>
          (enforced). See
          <a href="https://github.com/openwop/openwop/blob/main/RFCS/0095-connection-packs-portable-provider-definitions.md">RFC 0095</a>
          (publishable per <a href="https://github.com/openwop/openwop/blob/main/RFCS/0107-publishable-declarative-pack-kinds.md">RFC 0107</a>).
        </p>
        ${connectionPacks.length === 0
          ? '<div class="empty">No connection packs published yet.</div>'
          : tableFor(connectionRows, 'Provider')}
      </div>

      <div class="tab-panel tab-panel-workflow-chains" role="tabpanel" aria-labelledby="tab-workflow-chains">
        <p class="tab-desc">
          <strong>Workflow-chain packs</strong> ship reusable sub-workflows — a parameterized
          DAG of nodes that callers invoke as a single step (and that expands inline at edit
          time). They are <em>declarative</em>: a manifest with <code>kind: "workflow-chain"</code>
          and a <code>chains[]</code> array, no runtime. See
          <a href="https://github.com/openwop/openwop/blob/main/RFCS/0013-workflow-chain-packs.md">RFC 0013</a>
          (publishable per <a href="https://github.com/openwop/openwop/blob/main/RFCS/0107-publishable-declarative-pack-kinds.md">RFC 0107</a>).
        </p>
        ${workflowChainPacks.length === 0
          ? '<div class="empty">No workflow-chain packs published yet.</div>'
          : tableFor(workflowChainRows, 'Chains')}
      </div>

      <div class="tab-panel tab-panel-prompts" role="tabpanel" aria-labelledby="tab-prompts">
        <p class="tab-desc">
          <strong>Prompt packs</strong> ship reusable, versioned prompt templates — named,
          parameterized text with model hints — that a host's prompt library resolves at run
          time (with the override hierarchy of RFC 0029). They are <em>declarative</em>: a
          manifest with <code>kind: "prompt"</code> and a <code>prompts[]</code> array, no runtime. See
          <a href="https://github.com/openwop/openwop/blob/main/RFCS/0027-prompt-templates.md">RFC 0027</a>
          (publishable per <a href="https://github.com/openwop/openwop/blob/main/RFCS/0107-publishable-declarative-pack-kinds.md">RFC 0107</a>).
        </p>
        ${promptPacks.length === 0
          ? '<div class="empty">No prompt packs published yet.</div>'
          : tableFor(promptRows, 'Templates')}
      </div>

      <div class="tab-panel tab-panel-cards" role="tabpanel" aria-labelledby="tab-cards">
        <p class="tab-desc">
          <strong>Card packs</strong> ship reusable, prompt-driven <em>AI chat cards</em> — a
          typed input form + a prompt template + an output contract — that a host's chat
          surface (<code>host.chat.cardPacks</code>) resolves and executes through its AI
          envelope. They are <em>declarative</em>: a manifest with <code>kind: "card"</code>
          and a <code>cards[]</code> array, no runtime; card-input content is treated as
          <code>contentTrust: "untrusted"</code>. See
          <a href="https://github.com/openwop/openwop/blob/main/RFCS/0071-artifact-type-and-chat-card-packs.md">RFC 0071</a>
          (publishable per <a href="https://github.com/openwop/openwop/blob/main/RFCS/0107-publishable-declarative-pack-kinds.md">RFC 0107</a>).
        </p>
        ${cardPacks.length === 0
          ? '<div class="empty">No card packs published yet.</div>'
          : tableFor(cardRows, 'Cards')}
      </div>

      <div class="tab-panel tab-panel-form-content" role="tabpanel" aria-labelledby="tab-form-content">
        <p class="tab-desc">
          <strong>Form-content packs</strong> ship reusable <em>form templates</em> — a title
          plus a field list — that a host instantiates into an ordinary, fully editable form.
          They are <em>declarative</em>: a manifest with <code>kind: "form-content"</code> and a
          <code>templates[]</code> array, no runtime and no code. Instantiation goes through the
          host's normal create path, so every field is sanitized exactly as hand-typed input is,
          and the resulting form is the tenant's to edit or delete.
        </p>
        ${formContentPacks.length === 0
          ? '<div class="empty">No form-content packs published yet.</div>'
          : tableFor(formContentRows, 'Templates')}
      </div>
    </div>`
}
  </section>

  <section id="trust" class="wrap" aria-labelledby="trust-h">
    <div class="section-head">
      <p class="eyebrow">How packs are checked</p>
      <h2 id="trust-h" class="display">Change one byte, <span class="accent">and it fails.</span></h2>
    </div>
    <ol class="steps">
      <li><span class="step-n">1 · Signed</span><span class="step-t">Every tarball is signed.</span><span class="step-b">Each version ships an Ed25519 signature beside its <code>.tgz</code>, made with the registry's root key.</span></li>
      <li><span class="step-n">2 · Pinned</span><span class="step-t">The manifest pins its hash.</span><span class="step-b">An SRI hash in the version manifest names the exact tarball, so a changed byte is caught.</span></li>
      <li><span class="step-n">3 · Verified</span><span class="step-t">The host checks before it loads.</span><span class="step-b">Hosts in <code>verified</code> trust mode MUST check each tarball against the key before unpacking it (<a href="https://openwop.dev/spec/v1/node-packs.md">node-packs.md §Trust model</a>).</span></li>
    </ol>
    <div class="split">
      <div class="panel">
        <h3>Verify a pack yourself</h3>
        <p>Node 20 or later, with the root key from <a href="/keys/openwop-registry-root.pub"><code>/keys/openwop-registry-root.pub</code></a> (PEM, Ed25519):</p>
        <pre><code>const { createPublicKey, verify } = require('node:crypto');
const { readFileSync } = require('node:fs');
const pub = createPublicKey({ key: readFileSync('root.pub'), format: 'pem' });
const ok = verify(null, readFileSync('pack.tgz'), pub, readFileSync('pack.sig'));
// ok === true if the tarball is signed by this registry's root key</code></pre>
      </div>
      <div class="panel">
        <h3>Who can publish where</h3>
        <div class="tiers">
          <div><code>core.*</code><p>The OpenWOP working group; spec-canonical packs only. ${plural(coreCount, 'pack', 'packs')}.</p></div>
          <div><code>vendor.&lt;org&gt;.*</code><p>Controlled by one vendor organization. ${plural(vendorCount, 'pack', 'packs')}.</p></div>
          <div><code>community.&lt;author&gt;.*</code><p>Open to anyone; the first claim on a name wins. ${plural(communityCount, 'pack', 'packs')}.</p></div>
        </div>
        <p class="fine"><code>private.*</code> and <code>local.*</code> never appear here: they are for host-internal and in-repo packs.</p>
      </div>
    </div>
  </section>

  <section id="api" class="wrap" aria-labelledby="api-h">
    <div class="section-head">
      <p class="eyebrow">API</p>
      <h2 id="api-h" class="display">Read-only, and discoverable.</h2>
      <p>Clients resolve every path through the discovery document rather than hard-coding them.</p>
    </div>
    <div class="panel">
      <ul class="endpoint-list">
        <li><code><a href="/.well-known/openwop-registry">/.well-known/openwop-registry</a></code> <span class="note">discovery: every endpoint template</span></li>
        <li><code><a href="/v1/index.json">/v1/index.json</a></code> <span class="note">the full pack catalog</span></li>
        <li><code>/v1/packs/{name}/index.json</code> <span class="note">one pack's metadata and versions</span></li>
        <li><code>/v1/packs/{name}/-/{version}.json</code> <span class="note">version manifest</span></li>
        <li><code>/v1/packs/{name}/-/{version}.tgz</code> <span class="note">signed tarball</span></li>
        <li><code>/v1/packs/{name}/-/{version}.sig</code> <span class="note">Ed25519 signature</span></li>
      </ul>
      <p class="fine">A pack schema whose <code>$id</code> is <code>https://packs.openwop.dev/{name}/{version}/&lt;schema&gt;.json</code> resolves to the schema extracted from the signed tarball. The tarball is canonical and the mirrored URL is derived, so verify against the tarball when integrity matters (<a href="https://openwop.dev/spec/v1/node-packs.md">node-packs.md §"Schema $id resolution"</a>).</p>
    </div>
  </section>

  <section id="publish" class="wrap" aria-labelledby="publish-h">
    <div class="stage">
      <div class="stage-copy">
        <h2 id="publish-h" class="display">Publish a pack.</h2>
        <p class="muted">Build the pack, sign the tarball with your key, and open a pull request. There is no write API on purpose. CI checks the manifest, the hash and the signature before merge, and a merge to <code>main</code> deploys it.</p>
        <div class="hero-actions">
          <a class="btn btn-solid" href="https://github.com/openwop/openwop/blob/main/docs/PACK-AUTHOR-QUICKSTART.md">Read the pack-author quickstart</a>
          <a class="btn" href="https://github.com/openwop/openwop-registry">Open the registry repo</a>
        </div>
      </div>
      <pre><code><span class="c"># scaffold a pack</span>
node scripts/new-pack.mjs
<span class="c"># sign and register a version</span>
node scripts/publish-pack.mjs
<span class="c"># check everything before you push</span>
npm run check</code></pre>
    </div>
  </section>
</main>

<footer class="site-footer">
  <div class="wrap">
    <span>Generated ${htmlEscape(generatedAt)} · OpenWOP registry</span>
    <nav aria-label="More">
      <a href="/v1/index.json">Index JSON</a>
      <a href="/.well-known/openwop-registry">Discovery</a>
      <a href="https://openwop.dev/">openwop.dev</a>
      <a href="https://github.com/openwop/openwop">OpenWOP on GitHub</a>
    </nav>
  </div>
</footer>
</body>
</html>
`;

  const dst = join(ROOT, 'index.html');
  if (checkMode) {
    const existing = existsSync(dst) ? readFileSync(dst, 'utf8') : '';
    // The landing page bakes in a generation timestamp; compare ignoring that
    // line so --check is stable across runs.
    const stripTs = (s) => s.replace(/Generated [^<]+/, 'Generated …');
    if (stripTs(existing) !== stripTs(html)) {
      console.error(`[build-index --check] ${dst} would change`);
      process.exitCode = 1;
    }
  } else {
    writeFileSync(dst, html, 'utf8');
  }
}

function emitRobotsTxt() {
  // Allow the landing page; disallow API surface so search engines don't
  // clutter results with JSON files. Sitemap is the landing page itself.
  const txt = `User-agent: *
Allow: /$
Allow: /index.html
Disallow: /v1/
Disallow: /v2/
Disallow: /keys/
Disallow: /.well-known/

Sitemap: https://packs.openwop.dev/
`;
  const dst = join(ROOT, 'robots.txt');
  if (checkMode) {
    const existing = existsSync(dst) ? readFileSync(dst, 'utf8') : '';
    if (existing !== txt) {
      console.error(`[build-index --check] ${dst} would change`);
      process.exitCode = 1;
    }
  } else {
    writeFileSync(dst, txt, 'utf8');
  }
}

const packs = listPackNames();
if (TREE === 'v2' && packs.length === 0) {
  console.log(`[build-index] no registry/v2/packs — nothing to rebuild for the v2 tree`);
  process.exit(0);
}
const docs = packs.map(rebuildPack).filter((p) => p !== null);
if (fatal.length > 0) {
  console.error(`[build-index --tree ${TREE}] ${fatal.length} manifest(s) are not valid for this tree:`);
  for (const f of fatal) console.error(`  - ${f}`);
  process.exit(1);
}
rebuildRegistryIndex(docs);
if (TREE === 'v1') {
  emitLandingPage(docs);
  emitRobotsTxt();
}

if (warnings.length > 0) {
  console.error('build-index warnings:');
  for (const w of warnings) console.error(`  - ${w}`);
}

if (process.exitCode === 1) {
  console.error('[build-index] check mode: files would change; run without --check to fix');
  process.exit(1);
}
console.log(`[build-index --tree ${TREE}] rebuilt ${docs.length} pack(s); ${warnings.length} warning(s)`);
