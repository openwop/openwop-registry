#!/usr/bin/env node
/**
 * Generate a new v2 pack source tree from `templates/node-pack/`.
 *
 *   node scripts/new-pack.mjs community.<group>.<pack>
 *   node scripts/new-pack.mjs --pack vendor.<org>.<pack>
 *   node scripts/new-pack.mjs --pack vendor.<org>.<pack> --out packs/
 *   node scripts/new-pack.mjs --pack vendor.<org>.<pack> --template <dir>
 *
 * Copies the template, substitutes the `{NAME}` (full pack name), `{ORG}`,
 * `{PACK}` and `{YEAR}` placeholders across every text file, and prints the
 * next-step checklist (customize, build, stage, verify, open PR).
 *
 * The template ships in this repo so a registry clone is self-sufficient; it
 * used to live at `examples/packs/vendor-template/`, which left with the
 * 2026-06 split and was v1-shaped. The template is a v2 manifest (RFC 0177):
 * `kind` present, an `engines.openwop` ceiling admitting major 2, no `signing`
 * block (the signer writes `{ keyId, scheme }`), so a scaffolded pack publishes
 * to `registry/v2`. The v1 tree is read-only.
 *
 * Reverse-DNS validation:
 *   - Pack name MUST match `(core|vendor|community|private)\.<org>\.<rest>`
 *     (`schemas/v2/node-pack-manifest.schema.json` `name`). Core packs are
 *     reserved for the openwop project; community packs are author-claimed;
 *     vendor packs require a key whose `permittedNamespaces` covers the prefix
 *     in `registry/.well-known/openwop-registry.json` `signingKeys[]`.
 *
 * Pure Node 20 stdlib — no npm install required.
 *
 * Author guide: https://github.com/openwop/openwop/blob/main/docs/PACK-AUTHOR-QUICKSTART.md
 */

import { cpSync, readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = dirname(dirname(__filename));
const DEFAULT_TEMPLATE_DIR = join(REPO_ROOT, 'templates', 'node-pack');
const DEFAULT_OUT_DIR = join(REPO_ROOT, 'packs');

const TTY = process.stdout.isTTY;
const C = TTY
  ? { red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', dim: '\x1b[2m', reset: '\x1b[0m' }
  : { red: '', green: '', yellow: '', cyan: '', dim: '', reset: '' };
const ok = (s) => console.log(`${C.green}✓${C.reset} ${s}`);
const fail = (s) => {
  console.error(`${C.red}✗${C.reset} ${s}`);
  process.exit(1);
};
const info = (s) => console.log(`${C.cyan}→${C.reset} ${s}`);
const dim = (s) => console.log(`${C.dim}${s}${C.reset}`);

// ─── arg parsing ────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { pack: null, out: DEFAULT_OUT_DIR, template: DEFAULT_TEMPLATE_DIR };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--pack') {
      args.pack = argv[++i];
    } else if (a === '--out') {
      args.out = resolve(argv[++i]);
    } else if (a === '--template') {
      args.template = resolve(argv[++i]);
    } else if (a === '--help' || a === '-h') {
      console.log('Usage: new-pack.mjs [--pack] <scope>.<org>.<pack> [--out <dir>] [--template <dir>]');
      console.log('');
      console.log('Generates a new v2 pack source tree under packs/<name>/ from');
      console.log('templates/node-pack/ (or --template <dir>), with all');
      console.log('placeholder substitutions applied.');
      process.exit(0);
    } else if (!a.startsWith('-') && args.pack === null) {
      // Positional pack name.
      args.pack = a;
    } else {
      fail(`unknown flag: ${a}`);
    }
  }
  return args;
}

// ─── name validation ────────────────────────────────────────────────

const PACK_NAME_RE = /^(core|vendor|community|private)\.([a-z][a-z0-9_-]*)(\.[a-z][a-zA-Z0-9_-]*)+$/;

function parsePackName(name) {
  const match = PACK_NAME_RE.exec(name);
  if (!match) {
    fail(
      `pack name '${name}' violates the reverse-DNS pattern.\n` +
      `Expected: <scope>.<org>.<rest> where scope is core|vendor|community|private\n` +
      `Examples: vendor.acme.salesforce  community.openwop-team.tools`,
    );
  }
  const scope = match[1];
  const org = match[2];
  // The "pack" segment is everything after the second `.` — captures
  // multi-segment names like `vendor.myndhyve.campaign-studio-ads`.
  const restStart = name.indexOf('.', name.indexOf('.') + 1) + 1;
  const pack = name.slice(restStart);

  if (scope === 'core') {
    console.warn(
      `${C.yellow}⚠${C.reset} 'core.*' is reserved for openwop-project-owned packs. ` +
      `Are you sure this isn't supposed to be vendor.<org>.* or community.<author>.*?`,
    );
  }
  if (scope === 'private') {
    console.warn(
      `${C.yellow}⚠${C.reset} 'private.*' packs MUST NOT be published to packs.openwop.dev — ` +
      `they're host-internal only. This generate still works for local dev.`,
    );
  }
  return { scope, org, pack, fullName: name };
}

// ─── copy + substitute ──────────────────────────────────────────────

function substitutePlaceholders(content, parsed) {
  return content
    .replace(/\{NAME\}/g, parsed.fullName)
    .replace(/\{ORG\}/g, parsed.org)
    .replace(/\{PACK\}/g, parsed.pack)
    .replace(/\{YEAR\}/g, String(new Date().getFullYear()));
}

function copyAndSubstitute(srcDir, destDir, parsed) {
  mkdirSync(destDir, { recursive: true });
  const entries = readdirSync(srcDir);
  for (const name of entries) {
    const srcPath = join(srcDir, name);
    const destPath = join(destDir, name);
    const stat = statSync(srcPath);
    if (stat.isDirectory()) {
      copyAndSubstitute(srcPath, destPath, parsed);
    } else {
      // Substitute in text files; copy binary as-is.
      const ext = name.split('.').pop()?.toLowerCase();
      const textExts = ['json', 'mjs', 'js', 'ts', 'md', 'yaml', 'yml'];
      if (textExts.includes(ext) || name === 'LICENSE') {
        const original = readFileSync(srcPath, 'utf8');
        const substituted = substitutePlaceholders(original, parsed);
        writeFileSync(destPath, substituted);
      } else {
        cpSync(srcPath, destPath);
      }
    }
  }
}

// ─── main ───────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.pack) {
    fail('pack name required. Usage: new-pack.mjs vendor.<org>.<pack>');
  }
  if (!existsSync(join(args.template, 'pack.json'))) {
    fail(
      `template missing: no pack.json in ${args.template}\n` +
      (args.template === DEFAULT_TEMPLATE_DIR
        ? `The template ships in this repo at templates/node-pack/. Run from a full clone of\n` +
          `openwop/openwop-registry, or pass --template <dir> pointing at a pack source tree.`
        : `--template must name a pack source tree (pack.json, index.mjs, schemas/).`),
    );
  }

  const parsed = parsePackName(args.pack);
  const destDir = join(args.out, parsed.fullName);

  if (existsSync(destDir)) {
    fail(
      `destination already exists: ${destDir}\n` +
      `Refusing to overwrite. Delete the existing dir or pick a different name.`,
    );
  }

  info(`generation ${parsed.fullName}`);
  info(`  scope:  ${parsed.scope}`);
  info(`  org:    ${parsed.org}`);
  info(`  pack:   ${parsed.pack}`);
  info(`  output: ${destDir}`);

  copyAndSubstitute(args.template, destDir, parsed);

  ok(`pack source tree created at ${destDir}`);

  // Print next steps.
  const keyId = `${parsed.org}-1`;
  const key = `~/.openwop-keys/${keyId}.private.pem`;
  console.log('');
  info('next steps (full guide: openwop docs/PACK-AUTHOR-QUICKSTART.md):');
  console.log('');
  console.log(`  1. Edit ${destDir}/pack.json — description, author, homepage, repository, keywords.`);
  console.log(`     Add peerDependencies (declaration family keys, facets in peerDependenciesMeta) for every ctx.* service you use.`);
  console.log(`  2. Replace the example node in pack.json + index.mjs + schemas/ with your real nodes`);
  console.log(`  3. Register your key: registry/keys/${keyId}.pub + a signingKeys[] entry in`);
  console.log(`     registry/.well-known/openwop-registry.json whose permittedNamespaces covers ${parsed.scope}.${parsed.org}.*`);
  console.log('');
  console.log(`  4. Check the build:`);
  console.log(`     node scripts/build-pack-tarball.mjs --pack ${parsed.fullName} \\`);
  console.log(`       --signed --key ${key} --key-id ${keyId} \\`);
  console.log(`       --tree v2 --scheme ed25519-canonical-json`);
  console.log('');
  console.log(`  5. Stage the v2 artifacts, then verify:`);
  console.log(`     node scripts/auto-register.mjs --tree v2 --key-file ${key} --key-id ${keyId} --scheme ed25519-canonical-json`);
  console.log(`     node registry/scripts/verify-signatures.mjs --tree v2`);
  console.log(`     npm run check`);
  console.log('');
  console.log(`  6. Open a PR against openwop/openwop-registry with packs/${parsed.fullName}/, the staged registry/v2/… and`);
  console.log(`     registry/${parsed.fullName}/<version>/ files, and (first time) your key + signingKeys[] entry`);
  console.log('');
}

main();
