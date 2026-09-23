/**
 * RFC 0212 — canonical JSON is RFC 8785 (JCS), and the input MUST be I-JSON.
 *
 * `ed25519-canonical-json` signs these bytes (packs.md §Signing). A signer MUST
 * refuse, not coerce, a value with duplicate member names, a lone surrogate, a
 * non-finite number, an integer literal whose magnitude exceeds 2^53 − 1, or a
 * non-JSON value (spec/v2/core/conformance.md §"Canonical JSON").
 *
 * This is a dependency-free port of the conformance suite's
 * `conformance/src/lib/jcs.ts`; `conformance/vectors/jcs-v1.json` in the corpus
 * is the normative test of both. Two entry points, because two refusals are
 * invisible after a parse: `parseIJson(text)` refuses duplicate names and
 * out-of-range integer literals (which `JSON.parse` silently resolves — last
 * duplicate wins, 9007199254740993 becomes …992), and `canonicalJson(value)`
 * refuses non-finite numbers, non-JSON values and lone surrogates.
 */

export class JcsRefusal extends Error {
  constructor(kind, message) {
    super(`RFC 0212 §B refusal (${kind}): ${message}`);
    this.name = 'JcsRefusal';
    this.kind = kind;
  }
}

const NUMBER = /-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/y;
const MAX_EXACT_BIG = 2n ** 53n - 1n;

/** RFC 8785 §3.2.3 — UTF-16 code-unit order; never locale collation. */
export function codeUnitCompare(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const d = a.charCodeAt(i) - b.charCodeAt(i);
    if (d !== 0) return d;
  }
  return a.length - b.length;
}

function assertWellFormed(s, where) {
  for (let i = 0; i < s.length; i += 1) {
    const u = s.charCodeAt(i);
    if (u >= 0xd800 && u <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) { i += 1; continue; }
      throw new JcsRefusal('lone-surrogate', `lone high surrogate U+${u.toString(16).toUpperCase()} in ${where}`);
    }
    if (u >= 0xdc00 && u <= 0xdfff) throw new JcsRefusal('lone-surrogate', `lone low surrogate U+${u.toString(16).toUpperCase()} in ${where}`);
  }
}

/** RFC 8785 serialization of an I-JSON value; throws `JcsRefusal` instead of coercing. */
export function canonicalJson(value) {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean': return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) throw new JcsRefusal('non-finite', `${String(value)} is not a JSON number`);
      return Object.is(value, -0) ? '0' : String(value);
    case 'string': assertWellFormed(value, 'a string'); return JSON.stringify(value);
    case 'object': break;
    default: throw new JcsRefusal('not-json', `a ${typeof value} is not a JSON value`);
  }
  if (Array.isArray(value)) {
    const parts = [];
    for (let i = 0; i < value.length; i += 1) {
      if (!(i in value)) throw new JcsRefusal('not-json', 'a sparse array hole is not a JSON value');
      parts.push(canonicalJson(value[i]));
    }
    return `[${parts.join(',')}]`;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) throw new JcsRefusal('not-json', `a ${value.constructor?.name ?? 'non-plain'} object is not a JSON value`);
  const keys = Object.keys(value).sort(codeUnitCompare);
  return `{${keys.map((k) => { assertWellFormed(k, 'a member name'); return `${JSON.stringify(k)}:${canonicalJson(value[k])}`; }).join(',')}}`;
}

/** Parse JSON text, refusing what `JSON.parse` silently accepts or changes. */
export function parseIJson(text) {
  let i = 0;
  const fail = (m) => { throw new JcsRefusal('not-json', `${m} at offset ${i}`); };
  const ws = () => { while (i < text.length && (text[i] === ' ' || text[i] === '\t' || text[i] === '\n' || text[i] === '\r')) i += 1; };
  const ESC = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
  const str = () => {
    if (text[i] !== '"') fail('expected a string');
    i += 1;
    let out = '';
    for (;;) {
      if (i >= text.length) fail('unterminated string');
      const c = text[i]; i += 1;
      if (c === '"') break;
      if (c === '\\') {
        const e = text[i]; i += 1;
        if (e in ESC) out += ESC[e];
        else if (e === 'u') {
          const h = text.slice(i, i + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(h)) fail('bad \\u escape');
          out += String.fromCharCode(parseInt(h, 16)); i += 4;
        } else fail('bad escape');
      } else {
        if (c.charCodeAt(0) < 0x20) fail('raw control character in a string');
        out += c;
      }
    }
    assertWellFormed(out, 'a string');
    return out;
  };
  const num = () => {
    NUMBER.lastIndex = i;
    const m = NUMBER.exec(text);
    if (m === null) fail('bad number');
    i += m[0].length;
    if (m[2] === undefined && m[3] === undefined) {
      const b = BigInt(m[0]);
      if (b > MAX_EXACT_BIG || b < -MAX_EXACT_BIG) throw new JcsRefusal('integer-out-of-range', `integer literal ${m[0]} is outside ±(2^53 − 1)`);
    }
    const v = Number(m[0]);
    if (!Number.isFinite(v)) throw new JcsRefusal('non-finite', `${m[0]} overflows to a non-finite number`);
    return v;
  };
  const val = () => {
    ws();
    const c = text[i];
    if (c === '{') {
      i += 1; const obj = {}; ws();
      if (text[i] === '}') { i += 1; return obj; }
      for (;;) {
        ws(); const k = str();
        if (Object.prototype.hasOwnProperty.call(obj, k)) throw new JcsRefusal('duplicate-name', `duplicate member name ${JSON.stringify(k)}`);
        ws(); if (text[i] !== ':') fail('expected :'); i += 1;
        Object.defineProperty(obj, k, { value: val(), enumerable: true, writable: true, configurable: true });
        ws(); const d = text[i]; i += 1;
        if (d === '}') return obj;
        if (d !== ',') fail('expected , or }');
      }
    }
    if (c === '[') {
      i += 1; const arr = []; ws();
      if (text[i] === ']') { i += 1; return arr; }
      for (;;) { arr.push(val()); ws(); const d = text[i]; i += 1; if (d === ']') return arr; if (d !== ',') fail('expected , or ]'); }
    }
    if (c === '"') return str();
    if (text.startsWith('true', i)) { i += 4; return true; }
    if (text.startsWith('false', i)) { i += 5; return false; }
    if (text.startsWith('null', i)) { i += 4; return null; }
    if (c === '-' || (c !== undefined && c >= '0' && c <= '9')) return num();
    return fail('unexpected token');
  };
  const v = val(); ws();
  if (i !== text.length) fail('trailing data');
  return v;
}
