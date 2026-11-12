const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, 'dist/index.html'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, 'dist/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'dist/styles.css'), 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(x => x[1]);
assert.equal(new Set(ids).size, ids.length, 'All DOM ids remain unique');
const disclosure = html.match(/<details\b([^>]*\bid="full-reading"[^>]*)>([\s\S]*?)<\/details>/);
assert.ok(disclosure, 'Full original interpretation uses a native details disclosure');
assert.ok(!/\bopen(?:\s|=|$)/.test(disclosure[1]), 'The long interpretation is closed by default');
for (const id of ['summary-title', 'summary-narrative', 'summary-tension', 'summary-action', 'summary-action-bridge', 'summary-topic-action', 'summary-checkpoint', 'summary-method', 'reading-detail']) {
  assert.ok(disclosure[2].includes(`id="${id}"`), 'Original content remains inside disclosure: ' + id);
}
for (const id of ['plain-title', 'plain-now', 'plain-caution', 'plain-action']) {
  assert.ok(html.includes(`id="${id}"`));
  assert.ok(!disclosure[2].includes(`id="${id}"`), 'Plain reading remains outside disclosure');
  assert.ok(app.includes(`$('${id}').textContent =`), 'Plain reading uses text, never HTML');
}
assert.ok(app.includes("$('full-reading').open = true; selectCard(i)"), 'Card selection expands the original detail');
assert.ok(css.includes('.plain-lines dd{font-size:18px'), 'Default desktop reading is no longer microtext');
assert.ok(css.includes('.plain-lines dd{font-size:17px'), 'Mobile reading remains legible');
for (const asset of ['styles.css', 'core.js', 'app.js']) assert.ok(html.includes(asset + '?v=20261112-plain'), 'Changed assets invalidate stale browser caches');
console.log('PASS UI: plain default; full text retained and folded; safe rendering; accessible native toggle; readable fonts; versioned assets.');
