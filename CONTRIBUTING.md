# Contributing

Thanks for considering a contribution.

## Ground rules

- **No real PII in examples, tests, docs, or issues.** Use RFC 2606 domains
  (`example.com`), 555-range phone numbers, standard test cards, documentation
  IP ranges (`192.0.2.0/24`, `2001:db8::/32`), and obviously-dummy tokens.
- **No dependencies.** The zero-dep, zero-build, file://-ready constraint is the
  product. Please do not add npm packages, bundlers, or frameworks.
- **No network in the app.** CSP `connect-src 'none'` is intentional; do not add
  CDNs, fonts, analytics, or "phone home" updates.

## Workflow

1. Edit files under `src/` (canonical modules). Never hand-edit the inline module
   inside `index.html`.
2. Add/adjust tests in `tests/*.test.mjs` (Node's built-in `node:test`).
3. Run:
   ```bash
   npm test
   npm run sync          # regenerate index.html inline module
   npm run results       # regenerate results/ if detector behavior changed
   npm run smoke         # if UI code changed (needs local Chrome/Firefox)
   ```
4. Keep detector changes conservative: prefer fewer matches over false positives.
   Every new regex needs at least one test proving it does **not** match common
   non-sensitive numbers (`2026`, `90210`, `1.2.3.4.5`).

## Project layout

See [README.md](README.md#layout). Pure logic belongs in `src/` modules that run
under Node; DOM code belongs in `src/app.js`.
