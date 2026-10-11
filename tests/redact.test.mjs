import test from 'node:test';
import assert from 'node:assert/strict';
import { redact } from '../src/redact.js';
import { applyPolicy, DEFAULT_POLICIES, POLICIES } from '../src/policies.js';
import { createAliasAllocator } from '../src/aliases.js';

test('consistent aliasing: same value three times -> same alias', () => {
  const input = 'a john@example.com b john@example.com c john@example.com d';
  const { text, counts, aliases } = redact(input);
  assert.equal(counts.email, 3);
  assert.equal(aliases.size, 1);
  assert.equal(text, 'a EMAIL_1 b EMAIL_1 c EMAIL_1 d');
});

test('aliases allocated in first-seen order, distinct values get distinct aliases', () => {
  const input = 'first zeta@example.com then alpha@example.com then zeta@example.com';
  const { text } = redact(input);
  assert.equal(text, 'first EMAIL_1 then EMAIL_2 then EMAIL_1');
});

test('re-running the same input yields identical output (stable across re-runs)', () => {
  const input = 'mail a@x.com call (555) 123-4567 card 4111 1111 1111 1111 ip 10.0.0.7';
  const run1 = redact(input);
  const run2 = redact(input);
  assert.equal(run1.text, run2.text);
  assert.deepEqual(run1.counts, run2.counts);
});

test('overlap: URL containing an email is replaced once, no mangling', () => {
  const input = 'see https://alice@example.com/?token=zz8qq3kk11tt44 end';
  const { text, matches, counts } = redact(input);
  // longest match (the URL) wins; the email inside is not double-replaced
  assert.equal(matches.length, 1);
  assert.equal(matches[0].type, 'url_cred');
  assert.equal(counts.email, undefined);
  assert.equal(text, 'see *** end');
});

test('overlap: nested token inside a url_cred match is replaced once', () => {
  const input = 'fetch https://api.example.com/v1?key=AKIA1234567890ABCDEF now';
  const { text, matches } = redact(input);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].type, 'url_cred');
  assert.equal(text, 'fetch *** now');
});

test('replacement output length is sane and surrounding text untouched', () => {
  const input = 'x 192.168.0.9 y';
  const { text } = redact(input);
  assert.equal(text, 'x IPV4_1 y');
  assert.ok(text.length < input.length + 10);
});

test('policy alias produces the alias string', () => {
  assert.equal(applyPolicy('alias', 'email', 'john@example.com', 'EMAIL_1'), 'EMAIL_1');
});

test('policy mask_all produces ***', () => {
  assert.equal(applyPolicy('mask_all', 'token', 'sk-abcdefghijklmnopqrst123456', 'TOKEN_1'), '***');
  assert.equal(applyPolicy('mask_all', 'email', 'john@example.com', 'EMAIL_1'), '***');
});

test('policy keep_last4 produces bullet + last four characters', () => {
  assert.equal(applyPolicy('keep_last4', 'credit_card', '4111 1111 1111 4242', 'CARD_1'), '•••• 4242');
  assert.equal(applyPolicy('keep_last4', 'iban', 'GB82 WEST 1234 5698 7654 32', 'IBAN_1'), '•••• 5432');
});

test('policy keep_domain keeps the domain readable', () => {
  assert.equal(applyPolicy('keep_domain', 'email', 'john@example.com', 'EMAIL_1'), 'j***@example.com');
  assert.equal(applyPolicy('keep_domain', 'email', 'averylonglocalpart@example.org', 'EMAIL_1'), 'a***@example.org');
  // non-email values fall back to mask_all
  assert.equal(applyPolicy('keep_domain', 'ipv4', '10.0.0.1', 'IPV4_1'), '***');
});

test('unknown policy throws', () => {
  assert.throws(() => applyPolicy('nope', 'email', 'a@b.com', 'EMAIL_1'), RangeError);
  assert.throws(() => applyPolicy('alias', 'email', 'a@b.com', undefined), Error);
});

test('per-type policies are applied by redact()', () => {
  const input = 'mail john@example.com card 4111 1111 1111 1111 tok ghp_' + 'a'.repeat(36);
  const { text } = redact(input, {
    policies: { email: 'keep_domain', credit_card: 'alias', token: 'alias' },
  });
  assert.equal(text, 'mail j***@example.com card CARD_1 tok TOKEN_1');
});

test('custom terms are masked consistently like other matches', () => {
  const input = 'Mention Bluebird twice: Bluebird rises, other birds stay.';
  const { text, counts } = redact(input, { customTerms: ['bluebird'], policies: { custom: 'alias' } });
  assert.equal(counts.custom, 2);
  assert.equal(text, 'Mention CUSTOM_1 twice: CUSTOM_1 rises, other birds stay.');
});

test('clean text passes through unchanged', () => {
  const input = 'Nothing sensitive here in 2026 or zip 90210 or shape 1.2.3.4.5.';
  const { text, counts, matches } = redact(input);
  assert.equal(text, input);
  assert.equal(matches.length, 0);
  assert.deepEqual(counts, {});
});

test('default policies table covers every detector type', () => {
  const types = ['email', 'phone', 'ipv4', 'ipv6', 'credit_card', 'iban', 'url_cred', 'token', 'custom'];
  for (const t of types) {
    assert.ok(POLICIES.includes(DEFAULT_POLICIES[t]), `default for ${t} is a known policy`);
  }
});

test('alias allocator: entries keep first-seen order', () => {
  const alloc = createAliasAllocator();
  alloc.aliasFor('email', 'b@x.com');
  alloc.aliasFor('email', 'a@x.com');
  alloc.aliasFor('email', 'b@x.com');
  assert.deepEqual(alloc.entries(), [['b@x.com', 'EMAIL_1'], ['a@x.com', 'EMAIL_2']]);
  assert.equal(alloc.size, 2);
});
