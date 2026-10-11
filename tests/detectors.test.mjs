import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detect,
  detectEmails,
  detectPhones,
  detectIPv4,
  detectIPv6,
  detectCreditCards,
  detectIbans,
  detectUrlsWithCredentials,
  detectTokens,
  detectCustomTerms,
} from '../src/detectors.js';

const values = (list) => list.map((m) => m.value);
const ofType = (list, type) => list.filter((m) => m.type === type);

test('email: plus-addressing and standard forms match', () => {
  const m = detectEmails('write to john+support@example.com or Alice@EXAMPLE.org today');
  assert.deepEqual(values(m), ['john+support@example.com', 'Alice@EXAMPLE.org']);
});

test('email: trailing sentence period is not consumed', () => {
  const m = detectEmails('Mail bob@example.com.');
  assert.deepEqual(values(m), ['bob@example.com']);
});

test('email: bare words and dot-less domains do not match', () => {
  assert.equal(detectEmails('send it to john at example').length, 0);
  assert.equal(detectEmails('admin@localhost').length, 0);
  assert.equal(detectEmails('no-at-sign.example').length, 0);
});

test('phone: international and US shapes match with >= 7 digits', () => {
  const m = detectPhones('Call +44 20 7123 4567, (555) 123-4567, 555-123-4567 or 555.123.4567.');
  assert.deepEqual(values(m), ['+44 20 7123 4567', '(555) 123-4567', '555-123-4567', '555.123.4567']);
});

test('phone: years and short numbers do not match', () => {
  const m = detect('Shipped in 2026, zip 90210, room 12345.');
  assert.equal(ofType(m, 'phone').length, 0);
});

test('ipv4: valid octets match, out-of-range and over-long do not', () => {
  assert.deepEqual(values(detectIPv4('host 192.168.1.1 and 10.0.0.255 ok')), ['192.168.1.1', '10.0.0.255']);
  assert.equal(detectIPv4('bad 999.1.1.1 entry').length, 0);
  assert.equal(detectIPv4('bad 1.2.3.4.5 entry').length, 0);
  assert.equal(detectIPv4('bad 300.100.100.100 entry').length, 0);
});

test('ipv4: leading zeros are tolerated (documented)', () => {
  assert.deepEqual(values(detectIPv4('legacy 010.0.0.1 box')), ['010.0.0.1']);
});

test('ipv6: full and compressed forms match, times do not', () => {
  const m = detectIPv6('2001:db8::1, ::1 and fe80:0000:0000:0000:0000:0000:0000:0001 done at 12:34');
  assert.deepEqual(values(m), ['2001:db8::1', '::1', 'fe80:0000:0000:0000:0000:0000:0000:0001']);
});

test('credit_card: Luhn-valid numbers match with separators', () => {
  const m = detectCreditCards('card 4111 1111 1111 1111 and 5500005555555559 ok');
  assert.deepEqual(values(m), ['4111 1111 1111 1111', '5500005555555559']);
});

test('credit_card: Luhn-invalid numbers are rejected', () => {
  assert.equal(detectCreditCards('card 4111 1111 1111 1112 here').length, 0);
  assert.equal(detectCreditCards('card 5500005555555558 here').length, 0);
});

test('iban: valid check digits match, corrupted ones are rejected', () => {
  const m = detectIbans('pay GB82 WEST 1234 5698 7654 32 or DE89 3704 0044 0532 0130 00 now');
  assert.deepEqual(values(m), ['GB82 WEST 1234 5698 7654 32', 'DE89 3704 0044 0532 0130 00']);
  assert.equal(detectIbans('pay GB81 WEST 1234 5698 7654 32 now').length, 0);
});

test('url_cred: credentials and secret query params match, plain URLs do not', () => {
  const m = detectUrlsWithCredentials(
    'open https://user:pass@example.com/admin then https://api.example.com/v1?token=abc123secret but not https://example.com/docs ok'
  );
  assert.deepEqual(values(m), [
    'https://user:pass@example.com/admin',
    'https://api.example.com/v1?token=abc123secret',
  ]);
});

test('token: known prefixes match', () => {
  const gh = 'ghp_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8';
  const m = detectTokens(`use ${gh} or AKIA1234567890ABCDEF or sk-abcdefghijklmnopqrst123456 or xoxb-1234567890-abcdef requested`);
  const vals = values(m);
  assert.ok(vals.includes(gh), 'ghp_ token');
  assert.ok(vals.includes('AKIA1234567890ABCDEF'), 'AKIA token');
  assert.ok(vals.some((v) => v.startsWith('sk-')), 'sk- token');
  assert.ok(vals.some((v) => v.startsWith('xoxb-')), 'slack token');
});

test('token: ghp_ prefix requires exactly 36 chars after prefix', () => {
  const good = 'ghp_' + 'a'.repeat(36);
  const short = 'ghp_' + 'a'.repeat(35);
  assert.equal(detectTokens(`x ${good} y`).length, 1);
  assert.equal(detectTokens(`x ${short} y`).length, 0);
});

test('token: generic high-entropy fallback matches mixed-class blobs', () => {
  const blob = 'aG9iZWNvZGVyX3NlY3JldF90b2tlbl9BbE14ZWRpYW5hNw==';
  const m = detectTokens(`key=${blob} end`);
  assert.equal(m.length, 1);
  assert.equal(m[0].value, blob);
  assert.equal(m[0].start, 'key='.length); // the `key=` label stays outside the match
});

test('token: label=VALUE keeps the label readable after redaction', () => {
  const blob = 's3cr3t_VALUE_with40plusChars_AaBbCcDdEeFfGgHhIiJjKkLl';
  const m = detectTokens(`auth token=${blob} trailing`);
  assert.equal(m.length, 1);
  assert.equal(m[0].value, blob);
  assert.equal(m[0].start, 'auth token='.length);
});

test('token: mixed-case slug without _ + / = is NOT treated as a token', () => {
  // upper+lower+digit but only dashes/dots: conservative rejection
  assert.equal(detectTokens('see Chapter-5-Introduction-To-Modern-Web-Development-And-Best-Practices here').length, 0);
});

test('token: a 400-word English paragraph yields ZERO token matches (false-positive regression)', () => {
  const words = [];
  const sentences = [
    'The quick brown fox jumps over the lazy dog while the weary hiker studies an old paper map near the river bend.',
    'When the meeting ended, everyone agreed that clear writing beats clever writing, and that readers deserve plain sentences without needless jargon or filler.',
    'A small team can ship reliable software by writing tests first, reviewing each change carefully, and keeping the release process boring on purpose.',
    'Farmers watch the sky before planting, teachers plan lessons around curious questions, and nurses note small changes that matter over a long shift.',
    'Our neighbor keeps a tidy garden, trades pears with the family next door, and always labels the jars of preserved plums with the date they were sealed.',
    'During the drill, the crew checked every valve twice, logged the readings, and left the control room in the same order they had found it that morning.',
    'The museum opens at nine, the ferry leaves at noon, and the lighthouse turns slowly through the evening while gulls rest along the quiet stone wall.',
    'Readers of technical documents benefit from short paragraphs, honest limits, and examples that mirror real work rather than idealized cases from a slide deck.',
    'She saved the draft, closed the laptop, walked to the kitchen, poured fresh coffee, and returned to revise the opening line one final calm time.',
    'History reminds us that careful record keeping helps communities recover from floods, fires, and long winters when roads were closed and supplies ran low.',
    'In the workshop, oak shavings curled under the bench, tools hung on labeled hooks, and every drawer held parts sorted by size for quick repair jobs.',
    'The contract states that notice must arrive within thirty days, though both parties prefer a friendly call before any formal letter is written or sent.',
    'Children build towers from wooden blocks, knock them down with a grin, and start again, learning by trial that strong foundations keep tall walls upright.',
    'A good recipe lists ingredients by weight, explains the resting time, and warns when the oven runs hot so the crust does not burn before the center sets.',
    'Volunteers cleaned the trail after the storm, moved fallen branches aside, repainted the wooden bridge, and posted a friendly sign about staying on the path.',
    'Engineers compared the two designs on cost, noise, repair time, and safety, then chose the simpler option that the night crew could fix without special tools.',
    'Grandmother told stories about the long winter, the radio nights, and the letter that finally arrived in spring with news that changed the whole plan.',
    'The poet chose plain words, kept the rhythm steady, and trusted the reader to feel the quiet grief between the lines without any heavy ornament at all.',
    'Before the vote, the clerk verified each signature, explained the procedure twice, and made sure that every present member understood the motion on paper.',
    'Morning fog covered the field, the rooster called from the fence, and the school bus slowed near the oak while headlights cut a soft glow through the haze.',
    'We tested the patch on a small group, watched the error rates drop, documented the tradeoffs, and rolled it out further once the metrics stayed steady.',
    'The librarian shelved returned books by code, fixed the loose hinge on the reading room door, and wrote a kind note to the child who lost a favorite card.',
    'Pilots review weather charts before takeoff, file the plan with the tower, and keep a steady checklist handy so that routine steps never get skipped by haste.',
    'Cousins met at the old pier, skipped stones across the flat water, argued about the best bait, and laughed when the smallest fish tugged the hardest line.',
  ];
  // Repeat sentences until the corpus exceeds 400 words of normal English prose.
  let i = 0;
  while (words.length < 400) {
    words.push(...sentences[i % sentences.length].split(/\s+/));
    i++;
  }
  assert.ok(words.length >= 400, `paragraph has ${words.length} words`);
  const text = words.join(' ');
  assert.equal(detectTokens(text).length, 0, 'no token matches in English prose');
  // and the whole document has no matches of any type either
  assert.equal(detect(text).length, 0, 'no detector matches in English prose');
});

test('custom terms: case-insensitive whole-word matching', () => {
  const terms = ['acme corp', 'Project Bluebird'];
  const m = detectCustomTerms('Acme Corp signed; PROJECT BLUEBIRD is green; acme corporations is unrelated', terms);
  assert.deepEqual(values(m), ['Acme Corp', 'PROJECT BLUEBIRD']);
});

test('custom terms: partial-word matches are rejected', () => {
  assert.equal(detectCustomTerms('action hero', ['ac']).length, 0);
  assert.equal(detectCustomTerms('johndoe', ['john doe']).length, 0);
});

test('detect: returns typed, sorted matches and supports overlap between types', () => {
  const text = 'see https://alice@example.com/?token=zx8qq3kk11 ok';
  const m = detect(text);
  const types = new Set(m.map((x) => x.type));
  assert.ok(types.has('url_cred'));
  assert.ok(types.has('email'));
  // sorted by start
  const starts = m.map((x) => x.start);
  assert.deepEqual(starts, [...starts].sort((a, b) => a - b));
});
