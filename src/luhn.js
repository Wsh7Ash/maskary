// Pure Luhn (mod-10) helpers for credit-card style numbers. No DOM, no I/O.

// Strip everything that is not a decimal digit.
export function normalizeDigits(value) {
  return String(value).replace(/[^0-9]/g, '');
}

// Standard Luhn checksum over the digit string.
// Returns false for empty input. Length bounds (13-19 for PANs) are the
// detector's job, not this function's — this is pure arithmetic.
export function isValidLuhn(value) {
  const digits = normalizeDigits(value);
  if (digits.length === 0) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

// True when the value is a 13-19 digit number that passes Luhn.
export function isValidCardNumber(value) {
  const digits = normalizeDigits(value);
  if (digits.length < 13 || digits.length > 19) return false;
  return isValidLuhn(digits);
}
