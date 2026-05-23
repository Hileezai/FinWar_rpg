const $ = (s) => document.querySelector(s);
let token = localStorage.token || '';
let meta = null;
let me = null;
let pendingItem = null;
let page = 'home';
let socket = null;
let chatChannel = localStorage.chatChannel || 'global';
let chatMessages = { global: [], guild: [] };
let chatStatus = { guild: '' };
const FALLBACK_DUNGEON_MAX_FLOOR = 100;
const FALLBACK_EQUIPMENT_LEVEL_CAP = 100;

const names = {
  home: '角色',
  training: '練功場',
  dungeon: '地下城',
  boss: '世界BOSS',
  arena: 'PK競技場',
  guild: '公會/攻城',
  daily: '每日任務',
  shop: '道具商店',
  forge: '強化附魔',
  rank: '排行榜',
  catalog: '裝備圖鑑'
};

const navIcons = {
  home: 'assets/images/ui/character.png',
  training: 'assets/images/ui/battle.png',
  dungeon: 'assets/images/ui/dungeon.png',
  boss: 'assets/images/ui/rank.png',
  arena: 'assets/images/ui/battle.png',
  guild: 'assets/images/ui/guild.png',
  daily: 'assets/images/ui/quest.png',
  shop: 'assets/images/ui/shop.png',
  forge: 'assets/images/ui/settings.png',
  rank: 'assets/images/ui/rank.png',
  catalog: 'assets/images/ui/bag.png'
};

function eqObj(v) {
  return typeof v === 'string' ? JSON.parse(v || '{}') : (v || {});
}
function bossHp(state) {
  return { hp: state.hp, max: state.maxHp || state.maxhp || state.max_hp || 1, killed: !!state.killed };
}
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
function img(src, cls = 'pixel-img', alt = '') {
  if (!src) return '';
  return `<img class="${cls}" src="${src}" alt="${esc(alt)}">`;
}
function localSlotAsset(it) {
  const n8 = String((((Number(it?.level || 1) + String(it?.name || '').length) % 8) + 1)).padStart(2, '0');
  const n16 = String((((Number(it?.level || 1) + String(it?.name || '').length) % 16) + 1)).padStart(2, '0');
  if (it?.slot === '頭') return `assets/images/equipment/heads/head_${n8}.png`;
  if (it?.slot === '衣服') return `assets/images/equipment/clothes/clothes_${n8}.png`;
  if (it?.slot === '褲子') return `assets/images/equipment/pants/pants_${n8}.png`;
  if (it?.slot === '鞋子') return `assets/images/equipment/shoes/shoes_${n8}.png`;
  if (it?.slot === '武器' || it?.slot === '副武器') return `assets/images/equipment/weapons/weapon_${n16}.png`;
  if (it?.slot?.includes('飾品')) return `assets/images/equipment/accessories/accessory_${n8}.png`;
  return 'assets/images/equipment/clothes/clothes_01.png';
}
function itemImage(it) {
  if (!it) return 'assets/images/equipment/clothes/clothes_01.png';
  if (it?.image) return it.image;
  return localSlotAsset(it);
}
function shopImage(item) {
  return item[5] || 'assets/images/items/coin_bag.png';
}
function skillPills(c) {
  const skills = c.skills || [{ name: c.skill, type: c.role, desc: c.desc }];
  return `<div class="skills">${skills.map(s => `<span class="pill" title="${esc(s.desc)}">${esc(s.name)}｜${esc(s.type)}</span>`).join('')}</div>`;
}
function monsterForFloor(floor) {
  return (meta.dungeonMonsters || []).find(m => floor >= m.min && floor <= m.max) || (meta.dungeonMonsters || [])[0];
}
function pageIcon(name) {
  return img(navIcons[name], 'nav-icon', names[name]);
}

async function api(url, opts = {}) {
  const r = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(opts.headers || {})
    }
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(j.error || '系統錯誤');
  return j;
}
async function boot() {
  meta = await api('/api/meta');
  if (token) {
    try {
      me = await api('/api/me');
      connectSocket();
    } catch {
      token = '';
      localStorage.removeItem('token');
    }
  }
  render();
}
function connectSocket() {
  if (!token || socket) return;
  socket = io({ auth: { token } });
  socket.on('connect', () => socket.emit('joinChat'));
  socket.on('battleLog', d => addRealtimeLog(d.text));
  socket.on('bossUpdate', d => {
    addRealtimeLog(d.text);
    if (page === 'boss') loadBoss();
  });
  socket.on('actionResult', d => {
    if (d?.error) alert(d.error);
    else if (d?.text) {
      pendingItem = d.item || null;
      modal(d.text + (d.item ? `<hr>${compareItemHtml(d.item)}` : ''));
    }
    refresh();
  });
  socket.on('chatStatus', d => { chatStatus = d || { guild: '' }; renderChatBox(); });
  socket.on('chatHistory', d => {
    if (!d?.channel) return;
    chatMessages[d.channel] = d.messages || [];
    renderChatBox();
  });
  socket.on('chatMessage', msg => {
    const ch = msg?.channel === 'guild' ? 'guild' : 'global';
    chatMessages[ch] = [...(chatMessages[ch] || []), msg].slice(-80);
    renderChatBox(true);
  });
  socket.on('chatError', d => { addChatSystem(d?.message || '聊天室錯誤'); });
}
function addRealtimeLog(text) {
  const box = document.querySelector('#realtimeLog');
  if (box && text) box.innerHTML = `<p>${new Date().toLocaleTimeString()}｜${text}</p>` + box.innerHTML;
}
function layout(content) {
  const p = me?.player;
  const s = me?.stats;
  const expNeed = p ? p.level * 120 : 1;
  const header = token ? `<div class="panel hero-bar">
    <div>${img(meta.classes[p.classKey].image, 'avatar-sm', meta.classes[p.classKey].name)}</div>
    <div class="hero-stats"><b>${esc(me.user.username)}</b>｜${esc(meta.classes[p.classKey].name)} Lv.${p.level}｜EXP ${p.exp}/${expNeed}｜金幣 ${p.gold}｜碎片 ${p.bossFragments}
      <div class="bar"><i style="width:${Math.max(0, p.hp / s.hpMax * 100)}%"></i></div><span class="small">HP ${p.hp}/${s.hpMax}</span>
      <div class="bar exp"><i style="width:${Math.max(0, Math.min(100, p.exp / expNeed * 100))}%"></i></div><span class="small">EXP ${p.exp}/${expNeed}</span>
      <div class="bar stam"><i style="width:${p.stamina / 2}%"></i></div><span class="small">疲勞 ${p.stamina}/200，每小時 +25</span>
    </div>
  </div>
  <div class="nav">${Object.keys(names).map(x => `<button onclick="go('${x}')" class="${page === x ? 'active' : ''}">${pageIcon(x)}${names[x]}</button>`).join('')}<button onclick="logout()">登出</button></div>` : '';
  const main = `<div class="wrap"><div class="title">🌳 巨樹王國：Kingdom of Giant Tree Online</div>${header}${content}<div class="footer">金融故事像素風格網頁RPG</div></div>`;
  return token ? `<div class="game-shell"><main class="main-pane">${main}</main>${chatSidebar()}</div>` : main;
}
function authView() {
  const cls = Object.entries(meta.classes).map(([k, c]) => `<option value="${k}">${esc(c.name)}｜${esc(c.role)}</option>`).join('');
  return layout(`<div class="grid"><div class="card"><h2>登入</h2><input id="lu" placeholder="帳號"><input id="lp" type="password" placeholder="密碼"><button onclick="login()">登入</button></div><div class="card"><h2>註冊冒險者</h2><input id="ru" placeholder="帳號 3-18 英數"><input id="rp" type="password" placeholder="密碼至少 8 字"><select id="rc">${cls}</select><button onclick="register()">建立角色</button><p class="small">密碼以 bcrypt 雜湊儲存，登入後以 JWT 驗證。</p></div></div><div class="grid">${Object.entries(meta.classes).map(([k, c]) => `<div class="card class-card">${img(c.image, 'sprite-img', c.name)}<h3>${esc(c.name)}</h3><p>${esc(c.role)}</p><p>${esc(c.desc)}</p>${skillPills(c)}</div>`).join('')}</div>`);
}
async function refresh() {
  if (token) me = await api('/api/me');
  render();
}
function render() {
  if (!token) {
    $('#app').innerHTML = authView();
    return;
  }
  const p = me.player;
  const s = me.stats;
  const eq = eqObj(p.equipment);
  let c = '';
  if (page === 'home') {
    const cls = meta.classes[p.classKey];
    c = `<div class="grid"><div class="card class-card">${img(cls.image, 'sprite-img big', cls.name)}<h2>${esc(cls.name)}</h2><p>${esc(cls.desc)}</p><p>Lv.${p.level}｜EXP ${p.exp}/${p.level * 120}</p><p>ATK ${s.atk}｜DEF ${s.def}｜FOCUS ${s.focus}</p>${skillPills(cls)}<button onclick="rest()">休息恢復 HP</button></div><div class="card"><h3>裝備</h3><div class="equip">${Object.entries(eq).map(([slot, it]) => `<div class="panel equip-card">${img(itemImage(it), 'item-icon', it.name)}<div><b>${esc(slot)}</b><br><span class="rarity-${it.rarity}">${esc(it.name)}</span><br>攻${it.atk} 防${it.def} 專${it.focus}<br>+${it.enhance}｜${esc(it.enchant)}｜${esc(it.spec)}</div></div>`).join('')}</div></div></div><div class="card"><h3>近期戰鬥紀錄</h3><div class="log">${me.logs.map(l => `<p>${new Date(Number(l.createdat || l.createdAt)).toLocaleString()}｜${l.text}</p>`).join('')}</div></div>`;
  }
  if (page === 'training') {
    c = `<div class="card scene-card">${img('assets/images/scenes/grassland.png', 'scene-img', '練功場')}<div><h2>練功場：逾放怨靈沙洲</h2><p>練功只給經驗，不掉裝備。每次消耗疲勞 10，會跳出 3～5 句戰鬥敘述，包含技能、傷害、反擊與獎勵。</p>${img('assets/images/monsters/f01_skeleton.png', 'enemy-preview', '逾放怨靈')}<button onclick="act('/api/training')">進入小視窗戰鬥</button></div></div>`;
  }
  if (page === 'dungeon') {
    const saved = eqObj(p.dungeonSave).floor || 1;
    const maxFloor = meta.dungeonMaxFloor || FALLBACK_DUNGEON_MAX_FLOOR;
    const preview = monsterForFloor(Math.min(saved, maxFloor));
    c = `<div class="card scene-card">${img('assets/images/scenes/cave.png', 'scene-img', '地下城')}<div><h2>地下城 ${maxFloor} 層：金融迷宮</h2><p>每次消耗疲勞 18。V1.4 已改為深層難度曲線，敵方 HP、防禦與反擊會隨層數有感提升。</p><label>挑戰層數</label><input id="floor" type="number" min="1" max="${maxFloor}" value="${Math.min(saved, maxFloor)}"><div>${img(preview?.image, 'enemy-preview', preview?.name)}<span class="pill">目前預覽：${esc(preview?.name || '')}</span></div><button onclick="dungeon()">挑戰/讀取存檔層數</button><details><summary>查看 ${maxFloor} 層故事</summary><div class="small storybox">${story(maxFloor)}</div></details></div></div>`;
  }
  if (page === 'boss') {
    c = `<div class="card"><h2>世界 BOSS</h2><div id="bossbox">讀取中...</div><button class="primary-action" onclick="bossAtk()">${pageIcon('arena')}討伐世界 BOSS，消耗疲勞 25</button><div class="log" id="realtimeLog"></div><button onclick="craftBoss()">30 碎片合成 BOSS 裝備</button></div>`;
  }
  if (page === 'arena') {
    c = `<div class="card scene-card">${img('assets/images/scenes/prison.png', 'scene-img', '競技場')}<div><h2>玩家對戰競技場</h2><p>自動匹配其他玩家資料。每次消耗疲勞 15，勝敗依攻防專注、技能與亂數判定；對戰結果會同步寫入雙方近期戰鬥紀錄。</p><button class="primary-action" onclick="arenaFight()">${pageIcon('arena')}尋找對手開戰</button><div class="log" id="realtimeLog"></div></div></div>`;
  }
  if (page === 'guild') {
    c = `<div class="card scene-card">${img('assets/images/scenes/castle.png', 'scene-img', '公會城鎮')}<div><h2>公會與攻城戰</h2><input id="guild" placeholder="公會名稱" value="${esc(p.guild || '')}"><button onclick="joinGuild()">加入/創立公會</button><p>攻城戰每日可多次參與但每次消耗疲勞 30，目標為金控王城清算門。</p><button onclick="act('/api/guild-war')">參與攻城戰</button></div></div>`;
  }
  if (page === 'daily') {
    c = `<div class="card"><h2>每日任務：台灣銀行業知識問答</h2><p>每日可進行一次，一天五題。題庫包含公平待客、洗錢防制、資訊安全社交工程防護、金融業法遵與市場風險概念。答對越多，EXP 與金幣越多。</p><div id="dailybox">讀取中...</div></div>`;
  }
  if (page === 'shop') {
    c = `<div class="grid">${meta.shop.map(it => `<div class="card shop-card">${img(shopImage(it), 'item-icon-lg', it[0])}<h3>${esc(it[0])}</h3><p>${esc(it[3])}</p><p>價格 ${it[2]}｜每日上限 ${it[4]}</p><button onclick="buy('${it[1]}')">購買</button></div>`).join('')}</div>`;
  }
  if (page === 'forge') {
    c = `<div class="card scene-card">${img('assets/images/scenes/volcano.png', 'scene-img', '鍛造區')}<div><h2>強化、附魔、特化區</h2><select id="slot">${Object.keys(eq).map(s => `<option>${esc(s)}</option>`).join('')}</select><button onclick="forge('enhance')">強化</button><button onclick="forge('enchant')">附魔</button><select id="spec"><option>攻擊特化</option><option>防禦特化</option><option>專注特化</option></select><button onclick="forge('specialize')">特化</button><p class="small">強化提高裝備係數，附魔提供金融主題詞綴，特化讓裝備偏攻擊/防禦/專注。</p></div></div>`;
  }
  if (page === 'rank') {
    c = `<div class="card"><h2>排行榜</h2><div id="ranks">讀取中...</div></div>`;
  }
  if (page === 'catalog') {
    const cap = meta.equipmentLevelCap || FALLBACK_EQUIPMENT_LEVEL_CAP;
    c = `<div class="card"><h2>裝備圖鑑</h2><p>伺服器已內建 6 職業 x 8 部位 x ${cap} 件職業裝備，並新增更多稀有級別。下方展示你職業的 ${cap} 件武器。</p><div id="catalog">讀取中...</div></div>`;
  }
  $('#app').innerHTML = layout(c);
  renderChatBox();
  if (page === 'boss') loadBoss();
  if (page === 'rank') loadRanks();
  if (page === 'catalog') loadCatalog();
  if (page === 'daily') loadDailyQuiz();
}
function story(maxFloor = FALLBACK_DUNGEON_MAX_FLOOR) {
  const scenes = ['金庫荒廢區調查異常提款', 'ATM墓園掃蕩卡片怨靈', '利率鐘塔校準殖利率齒輪', '法遵圖書館封印裁罰卷宗', '董事會深淵對抗黑箱決策', '壓力測試迴廊承受極端情境', '資安防火牆塔追捕異常封包', '洗防暗河追蹤分層金流', '市場閃崩橋修復斷裂K線', '百層清算門面對監理魔王'];
  return Array.from({ length: maxFloor }, (_, i) => `第${i + 1}層：${scenes[i % scenes.length]}。`).join('<br>');
}
async function login() {
  try {
    const j = await api('/api/login', { method: 'POST', body: JSON.stringify({ username: lu.value, password: lp.value }) });
    token = j.token;
    localStorage.token = token;
    connectSocket();
    await refresh();
  } catch (e) { alert(e.message); }
}
async function register() {
  try {
    const j = await api('/api/register', { method: 'POST', body: JSON.stringify({ username: ru.value, password: rp.value, classKey: rc.value }) });
    token = j.token;
    localStorage.token = token;
    connectSocket();
    await refresh();
  } catch (e) { alert(e.message); }
}
function logout() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  localStorage.removeItem('token');
  token = '';
  me = null;
  render();
}
function go(x) {
  page = x;
  render();
}
async function rest() {
  await toast(await api('/api/rest', { method: 'POST' }));
}
async function act(url) {
  try {
    const j = await api(url, { method: 'POST' });
    modal(j.text || j.message);
    await refresh();
  } catch (e) { alert(e.message); }
}
async function dungeon() {
  try {
    const j = await api('/api/dungeon', { method: 'POST', body: JSON.stringify({ floor: floor.value }) });
    pendingItem = j.item || null;
    const extra = j.item ? `<hr><h3>獲得裝備，請比較後選擇</h3>${compareItemHtml(j.item)}` : '';
    modal(j.text + extra);
    await refresh();
  } catch (e) { alert(e.message); }
}
function itemScore(it) {
  if (!it) return 0;
  return Number(it.atk || 0) * 1.2 + Number(it.def || 0) + Number(it.focus || 0) * 0.9 + Number(it.enhance || 0) * 6;
}
function statDiff(newIt, oldIt, key) {
  const diff = Number(newIt?.[key] || 0) - Number(oldIt?.[key] || 0);
  const label = key === 'atk' ? '攻' : key === 'def' ? '防' : '專';
  const cls = diff > 0 ? 'ok' : diff < 0 ? 'danger' : 'small';
  return `<span class="${cls}">${label}${newIt?.[key] || 0}（${diff >= 0 ? '+' : ''}${diff}）</span>`;
}
function itemHtml(it, title = '') {
  if (!it) return `<div class="loot-card muted"><p>${esc(title || '空裝備欄')}</p></div>`;
  return `<div class="loot-card">${img(itemImage(it), 'item-icon-lg', it.name)}<p>${title ? `<b>${esc(title)}</b><br>` : ''}<span class="rarity-${it.rarity}">${esc(it.name)}</span><br>${esc(it.slot)}｜${esc(it.rarity)}｜攻${it.atk} 防${it.def} 專${it.focus}<br>+${it.enhance || 0}｜${esc(it.enchant || '未附魔')}｜${esc(it.spec || '未特化')}</p></div>`;
}
function compareItemHtml(newIt) {
  const current = eqObj(me?.player?.equipment)[newIt.slot];
  const delta = itemScore(newIt) - itemScore(current);
  return `<div class="compare-grid">
    <div>${itemHtml(current, `目前裝備：${newIt.slot}`)}</div>
    <div>${itemHtml(newIt, '新獲得裝備')}</div>
  </div>
  <div class="compare-summary">
    ${statDiff(newIt, current, 'atk')}　${statDiff(newIt, current, 'def')}　${statDiff(newIt, current, 'focus')}
    <span class="${delta >= 0 ? 'ok' : 'danger'}">綜合評分 ${delta >= 0 ? '+' : ''}${Math.round(delta)}</span>
  </div>
  <div class="modal-actions">
    <button class="equip-action equip-new" onclick="equipPending()"><span class="action-icon icon-equip"></span>替換成新裝備</button>
    <button class="equip-action keep-current" onclick="this.closest('.modal').remove()"><span class="action-icon icon-keep"></span>保留目前裝備</button>
  </div>`;
}
async function equipPending() {
  if (!pendingItem) return;
  await api('/api/equip', { method: 'POST', body: JSON.stringify({ item: pendingItem }) });
  document.querySelector('.modal')?.remove();
  await refresh();
}
async function buy(sku) {
  await toast(await api('/api/shop/buy', { method: 'POST', body: JSON.stringify({ sku }) }));
}
async function forge(type) {
  const specValue = document.querySelector('#spec')?.value;
  await toast(await api('/api/' + type, { method: 'POST', body: JSON.stringify({ slot: slot.value, spec: specValue }) }));
}
async function joinGuild() {
  const guildName = document.querySelector('#guild')?.value || '';
  await toast(await api('/api/guild', { method: 'POST', body: JSON.stringify({ guild: guildName }) }));
  if (socket?.connected) socket.emit('joinChat');
}
async function loadBoss() {
  const j = await api('/api/boss');
  const bh = bossHp(j.state);
  const boss = j.boss;
  const board = (j.leaderboard || []).map(r => ({ ...r, className: meta.classes?.[r.classKey || r.classkey]?.name || r.classKey || r.classkey || '-' }));
  bossbox.innerHTML = `<div class="boss-head">${img(boss[4], 'boss-img', boss[1])}<div><h3>${esc(boss[1])}｜${esc(boss[2])}</h3><p>${esc(boss[5])}</p><div class="bar"><i style="width:${Math.max(0, bh.hp / bh.max * 100)}%"></i></div><p>HP ${bh.hp}/${bh.max} ${bh.killed ? '已擊退' : ''}</p></div></div><h4>今日傷害榜</h4>${rankTable('', board, [{ key: 'username', label: '玩家' }, { key: 'className', label: '職業' }, { key: 'damage', label: '累積傷害', align: 'num' }], 'compact')}`;
}
async function bossAtk() {
  try {
    const j = await api('/api/boss/attack', { method: 'POST' });
    pendingItem = j.item || null;
    modal(j.text + (j.item ? `<hr>${compareItemHtml(j.item)}` : ''));
    await refresh();
  } catch (e) { alert(e.message); }
}
async function arenaFight() {
  await act('/api/arena');
}
async function craftBoss() {
  try {
    const j = await api('/api/boss/craft', { method: 'POST' });
    pendingItem = j.item || null;
    modal(j.message + (j.item ? compareItemHtml(j.item) : ''));
    await refresh();
  } catch (e) { alert(e.message); }
}
async function loadDailyQuiz() {
  const j = await api('/api/daily-quiz');
  const box = $('#dailybox');
  if (j.completed) {
    box.innerHTML = `<h3>今日已完成：答對 ${j.score}/5 題</h3><p>獎勵：${j.rewardExp} EXP、${j.rewardGold} 金幣</p>${renderQuizReview(j.questions, j.answers || {})}`;
    return;
  }
  box.innerHTML = `<form id="quizForm">${j.questions.map((q, idx) => `<div class="quiz-q"><h3>第 ${idx + 1} 題｜${esc(q.category)}</h3><p>${esc(q.question)}</p>${q.options.map((opt, oi) => `<label class="choice"><input type="radio" name="q_${q.id}" value="${oi}"> ${esc(opt)}</label>`).join('')}<p class="small">參考範圍：${esc(q.source)}</p></div>`).join('')}<button type="button" onclick="submitDailyQuiz()">提交每日任務答案</button></form>`;
}
function renderQuizReview(questions, answers) {
  return `<div class="quiz-review">${questions.map((q, idx) => {
    const selected = Number(answers[q.id]);
    const ok = selected === Number(q.answer);
    return `<div class="quiz-q ${ok ? 'ok-box' : 'bad-box'}"><h3>第 ${idx + 1} 題｜${esc(q.category)}｜${ok ? '答對' : '答錯'}</h3><p>${esc(q.question)}</p><p>你的答案：${Number.isFinite(selected) ? esc(q.options[selected]) : '未作答'}</p><p>正確答案：${esc(q.options[q.answer])}</p><p class="small">解析：${esc(q.explanation)}</p></div>`;
  }).join('')}</div>`;
}
async function submitDailyQuiz() {
  const form = $('#quizForm');
  const answers = {};
  form.querySelectorAll('.quiz-q').forEach(qBox => {
    const checked = qBox.querySelector('input[type=radio]:checked');
    if (checked) answers[checked.name.replace(/^q_/, '')] = Number(checked.value);
  });
  try {
    const j = await api('/api/daily-quiz/submit', { method: 'POST', body: JSON.stringify({ answers }) });
    modal(`${esc(j.text)}<hr>${renderQuizReview(j.review, Object.fromEntries(j.review.map(r => [r.id, r.selected])))}`);
    await refresh();
  } catch (e) { alert(e.message); }
}
async function loadRanks() {
  const j = await api('/api/leaderboards');
  const withClass = rows => (rows || []).map(r => ({ ...r, className: meta.classes?.[r.classKey || r.classkey]?.name || r.classKey || r.classkey || '-' }));
  ranks.innerHTML = `<div class="rank-board">
    ${rankTable('等級排行', withClass(j.level), [{ key: 'username', label: '玩家' }, { key: 'className', label: '職業' }, { key: 'level', label: '等級', align: 'num' }, { key: 'exp', label: '目前 EXP', align: 'num' }])}
    ${rankTable('金幣排行', withClass(j.gold), [{ key: 'username', label: '玩家' }, { key: 'className', label: '職業' }, { key: 'gold', label: '金幣', align: 'num' }, { key: 'level', label: '等級', align: 'num' }])}
    ${rankTable('今日 BOSS 傷害排行', withClass(j.boss), [{ key: 'username', label: '玩家' }, { key: 'className', label: '職業' }, { key: 'damage', label: '累積傷害', align: 'num' }])}
  </div>`;
}
function rankTable(title, rows, cols, variant = '') {
  const body = rows.length
    ? rows.map((row, i) => `<tr><td data-label="名次"><span class="rank-badge">#${i + 1}</span></td>${cols.map(col => `<td data-label="${esc(col.label)}" class="${col.align === 'num' ? 'num' : ''}">${esc(row[col.key] ?? '-')}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${cols.length + 1}" class="small">目前尚無資料</td></tr>`;
  return `<section class="rank-section ${variant}">${title ? `<h3>${esc(title)}</h3>` : ''}<div class="rank-table-wrap"><table class="rank-table"><thead><tr><th>名次</th>${cols.map(col => `<th>${esc(col.label)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div></section>`;
}
async function loadCatalog() {
  const j = await api('/api/catalog');
  const arr = j[me.player.classKey]['武器'];
  catalog.innerHTML = `<div class="catalog-grid">${arr.map(it => itemHtml(it)).join('')}</div>`;
}
async function toast(j) {
  modal(j.text || j.message);
  await refresh();
}
function modal(html) {
  const d = document.createElement('div');
  d.className = 'modal';
  d.innerHTML = `<div><div>${html}</div><button onclick="this.closest('.modal').remove()">關閉</button></div>`;
  document.body.appendChild(d);
}
function joinRealtimeBoss() {
  connectSocket();
  socket.emit('joinBattle', { battleId: 'world-boss' });
  addRealtimeLog('你加入了世界 BOSS 即時戰鬥房。');
}
function socketBossAtk() {
  connectSocket();
  socket.emit('joinBattle', { battleId: 'world-boss' });
  socket.emit('bossAttack');
}
function joinArena() {
  connectSocket();
  socket.emit('joinBattle', { battleId: 'arena' });
  addRealtimeLog('你加入了即時競技場。');
}
function socketArenaAtk() {
  connectSocket();
  socket.emit('joinBattle', { battleId: 'arena' });
  socket.emit('arenaStrike', { target: '金融影武者' });
}

function chatSidebar() {
  const guild = chatStatus.guild || me?.player?.guild || '';
  return `<aside class="chat-sidebar">
    <div class="chat-title">即時聊天室</div>
    <div class="chat-tabs">
      <button class="${chatChannel === 'global' ? 'active' : ''}" onclick="setChatChannel('global')">大眾</button>
      <button class="${chatChannel === 'guild' ? 'active' : ''}" onclick="setChatChannel('guild')">公會${guild ? `｜${esc(guild)}` : ''}</button>
    </div>
    <div id="chatMessages" class="chat-messages"></div>
    <div class="chat-input-row"><input id="chatInput" maxlength="160" placeholder="輸入訊息，Enter 送出" onkeydown="if(event.key==='Enter')sendChat()"><button onclick="sendChat()">送出</button></div>
    <p class="small">大眾頻道全服可見；公會頻道僅同公會玩家可見。</p>
  </aside>`;
}
function renderChatBox(scrollBottom = false) {
  const box = document.querySelector('#chatMessages');
  if (!box) return;
  const guild = chatStatus.guild || me?.player?.guild || '';
  if (chatChannel === 'guild' && !guild) {
    box.innerHTML = `<p class="small">尚未加入公會。請先到「公會/攻城」建立或加入公會後，再使用公會聊天室。</p>`;
    return;
  }
  const rows = (chatMessages[chatChannel] || []).slice(-50);
  box.innerHTML = rows.length ? rows.map(m => `<div class="chat-msg"><span class="chat-time">${new Date(Number(m.at || Date.now())).toLocaleTimeString()}</span> <b>${esc(m.username || '玩家')}</b><br>${esc(m.text || '')}</div>`).join('') : `<p class="small">目前沒有訊息，成為第一位發言的玩家吧。</p>`;
  if (scrollBottom) box.scrollTop = box.scrollHeight;
}
function setChatChannel(ch) {
  chatChannel = ch === 'guild' ? 'guild' : 'global';
  localStorage.chatChannel = chatChannel;
  render();
}
function addChatSystem(text) {
  chatMessages[chatChannel] = [...(chatMessages[chatChannel] || []), { username: '系統', text, at: Date.now(), channel: chatChannel }].slice(-80);
  renderChatBox(true);
}
function sendChat() {
  const input = document.querySelector('#chatInput');
  const text = input?.value?.trim();
  if (!text) return;
  connectSocket();
  socket.emit('chatSend', { channel: chatChannel, text });
  input.value = '';
}

boot();
