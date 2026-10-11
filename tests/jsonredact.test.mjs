import test from 'node:test';
import assert from 'node:assert/strict';
import { redactJsonValue, redactJsonText } from '../src/jsonredact.js';

test('nested objects and arrays stay valid JSON with structure preserved', () => {
  const input = JSON.stringify({
    ticket: {
      id: 42,
      open: true,
      contact: 'john@example.com',
      tags: ['billing', 'priority'],
      notes: [
        { author: 'alice@example.org', body: 'call (555) 123-4567 please' },
        { author: 'bob@example.net', body: 'no secrets here' },
      ],
      meta: null,
    },
    count: 3,
  });
  const { text, value, counts } = redactJsonText(input);
  const reparsed = JSON.parse(text); // must still parse
  assert.deepEqual(Object.keys(reparsed), ['ticket', 'count']);
  assert.deepEqual(Object.keys(reparsed.ticket), ['id', 'open', 'contact', 'tags', 'notes', 'meta']);
  assert.equal(reparsed.ticket.id, 42);
  assert.equal(reparsed.ticket.open, true);
  assert.equal(reparsed.ticket.meta, null);
  assert.equal(reparsed.count, 3);
  assert.deepEqual(reparsed.ticket.tags, ['billing', 'priority']);
  assert.equal(reparsed.ticket.notes.length, 2);
  assert.equal(reparsed.ticket.contact, 'EMAIL_1');
  assert.equal(reparsed.ticket.notes[0].author, 'EMAIL_2');
  assert.ok(!text.includes('john@example.com'), 'no raw email in output');
  assert.ok(reparsed.ticket.notes[0].body.includes('PHONE_1'));
  assert.ok(!reparsed.ticket.notes[0].body.includes('555) 123-4567'));
  assert.equal(reparsed.ticket.notes[1].body, 'no secrets here');
  assert.equal(counts.email, 3);
  assert.equal(counts.phone, 1);
  assert.equal(value.ticket.contact, 'EMAIL_1');
});

test('aliases are consistent across different strings of one document', () => {
  const input = JSON.stringify({ a: 'x john@example.com', b: 'y john@example.com', c: 'z other@example.com' });
  const { value } = redactJsonValue(JSON.parse(input));
  assert.equal(value.a, 'x EMAIL_1');
  assert.equal(value.b, 'y EMAIL_1');
  assert.equal(value.c, 'z EMAIL_2');
});

test('array order and primitive types are untouched', () => {
  const input = [1, 2.5, 'mail me@x.com', false, null, { deep: ['ok', 'n@x.com'] }];
  const { value, counts } = redactJsonValue(input);
  assert.equal(value[0], 1);
  assert.equal(value[1], 2.5);
  assert.equal(value[3], false);
  assert.equal(value[4], null);
  assert.equal(value[2], 'mail EMAIL_1');
  assert.equal(value[5].deep[0], 'ok');
  assert.equal(value[5].deep[1], 'EMAIL_2');
  assert.equal(counts.email, 2);
});

test('JSON keys are preserved verbatim (documented limitation)', () => {
  const input = JSON.stringify({ 'owner@example.com': 'value' });
  const { value } = redactJsonValue(JSON.parse(input));
  assert.deepEqual(Object.keys(value), ['owner@example.com']);
});

test('invalid JSON throws a parse error', () => {
  assert.throws(() => redactJsonText('{not json'), SyntaxError);
});

test('output is pretty-printed with 2-space indent and re-parses', () => {
  const input = '{"a":{"b":["c@d.com"]}}';
  const { text } = redactJsonText(input);
  assert.ok(text.includes('\n  '));
  const again = JSON.parse(text);
  assert.equal(again.a.b[0], 'EMAIL_1');
});
