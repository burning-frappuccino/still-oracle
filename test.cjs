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
function summaryRecord(ids = [0, 16, 14], orientations = [false, false, false], topic = 'general') {
  return { ...C.makeRecord(deck, topic, '', '2026-11-12', rng()), cards: ids.map((id, i) => ({ id, reversed: orientations[i] })) };
}
test('spread summary links three positions, named orientations and concrete action', () => {
  const record = summaryRecord(); const summary = C.summarizeSpread(record, deck);
  for (const reference of summary.references) { assert.ok(summary.narrative.includes(reference.label)); assert.ok(reference.position); }
  assert.equal(summary.references.length, 3); assert.equal(summary.priorityAction, deck.find(x => x.id === record.cards[2].id).upright.action);
  assert.ok(summary.actionBridge.includes('新方向与试探')); assert.ok(summary.tension.includes('高塔（正位）'));
  assert.ok(summary.tension.includes(deck.find(x => x.id === 16).upright.risk)); assert.ok(summary.method.includes('固定规则'));
});
test('spread summary is stable, derived only, and keeps existing records/schema untouched', () => {
  const record = summaryRecord(); const before = JSON.stringify(record); const first = C.summarizeSpread(record, deck);
  assert.deepEqual(first, C.summarizeSpread(record, deck)); assert.equal(JSON.stringify(record), before); assert.ok(!Object.hasOwn(record, 'summary'));
  const imported = C.parseBackup(JSON.stringify({ schemaVersion: 1, records: { [record.date]: record } }), deck);
  assert.deepEqual(first, C.summarizeSpread(imported[record.date], deck));
});
test('spread summary responds to different cards, order, topic and every orientation', () => {
  const record = summaryRecord(); const first = C.summarizeSpread(record, deck);
  assert.notEqual(first.narrative, C.summarizeSpread(summaryRecord([1, 18, 19]), deck).narrative);
  assert.notEqual(first.narrative, C.summarizeSpread(summaryRecord([14, 16, 0]), deck).narrative);
  assert.notEqual(first.narrative, C.summarizeSpread(summaryRecord([0, 16, 14], [false, false, false], 'study'), deck).narrative);
  for (let i = 0; i < 3; i++) { const orientations = [false, false, false]; orientations[i] = true; const reversed = C.summarizeSpread(summaryRecord([0, 16, 14], orientations), deck); assert.notEqual(first.narrative, reversed.narrative); assert.ok(reversed.narrative.includes('逆位')); }
});
test('spread synthesis uses suit and rank context and does not score fortune by reversals', () => {
  for (const card of deck) {
    const ids = [card.id, (card.id + 1) % 78, (card.id + 2) % 78]; const summary = C.summarizeSpread(summaryRecord(ids, [true, true, true]), deck);
    assert.ok(summary.narrative && summary.tension && summary.priorityAction && summary.checkpoint); assert.equal(Object.hasOwn(summary, 'score'), false);
    assert.ok(!/必然|注定|灾难将|好运指数|凶吉/.test(summary.narrative));
  }
  const minor = C.summarizeSpread(summaryRecord([22, 36, 50]), deck); assert.ok(/行动动力|感受与关系|想法与判断|资源与实际安排/.test(minor.narrative));
});
test('untrusted question is background only and never becomes summary markup', () => {
  const record = summaryRecord(); const first = C.summarizeSpread(record, deck);
  record.question = '<img src=x onerror=alert(1)>'; record.reflection = '<script>bad()</script>';
  assert.deepEqual(first, C.summarizeSpread(record, deck)); assert.ok(!JSON.stringify(C.summarizeSpread(record, deck)).includes('<img'));
  const app = fs.readFileSync(path.join(__dirname, 'dist/app.js'), 'utf8');
  for (const id of ['summary-title', 'summary-narrative', 'summary-tension', 'summary-action', 'summary-action-bridge', 'summary-checkpoint']) assert.ok(app.includes(`$('${id}').textContent =`));
});
test('incomplete, duplicate or invalid spread rejected instead of invented interpretation', () => {
  const record = summaryRecord(); assert.throws(() => C.summarizeSpread({ ...record, cards: record.cards.slice(0, 2) }, deck));
  assert.throws(() => C.summarizeSpread({ ...record, cards: [record.cards[0], record.cards[0], record.cards[2]] }, deck));
  assert.throws(() => C.summarizeSpread({ ...record, topic: '__proto__' }, deck));
});
test('plain readings cover every card and orientation with short complete everyday sentences', () => {
  const limits = { title: 18, now: 52, caution: 52, action: 52, link: 42 };
  const states = new Set();
  for (let i = 0; i < 78; i++) for (let mask = 0; mask < 8; mask++) for (const topic of Object.keys(C.TOPICS)) {
    const record = summaryRecord([i, (i + 1) % 78, (i + 2) % 78], [0, 1, 2].map(j => !!(mask & (1 << j))), topic);
    const plain = C.summarizeSpread(record, deck).plain;
    for (const [key, limit] of Object.entries(limits)) {
      assert.ok(typeof plain[key] === 'string' && plain[key].length > (key === 'title' ? 2 : 5) && plain[key].length <= limit, `${i}/${mask}/${topic}/${key}`);
      assert.ok(!/切入口|落点|检视|张力|执行边界|滋养|可逆试验|委托|交付物|原型/.test(plain[key]), `${key}: ${plain[key]}`);
      if (key !== 'title') assert.ok(/[。！？]$/.test(plain[key]), 'No mechanically cut sentence: ' + plain[key]);
    }
    assert.ok(plain.now.startsWith('你可能')); states.add(plain.now);
  }
  assert.equal(states.size, 156);
});
test('plain now, caution and action follow their own card positions and orientations', () => {
  const base = C.summarizeSpread(summaryRecord([67, 9, 3]), deck).plain;
  assert.equal(base.now, '你可能想守住时间和手里的东西，不太敢松手。');
  const changeFirst = C.summarizeSpread(summaryRecord([23, 9, 3]), deck).plain;
  assert.notEqual(base.now, changeFirst.now); assert.equal(base.caution, changeFirst.caution); assert.equal(base.action, changeFirst.action);
  const changeMiddle = C.summarizeSpread(summaryRecord([67, 54, 3]), deck).plain;
  assert.equal(base.now, changeMiddle.now); assert.notEqual(base.caution, changeMiddle.caution); assert.equal(base.action, changeMiddle.action);
  const changeLast = C.summarizeSpread(summaryRecord([67, 9, 22]), deck).plain;
  assert.equal(base.now, changeLast.now); assert.equal(base.caution, changeLast.caution); assert.notEqual(base.action, changeLast.action);
  for (const [index, key] of [[0, 'now'], [1, 'caution'], [2, 'action']]) {
    const orientations = [false, false, false]; orientations[index] = true;
    assert.notEqual(base[key], C.summarizeSpread(summaryRecord([67, 9, 3], orientations), deck).plain[key]);
  }
});
test('plain reading keeps concrete risks and actions rather than a generic pep talk', () => {
  const record = summaryRecord([33, 30, 31], [true, true, false]);
  const plain = C.summarizeSpread(record, deck).plain;
  assert.equal(plain.caution, '别一直硬撑，累到连事情都想不清楚。');
  assert.equal(plain.action, '列出手上的事，选一件推迟、不做，或分给别人做。');
  assert.ok(!plain.action.includes('小实验')); assert.ok(!plain.caution.includes('好运'));
});
test('plain reading is stable, old-backup compatible and ignores untrusted question text', () => {
  const record = summaryRecord(); const before = JSON.stringify(record); const expected = C.summarizeSpread(record, deck).plain;
  assert.deepEqual(expected, C.summarizeSpread(record, deck).plain); assert.equal(JSON.stringify(record), before);
  const restored = C.parseBackup(JSON.stringify({ schemaVersion: 1, records: { [record.date]: record } }), deck);
  assert.deepEqual(expected, C.summarizeSpread(restored[record.date], deck).plain);
  record.question = '<img src=x onerror=alert(1)>'; record.reflection = '<script>bad()</script>';
  assert.deepEqual(expected, C.summarizeSpread(record, deck).plain);
});
test('plain link uses the chosen topic without pretending to read the question', () => {
  const links = new Set();
  for (const topic of Object.keys(C.TOPICS)) {
    const summary = C.summarizeSpread(summaryRecord([67, 9, 3], [false, true, false], topic), deck);
    links.add(summary.plain.link);
    assert.ok(summary.plain.link.includes(summary.plain.title.replace(/^先/, '')));
  }
  assert.equal(links.size, 4);
});
test('full interpretation matches the original d28c3bc snapshot across 2496 cases', () => {
  // Generated and independently deep-compared against d28c3bc before this change.
  // Self-contained digest avoids requiring old Git history in shallow CI checkouts.
  const digest = require('node:crypto').createHash('sha256');
  for (let i = 0; i < 78; i++) for (let mask = 0; mask < 8; mask++) for (const topic of Object.keys(C.TOPICS)) {
    const record = summaryRecord([i, (i + 1) % 78, (i + 2) % 78], [0, 1, 2].map(j => !!(mask & (1 << j))), topic);
    const { plain, ...full } = C.summarizeSpread(record, deck);
    digest.update(JSON.stringify(full) + '\n');
  }
  assert.equal(digest.digest('hex'), '3157f2ba343085bca468e253c421f7cbfc020ae05d3a01c451ce3eec3b3c75f9');
});
console.log(`\n${passed}/${passed} tests passed. No divinatory effectiveness claim is tested or established.`);
