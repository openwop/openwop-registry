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
node registry/scripts/build-index.mjs --check

echo "[2/9] Pack tarball signatures (Ed25519 over in-tarball pack.json)..."
node scripts/check-pack-tarball-signatures.mjs

echo "[3/9] Registry signer-metadata consistency..."
node scripts/check-registry-signer-consistency.mjs

echo "[4/9] Published-tarball signatures (registry/scripts/verify-signatures)..."
node registry/scripts/verify-signatures.mjs

echo "[5/9] Agent-pack systemPromptRef bundling..."
node scripts/check-pack-prompt-refs.mjs

echo "[6/9] Agent tool-allowlist resolves..."
node scripts/check-agent-tool-allowlist.mjs

echo "[7/9] SBOMs up to date (generate-sbom --check)..."
node registry/scripts/generate-sbom.mjs --check

echo "[8/9] Security advisories valid + conformance..."
node registry/scripts/check-advisories.mjs
node registry/scripts/conformance-check.mjs

echo "[9/9] Pack-internal schema \$ids match <pack>/<version>/..."
# Extracted from an inline heredoc in packs-check.yml so it can be run, tested
# and probed LOCALLY — its absence from this file is why a routine version bump
# left main red for four days with no way to see it except by pushing.
node scripts/check-pack-schema-ids.mjs

# ── v2 leg (RFC 0177 §A.2 — the parallel registry/v2 tree gets the SAME gate) ──
# Skips cleanly with a printed reason while registry/v2 is absent: the signed v2
# tree is produced only by the `registry-v2-sign` CI job (auto-register.yml),
# which holds OPENWOP_TEAM_1_SIGNING_KEY. Everything before that job is in-tree;
# a local run can only exercise the pipeline with a throwaway key.
echo "=== registry:check — v2 tree ==="
if [ ! -d registry/v2/packs ]; then
  echo "[v2 -/8] SKIP: registry/v2 is absent — the signed v2 tree is produced only by the registry-v2-sign CI job (OPENWOP_TEAM_1_SIGNING_KEY); nothing to validate locally."
  echo "[v2 0/8] Vendored v2 schema self-tests still run (the schema itself enforces RFC 0177 §A.1/§C.3–§C.5; tree legs skip with their reason)..."
  node --test scripts/test-registry-v2-schemas.mjs
else
  echo "[v2 1/8] Registry v2 index up to date (build-index --tree v2 --check)..."
  node registry/scripts/build-index.mjs --tree v2 --check
  echo "[v2 2/8] Pack tarball signatures — one scheme, keyId required (check-pack-tarball-signatures --tree v2)..."
  node scripts/check-pack-tarball-signatures.mjs --tree v2
  echo "[v2 3/8] Registry signer-metadata consistency (--tree v2)..."
  node scripts/check-registry-signer-consistency.mjs --tree v2
  echo "[v2 4/8] Published-tarball signatures + namespace authorization (verify-signatures --tree v2)..."
  node registry/scripts/verify-signatures.mjs --tree v2
  echo "[v2 5/8] Structural conformance (conformance-check --tree v2)..."
  node registry/scripts/conformance-check.mjs --tree v2
  echo "[v2 6/8] SBOMs up to date (generate-sbom --tree v2 --check)..."
  node registry/scripts/generate-sbom.mjs --tree v2 --check
  echo "[v2 7/8] Security advisories cross-checked against the v2 tree..."
  node registry/scripts/check-advisories.mjs --tree v2
  echo "[v2 8/8] Every v2 version manifest validates against the VENDORED v2 schemas (ajv, CORPUS_TAG) + schema self-tests..."
  node --test scripts/test-registry-v2-schemas.mjs
fi

echo "=== registry:check OK ==="
