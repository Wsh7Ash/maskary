# maskary — project spec

## Problem

People regularly need to share logs, tickets, support chats, CSV exports, or JSON
dumps with a colleague, a vendor, or an AI tool — and those texts routinely contain
emails, phone numbers, IPs, card numbers, IBANs, and tokens. Existing options are
either online uploaders (you are trusting someone else with your data), heavyweight
desktop suites, or one-off regex snippets that mangle output.

## Goal

A single, dependency-free HTML page that redacts sensitive values **locally** with
predictable, reviewable output, plus a small pure-JS engine that is unit-tested and
usable from Node.

## Requirements

Functional:

1. Detect: email, phone (international + NANP shapes), IPv4, IPv6, credit card
   (Luhn-checked, 13–19 digits), IBAN (mod-97-checked), URLs containing embedded
   credentials or secret-looking query parameters, known token prefixes
   (`sk-`, `ghp_`, `AKIA`, `xox[baprs]-`, JWT-shaped strings) plus a generic
   high-entropy fallback, and user-supplied custom terms.
2. Replace according to a per-type policy: `alias` (`EMAIL_1`), `mask_all` (`***`),
   `keep_last4` (`•••• 1111`), `keep_domain` (`j***@example.com`).
3. Stable aliasing: the same value ⇒ the same alias, within one run over one input
   (text or whole JSON document).
4. Overlap resolution: longest match wins; nested matches are dropped, never spliced
   twice.
5. Text mode and JSON mode (auto-detected; JSON walked structurally — keys and
   non-string values preserved).
6. UI: paste/drag-drop/file-load, custom-terms box, policy selectors, match counts,
   highlight and diff previews, copy, download `.txt` / `.json`.
7. Determinism: identical input+options ⇒ identical output.

Non-functional:

1. Zero network requests from the page (enforced by CSP `connect-src 'none'`).
2. Zero dependencies, zero build step: open `index.html` from `file://` and it works.
3. Pure logic separated from DOM glue so the engine runs under `node:test`.
4. Synthetic-only examples (RFC 2606 domains, 555 numbers, test cards, doc IP ranges).
5. XSS-safe rendering: preview DOM is built with `textContent`, never `innerHTML`
   with user data.

## Non-goals

- Perfect PII coverage (names, addresses, free-text identifiers) — pattern-based only.
- Rewriting JSON keys, or preserving JSON formatting/comments/key order beyond
  `JSON.parse` → redact → `JSON.stringify(…, null, 2)`.
- Streaming/redacting files larger than a few MB (the UI debounces and renders into
  the DOM; very large inputs will be slow — use the Node API for those).
- OCR, images, PDFs, archives.
- Being a security boundary — output must be reviewed by a human.

## Acceptance criteria

- `npm test` passes (53 tests as of 0.1.0).
- Opening `index.html` from `file://` boots the app in current Chrome and Firefox
  (verified by `tools/browser-smoke.mjs`, 26 assertions).
- `results/` artifacts regenerate byte-for-byte via `npm run results`.
- `npm run sync -- --check` passes (index.html inline module matches `src/`).
