import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDigits, isValidLuhn, isValidCardNumber } from '../src/luhn.js';

test('normalizeDigits strips separators', () => {
  assert.equal(normalizeDigits('4111 1111-1111.1111'), '4111111111111111');
  assert.equal(normalizeDigits('abc'), '');
});

test('valid standard test PANs pass Luhn', () => {
  assert.equal(isValidLuhn('4111111111111111'), true);
  assert.equal(isValidLuhn('4111 1111 1111 1111'), true);
  assert.equal(isValidLuhn('5500005555555559'), true);
  assert.equal(isValidLuhn('5500 0055 5555 5559'), true);
});

test('checksum-invalid numbers fail Luhn', () => {
  assert.equal(isValidLuhn('4111111111111112'), false);
  assert.equal(isValidLuhn('5500005555555558'), false);
  assert.equal(isValidLuhn('1234567890123456'), false);
});

test('empty input fails', () => {
  assert.equal(isValidLuhn(''), false);
  assert.equal(isValidLuhn('---'), false);
});

test('isValidCardNumber enforces 13-19 digit length', () => {
  assert.equal(isValidCardNumber('4111 1111 1111 1111'), true);
  assert.equal(isValidCardNumber('4111111111111111'), true);
  // 12 digits: Luhn may hold but it is not a PAN length
  assert.equal(isValidCardNumber('999999999999'), false);
  assert.equal(isValidCardNumber('4111111111111112'), false);
});
