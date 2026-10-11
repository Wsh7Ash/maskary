# maskary

**Local, offline redaction workbench.** Paste text, CSV, or JSON; pick a policy per
data type; copy clean output. Everything runs in your browser tab — **zero network
requests, nothing is uploaded, no dependencies, no build step.**

```
in : Refund for jane@example.com (also jane@example.com) charged to card 4111 1111 1111 1111 from ip 10.0.0.8, iban GB82WEST12345698765432, token ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8
out: Refund for EMAIL_1 (also EMAIL_1) charged to card •••• 1111 from ip IPV4_1, iban •••• 5432, token ***
counts: {"email":2,"credit_card":1,"ipv4":1,"iban":1,"token":1}
```

*(That is the real output of `src/redact.js` — see [RESULTS.md](RESULTS.md) for how it was produced.)*

## Quick start

1. Open **`index.html`** in Chrome or Firefox (double-click it — `file://` works).
2. Click **Load sample**, or paste/drop your own text.
3. Adjust policies (alias / mask / keep-last4 / keep-domain), add custom terms if needed.
4. Review the **Highlight** or **Diff** preview, then **Copy redacted** or download.

That's it. There is nothing to install and no server to run. If you *prefer* a server:

```bash
python -m http.server 8000   # or: npx serve
# then open http://localhost:8000/
```

## What it redacts (defaults)

| Type | Default policy | Example |
|---|---|---|
| email | alias | `jane@example.com` → `EMAIL_1` |
| phone | alias | `+44 20 7123 4567` → `PHONE_1` |
| ipv4 | alias | `192.168.10.42` → `IPV4_1` |
| ipv6 | alias | `2001:db8::1` → `IPV6_1` |
| credit card | keep last 4 | `4111 1111 1111 1111` → `•••• 1111` |
| iban | keep last 4 | `GB82 WEST … 5432` → `•••• 5432` |
| url with secrets | mask all | `https://user:pass@…` → `***` |
| token | mask all | `ghp_…`, `sk-…`, `AKIA…`, JWTs, generic high-entropy → `***` |
| custom terms | mask all | your list, case-insensitive whole-word |

Guarantees the engine keeps (unit-tested):

- **Consistent aliasing** — the same value always maps to the same alias (`EMAIL_1`), across the whole input (and the whole JSON document).
- **Non-sensitive numbers survive** — `2026`, `90210`, `1234567`, `1.2.3.4.5` are not touched.
- **Overlap-safe** — a URL containing credentials *and* a token is replaced once, longest match wins, no mangled output.
- **Deterministic** — same input + same options ⇒ byte-identical output, every run.

JSON input is walked **structurally**: string values are redacted, keys and
numbers/booleans/null are preserved, and the output is re-formatted with 2-space
indent. (Keys are never rewritten — a limitation, documented in [docs/USAGE.md](docs/USAGE.md).)

## Why does index.html contain the whole app inline?

Chrome and Firefox refuse to load external `<script type="module" src="…">` from
`file://` URLs — the page simply never boots (we verified this empirically; that is
why a naive `src/`-import version silently showed an empty app). To keep the
"just open the file" promise with zero build step for users, `index.html` ships
with the modules inlined. **`src/` is the canonical source**; after editing it, run:

```bash
npm run sync      # node tools/sync-inline.mjs — regenerates the inline module
npm run sync -- --check   # verify index.html is in sync (used by CI)
```

The generated inline script is syntax-checked with `node --check` on every sync.

## Development

```bash
npm test          # node --test tests/*.test.mjs — 53 unit tests, no dependencies
npm run results   # regenerate results/ artifacts from examples/ (real pipeline run)
npm run sync      # rebuild the inline module in index.html
npm run smoke     # headless Chrome + Firefox: boots index.html from file:// and drives the real UI (26 assertions)
```

> **Note on `npm test`:** the spec originally called for `node --test tests/`, but
> Node 24.13.0 on Windows treats a bare directory argument as a file to execute
> (`Error: Cannot find module …\tests` — reproduced on a trivial project). Passing
> the glob `tests/*.test.mjs` works on Windows (Node expands it) and on POSIX
> shells (the shell expands it), so that is what `npm test` uses.

## Layout

```
index.html            the app (inline module between INLINE-MODULE markers)
styles.css            plain CSS, no build step
src/                  canonical ES modules (pure logic + DOM glue)
  detectors.js        regex detectors for all 9 types
  redact.js           pipeline: detect → resolve overlaps → alias → policy → splice
  jsonredact.js       structural JSON walk (shared alias allocator)
  policies.js         alias / mask_all / keep_last4 / keep_domain
  aliases.js          EMAIL_1-style allocator (stable, first-seen order)
  luhn.js  iban.js    validators (cards, IBANs)
  app.js              DOM glue only
tests/                node:test suites (53 tests)
docs/                 spec, architecture, usage
examples/             synthetic inputs (RFC 2606 domains, 555 numbers)
results/              committed artifacts produced by tools/generate-results.mjs
tools/                sync-inline, generate-results, browser-smoke
```

## Security & privacy model

- The page sets a strict CSP (`connect-src 'none'`) — the app *cannot* make network calls.
- No cookies, no storage, no telemetry, no third-party assets (fonts/icons are system/local).
- Redaction is best-effort pattern matching: **review output before sharing.**
  It is a privacy tool, not a security boundary. See [docs/USAGE.md](docs/USAGE.md)
  for known limitations and [SECURITY.md](SECURITY.md) for the threat model.

All example data in this repository is synthetic: RFC 2606 example domains
(`example.com` etc.), 555-range phone numbers, standard test cards, documentation
IPv4/IPv6 ranges (`192.0.2.0/24`, `2001:db8::/32`), and dummy tokens.

## License

[MIT](LICENSE)
