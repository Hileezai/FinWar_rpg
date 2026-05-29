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
let onlineUsers = [];
let guildState = null;
const FALLBACK_DUNGEON_MAX_FLOOR = 200;
const FALLBACK_EQUIPMENT_LEVEL_CAP = 150;

const names = {
  home: '角色',
  training: '練功場',
  dungeon: '地下城',
  boss: '世界BOSS',
  arena: 'PK競技場',
  guild: '公會',
  daily: '每日任務',
  shop: '道具商店',
  forge: '強化附魔',
  rank: '排行榜',
  catalog: '裝備圖鑑',
  admin: '管理後台'
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
  catalog: 'assets/images/ui/bag.png',
  admin: 'assets/images/ui/settings.png'
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
  if (location.pathname === '/admin') page = 'admin';
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
  socket.on('onlineUsers', d => {
    onlineUsers = d?.users || d || [];
    renderOnlinePanel();
  });
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
  <div class="nav">${Object.keys(names).filter(x => x !== 'admin' || me?.user?.isAdmin).map(x => `<button onclick="go('${x}')" class="${page === x ? 'active' : ''}">${pageIcon(x)}${names[x]}</button>`).join('')}<button onclick="logout()">登出</button></div>` : '';
  const announcements = (meta.announcements || []).length ? `<div class="panel announce-box">${meta.announcements.map(a => `<p><b>${esc(a.title)}</b>｜${esc(a.text)}</p>`).join('')}</div>` : '';
  const main = `<div class="wrap"><div class="title">🌳 巨樹王國：Kingdom of Giant Tree Online</div>${announcements}${header}${content}<div class="footer">金融故事像素風格網頁RPG</div></div>`;
  return token ? `<div class="game-shell"><main class="main-pane">${main}</main>${chatSidebar()}</div>${onlinePanel()}` : main;
}
function onlinePanel() {
  return `<section class="online-panel"><b>目前線上玩家</b><div id="onlineUsers">${onlineUsers.length ? onlineUsers.map(u => `<span class="pill">${esc(u.username || '玩家')}${u.count > 1 ? ` x${u.count}` : ''}</span>`).join('') : '<span class="small">尚未同步線上名單</span>'}</div></section>`;
}
function renderOnlinePanel() {
  const box = document.querySelector('#onlineUsers');
  if (!box) return;
  box.innerHTML = onlineUsers.length ? onlineUsers.map(u => `<span class="pill">${esc(u.username || '玩家')}${u.count > 1 ? ` x${u.count}` : ''}</span>`).join('') : '<span class="small">目前沒有其他線上玩家</span>';
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
    c = `<div class="grid"><div class="card class-card">${img(cls.image, 'sprite-img big', cls.name)}<h2>${esc(cls.name)}</h2><p>${esc(cls.desc)}</p><p>Lv.${p.level}｜EXP ${p.exp}/${p.level * 120}</p><p>ATK ${s.atk}｜DEF ${s.def}｜FOCUS ${s.focus}</p>${skillPills(cls)}<button onclick="rest()">休息恢復 HP</button></div><div class="card"><h3>裝備</h3><div class="equip">${Object.entries(eq).map(([slot, it]) => `<div class="panel equip-card">${img(itemImage(it), 'item-icon', it.name)}<div><b>${esc(slot)}</b><br><span class="rarity-${it.rarity}">${esc(it.name)}</span><br>需求 Lv.${it.requiredLevel || 1}｜攻${it.atk} 防${it.def} 專${it.focus}<br>+${it.enhance}｜${esc(it.enchant)}｜${esc(it.spec)}${effectText(it)}</div></div>`).join('')}</div></div></div>${storageGrid()}<div class="card"><h3>近期戰鬥紀錄</h3><div class="log">${me.logs.map(l => `<p>${new Date(Number(l.createdat || l.createdAt)).toLocaleString()}｜${l.text}</p>`).join('')}</div></div>`;
  }
  if (page === 'training') {
    const firstMap = meta.mapMonsters?.maps?.[0];
    const firstMonster = firstMap?.monsters?.[0];
    c = `<div class="card scene-card">${img(firstMap?.scenePath || 'assets/images/scenes/grassland.png', 'scene-img', '練功場')}<div><h2>練功場：隨機遠征</h2><p>練功只給經驗，不掉裝備。每次消耗疲勞 ${meta.fatigue?.costs?.training || 5}，會從 15 個場景與 150 隻魔物中隨機抽選遭遇。</p>${img(firstMonster?.assetPath || 'assets/images/monsters/f01_skeleton.png', 'enemy-preview', firstMonster?.name || '魔物')}<button onclick="act('/api/training')">進入小視窗戰鬥</button></div></div>`;
  }
  if (page === 'dungeon') {
    const save = eqObj(p.dungeonSave);
    const saved = save.floor || 1;
    const maxFloor = meta.dungeonMaxFloor || FALLBACK_DUNGEON_MAX_FLOOR;
    const latest = Math.min(saved, maxFloor);
    const preview = monsterForFloor(latest);
    const floorOptions = Array.from({ length: latest }, (_, i) => `<option value="${i + 1}" ${i + 1 === latest ? 'selected' : ''}>第 ${i + 1} 層${i + 1 === latest ? '（最新）' : ''}</option>`).join('');
    c = `<div class="card scene-card">${img('assets/images/scenes/cave.png', 'scene-img', '地下城')}<div><h2>地下城 ${maxFloor} 層：金融迷宮</h2><p>每次消耗疲勞 ${meta.fatigue?.costs?.dungeon || 10}。每週五 00:00（台北時間）刷新本週獎勵，並強制從第 1 層重新開始依序挑戰。</p><p><span class="pill">目前進度：第 ${latest} 層</span><span class="pill">本週週期：${esc(save.weekKey || '-')}</span></p><div>${img(preview?.image, 'enemy-preview', preview?.name)}<span class="pill">最新守衛：${esc(preview?.name || '')}</span></div><div class="dungeon-controls"><label>選擇挑戰樓層<select id="dungeonFloor">${floorOptions}</select></label><button onclick="dungeon()">挑戰選擇樓層</button></div><p class="small">回頭挑戰已開放樓層可刷裝備；從其他頁面回到地下城時會自動預設最新關卡。</p><details><summary>查看 ${maxFloor} 層故事</summary><div class="small storybox">${story(maxFloor)}</div></details></div></div>`;
  }
  if (page === 'boss') {
    c = `<div class="card"><h2>世界 BOSS</h2><div id="bossbox">讀取中...</div><button class="primary-action" onclick="bossAtk()">${pageIcon('arena')}討伐世界 BOSS，消耗疲勞 ${meta.fatigue?.costs?.boss || 15}</button><div class="log" id="realtimeLog"></div><button onclick="craftBoss()">30 碎片合成 BOSS 裝備</button></div>`;
  }
  if (page === 'arena') {
    c = `<div class="card scene-card">${img('assets/images/scenes/prison.png', 'scene-img', '競技場')}<div><h2>玩家對戰競技場</h2><p>自動匹配其他玩家資料。每次消耗疲勞 ${meta.fatigue?.costs?.arena || 5}，勝敗依攻防專注、技能與亂數判定；對戰結果會同步寫入雙方近期戰鬥紀錄。</p><p><span class="pill">競技場積分：${p.arenaPoints ?? p.arenapoints ?? 1000}</span><span class="pill">連勝：${p.arenaStreak ?? p.arenastreak ?? 0}</span></p><button class="primary-action" onclick="arenaFight()">${pageIcon('arena')}尋找對手開戰</button><div class="log" id="realtimeLog"></div></div></div>`;
  }
  if (page === 'guild') {
    c = `<div id="guildBox" class="card">讀取公會資料中...</div>`;
  }
  if (page === 'daily') {
    c = `<div class="card"><h2>每日任務：台灣銀行業知識問答</h2><p>每日可進行一次，一天五題。題庫包含公平待客、洗錢防制、資訊安全社交工程防護、金融業法遵與市場風險概念。答對越多，EXP 與金幣越多。</p><div id="dailybox">讀取中...</div></div>`;
  }
  if (page === 'shop') {
    c = `<div class="grid">${meta.shop.map(it => `<div class="card shop-card">${img(shopImage(it), 'item-icon-lg', it[0])}<h3>${esc(it[0])}</h3><p>${esc(it[3])}</p><p>價格 ${it[2]}｜每日庫存 ${it[4]}</p><button onclick="buy('${it[1]}')">購買</button></div>`).join('')}</div>`;
  }
  if (page === 'forge') {
    c = `<div class="card scene-card">${img('assets/images/scenes/volcano.png', 'scene-img', '鍛造區')}<div><h2>強化、附魔、特化區</h2><select id="slot">${Object.keys(eq).map(s => `<option>${esc(s)}</option>`).join('')}</select><button onclick="forge('enhance')">強化</button><button onclick="forge('enchant')">附魔</button><select id="spec"><option>攻擊特化</option><option>防禦特化</option><option>HP特化</option><option>專注特化</option></select><button onclick="forge('specialize')">特化</button><p class="small">強化需消耗強化晶片 I 與工本費；若背包持有輔助晶片，下一次強化會自動消耗 1 個並提升 15% 成功率。附魔與特化也會消耗對應道具與工本費。</p></div></div>${inventoryGrid()}${storageGrid()}`;
  }
  if (page === 'admin') {
    c = me.user.isAdmin ? `<div class="card"><h2>管理後台</h2><div id="adminBox">讀取中...</div></div>` : `<div class="card"><h2>管理後台</h2><p class="danger">需要管理員權限。</p></div>`;
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
  if (page === 'guild') loadGuild();
  if (page === 'admin' && me.user.isAdmin) loadAdmin();
  renderOnlinePanel();
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
  try { await toast(await api('/api/rest', { method: 'POST' })); } catch (e) { alert(e.message); }
}
async function act(url) {
  try {
    const j = await api(url, { method: 'POST' });
    const scene = j.encounter?.scene ? `${img(j.encounter.scene, 'scene-img', j.encounter.mapName || '場景')}<hr>` : '';
    modal(scene + (j.text || j.message));
    await refresh();
  } catch (e) { alert(e.message); }
}
async function dungeon() {
  try {
    const floor = Number($('#dungeonFloor')?.value || 0);
    const j = await api('/api/dungeon', { method: 'POST', body: JSON.stringify({ floor }) });
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
function itemEffects(it) {
  return { ...(it?.effects || {}), ...(it?.enchantEffects || {}), ...(it?.specEffects || {}) };
}
function effectText(it) {
  const labels = {
    counter: '反擊',
    evasion: '迴避',
    dropRate: '掉寶',
    bossFragment: '碎片',
    hpRegenBonus: '續戰',
    skillDamage: '技能傷害',
    skillRate: '技能率',
    hpBonus: 'HP',
    goldBonus: '金幣'
  };
  const e = itemEffects(it);
  const rows = Object.entries(e).filter(([, v]) => Number(v)).map(([k, v]) => `${labels[k] || k} ${Number(v) > 0 ? '+' : ''}${Math.round(Number(v) * 100)}%`);
  return rows.length ? `<br><span class="small">${rows.map(esc).join('｜')}</span>` : '';
}
function inventoryGrid() {
  const items = me.inventory || [];
  const mats = items.filter(it => it.material || Number(it.qty || 0) > 0);
  return `<div class="card"><h3>鍛造背包</h3><div class="bag-grid">${mats.map(it => `<div class="bag-slot ${Number(it.qty || 0) <= 0 ? 'empty' : ''}">${img(it.image, 'item-icon-lg', it.name)}<b>${esc(it.name)}</b><span>x${it.qty || 0}</span></div>`).join('')}</div></div>`;
}
function storageGrid() {
  const items = me.storage || [];
  return `<div class="card"><h3>裝備暫存箱 ${items.length}/${me.storageLimit || 20}</h3><div class="storage-grid">${items.length ? items.map(row => {
    const it = row.item || {};
    const need = Number(it.requiredLevel || 1);
    const can = Number(me.player.level || 1) >= need;
    return `<div class="storage-slot">${itemHtml(it)}<div class="storage-actions">${can ? `<button onclick="equipStored(${row.id})">裝備</button>` : `<span class="danger">需要 Lv.${need}</span>`}<button onclick="discardStored(${row.id})">丟棄</button></div></div>`;
  }).join('') : '<p class="small">暫存箱目前沒有裝備。</p>'}</div></div>`;
}
function statDiff(newIt, oldIt, key) {
  const diff = Number(newIt?.[key] || 0) - Number(oldIt?.[key] || 0);
  const label = key === 'atk' ? '攻' : key === 'def' ? '防' : '專';
  const cls = diff > 0 ? 'ok' : diff < 0 ? 'danger' : 'small';
  return `<span class="${cls}">${label}${newIt?.[key] || 0}（${diff >= 0 ? '+' : ''}${diff}）</span>`;
}
function itemHtml(it, title = '') {
  if (!it) return `<div class="loot-card muted"><p>${esc(title || '空裝備欄')}</p></div>`;
  return `<div class="loot-card">${img(itemImage(it), 'item-icon-lg', it.name)}<p>${title ? `<b>${esc(title)}</b><br>` : ''}<span class="rarity-${it.rarity}">${esc(it.name)}</span><br>${esc(it.slot)}｜${esc(it.rarity)}｜裝備 Lv.${it.level || 1}｜需求 Lv.${it.requiredLevel || 1}<br>攻${it.atk} 防${it.def} 專${it.focus}<br>+${it.enhance || 0}｜${esc(it.enchant || '未附魔')}｜${esc(it.spec || '未特化')}${effectText(it)}</p></div>`;
}
function compareItemHtml(newIt) {
  const current = eqObj(me?.player?.equipment)[newIt.slot];
  const delta = itemScore(newIt) - itemScore(current);
  const need = Number(newIt.requiredLevel || 1);
  const canEquip = Number(me?.player?.level || 1) >= need;
  return `<div class="compare-grid">
    <div>${itemHtml(current, `目前裝備：${newIt.slot}`)}</div>
    <div>${itemHtml(newIt, '新獲得裝備')}</div>
  </div>
  <div class="compare-summary">
    ${statDiff(newIt, current, 'atk')}　${statDiff(newIt, current, 'def')}　${statDiff(newIt, current, 'focus')}
    <span class="${delta >= 0 ? 'ok' : 'danger'}">綜合評分 ${delta >= 0 ? '+' : ''}${Math.round(delta)}</span>
  </div>
  <div class="modal-actions">
    ${canEquip ? `<button class="equip-action equip-new" onclick="equipPending()"><span class="action-icon icon-equip"></span>替換成新裝備</button>` : `<button class="equip-action equip-new" onclick="storePending()"><span class="action-icon icon-equip"></span>放入暫存箱</button>`}
    <button class="equip-action keep-current" onclick="this.closest('.modal').remove()"><span class="action-icon icon-keep"></span>保留目前裝備</button>
  </div>`;
}
async function equipPending() {
  if (!pendingItem) return;
  try {
    await api('/api/equip', { method: 'POST', body: JSON.stringify({ item: pendingItem }) });
    document.querySelector('.modal')?.remove();
    await refresh();
  } catch (e) { alert(e.message); }
}
async function storePending() {
  if (!pendingItem) return;
  try {
    await api('/api/storage/add', { method: 'POST', body: JSON.stringify({ item: pendingItem }) });
    document.querySelector('.modal')?.remove();
    await refresh();
  } catch (e) { alert(e.message); }
}
async function equipStored(id) {
  try { await toast(await api('/api/storage/equip/' + id, { method: 'POST' })); } catch (e) { alert(e.message); }
}
async function discardStored(id) {
  if (!confirm('確定要丟棄這件暫存裝備嗎？')) return;
  try { await toast(await api('/api/storage/discard/' + id, { method: 'POST' })); } catch (e) { alert(e.message); }
}
async function buy(sku) {
  try { await toast(await api('/api/shop/buy', { method: 'POST', body: JSON.stringify({ sku }) })); } catch (e) { modal(esc(e.message || '已無庫存')); }
}
async function forge(type) {
  const specValue = document.querySelector('#spec')?.value;
  try { await toast(await api('/api/' + type, { method: 'POST', body: JSON.stringify({ slot: slot.value, spec: specValue }) })); } catch (e) { alert(e.message); }
}
const roleLabels = { leader: '會長', vice: '副會長', officer: '幹部', member: '公會成員' };
function rolePower(role) {
  return ({ leader: 4, vice: 3, officer: 2, member: 1 })[role] || 0;
}
function roleOptions(current) {
  return ['vice', 'officer', 'member'].map(r => `<option value="${r}" ${current === r ? 'selected' : ''}>${roleLabels[r]}</option>`).join('');
}
async function loadGuild() {
  const box = $('#guildBox');
  if (!box) return;
  guildState = await api('/api/guild');
  box.innerHTML = guildHtml(guildState);
}
function guildHtml(data) {
  if (!data.guild) {
    const guildRows = (data.guilds || []).map(g => `<tr><td data-label="公會">${esc(g.name)}</td><td data-label="等級" class="num">Lv.${g.level}</td><td data-label="人數" class="num">${g.members}/${g.capacity}</td><td data-label="金庫" class="num">${g.treasury || 0}</td><td data-label="操作"><button onclick="applyGuild(decodeURIComponent('${encodeURIComponent(g.name)}'))">申請加入</button></td></tr>`).join('');
    return `<div class="scene-card">${img('assets/images/scenes/castle.png', 'scene-img', '公會城鎮')}<div><h2>公會管理</h2><p>公會採申請審核制。創立後會固定所屬公會，改名需由會長花費金幣且有 7 天冷卻。</p><input id="newGuildName" maxlength="16" placeholder="新公會名稱"><button onclick="createGuild()">創立公會</button></div></div><h3>公會清單</h3><div class="rank-table-wrap"><table class="rank-table"><thead><tr><th>公會</th><th>等級</th><th>人數</th><th>金庫</th><th>操作</th></tr></thead><tbody>${guildRows || `<tr><td colspan="5" class="small">目前尚無公會。</td></tr>`}</tbody></table></div>`;
  }
  const g = data.guild;
  const power = rolePower(data.userRole);
  const canApprove = power >= 2;
  const canManage = power >= 3;
  const isLeader = data.userRole === 'leader';
  const memberRows = (data.members || []).map(m => {
    const canRole = (isLeader || (data.userRole === 'vice' && ['officer', 'member'].includes(m.role))) && m.role !== 'leader' && m.playerId !== me.player.id;
    const canKick = canManage && m.role !== 'leader' && m.playerId !== me.player.id && !(data.userRole === 'vice' && rolePower(m.role) >= 3);
    return `<tr><td data-label="成員">${m.online ? '<span class="ok">●</span> ' : ''}${esc(m.username)}</td><td data-label="職階">${canRole ? `<select id="role_${m.playerId}">${roleOptions(m.role)}</select><button onclick="changeGuildRole(${m.playerId})">調整</button>` : esc(roleLabels[m.role] || m.role)}</td><td data-label="職業">${esc(meta.classes?.[m.classKey || m.classkey]?.name || '-')}</td><td data-label="等級" class="num">${m.level}</td><td data-label="HP" class="num">${m.hp}/${m.hpMax || m.hpmax}</td><td data-label="捐獻" class="num">${m.donated || 0}</td><td data-label="操作">${canKick ? `<button onclick="kickGuildMember(${m.playerId})">踢出</button>` : '-'}</td></tr>`;
  }).join('');
  const appRows = (data.applications || []).map(a => `<tr><td data-label="申請者">${esc(a.username)}</td><td data-label="職業">${esc(meta.classes?.[a.classKey || a.classkey]?.name || '-')}</td><td data-label="等級" class="num">${a.level}</td><td data-label="留言">${esc(a.message || '-')}</td><td data-label="操作"><button onclick="decideGuildApp(${a.id},'approve')">同意</button>${power >= 3 ? `<button onclick="decideGuildApp(${a.id},'reject')">拒絕</button>` : ''}</td></tr>`).join('');
  const logs = (data.logs || []).map(l => `<p>${new Date(Number(l.createdat || l.createdAt)).toLocaleString()}｜${esc(l.text)}</p>`).join('');
  return `<div class="scene-card">${img('assets/images/scenes/castle.png', 'scene-img', g.name)}<div><h2>${esc(g.name)}｜${esc(data.userRoleLabel)}</h2><p>${esc(g.notice || '尚未設定公會公告')}</p><p><span class="pill">Lv.${g.level}</span><span class="pill">人數 ${g.members}/${g.capacity}</span><span class="pill">金庫 ${g.treasury}</span><span class="pill">下級費用 ${g.upgradeCost}</span></p><p class="small">攻城戰目前暫未開放，後續版本再更新公會戰玩法。</p><button disabled>攻城戰暫未開放</button></div></div>
  <div class="grid"><div class="panel"><h3>金庫捐獻</h3><input id="donateAmount" type="number" min="1" placeholder="捐獻金幣"><button onclick="donateGuild()">捐獻</button></div>
  ${canManage ? `<div class="panel"><h3>公會升級 / 公告</h3><button onclick="upgradeGuild()">使用金庫升級</button><textarea id="guildNotice" maxlength="180">${esc(g.notice || '')}</textarea><button onclick="updateGuildNotice()">更新公告</button></div>` : ''}
  ${isLeader ? `<div class="panel"><h3>公會改名</h3><input id="renameGuildName" maxlength="16" placeholder="新公會名稱"><p class="small">改名費用 ${g.renameCost} 金幣，冷卻 7 天。</p><button onclick="renameGuild()">改名</button></div>` : ''}
  <div class="panel"><h3>離開公會</h3><button onclick="leaveGuild()">離開公會</button></div></div>
  <h3>成員資訊</h3><div class="rank-table-wrap"><table class="rank-table"><thead><tr><th>成員</th><th>職階</th><th>職業</th><th>等級</th><th>HP</th><th>捐獻</th><th>操作</th></tr></thead><tbody>${memberRows}</tbody></table></div>
  ${canApprove ? `<h3>入會申請</h3><div class="rank-table-wrap"><table class="rank-table"><thead><tr><th>申請者</th><th>職業</th><th>等級</th><th>留言</th><th>操作</th></tr></thead><tbody>${appRows || `<tr><td colspan="5" class="small">目前沒有待審核申請。</td></tr>`}</tbody></table></div>` : ''}
  <h3>公會紀錄</h3><div class="log">${logs || '<p class="small">尚無公會紀錄。</p>'}</div>`;
}
async function guildAction(url, body = {}) {
  try {
    const j = await api(url, { method: 'POST', body: JSON.stringify(body) });
    modal(esc(j.message || '操作完成'));
    if (socket?.connected) socket.emit('joinChat');
    await refresh();
  } catch (e) { alert(e.message); }
}
async function createGuild() {
  await guildAction('/api/guild/create', { guild: newGuildName.value });
}
async function applyGuild(name) {
  await guildAction('/api/guild/apply', { guild: name });
}
async function donateGuild() {
  await guildAction('/api/guild/donate', { amount: donateAmount.value });
}
async function upgradeGuild() {
  await guildAction('/api/guild/upgrade');
}
async function renameGuild() {
  await guildAction('/api/guild/rename', { name: renameGuildName.value });
}
async function updateGuildNotice() {
  await guildAction('/api/guild/notice', { notice: guildNotice.value });
}
async function decideGuildApp(id, decision) {
  await guildAction('/api/guild/application', { id, decision });
}
async function changeGuildRole(playerId) {
  await guildAction('/api/guild/role', { playerId, role: document.querySelector(`#role_${playerId}`).value });
}
async function kickGuildMember(playerId) {
  if (confirm('確定要將此成員移出公會嗎？')) await guildAction('/api/guild/kick', { playerId });
}
async function leaveGuild() {
  if (confirm('確定要離開公會嗎？')) await guildAction('/api/guild/leave');
}
async function loadAdmin(q = '') {
  const box = $('#adminBox');
  if (!box) return;
  const [summary, players, guilds] = await Promise.all([
    api('/api/admin/summary'),
    api('/api/admin/players?q=' + encodeURIComponent(q)),
    api('/api/admin/guilds')
  ]);
  box.innerHTML = adminHtml(summary, players.players || [], guilds.guilds || []);
}
function adminHtml(summary, players, guilds) {
  const settings = summary.settings || {};
  const playerRows = players.map(p => `<tr><td data-label="ID">${p.id}</td><td data-label="帳號">${esc(p.username)}${p.banned ? ' <span class="danger">停權</span>' : ''}</td><td data-label="職業">${esc(meta.classes?.[p.classKey || p.classkey]?.name || '-')}</td><td data-label="等級" class="num">${p.level}</td><td data-label="金幣" class="num">${p.gold}</td><td data-label="公會">${esc(p.guild || '-')}</td><td data-label="操作"><button onclick="adminOpenPlayer(${p.id})">管理</button></td></tr>`).join('');
  const guildRows = guilds.map(g => `<tr><td data-label="公會">${esc(g.name)}</td><td data-label="等級" class="num">${g.level}</td><td data-label="人數" class="num">${g.members}/${g.capacity}</td><td data-label="金庫" class="num">${g.treasury}</td><td data-label="操作"><button onclick="adminEditGuild(decodeURIComponent('${encodeURIComponent(g.name)}'),${g.level},${g.treasury},decodeURIComponent('${encodeURIComponent(g.notice || '')}'))">調整</button><button class="danger-btn" onclick="adminDisbandGuild(decodeURIComponent('${encodeURIComponent(g.name)}'))">解散</button></td></tr>`).join('');
  const logs = (summary.logs || []).map(l => `<p>${new Date(Number(l.createdat || l.createdAt)).toLocaleString()}｜${esc(l.username || 'admin')}｜${esc(l.action)}｜${esc(l.targettype || '')}:${esc(l.targetid || '')}</p>`).join('');
  const announcements = (summary.announcements || []).map(a => `<tr><td data-label="標題">${esc(a.title)}</td><td data-label="內容">${esc(a.text)}</td><td data-label="狀態">${Number(a.active) ? '啟用' : '停用'}</td><td data-label="操作"><button onclick="adminToggleAnnouncement(${a.id},${Number(a.active) ? 0 : 1})">${Number(a.active) ? '停用' : '啟用'}</button></td></tr>`).join('');
  return `<div class="grid admin-summary"><div class="panel"><b>玩家</b><p>${summary.players}</p></div><div class="panel"><b>帳號</b><p>${summary.users}</p></div><div class="panel"><b>公會</b><p>${summary.guilds}</p></div><div class="panel"><b>線上</b><p>${(summary.online || []).length}</p></div></div>
  <div class="panel"><h3>玩家查詢與調整</h3><div class="inline-row"><input id="adminSearch" placeholder="帳號或玩家ID"><button onclick="loadAdmin(adminSearch.value)">查詢</button></div><div class="rank-table-wrap"><table class="rank-table"><thead><tr><th>ID</th><th>帳號</th><th>職業</th><th>等級</th><th>金幣</th><th>公會</th><th>操作</th></tr></thead><tbody>${playerRows || `<tr><td colspan="7" class="small">沒有資料</td></tr>`}</tbody></table></div></div>
  <div class="panel"><h3>公會管理</h3><div class="rank-table-wrap"><table class="rank-table"><thead><tr><th>公會</th><th>等級</th><th>人數</th><th>金庫</th><th>操作</th></tr></thead><tbody>${guildRows || `<tr><td colspan="5" class="small">沒有資料</td></tr>`}</tbody></table></div></div>
  <div class="panel"><h3>遊戲參數調整</h3><div class="settings-grid">
    ${adminSettingInput('fatigueTraining','練功疲勞',settings.fatigueTraining)}
    ${adminSettingInput('fatigueDungeon','地下城疲勞',settings.fatigueDungeon)}
    ${adminSettingInput('fatigueBoss','BOSS疲勞',settings.fatigueBoss)}
    ${adminSettingInput('fatigueArena','競技場疲勞',settings.fatigueArena)}
    ${adminSettingInput('restCost','休息費用',settings.restCost)}
    ${adminSettingInput('dungeonEquipmentDropRate','地下城掉裝率',settings.dungeonEquipmentDropRate)}
    ${adminSettingInput('bossEquipmentDropRate','BOSS掉裝率',settings.bossEquipmentDropRate)}
    ${adminSettingInput('bossFragmentDropRate','BOSS碎片率',settings.bossFragmentDropRate)}
    ${adminSettingInput('bossFragmentBonusDropRate','BOSS額外碎片率',settings.bossFragmentBonusDropRate)}
  </div><button onclick="adminSaveSettings()">儲存參數</button></div>
  <div class="panel"><h3>道具 / 資源補償</h3><div class="settings-grid"><input id="grantPlayerId" placeholder="玩家ID"><select id="grantSku">${meta.shop.map(it => `<option value="${it[1]}">${esc(it[0])}</option>`).join('')}</select><input id="grantQty" type="number" min="1" value="1"><button onclick="adminGrantMaterial()">補發道具</button><input id="grantGold" type="number" min="1" value="1000" placeholder="補償金幣"><button onclick="adminGrantGold()">補償金幣</button><input id="grantStamina" type="number" min="1" max="200" value="50" placeholder="補償疲勞"><button onclick="adminGrantStamina()">補償疲勞</button></div></div>
  <div class="panel"><h3>系統公告</h3><input id="annTitle" placeholder="公告標題"><textarea id="annText" maxlength="500" placeholder="公告內容"></textarea><button onclick="adminCreateAnnouncement()">發布公告</button><div class="rank-table-wrap"><table class="rank-table"><thead><tr><th>標題</th><th>內容</th><th>狀態</th><th>操作</th></tr></thead><tbody>${announcements || `<tr><td colspan="4" class="small">尚無公告</td></tr>`}</tbody></table></div></div>
  <div class="panel"><h3>管理員操作紀錄</h3><div class="log">${logs || '<p class="small">尚無紀錄</p>'}</div></div>`;
}
function adminSettingInput(key, label, value) {
  return `<label>${esc(label)}<input id="set_${key}" type="number" step="0.001" value="${esc(value ?? '')}"></label>`;
}
function adminConfirm() {
  return prompt('高風險操作請輸入 CONFIRM') === 'CONFIRM';
}
async function adminPost(url, body = {}) {
  if (!adminConfirm()) return;
  try {
    const j = await api(url, { method: 'POST', body: JSON.stringify({ ...body, confirm: 'CONFIRM' }) });
    modal(esc(j.message || '操作完成'));
    meta = await api('/api/meta');
    await refresh();
  } catch (e) { alert(e.message); }
}
async function adminOpenPlayer(id) {
  const j = await api('/api/admin/player/' + id);
  const p = j.player;
  const inv = (j.inventory || []).filter(x => x.qty > 0).map(x => `${esc(x.name)} x${x.qty}`).join('｜') || '無';
  modal(`<h3>玩家 ${esc(p.username)}｜ID ${p.id}</h3><div class="settings-grid">
    <label>等級<input id="adm_level" type="number" value="${p.level}"></label>
    <label>EXP<input id="adm_exp" type="number" value="${p.exp}"></label>
    <label>金幣<input id="adm_gold" type="number" value="${p.gold}"></label>
    <label>HP<input id="adm_hp" type="number" value="${p.hp}"></label>
    <label>HP上限<input id="adm_hpMax" type="number" value="${p.hpMax || p.hpmax}"></label>
    <label>疲勞<input id="adm_stamina" type="number" value="${p.stamina}"></label>
    <label>BOSS碎片<input id="adm_bossFragments" type="number" value="${p.bossFragments || p.bossfragments || 0}"></label>
  </div><p class="small">背包：${inv}</p><button onclick="adminUpdatePlayer(${p.id})">儲存玩家資料</button><button onclick="adminBanPlayer(${p.id},${p.banned ? 0 : 1})">${p.banned ? '解除停權' : '停權帳號'}</button>`);
}
async function adminUpdatePlayer(id) {
  await adminPost('/api/admin/player/' + id + '/update', { level: adm_level.value, exp: adm_exp.value, gold: adm_gold.value, hp: adm_hp.value, hpMax: adm_hpMax.value, stamina: adm_stamina.value, bossFragments: adm_bossFragments.value });
}
async function adminBanPlayer(id, banned) {
  await adminPost('/api/admin/player/' + id + '/ban', { banned });
}
async function adminGrantMaterial() {
  await adminPost('/api/admin/grant/material', { playerId: grantPlayerId.value, sku: grantSku.value, qty: grantQty.value });
}
async function adminGrantResource() {
  await adminPost('/api/admin/grant/resource', { playerId: grantPlayerId.value, gold: grantGold.value, stamina: grantStamina.value });
}
async function adminGrantGold() {
  await adminPost('/api/admin/grant/gold', { playerId: $('#grantPlayerId').value, gold: $('#grantGold').value });
}
async function adminGrantStamina() {
  await adminPost('/api/admin/grant/stamina', { playerId: $('#grantPlayerId').value, stamina: $('#grantStamina').value });
}
async function adminEditGuild(name, level, treasury, notice) {
  modal(`<h3>公會管理：${esc(name)}</h3><label>等級<input id="admGuildLevel" type="number" value="${level}"></label><label>金庫<input id="admGuildTreasury" type="number" value="${treasury}"></label><textarea id="admGuildNotice">${esc(notice || '')}</textarea><button onclick="adminSaveGuild('${encodeURIComponent(name)}')">儲存公會</button>`);
}
async function adminSaveGuild(nameEncoded) {
  await adminPost('/api/admin/guild/update', { name: decodeURIComponent(nameEncoded), level: admGuildLevel.value, treasury: admGuildTreasury.value, notice: admGuildNotice.value });
}
async function adminDisbandGuild(name) {
  await adminPost('/api/admin/guild/disband', { name });
}
async function adminSaveSettings() {
  const settings = {};
  ['fatigueTraining', 'fatigueDungeon', 'fatigueBoss', 'fatigueArena', 'restCost', 'dungeonEquipmentDropRate', 'bossEquipmentDropRate', 'bossFragmentDropRate', 'bossFragmentBonusDropRate']
    .forEach(k => { settings[k] = document.querySelector('#set_' + k)?.value; });
  await adminPost('/api/admin/settings', { settings });
}
async function adminCreateAnnouncement() {
  await adminPost('/api/admin/announcement', { title: annTitle.value, text: annText.value });
}
async function adminToggleAnnouncement(id, active) {
  await adminPost('/api/admin/announcement/' + id + '/toggle', { active });
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
    ${rankTable('競技場積分排行 TOP 10', withClass(j.arena), [{ key: 'username', label: '玩家' }, { key: 'className', label: '職業' }, { key: 'arenaPoints', label: '積分', align: 'num' }, { key: 'arenaTier', label: '段位' }, { key: 'record', label: '戰績' }, { key: 'winRate', label: '勝率', align: 'num' }])}
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
