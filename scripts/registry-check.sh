#!/usr/bin/env bash
# registry-check — standalone gate for the openwop-registry repo.
#
# Mirror of the registry/pack validation that used to live in the spec
# corpus's openwop:check (step 7) plus the registry-publish.yml validate job.
# Run before pushing to skip the CI round-trip. Exits non-zero on any failure.
# Steps 1–9 gate the v1 tree; the v2 leg below gates registry/v2 (RFC 0177).
# Needs `npm install` once (ajv for the v2 schema test); the v1 steps are stdlib-only.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== registry:check — validating $ROOT ==="

echo "[1/9] Registry index up to date (build-index --check)..."
node registry/scripts/build-index.mjs --tree v1 --check

echo "[2/9] Pack tarball signatures (Ed25519 over in-tarball pack.json)..."
node scripts/check-pack-tarball-signatures.mjs --tree v1

echo "[3/9] Registry signer-metadata consistency..."
node scripts/check-registry-signer-consistency.mjs --tree v1

echo "[4/9] Published-tarball signatures (registry/scripts/verify-signatures)..."
node registry/scripts/verify-signatures.mjs --tree v1

echo "[5/9] Agent-pack systemPromptRef bundling..."
node scripts/check-pack-prompt-refs.mjs

echo "[6/9] Agent tool-allowlist resolves..."
node scripts/check-agent-tool-allowlist.mjs

echo "[7/9] SBOMs up to date (generate-sbom --check)..."
node registry/scripts/generate-sbom.mjs --tree v1 --check

echo "[8/9] Security advisories valid + conformance..."
node registry/scripts/check-advisories.mjs --tree v1
node registry/scripts/conformance-check.mjs --tree v1

echo "[9/9] Pack-internal schema \$ids match <pack>/<version>/..."
# Extracted from an inline heredoc in packs-check.yml so it can be run, tested
# and probed LOCALLY — its absence from this file is why a routine version bump
# left main red for four days with no way to see it except by pushing.
node scripts/check-pack-schema-ids.mjs

echo "[jcs] The signer's canonical JSON is RFC 8785 JCS over I-JSON, and every committed pack.json keeps its bytes (RFC 0212)..."
node --test scripts/test-jcs.mjs

# ── v2 leg (RFC 0177 §A.2 — the parallel registry/v2 tree gets the SAME gate) ──
# Validates registry/v2 whenever registry/v2/packs exists (it is committed). The
# tree is written by `scripts/auto-register.mjs --tree v2`: the `registry-v2-sign`
# CI job runs it with OPENWOP_TEAM_1_SIGNING_KEY for first-party namespaces, and
# a publisher runs it locally with any key registered in signingKeys[]. The skip
# branch below only fires in a checkout that has no v2 tree.
echo "=== registry:check — v2 tree ==="
if [ ! -d registry/v2/packs ]; then
  echo "[v2 -/8] SKIP: registry/v2/packs is absent in this checkout — nothing to validate. Stage it with scripts/auto-register.mjs --tree v2 (the registry-v2-sign CI job does this with openwop-team-1; a publisher does it with their own registered key)."
  echo "[v2 0/8] Vendored v2 schema self-tests still run (the schema itself enforces RFC 0177 §A.1/§C.3–§C.5; tree legs skip with their reason)..."
  node --test scripts/test-registry-v2-schemas.mjs
else
  echo "[v2 1/9] Registry v2 index up to date (build-index --tree v2 --check)..."
  node registry/scripts/build-index.mjs --tree v2 --check
  echo "[v2 2/9] Pack tarball signatures — one scheme, keyId required (check-pack-tarball-signatures --tree v2)..."
  node scripts/check-pack-tarball-signatures.mjs --tree v2
  echo "[v2 3/9] Registry signer-metadata consistency (--tree v2)..."
  node scripts/check-registry-signer-consistency.mjs --tree v2
  echo "[v2 4/9] Published-tarball signatures + namespace authorization (verify-signatures --tree v2)..."
  node registry/scripts/verify-signatures.mjs --tree v2
  echo "[v2 5/9] Structural conformance (conformance-check --tree v2)..."
  node registry/scripts/conformance-check.mjs --tree v2
  echo "[v2 6/9] SBOMs up to date (generate-sbom --tree v2 --check)..."
  node registry/scripts/generate-sbom.mjs --tree v2 --check
  echo "[v2 7/9] Security advisories cross-checked against the v2 tree..."
  node registry/scripts/check-advisories.mjs --tree v2
  echo "[v2 8/9] Every v2 version manifest validates against the VENDORED v2 schemas (ajv, CORPUS_TAG) + schema self-tests..."
  node --test scripts/test-registry-v2-schemas.mjs
  echo "[v2 9/10] Every pack is INSTALLABLE on a major-2 host (engines.openwop admits major 2, RFC 0177 §A.1)..."
  node scripts/check-pack-engines-admit-major.mjs --major 2
  echo "[v2 10/12] Every peer-dependency key names a family that EXISTS (packs.md §Peer-dependency identifiers)..."
  node scripts/check-pack-peer-dependencies.mjs
  echo "[v2 11/12] Every published version was signed by a key the registry PERMITS for its namespace (packs.md §Signing)..."
  node scripts/check-pack-namespace-authority.mjs --tree v2
  node scripts/check-pack-namespace-authority.mjs --tree v1
  node scripts/check-pack-event-names.mjs
  node scripts/check-pack-chain-params-declared.mjs
  echo "[v2 12/12] Every pack that ships schemas ships them at EVERY published version (a manifest whose documents are absent serves 404s)..."
  node scripts/check-pack-schema-tree-complete.mjs --tree v2
  node scripts/check-pack-schema-tree-complete.mjs --tree v1
  echo "[v2 13/13] Every v2 pack manifest a host installs validates against the corpus bare-manifest schema for its kind (openwop-registry#69)..."
  node scripts/check-pack-manifest-schemas.mjs
  echo "[v2 14/14] A published version is immutable outside its lifecycle fields, and a new one is signed by an active key (openwop RFC 0222; base origin/main, SKIP if absent)..."
  node scripts/check-published-immutable.mjs
  node --test scripts/test-remote-entry-binding.mjs
fi

echo "=== registry:check OK ==="
