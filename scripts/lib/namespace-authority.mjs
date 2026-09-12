/**
 * namespace-authority — who may sign what, read from the registry's own
 * `.well-known/openwop-registry.json` instead of a literal in a script.
 *
 * `packs.md` §Signing: *"A verifier MUST verify the signature against the
 * issuing registry's key for `keyId` and MUST check the pack name against that
 * key's `permittedNamespaces`."* The registry publishes `signingKeys[]` with
 * `permittedNamespaces` and `namespaceAssignments[]` binding a namespace to an
 * owner and a key. That document is the authority; anything that re-states it
 * in code is a copy that can drift, and did:
 *
 *   - `auto-register.mjs` hardcoded three regexes. `openwop-team-1` is
 *     permitted `community.openwop-team.*` and the list omitted it, so
 *     `community.openwop-team.demo` sat unpublished on the v2 tree with a key
 *     on disk that may sign it and a pipeline that never offered.
 *   - The same list has no concept of a key it does not hold, so 39
 *     `vendor.myndhyve.*` packs — a namespace assigned to `myndhyve-internal-1`
 *     since 2026-05-11, key registered `active` in this very document — were
 *     reported as "all first-party packs are up to date" (openwop-registry#50).
 *
 * A hardcoded permission list and the registry it is meant to mirror are the
 * same failure seen from two sides: one of them is authoritative and the other
 * is a claim about it. Read the document. Measured 2026-09-12.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WELL_KNOWN = join(ROOT, 'registry', '.well-known', 'openwop-registry.json');

/** The registry's published key + namespace registry. */
export function keyRegistry() {
  const doc = JSON.parse(readFileSync(WELL_KNOWN, 'utf-8'));
  const keys = Array.isArray(doc.signingKeys) ? doc.signingKeys : [];
  const assignments = Array.isArray(doc.namespaceAssignments) ? doc.namespaceAssignments : [];
  return { keys, assignments };
}

/**
 * Does `pattern` (a `permittedNamespaces` entry) cover `name`? Entries are
 * either an exact pack name or a `<prefix>.*` glob. A bare prefix without the
 * glob matches nothing but itself — deliberately, so a typo narrows rather
 * than widens.
 */
export function namespaceCovers(pattern, name) {
  if (pattern.endsWith('.*')) return name.startsWith(pattern.slice(0, -1));
  return name === pattern;
}

/** Every registered key whose `permittedNamespaces` covers `name`, active only. */
export function keysPermittedFor(name, registry = keyRegistry()) {
  return registry.keys
    .filter((k) => (k.status ?? 'active') === 'active')
    .filter((k) => (k.permittedNamespaces ?? []).some((p) => namespaceCovers(p, name)));
}

/** The key id this pack's namespace is ASSIGNED to, if any (the owner of record). */
export function assignedKeyId(name, registry = keyRegistry()) {
  const hit = registry.assignments.find((a) => namespaceCovers(a.namespace, name));
  return hit ? { keyId: hit.signingKeyId, owner: hit.owner } : null;
}

/** May `keyId` sign `name`? The `packs.md` §Signing namespace check, verbatim. */
export function keyMaySign(keyId, name, registry = keyRegistry()) {
  const key = registry.keys.find((k) => k.keyId === keyId);
  if (!key) return { ok: false, reason: `keyId "${keyId}" is not registered in the registry's .well-known document` };
  if ((key.status ?? 'active') !== 'active') return { ok: false, reason: `key "${keyId}" is status "${key.status}"` };
  const permitted = key.permittedNamespaces ?? [];
  if (!permitted.some((p) => namespaceCovers(p, name))) {
    return { ok: false, reason: `key "${keyId}" permits [${permitted.join(', ')}] and does not cover "${name}"` };
  }
  return { ok: true };
}
