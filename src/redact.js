// Pure redaction orchestrator: detect -> resolve overlaps (longest first) ->
// allocate stable aliases in document order -> apply policies -> splice.
// No DOM, no I/O.

import { detect } from './detectors.js';
import { createAliasAllocator } from './aliases.js';
import { applyPolicy, DEFAULT_POLICIES } from './policies.js';

function overlaps(a, b) {
  return a.start < b.end && b.start < a.end;
}

// Greedy longest-first selection: matches sorted by length (ties: earlier
// start first), each accepted only if it does not overlap an already accepted
// match. `accepted` stays sorted by start, so the check only looks at the
// two neighbours — any overlapping match must be one of them.
function selectNonOverlapping(matches) {
  const byLength = [...matches].sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);
  const accepted = [];
  for (const m of byLength) {
    let i = 0;
    while (i < accepted.length && accepted[i].start < m.start) i++;
    if (i > 0 && overlaps(accepted[i - 1], m)) continue;
    if (i < accepted.length && overlaps(accepted[i], m)) continue;
    accepted.splice(i, 0, m);
  }
  return accepted;
}

// Redact a plain text string.
//
// options:
//   policies    { type: 'alias'|'mask_all'|'keep_last4'|'keep_domain' }
//   customTerms [string, ...]
//   aliases     pre-existing allocator (used by jsonredact so aliases stay
//               consistent across every string in one document)
//
// returns {
//   text,                 // redacted output
//   matches,              // [{start, end, value, type, alias, policy, replacement}]
//   counts,               // { type: number of replaced occurrences }
//   aliases,              // the allocator used (entries() gives the mapping)
// }
export function redact(text, options = {}) {
  const src = String(text ?? '');
  const policies = { ...DEFAULT_POLICIES, ...(options.policies ?? {}) };
  const allocator = options.aliases ?? createAliasAllocator();

  const detected = detect(src, { customTerms: options.customTerms });
  const accepted = selectNonOverlapping(detected);

  let out = '';
  let cursor = 0;
  const matches = [];
  const counts = {};
  for (const m of accepted) {
    const alias = allocator.aliasFor(m.type, m.value);
    const policy = policies[m.type] ?? 'mask_all';
    const replacement = applyPolicy(policy, m.type, m.value, alias);
    out += src.slice(cursor, m.start) + replacement;
    matches.push({ ...m, alias, policy, replacement });
    counts[m.type] = (counts[m.type] ?? 0) + 1;
    cursor = m.end;
  }
  out += src.slice(cursor);

  return { text: out, matches, counts, aliases: allocator };
}
