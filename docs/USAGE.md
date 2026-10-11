# maskary — usage

## In the browser

1. Open `index.html` (double-click, or `file:///…/index.html`). No server needed.
2. Provide input:
   - **Load sample** — built-in synthetic demo.
   - **Load file…** or drag-and-drop onto the input box (`.txt`, `.csv`, `.json`, `.log`).
   - Paste directly.
3. **Custom terms** (optional): comma- or newline-separated words/phrases to mask
   wherever they appear (case-insensitive whole-word matching, e.g. `Project Bluebird`
   will not match `Bluebirds`).
4. **Policies**: each detector type has its own selector —
   - `alias` — replace with a stable handle: `EMAIL_1`, `PHONE_2`, …
   - `mask_all` — `***`
   - `keep_last4` — last 4 characters, non-digits stripped: `•••• 1111` (for emails
     this keeps the last 4 characters of the address, usually not what you want —
     use `keep_domain` for emails)
   - `keep_domain` — `j***@example.com` (email-shaped values only; falls back to
     `***` when the value has no `@`)
5. Watch the **counts** chips and the **Highlight**/**Diff** preview.
6. **Copy redacted** or **Download .txt** / **Download .json** (the JSON button is
   enabled only when the input was detected as JSON).

### Mode detection

Input whose trimmed text starts with `{` or `[` and parses as JSON runs in **JSON
mode**; everything else is **text mode** (CSV included — commas are not special,
the whole file is one text blob).

### JSON mode semantics

- String **values** are redacted; object **keys** are never modified.
- Numbers, booleans, `null` pass through untouched (`2026` stays `2026`).
- One alias allocator for the entire document: `"billing": "jane@example.com"` and
  `"contact": "jane@example.com"` both become `EMAIL_1`.
- Output is re-formatted (`JSON.stringify` with 2-space indent). Whitespace and key
  order are otherwise preserved as `JSON.parse`/`stringify` defines them.
- **Limitation:** if a *key* itself contains sensitive text (`"jane@example.com":
  true`), it is not redacted — keys are data here, not values.

### Known limitations (text mode)

- Regex-based: names, street addresses, national IDs, and unusual formats will be
  missed. Free-form secrets (a random 30-char lowercase password with no prefix)
  may also be missed by the generic token fallback, by design (too many false positives).
- Phone detection requires a `+`/parentheses/dashes/dots/spaces shape — bare digit
  runs (`5551234567`) are not matched, on purpose (order numbers etc.).
- IPv4-mapped IPv6 forms like `::ffff:192.0.2.1` are not matched (documented).
- A leading `label=` is excluded from token matches (`token=SECRET` → `token=***`),
  but other label shapes (`auth SECRET=…`) keep the label inside the match.
- Output is best-effort: **always review the diff view before sharing.**

## From Node (library use)

The `src/` modules are plain ESM with no dependencies:

```js
import { redact } from './src/redact.js';
import { redactJsonText } from './src/jsonredact.js';

const r = redact('Contact jane@example.com or jane@example.com', {
  policies: { email: 'mask_all' },   // optional overrides (defaults are per-type)
  customTerms: ['Bluebird'],          // optional
});
console.log(r.text);    // 'Contact *** or ***'
console.log(r.counts);  // { email: 2, ... }
console.log(r.matches); // [{ type, start, end, value, alias, policy, replacement }, ...]

const j = redactJsonText('{"email":"jane@example.com","year":2026}');
console.log(j.text);    // pretty JSON with "EMAIL_1", year untouched
```

Requires Node ≥ 18 (only `node:test` for the test suite; the engine itself uses
basic language features).

## Regenerating repo artifacts

```bash
npm run results   # examples/* -> results/sample-redacted.txt|.json + detector-report.txt
npm run sync      # src/*.js -> inline module in index.html
npm run smoke     # headless Chrome + Firefox UI smoke test (26 assertions)
```

All three are pure local execution: no network, no dependencies.
