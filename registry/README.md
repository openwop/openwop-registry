# `packs.openwop.dev` — openwop node-pack registry MVP

Read-only static registry serving signed openwop node packs. Backed by Firebase Hosting (`packs` target in `firebase.json`). Submissions land via maintainer PR; CI validates manifest + integrity + signature before merging; merge-to-`main` triggers deploy.

This directory is the deploy root. Everything under `registry/` is served at `https://packs.openwop.dev/` modulo the rewrites declared in `firebase.json`.

## Layout

```
registry/
├── README.md                           (this file — excluded from deploy)
├── .well-known/
│   └── openwop-registry.json           served at /.well-known/openwop-registry (rewritten)
├── v1/                                 the v1 tree — served read-only through the v1/v2 overlap (RFC 0177 §A.2)
│   ├── index.json                      served at /v1/index.json (registry-wide listing)
│   └── packs/
│       └── <pack-name>/
│           ├── index.json              served at /v1/packs/<pack-name> (rewritten)
│           └── -/
│               ├── <version>.json      version manifest
│               ├── <version>.tgz       signed pack tarball
│               ├── <version>.sig       signature (ed25519 or sigstore bundle)
│               └── <version>.sbom.json CycloneDX 1.6 SBOM (files, hashes, peer deps)
├── v2/                                 the v2 tree (RFC 0177 §A.2): the same layout, signed under the one
│   ├── index.json                      scheme `ed25519-canonical-json` (`signing: { keyId, scheme }`). Written
│   ├── sbom.json                       by `scripts/auto-register.mjs --tree v2`: the `registry-v2-sign` CI job
│   └── packs/<pack-name>/…             (auto-register.yml) runs it with openwop-team-1 for first-party namespaces;
│                                       any publisher runs it locally with their own key in signingKeys[].
├── keys/
│   └── <keyId>.pub                     signing public key(s); served at /keys/<keyId>.pub
├── security/
│   └── advisories.json                 registry-owned CVE advisory feed (see Security advisories)
└── scripts/                            local dev only — excluded from deploy
    ├── build-index.mjs                 regenerates index/aggregate JSON from on-disk packs
    ├── generate-sbom.mjs               writes per-version + aggregate CycloneDX SBOMs
    ├── verify-signatures.mjs           crypto-verifies every published Ed25519 signature
    ├── conformance-check.mjs           structural conformance for every pack
    ├── check-advisories.mjs            cross-checks advisories against published versions
    └── serve.mjs                       local-dev HTTP server mirroring Firebase rewrites
```

## URL endpoints

Per `spec/v2/core/packs.md` §"The registry tree" + RFC 0222 (v2), and `spec/v1/node-packs.md` §"Registry HTTP API" for the frozen v1 tree:

| URL | Returns |
|---|---|
| `GET /.well-known/openwop-registry` | Discovery metadata (registry version, supported namespaces, signing keys, `endpoints.v1` / `endpoints.v2`). |
| `GET /v2/index.json`, `/v2/packs/{name}/index.json`, `/v2/packs/{name}/-/{version}.{json,tgz,sig,sbom.json}`, `/v2/sbom.json` | **The v2 tree — where new publications land** (RFC 0177 §A.2/§A.3, `spec/v2/core/packs.md`). Same shapes as v1 with the `/v2/` prefix, `signing: { keyId, scheme: "ed25519-canonical-json" }` (detached Ed25519 over the JCS bytes of the in-tarball `pack.json`), `kind` required, explicit `engines.openwop` ceiling. |
| `GET /v1/index.json` | Registry-wide pack listing for search/browse UIs (frozen v1 tree; the rows below are v1 too). |
| `GET /v1/packs/{name}/index.json` | Pack metadata + version list (aggregate). |
| `GET /v1/packs/{name}/-/{version}.json` | Version manifest. |
| `GET /v1/packs/{name}/-/{version}.tgz` | Signed pack tarball. |
| `GET /v1/packs/{name}/-/{version}.sig` | Signature for the tarball. |
| `GET /keys/{keyId}.pub` | Registry signing public key. |
| `GET /v1/packs/{name}/-/{version}.sbom.json` | Per-version SBOM (CycloneDX 1.6). |
| `GET /v1/sbom.json` | Aggregate SBOM listing every published version. |

The registry is versioned by tree, not header; the v1 tree is frozen through the overlap. The scripts that read or write a tree take `--tree v1|v2` and default to **v2** (`scripts/lib/registry-tree.mjs`); pass `--tree v1` only to maintain or gate the frozen tree.

**Discovery is authoritative.** A v2 client MUST resolve every registry path through `.well-known` `endpoints` (packs.md §"The registry tree"), preferring `endpoints.v2`; v1 clients SHOULD substitute `{name}` / `{version}` into the templates declared in `.well-known/openwop-registry` `endpoints` rather than hardcoding paths. Filesystem-backed registries (this one and other static-CDN deployments) serve pack metadata at `/index.json` because CDN URL-rewrite engines don't reliably match dot-containing path segments — clients reach the abstract `/v1/packs/{name}` endpoint described by `node-packs.md` via the discovery template.

Write endpoints (`PUT /v2/packs/{name}/-/{version}.tgz`, or the v1 equivalent) are NOT supported — `writeApi.supported: false`; the v2 protocol names no write endpoint (RFC 0222). Publish via the maintainer PR flow below.

## Publish flow

Read-only registry — submissions go through GitHub PRs. The CI gate at `.github/workflows/registry-publish.yml` validates each submission before merge; merge-to-`main` triggers Firebase deploy. New publications go to the **v2 tree**; the v1 tree is read-only (`scripts/auto-register.mjs --tree v1` skips every v2 manifest). The author walkthrough, including key registration, is the corpus's [`docs/PACK-AUTHOR-QUICKSTART.md`](https://github.com/openwop/openwop/blob/main/docs/PACK-AUTHOR-QUICKSTART.md). All commands run from the repo root.

### 1. Scaffold the pack

```bash
node scripts/new-pack.mjs community.<group>.<pack>
```

This copies [`templates/node-pack/`](../templates/node-pack/) to `packs/<name>/` with the placeholders filled. The template is already a v2 manifest: `kind: "node"`, `engines.openwop: ">=1.0.0 <3.0.0"`, no `signing` block. `--template <dir>` uses another source tree instead.

### 2. Check the build

```bash
node scripts/build-pack-tarball.mjs --pack <name> \
  --signed --key <private.pem> --key-id <keyId> \
  --tree v2 --scheme ed25519-canonical-json
```

Writes a deterministic tarball, manifest, signature and integrity hash to `dist/packs/` (gitignored) and refuses a manifest a v2 host would refuse. The signature is Ed25519 over the canonical JSON of the in-tarball `pack.json`, not over the tarball bytes.

### 3. Stage the v2 artifacts

```bash
node scripts/auto-register.mjs --tree v2 \
  --key-file <private.pem> --key-id <keyId> --scheme ed25519-canonical-json
```

Signs every unpublished pack in the namespaces `<keyId>` is permitted in `signingKeys[]`, stages `registry/v2/packs/<name>/-/<version>.{json,tgz,sig,sbom.json}` plus the schema mirror under `registry/<name>/<version>/`, and regenerates `registry/v2/index.json`, the per-pack indexes and `registry/v2/sbom.json`. The `registry-v2-sign` CI job runs this same command with the `openwop-team-1` key for first-party namespaces.

### 4. Verify and open a PR

```bash
node registry/scripts/verify-signatures.mjs --tree v2
npm run check
```

`npm run check` (`scripts/registry-check.sh`) runs the v1 gate and then the v2 gate: index drift, tarball signatures, signer consistency, namespace authority, structural conformance, SBOM drift, advisories, the vendored v2 schemas, the engines ceiling, peer-dependency identifiers, and the corpus bare-manifest schema for every source and served pack. CI runs the same checks on the PR.

On merge to `main`, the `deploy` job pushes the directory to Firebase Hosting under the `packs` target. New artifacts become live at `https://packs.openwop.dev/v2/packs/...` within a minute.

## Local development

Boot the static server (mirrors Firebase rewrites):

```bash
node registry/scripts/serve.mjs
# [registry-dev] serving /…/registry at http://127.0.0.1:4319
```

Probe:

```bash
curl http://127.0.0.1:4319/.well-known/openwop-registry
curl http://127.0.0.1:4319/v1/packs/vendor.openwop.rust-hello
curl http://127.0.0.1:4319/v1/packs/vendor.openwop.rust-hello/-/1.0.0.json
```

Hosts loading from this local server: set `OPENWOP_REGISTRY_URL=http://127.0.0.1:4319` (when host-side configuration supports it; the reference in-memory host doesn't read from registries yet — that's v1.2 work).

## Signing keys + namespace assignments

The registry advertises its keychain through the `signingKeys` array in `.well-known/openwop-registry.json`. Each entry binds a `keyId` to a permitted-namespace allow-list, so the PR review gate can reject submissions where the signing key isn't authorized for the target namespace.

| keyId | Operator | Permitted namespaces | Status |
|---|---|---|---|
| `openwop-registry-root` | openwop project | `core.openwop.*`, `community.openwop-team.*`, `vendor.openwop.*` | active (sealed; emergency only) |
| `openwop-team-1` | openwop team | `core.openwop.*`, `community.openwop-team.*`, `vendor.openwop.*` | active (online publishing key) |
| `myndhyve-internal-1` | MyndHyve | `vendor.myndhyve.*` | active (first external vendor) |

**Adding a new publisher key** (e.g., a new vendor onboarding):

1. Vendor generates an Ed25519 keypair locally (`openssl genpkey -algorithm ed25519`). Private key STAYS WITH THE VENDOR — never committed.
2. Vendor opens a PR adding their `.pub` to `registry/keys/<keyId>.pub` + a `signingKeys` entry + a `namespaceAssignments` entry in `.well-known/openwop-registry.json`.
3. Registry maintainer reviews + merges. Subsequent packs under the claimed namespace are signed by the vendor's key + verified against the registered `.pub` at publish-time review.

Per `spec/v1/registry-operations.md` §Step 1: `vendor.<org>.*` packs MUST be refused if their signing key isn't the one registered for that namespace. The CI gate enforces presence-of-signature today; cryptographic verification against the namespace-permitted key lands when the `node-pack-manifest.schema.json` registry-side schema is finalized.

## Security advisories

The registry maintains its own CVE feed at `registry/security/advisories.json` (schema: `schemas/security-advisory.schema.json`). One JSON document with an `advisories[]` array; entries land via maintainer PR; the CI gate `registry/scripts/check-advisories.mjs` cross-checks every advisory's `affected[]` rows against published versions and fails the PR if any non-yanked version matches an active advisory.

Adding an advisory:

1. Reserve a CVE ID via Mitre or your CNA if one applies.
2. Author an entry conforming to `schemas/security-advisory.schema.json`:
   - `id: OPENWOP-YYYY-NNNN` (sequential per year; assigned by maintainers at merge)
   - `severity` per the rubric in `docs/runbooks/INCIDENT-RESPONSE.md`
   - `affected[].versions` — node-semver-style range
3. Yank every matching version in the SAME PR per `docs/runbooks/PACK-LIFECYCLE.md` §Yank — `check-advisories.mjs` will fail the gate otherwise.
4. If a fix exists, publish the fixed version (bumped SemVer) in a follow-up PR and set `affected[].fixedIn` on the advisory.

Forward-looking: `.github/workflows/cve-scan.yml` runs OSV-Scanner over the registry tree weekly + on PRs. Findings surface in the GitHub Security tab as SARIF. Informational today (no pack bundles third-party deps); will tighten to merge-blocking once vendors begin bundling.

## Key ceremony

The `openwop-registry-root` key is the root of trust for everything signed by this registry. Generation:

```bash
# Generate on an air-gapped or otherwise isolated machine.
openssl genpkey -algorithm ed25519 -out openwop-registry-root.key
openssl pkey -in openwop-registry-root.key -pubout -out openwop-registry-root.pub

# Commit only the public key.
cp openwop-registry-root.pub registry/keys/

# The private key MUST be stored offline (hardware token, sealed envelope,
# operator's encrypted backup). The registry never holds the private key
# online; signing happens before commits.
```

The public key file is committed to the registry and served at `https://packs.openwop.dev/keys/openwop-registry-root.pub`. Consumers verify pack signatures against this key.

Key rotation procedure (per `spec/v1/registry-operations.md` §"Key rotation"):

1. Generate a new key (`openwop-registry-2027`, dated).
2. Commit the new public key alongside the old one.
3. Update `.well-known/openwop-registry.json` to list both keys.
4. Begin signing new submissions with the new key.
5. After the grace window declared in the registry metadata, retire the old key.

## Trust model

Consumers operating in `verified` mode MUST (v2: `spec/v2/core/packs.md` §Signing and §"Version manifests"):

1. Fetch the registry's public key for the manifest's `signing.keyId` (`endpoints.publicKey`, `/keys/{keyId}.pub`) and check the pack name against that key's `permittedNamespaces`. A key whose `status` is not `active` still verifies what it signed.
2. Verify the detached `.sig` over the in-tarball `pack.json` bytes (the JCS bytes; `ed25519-canonical-json`) before unpacking.
3. Refuse packs whose `integrity` hash doesn't match the tarball bytes.
4. Never resolve a `yanked: true` version for a range or `latest`; an exact pin MAY resolve it (it stays served).

(v1: `spec/v1/node-packs.md` §"Trust model".)

Consumers operating in `trusted` mode skip steps 1–2 but should still honor integrity + yank flags.

## Provisioning notes (operators)

To deploy this registry for the first time:

1. The Firebase Hosting site `packs-openwop-dev` must exist under project `openwop-dev`. Create via:
   ```bash
   firebase hosting:sites:create packs-openwop-dev
   firebase target:apply hosting packs packs-openwop-dev
   ```
   The second command writes the mapping declared in `.firebaserc`.

2. Custom domain `packs.openwop.dev` must be wired to the `packs-openwop-dev` site in the Firebase Console (Hosting → Add custom domain). DNS records (A/AAAA) are issued by Firebase.

3. **CI deploy auth via Workload Identity Federation (no downloadable SA keys).** The `openwop-dev` project enforces `iam.disableServiceAccountKeyCreation` — long-lived SA JSON keys can't be issued. Instead, GitHub Actions authenticates with its OIDC token through a WIF pool. One-time setup:

   ```bash
   # 1. Create the WIF pool.
   gcloud iam workload-identity-pools create github \
     --location=global --project=openwop-dev \
     --display-name="GitHub Actions"

   # 2. Create the GitHub OIDC provider. The `attribute-condition`
   #    locks the provider to repositories owned by the `openwop` org
   #    so a compromised workflow in another org can't impersonate.
   gcloud iam workload-identity-pools providers create-oidc github-actions \
     --location=global --workload-identity-pool=github \
     --project=openwop-dev \
     --issuer-uri="https://token.actions.githubusercontent.com" \
     --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
     --attribute-condition='assertion.repository_owner=="openwop"'

   # 3. Bind the deploy SA so only the openwop/openwop repo can
   #    impersonate it. principalSet membership is enforced by IAM —
   #    no chance of cross-repo escalation.
   PROJECT_NUMBER=$(gcloud projects describe openwop-dev --format='value(projectNumber)')
   gcloud iam service-accounts add-iam-policy-binding \
     github-action-1224821216@openwop-dev.iam.gserviceaccount.com \
     --project=openwop-dev \
     --role="roles/iam.workloadIdentityUser" \
     --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/attribute.repository/openwop/openwop"
   ```

   The deploy SA needs `roles/firebasehosting.admin` on `openwop-dev` (already granted). The workflow at `.github/workflows/registry-publish.yml` calls `google-github-actions/auth@v2` with the pool's `workload_identity_provider` URL — no repo secret required.

## See also

- [`spec/v2/core/packs.md`](https://github.com/openwop/openwop/blob/main/spec/v2/core/packs.md) — the v2 registry tree, signing, version-manifest lifecycle
- [`RFCS/0222-v2-registry-operations.md`](https://github.com/openwop/openwop/blob/main/RFCS/0222-v2-registry-operations.md) — v2 registry operations (yank, deprecate, key rotation, the refusals)
- [`spec/v1/node-packs.md`](https://github.com/openwop/openwop/blob/main/spec/v1/node-packs.md) — v1 pack manifest format + registry HTTP API (frozen tree)
- [`spec/v1/registry-operations.md`](https://github.com/openwop/openwop/blob/main/spec/v1/registry-operations.md) — operator-side lifecycle (submission, deprecation, yank, key rotation)
- [`RFCS/0008-wasm-abi.md`](https://github.com/openwop/openwop/blob/main/RFCS/0008-wasm-abi.md) — WASM pack ABI (the `rust-hello` pack hosted here exercises this)
- [`examples/packs/rust-hello/README.md`](https://github.com/openwop/openwop-examples/blob/main/examples/packs/rust-hello/README.md) — the reference WASM pack
- [`.github/workflows/registry-publish.yml`](../.github/workflows/registry-publish.yml) — CI gate + deploy job
