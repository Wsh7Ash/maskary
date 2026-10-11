# Security

## Threat model

maskary is a **privacy tool**, not a security boundary. It assumes:

- The user's machine and browser are not compromised (if they are, anything in the
  tab is visible to the attacker regardless of this tool).
- The user reviews redacted output before sharing it.

## Properties the app enforces

- **No network.** The page ships a strict CSP
  (`default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';
  img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'`).
  The redaction engine cannot exfiltrate input even if a future bug tried to.
- **No persistence.** Nothing is written to cookies, localStorage, IndexedDB, or
  service workers. Closing the tab discards the input.
- **No third-party assets.** No CDNs, web fonts, or remote icons.
- **XSS-safe rendering.** Preview DOM nodes are created with `textContent`; user
  input is never injected as HTML. (The tool's job is to handle hostile text.)
- **Synthetic-only repository data.** Examples/tests use RFC 2606 domains, 555
  numbers, test cards, and documentation IP ranges.

## Out of scope / known limitations

- Pattern-based redaction cannot guarantee removal of all PII or secrets
  (names, unusual ID formats, low-entropy secrets). See docs/USAGE.md.
- The `keep_last4` / `keep_domain` policies intentionally leave fragments visible.
- Copying to the clipboard places the redacted text in the OS clipboard, where
  other applications may read it (standard clipboard behavior).

## Reporting a vulnerability

Please open a GitHub security advisory (preferred) or a private issue marked
"security". Include: affected version/commit, reproduction steps with **synthetic**
data only, and the impact you observed. You can expect an acknowledgment within a
week. There is no bounty program at this time.
