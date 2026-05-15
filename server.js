import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.warn('WARNING: DATABASE_URL is not set. PostgreSQL connection will fail until you set it.');
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000
});
const q = (text, params = []) => pool.query(text, params);
const one = async (text, params = []) => (await q(text, params)).rows[0] || null;
const all = async (text, params = []) => (await q(text, params)).rows;

const CLASSES = {
  risk_guardian: { name: '風管盾衛', role: '坦克', hp: 165, atk: 17, def: 17, focus: 8, skill: '壓力測試壁壘', desc: '以資本適足率與壓力測試保護團隊。' },
  legal_arcanist: { name: '法遵聖典師', role: '輔助/控場', hp: 120, atk: 15, def: 10, focus: 18, skill: '監理敕令', desc: '用法規光環降低敵方輸出並恢復隊友。' },
  cyber_warden: { name: '資安夜巡者', role: '干擾', hp: 128, atk: 19, def: 12, focus: 15, skill: '零信任封鎖', desc: '偵測弱點、封鎖攻擊鏈並反制。' },
  market_blader: { name: '市場操盤劍士', role: '爆發攻擊', hp: 118, atk: 25, def: 8, focus: 13, skill: '高頻斬擊', desc: '掌握匯率、利率與股債波動造成爆發。' },
  credit_alchemist: { name: '授信鍊金師', role: '均衡/召喚', hp: 135, atk: 20, def: 12, focus: 12, skill: '擔保品鍊成', desc: '把現金流與抵押品轉化成攻防資源。' },
  fintech_bard: { name: '數金吟遊詩人', role: '輔助/敏捷', hp: 112, atk: 18, def: 9, focus: 22, skill: 'API 共鳴曲', desc: '用開放銀行與資料串接增益隊伍。' }
};
const SLOTS = ['頭','衣服','褲子','鞋子','武器','副武器','飾品一','飾品二'];
const RARITIES = ['普通','精良','稀有','史詩','傳說','神話'];
const SHOP = [
 ['小型紅利藥水','potion_hp_s',120,'恢復 60 HP',5], ['中型流動性藥水','potion_hp_m',300,'恢復 150 HP',3], ['大型資本藥水','potion_hp_l',700,'恢復 350 HP',1],
 ['風險緩釋卷軸','buff_def',500,'下一場防禦 +20%',2], ['市場動能卷軸','buff_atk',500,'下一場攻擊 +20%',2], ['資安補丁','cleanse',360,'移除負面狀態',2],
 ['法遵祝禱','buff_focus',420,'下一場專注 +25%',2], ['疲勞咖啡','stamina_20',260,'恢復 20 疲勞',3], ['特調能量飲','stamina_50',680,'恢復 50 疲勞',1],
 ['強化晶片 I','enhance_1',180,'裝備強化材料',10], ['強化晶片 II','enhance_2',520,'較高強化成功率',5], ['附魔墨水','enchant_ink',420,'附魔材料',5],
 ['特化核心','special_core',1200,'特化材料',2], ['稽核護符','audit_charm',250,'降低地下城損傷',3], ['交易靴油','speed_oil',220,'競技場先手率提升',3],
 ['KYC 透鏡','kyc_lens',300,'提高掉寶品質',2], ['備援磁帶','backup_tape',260,'死亡時降低金幣損失',2], ['清算憑證','clear_token',180,'公會戰消耗品',5],
 ['合規印章','compliance_seal',520,'BOSS 戰額外獎勵率',2], ['防火牆符文','firewall_rune',540,'資安類傷害減免',2], ['VAR 石板','var_tablet',540,'市場類傷害減免',2],
 ['AML 香爐','aml_incense',400,'干擾命中提升',3], ['資料湖瓶','data_lake',480,'技能效果提升',3], ['利率羅盤','rate_compass',360,'攻擊小幅提升',3],
 ['匯率護目鏡','fx_goggles',360,'閃避小幅提升',3], ['保證金腰包','margin_pouch',300,'金幣獎勵小幅提升',3], ['帳務便當','bento',160,'休息額外回復',4],
 ['客服號角','service_horn',220,'公會貢獻提升',3], ['冷錢包','cold_wallet',600,'PK 敗北保護',2], ['董事會邀請函','board_invite',1500,'高階活動入場券',1]
];
const BOSSES = [
 ['週一','系統性風暴龍','VaR 破界者','risk','龍形金融風暴，會以連鎖違約火焰灼燒全場。'], ['週二','監理審判天使','裁罰之翼','legal','揮舞金色法典，讓違規者沉默。'], ['週三','零日惡意程式王','漏洞皇冠','cyber','從暗網裂縫現身，散播勒索毒霧。'], ['週四','黑天鵝交易魔像','波動吞噬者','market','市場異常波動凝結出的巨像。'], ['週五','流動性深淵鯨','資金斷鏈者','credit','吞噬現金流的深海怪物。'], ['週六','資料湖海妖','API 迷航者','fintech','歌聲會讓資料管線混亂。'], ['週日','央行古龍','利率終局者','macro','以升降息龍息重塑戰場。']
];
const bossRooms = new Map();

function todayKey(){ return new Date().toISOString().slice(0,10); }
function now(){ return Date.now(); }
function bossIndex(){ return new Date().getUTCDay() === 0 ? 6 : new Date().getUTCDay()-1; }
function rand(n){ return Math.floor(Math.random()*n); }
function rarityForLevel(level){ return RARITIES[Math.min(5, Math.floor((level-1)/10))]; }
function itemFor(clsKey, slot, level, boss=false){ const c=CLASSES[clsKey]||CLASSES.risk_guardian; const rare=boss?'BOSS神鑄':rarityForLevel(level); const base=level*3+(boss?80:0); return { clsKey, slot, level, rarity: rare, name: `${c.name}${boss?'・世界王':'・第'+level+'層'}${slot}`, atk: Math.round(base*(slot.includes('武器')?1.5:.35)), def: Math.round(base*(['頭','衣服','褲子','鞋子'].includes(slot)?.9:.25)), focus: Math.round(base*(slot.includes('飾品')||slot==='副武器'?1.1:.3)), enhance:0, enchant:'未附魔', spec:'未特化' }; }
function stats(player){ const eq = typeof player.equipment === 'string' ? JSON.parse(player.equipment||'{}') : (player.equipment||{}); let s={hpMax:player.hpmax, atk:player.atk, def:player.def, focus:player.focus}; Object.values(eq).forEach(it=>{ if(!it)return; const mult=1+(it.enhance||0)*0.04; s.atk += Math.round((it.atk||0)*mult); s.def += Math.round((it.def||0)*mult); s.focus += Math.round((it.focus||0)*mult); }); return s; }
function stamina(player){ const elapsed = Math.max(0, now()-Number(player.staminaat)); const regen = Math.floor(elapsed/3600000*25); const val=Math.min(200, Number(player.stamina)+regen); return {val, at: regen>0? now(): Number(player.staminaat)}; }
function sign(user){ return jwt.sign({id:user.id, username:user.username}, JWT_SECRET, {expiresIn:'8h'}); }
function normalizePlayer(p){ if(!p) return p; p.userId=p.userid; p.hpMax=p.hpmax; p.staminaAt=Number(p.staminaat); p.bossFragments=p.bossfragments; p.dungeonSave=p.dungeonsave; p.classKey=p.classkey; return p; }
async function auth(req,res,next){ const h=req.headers.authorization||''; const t=h.startsWith('Bearer ')?h.slice(7):null; if(!t) return res.status(401).json({error:'未登入'}); try{ req.user=jwt.verify(t,JWT_SECRET); next(); }catch{ res.status(401).json({error:'Token 已失效'}); } }
async function socketAuth(socket,next){ const token = socket.handshake.auth?.token; if(!token) return next(new Error('未登入')); try{ socket.user = jwt.verify(token, JWT_SECRET); next(); }catch{ next(new Error('Token 已失效')); } }

async function initDb(){
  await q(`CREATE TABLE IF NOT EXISTS users(id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, passwordHash TEXT NOT NULL, createdAt BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS players(id SERIAL PRIMARY KEY, userId INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE, classKey TEXT NOT NULL, level INTEGER NOT NULL, exp INTEGER NOT NULL, gold INTEGER NOT NULL, hp INTEGER NOT NULL, hpMax INTEGER NOT NULL, atk INTEGER NOT NULL, def INTEGER NOT NULL, focus INTEGER NOT NULL, stamina INTEGER NOT NULL, staminaAt BIGINT NOT NULL, equipment JSONB NOT NULL, dungeonSave JSONB NOT NULL, guild TEXT DEFAULT '', bossFragments INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS dungeon_claims(playerId INTEGER REFERENCES players(id) ON DELETE CASCADE, floor INTEGER, claimedAt BIGINT, PRIMARY KEY(playerId,floor));
CREATE TABLE IF NOT EXISTS purchases(playerId INTEGER REFERENCES players(id) ON DELETE CASCADE, sku TEXT, day TEXT, qty INTEGER, PRIMARY KEY(playerId,sku,day));
CREATE TABLE IF NOT EXISTS boss_state(day TEXT PRIMARY KEY, bossIdx INTEGER, hp INTEGER, maxHp INTEGER, killed INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS boss_damage(day TEXT, playerId INTEGER REFERENCES players(id) ON DELETE CASCADE, damage INTEGER, PRIMARY KEY(day,playerId));
CREATE TABLE IF NOT EXISTS battle_log(id SERIAL PRIMARY KEY, playerId INTEGER REFERENCES players(id) ON DELETE CASCADE, mode TEXT, text TEXT, createdAt BIGINT);`);
}
async function getPlayer(uid){ const p=normalizePlayer(await one('SELECT * FROM players WHERE userId=$1',[uid])); if(!p) return null; const st=stamina(p); if(st.val!==p.stamina||st.at!==p.staminaAt){ await q('UPDATE players SET stamina=$1, staminaAt=$2 WHERE id=$3',[st.val,st.at,p.id]); p.stamina=st.val; p.staminaat=st.at; p.staminaAt=st.at;} return p; }
async function spend(p,cost){ if(p.stamina<cost) return false; await q('UPDATE players SET stamina=$1, staminaAt=$2 WHERE id=$3',[p.stamina-cost,now(),p.id]); p.stamina -= cost; p.staminaat=now(); return true; }
async function log(pid,mode,text){ await q('INSERT INTO battle_log(playerId,mode,text,createdAt) VALUES($1,$2,$3,$4)',[pid,mode,text,now()]); }
async function ensureBoss(){ const day=todayKey(), idx=bossIndex(); let b=await one('SELECT * FROM boss_state WHERE day=$1',[day]); if(!b){ const hp=60000; await q('INSERT INTO boss_state(day,bossIdx,hp,maxHp,killed) VALUES($1,$2,$3,$4,0) ON CONFLICT(day) DO NOTHING',[day,idx,hp,hp]); b=await one('SELECT * FROM boss_state WHERE day=$1',[day]); } return b; }

const app=express();
const server=http.createServer(app);
const io=new Server(server,{ cors:{ origin:'*', methods:['GET','POST'] } });
io.use(socketAuth);
app.use(helmet({contentSecurityPolicy:false})); app.use(cors()); app.use(express.json({limit:'1mb'})); app.use(express.static(path.join(__dirname,'public')));

app.get('/api/meta',(req,res)=>res.json({classes:CLASSES, slots:SLOTS, shop:SHOP, bosses:BOSSES, fatigue:{max:200, regenPerHour:25, costs:{training:10,dungeon:18,arena:15,guildWar:30,boss:25}}}));
app.post('/api/register', async (req,res)=>{ const {username,password,classKey}=req.body; if(!/^[a-zA-Z0-9_]{3,18}$/.test(username||'')) return res.status(400).json({error:'帳號需 3-18 字英數底線'}); if((password||'').length<8) return res.status(400).json({error:'密碼至少 8 字'}); if(!CLASSES[classKey]) return res.status(400).json({error:'請選職業'}); try{ const hash=await bcrypt.hash(password,12); const u=await one('INSERT INTO users(username,passwordHash,createdAt) VALUES($1,$2,$3) RETURNING id,username',[username,hash,now()]); const c=CLASSES[classKey]; const eq={}; SLOTS.forEach(s=>eq[s]=itemFor(classKey,s,1)); await q('INSERT INTO players(userId,classKey,level,exp,gold,hp,hpMax,atk,def,focus,stamina,staminaAt,equipment,dungeonSave,guild,bossFragments) VALUES($1,$2,1,0,1000,$3,$4,$5,$6,$7,200,$8,$9,$10,$11,0)',[u.id,classKey,c.hp,c.hp,c.atk,c.def,c.focus,now(),JSON.stringify(eq),JSON.stringify({floor:1,hp:c.hp}),'']); res.json({token:sign(u), username}); }catch(e){ res.status(400).json({error:'帳號已存在或資料庫錯誤'}); } });
app.post('/api/login', async (req,res)=>{ const u=await one('SELECT * FROM users WHERE username=$1',[req.body.username]); if(!u||!await bcrypt.compare(req.body.password||'',u.passwordhash)) return res.status(401).json({error:'帳號或密碼錯誤'}); res.json({token:sign(u), username:u.username}); });
app.get('/api/me',auth,async(req,res)=>{ const p=await getPlayer(req.user.id); res.json({user:req.user, player:p, stats:stats(p), logs:await all('SELECT * FROM battle_log WHERE playerId=$1 ORDER BY id DESC LIMIT 20',[p.id])}); });
app.post('/api/rest',auth,async(req,res)=>{ const p=await getPlayer(req.user.id); const heal=Math.min(p.hpmax-p.hp, Math.round(p.hpmax*.35)); await q('UPDATE players SET hp=$1 WHERE id=$2',[p.hp+heal,p.id]); res.json({message:`你在分行休息室吃了帳務便當，恢復 ${heal} HP。`}); });
app.post('/api/training',auth,async(req,res)=>{ const p=await getPlayer(req.user.id); if(!await spend(p,10)) return res.status(400).json({error:'疲勞不足'}); const s=stats(p), mdef=5+p.level*2; let dmg=Math.max(1,s.atk+rand(s.focus+8)-mdef), taken=Math.max(0,10+p.level*3+rand(20)-s.def); let hp=Math.max(1,p.hp-taken), exp=25+p.level*8+rand(20); let lvl=p.level, hpMax=p.hpmax, atk=p.atk, def=p.def, focus=p.focus; if(p.exp+exp>=lvl*120){ lvl++; hpMax+=12; atk+=2; def+=1; focus+=1; hp=hpMax; exp=0; } else exp=p.exp+exp; await q('UPDATE players SET hp=$1, exp=$2, level=$3, hpMax=$4, atk=$5, def=$6, focus=$7 WHERE id=$8',[hp,exp,lvl,hpMax,atk,def,focus,p.id]); const text=`練功場：你用 ${CLASSES[p.classkey].skill} 對「逾放怨靈」造成 ${dmg} 傷害，對方反擊造成 ${taken} 傷害，獲得 ${exp} EXP。`; await log(p.id,'training',text); res.json({text}); });
app.post('/api/dungeon',auth,async(req,res)=>{ const floor=Math.max(1,Math.min(50,Number(req.body.floor||1))); const p=await getPlayer(req.user.id); if(!await spend(p,18)) return res.status(400).json({error:'疲勞不足'}); const s=stats(p), enemyHp=110+floor*35, enemyAtk=18+floor*5, enemyDef=8+floor*3; let rounds=[], hp=p.hp, ehp=enemyHp; for(let r=1;r<=6&&hp>0&&ehp>0;r++){ const dmg=Math.max(1,s.atk+rand(s.focus+floor)-enemyDef); ehp-=dmg; const taken=ehp>0?Math.max(0,enemyAtk+rand(floor*2+8)-s.def):0; hp-=taken; rounds.push(`第${r}回合：${CLASSES[p.classkey].skill} 命中「第${floor}層金融迷宮守衛」造成 ${dmg}，你受到 ${taken}。`); } const win=ehp<=0; let gold=0, item=null, claimText=''; if(win){ const claim=await one('SELECT * FROM dungeon_claims WHERE playerId=$1 AND floor=$2',[p.id,floor]); if(!claim||now()-Number(claim.claimedat)>259200000){ gold=120+floor*45; await q('INSERT INTO dungeon_claims(playerId,floor,claimedAt) VALUES($1,$2,$3) ON CONFLICT(playerId,floor) DO UPDATE SET claimedAt=EXCLUDED.claimedAt',[p.id,floor,now()]); claimText=`金幣 ${gold} 已領取（三天後可再領）。`; } else claimText='此層金幣三天冷卻中。'; item=itemFor(p.classkey,SLOTS[rand(SLOTS.length)],floor); await q('UPDATE players SET hp=$1, gold=gold+$2, dungeonSave=$3 WHERE id=$4',[Math.max(1,hp),gold,JSON.stringify({floor:Math.min(50,floor+1),hp:Math.max(1,hp)}),p.id]); } else await q('UPDATE players SET hp=$1, dungeonSave=$2 WHERE id=$3',[Math.max(1,hp),JSON.stringify({floor,hp:Math.max(1,hp)}),p.id]); const text=`地下城第 ${floor} 層「${['金庫荒廢區','ATM墓園','利率鐘塔','法遵圖書館','董事會深淵'][floor%5]}」${win?'通關':'撤退'}。${rounds.join(' ')} ${claimText}`; await log(p.id,'dungeon',text); res.json({win,text,item}); });
app.post('/api/equip',auth,async(req,res)=>{ const p=await getPlayer(req.user.id); const item=req.body.item; if(!item||!SLOTS.includes(item.slot)) return res.status(400).json({error:'裝備格式錯誤'}); const eq=typeof p.equipment==='string'?JSON.parse(p.equipment):p.equipment; eq[item.slot]=item; await q('UPDATE players SET equipment=$1 WHERE id=$2',[JSON.stringify(eq),p.id]); res.json({message:`已替換 ${item.slot}：${item.name}`}); });
app.post('/api/enhance',auth,async(req,res)=>{ const p=await getPlayer(req.user.id); const slot=req.body.slot; const eq=typeof p.equipment==='string'?JSON.parse(p.equipment):p.equipment; if(!eq[slot]) return res.status(400).json({error:'沒有此裝備'}); const price=200+(eq[slot].enhance||0)*180; if(p.gold<price) return res.status(400).json({error:'金幣不足'}); const chance=Math.max(.35,.9-(eq[slot].enhance||0)*.07); const ok=Math.random()<chance; if(ok) eq[slot].enhance=(eq[slot].enhance||0)+1; await q('UPDATE players SET gold=gold-$1, equipment=$2 WHERE id=$3',[price,JSON.stringify(eq),p.id]); res.json({message:ok?`強化成功！${slot} +${eq[slot].enhance}`:`強化失敗，消耗 ${price} 金幣。`}); });
app.post('/api/enchant',auth,async(req,res)=>{ const p=await getPlayer(req.user.id); const slot=req.body.slot; const ench=['風管屏障','法遵聖光','資安封包','市場動能','授信擔保','數金串流'][rand(6)]; const eq=typeof p.equipment==='string'?JSON.parse(p.equipment):p.equipment; if(!eq[slot]) return res.status(400).json({error:'沒有此裝備'}); if(p.gold<500) return res.status(400).json({error:'金幣不足'}); eq[slot].enchant=ench; eq[slot].focus+=8; await q('UPDATE players SET gold=gold-500, equipment=$1 WHERE id=$2',[JSON.stringify(eq),p.id]); res.json({message:`附魔成功：${ench}`}); });
app.post('/api/specialize',auth,async(req,res)=>{ const p=await getPlayer(req.user.id); const slot=req.body.slot; const spec=req.body.spec||'攻擊特化'; const eq=typeof p.equipment==='string'?JSON.parse(p.equipment):p.equipment; if(!eq[slot]) return res.status(400).json({error:'沒有此裝備'}); if(p.gold<1200) return res.status(400).json({error:'金幣不足'}); eq[slot].spec=spec; if(spec.includes('攻')) eq[slot].atk+=18; else if(spec.includes('防')) eq[slot].def+=18; else eq[slot].focus+=18; await q('UPDATE players SET gold=gold-1200, equipment=$1 WHERE id=$2',[JSON.stringify(eq),p.id]); res.json({message:`${slot} 已完成 ${spec}`}); });
app.post('/api/shop/buy',auth,async(req,res)=>{ const p=await getPlayer(req.user.id); const it=SHOP.find(x=>x[1]===req.body.sku); if(!it) return res.status(404).json({error:'無此商品'}); const day=todayKey(); const row=await one('SELECT qty FROM purchases WHERE playerId=$1 AND sku=$2 AND day=$3',[p.id,it[1],day]); if((row?.qty||0)>=it[4]) return res.status(400).json({error:'今日購買上限'}); if(p.gold<it[2]) return res.status(400).json({error:'金幣不足'}); let hp=p.hp, stamina=p.stamina; if(it[1].startsWith('potion_hp')) hp=Math.min(p.hpmax,p.hp+(it[1].endsWith('_s')?60:it[1].endsWith('_m')?150:350)); if(it[1].startsWith('stamina')) stamina=Math.min(200,p.stamina+(it[1].includes('20')?20:50)); await q('UPDATE players SET gold=gold-$1, hp=$2, stamina=$3 WHERE id=$4',[it[2],hp,stamina,p.id]); await q('INSERT INTO purchases(playerId,sku,day,qty) VALUES($1,$2,$3,$4) ON CONFLICT(playerId,sku,day) DO UPDATE SET qty=EXCLUDED.qty',[p.id,it[1],day,(row?.qty||0)+1]); res.json({message:`購買 ${it[0]} 成功。`}); });
app.post('/api/arena',auth,async(req,res)=>{ const p=await getPlayer(req.user.id); if(!await spend(p,15)) return res.status(400).json({error:'疲勞不足'}); const opp=normalizePlayer(await one('SELECT p.*,u.username FROM players p JOIN users u ON u.id=p.userId WHERE p.id<>$1 ORDER BY RANDOM() LIMIT 1',[p.id])); if(!opp) return res.json({text:'競技場目前沒有對手。'}); const a=stats(p), b=stats(opp); const dmg=Math.max(1,a.atk+rand(a.focus+20)-b.def), taken=Math.max(1,b.atk+rand(b.focus+20)-a.def); const win=dmg>=taken; const gold=win?80:20; await q('UPDATE players SET gold=gold+$1 WHERE id=$2',[gold,p.id]); const text=`PK 競技場：你對 ${opp.username} 造成 ${dmg} 傷害，受到 ${taken} 傷害，${win?'勝利':'敗北'}，獲得 ${gold} 金幣。`; await log(p.id,'arena',text); res.json({text}); });
app.post('/api/guild',auth,async(req,res)=>{ const name=(req.body.guild||'').slice(0,12); const p=await getPlayer(req.user.id); await q('UPDATE players SET guild=$1 WHERE id=$2',[name,p.id]); res.json({message:name?`已加入/創立公會：${name}`:'已離開公會'}); });
app.post('/api/guild-war',auth,async(req,res)=>{ const p=await getPlayer(req.user.id); if(!p.guild) return res.status(400).json({error:'先加入公會'}); if(!await spend(p,30)) return res.status(400).json({error:'疲勞不足'}); const score=stats(p).atk+stats(p).def+rand(80); const text=`攻城戰：${p.guild} 突襲「金控王城清算門」，你貢獻 ${score} 城牆破壞值。`; await log(p.id,'guild-war',text); io.to('guild-war').emit('battleLog',{mode:'guild-war', text, at:now()}); res.json({text}); });
app.get('/api/boss',auth,async(req,res)=>{ const day=todayKey(), idx=bossIndex(); const b=await ensureBoss(); res.json({state:b,boss:BOSSES[idx], leaderboard:await all('SELECT u.username,bd.damage FROM boss_damage bd JOIN players p ON p.id=bd.playerId JOIN users u ON u.id=p.userId WHERE bd.day=$1 ORDER BY bd.damage DESC LIMIT 20',[day])}); });
app.post('/api/boss/attack',auth,async(req,res)=>{ const result=await performBossAttack(req.user.id); res.status(result.status||200).json(result.body); });
app.post('/api/boss/craft',auth,async(req,res)=>{ const p=await getPlayer(req.user.id); if(p.bossfragments<30) return res.status(400).json({error:'碎片不足 30'}); const it=itemFor(p.classkey,SLOTS[rand(SLOTS.length)],50,true); await q('UPDATE players SET bossFragments=bossFragments-30 WHERE id=$1',[p.id]); res.json({message:'已合成隨機 BOSS 裝備', item:it}); });
app.get('/api/leaderboards',async(req,res)=>{ res.json({level:await all('SELECT u.username,p.level,p.classKey FROM players p JOIN users u ON u.id=p.userId ORDER BY p.level DESC,p.exp DESC LIMIT 20'), gold:await all('SELECT u.username,p.gold,p.classKey FROM players p JOIN users u ON u.id=p.userId ORDER BY p.gold DESC LIMIT 20'), boss:await all('SELECT u.username,bd.damage FROM boss_damage bd JOIN players p ON p.id=bd.playerId JOIN users u ON u.id=p.userId WHERE bd.day=$1 ORDER BY bd.damage DESC LIMIT 20',[todayKey()])}); });
app.get('/api/catalog',(req,res)=>{ const out={}; Object.keys(CLASSES).forEach(c=>{ out[c]={}; SLOTS.forEach(s=>{ out[c][s]=Array.from({length:50},(_,i)=>itemFor(c,s,i+1)); }); }); res.json(out); });

async function performBossAttack(userId){
  const p=await getPlayer(userId); if(!p) return {status:404, body:{error:'角色不存在'}};
  if(!await spend(p,25)) return {status:400, body:{error:'疲勞不足'}};
  const b=await ensureBoss(); if(b.killed) return {status:400, body:{error:'今日 BOSS 已被擊退'}};
  const s=stats(p); const dmg=Math.max(50,s.atk*6+s.focus*3+rand(250)); const hp=Math.max(0,b.hp-dmg);
  await q('UPDATE boss_state SET hp=$1, killed=$2 WHERE day=$3',[hp,hp<=0?1:0,todayKey()]);
  const old=await one('SELECT damage FROM boss_damage WHERE day=$1 AND playerId=$2',[todayKey(),p.id]);
  await q('INSERT INTO boss_damage(day,playerId,damage) VALUES($1,$2,$3) ON CONFLICT(day,playerId) DO UPDATE SET damage=EXCLUDED.damage',[todayKey(),p.id,(old?.damage||0)+dmg]);
  let body;
  if(Math.random()<.04||hp<=0){ const bi=BOSSES[b.bossidx]; const it=itemFor(p.classkey,SLOTS[rand(SLOTS.length)],50,true); it.name=`${bi[2]}・${it.slot}`; body={text:`世界 BOSS：${p.username||'玩家'} 造成 ${dmg} 傷害。超低機率掉落！可選擇替換 ${it.name}`, item:it}; }
  else { const frag=1+rand(3); await q('UPDATE players SET bossFragments=bossFragments+$1 WHERE id=$2',[frag,p.id]); body={text:`世界 BOSS：你造成 ${dmg} 傷害，獲得 ${frag} 個 BOSS 碎片。剩餘 HP ${hp}/${b.maxhp}`, damage:dmg, hp, maxHp:b.maxhp}; }
  io.to('world-boss').emit('bossUpdate',{attacker:p.username||`玩家${p.id}`, damage:dmg, hp, maxHp:b.maxhp, killed:hp<=0, text:body.text, at:now()});
  return {body};
}

io.on('connection', async (socket) => {
  const p=await getPlayer(socket.user.id);
  const username=socket.user.username;
  socket.emit('battleLog',{mode:'system', text:`${username} 已連線即時戰鬥伺服器。`, at:now()});
  socket.on('joinBattle', async ({ battleId }) => {
    const room = ['world-boss','guild-war','arena'].includes(battleId) ? battleId : 'arena';
    socket.join(room);
    socket.to(room).emit('battleLog',{mode:room, text:`${username} 進入 ${room} 戰場。`, at:now()});
    if(room === 'world-boss') {
      const b=await ensureBoss();
      socket.emit('bossUpdate',{hp:b.hp, maxHp:b.maxhp, killed:!!b.killed, text:'已同步世界 BOSS 狀態。', at:now()});
    }
  });
  socket.on('bossAttack', async () => {
    const result=await performBossAttack(socket.user.id);
    socket.emit('actionResult',result.body);
  });
  socket.on('arenaStrike', async ({ target='競技場對手' } = {}) => {
    const player=await getPlayer(socket.user.id); const s=stats(player); const damage=Math.max(1,s.atk+rand(s.focus+30));
    const text=`即時競技場：${username} 對 ${target} 造成 ${damage} 傷害。`;
    await log(player.id,'socket-arena',text);
    io.to('arena').emit('battleLog',{mode:'arena', text, damage, at:now()});
  });
});

app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

initDb().then(()=>server.listen(PORT,()=>console.log(`Finance RPG PG + Socket.IO running on ${PORT}`))).catch(err=>{ console.error('Database init failed:',err); process.exit(1); });
