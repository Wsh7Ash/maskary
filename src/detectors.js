// Pure detector engine: regexes + validators -> typed match ranges.
// No DOM, no I/O, no state. Every detector returns
//   [{ start, end, value }]
// and `detect()` adds the `type` field: email | phone | ipv4 | ipv6 |
// credit_card | iban | url_cred | token | custom.
//
// Detection is regex-based and deliberately conservative: a value is only
// reported when the surrounding shape and, where applicable, a checksum
// (Luhn / IBAN mod-97) confirm it.

import { isValidLuhn, normalizeDigits } from './luhn.js';
import { isValidIban } from './iban.js';

export const DETECTOR_TYPES = ['email', 'phone', 'ipv4', 'ipv6', 'credit_card', 'iban', 'url_cred', 'token', 'custom'];

// --- helpers ----------------------------------------------------------------

function scan(text, regex) {
  const out = [];
  for (const m of text.matchAll(regex)) {
    out.push({ start: m.index, end: m.index + m[0].length, value: m[0] });
  }
  return out;
}

function escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function digitCount(s) {
  let n = 0;
  for (const ch of s) if (ch >= '0' && ch <= '9') n++;
  return n;
}

function dedupeRanges(list) {
  const seen = new Set();
  const out = [];
  for (const m of list) {
    const key = `${m.start}:${m.end}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(m);
    }
  }
  return out;
}

// --- email ------------------------------------------------------------------
// RFC-ish: dot-atom local part (supports plus-addressing), domain with at
// least one dot, final label must contain a letter. Trailing sentence period
// is not consumed ("mail a@example.com." still matches).
const EMAIL_RE = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9_%+-]+(?:\.[A-Za-z0-9_%+-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+(?![A-Za-z0-9_%+-]|\.[A-Za-z0-9])/g;

export function detectEmails(text) {
  const out = [];
  for (const m of scan(text, EMAIL_RE)) {
    const domain = m.value.slice(m.value.lastIndexOf('@') + 1);
    const lastLabel = domain.slice(domain.lastIndexOf('.') + 1);
    if (!/[A-Za-z]/.test(lastLabel)) continue; // reject example.123
    out.push(m);
  }
  return out;
}

// --- phone ------------------------------------------------------------------
// Accepted shapes (>= 7 and <= 15 digits after cleanup):
//   +CC ...      international, separators space/dot/dash
//   (555) 123-4567, (555)123-4567
//   555-123-4567, 555.123.4567
//   555 123 4567
// Bare digit runs without separators are NOT treated as phones (a year such
// as 2026 or a 5-digit zip must never match).
const PHONE_PATTERNS = [
  /(?<![A-Za-z0-9.+-])\+[0-9]{1,3}(?:[ .-]?[0-9]){4,12}(?![0-9])/g,
  /(?<![0-9])\([0-9]{3}\)[0-9 .-]{0,2}[0-9]{3}[ .-][0-9]{4}(?![0-9])/g,
  /(?<![0-9.])[0-9]{3}[-.][0-9]{3}[-.][0-9]{4}(?![0-9])/g,
  /(?<![0-9])[0-9]{3} [0-9]{3} [0-9]{4}(?![0-9])/g,
];

export function detectPhones(text) {
  const out = [];
  for (const re of PHONE_PATTERNS) {
    for (const m of scan(text, re)) {
      const digits = digitCount(m.value);
      if (digits < 7 || digits > 15) continue;
      out.push(m);
    }
  }
  return dedupeRanges(out);
}

// --- ipv4 -------------------------------------------------------------------
// Octet ranges enforced inside the regex (0-255). Leading zeros tolerated
// (010.0.0.1 matches, documented) via the optional leading zero branch.
// Boundaries reject partial matches: 999.1.1.1 and 1.2.3.4.5 produce no
// match at all.
const IPV4_OCTET = '(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|0?[0-9]{1,2})';
const IPV4_RE = new RegExp(`(?<![0-9.])${IPV4_OCTET}(?:\\.${IPV4_OCTET}){3}(?![0-9.])`, 'g');

export function detectIPv4(text) {
  return scan(text, IPV4_RE);
}

// --- ipv6 -------------------------------------------------------------------
// Basic full and compressed forms (::1, 2001:db8::1, full 8-group). A
// candidate immediately followed by "." + digit (as in ::ffff:1.2.3.4) is
// rejected so we never mangle an embedded IPv4; the ipv4 detector then
// handles that tail instead.
const IPV6_RE = new RegExp('(?<![0-9A-Fa-f:.])(?:' + '(?:[0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}|' + '(?:[0-9A-Fa-f]{1,4}:){1,7}:|' + '(?:[0-9A-Fa-f]{1,4}:){1,6}:[0-9A-Fa-f]{1,4}|' + '(?:[0-9A-Fa-f]{1,4}:){1,5}(?::[0-9A-Fa-f]{1,4}){1,2}|' + '(?:[0-9A-Fa-f]{1,4}:){1,4}(?::[0-9A-Fa-f]{1,4}){1,3}|' + '(?:[0-9A-Fa-f]{1,4}:){1,3}(?::[0-9A-Fa-f]{1,4}){1,4}|' + '(?:[0-9A-Fa-f]{1,4}:){1,2}(?::[0-9A-Fa-f]{1,4}){1,5}|' + '[0-9A-Fa-f]{1,4}:(?::[0-9A-Fa-f]{1,4}){1,6}|' + ':(?::[0-9A-Fa-f]{1,4}){1,7}|' + '::' + ')(?![0-9A-Fa-f:])', 'g');

export function detectIPv6(text) {
  const out = [];
  for (const m of scan(text, IPV6_RE)) {
    const next = text[m.end];
    const after = text[m.end + 1];
    if (next === '.' && after >= '0' && after <= '9') continue; // IPv4 tail
    out.push(m);
  }
  return out;
}

// --- credit card ------------------------------------------------------------
// 13-19 digits with single spaces/dashes between them, Luhn validated.
// Boundaries keep longer digit runs from being matched partially.
const CARD_RE = /(?<!\d)(?<!\d[ -])(?:\d[ -]?){12,18}\d(?![ -]?\d)/g;

export function detectCreditCards(text) {
  const out = [];
  for (const m of scan(text, CARD_RE)) {
    const digits = normalizeDigits(m.value);
    if (digits.length < 13 || digits.length > 19) continue;
    if (!isValidLuhn(digits)) continue;
    out.push(m);
  }
  return out;
}

// --- iban -------------------------------------------------------------------
// Contiguous or space-grouped (ISO presentation). Check digits validated
// with mod-97, which removes essentially all false positives.
const IBAN_CONTIGUOUS_RE = /(?<![A-Za-z0-9])[A-Za-z]{2}[0-9]{2}[A-Za-z0-9]{11,30}(?![A-Za-z0-9])/g;
const IBAN_SPACED_RE = /(?<![A-Za-z0-9])[A-Za-z]{2}[0-9]{2}(?: [A-Za-z0-9]{4}){2,} ?[A-Za-z0-9]{1,4}(?![A-Za-z0-9])/g;

export function detectIbans(text) {
  const out = [];
  for (const re of [IBAN_CONTIGUOUS_RE, IBAN_SPACED_RE]) {
    for (const m of scan(text, re)) {
      if (!isValidIban(m.value)) continue;
      out.push(m);
    }
  }
  return dedupeRanges(out);
}

// --- urls with credentials --------------------------------------------------
// Any http(s)/ftp(s)/ws(s) URL whose authority carries user:pass@, or whose
// query string carries a secret-looking parameter. The whole URL is the match.
const URL_RE = /(?:https?|ftps?|wss?):\/\/[^\s<>"']+/gi;
const URL_CRED_RE = /\/\/[^/@\s]+:[^/@\s]+@/;
const URL_PARAM_RE = /[?&](?:access_token|token|api_key|apikey|key|secret|client_secret|password|passwd|pwd|auth)=[^&#\s"']+/i;

export function detectUrlsWithCredentials(text) {
  const out = [];
  for (const m of scan(text, URL_RE)) {
    // Trim trailing sentence punctuation that is not part of the URL.
    const trimmed = m.value.replace(/[.,;:!?)\]}]+$/, '');
    const url = trimmed;
    if (URL_CRED_RE.test(url) || URL_PARAM_RE.test(url)) {
      out.push({ start: m.start, end: m.start + url.length, value: url });
    }
  }
  return out;
}

// --- tokens -----------------------------------------------------------------
// Known provider prefixes first, then a generic high-entropy fallback.
// The fallback only fires for >= 40 contiguous chars of the token charset
// that mix lower + upper + digit + one of _ + / = . (or look like a JWT),
// which keeps ordinary English prose (spaces everywhere) at zero matches.
const TOKEN_PATTERNS = [
  /(?<![A-Za-z0-9_-])sk-[A-Za-z0-9_-]{20,}(?![A-Za-z0-9_-])/g,
  /(?<![A-Za-z0-9])ghp_[A-Za-z0-9]{36}(?![A-Za-z0-9])/g,
  /(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}(?![A-Za-z0-9])/g,
  /(?<![A-Za-z0-9])xox[baprs]-[0-9A-Za-z]{10,}(?![A-Za-z0-9])/g,
  /(?<![A-Za-z0-9_\-+/=.])[A-Za-z0-9_\-+/=.]{40,}(?![A-Za-z0-9_\-+/=.])/g,
];

function looksHighEntropy(v) {
  const mixed = /[a-z]/.test(v) && /[A-Z]/.test(v) && /[0-9]/.test(v);
  if (!mixed) return false;
  if (/[_+/=]/.test(v)) return true;
  // JWT shape: exactly three base64url/64 segments joined by dots.
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v)) return true;
  return false;
}

export function detectTokens(text) {
  const out = [];
  const generic = TOKEN_PATTERNS.length - 1;
  for (let i = 0; i < TOKEN_PATTERNS.length; i++) {
    const re = TOKEN_PATTERNS[i];
    for (const m of scan(text, re)) {
      if (i !== generic) {
        out.push(m);
        continue;
      }
      // Strip a leading `label=` so `token=SECRET` redacts the value, not
      // the label: keep `token=***` readable instead of `***`.
      let start = m.start;
      let value = m.value;
      const eq = value.indexOf('=');
      if (eq > 0 && /^[A-Za-z_][A-Za-z0-9_]{0,19}$/.test(value.slice(0, eq))) {
        start += eq + 1;
        value = value.slice(eq + 1);
      }
      if (value.length < 40 || !looksHighEntropy(value)) continue;
      out.push({ start, end: start + value.length, value });
    }
  }
  return dedupeRanges(out);
}

// --- custom terms -----------------------------------------------------------
// User-supplied word list, case-insensitive, whole-word (bounded by
// non-word characters so "ac" does not hit inside "action").
export function detectCustomTerms(text, terms = []) {
  const out = [];
  for (const raw of terms ?? []) {
    const term = String(raw).trim();
    if (!term) continue;
    const re = new RegExp(`(?<![A-Za-z0-9_])${escRe(term)}(?![A-Za-z0-9_])`, 'gi');
    for (const m of scan(text, re)) out.push(m);
  }
  return dedupeRanges(out);
}

// --- aggregate --------------------------------------------------------------
// Runs every detector and returns all matches (including overlapping ones,
// which redact.js resolves longest-first). Deterministic order: by start,
// then by end.
export function detect(text, options = {}) {
  const src = String(text ?? '');
  const all = [];
  const add = (type, list) => {
    for (const m of list) all.push({ start: m.start, end: m.end, value: m.value, type });
  };
  add('email', detectEmails(src));
  add('phone', detectPhones(src));
  add('ipv4', detectIPv4(src));
  add('ipv6', detectIPv6(src));
  add('credit_card', detectCreditCards(src));
  add('iban', detectIbans(src));
  add('url_cred', detectUrlsWithCredentials(src));
  add('token', detectTokens(src));
  add('custom', detectCustomTerms(src, options.customTerms));
  const seen = new Set();
  const out = [];
  for (const m of all) {
    const key = `${m.type}:${m.start}:${m.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  out.sort((a, b) => a.start - b.start || a.end - b.end);
  return out;
}
