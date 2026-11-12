(function (root) {
  'use strict';
  const STORAGE_KEY = 'still-oracle.records.v1';
  const TOPICS = {
    general: { name: '整体状态', question: '把它对照到今天一件真实发生的小事，而不是套用到一切。', action: '在今天结束前，做一次小规模尝试，记下结果。' },
    study: { name: '学业 · 工作', question: '在一项具体任务中，哪些事实支持这个解读？哪些事实与它不符？', action: '将这个动作放到一个 25 分钟任务块中，用完成的题目、草稿或清单留下证据。' },
    relationship: { name: '关系 · 沟通', question: '区分对方实际说过、做过的事与你的猜测；这条提醒对应的是哪一种？', action: '选一次低风险的沟通，用“我观察到……我希望……”表达，不替对方断言动机。' },
    self: { name: '内在 · 成长', question: '这是此刻的感受，还是已经核实的事实？你可以暂时不替它下结论。', action: '给自己十分钟，记录行动前后的感受变化；如果不适合，可以换一种方法。' }
  };
  const POSITIONS = ['当下状态', '潜在盲点', '行动方向'];
  const RATINGS = ['unreviewed', 'specific', 'partial', 'none'];
  const ACTIONS = ['unrecorded', 'yes', 'no'];
  function localDate(date = new Date()) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  }
  function isDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(y, m - 1, d, 12);
    return y >= 2000 && y <= 2199 && localDate(date) === value;
  }
  function randomWord() {
    if (!root.crypto || typeof root.crypto.getRandomValues !== 'function') throw new Error('当前浏览器无法提供可靠随机数，请使用现代浏览器。');
    return root.crypto.getRandomValues(new Uint32Array(1))[0];
  }
  // Rejection sampling avoids modulo bias. This is not a claim of divinatory accuracy.
  function randomInt(max, rng = randomWord) {
    if (!Number.isInteger(max) || max < 1 || max > 4294967296) throw new Error('随机范围无效');
    const limit = Math.floor(4294967296 / max) * max;
    let value;
    let tries = 0;
    do {
      value = rng();
      if (!Number.isInteger(value) || value < 0 || value >= 4294967296) throw new Error('随机源无效');
      if (++tries > 1000) throw new Error('随机源重复返回无效范围');
    } while (value >= limit);
    return value % max;
  }
  function drawCards(deck, count = 3, rng = randomWord) {
    if (!Array.isArray(deck) || count > deck.length || count < 1) throw new Error('牌组不完整');
    const pool = deck.map(card => card.id);
    const result = [];
    for (let i = 0; i < count; i++) {
      const j = i + randomInt(pool.length - i, rng);
      [pool[i], pool[j]] = [pool[j], pool[i]];
      result.push({ id: pool[i], reversed: randomInt(2, rng) === 1 });
    }
    return result;
  }
  function makeRecord(deck, topic = 'general', question = '', date = localDate(), rng) {
    if (!isDate(date) || !Object.hasOwn(TOPICS, topic)) throw new Error('日期或主题无效');
    return { date, createdAt: new Date().toISOString(), topic, question: String(question).trim().slice(0, 140), cards: drawCards(deck, 3, rng), intention: '', reflection: '', match: 'unreviewed', actionDone: 'unrecorded' };
  }
  function cleanText(value, max) { return typeof value === 'string' ? value.slice(0, max) : ''; }
  function validateRecord(raw, deck) {
    if (!raw || typeof raw !== 'object' || !isDate(raw.date) || !Object.hasOwn(TOPICS, raw.topic)) return null;
    const ids = new Set(deck.map(x => x.id));
    if (!Array.isArray(raw.cards) || raw.cards.length !== 3 || new Set(raw.cards.map(x => x && x.id)).size !== 3) return null;
    if (raw.cards.some(x => !x || !ids.has(x.id) || typeof x.reversed !== 'boolean')) return null;
    return {
      date: raw.date, createdAt: cleanText(raw.createdAt, 50), topic: raw.topic,
      question: cleanText(raw.question, 140), cards: raw.cards.map(x => ({ id: x.id, reversed: x.reversed })),
      intention: cleanText(raw.intention, 500), reflection: cleanText(raw.reflection, 2000),
      match: RATINGS.includes(raw.match) ? raw.match : 'unreviewed',
      actionDone: ACTIONS.includes(raw.actionDone) ? raw.actionDone : 'unrecorded'
    };
  }
  function parseBackup(text, deck) {
    if (typeof text !== 'string' || text.length > 12000000) throw new Error('备份文件过大（最多 12MB）');
    const raw = JSON.parse(text);
    if (!raw || raw.schemaVersion !== 1 || !raw.records || typeof raw.records !== 'object' || Array.isArray(raw.records)) throw new Error('不是受支持的静观备份');
    const entries = Object.entries(raw.records);
    if (entries.length > 1000) throw new Error('备份最多支持 1000 条记录');
    const records = {};
    for (const [key, value] of entries) {
      const record = validateRecord(value, deck);
      if (!record || record.date !== key) throw new Error('备份中存在无效记录，未导入任何数据');
      records[key] = record;
    }
    return records;
  }
  function createRepository(storage, deck, onWarning = () => {}) {
    let memory = {};
    let persistent = true;
    function read() {
      if (!persistent) return { ...memory };
      try {
        const value = storage.getItem(STORAGE_KEY);
        memory = value ? parseBackup(value, deck) : {};
      } catch (error) {
        // Never overwrite a corrupt existing backup as if it were empty.
        persistent = false;
        onWarning('浏览器存储不可用或已有数据损坏：本次记录仅暂存，关闭前请导出备份。');
      }
      return { ...memory };
    }
    function write(records) {
      memory = { ...records };
      if (!persistent) return false;
      try { storage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, records: memory })); return true; }
      catch (error) { persistent = false; onWarning('保存失败：记录仅暂存于本页面，请立即导出备份。'); return false; }
    }
    return {
      read,
      isPersistent: () => persistent,
      add(record) { const all = read(); if (all[record.date]) return all[record.date]; if (Object.keys(all).length >= 1000) throw new Error('最多保留 1000 天记录，请先导出并整理备份'); const valid = validateRecord(record, deck); if (!valid) throw new Error('抽牌记录无效'); all[record.date] = valid; write(all); return valid; },
      update(date, changes) {
        const all = read();
        if (!all[date]) throw new Error('这一天的记录不存在');
        const fields = {};
        for (const key of ['intention', 'reflection', 'match', 'actionDone']) if (Object.hasOwn(changes, key)) fields[key] = changes[key];
        const next = validateRecord({ ...all[date], ...fields }, deck);
        if (!next) throw new Error('手记内容无效');
        all[date] = next; write(all); return next;
      },
      merge(incoming) { const all = read(); let count = 0; for (const [date, record] of Object.entries(incoming)) { if (!Object.hasOwn(all, date)) { all[date] = record; count++; } } if (Object.keys(all).length > 1000) throw new Error('最多保留 1000 天记录，请先导出并整理备份'); write(all); return count; },
      export() { return JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), records: read() }, null, 2); },
      clear() { memory = {}; try { storage.removeItem(STORAGE_KEY); persistent = true; return true; } catch (error) { persistent = false; onWarning('浏览器拒绝清除存储，请在浏览器设置中手动删除此站点数据。'); return false; } }
    };
  }
  function interpret(card, reversed, topic, position) {
    const meaning = reversed ? card.reversed : card.upright;
    return { ...meaning, topic: TOPICS[topic] || TOPICS.general, position: POSITIONS[position] || POSITIONS[0] };
  }
  const api = { STORAGE_KEY, TOPICS, POSITIONS, RATINGS, ACTIONS, localDate, isDate, randomInt, drawCards, makeRecord, validateRecord, parseBackup, createRepository, interpret };
  root.TarotCore = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
