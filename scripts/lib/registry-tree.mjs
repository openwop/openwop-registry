/**
 * registry-tree — the one place the registry's tree-versioning is spelled.
 *
 * RFC 0177 §A.2/§A.3 (packs.md §"The registry tree"): the registry is versioned
 * BY TREE, not by header. `registry/v1/` is the immutable v1 tree (served
 * read-only through the overlap); `registry/v2/` is the parallel tree of
 * re-signed manifests. Every script that reads or writes a tree takes
 * `--tree v1|v2` (default v1, the historical behavior) and derives its paths and
 * its signing rules from here.
 *
 *   v1 — `signing: { method: manual, publicKeyRef, signatureRef }`; catalog rows
 *        carry `signingMethod` + `signingKeyId`.
 *   v2 — `signing: { keyId, scheme: ed25519-canonical-json }` (RFC 0177 §C.3/§C.4);
 *        catalog rows carry `signingScheme` + `signingKeyId`; `kind` REQUIRED (§C.5);
 *        `engines.openwop` MUST admit protocol major 2 with an explicit ceiling (§A.1).
 */

export const TREES = ['v1', 'v2'];
export const V2_SCHEME = 'ed25519-canonical-json';
/** packs.md §"The engine range": `>=x[.y[.z]] <M.0.0`. */
export const ENGINE_RANGE = /^>=\d+(\.\d+){0,2} <(\d+)\.0\.0$/;

/** `--tree v1|v2` from argv (default v1). Exits 2 on an unknown value. */
export function treeFromArgv(argv = process.argv.slice(2)) {
  const i = argv.indexOf('--tree');
  const tree = i >= 0 ? argv[i + 1] : 'v1';
  if (!TREES.includes(tree)) {
    console.error(`--tree must be one of ${TREES.join('|')} (got "${tree}")`);
    process.exit(2);
  }
  return tree;
}

/** Does this manifest's engines range admit protocol major 2 (RFC 0177 §A.1)? */
export function admitsV2(manifest) {
  const range = manifest?.engines?.openwop;
  const m = typeof range === 'string' ? ENGINE_RANGE.exec(range) : null;
  return Boolean(m) && Number(m[2]) > 2;
}

/**
 * Which tree a SOURCE manifest publishes to. A manifest migrated for the v2
 * wave (explicit ceiling admitting major 2; declaration-key peer dependencies)
 * is a v2 manifest — a v1 host would refuse its identifiers with
 * `pack_peer_dependency_undefined` — so its publication tree is v2 and the v1
 * tree stays read-only (RFC 0177 §A.2). Everything else is v1.
 */
export function publicationTree(manifest) {
  return admitsV2(manifest) ? 'v2' : 'v1';
}

/**
 * The signing key id a served manifest names, per tree. v2 admits ONLY `keyId`
 * (`publicKeyRef` is deleted, §C.4); v1 reads `publicKeyRef` first, then the
 * legacy `keyId` alias. Returns { keyId, problems[] }.
 */
export function signerOf(manifest, tree) {
  const s = manifest?.signing;
  const problems = [];
  if (!s || typeof s !== 'object') return { keyId: undefined, problems: ['no signing block'] };
  if (tree === 'v2') {
    if ('publicKeyRef' in s) problems.push('signing.publicKeyRef is deleted in v2 (RFC 0177 §C.4) — keyId only');
    if ('method' in s) problems.push('signing.method is deleted in v2 (RFC 0177 §C.3) — scheme only');
    if (typeof s.keyId !== 'string' || !s.keyId) problems.push('signing.keyId is REQUIRED in v2');
    if (s.scheme !== V2_SCHEME) problems.push(`signing.scheme MUST be ${V2_SCHEME} (got ${JSON.stringify(s.scheme)})`);
    return { keyId: s.keyId, problems };
  }
  return { keyId: s.publicKeyRef ?? s.keyId, problems };
}
