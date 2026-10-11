// Pure IBAN (ISO 13616) helpers: normalization, mod-97 validation, grouping.
// No DOM, no I/O.

// Uppercase and remove the presentation spaces/dashes people paste with.
export function normalizeIban(value) {
  return String(value).replace(/[\s-]/g, '').toUpperCase();
}

// Validate per ISO 13616: country+check (4 chars), total length 15-34,
// then the mod-97-of-10 check on the "move first 4 to the end" transform
// with letters expanded to numbers (A=10 ... Z=35).
export function isValidIban(value) {
  const iban = normalizeIban(value);
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(iban)) return false;
  if (iban.length < 15 || iban.length > 34) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    if (code >= 48 && code <= 57) {
      remainder = (remainder * 10 + (code - 48)) % 97;
    } else if (code >= 65 && code <= 90) {
      const n = code - 55; // A -> 10 ... Z -> 35 (two decimal digits)
      remainder = (remainder * 10 + Math.floor(n / 10)) % 97;
      remainder = (remainder * 10 + (n % 10)) % 97;
    } else {
      return false;
    }
  }
  return remainder === 1;
}

// ISO presentation format: groups of four separated by single spaces.
export function formatIban(value) {
  const iban = normalizeIban(value);
  return iban.replace(/(.{4})/g, '$1 ').trim();
}
