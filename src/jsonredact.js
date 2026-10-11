// Pure structural JSON redaction: parse -> walk strings -> redact -> rebuild.
// Keys, arrays, numbers, booleans and null keep their shape; only string
// VALUES are redacted. One shared alias allocator spans the whole document,
// so the same value in two different fields gets the same alias.
// No DOM, no I/O.

import { redact } from './redact.js';
import { createAliasAllocator } from './aliases.js';

function mergeCounts(target, src) {
  for (const [k, v] of Object.entries(src)) {
    target[k] = (target[k] ?? 0) + v;
  }
}

// Redact any parsed-JSON value. Returns { value, counts, matches }.
export function redactJsonValue(value, options = {}) {
  const allocator = options.aliases ?? createAliasAllocator();
  const counts = {};
  const matches = [];
  const opts = { ...options, aliases: allocator };

  const walk = (node) => {
    if (typeof node === 'string') {
      const r = redact(node, opts);
      mergeCounts(counts, r.counts);
      matches.push(...r.matches);
      return r.text;
    }
    if (Array.isArray(node)) {
      return node.map(walk);
    }
    if (node !== null && typeof node === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(node)) out[k] = walk(v);
      return out;
    }
    return node;
  };

  return { value: walk(value), counts, matches };
}

// Parse a JSON text, redact it, and return pretty-printed output text.
// Throws the normal JSON.parse error when the input is not valid JSON.
export function redactJsonText(text, options = {}) {
  const parsed = JSON.parse(text);
  const { value, counts, matches } = redactJsonValue(parsed, options);
  return { text: JSON.stringify(value, null, 2), value, counts, matches };
}
