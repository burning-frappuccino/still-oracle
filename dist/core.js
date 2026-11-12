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
  // Short, original everyday-language readings. Full interpretations below stay unchanged.
  // Each row: upright state, reversed state, upright action heading, reversed action heading.
  const PLAIN_CARDS = {
    major: [
      ['想试点新东西，只是还没开始', '怕做不好而一直等，也可能还没准备好', '先试十分钟', '先确认风险再动手'],
      ['手里已有能用的东西，差的是动手做出来', '准备了不少，却把精力分得太散', '先做出一个小成果', '先少做一项准备'],
      ['察觉到一些细节，但还不能把猜测当事实', '想得太多，快分不清直觉和担心了', '先把事实和猜测分开', '先停一停，再问清楚'],
      ['正在照顾一件事，耐心比催结果更有用', '顾别人或顾成果太多，忘了自己的需要', '先整理一小块空间', '先少扛一件额外的事'],
      ['需要把事情安排清楚，不能每次都靠硬撑', '被太死的规矩卡住，也可能没人说清谁负责', '先定好完成标准', '先说清一件事谁负责'],
      ['需要一套靠谱的方法，也愿意向人学习', '发现旧方法不合适，想换一种做法', '先弄懂一个好方法', '先试一种不同做法'],
      ['面临一个选择，需要想清自己真正在乎什么', '和别人有分歧，却还没把各自需要说清楚', '先说清自己的选择', '先谈清一个分歧'],
      ['想把事情往前推，得先认准一个方向', '很用力却推不动，可能是方向或安排不合适', '先盯住一个目标', '先检查哪里卡住了'],
      ['有情绪，但仍能慢下来，把该做的事做好', '有点累，也可能正在对自己太苛刻', '先温和地坚持一步', '先把要求降低一点'],
      ['需要安静想想，不想再追着别人的评价跑', '独处太久，或一直被消息打断，没空想自己', '先留一点安静时间', '需要时就开口求助'],
      ['碰上了变化，正在找自己能做的调整', '反复遇到同一个麻烦，想知道哪里能改', '先改一件可控的事', '先查一个重复的问题'],
      ['需要按事实作决定，也得想清后果', '没听全信息，或觉得事情的标准不一致', '先把证据列出来', '先补上漏掉的信息'],
      ['忙了很久却没进展，需要停一下换个办法', '等得有点久，或舍不得付出改变的代价', '先换个角度看看', '先给等待定个期限'],
      ['知道某个旧习惯该结束，却还在舍不得', '想改变，但还没准备好放下原来的做法', '先停掉一个旧做法', '先放下一小部分'],
      ['需要把日子安排得稳一点，不必猛冲', '一会儿太拼一会儿全停，节奏让自己很累', '先把节奏调稳一点', '先减少一处消耗'],
      ['明知一个习惯不太好，却总被眼前的舒服拉走', '开始看清什么在拖住自己，想少受它影响', '先远离一个诱因', '先改掉一个诱人的设置'],
      ['发现原来相信的事不太稳，需要重新查一查', '知道有问题，却想先装作没事，或还在适应变化', '先核实一个重要假设', '先处理一个小问题'],
      ['想慢慢恢复信心，愿意做一点看得见的事', '信心不够，总觉得自己的进步不算数', '先记下一点小进展', '先找一件做得到的事'],
      ['信息不够，容易用担心填补不知道的部分', '快弄清楚一件事了，但还要防止过早下结论', '先问清一件不知道的事', '先核对自己的解释'],
      ['已有一点成果，可以承认它，不用只盯着缺点', '有进展却不满意，也可能只是暂时没精神', '先分享一个小成果', '先承认自己做成的事'],
      ['在回顾过去的决定，想把教训用在下一次', '不太想听反馈，或把自己批评得不敢重新开始', '先改一个旧问题', '先听完一条具体反馈'],
      ['一件事快做完了，需要收尾而不是再开新坑', '只差最后一点，却因为不够完美一直不肯交', '先完成一次交付', '先收好最后一个尾巴']
    ],
    wands: [
      ['有个新想法，值得先动手试一下', '有点想做，却被分心、担心或没精神拦住', '先试做最简单的版本', '先把想法缩小一点'],
      ['正在比较两个方向，还没决定先走哪条', '在几个选择间来回想，迟迟没迈出第一步', '先选一条小路试试', '先把一个选择查清楚'],
      ['已迈出第一步，接下来要看看实际反馈', '等不到想要的反馈，或计划比能做到的大', '先问一次实际反馈', '先改一个不合适的安排'],
      ['已有一点稳定，可以和人分享阶段成果', '看着都挺好，却有一件小事还没谈妥', '先确认一个小成果', '先谈清没说开的事'],
      ['和人有不同意见，需要分清是在讨论还是争输赢', '想避开争执，却可能把真正的问题也搁下了', '先说清一个分歧', '先把一个问题摆出来'],
      ['做出的努力被看见了，可以承认自己的进步', '有点在意别人怎么看，容易忘了自己的目标', '先记下真实的进步', '先别拿自己和别人比'],
      ['需要守住自己的想法，但不必每次都反击', '为了顶住压力很累，得分清什么值得坚持', '先守住一个重要底线', '先放下不值得的争论'],
      ['事情推进得快，需要及时确认信息有没有跟上', '感觉很赶却不顺，可能漏了信息或顺序', '先确认一条关键信息', '先慢下来理清顺序'],
      ['经历过挫折，想保护自己，也还没有放弃', '有点撑不住，却觉得停下来就等于失败', '先留一点备用精力', '先休息，再决定要不要继续'],
      ['手上的事太多，靠自己全扛有点吃力', '想卸下一点责任，却还没说清怎么分', '先分出去一件事', '先删掉一件非必要的事'],
      ['对新东西有兴趣，想一边学一边试', '想法不少，却一受挫就想换一个', '先学会一个小技巧', '先做完一件最小的事'],
      ['很想快点推进，得留意有没有漏看细节', '一着急就冲动做决定，或突然又不想做了', '先给冲劲定个方向', '先等十分钟再决定'],
      ['愿意主动表达，也想带着别人一起做事', '有点依赖别人的认可，或把自己安排得太满', '先说出一个真实想法', '先给自己留点余地'],
      ['想把一件大事带起来，需要把方向讲清楚', '急着让事情按自己想的走，可能没听见别人', '先讲清目标和分工', '先听完一个不同意见']
    ],
    cups: [
      ['有新的感受或靠近人的愿望，可以慢慢表达', '情绪有点满，也可能把需要憋在了心里', '先说出一个感受', '先给情绪留一点时间'],
      ['想和一个人更好地合作，需要把话说清楚', '觉得有点不对等，或双方期待没有对上', '先确认彼此的需要', '先谈清一件不对等的事'],
      ['需要一点陪伴，也能从朋友那里得到支持', '有些社交让自己累，或担心被排除在外', '先联系一个舒服的人', '先拒绝一次勉强的社交'],
      ['有点提不起兴趣，需要看看自己究竟缺什么', '开始愿意试点新东西，但不必一下答应太多', '先留意一个被忽略的选择', '先接住一个小机会'],
      ['对一件事失望了，暂时更容易看见失去的部分', '愿意慢慢放下失望，但不用催自己马上振作', '先承认一件难过的事', '先找回一点日常生活'],
      ['想起熟悉的人和事，也许是在怀念那种安心', '有点被过去牵住，难免把从前想得太好', '先留住一个有用的旧经验', '先把过去和今天分开'],
      ['选择太多，想象很热闹，却不确定哪个能做', '开始分清什么只是想象，什么真的做得到', '先核实一个选项', '先留下一个能做的选择'],
      ['觉得一件事不再适合自己，想离开又舍不得', '拿不准该继续还是离开，需要更具体的理由', '先说清为什么要离开', '先定好继续的条件'],
      ['有些需要已经被满足，可以好好感受一下', '看着得到不少，心里却可能还缺点什么', '先享受一件小满足', '先问清自己真正想要什么'],
      ['重视相处舒服，也愿意维护身边的支持', '想维持表面和气，却可能把不舒服藏起来', '先感谢一份真实支持', '先谈一个不舒服的小问题'],
      ['愿意听听自己的感受，也对别人保留好奇', '有点敏感，容易把一句话想成很多层意思', '先用一句话说清感受', '先问清楚，别急着猜'],
      ['想把心意表达出来，得让行动跟得上好听的话', '容易被美好的想象带走，或不敢兑现承诺', '先兑现一个小承诺', '先核对承诺能不能做到'],
      ['能照顾别人的感受，也需要听见自己的需要', '太容易接住别人的情绪，自己的心情反而没处放', '先留一点时间给自己', '先放下一件不属于你的情绪'],
      ['有情绪时仍能把话说清楚，也愿意听人说完', '把情绪憋得太久，或用冷静的样子盖住不舒服', '先平静地说清一件事', '先承认自己的真实感受']
    ],
    swords: [
      ['想把一件事弄清楚，适合先找事实再下结论', '思路有点乱，或结论已经跑在证据前面', '先核对一个重要说法', '先把问题说得更具体'],
      ['夹在两个选择中，暂时不想面对取舍', '拖了很久的选择需要面对，但别急着随便选', '先补一条缺少的信息', '先列清两个选择的代价'],
      ['因为一件事难过，需要分清发生了什么和自己的解释', '想从难过里缓过来，却可能还在假装没事', '先把事实和感受写开', '先给难过找个出口'],
      ['需要歇一歇，继续硬推反而可能更累', '休息时仍停不下担心，或等太久还没重新开始', '先认真休息一小段', '先用一个小动作重新开始'],
      ['很想赢下一场争论，但赢了也可能伤了关系', '想结束争执，需要分清道歉、让步和继续争', '先想清争赢的代价', '先停掉一场无用的争执'],
      ['想离开一种消耗，需要慢慢换到更合适的做法', '想往前走，却还被没处理完的旧问题拉住', '先迈出一小步过渡', '先处理一件拖住你的旧事'],
      ['想用更灵活的办法解决问题，但别省掉该说清的事', '有件事藏着没说，或正在担心事情被发现', '先说清一个关键事实', '先补上一个没说清的地方'],
      ['觉得自己没得选，但可能还有一件小事能改', '开始发现自己没那么被动，手里还有能改的事', '先改一件你做得到的事', '先验证一个新的选择'],
      ['担心一件事，脑中反复排演最坏的结果', '压力有点松动，也可能只是把困扰藏了起来', '先把担心写成可做的一步', '需要支持就说具体一点'],
      ['发现一种做法已经不管用，需要停掉它而不是否定自己', '最难的部分也许在过去，但旧做法仍需要改变', '先停止一个失效的做法', '先给恢复定一个小目标'],
      ['想多问多学，适合先查清楚再表达', '被零碎消息弄得更疑惑，需要减少一点干扰', '先找到一个原始出处', '先暂停一个让你分心的消息源'],
      ['想直接解决问题，得确认自己真的听懂了', '急着推进，反而可能把目标和顺序弄乱', '先复述清楚再回复', '先慢两分钟核对事实'],
      ['想把界限说清楚，也愿意按事实作判断', '旧经历让自己有点防备，容易先把别人想坏', '先明确拒绝一个不合适的请求', '先用事实代替一句绝对判断'],
      ['需要讲清判断的理由，而不是只宣布结论', '可能只在找支持自己的证据，漏看了反例', '先列出决定的证据', '先查一条反对自己的证据']
    ],
    pentacles: [
      ['有个目标能开始落实，先准备一段时间和材料', '想开始却觉得条件不够，需要看看究竟缺什么', '先做出第一份成果', '先补一个最基本的缺口'],
      ['要同时顾几件事，需要排好先后，也留点空档', '事情答应得太多，每一件都顾得有点吃力', '先给三件事排个顺序', '先取消一件非关键的事'],
      ['需要和人一起把事情做好，分工和反馈都很重要', '合作卡在标准不一或互相等待，还没说清下一步', '先请人检查一个具体问题', '先说清谁做哪一步'],
      ['想守住时间和手里的东西，不太敢松手', '想放松一点控制，又担心一松手就失去分寸', '先腾出一项闲置占用', '先给可用的时间定个范围'],
      ['时间、精力或支持有点紧，需要真实的帮助', '看到一点好转，但还得确认缺口补上了没有', '先问一个实际的支持渠道', '先确认已有帮助能做什么'],
      ['正在帮助别人或接受帮助，需要把条件说清楚', '付出和接受有点不对等，也许不好意思拒绝', '先问清帮助有没有条件', '先说清一项付出的限度'],
      ['投入了不少，需要耐心，也需要看看实际进展', '等得焦躁，拿不准该继续还是该换办法', '先对照标准看一次进度', '先写清继续和停止的条件'],
      ['正在练习一项本事，改好一个弱点比练很多更重要', '练得不少却没测试，或怕做不好而不肯开始', '先练二十分钟，只改一点', '先做一次小测看看问题'],
      ['已有一些靠积累得到的本事，可以承认它', '为了显得过得好或很独立，把自己弄得太累', '先给已有本事留点维护时间', '先少做一件撑场面的事'],
      ['想让生活更稳，也在考虑长期的安排', '长期的约定不太合适，需要随着人的需要更新', '先整理一份可复用的记录', '先更新一项旧约定'],
      ['想学点真正会用的东西，需要独立做一遍', '资料攒了不少，却很少把最基础的一页练会', '先独立完成一道基础题', '先只留一份材料练十五分钟'],
      ['愿意踏实做事，也需要看看老方法是否还管用', '重复的事做得厌烦，或一直认真准备却迟迟不交', '先按约完成一项小任务', '先删掉一个无效步骤'],
      ['想把别人照顾好，也需要给自己的生活留位置', '顾着别人或外表，却没顾上自己的精力', '先改善一项日常小安排', '先照顾一个最基本的需要'],
      ['想把事情管得稳，需要看清真正能维持的条件', '太想保持稳妥，可能把控制和担忧放在了首位', '先核对一项长期安排', '先减少一处过度控制']
    ]
  };
  const PLAIN_REPHRASES = {
    '把自我价值绑在照顾别人或产出多少上。': '别因为照顾了多少人、做了多少事，才觉得自己有价值。',
    '压住情绪直到突然爆发，或把暂时做不到看作人格失败。': '别把情绪憋到爆发，也别因为暂时做不到就全盘否定自己。',
    '把隔离误认成独立，或用不停社交回避内心的问题。': '别把自己关太久，也别靠不停聊天躲开自己的问题。',
    '靠补偿式休息或加倍努力，维持不可持续的循环。': '别靠拼命干、再拼命补觉来撑，先把每天的事减一点。',
    '空想理想未来，忽略今天的资源限制；乐观也需要现实支持。': '可以有期待，但先看今天有多少时间和精力，别只想不做。',
    '热情不等于可执行，别一开始就承诺过大的规模。': '别只凭一时热情就答应太多，先看看今天能做多少。',
    '处处防御，把建设性意见也当成攻击。': '别把所有意见都当成攻击，先听听有没有能帮到你的。',
    '把过去的挫折投射到所有新情境，一直绷紧防线。': '别因为以前受过挫，就觉得每件新事都会重演。',
    '靠硬撑维持进度，直到连基本判断都受影响。': '别一直硬撑，累到连事情都想不清楚。',
    '把忙碌当价值证明，拒绝分担使效率与关系一起受损。': '别把忙当成有用，扛不住的事要让别人分担。',
    '没有沟通就退出，或继续用“快做完了”拖延求助。': '要退出先说清楚；需要帮忙就开口，别再用快做完了硬撑。',
    '把享受当成麻醉，或以外在体面掩盖没被照顾的需求。': '别只靠玩乐把难受压下去，先看看自己到底需要什么。',
    '过度相信逻辑上的漂亮解释，忽略信息缺口与他人的处境。': '一个解释听着有道理，也可能漏了事实，先查清楚。',
    '把不决定当作没有代价，问题却在后台持续累积。': '一直不选也有代价，别当作问题会自己消失。',
    '把长期超载包装成灵活，日程看着满却没有缓冲。': '别把忙不过来当成能干，日程里要留点空闲。',
    '抓得太紧会压缩生活与合作空间，控制并不自动带来安全。': '别什么都攥得太紧，控制得多不一定更安心。',
    '把困难视作个人价值的证明，羞于询问已经存在的支持。': '遇到困难不代表你差，可以开口问有没有人能帮忙。',
    '机械重复而不纠错，或以打磨细节回避更重要的交付。': '别只顾重复和修细节，该改错、该做完的事也要面对。',
    '把体面与自给自足变成压力，不许自己依赖任何人。': '不用一直证明自己过得好或不需要人，必要时可以接受帮助。',
    '给新想法做一个十分钟原型，只验证最核心的部分。': '花十分钟，把新想法做个最简单的版本，看看能不能行。',
    '列出当前责任，推迟、删去或委托其中一项。': '列出手上的事，选一件推迟、不做，或分给别人做。',
    '列出一个真实风险和一个可逆试验；先补前者，再做后者。': '写下一个真实风险，先补好准备，再小范围试一次。',
    '用现有资源完成一个可展示的小成果，而不是再添一种工具。': '用手边已有的东西，做出一个能给人看的小成果。',
    '把一项要求降低到可持续程度，向可信的人提出一个具体请求。': '把要求降低一点，并向可信的人说清需要他帮什么。'
  };
  function plainSpread(valid, cards) {
    const first = cards[0];
    const last = cards[2];
    const firstCopy = PLAIN_CARDS[first.suit][first.arcana === 'major' ? first.rank : first.rank - 1];
    const lastCopy = PLAIN_CARDS[last.suit][last.arcana === 'major' ? last.rank : last.rank - 1];
    const blindMeaning = valid.cards[1].reversed ? cards[1].reversed : cards[1].upright;
    const actionMeaning = valid.cards[2].reversed ? last.reversed : last.upright;
    const title = lastCopy[valid.cards[2].reversed ? 3 : 2];
    const everyday = text => PLAIN_REPHRASES[text] || text.replace(/可逆试验/g, '能随时停下的小尝试').replace(/可持续/g, '能长期坚持的').replace(/隐含期待/g, '没说出的期待').replace(/形象性负担/g, '为了撑场面多做的事').replace(/定向练习/g, '针对一个问题的练习').replace(/资源缺口/g, '缺少的条件').replace(/反复排演/g, '反复想最坏结果').replace(/交付物/g, '要做完的东西');
    const when = { general: '今天', study: '做任务时', relationship: '和人沟通时', self: '照顾自己时' }[valid.topic];
    return {
      title,
      now: `你可能${firstCopy[valid.cards[0].reversed ? 1 : 0]}。`,
      caution: everyday(blindMeaning.risk),
      action: everyday(actionMeaning.action),
      link: `${when}，先认清现状、避开提醒里的坑，再${title.replace(/^先/, '')}。`
    };
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
      method: '综合解读由三张牌的位置、象征类别、正逆位及所选主题按固定规则组合；不是 AI 读心，也不是事实预测。',
      plain: plainSpread(valid, cards)
    };
  }
  const api = { STORAGE_KEY, TOPICS, POSITIONS, RATINGS, ACTIONS, localDate, isDate, randomInt, drawCards, makeRecord, validateRecord, parseBackup, createRepository, interpret, summarizeSpread };
  root.TarotCore = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
