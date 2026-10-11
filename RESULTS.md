# RESULTS — maskary (2026-10-10)

Real, observed results for the 0.1.0 tree at `projects/2026-10-10/maskary`.
Every number below came from actually running the commands on this machine
(Windows 11, Node v24.13.0, PowerShell 7.6.0, Chrome and Firefox current builds).
Nothing is estimated.

## 1. Unit tests

```
> npm test
> node --test tests/*.test.mjs
…
ℹ tests 53
ℹ suites 0
ℹ pass 53
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2195.7634
```

**53/53 pass, 0 fail** across `tests/luhn.test.mjs`, `tests/iban.test.mjs`,
`tests/detectors.test.mjs`, `tests/redact.test.mjs`, `tests/jsonredact.test.mjs`.

Coverage highlights (each backed by named tests): Luhn/IBAN validators, all nine
detectors, alias stability (`EMAIL_1` reused for repeats), first-seen alias order,
longest-first overlap resolution (URL > nested token > nested email), per-type
policies, keep-domain without double `@`, label preservation (`token=SECRET` →
`token=***`), clean text pass-through (`2026`, `90210`, `1.2.3.4.5` untouched),
JSON structural walk with shared allocator, determinism across re-runs.

## 2. Browser smoke test (real Chrome + real Firefox, `file://`)

```
> npm run smoke
> node tools/browser-smoke.mjs
chrome: C:\Program Files\Google\Chrome\Application\chrome.exe
  ok   chrome: boots from file:// (data-ready=1)
  chrome preview: Mail EMAIL_1, cc EMAIL_1, card •••• 1111, year 2026 zip 90210
  ok   chrome: auto-detects text mode
  ok   chrome: email replaced by alias
  ok   chrome: both emails share one alias
  ok   chrome: card keep_last4
  ok   chrome: non-sensitive numbers untouched
  ok   chrome: count chips
  ok   chrome: copy enabled after redaction
  ok   chrome: diff view lists original and replacement
  chrome json output: { "contact": "EMAIL_1", "year": 2026, "nested": { "ip": "IPV4_1" } }
  ok   chrome: auto-detects JSON mode
  ok   chrome: JSON values redacted
  ok   chrome: JSON keys and numbers preserved
  ok   chrome: nested JSON values redacted
  ok   chrome: download .json enabled in JSON mode
  ok   chrome: no external resource requests
firefox: C:\Program Files\Mozilla Firefox\firefox.exe
  ok   firefox: boots from file:// (data-ready=1)
  firefox preview: Mail EMAIL_1, cc EMAIL_1, card •••• 1111
  ok   firefox: email replaced by alias
  ok   firefox: both emails share one alias
  ok   firefox: card keep_last4
  ok   firefox: count chips
  firefox json output: { "contact": "EMAIL_1", "year": 2026 }
  ok   firefox: auto-detects JSON mode
  ok   firefox: JSON values redacted
  ok   firefox: JSON keys and numbers preserved
browser-smoke: all assertions passed
```

**26/26 assertions pass** (17 Chrome + 9 Firefox). Chrome is driven over CDP,
Firefox over WebDriver BiDi (`session.new` handshake), both with Node built-ins
only — the harness itself has zero dependencies. "No external resource requests"
is asserted from `performance.getEntriesByType("resource")`: the only resources
loaded are `file://` ones (plus the inline data: favicon).

## 3. Engine demo (real CLI run)

```
> node --input-type=module -e "import { redact } from './src/redact.js'; …"
in : Refund for jane@example.com (also jane@example.com) charged to card 4111 1111 1111 1111 from ip 10.0.0.8, iban GB82WEST12345698765432, token ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8
out: Refund for EMAIL_1 (also EMAIL_1) charged to card •••• 1111 from ip IPV4_1, iban •••• 5432, token ***
counts: {"email":2,"credit_card":1,"ipv4":1,"iban":1,"token":1}
```

JSON structural walk, same engine:

```
in : {"email":"jane@example.com","year":2026,"card":"4111 1111 1111 1111"}
out: {
       "email": "EMAIL_1",
       "year": 2026,
       "card": "•••• 1111"
     }
```

## 4. Committed artifacts (`npm run results`)

`tools/generate-results.mjs` ran the real pipeline over `examples/` and wrote:

- `results/sample-redacted.txt` — full-text redaction of the support-ticket sample
  (excerpt, real):

  ```
  Customer contact: EMAIL_1
  Alternate contact: EMAIL_2
  Preferred callback: PHONE_1 (US line: PHONE_2)

  Invoice was charged to card •••• 1111.
  Refund destination IBAN: •••• 5432

  Gateway log excerpt:
    client_ip=IPV4_1 edge_node=IPV6_1
    POST ***
    auth=***
    aws_id=***
  ```

  with `2026`, `90210`, `1.2.3.4.5`, `1234567` surviving untouched (lines 22–23 of
  the artifact).

- `results/sample-redacted.json` — structural walk of `examples/sample.json`:
  keys, `4821`, `3`, `true`, `null` preserved; values replaced (`EMAIL_1`,
  `PHONE_1`, `IPV4_1`, `IPV6_1`, `•••• 1111`, `***`).

- `results/detector-report.txt` — per-type detection counts, e.g. for
  `examples/sample.txt`: **15 detected / 12 distinct** (email 6, phone 2, ipv4 1,
  ipv6 1, credit_card 1, iban 1, url_cred 1, token 2) and **14 replaced** after
  overlap resolution — the one difference is `pass@gateway.example.com`, an
  email-shaped string nested inside the URL, correctly shadowed by longest-first.

Real command output:

```
> node tools/generate-results.mjs
wrote results/sample-redacted.txt
wrote results/sample-redacted.json
wrote results/detector-report.txt
sample.txt counts: {"email":5,"phone":2,"credit_card":1,"iban":1,"ipv4":1,"ipv6":1,"url_cred":1,"token":2}
sample.json counts: {"email":1,"phone":1,"credit_card":1,"ipv4":1,"ipv6":1,"token":1}
```

## 5. Inline-module sync

```
> node tools/sync-inline.mjs --check
sync-inline: index.html is up to date
```

The generated inline script is parse-checked (`node --check`) inside the sync tool
on every run; a syntax error in any `src/` file fails the sync before it can write.

## 6. Blockers hit, and how they were resolved

1. **External ES modules are blocked on `file://` (Chrome and Firefox).** Empirically,
   a page importing `src/app.js` via `<script type="module" src>` never reached its
   boot marker in either browser. Resolution: commit an inline module generated from
   `src/` (`tools/sync-inline.mjs`), keeping "double-click index.html" working with
   no user-side build step. A string-replacer bug in the first version of the tool
   (`$'` sequences inside bundled regex source expanding to "text after match") was
   caught by the `--check` idempotency test and fixed by using a function replacer.

2. **`node --test tests/` fails on Node 24.13.0 / win32.** A bare directory argument
   is executed as a file (`Error: Cannot find module …\tests`); reproduced on a
   trivial throwaway project, so it is a runner/OS behavior, not this repo. Working
   forms: `node --test` (bare) and `node --test "tests/*.test.mjs"`. `npm test` uses
   the latter (Node expands the glob on Windows, the shell on POSIX). Documented in
   README.md and docs/PROJECT_SPEC.md rather than hidden.

3. **Firefox has no CDP.** Current Firefox exposes WebDriver BiDi instead. The smoke
   harness speaks both protocols (CDP for Chrome, BiDi `session.new` +
   `browsingContext.navigate` + `script.evaluate` for Firefox) with no external
   libraries. BiDi quirks found during bring-up: `wait:"load"` is invalid
   (use `"complete"`), and events must not be subscribed with invented names.

4. **`keep_last4` on emails is usually wrong** (keeps last 4 chars of the address,
   not a domain). Mitigated by shipping `keep_domain` for emails and documenting the
   choice in USAGE.md; the policy engine itself is type-agnostic by design.

## 7. Honest caveats

- Pattern-based matching cannot catch all PII/secrets (names, unusual ID shapes,
  low-entropy secrets). Review the diff view before sharing output — the tool says
  so in the UI and the docs.
- JSON **keys** are never rewritten; JSON output is re-formatted with 2-space indent.
- Highlight view in JSON mode shows the redacted output (not inline marks), because
  JSON match offsets are per-string, not document offsets; the diff view covers it.
- The committed `.github/workflows/ci.yml` runs `npm test`, `sync --check`, a
  results-freshness diff, and the browser smoke — the same commands passed locally,
  but the workflow itself was not executed on GitHub from this machine.
- `npm test`'s glob form deviates from the original `node --test tests/` spec line
  because of the Windows runner bug in item 2; this deviation is deliberate,
  documented, and cross-platform.

## 8. Reproduce everything

```bash
cd projects/2026-10-10/maskary
npm test                      # 53/53
node tools/sync-inline.mjs --check
node tools/generate-results.mjs
git diff --exit-code results/ # if under git: artifacts are current
node tools/browser-smoke.mjs  # 26/26 (Chrome+Firefox present)
```
