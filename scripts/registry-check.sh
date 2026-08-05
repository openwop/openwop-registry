#!/usr/bin/env bash
# registry-check — standalone gate for the openwop-registry repo.
#
# Mirror of the registry/pack validation that used to live in the spec
# corpus's openwop:check (step 7) plus the registry-publish.yml validate job.
# Run before pushing to skip the CI round-trip. Exits non-zero on any failure.
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

echo "=== registry:check OK ==="
