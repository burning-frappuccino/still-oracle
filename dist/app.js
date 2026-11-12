(function () {
  'use strict';
  const C = window.TarotCore;
  const deck = window.TAROT_DECK;
  const $ = id => document.getElementById(id);
  let currentDate = C.localDate();
  let currentRecord = null;
  let selectedCard = 0;
  let drawing = false;
  let toastTimer;
  let storageWarning = '';
  let editorDirty = false;
  let draftTimer;
  let storage;
  try { storage = window.localStorage; } catch (error) { storage = { getItem() { throw error; } }; }
  const repo = C.createRepository(storage, deck, message => { storageWarning = message; toast(message, 9000); });
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function toast(text, duration = 4000) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, duration); }
  function announce(text) { $('live-status').textContent = text; }
  function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function formatDate(date) { return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(date + 'T12:00:00')); }
  function getCard(draw) { return deck.find(card => card.id === draw.id); }
  function renderDate() { $('date-label').textContent = formatDate(currentDate) + '  /  DAILY RITUAL'; }
  function renderSpread(reveal = true) {
    const spread = $('spread'); spread.replaceChildren();
    for (let i = 0; i < 3; i++) {
      const draw = currentRecord && currentRecord.cards[i];
      const card = draw && getCard(draw);
      const button = el('button', 'tarot-card' + (draw && reveal ? ' revealed' : ''));
      button.type = 'button'; button.dataset.index = i; button.disabled = !draw;
      button.setAttribute('aria-label', draw ? `${C.POSITIONS[i]}：${card.name}，${draw.reversed ? '逆位' : '正位'}，查看解读` : `${C.POSITIONS[i]}：待抽取的牌`);
      const back = el('span', 'card-back'); back.innerHTML = window.tarotCardBack(); back.setAttribute('aria-hidden', 'true'); button.append(back);
      if (draw) {
        const face = el('span', 'card-face');
        const art = el('span', 'card-art' + (draw.reversed ? ' reversed' : '')); art.innerHTML = window.tarotArtwork(card); art.setAttribute('aria-hidden', 'true');
        face.append(art, el('span', 'card-heading', card.arcana === 'major' ? String(card.rank).padStart(2, '0') : card.suit.toUpperCase()), el('span', 'card-title', card.name), el('span', 'card-subtitle', card.english.toUpperCase()));
        button.append(face, el('span', 'card-orientation', draw.reversed ? 'REVERSED · 逆位' : 'UPRIGHT · 正位'));
        button.addEventListener('click', () => { selectCard(i); $('reading-section').scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' }); });
      }
      spread.append(button);
    }
  }
  function renderForm() {
    const has = !!currentRecord;
    $('focus-fieldset').disabled = has || drawing;
    $('question').disabled = has || drawing;
    if (has) {
      document.querySelector(`input[name="topic"][value="${currentRecord.topic}"]`).checked = true;
      $('question').value = currentRecord.question;
    }
    $('draw-label').textContent = drawing ? '让思绪慢下来，正在翻牌…' : has ? '今日牌阵已封存 · 查看解读' : '静心，抽取今日三张';
    $('draw-button').disabled = drawing;
    $('daily-note').lastChild.textContent = storageWarning || (has ? '这组牌陪你度过今天。明日，再来看看。' : '每日一组，不为“好结果”反复重抽。');
    $('stage-caption').textContent = has ? '不必急着认同。先把它放回真实的生活里。' : '答案不在星辰里，在你接下来的行动里。';
    $('record-count').textContent = Object.keys(repo.read()).length;
  }
  function renderReading() {
    $('reading-section').hidden = !currentRecord;
    if (!currentRecord) return;
    $('reading-context').textContent = `${formatDate(currentRecord.date)} · ${C.TOPICS[currentRecord.topic].name}`;
    $('reading-question').hidden = !currentRecord.question;
    $('reading-question').textContent = currentRecord.question ? `今日提问：${currentRecord.question}` : '';
    const tabs = document.querySelector('.reading-tabs'); tabs.replaceChildren();
    currentRecord.cards.forEach((draw, index) => {
      const card = getCard(draw); const button = el('button', 'reading-tab', `${C.POSITIONS[index]} · ${card.name}`);
      button.type = 'button'; button.setAttribute('role', 'tab'); button.id = 'reading-tab-' + index;
      button.setAttribute('aria-controls', 'reading-detail'); button.setAttribute('aria-selected', String(index === selectedCard));
      button.tabIndex = index === selectedCard ? 0 : -1;
      button.addEventListener('click', () => selectCard(index));
      button.addEventListener('keydown', event => {
        let next;
        if (event.key === 'ArrowRight') next = (index + 1) % 3;
        if (event.key === 'ArrowLeft') next = (index + 2) % 3;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = 2;
        if (next !== undefined) { event.preventDefault(); selectCard(next); $('reading-tab-' + next).focus(); }
      });
      tabs.append(button);
    });
    renderDetail();
    for (const field of ['intention', 'reflection', 'match']) $(field).value = currentRecord[field];
    $('action-done').value = currentRecord.actionDone;
  }
  function renderDetail() {
    if (!currentRecord) return;
    const draw = currentRecord.cards[selectedCard]; const card = getCard(draw); const result = C.interpret(card, draw.reversed, currentRecord.topic, selectedCard);
    const detail = $('reading-detail'); detail.replaceChildren(); detail.setAttribute('aria-labelledby', 'reading-tab-' + selectedCard);
    const items = [
      ['meaning', `这张牌邀请你看见 · ${draw.reversed ? '逆位' : '正位'}`, result.meaning],
      ['risk', '别绕过这个盲点', result.risk],
      ['action', '今天，做一件具体的事', result.action],
      ['question', '不妨诚实地问问自己', result.question]
    ];
    items.forEach(([key, title, text], i) => { const block = el('div', 'reading-block ' + key); const heading = el('h3'); heading.append(el('span', '', '0' + (i + 1)), document.createTextNode(title)); block.append(heading, el('p', '', text)); if (key === 'action') block.append(el('p', 'topic-context', result.topic.action)); if (key === 'question') block.append(el('p', 'topic-context', result.topic.question)); detail.append(block); });
  }
  function selectCard(index) {
    selectedCard = index;
    document.querySelectorAll('.reading-tab').forEach((tab, i) => { tab.setAttribute('aria-selected', String(i === index)); tab.tabIndex = i === index ? 0 : -1; });
    renderDetail();
  }
  function refresh() {
    if (editorDirty && !flushDraft()) return;
    const nextDate = C.localDate();
    const changed = nextDate !== currentDate;
    currentDate = nextDate;
    currentRecord = repo.read()[currentDate] || null;
    if (changed) { $('question').value = ''; selectedCard = 0; announce('新的一天开始了，可以抽取今日牌阵。'); }
    renderDate(); renderForm(); renderSpread(); renderReading();
  }
  async function drawToday(event) {
    event.preventDefault();
    if (drawing) return;
    if (C.localDate() !== currentDate) refresh();
    if (currentRecord) { $('reading-section').scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth' }); return; }
    drawing = true; renderForm();
    const drawDate = currentDate;
    const topic = document.querySelector('input[name="topic"]:checked').value;
    const question = $('question').value;
    try {
      const commit = () => repo.read()[drawDate] || repo.add(C.makeRecord(deck, topic, question, drawDate));
      currentRecord = navigator.locks && navigator.locks.request ? await navigator.locks.request('still-oracle-daily-draw', commit) : commit();
      $('ritual-stage').classList.add('drawing'); announce('三张牌已经抽取并保存，正在翻牌。');
      await new Promise(resolve => setTimeout(resolve, reducedMotion ? 0 : 650));
      $('ritual-stage').classList.remove('drawing');
      renderSpread(false);
      const buttons = [...$('spread').querySelectorAll('.tarot-card')];
      for (let i = 0; i < 3; i++) {
        if (!reducedMotion) await new Promise(resolve => setTimeout(resolve, 260));
        buttons[i].classList.add('revealed');
      }
      selectedCard = 0; renderReading();
      announce('今日牌阵已封存。' + currentRecord.cards.map((draw, i) => C.POSITIONS[i] + '，' + getCard(draw).name + (draw.reversed ? '逆位' : '正位')).join('；'));
    } catch (error) { toast(error.message || '抽取失败，请重试。'); }
    finally { drawing = false; renderForm(); if (C.localDate() !== drawDate) refresh(); }
  }
  function persistEditor() {
    if (!currentRecord) return false;
    clearTimeout(draftTimer);
    if (C.localDate() !== currentDate) {
      // Save explicitly to the date the editor displayed; never attach yesterday's text to today.
      repo.update(currentRecord.date, { intention: $('intention').value, reflection: $('reflection').value, match: $('match').value, actionDone: $('action-done').value });
      editorDirty = false;
      refresh(); toast('已保存到原日期，新的一天可以重新抽牌。'); return false;
    }
    currentRecord = repo.update(currentRecord.date, { intention: $('intention').value, reflection: $('reflection').value, match: $('match').value, actionDone: $('action-done').value });
    editorDirty = false;
    return true;
  }
  function flushDraft() {
    if (!editorDirty || !currentRecord) return true;
    clearTimeout(draftTimer);
    try {
      currentRecord = repo.update(currentRecord.date, { intention: $('intention').value, reflection: $('reflection').value, match: $('match').value, actionDone: $('action-done').value });
      editorDirty = false;
      return true;
    } catch (error) {
      toast('草稿尚未保存，已保留在编辑框中。若其他标签页已删除记录，请先复制草稿。', 8000);
      return false;
    }
  }
  function renderJournal() {
    const list = $('journal-list'); list.replaceChildren();
    const records = Object.values(repo.read()).sort((a, b) => b.date.localeCompare(a.date));
    if (!records.length) { list.append(el('p', 'empty-journal', '还没有手记。\n从今天的一次诚实对话开始。')); return; }
    const matchNames = { unreviewed: '未回顾', specific: '有具体对应', partial: '部分对应', none: '没有对应' };
    records.forEach(record => {
      const article = el('article', 'history-item'); const top = el('div', 'history-top'); top.append(el('h3', '', formatDate(record.date)), el('span', 'history-tags', C.TOPICS[record.topic].name + ' · ' + matchNames[record.match]));
      article.append(top, el('div', 'history-cards', record.cards.map(draw => getCard(draw).name + (draw.reversed ? '（逆）' : '（正）')).join(' / ')));
      if (record.question) article.append(el('p', '', '提问：' + record.question));
      if (record.intention) article.append(el('p', '', '行动：' + record.intention));
      if (record.reflection) article.append(el('p', '', '回顾：' + record.reflection));
      const review = el('button', 'text-button', '补记 / 修改回顾 ↗'); review.type = 'button';
      review.addEventListener('click', () => { if (article.querySelector('form')) return; article.append(buildHistoryForm(record, matchNames)); review.hidden = true; });
      article.append(review); list.append(article);
    });
  }
  function buildHistoryForm(record, matchNames) {
    const form = el('form', 'history-review-form');
    const fields = {};
    const field = (label, key, multiline, options) => {
      const wrapper = el('label', '', label); const control = el(multiline ? 'textarea' : 'select');
      if (multiline) { control.maxLength = key === 'intention' ? 500 : 2000; control.rows = key === 'intention' ? 2 : 3; }
      else for (const [value, name] of Object.entries(options)) { const option = el('option', '', name); option.value = value; control.append(option); }
      control.value = record[key]; wrapper.append(control); form.append(wrapper); fields[key] = control;
    };
    field('我打算做的一件事', 'intention', true); field('牌意与现实的对应', 'match', false, { unreviewed: '尚未回顾', ...matchNames }); field('行动是否完成', 'actionDone', false, { unrecorded: '尚未记录', yes: '已完成', no: '未完成' }); field('晚间回顾（记录对应与不对应）', 'reflection', true);
    const save = el('button', 'secondary-button', '保存这一天'); save.type = 'submit'; form.append(save);
    form.addEventListener('submit', event => {
      event.preventDefault(); try {
        const updated = repo.update(record.date, Object.fromEntries(Object.entries(fields).map(([key, control]) => [key, control.value])));
        if (currentRecord && currentRecord.date === record.date) { currentRecord = updated; renderReading(); }
        renderJournal(); toast(repo.isPersistent() ? '这一天的手记已保存。' : storageWarning);
      } catch (error) { toast(error.message); }
    }); return form;
  }
  $('draw-form').addEventListener('submit', drawToday);
  ['input', 'change'].forEach(type => $('reflection-form').addEventListener(type, () => { editorDirty = true; clearTimeout(draftTimer); draftTimer = setTimeout(flushDraft, 500); }));
  window.addEventListener('pagehide', flushDraft);
  $('reflection-form').addEventListener('submit', event => { event.preventDefault(); try { if (persistEditor()) toast(repo.isPersistent() ? '今日手记已保存在此浏览器。' : storageWarning); } catch (error) { toast(error.message); } });
  $('journal-open').addEventListener('click', () => { flushDraft(); renderJournal(); $('journal-dialog').showModal(); });
  ['principles-open', 'limits-open'].forEach(id => $(id).addEventListener('click', () => $('principles-dialog').showModal()));
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } }));
  $('export-button').addEventListener('click', () => {
    const blob = new Blob([repo.export()], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = el('a'); a.href = url; a.download = `静观手记-${C.localDate()}.json`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('已开始导出，请妥善保存私人手记。');
  });
  $('import-file').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try { if (file.size > 12000000) throw new Error('备份文件过大（最多 12MB）'); const incoming = C.parseBackup(await file.text(), deck); const count = repo.merge(incoming); refresh(); renderJournal(); toast(repo.isPersistent() ? `已导入 ${count} 天记录，同日未覆盖。` : storageWarning); }
    catch (error) { toast(error instanceof SyntaxError ? '不是有效的 JSON 备份，数据未改动。' : error.message, 6000); }
    finally { event.target.value = ''; }
  });
  $('erase-button').addEventListener('click', () => {
    if (!window.confirm('确定清除此浏览器的全部塔罗手记？此操作无法撤销，请先导出备份。')) return;
    clearTimeout(draftTimer); editorDirty = false; const cleared = repo.clear(); currentRecord = null; $('question').value = ''; $('intention').value = ''; $('reflection').value = ''; selectedCard = 0; if (cleared) storageWarning = ''; refresh(); renderJournal(); toast(cleared ? '本地记录已清除。' : storageWarning);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushDraft(); else if (!drawing && C.localDate() !== currentDate) refresh(); });
  setInterval(() => { if (!drawing && C.localDate() !== currentDate) refresh(); }, 60000);
  window.addEventListener('storage', event => { if (event.key === C.STORAGE_KEY && !drawing) { refresh(); if ($('journal-dialog').open) renderJournal(); toast('已与此浏览器其他标签页的记录保持一致。'); } });
  refresh();
})();
