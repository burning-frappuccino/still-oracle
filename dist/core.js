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
  // These original symbolic lenses are composition rules, not factual predictions.
  const MAJOR_LENSES = [
    ['新方向与试探', '先做低成本试验，不把冲动当自由', '尝试'],
    ['资源与主动权', '确认手里真正能用的资源，不把说服当成果', '落实'],
    ['直觉与未知', '把感受和已核实的信息分开', '核实'],
    ['照顾与滋养', '先确认自己的基本需要，不用付出换认可', '恢复'],
    ['结构与边界', '区分合理规则与过度控制', '建立边界'],
    ['学习与既有方法', '检验规则的适用条件，不以权威代替证据', '检验方法'],
    ['选择与价值取舍', '说清真实需求，不为表面一致而答应', '作出选择'],
    ['方向与推进', '先检查方向和资源，再决定要不要加速', '聚焦推进'],
    ['耐心与内在力量', '温和不等于没有底线，疲惫也需要被承认', '稳定节奏'],
    ['独处与梳理', '保护专注，同时保留有帮助的联系', '留白梳理'],
    ['变化与可控范围', '不要把偶然顺逆当保证，只调整可控部分', '调整方案'],
    ['事实与责任', '主动寻找能推翻自己判断的证据', '核对事实'],
    ['暂停与换个角度', '给等待设期限，不用继续投入证明旧决定', '换个角度'],
    ['收尾与腾出空间', '只结束已经失效的部分，不把象征当灾祸', '小步收尾'],
    ['整合与可持续节奏', '允许必要取舍，不以极端补偿维持平衡', '微调节奏'],
    ['依赖与选择空间', '找出触发旧习惯的条件，不靠羞耻驱动改变', '调整环境'],
    ['假设与基础修正', '先检查真实裂缝，不把变化夸大成崩溃', '核查基础'],
    ['希望与恢复', '用可重复的小进展支撑希望，不等奇迹', '积累进展'],
    ['模糊信息与情绪', '保留不知道的空间，不替别人判断动机', '澄清未知'],
    ['清晰与表达', '承认成果，也注明仍未解决的难点', '呈现成果'],
    ['反馈与重新回应', '把责任改写成补救动作，不给整个人定罪', '回应反馈'],
    ['完成与整合', '明确足够好的交付标准，不无限打磨尾声', '完成交付']
  ];
  const SUIT_LENSES = {
    wands: { focus: '行动动力', guard: '先核对方向与精力，别把忙碌当进展', move: '试着行动', element: '行动' },
    cups: { focus: '感受与关系', guard: '说清感受和需求，不替别人下结论', move: '澄清感受', element: '感受' },
    swords: { focus: '想法与判断', guard: '区分事实、推测与担心，给判断找证据', move: '厘清判断', element: '判断' },
    pentacles: { focus: '资源与实际安排', guard: '核对时间、投入与可持续性，不透支基本需要', move: '落实一步', element: '落实' }
  };
  const RANK_LENSES = [null, '起步', '两难与协调', '合作', '稳定与停留', '摩擦与失落', '互助与过渡', '评估与选择', '练习与推进', '边界与积累', '负荷与收尾', '探索与学习', '速度与冲劲', '照顾与承接', '责任与统筹'];
  function spreadLens(card, reversed) {
    let lens;
    if (card.arcana === 'major') {
      const values = MAJOR_LENSES[card.rank] || [card.keywords.join('与'), '先用事实检验自己的理解', '小步检验'];
      lens = { focus: values[0], guard: values[1], move: values[2], element: '方向', major: true };
    } else {
      const suit = SUIT_LENSES[card.suit] || SUIT_LENSES.pentacles;
      lens = { ...suit, focus: suit.focus + '中的' + (RANK_LENSES[card.rank] || '调整'), major: false };
    }
    return { ...lens, reversed, name: `${card.name}（${reversed ? '逆位' : '正位'}）` };
  }
  function summarizeSpread(record, deck) {
    const valid = validateRecord(record, deck);
    if (!valid) throw new Error('无法解读不完整的三张牌阵');
    const cards = valid.cards.map(draw => deck.find(card => card.id === draw.id));
    const lenses = cards.map((card, i) => spreadLens(card, valid.cards[i].reversed));
    const [state, blind, action] = lenses;
    const topic = TOPICS[valid.topic];
    const relation = state.element === action.element
      ? `起点和行动牌都落在「${state.element}」这一层，今天不必另开战线，更值得把同一个问题做深、做实。`
      : `这组牌把「${state.focus}」引向「${action.focus}」：不是继续在原来的层面用力，而是换一个落点来回应当前处境。`;
    const stateLine = state.reversed
      ? `${state.name}作为当下状态，先邀请你检视「${state.focus}」有没有卡住或用力过度；这不是对今天好坏的判决。`
      : `${state.name}把今天的切入口放在「${state.focus}」；它提供一种可用的视角，但不保证事情自然顺利。`;
    const blindLine = blind.reversed
      ? `中间的${blind.name}提醒：被压住、拖延或走向极端的部分，可能让这个转向失效。`
      : `中间的${blind.name}即使正位，放在盲点位也要求你检查它的代价，而不只是认同它的优点。`;
    const actionLine = action.reversed
      ? `因此，${action.name}给出的方向是先缩小动作、校正方法，再验证「${action.focus}」，而不是一口气扭转局面。`
      : `因此，${action.name}适合被当作一次「${action.move}」的小实验，用实际结果检验前两张牌是否贴近现实。`;
    const frame = {
      general: '放回今天一件具体的小事里看：',
      study: '放回今天的一项学习或工作任务里看：',
      relationship: '放回一次真实的沟通里看，而不是推测对方内心：',
      self: '放回自己的状态与习惯里看，不用急着给自己定性：'
    }[valid.topic];
    const blindMeaning = valid.cards[1].reversed ? cards[1].reversed : cards[1].upright;
    const actionMeaning = valid.cards[2].reversed ? cards[2].reversed : cards[2].upright;
    return {
      title: `从「${state.focus}」到「${action.move}」`,
      narrative: `${frame}${stateLine}${relation}${blindLine}${actionLine}`,
      tension: `要让${state.name}所指的处境获得回应，先守住${blind.name}这一关：${blind.guard}。具体要留意：${blindMeaning.risk}`,
      priorityAction: actionMeaning.action,
      actionBridge: `把这一步用来回应「${state.focus}」，并把「${blind.guard}」作为执行边界；如果动作不适合现实，就缩小或调整，不必照牌硬做。`,
      topicAction: topic.action,
      checkpoint: `晚间核对：这一步是否真的帮助了「${state.focus}」？${blind.name}的风险有没有出现？请各记一条支持与不支持这份解读的事实。`,
      references: lenses.map((lens, i) => ({ position: POSITIONS[i], name: cards[i].name, reversed: lens.reversed, label: lens.name })),
      method: '综合解读由三张牌的位置、象征类别、正逆位及所选主题按固定规则组合；不是 AI 读心，也不是事实预测。'
    };
  }
  const api = { STORAGE_KEY, TOPICS, POSITIONS, RATINGS, ACTIONS, localDate, isDate, randomInt, drawCards, makeRecord, validateRecord, parseBackup, createRepository, interpret, summarizeSpread };
  root.TarotCore = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
