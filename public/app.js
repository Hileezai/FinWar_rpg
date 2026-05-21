const $ = (s) => document.querySelector(s);
let token = localStorage.token || '';
let meta = null;
let me = null;
let pendingItem = null;
let page = 'home';
let socket = null;

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
function itemImage(it) {
  if (it?.image) return it.image;
  if (it?.slot === '武器' || it?.slot === '副武器') return 'assets/images/equipment/weapons/weapon_01.png';
  if (it?.slot?.includes('飾品')) return 'assets/images/equipment/accessories/accessory_01.png';
  return 'assets/images/equipment/armor/armor_01.png';
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
  socket.on('battleLog', d => addRealtimeLog(d.text));
  socket.on('bossUpdate', d => {
    addRealtimeLog(d.text);
    if (page === 'boss') loadBoss();
  });
  socket.on('actionResult', d => {
    if (d?.error) alert(d.error);
    else if (d?.text) modal(d.text + (d.item ? `<hr>${itemHtml(d.item)}<button onclick='equipPending()'>替換此裝備</button>` : ''));
    refresh();
  });
}
function addRealtimeLog(text) {
  const box = document.querySelector('#realtimeLog');
  if (box && text) box.innerHTML = `<p>${new Date().toLocaleTimeString()}｜${text}</p>` + box.innerHTML;
}
function layout(content) {
  const p = me?.player;
  const s = me?.stats;
  const header = token ? `<div class="panel hero-bar">
    <div>${img(meta.classes[p.classKey].image, 'avatar-sm', meta.classes[p.classKey].name)}</div>
    <div class="hero-stats"><b>${esc(me.user.username)}</b>｜${esc(meta.classes[p.classKey].name)} Lv.${p.level}｜金幣 ${p.gold}｜碎片 ${p.bossFragments}
      <div class="bar"><i style="width:${Math.max(0, p.hp / s.hpMax * 100)}%"></i></div><span class="small">HP ${p.hp}/${s.hpMax}</span>
      <div class="bar stam"><i style="width:${p.stamina / 2}%"></i></div><span class="small">疲勞 ${p.stamina}/200，每小時 +25</span>
    </div>
  </div>
  <div class="nav">${Object.keys(names).map(x => `<button onclick="go('${x}')" class="${page === x ? 'active' : ''}">${pageIcon(x)}${names[x]}</button>`).join('')}<button onclick="logout()">登出</button></div>` : '';
  return `<div class="wrap"><div class="title">🏦 金融王國：Formosa Ledger Online</div>${header}${content}<div class="footer">8-bit 金融 RPG｜PostgreSQL + Socket.IO｜自訂像素素材已整合</div></div>`;
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
    c = `<div class="grid"><div class="card class-card">${img(cls.image, 'sprite-img big', cls.name)}<h2>${esc(cls.name)}</h2><p>${esc(cls.desc)}</p><p>ATK ${s.atk}｜DEF ${s.def}｜FOCUS ${s.focus}</p>${skillPills(cls)}<button onclick="rest()">休息恢復 HP</button></div><div class="card"><h3>裝備</h3><div class="equip">${Object.entries(eq).map(([slot, it]) => `<div class="panel equip-card">${img(itemImage(it), 'item-icon', it.name)}<div><b>${esc(slot)}</b><br><span class="rarity-${it.rarity}">${esc(it.name)}</span><br>攻${it.atk} 防${it.def} 專${it.focus}<br>+${it.enhance}｜${esc(it.enchant)}｜${esc(it.spec)}</div></div>`).join('')}</div></div></div><div class="card"><h3>近期戰鬥紀錄</h3><div class="log">${me.logs.map(l => `<p>${new Date(Number(l.createdat || l.createdAt)).toLocaleString()}｜${l.text}</p>`).join('')}</div></div>`;
  }
  if (page === 'training') {
    c = `<div class="card scene-card">${img('assets/images/scenes/grassland.png', 'scene-img', '練功場')}<div><h2>練功場：逾放怨靈沙洲</h2><p>練功只給經驗，不掉裝備。每次消耗疲勞 10，會跳出 3～5 句戰鬥敘述，包含技能、傷害、反擊與獎勵。</p>${img('assets/images/monsters/f01_skeleton.png', 'enemy-preview', '逾放怨靈')}<button onclick="act('/api/training')">進入小視窗戰鬥</button></div></div>`;
  }
  if (page === 'dungeon') {
    const saved = eqObj(p.dungeonSave).floor || 1;
    const preview = monsterForFloor(saved);
    c = `<div class="card scene-card">${img('assets/images/scenes/cave.png', 'scene-img', '地下城')}<div><h2>地下城 50 層：金融迷宮</h2><p>每次消耗疲勞 18。裝備只從地下城與 BOSS 取得；每層金幣獎勵三天刷新一次，可暫存進度。</p><label>挑戰層數</label><input id="floor" type="number" min="1" max="50" value="${saved}"><div>${img(preview?.image, 'enemy-preview', preview?.name)}<span class="pill">目前預覽：${esc(preview?.name || '')}</span></div><button onclick="dungeon()">挑戰/讀取存檔層數</button><details><summary>查看 50 層故事</summary><div class="small storybox">${story()}</div></details></div></div>`;
  }
  if (page === 'boss') {
    c = `<div class="card"><h2>世界 BOSS</h2><div id="bossbox">讀取中...</div><button onclick="joinRealtimeBoss()">加入即時 BOSS 房</button><button onclick="socketBossAtk()">Socket 即時攻擊</button><button onclick="bossAtk()">API 參戰，消耗疲勞 25</button><div class="log" id="realtimeLog"></div><button onclick="craftBoss()">30 碎片合成 BOSS 裝備</button></div>`;
  }
  if (page === 'arena') {
    c = `<div class="card scene-card">${img('assets/images/scenes/prison.png', 'scene-img', '競技場')}<div><h2>玩家對戰競技場</h2><p>自動匹配其他玩家鏡像資料。每次消耗疲勞 15，勝敗依攻防專注、技能與亂數判定。</p><button onclick="joinArena()">加入即時競技場</button><button onclick="socketArenaAtk()">Socket 即時攻擊</button><button onclick="act('/api/arena')">API 尋找對手 PK</button><div class="log" id="realtimeLog"></div></div></div>`;
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
    c = `<div class="card"><h2>裝備圖鑑</h2><p>伺服器已內建 6 職業 x 8 部位 x 50 件職業裝備。下方展示你職業的前 50 層武器。</p><div id="catalog">讀取中...</div></div>`;
  }
  $('#app').innerHTML = layout(c);
  if (page === 'boss') loadBoss();
  if (page === 'rank') loadRanks();
  if (page === 'catalog') loadCatalog();
  if (page === 'daily') loadDailyQuiz();
}
function story() {
  return Array.from({ length: 50 }, (_, i) => `第${i + 1}層：${['金庫荒廢區調查異常提款', 'ATM墓園掃蕩卡片怨靈', '利率鐘塔校準殖利率齒輪', '法遵圖書館封印裁罰卷宗', '董事會深淵對抗黑箱決策'][i % 5]}。`).join('<br>');
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
    const extra = j.item ? `<hr><h3>獲得裝備</h3>${itemHtml(j.item)}<button onclick='equipPending()'>替換此裝備</button>` : '';
    pendingItem = j.item;
    modal(j.text + extra);
    await refresh();
  } catch (e) { alert(e.message); }
}
function itemHtml(it) {
  return `<div class="loot-card">${img(itemImage(it), 'item-icon-lg', it.name)}<p><span class="rarity-${it.rarity}">${esc(it.name)}</span><br>${esc(it.slot)}｜${esc(it.rarity)}｜攻${it.atk} 防${it.def} 專${it.focus}</p></div>`;
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
  await toast(await api('/api/guild', { method: 'POST', body: JSON.stringify({ guild: guild.value }) }));
}
async function loadBoss() {
  const j = await api('/api/boss');
  const bh = bossHp(j.state);
  const boss = j.boss;
  bossbox.innerHTML = `<div class="boss-head">${img(boss[4], 'boss-img', boss[1])}<div><h3>${esc(boss[1])}｜${esc(boss[2])}</h3><p>${esc(boss[5])}</p><div class="bar"><i style="width:${Math.max(0, bh.hp / bh.max * 100)}%"></i></div><p>HP ${bh.hp}/${bh.max} ${bh.killed ? '已擊退' : ''}</p></div></div><h4>今日傷害榜</h4>${j.leaderboard.map(x => `<p>${esc(x.username)}：${x.damage}</p>`).join('')}`;
}
async function bossAtk() {
  try {
    const j = await api('/api/boss/attack', { method: 'POST' });
    pendingItem = j.item;
    modal(j.text + (j.item ? `<hr>${itemHtml(j.item)}<button onclick='equipPending()'>替換此裝備</button>` : ''));
    await refresh();
  } catch (e) { alert(e.message); }
}
async function craftBoss() {
  try {
    const j = await api('/api/boss/craft', { method: 'POST' });
    pendingItem = j.item;
    modal(j.message + itemHtml(j.item) + `<button onclick='equipPending()'>替換此裝備</button>`);
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
  ranks.innerHTML = ['level', 'gold', 'boss'].map(k => `<h3>${k}</h3>${j[k].map((x, i) => `<p>#${i + 1} ${esc(x.username)} ${x.level ? 'Lv.' + x.level : ''} ${x.gold ? '金幣 ' + x.gold : ''} ${x.damage ? '傷害 ' + x.damage : ''}</p>`).join('')}`).join('');
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

boot();
