# maskary — architecture

## Module graph

```
luhn.js      iban.js                 pure validators, no imports
   \           /
    aliases.js                       allocator: value -> EMAIL_1 / PHONE_2 / ...
        |
    policies.js                      policy strings + applyPolicy(type, value, alias)
        |
    detectors.js                     regex detectors -> matches {type,start,end,value}
        |
     redact.js                       text pipeline (imports all of the above)
        |
   jsonredact.js                     structural JSON walk (imports redact.js)
        |
      app.js                         DOM glue only (imports detectors/redact/jsonredact/policies)
```

`tools/sync-inline.mjs` concatenates these eight files, in the order above, into
the inline `<script type="module">` inside `index.html` (imports stripped,
`export` keywords stripped, then `node --check`-ed).

## Redaction pipeline (`redact.js`)

1. **Detect** — run every detector over the input; each returns
   `{ type, start, end, value }` ranges (some detectors scan with several
   alternation patterns and dedupe identical ranges).
2. **Resolve overlaps** — sort matches by length descending (ties: earlier start),
   greedily accept a match if it does not overlap any already-accepted match.
   This makes "URL containing a token containing an email-shaped string" collapse
   to one replacement of the longest match.
3. **Alias allocation** — one shared allocator, per-type counters, first-seen
   order: `EMAIL_1`, `EMAIL_2`, `PHONE_1`, … A value seen three times gets one
   alias used three times.
4. **Policy application** — `applyPolicy(type, value, alias)` returns the
   replacement string (`EMAIL_1`, `***`, `•••• 1111`, `j***@example.com`).
5. **Splice** — accepted matches sorted by start; pieces joined around
   replacements.

## JSON mode (`jsonredact.js`)

`JSON.parse` → recursive walk: strings go through the same detect/replace logic
with **one shared allocator for the whole document** (so `"billingEmail"` and a
nested `"contact"` string agree on `EMAIL_1`); numbers, booleans, null are
returned untouched; objects/arrays rebuilt in key order; result
`JSON.stringify(…, null, 2)`. Match offsets returned for JSON are per-source-string
(not document offsets), which is why the UI's highlight view in JSON mode shows the
redacted output instead of inline marks — the diff view (value → replacement rows)
works in both modes.

## Detector design notes

- All regexes are anchored with lookarounds to avoid digit-boundary false
  positives (`90210` is not a card, `2026` is not a phone, `1.2.3.4.5` is not IPv4).
- IPv4 octets use `25[0-5]|2[0-4][0-9]|1[0-9][0-9]|0?[0-9]{1,2}` — leading zeros
  tolerated, `999.x` rejected; IPv6 uses the standard 10-alternative compressed form
  and rejects candidates immediately followed by `.` + digit (partial IPv4-mapped
  forms are out of scope, documented).
- Cards: separator-tolerant digit run (13–19 digits) + Luhn; IBAN: contiguous and
  space-grouped forms + mod-97.
- Tokens: known prefixes beat a generic fallback; the fallback requires ≥40 chars
  from the token charset AND at least lower+upper+digit+(`_`/`+`/`/`/`=`) or a
  3-segment JWT shape. A leading `label=` (letters/digits/underscore) is excluded
  from the match so `token=SECRET` becomes `token=***`, not `***`.

## UI (`app.js` + `index.html` + `styles.css`)

- Input events debounced 150 ms → `run()` → `render()`.
- Mode auto-detect: trimmed input starting with `{`/`[` that `JSON.parse`s ⇒ JSON.
- Previews are built with `createElement`/`textContent` only (no `innerHTML` with
  user data). Highlight view = original text with `<mark>` replacements (hover
  shows original); diff view = list of `type | old → new` rows.
- Copy uses `navigator.clipboard` with an `execCommand` fallback; downloads are
  Blob URLs revoked after click.
- Strict CSP in `index.html`: `default-src 'none'; script-src 'unsafe-inline';
  style-src 'unsafe-inline'; img-src data:; connect-src 'none'` — the app is
  architecturally incapable of phoning home.

## Testing strategy

- `tests/*.test.mjs` — unit tests for validators, detectors, policies, overlap
  resolution, alias stability, JSON walking, edge cases (run with `node:test`).
- `tools/generate-results.mjs` — executes the real pipeline over `examples/` and
  writes committed artifacts to `results/` (reviewable in diffs).
- `tools/browser-smoke.mjs` — boots `index.html` from `file://` in headless Chrome
  (CDP) and Firefox (WebDriver BiDi), drives the actual DOM, asserts redaction,
  count chips, view toggles, JSON mode, and zero external resource requests.

## The `file://` inline-module trade-off

External ES-module scripts are blocked from `file://` in both Chrome and Firefox
(observed: the page never sets its boot marker). Options were: (a) require a local
server — breaks "double-click the file"; (b) ship a build step — rejected;
(c) commit the inlined module generated from `src/` — chosen. `src/` stays
canonical and tested; `index.html` is a generated view kept honest by
`npm run sync -- --check` in CI.
