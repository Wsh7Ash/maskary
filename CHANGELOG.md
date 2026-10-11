# Changelog

## 0.1.0 — 2026-10-10

Initial release.

- Nine detectors: email, phone, IPv4, IPv6, credit card (Luhn), IBAN (mod-97),
  URL-with-secrets, token (known prefixes + generic high-entropy), custom terms.
- Four policies: alias, mask_all, keep_last4, keep_domain — per type, with
  sensible defaults.
- Stable per-run aliasing, longest-first overlap resolution, deterministic output.
- Text mode + structural JSON mode with a shared alias allocator.
- Browser UI (file://-ready, zero network, CSP-enforced) with highlight/diff
  previews, copy, and downloads.
- 53 unit tests (`node:test`), committed results artifacts, Chrome+Firefox
  headless smoke test (26 assertions).
