/**
 * RFC 0212 — the pack signer's canonicalizer is RFC 8785 JCS over I-JSON.
 *
 * Three things are pinned: the refusals (a signer MUST refuse, never coerce),
 * two RFC 8785 examples the old sorted-keys helper also passed, and the census
 * the RFC's compatibility claim rests on — every committed `pack.json`
 * canonicalizes to the same bytes under the retired helper and under JCS, so no
 * published signature moves. The census is what makes swapping the helper safe
 * rather than merely correct.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, parseIJson, JcsRefusal } from './lib/jcs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The helper build-pack-tarball.mjs used before RFC 0212. */
function retired(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(retired).join(',') + ']';
  return '{' + Object.keys(value).sort().map((k) => JSON.stringify(k) + ':' + retired(value[k])).join(',') + '}';
}

const refuses = (fn, kind) => assert.throws(fn, (e) => e instanceof JcsRefusal && e.kind === kind);

test('refuses what JSON.parse would silently resolve', () => {
  refuses(() => parseIJson('{"a":1,"a":2}'), 'duplicate-name');
  refuses(() => parseIJson('{"n":9007199254740993}'), 'integer-out-of-range');
  refuses(() => parseIJson('{"n":-9007199254740992}'), 'integer-out-of-range');
  refuses(() => parseIJson('{"s":"\\ud800"}'), 'lone-surrogate');
  refuses(() => parseIJson('{"n":1e400}'), 'non-finite');
  refuses(() => parseIJson('{"n":NaN}'), 'not-json');
});

test('refuses what the retired helper coerced', () => {
  refuses(() => canonicalJson({ n: Number.NaN }), 'non-finite');
  refuses(() => canonicalJson({ a: undefined }), 'not-json');
  refuses(() => canonicalJson({ at: new Date(0) }), 'not-json');
});

test('RFC 8785 examples: integer-like keys and code-unit member order', () => {
  assert.equal(canonicalJson(parseIJson('{"9":"nine","10":"ten","a":0}')), '{"10":"ten","9":"nine","a":0}');
  const doc = '{"€":"Euro Sign","\\r":"Carriage Return","\\ufb33":"Hebrew Letter Dalet With Dagesh","1":"One","😀":"Emoji: Grinning Face","\\u0080":"Control","ö":"Latin Small Letter O With Diaeresis"}';
  assert.equal(canonicalJson(parseIJson(doc)), '{"\\r":"Carriage Return","1":"One","\u0080":"Control","ö":"Latin Small Letter O With Diaeresis","€":"Euro Sign","😀":"Emoji: Grinning Face","\ufb33":"Hebrew Letter Dalet With Dagesh"}');
  // 2^53 + 2 is an exact double; JCS serializes it (RFC 8785 Appendix B).
  assert.equal(canonicalJson(9007199254740994), '9007199254740994');
});

test('census: every committed pack.json has the same bytes under JCS as under the retired helper', () => {
  const packs = join(ROOT, 'packs');
  const dirs = readdirSync(packs).filter((d) => existsSync(join(packs, d, 'pack.json')));
  assert.ok(dirs.length > 100, `expected the committed pack set, found ${dirs.length}`);
  for (const d of dirs) {
    const text = readFileSync(join(packs, d, 'pack.json'), 'utf8');
    const value = parseIJson(text);
    assert.equal(canonicalJson(value), retired(JSON.parse(text)), `${d}/pack.json canonicalizes differently under JCS`);
  }
});
