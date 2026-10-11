import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIban, isValidIban, formatIban } from '../src/iban.js';

test('known-valid IBANs pass mod-97', () => {
  assert.equal(isValidIban('GB82 WEST 1234 5698 7654 32'), true);
  assert.equal(isValidIban('GB82WEST12345698765432'), true);
  assert.equal(isValidIban('DE89 3704 0044 0532 0130 00'), true);
  assert.equal(isValidIban('DE89370400440532013000'), true);
});

test('lowercase input is accepted (normalized to uppercase)', () => {
  assert.equal(isValidIban('gb82west12345698765432'), true);
  assert.equal(normalizeIban('gb82 west 1234 5698 7654 32'), 'GB82WEST12345698765432');
});

test('corrupted check digits fail', () => {
  // GB82 -> GB81: check digit no longer satisfies mod-97 == 1
  assert.equal(isValidIban('GB81 WEST 1234 5698 7654 32'), false);
  // DE89 -> DE88
  assert.equal(isValidIban('DE88 3704 0044 0532 0130 00'), false);
});

test('malformed IBANs fail', () => {
  assert.equal(isValidIban('GB82'), false); // too short
  assert.equal(isValidIban('1282 WEST 1234 5698 7654 32'), false); // no country letters
  assert.equal(isValidIban(''), false);
  assert.equal(isValidIban('XX123456789012345678901234567890123456789012'), false); // > 34 chars
});

test('formatIban groups by four', () => {
  assert.equal(formatIban('GB82WEST12345698765432'), 'GB82 WEST 1234 5698 7654 32');
  assert.equal(formatIban('de89370400440532013000'), 'DE89 3704 0044 0532 0130 00');
});
