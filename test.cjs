const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const C = require('./dist/core.js');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'dist/deck.js'), 'utf8'), sandbox);
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'dist/artwork.js'), 'utf8'), sandbox);
const deck = JSON.parse(JSON.stringify(sandbox.window.TAROT_DECK));
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
const storage = () => { const values = new Map(); return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; };
const rng = () => { let state = 20261112; return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return state >>> 0; }; };
test('78 unique cards / 22 major / 56 minor / every orientation complete', () => {
  assert.equal(deck.length, 78); assert.equal(new Set(deck.map(x => x.id)).size, 78);
  assert.equal(deck.filter(x => x.arcana === 'major').length, 22);
  for (const suit of ['wands', 'cups', 'swords', 'pentacles']) assert.equal(deck.filter(x => x.suit === suit).length, 14);
  for (const card of deck) { assert.ok(card.name && card.english && card.keywords.length >= 2); for (const orientation of ['upright', 'reversed']) for (const field of ['meaning', 'risk', 'action', 'question']) assert.ok(typeof card[orientation][field] === 'string' && card[orientation][field].length > 6, `${card.name} ${orientation} ${field}`); }
});
test('local calendar date / valid leap day / invalid date rejected', () => {
  assert.equal(C.localDate(new Date(2026, 10, 12, 0, 1)), '2026-11-12'); assert.equal(C.localDate(new Date(2026, 10, 12, 23, 59)), '2026-11-12');
  assert.ok(C.isDate('2028-02-29')); assert.ok(!C.isDate('2026-02-29')); assert.ok(!C.isDate('2026-13-01')); assert.ok(!C.isDate('__proto__'));
});
test('rejection sampling actually rejects modulo-bias tail', () => { const values = [4294967295, 7]; assert.equal(C.randomInt(3, () => values.shift()), 1); assert.equal(values.length, 0); assert.throws(() => C.randomInt(0)); assert.throws(() => C.randomInt(3, () => -1)); });
test('10,000 spreads never duplicate a card; all 78 cards reachable', () => {
  const source = rng(); const ids = new Set(); for (let i = 0; i < 10000; i++) { const draws = C.drawCards(deck, 3, source); assert.equal(new Set(draws.map(x => x.id)).size, 3); draws.forEach(x => { assert.equal(typeof x.reversed, 'boolean'); ids.add(x.id); }); } assert.equal(ids.size, 78);
});
test('real crypto path draws all orientations without a positivity filter', () => {
  let reversed = 0; const ids = new Set(); for (let i = 0; i < 1000; i++) for (const draw of C.drawCards(deck)) { reversed += draw.reversed ? 1 : 0; ids.add(draw.id); }
  assert.equal(ids.size, 78); assert.ok(reversed > 1200 && reversed < 1800); // Broad sanity bound, not a proof of uniformity.
});
test('question wording and topic do not alter selection for identical random input', () => { const a = C.makeRecord(deck, 'general', 'give me good news', '2026-11-12', rng()); const b = C.makeRecord(deck, 'study', 'I fear failure', '2026-11-12', rng()); assert.deepEqual(a.cards, b.cards); });
test('daily draw fixed across refresh / new day can draw / no topic rewrite', () => {
  const s = storage(); const r = C.createRepository(s, deck); const first = r.add(C.makeRecord(deck, 'study', 'test', '2026-11-12', rng()));
  const next = r.add(C.makeRecord(deck, 'self', 'changed', '2026-11-12', rng())); assert.deepEqual(first, next);
  assert.deepEqual(C.createRepository(s, deck).read()['2026-11-12'], first);
  r.add(C.makeRecord(deck, 'general', '', '2026-11-13', rng())); assert.equal(Object.keys(r.read()).length, 2);
});
test('reflection edits cannot rewrite date, cards or topic', () => {
  const r = C.createRepository(storage(), deck); const record = r.add(C.makeRecord(deck, 'study', '', '2026-11-12', rng()));
  const updated = r.update(record.date, { intention: '25分钟练习', reflection: '这条没有对应', match: 'none', actionDone: 'yes', cards: [], topic: 'self', date: '2026-11-13' });
  assert.deepEqual(updated.cards, record.cards); assert.equal(updated.date, record.date); assert.equal(updated.topic, record.topic); assert.equal(updated.match, 'none'); assert.equal(updated.actionDone, 'yes');
});
test('backup round trip / conflicts keep existing / no partial malformed import', () => {
  const r = C.createRepository(storage(), deck); r.add(C.makeRecord(deck, 'study', '<script>alert(1)</script>', '2026-11-12', rng()));
  r.update('2026-11-12', { reflection: '真实回顾' }); const backup = C.parseBackup(r.export(), deck);
  const target = C.createRepository(storage(), deck); assert.equal(target.merge(backup), 1); assert.equal(target.merge(backup), 0); assert.deepEqual(target.read(), r.read());
  const malformed = JSON.parse(r.export()); malformed.records['2026-11-13'] = { date: '2026-11-13', cards: [] }; assert.throws(() => C.parseBackup(JSON.stringify(malformed), deck)); assert.throws(() => C.parseBackup('{bad json}', deck)); assert.throws(() => C.parseBackup(JSON.stringify({ schemaVersion: 99, records: {} }), deck));
});
test('blocked storage remains exportable and reports degraded persistence', () => {
  const warnings = []; const r = C.createRepository({ getItem() { throw new Error('blocked'); } }, deck, message => warnings.push(message));
  r.add(C.makeRecord(deck, 'general', '', '2026-11-12', rng())); assert.equal(r.isPersistent(), false); assert.equal(warnings.length, 1); assert.equal(Object.keys(C.parseBackup(r.export(), deck)).length, 1);
});
test('corrupt storage is never silently overwritten', () => {
  let writes = 0; const r = C.createRepository({ getItem() { return '{corrupt'; }, setItem() { writes++; } }, deck);
  r.add(C.makeRecord(deck, 'general', '', '2026-11-12', rng())); assert.equal(writes, 0); assert.equal(r.isPersistent(), false);
});
test('failed clearing reports failure, successful clearing removes data', () => {
  const r = C.createRepository(storage(), deck); r.add(C.makeRecord(deck, 'general', '', '2026-11-12', rng())); assert.equal(r.clear(), true); assert.deepEqual(r.read(), {});
  assert.equal(C.createRepository({ removeItem() { throw new Error('blocked'); } }, deck).clear(), false);
});
test('79 distinct complete artworks with unique SVG ids and no undefined tokens', () => {
  const arts = deck.map(sandbox.window.tarotArtwork); arts.push(sandbox.window.tarotCardBack());
  assert.equal(new Set(arts).size, 79); for (const svg of arts) { assert.ok(svg.includes('viewBox="0 0 300 500"')); assert.ok(svg.includes('</svg>')); assert.ok(!svg.includes('undefined')); }
  const allIds = arts.flatMap(svg => [...svg.matchAll(/\bid="([^"]+)"/g)].map(m => m[1])); assert.equal(new Set(allIds).size, allIds.length);
});
test('card interpretation includes concrete risks and actions in both orientations', () => {
  for (const card of deck) for (const orientation of [false, true]) for (const topic of Object.keys(C.TOPICS)) { const result = C.interpret(card, orientation, topic, 1); assert.ok(result.meaning && result.risk && result.action && result.question); assert.equal(result.position, '潜在盲点'); assert.equal(result.topic.name, C.TOPICS[topic].name); }
});
console.log(`\n${passed}/${passed} tests passed. No divinatory effectiveness claim is tested or established.`);
