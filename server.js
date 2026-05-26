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
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_USERNAMES = MasterTest Set(String(process.env.ADMIN_USERNAMES || '').split(',').map(x => x.trim()).filter(Boolean));

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
async function transaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work((text, params = []) => client.query(text, params));
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

const CLASSES = {
  credit_alchemist: {
    name: 'RM 企金劍士',
    role: '均衡攻擊 / 授信支援',
    image: 'assets/images/classes/credit_alchemist.png',
    hp: 138,
    atk: 21,
    def: 12,
    focus: 12,
    skill: '企業授信斬',
    desc: '以企業授信、擔保品與現金流判讀切入敵陣，是穩健又能輸出的前線職業。',
    skills: [
      { name: '企業授信斬', type: '攻擊', power: 1.12, desc: '讀取財報破綻後斬擊，對單體造成穩定傷害。' },
      { name: '擔保品鍊成', type: '防禦', power: 0.95, guard: 0.22, desc: '把抵押品化為護盾，降低本回合受到的傷害。' },
      { name: '現金流追擊', type: '連擊', power: 1.04, desc: '追蹤營運現金流，若市場穩定可追加一次小額傷害。' },
      { name: '授信審查眼', type: '干擾', power: 0.9, focusBoost: 16, desc: '標記敵方弱點，提升專注判定。' },
      { name: '契約封印', type: '控制', power: 0.98, guard: 0.1, desc: '用契約條款限制敵人下回合輸出。' }
    ]
  },
  risk_guardian: {
    name: '風控盾衛',
    role: '坦克 / 減傷',
    image: 'assets/images/classes/risk_guardian.png',
    hp: 168,
    atk: 17,
    def: 18,
    focus: 8,
    skill: '壓力測試壁壘',
    desc: '以資本適足率、壓力測試與限額制度保護隊伍，適合承受高壓戰鬥。',
    skills: [
      { name: '壓力測試壁壘', type: '防禦', power: 0.88, guard: 0.34, desc: '建立壓力情境護盾，大幅降低受到的傷害。' },
      { name: 'VaR 反制盾擊', type: '反擊', power: 1.05, guard: 0.16, desc: '用風險值計算反打，攻守兼備。' },
      { name: '資本緩衝姿態', type: '坦克', power: 0.82, guard: 0.42, desc: '犧牲輸出換取強力減傷。' },
      { name: '曝險限額鎖鏈', type: '控制', power: 0.95, focusBoost: 12, desc: '限制敵方曝險，降低其爆發。' },
      { name: '極端情境預警', type: '輔助', power: 0.9, guard: 0.24, desc: '提前預警危機，讓下一段傷害更容易被吸收。' }
    ]
  },
  market_blader: {
    name: '量化操盤師',
    role: '爆發攻擊 / 市場操作',
    image: 'assets/images/classes/market_blader.png',
    hp: 118,
    atk: 26,
    def: 8,
    focus: 14,
    skill: '高頻斬擊',
    desc: '以匯率、利率、股債波動與模型訊號造成爆發，輸出高但需要注意血量。',
    skills: [
      { name: '高頻斬擊', type: '爆發', power: 1.24, desc: '抓住毫秒級價差，對目標造成高傷害。' },
      { name: '殖利率曲線切割', type: '攻擊', power: 1.13, focusBoost: 8, desc: '沿著殖利率曲線斜率劈開護甲。' },
      { name: '匯率避險閃身', type: '閃避', power: 0.98, guard: 0.18, desc: '利用避險部位降低反擊傷害。' },
      { name: '動能突破', type: '連擊', power: 1.18, desc: '順勢追擊，適合對付低防禦敵人。' },
      { name: '停損紀律', type: '防禦', power: 0.78, guard: 0.38, desc: '立即停損撤退，降低承受風險。' }
    ]
  },
  fintech_bard: {
    name: 'AML 洗防影行者',
    role: '偵查 / 干擾',
    image: 'assets/images/classes/fintech_bard.png',
    hp: 124,
    atk: 19,
    def: 10,
    focus: 20,
    skill: '可疑交易追蹤',
    desc: '潛行於金流軌跡間，利用 KYC、交易監控與可疑樣態干擾敵人。',
    skills: [
      { name: '可疑交易追蹤', type: '偵查', power: 1.02, focusBoost: 18, desc: '鎖定異常金流，提高命中與暴擊判定。' },
      { name: 'KYC 透鏡', type: '弱化', power: 0.96, focusBoost: 14, desc: '辨識實質受益人，降低敵方隱匿效果。' },
      { name: '黑名單封鎖', type: '控制', power: 1.0, guard: 0.12, desc: '封鎖高風險對象，削弱反擊。' },
      { name: '洗錢樣態爆破', type: '爆發', power: 1.17, desc: '揭露分散交易軌跡，造成高額干擾傷害。' },
      { name: '申報警示煙霧', type: '輔助', power: 0.86, guard: 0.25, desc: '建立通報煙幕，降低隊伍受到的壓力。' }
    ]
  },
  cyber_warden: {
    name: '資安夜巡者',
    role: '干擾 / 反制',
    image: 'assets/images/classes/cyber_warden.png',
    hp: 128,
    atk: 20,
    def: 12,
    focus: 16,
    skill: '零信任封鎖',
    desc: '偵測社交工程、阻斷勒索攻擊鏈並封鎖異常連線，擅長控制戰場。',
    skills: [
      { name: '零信任封鎖', type: '控制', power: 1.04, guard: 0.16, desc: '逐一驗證連線，削弱敵方攻擊鏈。' },
      { name: '釣魚信反制', type: '反擊', power: 1.14, focusBoost: 10, desc: '識破釣魚信件後回擊惡意程式。' },
      { name: 'MFA 聖印', type: '防禦', power: 0.82, guard: 0.4, desc: '啟動多因子認證護盾，大幅降低傷害。' },
      { name: '弱點掃描箭', type: '攻擊', power: 1.1, focusBoost: 12, desc: '掃出 CVE 弱點後精準射擊。' },
      { name: '備援還原術', type: '續戰', power: 0.85, guard: 0.28, desc: '切換備援節點，降低戰鬥損耗。' }
    ]
  },
  legal_arcanist: {
    name: '法遵分行聖騎',
    role: '輔助 / 控場',
    image: 'assets/images/classes/legal_arcanist.png',
    hp: 130,
    atk: 15,
    def: 12,
    focus: 20,
    skill: '監理敕令',
    desc: '以公平待客、金融消保與內控稽核為聖典，能支援隊伍並封印違規魔物。',
    skills: [
      { name: '監理敕令', type: '控制', power: 1.0, focusBoost: 18, desc: '召喚監理法典，讓敵方輸出下降。' },
      { name: '公平待客祝福', type: '輔助', power: 0.86, guard: 0.28, desc: '以公平合理原則安定隊伍，降低受傷。' },
      { name: '申訴調解光環', type: '回復', power: 0.78, healRate: 0.08, desc: '處理爭議並小幅恢復生命。' },
      { name: '內控稽核聖盾', type: '防禦', power: 0.9, guard: 0.36, desc: '啟動稽核聖盾，吸收敵方衝擊。' },
      { name: '契約正義判決', type: '攻擊', power: 1.12, desc: '判定不公平條款無效，對敵方造成神聖傷害。' }
    ]
  }
};

const SLOTS = ['頭', '衣服', '褲子', '鞋子', '武器', '副武器', '飾品一', '飾品二'];
const DUNGEON_MAX_FLOOR = 100;
const EQUIPMENT_LEVEL_CAP = 100;
const EQUIPMENT_ASSET_COUNT = 100;
const RARITIES = ['普通', '精良', '稀有', '卓越', '史詩', '傳說', '遠古', '神話', '祕寶', '星鑄'];
const ARMOR_SLOTS = ['頭', '衣服', '褲子', '鞋子'];
const SLOT_ASSET_SLUGS = {
  頭: 'heads',
  衣服: 'clothes',
  褲子: 'pants',
  鞋子: 'shoes',
  武器: 'weapons',
  副武器: 'offhands',
  飾品一: 'accessories',
  飾品二: 'accessories'
};
const SLOT_FILE_PREFIXES = {
  heads: 'head',
  clothes: 'clothes',
  pants: 'pants',
  shoes: 'shoes',
  weapons: 'weapon',
  offhands: 'offhand',
  accessories: 'accessory'
};
const BOSS_BASE_HP = 60000;
const BOSS_HP_MULTIPLIER = 20;
const BOSS_MAX_HP = BOSS_BASE_HP * BOSS_HP_MULTIPLIER;
const DUNGEON_EQUIPMENT_DROP_RATE = 0.7;
const BOSS_EQUIPMENT_DROP_RATE = 0.028;
const BOSS_FRAGMENT_DROP_RATE = 0.385;
const BOSS_FRAGMENT_BONUS_DROP_RATE = 0.07;
const MAX_ENHANCE = 10;
const ENHANCE_SUCCESS_RATES = [0, 0.95, 0.86, 0.76, 0.64, 0.52, 0.42, 0.28, 0.18, 0.11, 0.06];
const FORGE_BASE_FEE = 200;
const FORGE_ENHANCE_FEE = 60;
const HP_REGEN_INTERVAL = 10 * 60 * 1000;
const GUILD_RENAME_COOLDOWN = 7 * 24 * 60 * 60 * 1000;
const MATERIAL_SKUS = new Set(['enhance_1', 'enhance_2', 'enchant_ink', 'special_core']);
const DEFAULT_GAME_SETTINGS = {
  fatigueTraining: 5,
  fatigueDungeon: 10,
  fatigueArena: 5,
  fatigueBoss: 15,
  restCost: 100,
  dungeonEquipmentDropRate: DUNGEON_EQUIPMENT_DROP_RATE,
  bossEquipmentDropRate: BOSS_EQUIPMENT_DROP_RATE,
  bossFragmentDropRate: BOSS_FRAGMENT_DROP_RATE,
  bossFragmentBonusDropRate: BOSS_FRAGMENT_BONUS_DROP_RATE
};
const GAME_SETTING_LIMITS = {
  fatigueTraining: [0, 200],
  fatigueDungeon: [0, 200],
  fatigueArena: [0, 200],
  fatigueBoss: [0, 200],
  restCost: [0, 1000000],
  dungeonEquipmentDropRate: [0, 1],
  bossEquipmentDropRate: [0, 1],
  bossFragmentDropRate: [0, 1],
  bossFragmentBonusDropRate: [0, 1]
};
const GUILD_ROLES = {
  leader: { label: '會長', power: 4 },
  vice: { label: '副會長', power: 3 },
  officer: { label: '幹部', power: 2 },
  member: { label: '公會成員', power: 1 }
};
const onlineUsers = new Map();

const ENCHANTS = [
  { name: '反擊符文', desc: '受到攻擊時有機率反擊', effects: { counter: 0.05 } },
  { name: '影步符文', desc: '提升迴避率', effects: { evasion: 0.06 } },
  { name: '尋寶符文', desc: '提升地下城與 BOSS 掉寶判定', effects: { dropRate: 0.08 } },
  { name: '碎晶符文', desc: '提升 BOSS 碎片掉落判定', effects: { bossFragment: 0.07 } },
  { name: '續戰符文', desc: '提升每 10 分鐘自動 HP 回復量', effects: { hpRegenBonus: 0.12 } },
  { name: '技能共鳴', desc: '提升技能傷害', effects: { skillDamage: 0.07 } },
  { name: '金庫祝福', desc: '提升金幣獎勵', effects: { goldBonus: 0.06 } }
];

const SPECIALIZATIONS = {
  攻擊特化: { desc: '攻擊增加、防禦降低', atkRate: 0.15, defRate: -0.08, effects: {} },
  防禦特化: { desc: '防禦增加、攻擊降低', atkRate: -0.08, defRate: 0.15, effects: {} },
  HP特化: { desc: 'HP 量增加、迴避率降低', atkRate: 0, defRate: 0, focusRate: 0, effects: { hpBonus: 0.1, evasion: -0.04 } },
  專注特化: { desc: '專注、技能施放與技能傷害提升，攻防少量降低', atkRate: -0.05, defRate: -0.05, focusRate: 0.15, effects: { skillRate: 0.08, skillDamage: 0.05 } }
};

const SHOP = [
  ['小型紅利藥水', 'potion_hp_s', 120, '恢復 60 HP', 5, 'assets/images/items/potion_hp_s.png'],
  ['中型流動性藥水', 'potion_hp_m', 300, '恢復 150 HP', 3, 'assets/images/items/potion_hp_m.png'],
  ['大型資本藥水', 'potion_hp_l', 700, '恢復 350 HP', 1, 'assets/images/items/potion_hp_l.png'],
  ['風險緩釋卷軸', 'buff_def', 500, '下一場防禦 +20%', 2, 'assets/images/items/scroll_revive.png'],
  ['市場動能卷軸', 'buff_atk', 500, '下一場攻擊 +20%', 2, 'assets/images/items/scroll_enhance.png'],
  ['資安補丁', 'cleanse', 360, '移除負面狀態', 2, 'assets/images/items/scroll_special.png'],
  ['法遵祝禱', 'buff_focus', 420, '下一場專注 +25%', 2, 'assets/images/items/scroll_enchant.png'],
  ['疲勞咖啡', 'stamina_20', 260, '恢復 20 疲勞', 3, 'assets/images/items/stamina_50.png'],
  ['特調能量飲', 'stamina_50', 680, '恢復 50 疲勞', 1, 'assets/images/items/universal_potion.png'],
  ['強化晶片 I', 'enhance_1', 180, '裝備強化材料', 10, 'assets/images/items/scroll_enhance.png'],
  ['強化晶片 II', 'enhance_2', 520, '較高強化成功率', 5, 'assets/images/items/scroll_enhance.png'],
  ['附魔墨水', 'enchant_ink', 420, '附魔材料', 5, 'assets/images/items/scroll_enchant.png'],
  ['特化核心', 'special_core', 1200, '特化材料', 2, 'assets/images/items/scroll_special.png'],
  ['稽核護符', 'audit_charm', 250, '降低地下城損傷', 3, 'assets/images/equipment/accessories/accessory_01.png'],
  ['交易靴油', 'speed_oil', 220, '競技場先手率提升', 3, 'assets/images/equipment/accessories/accessory_06.png'],
  ['KYC 透鏡', 'kyc_lens', 300, '提高掉寶品質', 2, 'assets/images/equipment/accessories/accessory_08.png'],
  ['備援磁帶', 'backup_tape', 260, '死亡時降低金幣損失', 2, 'assets/images/items/scroll_revive.png'],
  ['清算憑證', 'clear_token', 180, '公會戰消耗品', 5, 'assets/images/items/coin_bag.png'],
  ['合規印章', 'compliance_seal', 520, 'BOSS 戰額外獎勵率', 2, 'assets/images/equipment/accessories/accessory_07.png'],
  ['防火牆符文', 'firewall_rune', 540, '資安類傷害減免', 2, 'assets/images/equipment/accessories/accessory_04.png'],
  ['VAR 石板', 'var_tablet', 540, '市場類傷害減免', 2, 'assets/images/equipment/accessories/accessory_05.png'],
  ['AML 香爐', 'aml_incense', 400, '干擾命中提升', 3, 'assets/images/items/scroll_special.png'],
  ['資料湖瓶', 'data_lake', 480, '技能效果提升', 3, 'assets/images/items/universal_potion.png'],
  ['利率羅盤', 'rate_compass', 360, '攻擊小幅提升', 3, 'assets/images/equipment/accessories/accessory_02.png'],
  ['匯率護目鏡', 'fx_goggles', 360, '閃避小幅提升', 3, 'assets/images/equipment/accessories/accessory_06.png'],
  ['保證金腰包', 'margin_pouch', 300, '金幣獎勵小幅提升', 3, 'assets/images/items/coin_bag.png'],
  ['帳務便當', 'bento', 160, '休息額外回復', 4, 'assets/images/items/potion_hp_s.png'],
  ['客服號角', 'service_horn', 220, '公會貢獻提升', 3, 'assets/images/equipment/accessories/accessory_03.png'],
  ['冷錢包', 'cold_wallet', 600, 'PK 敗北保護', 2, 'assets/images/items/coin_bag.png'],
  ['董事會邀請函', 'board_invite', 1500, '高階活動入場券', 1, 'assets/images/items/scroll_revive.png']
];
const INVENTORY_SKUS = new Set(SHOP.map(x => x[1]));

const BOSSES = [
  ['週一', '系統性金融風暴', '連鎖曝險之眼', 'risk', 'assets/images/bosses/boss_01_systemic_storm.png', '烏雲與雷電凝聚成系統性風險，會用連鎖違約閃電掃蕩戰場。'],
  ['週二', '流動性枯竭魔龍', '資金斷鏈者', 'liquidity', 'assets/images/bosses/boss_02_liquidity_dragon.png', '紫色魔龍盤踞拆款市場，牠吐出的乾涸龍息會抽乾隊伍資源。'],
  ['週三', '洗錢黑潮', '暗流分層者', 'aml', 'assets/images/bosses/boss_03_laundering_tide.png', '黑色潮水吞沒金流軌跡，試圖用分層交易掩蓋真相。'],
  ['週四', '市場閃崩巨獸', '波動吞噬者', 'market', 'assets/images/bosses/boss_04_flash_crash_beast.png', '紅色巨獸拖著斷裂K線現身，一次咆哮就能引爆止損連鎖。'],
  ['週五', '資安勒索黑天鵝', '密鑰囚籠', 'cyber', 'assets/images/bosses/boss_05_ransom_black_swan.png', '黑天鵝揮動加密鎖鏈，讓備份與營運流程陷入停擺。'],
  ['週六', '利率操縱女皇', '殖利率冠冕', 'rate', 'assets/images/bosses/boss_06_rate_queen.png', '女皇以權杖扭曲殖利率曲線，讓所有模型產生劇烈偏差。'],
  ['週日', '通膨吞噬者', '物價深淵', 'inflation', 'assets/images/bosses/boss_07_inflation_devourer.png', '綠色巨口吞食金幣與購買力，愈戰愈膨脹。']
];

const DUNGEON_MONSTERS = [
  { min: 1, max: 10, name: '呆帳史萊姆', image: 'assets/images/monsters/f01_slime.png' },
  { min: 11, max: 20, name: '逾放骷髏會計', image: 'assets/images/monsters/f11_skeleton.png' },
  { min: 21, max: 30, name: '黑箱稽核守衛', image: 'assets/images/monsters/f21_guard.png' },
  { min: 31, max: 40, name: '監理暗影騎士', image: 'assets/images/monsters/f31_knight.png' },
  { min: 41, max: 50, name: '終局清算惡魔', image: 'assets/images/monsters/f41_finalfiend.png' },
  { min: 51, max: 60, name: '壓力測試魔像', image: 'assets/images/monsters/f21_golem.png' },
  { min: 61, max: 70, name: '資安黑曜法師', image: 'assets/images/monsters/f31_firemage.png' },
  { min: 71, max: 80, name: '流動性骨獸', image: 'assets/images/monsters/f31_bonebeast.png' },
  { min: 81, max: 90, name: '市場深淵龍', image: 'assets/images/monsters/f41_darkdragon.png' },
  { min: 91, max: 100, name: '百層監理魔王', image: 'assets/images/monsters/f41_balrog.png' }
];

function publicAssetPath(v) {
  return String(v || '').replace(/\\/g, '/').replace(/^public\//, '');
}
function loadMapMonsterManifest() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'public', 'assets', 'data', 'map_monster_manifest.json'), 'utf8');
    const data = JSON.parse(raw);
    const maps = (data.maps || []).map((map) => ({
      ...map,
      previewPath: publicAssetPath(map.previewPath),
      scenePath: publicAssetPath(map.scenePath),
      monsters: (map.monsters || []).map((monster) => ({
        ...monster,
        assetPath: publicAssetPath(monster.assetPath)
      }))
    }));
    return { ...data, maps };
  } catch (e) {
    console.warn('V1.5 map monster manifest not found, training ground will use fallback art.');
    return { version: 'fallback', maps: [] };
  }
}
const MAP_MONSTER_MANIFEST = loadMapMonsterManifest();

const QUIZ_QUESTIONS = [
  {
    id: 'fair-001', category: '公平待客原則', source: '金管會：金融服務業公平待客原則',
    question: '在遊戲中的「公平待客神殿」要建立制度時，下列哪一項最符合公平待客原則的治理要求？',
    options: ['只在客服部門口頭宣導即可', '納入內部控制與稽核制度，並建立具體遵循規章與執行步驟', '只在有客訴時才啟動', '交給業務個人自行判斷，不需留下紀錄'],
    answer: 1,
    explanation: '公平待客原則應制度化，並納入內部控制及稽核制度，不能只靠口頭提醒。'
  },
  {
    id: 'fair-002', category: '公平待客原則', source: '金管會：金融服務業公平待客原則',
    question: '客戶發生申訴或金融消費爭議時，最適合的處理方式是？',
    options: ['先以銷售績效為主，爭議月底再看', '依金融消費爭議處理制度 SOP 適時妥當處理，並檢視是否違反公平待客', '只要客戶沒有錄音就不用處理', '全部交給外部廠商，內部不用檢討'],
    answer: 1,
    explanation: '申訴處理應依制度處理並回饋流程改善，這也是公平待客落地的重要環節。'
  },
  {
    id: 'fair-003', category: '公平待客原則', source: '金管會：金融服務業公平待客原則',
    question: '若要讓「公平待客祝福」變成全行常態，下列哪種安排較正確？',
    options: ['指定高階主管與專責部門規劃推行，並定期向董事會報告', '只讓新人受訓一次即可', '只看銷售排行榜決定是否公平', '把所有爭議都視為客戶誤解'],
    answer: 0,
    explanation: '公平待客需要治理架構、專責推動與董事會層級的監督。'
  },
  {
    id: 'fair-004', category: '公平待客原則', source: '金管會：金融服務業公平待客原則',
    question: '下列何者最符合公平待客教育訓練的精神？',
    options: ['只寄一封宣導信即可', '定期辦理教育宣導與人員訓練，讓制度能被實際執行', '完全依賴主管口頭提醒', '只訓練客服，不訓練商品或業務單位'],
    answer: 1,
    explanation: '教育訓練是讓公平待客原則被理解與實作的必要機制。'
  },
  {
    id: 'fair-005', category: '金融消保 / 公平待客', source: '金融消費者保護法',
    question: '契約條款若有疑義，遊戲中的法遵聖騎應如何判讀最符合金融消費者保護精神？',
    options: ['一律由金融服務業自行解釋', '作成有利於金融消費者的解釋', '只看商品獲利高低', '忽略契約文字，直接要求客戶承擔'],
    answer: 1,
    explanation: '金融消保精神強調公平合理、平等互惠與誠信；疑義條款應朝有利於金融消費者方向解釋。'
  },
  {
    id: 'aml-001', category: '洗錢防制原則', source: '金管會：金融機構防制洗錢辦法',
    question: '金融機構在洗錢防制中，不得接受客戶以何種方式建立或維持業務關係？',
    options: ['本名並提供可驗證文件', '匿名或使用假名', '提供公司章程與登記資料', '由代理人提供可驗證代理文件'],
    answer: 1,
    explanation: '匿名或假名會破壞身分確認與追蹤機制，是洗錢防制中的重大風險。'
  },
  {
    id: 'aml-002', category: '洗錢防制原則', source: '金管會：金融機構防制洗錢辦法',
    question: '在 AML 戰鬥中，何時應進行客戶身分確認？',
    options: ['只有客戶提出抱怨時', '建立業務關係、一定金額以上交易、疑似洗錢或資料真實性有疑慮時', '只有交易失敗時', '只在客戶要求提高利率時'],
    answer: 1,
    explanation: '客戶身分確認不只發生在開戶，也會因交易金額、疑似洗錢或資料疑慮而啟動。'
  },
  {
    id: 'aml-003', category: '洗錢防制原則', source: '金管會：金融機構防制洗錢辦法',
    question: '「風險基礎方法」在洗錢防制中的核心概念是？',
    options: ['所有客戶都不需評估風險', '辨識、評估並了解洗錢及資恐風險，高風險加強、低風險可相對簡化', '只要交易金額小就完全不用注意', '只關注外幣交易，台幣交易皆無風險'],
    answer: 1,
    explanation: '風險基礎方法強調按風險高低分配資源與採取相稱措施。'
  },
  {
    id: 'aml-004', category: '洗錢防制原則', source: '金管會：金融機構防制洗錢辦法',
    question: '若金融機構已檢視屬疑似洗錢或資恐交易，最適合的處理是？',
    options: ['只在金額很大時才處理', '不論交易金額多寡，依規定簽報並向調查局申報', '直接告訴客戶已被通報以示透明', '等客戶主動說明後才留紀錄'],
    answer: 1,
    explanation: '疑似洗錢或資恐交易重點在疑似程度，而不是只看金額大小。'
  },
  {
    id: 'aml-005', category: '洗錢防制原則', source: '金管會：金融機構防制洗錢辦法',
    question: '下列哪一項較接近「實質受益人」概念？',
    options: ['只是在櫃檯排隊的人', '對客戶具最終所有權或控制權的自然人', '任何曾經查詢帳戶的人', '負責打掃分行的人員'],
    answer: 1,
    explanation: '實質受益人判斷重點在最終所有權、控制權或代表他人交易的實際自然人。'
  },
  {
    id: 'aml-006', category: '洗錢防制原則', source: '金管會：金融機構防制洗錢辦法',
    question: '法人客戶所有權結構判斷中，常見的控制權門檻概念為何？',
    options: ['直接或間接持有股份或資本超過 25% 的最終自然人', '只要曾經買過一股就是控制權人', '只有公司負責人才可能是控制權人', '控制權完全不需要辨識'],
    answer: 0,
    explanation: 'AML 盡職審查常以最終自然人控制權作為辨識重點之一。'
  },
  {
    id: 'security-001', category: '資訊安全社交工程防護', source: 'TWCERT/CC 社交工程防護建議',
    question: '收到來路不明、要求提供員工清單或個資的郵件時，最適合的第一反應是？',
    options: ['立即回覆完整名單', '提高警覺，確認寄件者與請求真實性，避免點擊可疑連結或附件', '轉寄給所有同事請大家填寫', '輸入帳密確認身分'],
    answer: 1,
    explanation: '社交工程常偽冒主管或合作對象，應先驗證來源並避免點擊可疑內容。'
  },
  {
    id: 'security-002', category: '資訊安全社交工程防護', source: 'TWCERT/CC 社交工程防護建議',
    question: '若不慎進入疑似釣魚網站，下列何者最正確？',
    options: ['繼續輸入帳號密碼以確認真假', '切勿輸入個資、帳密及金融資訊，並回報資訊單位', '截圖後放到公開社群討論', '只要網址有 https 就一定安全'],
    answer: 1,
    explanation: '釣魚網站的目標常是騙取帳密與金融資訊，應停止輸入並通報。'
  },
  {
    id: 'security-003', category: '資訊安全社交工程防護', source: 'TWCERT/CC 社交工程防護建議',
    question: '多因子認證 MFA 在資安戰鬥中的作用是？',
    options: ['讓帳密外洩時仍增加一道保護關卡', '讓所有人共用同一組密碼', '取代所有資安教育訓練', '讓密碼可以永久不更換'],
    answer: 0,
    explanation: 'MFA 可降低帳密被盜後直接入侵的風險，但仍需搭配其他防護。'
  },
  {
    id: 'security-004', category: '資訊安全社交工程防護', source: 'TWCERT/CC 社交工程防護建議',
    question: '懷疑郵件是社交工程攻擊時，應該怎麼做？',
    options: ['自行刪除，不讓任何人知道', '向主管或資訊部門確認並回報，利於後續處理', '依照郵件指示建立外部群組', '把內部 QR Code 直接寄給對方'],
    answer: 1,
    explanation: '回報能讓組織阻擋、通報與教育，降低其他人受害機率。'
  },
  {
    id: 'security-005', category: '資訊安全社交工程防護', source: 'TWCERT/CC 社交工程防護建議',
    question: '下列哪一項最能提升組織對社交工程的整體防禦？',
    options: ['只靠防毒軟體，不需要人員訓練', '持續資安宣導與演練，提升辨識與防護意識', '只要主管不受騙即可', '所有郵件都自動轉給外部信箱備份'],
    answer: 1,
    explanation: '社交工程針對人性弱點，持續宣導與演練是重要防線。'
  },
  {
    id: 'compliance-001', category: '金融業法遵知識', source: '金融控股公司及銀行業內部控制及稽核制度實施辦法',
    question: '銀行業內部控制制度的目標，下列何者最完整？',
    options: ['只追求短期獲利', '營運效果與效率、報導可靠透明且符合法規、相關法令遵循', '只要求員工準時打卡', '只管理裝潢與採購'],
    answer: 1,
    explanation: '內控不是單一部門工作，而是確保營運、報導與法遵目標能被達成。'
  },
  {
    id: 'compliance-002', category: '金融業法遵知識', source: '金融消費者保護法',
    question: '金融服務業提供金融商品或服務時，應盡到何種注意義務最符合金融消保精神？',
    options: ['善良管理人之注意義務', '只要賣出商品即可', '只要客戶簽名就完全免責', '只對 VIP 客戶負責'],
    answer: 0,
    explanation: '提供金融商品或服務時，金融服務業需以善良管理人注意義務處理。'
  },
  {
    id: 'compliance-003', category: '金融業法遵知識', source: '金融消費者保護法',
    question: '金融服務業對金融消費者的責任，是否可以事前約定全部限制或免除？',
    options: ['可以，只要字很小也有效', '不可以，預先約定限制或免除者，該部分約定無效', '只要是網路交易就可以', '只要客戶年滿二十歲就可以'],
    answer: 1,
    explanation: '金融消保法的精神是避免金融服務業透過契約預先免除對消費者的法定責任。'
  },
  {
    id: 'compliance-004', category: '金融業法遵知識', source: '金管會：金融服務業公平待客原則',
    question: '若一項金融商品不適合某客戶風險屬性，最符合公平待客與適合度精神的做法是？',
    options: ['仍強力推銷，讓客戶自行承擔', '充分揭露風險並進行適合度評估，不適合就不應強行銷售', '只看佣金高低決定', '要求客戶先簽放棄權利書'],
    answer: 1,
    explanation: '公平待客重視資訊揭露、適合度與避免不當銷售。'
  },
  {
    id: 'compliance-005', category: '金融業法遵知識', source: '金融控股公司及銀行業內部控制及稽核制度實施辦法',
    question: '法遵與內控在遊戲中的定位最接近下列何者？',
    options: ['只在出事後補文件', '事前設計制度、事中監控、事後檢討改善的防線', '完全阻止所有業務進行', '只屬於法務部門，其他人不用理解'],
    answer: 1,
    explanation: '有效內控與法遵應是持續性流程，並且需要各單位共同落實。'
  },
  {
    id: 'compliance-006', category: '金融業法遵知識', source: '金管會：金融服務業公平待客原則',
    question: '公平待客評估可參考哪一類資料來改善流程？',
    options: ['客戶申訴資料與員工回饋', '只有廣告點擊率', '只有分行裝潢照片', '只看股價短期漲跌'],
    answer: 0,
    explanation: '客訴與員工回饋能揭露流程痛點，是檢討公平待客的重要資料來源。'
  },
  {
    id: 'market-001', category: '金融市場操作', source: '原創遊戲題：市場風險基礎概念',
    question: '市場操盤職業面對利率與匯率劇烈波動時，較合理的風險作法是？',
    options: ['完全忽略停損與曝險限額', '建立曝險限額、停損紀律與情境壓力測試', '只看聊天室消息下單', '把所有資金投入單一方向'],
    answer: 1,
    explanation: '市場操作需要風險限額、紀律與情境思考，避免單一事件造成重大損失。'
  },
  {
    id: 'market-002', category: '金融市場操作', source: '原創遊戲題：市場風險基礎概念',
    question: '「殖利率曲線」在市場風險判讀中可以協助觀察什麼？',
    options: ['不同天期利率水準與市場預期變化', '員工午餐偏好', '分行排隊人數', '密碼強度'],
    answer: 0,
    explanation: '殖利率曲線反映不同期限利率與市場對景氣、通膨與政策的預期。'
  },
  {
    id: 'privacy-001', category: '資訊安全 / 個資保護', source: 'TWCERT/CC 社交工程防護建議',
    question: '社交工程郵件要求提供員工個資時，為什麼不能直接照辦？',
    options: ['可能造成個資外洩並擴大攻擊面', '因為寄信速度太慢', '因為附件通常太大', '因為只有紙本資料才算個資'],
    answer: 0,
    explanation: '員工資料可被用於更精準的釣魚或冒名攻擊，應先驗證與回報。'
  },
  {
    id: 'privacy-002', category: '資訊安全 / 個資保護', source: 'TWCERT/CC 社交工程防護建議',
    question: '若收到疑似主管要求建立外部通訊群組並回傳 QR Code，較安全的做法是？',
    options: ['立刻建立並回傳', '改用可信管道向主管或資訊部門確認', '把 QR Code 貼到公開網路', '要求所有同事先加入再說'],
    answer: 1,
    explanation: '偽冒主管是常見社交工程手法，應透過可信管道確認。'
  }
];

function taipeiNowDate() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
}
function pad2(n) {
  return String(n).padStart(2, '0');
}
function todayKey() {
  const d = taipeiNowDate();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function now() { return Date.now(); }
function bossIndex() {
  const day = taipeiNowDate().getDay();
  return day === 0 ? 6 : day - 1;
}
function rand(n) { return Math.floor(Math.random() * n); }
function pick(arr) { return arr[rand(arr.length)]; }
function safeText(v) { return String(v ?? '').replace(/[<>&]/g, '').trim().slice(0, 40); }
function safeChatText(v) { return String(v ?? '').replace(/[<>&]/g, '').replace(/\s+/g, ' ').trim().slice(0, 160); }
function safeGuildName(v) { return String(v ?? '').replace(/[<>&]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16); }
function safeGuildNotice(v) { return String(v ?? '').replace(/[<>&]/g, '').replace(/\s+/g, ' ').trim().slice(0, 180); }
function safeLongText(v, max = 500) { return String(v ?? '').replace(/[<>&]/g, '').replace(/\s+/g, ' ').trim().slice(0, max); }
function clamp(n, min, max) { return Math.max(min, Math.min(max, Number(n) || 0)); }
function rarityForLevel(level) { return RARITIES[Math.min(RARITIES.length - 1, Math.floor((Number(level || 1) - 1) / 10))]; }
function hashInt(s) {
  return parseInt(crypto.createHash('sha256').update(s).digest('hex').slice(0, 8), 16);
}
function dungeonWeekKey() {
  const d = taipeiNowDate();
  const daysSinceFriday = (d.getDay() + 2) % 7;
  d.setDate(d.getDate() - daysSinceFriday);
  d.setHours(0, 0, 0, 0);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function guildCapacity(level = 1) {
  return 20 + (Math.max(1, Number(level || 1)) - 1) * 10;
}
function guildUpgradeCost(level = 1) {
  return Math.round(8000 * Math.pow(Math.max(1, Number(level || 1)), 1.65));
}
function guildRenameCost(level = 1) {
  return 5000 + Math.max(1, Number(level || 1)) * 2500;
}
function rolePower(role) {
  return GUILD_ROLES[role]?.power || 0;
}
function roleLabel(role) {
  return GUILD_ROLES[role]?.label || '公會成員';
}
function mergeEffects(...items) {
  const out = {};
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    for (const [key, value] of Object.entries(item)) out[key] = (out[key] || 0) + Number(value || 0);
  }
  return out;
}
function itemEffectBundle(it) {
  if (!it) return {};
  const legacy = (!it.enchantEffects && !it.specEffects) ? it.effects : {};
  return mergeEffects(legacy, it.enchantEffects, it.specEffects);
}
function effectChance(value, cap = 0.45) {
  return clamp(value, 0, cap);
}
function chanceWithEffects(base, effects = {}, key = 'dropRate', cap = 0.95) {
  const bonus = Number(effects[key] || 0) + (key === 'bossFragment' ? Number(effects.dropRate || 0) * 0.35 : 0);
  return clamp(base + bonus, 0, cap);
}
function focusRoll(s, extra = 20) {
  return rand(Math.max(1, Math.round((s.focus || 0) + extra + Number(s.effects?.skillRate || 0) * 70)));
}
function skillPower(skill, s) {
  return (skill.power || 1) * (1 + clamp(s.effects?.skillDamage || 0, 0, 0.6));
}
function resolveIncomingDamage(rawTaken, s, skill) {
  let taken = Math.max(0, Math.round(rawTaken * (1 - (skill.guard || 0))));
  const notes = [];
  if (taken > 0 && Math.random() < effectChance(s.effects?.evasion || 0, 0.4)) {
    taken = 0;
    notes.push('影步符文觸發，本次反擊被你完全閃避。');
  }
  let counter = 0;
  if (taken > 0 && Math.random() < effectChance(s.effects?.counter || 0, 0.35)) {
    counter = Math.max(1, Math.round(((s.atk || 0) + (s.focus || 0)) * 0.24));
    notes.push(`反擊符文觸發，追加 ${counter} 點反擊傷害。`);
  }
  return { taken, counter, notes };
}
function currentDungeonSave(player) {
  const raw = typeof player.dungeonsave === 'string' ? JSON.parse(player.dungeonsave || '{}') : (player.dungeonsave || player.dungeonSave || {});
  const key = dungeonWeekKey();
  const floor = raw.weekKey === key ? clamp(raw.floor || 1, 1, DUNGEON_MAX_FLOOR) : 1;
  return { floor, hp: Math.max(1, Number(raw.hp || player.hp || 1)), weekKey: key };
}
function trainingEncounter() {
  const maps = MAP_MONSTER_MANIFEST.maps || [];
  if (!maps.length) {
    return {
      title: '練功場：逾放怨靈沙洲',
      mapName: '逾放怨靈沙洲',
      scene: 'assets/images/scenes/grassland.png',
      monsterName: '逾放怨靈',
      monsterImage: 'assets/images/monsters/f01_skeleton.png'
    };
  }
  const map = pick(maps);
  const monster = pick(map.monsters || []);
  return {
    title: `練功場：${map.name}`,
    mapName: map.name,
    scene: map.scenePath || map.previewPath,
    monsterName: monster?.name || '未知魔物',
    monsterImage: monster?.assetPath || map.previewPath,
    role: monster?.combatRole || '',
    theme: map.theme || ''
  };
}
function shopItemBySku(sku) {
  return SHOP.find(x => x[1] === sku) || null;
}
function materialForForge(type, currentEnhance = 0) {
  if (type === 'enhance') return Number(currentEnhance || 0) >= 6 ? 'enhance_2' : 'enhance_1';
  if (type === 'enchant') return 'enchant_ink';
  if (type === 'specialize') return 'special_core';
  return '';
}
function forgeFee(currentEnhance = 0) {
  return FORGE_BASE_FEE + Number(currentEnhance || 0) * FORGE_ENHANCE_FEE;
}
async function getInventory(playerId) {
  const rows = await all('SELECT sku,qty FROM inventory WHERE playerId=$1 ORDER BY sku', [playerId]);
  const qtyBySku = Object.fromEntries(rows.map(r => [r.sku, Number(r.qty || 0)]));
  return SHOP.filter(x => INVENTORY_SKUS.has(x[1])).map(item => ({
    name: item[0],
    sku: item[1],
    price: item[2],
    desc: item[3],
    dailyStock: item[4],
    image: item[5],
    qty: qtyBySku[item[1]] || 0,
    material: MATERIAL_SKUS.has(item[1])
  }));
}
async function addInventory(playerId, sku, qty) {
  if (!INVENTORY_SKUS.has(sku)) throw new Error('無此道具');
  const amount = Math.max(1, Math.floor(Number(qty || 1)));
  await q('INSERT INTO inventory(playerId,sku,qty) VALUES($1,$2,$3) ON CONFLICT(playerId,sku) DO UPDATE SET qty=inventory.qty+EXCLUDED.qty', [playerId, sku, amount]);
}
async function consumeInventory(playerId, sku, qty = 1) {
  const row = await one('SELECT qty FROM inventory WHERE playerId=$1 AND sku=$2', [playerId, sku]);
  const amount = Math.max(1, Math.floor(Number(qty || 1)));
  if (Number(row?.qty || 0) < amount) return false;
  await q('UPDATE inventory SET qty=qty-$1 WHERE playerId=$2 AND sku=$3', [amount, playerId, sku]);
  return true;
}
function requireConfirm(req, res) {
  if (String(req.body.confirm || '').trim() !== 'CONFIRM') {
    res.status(400).json({ error: '高風險操作需輸入 CONFIRM 二次確認。' });
    return false;
  }
  return true;
}
function padAsset(n) { return String(n).padStart(3, '0'); }
function imageIndex(level, clsKey, max, salt = '') {
  return ((Number(level || 1) + hashInt(`${salt}:${clsKey}`)) % max) + 1;
}
function assetForItem(slot, level, clsKey = 'risk_guardian', boss = false) {
  const lvl = Math.max(1, Math.min(EQUIPMENT_LEVEL_CAP, Number(level || 1)));
  const safeCls = CLASSES[clsKey] ? clsKey : 'risk_guardian';
  const slug = SLOT_ASSET_SLUGS[slot] || 'clothes';
  const prefix = SLOT_FILE_PREFIXES[slug] || 'clothes';
  const idx = ((lvl - 1 + (boss ? 13 : 0)) % EQUIPMENT_ASSET_COUNT) + 1;
  return `assets/images/equipment/classes/${safeCls}/${slug}/${prefix}_${padAsset(idx)}.png`;
}
function normalizeEquipmentImages(eq, clsKey) {
  const out = eq || {};
  let changed = false;
  for (const slot of SLOTS) {
    const it = out[slot];
    if (!it) continue;
    const expected = assetForItem(slot, it.level || 1, it.clsKey || clsKey, it.rarity === 'BOSS神鑄');
    const mustFixArmorSlot = ARMOR_SLOTS.includes(slot) && (!it.image || String(it.image).includes('/armor/') || String(it.image).includes('armor_'));
    const oldGenericIcon = it.image && !String(it.image).includes('/equipment/classes/');
    if (!it.image || mustFixArmorSlot || oldGenericIcon) {
      it.image = expected;
      changed = true;
    }
  }
  return { equipment: out, changed };
}
function itemFor(clsKey, slot, level, boss = false) {
  const c = CLASSES[clsKey] || CLASSES.risk_guardian;
  const rare = boss ? 'BOSS神鑄' : rarityForLevel(level);
  const lvl = Math.max(1, Math.min(EQUIPMENT_LEVEL_CAP, Number(level || 1)));
  const tier = Math.min(RARITIES.length - 1, Math.floor((lvl - 1) / 10));
  const base = lvl * 2.8 + tier * 18 + (boss ? 120 : 0);
  return {
    clsKey,
    slot,
    level: lvl,
    rarity: rare,
    name: `${c.name}${boss ? '・世界王' : '・第' + lvl + '層'}${slot}`,
    atk: Math.round(base * (slot.includes('武器') ? 1.5 : 0.35)),
    def: Math.round(base * (ARMOR_SLOTS.includes(slot) ? 0.9 : 0.25)),
    focus: Math.round(base * (slot.includes('飾品') || slot === '副武器' ? 1.1 : 0.3)),
    enhance: 0,
    enchant: '未附魔',
    spec: '未特化',
    image: assetForItem(slot, level, clsKey, boss)
  };
}
function enhanceCost(item, nextLevel) {
  const levelCost = Math.round(Number(item.level || 1) * 18);
  return 250 + nextLevel * nextLevel * 170 + levelCost;
}
function applyEnhanceStats(item, nextLevel) {
  const main = item.slot?.includes('武器') ? 'atk' : ARMOR_SLOTS.includes(item.slot) ? 'def' : 'focus';
  const step = Math.max(1, Math.round((Number(item.level || 1) * 0.85 + nextLevel * 2.4) * (nextLevel >= 7 ? 1.45 : nextLevel >= 4 ? 1.2 : 1)));
  item[main] = Number(item[main] || 0) + step;
  if (nextLevel >= 5) {
    item.atk = Number(item.atk || 0) + Math.max(1, Math.round(step * 0.2));
    item.def = Number(item.def || 0) + Math.max(1, Math.round(step * 0.2));
    item.focus = Number(item.focus || 0) + Math.max(1, Math.round(step * 0.2));
  }
  item.enhance = nextLevel;
  return { main, step };
}
function revertSpec(item) {
  if (!item?.specMods) return;
  for (const key of ['atk', 'def', 'focus']) {
    item[key] = Number(item[key] || 0) - Number(item.specMods[key] || 0);
  }
  delete item.specMods;
  delete item.specEffects;
}
function applySpecialization(item, spec) {
  const rule = SPECIALIZATIONS[spec] || SPECIALIZATIONS['攻擊特化'];
  revertSpec(item);
  const mods = {
    atk: Math.round(Number(item.atk || 0) * Number(rule.atkRate || 0)),
    def: Math.round(Number(item.def || 0) * Number(rule.defRate || 0)),
    focus: Math.round(Number(item.focus || 0) * Number(rule.focusRate || 0))
  };
  item.atk = Math.max(0, Number(item.atk || 0) + mods.atk);
  item.def = Math.max(0, Number(item.def || 0) + mods.def);
  item.focus = Math.max(0, Number(item.focus || 0) + mods.focus);
  item.spec = spec;
  item.specMods = mods;
  item.specEffects = rule.effects || {};
  item.specDesc = rule.desc;
  return rule;
}
function stats(player) {
  const eq = typeof player.equipment === 'string' ? JSON.parse(player.equipment || '{}') : (player.equipment || {});
  const s = { hpMax: player.hpmax, atk: player.atk, def: player.def, focus: player.focus, effects: {} };
  Object.values(eq).forEach((it) => {
    if (!it) return;
    const mult = 1 + (it.enhance || 0) * 0.03;
    s.atk += Math.round((it.atk || 0) * mult);
    s.def += Math.round((it.def || 0) * mult);
    s.focus += Math.round((it.focus || 0) * mult);
    s.effects = mergeEffects(s.effects, itemEffectBundle(it));
  });
  if (s.effects.hpBonus) s.hpMax = Math.round(s.hpMax * (1 + clamp(s.effects.hpBonus, -0.5, 1.5)));
  s.effects.evasion = clamp(s.effects.evasion || 0, -0.4, 0.4);
  return s;
}
function stamina(player) {
  const elapsed = Math.max(0, now() - Number(player.staminaat));
  const regen = Math.floor(elapsed / 3600000 * 25);
  const val = Math.min(200, Number(player.stamina) + regen);
  return { val, at: regen > 0 ? now() : Number(player.staminaat) };
}
function hpRegen(player) {
  const currentStats = stats(player);
  const hpMax = currentStats.hpMax;
  const at = Number(player.hpregenat || player.staminaat || now());
  if (Number(player.hp) >= hpMax) return { hp: Math.min(Number(player.hp), hpMax), at };
  const ticks = Math.floor(Math.max(0, now() - at) / HP_REGEN_INTERVAL);
  if (ticks <= 0) return { hp: Number(player.hp), at };
  const perTick = Math.max(4, Math.round(hpMax * 0.04 * (1 + clamp(currentStats.effects.hpRegenBonus || 0, 0, 1))));
  return { hp: Math.min(hpMax, Number(player.hp) + ticks * perTick), at: now() };
}
function sign(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '8h' });
}
function normalizePlayer(p) {
  if (!p) return p;
  p.userId = p.userid;
  p.hpMax = p.hpmax;
  p.staminaAt = Number(p.staminaat);
  p.hpRegenAt = Number(p.hpregenat || p.staminaat || now());
  p.bossFragments = p.bossfragments;
  p.dungeonSave = p.dungeonsave;
  p.classKey = p.classkey;
  return p;
}
function skillFor(clsKey, type = null) {
  const skills = (CLASSES[clsKey] || CLASSES.risk_guardian).skills;
  if (type) {
    const filtered = skills.filter(s => s.type.includes(type));
    if (filtered.length) return pick(filtered);
  }
  return pick(skills);
}
function monsterForFloor(floor) {
  return DUNGEON_MONSTERS.find(m => floor >= m.min && floor <= m.max) || DUNGEON_MONSTERS[0];
}
function linesToHtml(lines) {
  return lines.filter(Boolean).join('<br>');
}
function combatNarrative({ title, player, skill, target, damage, taken = 0, outcome, reward = '', image = '', extra = [] }) {
  const c = CLASSES[player.classkey] || CLASSES.risk_guardian;
  const openings = [
    `${title}｜${c.name}進入戰場，系統先同步 HP、疲勞值與裝備加成。`,
    `${title}｜交易鐘聲敲響，${c.name}在像素金融戰場上展開行動。`,
    `${title}｜後台風險儀表板亮起紅燈，你踏入充滿異常訊號的區域。`
  ];
  const skillLine = `你施放「${skill.name}」（${skill.type}），${skill.desc}，對「${target}」造成 ${damage} 點傷害。`;
  const counterLine = taken > 0
    ? `敵方沒有倒下，立刻以異常金流與市場雜訊反擊，你受到 ${taken} 點傷害，剩餘 HP 將依戰鬥結果更新。`
    : `敵方攻勢被你壓制，這一輪沒有造成有效反擊傷害。`;
  const outcomeLines = [
    outcome,
    reward,
    ...extra
  ].filter(Boolean);
  const optional = [
    `戰鬥紀錄已寫入公會公告板，其他玩家可從排行榜觀察本次成果。`,
    `你的裝備符文微微發光，強化、附魔與特化數值都已參與本次計算。`,
    `分行鐘樓傳來提示音：若 HP 偏低，建議先休息或到道具商店補給。`
  ];
  const chosen = [pick(openings), skillLine, counterLine, ...outcomeLines];
  while (chosen.length < 5) chosen.push(pick(optional));
  const finalLines = chosen.slice(0, 5);
  return `${image ? `<img class="battle-portrait" src="${image}" alt="battle image">` : ''}${linesToHtml(finalLines)}`;
}
async function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!t) return res.status(401).json({ error: '未登入' });
  try {
    const payload = jwt.verify(t, JWT_SECRET);
    const row = await one('SELECT role,banned FROM users WHERE id=$1', [payload.id]);
    if (!row || Number(row.banned || 0)) return res.status(403).json({ error: '帳號已停權或不存在' });
    req.user = { ...payload, role: row.role || 'player', isAdmin: row.role === 'admin' || ADMIN_USERNAMES.has(payload.username) };
    next();
  } catch {
    res.status(401).json({ error: 'Token 已失效' });
  }
}
async function socketAuth(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('未登入'));
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const row = await one('SELECT role,banned FROM users WHERE id=$1', [payload.id]);
    if (!row || Number(row.banned || 0)) return next(new Error('帳號已停權或不存在'));
    socket.user = { ...payload, role: row.role || 'player', isAdmin: row.role === 'admin' || ADMIN_USERNAMES.has(payload.username) };
    next();
  } catch {
    next(new Error('Token 已失效'));
  }
}
async function getPlayer(uid) {
  const p = normalizePlayer(await one('SELECT p.*,u.username FROM players p JOIN users u ON u.id=p.userId WHERE p.userId=$1', [uid]));
  if (!p) return null;
  const st = stamina(p);
  if (st.val !== p.stamina || st.at !== p.staminaAt) {
    await q('UPDATE players SET stamina=$1, staminaAt=$2 WHERE id=$3', [st.val, st.at, p.id]);
    p.stamina = st.val;
    p.staminaat = st.at;
    p.staminaAt = st.at;
  }
  const eq = typeof p.equipment === 'string' ? JSON.parse(p.equipment || '{}') : (p.equipment || {});
  const fixed = normalizeEquipmentImages(eq, p.classkey);
  if (fixed.changed) {
    await q('UPDATE players SET equipment=$1 WHERE id=$2', [JSON.stringify(fixed.equipment), p.id]);
    p.equipment = fixed.equipment;
  }
  const hpTick = hpRegen(p);
  if (hpTick.hp !== Number(p.hp) || hpTick.at !== p.hpRegenAt) {
    await q('UPDATE players SET hp=$1, hpRegenAt=$2 WHERE id=$3', [hpTick.hp, hpTick.at, p.id]);
    p.hp = hpTick.hp;
    p.hpregenat = hpTick.at;
    p.hpRegenAt = hpTick.at;
  }
  const save = currentDungeonSave(p);
  const savedRaw = typeof p.dungeonsave === 'string' ? JSON.parse(p.dungeonsave || '{}') : (p.dungeonsave || {});
  if (savedRaw.weekKey !== save.weekKey || Number(savedRaw.floor || 1) !== save.floor) {
    await q('UPDATE players SET dungeonSave=$1 WHERE id=$2', [JSON.stringify(save), p.id]);
    p.dungeonsave = save;
    p.dungeonSave = save;
  }
  return p;
}
async function spend(p, cost) {
  if (p.stamina < cost) return false;
  const at = now();
  await q('UPDATE players SET stamina=$1, staminaAt=$2 WHERE id=$3', [p.stamina - cost, at, p.id]);
  p.stamina -= cost;
  p.staminaat = at;
  return true;
}
async function log(pid, mode, text) {
  await q('INSERT INTO battle_log(playerId,mode,text,createdAt) VALUES($1,$2,$3,$4)', [pid, mode, text, now()]);
}
async function ensureBoss() {
  const day = todayKey();
  const idx = bossIndex();
  let b = await one('SELECT * FROM boss_state WHERE day=$1', [day]);
  if (!b) {
    const hp = BOSS_MAX_HP;
    await q('INSERT INTO boss_state(day,bossIdx,hp,maxHp,killed) VALUES($1,$2,$3,$4,0) ON CONFLICT(day) DO NOTHING', [day, idx, hp, hp]);
    b = await one('SELECT * FROM boss_state WHERE day=$1', [day]);
  } else if (Number(b.maxhp) < BOSS_MAX_HP && !Number(b.killed)) {
    const oldMax = Math.max(1, Number(b.maxhp || BOSS_BASE_HP));
    const damageDone = Math.max(0, oldMax - Number(b.hp || oldMax));
    const newHp = Math.max(1, BOSS_MAX_HP - damageDone);
    await q('UPDATE boss_state SET hp=$1,maxHp=$2,killed=0 WHERE day=$3', [newHp, BOSS_MAX_HP, day]);
    b = await one('SELECT * FROM boss_state WHERE day=$1', [day]);
  }
  return b;
}
async function seedQuizQuestions() {
  for (const item of QUIZ_QUESTIONS) {
    await q(
      `INSERT INTO quiz_questions(id,category,question,options,answer,explanation,source)
       VALUES($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT(id) DO UPDATE SET category=EXCLUDED.category, question=EXCLUDED.question, options=EXCLUDED.options, answer=EXCLUDED.answer, explanation=EXCLUDED.explanation, source=EXCLUDED.source`,
      [item.id, item.category, item.question, JSON.stringify(item.options), item.answer, item.explanation, item.source]
    );
  }
}
async function initDb() {
  await q(`CREATE TABLE IF NOT EXISTS users(id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, passwordHash TEXT NOT NULL, createdAt BIGINT NOT NULL, role TEXT DEFAULT 'player', banned INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS players(id SERIAL PRIMARY KEY, userId INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE, classKey TEXT NOT NULL, level INTEGER NOT NULL, exp INTEGER NOT NULL, gold INTEGER NOT NULL, hp INTEGER NOT NULL, hpMax INTEGER NOT NULL, atk INTEGER NOT NULL, def INTEGER NOT NULL, focus INTEGER NOT NULL, stamina INTEGER NOT NULL, staminaAt BIGINT NOT NULL, hpRegenAt BIGINT, equipment JSONB NOT NULL, dungeonSave JSONB NOT NULL, guild TEXT DEFAULT '', bossFragments INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS inventory(playerId INTEGER REFERENCES players(id) ON DELETE CASCADE, sku TEXT NOT NULL, qty INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(playerId,sku));
CREATE TABLE IF NOT EXISTS dungeon_claims(playerId INTEGER REFERENCES players(id) ON DELETE CASCADE, floor INTEGER, claimedAt BIGINT, PRIMARY KEY(playerId,floor));
CREATE TABLE IF NOT EXISTS dungeon_weekly_claims(playerId INTEGER REFERENCES players(id) ON DELETE CASCADE, floor INTEGER, weekKey TEXT, claimedAt BIGINT, PRIMARY KEY(playerId,floor,weekKey));
CREATE TABLE IF NOT EXISTS purchases(playerId INTEGER REFERENCES players(id) ON DELETE CASCADE, sku TEXT, day TEXT, qty INTEGER, PRIMARY KEY(playerId,sku,day));
CREATE TABLE IF NOT EXISTS boss_state(day TEXT PRIMARY KEY, bossIdx INTEGER, hp INTEGER, maxHp INTEGER, killed INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS boss_damage(day TEXT, playerId INTEGER REFERENCES players(id) ON DELETE CASCADE, damage INTEGER, PRIMARY KEY(day,playerId));
CREATE TABLE IF NOT EXISTS guilds(name TEXT PRIMARY KEY, ownerPlayerId INTEGER REFERENCES players(id) ON DELETE SET NULL, createdAt BIGINT NOT NULL, level INTEGER DEFAULT 1, treasury INTEGER DEFAULT 0, notice TEXT DEFAULT '', renameAt BIGINT DEFAULT 0);
CREATE TABLE IF NOT EXISTS guild_members(guildName TEXT REFERENCES guilds(name) ON DELETE CASCADE ON UPDATE CASCADE, playerId INTEGER REFERENCES players(id) ON DELETE CASCADE, role TEXT NOT NULL DEFAULT 'member', joinedAt BIGINT NOT NULL, donated INTEGER DEFAULT 0, PRIMARY KEY(guildName,playerId));
CREATE TABLE IF NOT EXISTS guild_applications(id SERIAL PRIMARY KEY, guildName TEXT REFERENCES guilds(name) ON DELETE CASCADE ON UPDATE CASCADE, playerId INTEGER REFERENCES players(id) ON DELETE CASCADE, message TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', createdAt BIGINT NOT NULL, decidedAt BIGINT, decidedBy INTEGER REFERENCES players(id) ON DELETE SET NULL);
CREATE TABLE IF NOT EXISTS guild_logs(id SERIAL PRIMARY KEY, guildName TEXT REFERENCES guilds(name) ON DELETE CASCADE ON UPDATE CASCADE, actorPlayerId INTEGER REFERENCES players(id) ON DELETE SET NULL, targetPlayerId INTEGER REFERENCES players(id) ON DELETE SET NULL, action TEXT NOT NULL, text TEXT NOT NULL, createdAt BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS chat_messages(id SERIAL PRIMARY KEY, channel TEXT NOT NULL, guild TEXT DEFAULT '', userId INTEGER REFERENCES users(id) ON DELETE SET NULL, username TEXT NOT NULL, text TEXT NOT NULL, createdAt BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS battle_log(id SERIAL PRIMARY KEY, playerId INTEGER REFERENCES players(id) ON DELETE CASCADE, mode TEXT, text TEXT, createdAt BIGINT);
CREATE TABLE IF NOT EXISTS game_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL, updatedAt BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS system_announcements(id SERIAL PRIMARY KEY, title TEXT NOT NULL, text TEXT NOT NULL, active INTEGER DEFAULT 1, createdAt BIGINT NOT NULL, createdBy INTEGER REFERENCES users(id) ON DELETE SET NULL);
CREATE TABLE IF NOT EXISTS admin_logs(id SERIAL PRIMARY KEY, adminUserId INTEGER REFERENCES users(id) ON DELETE SET NULL, action TEXT NOT NULL, targetType TEXT DEFAULT '', targetId TEXT DEFAULT '', detail JSONB DEFAULT '{}'::jsonb, createdAt BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS quiz_questions(id TEXT PRIMARY KEY, category TEXT NOT NULL, question TEXT NOT NULL, options JSONB NOT NULL, answer INTEGER NOT NULL, explanation TEXT NOT NULL, source TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS daily_quiz_attempts(playerId INTEGER REFERENCES players(id) ON DELETE CASCADE, day TEXT NOT NULL, questionIds JSONB NOT NULL, answers JSONB NOT NULL, score INTEGER NOT NULL, rewardExp INTEGER NOT NULL, rewardGold INTEGER NOT NULL, createdAt BIGINT NOT NULL, PRIMARY KEY(playerId,day));`);
  await q(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'player';
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned INTEGER DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS hpRegenAt BIGINT;
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1;
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS treasury INTEGER DEFAULT 0;
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS notice TEXT DEFAULT '';
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS renameAt BIGINT DEFAULT 0;`);
  await q('UPDATE players SET hpRegenAt=staminaAt WHERE hpRegenAt IS NULL');
  for (const [key, value] of Object.entries(DEFAULT_GAME_SETTINGS)) {
    await q('INSERT INTO game_settings(key,value,updatedAt) VALUES($1,$2,$3) ON CONFLICT(key) DO NOTHING', [key, String(value), now()]);
  }
  if (ADMIN_USERNAMES.size) {
    await q('UPDATE users SET role=$1 WHERE username=ANY($2::text[])', ['admin', [...ADMIN_USERNAMES]]);
  }
  await q(`INSERT INTO guilds(name,ownerPlayerId,createdAt,level,treasury,notice,renameAt)
SELECT p.guild, MIN(p.id), $1, 1, 0, '', 0 FROM players p
WHERE COALESCE(p.guild,'') <> ''
GROUP BY p.guild
ON CONFLICT(name) DO NOTHING`, [now()]);
  await q(`INSERT INTO guild_members(guildName,playerId,role,joinedAt,donated)
SELECT p.guild, p.id, CASE WHEN p.id=sub.ownerId THEN 'leader' ELSE 'member' END, $1, 0
FROM players p
JOIN (SELECT guild, MIN(id) AS ownerId FROM players WHERE COALESCE(guild,'') <> '' GROUP BY guild) sub ON sub.guild=p.guild
WHERE COALESCE(p.guild,'') <> ''
ON CONFLICT(guildName,playerId) DO NOTHING`, [now()]);
  await q(`UPDATE guilds g SET ownerPlayerId=COALESCE(g.ownerPlayerId, sub.ownerId)
FROM (SELECT guildName, MIN(playerId) AS ownerId FROM guild_members GROUP BY guildName) sub
WHERE sub.guildName=g.name`);
  await seedQuizQuestions();
}
async function grantExpGold(player, expGain, goldGain) {
  let exp = player.exp + expGain;
  let level = player.level;
  let hpMax = player.hpmax;
  let atk = player.atk;
  let def = player.def;
  let focus = player.focus;
  let hp = player.hp;
  let levelUps = 0;
  while (exp >= level * 120) {
    exp -= level * 120;
    level += 1;
    levelUps += 1;
    hpMax += 12;
    atk += 2;
    def += 1;
    focus += 1;
    hp = hpMax;
  }
  await q('UPDATE players SET exp=$1, level=$2, hpMax=$3, atk=$4, def=$5, focus=$6, hp=$7, gold=gold+$8 WHERE id=$9', [exp, level, hpMax, atk, def, focus, hp, goldGain, player.id]);
  return { exp, level, levelUps, hpMax, atk, def, focus, hp, goldGain };
}
async function getDailyQuestionRows(playerId) {
  const rows = await all('SELECT * FROM quiz_questions ORDER BY id');
  return rows
    .map(r => ({ row: r, sort: hashInt(`${todayKey()}:${playerId}:${r.id}`) }))
    .sort((a, b) => a.sort - b.sort)
    .slice(0, 5)
    .map(x => x.row);
}
function publicQuestion(row, includeAnswer = false) {
  const out = {
    id: row.id,
    category: row.category,
    question: row.question,
    options: Array.isArray(row.options) ? row.options : JSON.parse(row.options),
    source: row.source
  };
  if (includeAnswer) {
    out.answer = row.answer;
    out.explanation = row.explanation;
  }
  return out;
}
async function getGameSettings() {
  const rows = await all('SELECT key,value FROM game_settings');
  const out = { ...DEFAULT_GAME_SETTINGS };
  for (const row of rows) {
    if (Object.prototype.hasOwnProperty.call(out, row.key)) out[row.key] = Number(row.value);
  }
  return out;
}
async function setGameSettings(values = {}) {
  const allowed = Object.keys(DEFAULT_GAME_SETTINGS);
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(values, key)) continue;
    const value = Number(values[key]);
    if (!Number.isFinite(value)) continue;
    const [min, max] = GAME_SETTING_LIMITS[key] || [0, Number.MAX_SAFE_INTEGER];
    const normalized = clamp(value, min, max);
    await q('INSERT INTO game_settings(key,value,updatedAt) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updatedAt=EXCLUDED.updatedAt', [key, String(normalized), now()]);
  }
  return getGameSettings();
}
async function isAdminUser(userId, username = '') {
  const row = await one('SELECT role FROM users WHERE id=$1', [userId]);
  return row?.role === 'admin' || ADMIN_USERNAMES.has(username);
}
async function adminAuth(req, res, next) {
  if (!await isAdminUser(req.user.id, req.user.username)) return res.status(403).json({ error: '需要管理員權限' });
  next();
}
async function adminLog(adminUserId, action, targetType = '', targetId = '', detail = {}) {
  await q('INSERT INTO admin_logs(adminUserId,action,targetType,targetId,detail,createdAt) VALUES($1,$2,$3,$4,$5,$6)', [adminUserId, action, targetType, String(targetId || ''), JSON.stringify(detail), now()]);
}
async function announcementRows() {
  return await all('SELECT id,title,text,active,createdAt FROM system_announcements WHERE active=1 ORDER BY id DESC LIMIT 3');
}
function normalizeGuildMember(row) {
  return row ? {
    ...row,
    playerId: row.playerId || row.playerid,
    joinedAt: Number(row.joinedAt || row.joinedat || 0),
    donated: Number(row.donated || 0),
    roleLabel: roleLabel(row.role),
    online: onlineUsers.has(String(row.playerId || row.playerid))
  } : row;
}
async function getGuildMembership(playerId) {
  const row = await one(`SELECT gm.guildName AS "guildName", gm.playerId AS "playerId", gm.role, gm.joinedAt AS "joinedAt", gm.donated,
    g.name, g.ownerPlayerId AS "ownerPlayerId", g.level, g.treasury, g.notice, g.renameAt AS "renameAt", g.createdAt AS "createdAt"
    FROM guild_members gm JOIN guilds g ON g.name=gm.guildName WHERE gm.playerId=$1`, [playerId]);
  return normalizeGuildMember(row);
}
async function guildMemberCount(guildName) {
  const row = await one('SELECT COUNT(*)::int AS count FROM guild_members WHERE guildName=$1', [guildName]);
  return Number(row?.count || 0);
}
async function guildLog(guildName, actorPlayerId, action, text, targetPlayerId = null) {
  await q('INSERT INTO guild_logs(guildName,actorPlayerId,targetPlayerId,action,text,createdAt) VALUES($1,$2,$3,$4,$5,$6)', [guildName, actorPlayerId, targetPlayerId, action, text, now()]);
}
async function guildPayload(playerId) {
  const guilds = await all(`SELECT g.name, g.level, g.treasury, g.notice, g.createdAt AS "createdAt",
    COUNT(gm.playerId)::int AS members
    FROM guilds g LEFT JOIN guild_members gm ON gm.guildName=g.name
    GROUP BY g.name,g.level,g.treasury,g.notice,g.createdAt
    ORDER BY members DESC,g.createdAt DESC LIMIT 30`);
  const membership = await getGuildMembership(playerId);
  if (!membership) {
    return {
      guild: null,
      guilds: guilds.map(g => ({ ...g, capacity: guildCapacity(g.level), members: Number(g.members || 0) }))
    };
  }
  const guildName = membership.guildName;
  const guild = await one('SELECT * FROM guilds WHERE name=$1', [guildName]);
  const members = (await all(`SELECT gm.playerId AS "playerId", gm.role, gm.joinedAt AS "joinedAt", gm.donated,
    u.username, p.classKey AS "classKey", p.level, p.hp, p.hpMax AS "hpMax"
    FROM guild_members gm JOIN players p ON p.id=gm.playerId JOIN users u ON u.id=p.userId
    WHERE gm.guildName=$1 ORDER BY
    CASE gm.role WHEN 'leader' THEN 1 WHEN 'vice' THEN 2 WHEN 'officer' THEN 3 ELSE 4 END,
    p.level DESC,u.username ASC`, [guildName])).map(normalizeGuildMember);
  const applications = rolePower(membership.role) >= 2
    ? await all(`SELECT ga.id, ga.guildName AS "guildName", ga.playerId AS "playerId", ga.message, ga.createdAt AS "createdAt",
        u.username, p.classKey AS "classKey", p.level
        FROM guild_applications ga JOIN players p ON p.id=ga.playerId JOIN users u ON u.id=p.userId
        WHERE ga.guildName=$1 AND ga.status='pending' ORDER BY ga.createdAt ASC`, [guildName])
    : [];
  const logs = await all('SELECT action,text,createdAt FROM guild_logs WHERE guildName=$1 ORDER BY id DESC LIMIT 20', [guildName]);
  const count = members.length;
  return {
    guild: {
      name: guild.name,
      level: Number(guild.level || 1),
      treasury: Number(guild.treasury || 0),
      notice: guild.notice || '',
      renameAt: Number(guild.renameat || guild.renameAt || 0),
      createdAt: Number(guild.createdat || guild.createdAt || 0),
      members: count,
      capacity: guildCapacity(guild.level),
      upgradeCost: guildUpgradeCost(guild.level),
      renameCost: guildRenameCost(guild.level),
      renameReadyAt: Number(guild.renameat || guild.renameAt || 0) + GUILD_RENAME_COOLDOWN
    },
    userRole: membership.role,
    userRoleLabel: roleLabel(membership.role),
    members,
    applications,
    logs,
    guilds: guilds.map(g => ({ ...g, capacity: guildCapacity(g.level), members: Number(g.members || 0) }))
  };
}
function onlineSnapshot() {
  return [...onlineUsers.values()].map(u => ({ username: u.username, connectedAt: u.connectedAt, count: u.count }));
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });
io.use(socketAuth);
function broadcastOnline() {
  io.emit('onlineUsers', { users: onlineSnapshot() });
}
function markOnline(user) {
  const key = String(user.id);
  const current = onlineUsers.get(key) || { userId: user.id, username: safeText(user.username), connectedAt: now(), count: 0 };
  current.count += 1;
  current.username = safeText(user.username);
  onlineUsers.set(key, current);
  broadcastOnline();
}
function markOffline(user) {
  const key = String(user.id);
  const current = onlineUsers.get(key);
  if (!current) return;
  current.count -= 1;
  if (current.count <= 0) onlineUsers.delete(key);
  else onlineUsers.set(key, current);
  broadcastOnline();
}
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/meta', async (req, res) => {
  const settings = await getGameSettings();
  res.json({
    classes: CLASSES,
    slots: SLOTS,
    shop: SHOP,
    bosses: BOSSES,
    dungeonMonsters: DUNGEON_MONSTERS,
    mapMonsters: MAP_MONSTER_MANIFEST,
    dungeonMaxFloor: DUNGEON_MAX_FLOOR,
    equipmentLevelCap: EQUIPMENT_LEVEL_CAP,
    rarities: RARITIES,
    fatigue: { max: 200, regenPerHour: 25, costs: { training: settings.fatigueTraining, dungeon: settings.fatigueDungeon, arena: settings.fatigueArena, guildWar: 0, boss: settings.fatigueBoss, dailyQuiz: 0 } },
    bossSettings: { baseHp: BOSS_BASE_HP, hpMultiplier: BOSS_HP_MULTIPLIER, maxHp: BOSS_MAX_HP, fragmentDropRate: settings.bossFragmentDropRate, equipmentDropRate: settings.bossEquipmentDropRate },
    dungeonSettings: { equipmentDropRate: settings.dungeonEquipmentDropRate, rewardReset: '每週五 00:00（台北時間）' },
    forgeSettings: { maxEnhance: MAX_ENHANCE, enhanceRates: ENHANCE_SUCCESS_RATES, enchants: ENCHANTS, specializations: SPECIALIZATIONS, materialSkus: [...MATERIAL_SKUS], forgeFee: { base: FORGE_BASE_FEE, perEnhance: FORGE_ENHANCE_FEE } },
    guildRoles: GUILD_ROLES,
    announcements: await announcementRows()
  });
});
app.post('/api/register', async (req, res) => {
  const { username, password, classKey } = req.body;
  if (!/^[a-zA-Z0-9_]{3,18}$/.test(username || '')) return res.status(400).json({ error: '帳號需 3-18 字英數底線' });
  if ((password || '').length < 8) return res.status(400).json({ error: '密碼至少 8 字' });
  if (!CLASSES[classKey]) return res.status(400).json({ error: '請選職業' });
  try {
    const hash = await bcrypt.hash(password, 12);
    const u = await one('INSERT INTO users(username,passwordHash,createdAt) VALUES($1,$2,$3) RETURNING id,username', [username, hash, now()]);
    const c = CLASSES[classKey];
    const eq = {};
    SLOTS.forEach(s => { eq[s] = itemFor(classKey, s, 1); });
    await q('INSERT INTO players(userId,classKey,level,exp,gold,hp,hpMax,atk,def,focus,stamina,staminaAt,hpRegenAt,equipment,dungeonSave,guild,bossFragments) VALUES($1,$2,1,0,1000,$3,$4,$5,$6,$7,200,$8,$8,$9,$10,$11,0)', [u.id, classKey, c.hp, c.hp, c.atk, c.def, c.focus, now(), JSON.stringify(eq), JSON.stringify({ floor: 1, hp: c.hp, weekKey: dungeonWeekKey() }), '']);
    res.json({ token: sign(u), username });
  } catch (e) {
    res.status(400).json({ error: '帳號已存在或資料庫錯誤' });
  }
});
app.post('/api/login', async (req, res) => {
  const u = await one('SELECT * FROM users WHERE username=$1', [req.body.username]);
  if (!u || !await bcrypt.compare(req.body.password || '', u.passwordhash)) return res.status(401).json({ error: '帳號或密碼錯誤' });
  if (Number(u.banned || 0)) return res.status(403).json({ error: '帳號已停權，請聯絡管理員' });
  if (ADMIN_USERNAMES.has(u.username) && u.role !== 'admin') await q('UPDATE users SET role=$1 WHERE id=$2', ['admin', u.id]);
  res.json({ token: sign(u), username: u.username });
});
app.get('/api/me', auth, async (req, res) => {
  const p = await getPlayer(req.user.id);
  if (!p) return res.status(404).json({ error: '角色不存在' });
  res.json({ user: req.user, player: p, stats: stats(p), inventory: await getInventory(p.id), logs: await all('SELECT * FROM battle_log WHERE playerId=$1 ORDER BY id DESC LIMIT 20', [p.id]) });
});
app.get('/api/online', auth, (req, res) => {
  res.json({ users: onlineSnapshot() });
});
app.get('/api/inventory', auth, async (req, res) => {
  const p = await getPlayer(req.user.id);
  if (!p) return res.status(404).json({ error: '角色不存在' });
  res.json({ items: await getInventory(p.id) });
});
app.post('/api/rest', auth, async (req, res) => {
  const p = await getPlayer(req.user.id);
  const settings = await getGameSettings();
  const s = stats(p);
  const missing = Math.max(0, s.hpMax - Number(p.hp));
  if (missing <= 0) return res.json({ message: 'HP 已經是滿的，不需要休息。' });
  const heal = Math.min(missing, Math.round(s.hpMax * 0.45));
  const cost = Math.max(0, Math.round(settings.restCost || 100));
  if (p.gold < cost) {
    return res.status(400).json({ error: `金幣不足，本次休息需要 ${cost} 金幣。沒有金幣時仍會每 10 分鐘自動回復少量 HP。` });
  }
  await q('UPDATE players SET hp=$1, gold=gold-$2, hpRegenAt=$3 WHERE id=$4', [p.hp + heal, cost, now(), p.id]);
  res.json({ message: `你在分行休息室休整，花費 ${cost} 金幣並恢復 ${heal} HP。沒有金幣時也會每 10 分鐘自動回復少量 HP。` });
});
app.post('/api/training', auth, async (req, res) => {
  const p = await getPlayer(req.user.id);
  const settings = await getGameSettings();
  if (!await spend(p, settings.fatigueTraining)) return res.status(400).json({ error: '疲勞不足' });
  const s = stats(p);
  const skill = skillFor(p.classkey);
  const encounter = trainingEncounter();
  const mdef = 5 + p.level * 2;
  const damage = Math.max(1, Math.round((s.atk + focusRoll(s, 8) + (skill.focusBoost || 0)) * skillPower(skill, s)) - mdef);
  const rawTaken = Math.max(0, 10 + p.level * 3 + rand(20) - s.def);
  const resolved = resolveIncomingDamage(rawTaken, s, skill);
  const taken = resolved.taken;
  const hp = Math.max(1, p.hp - taken);
  const expGain = 25 + p.level * 8 + rand(20);
  await q('UPDATE players SET hp=$1 WHERE id=$2', [hp, p.id]);
  const reward = await grantExpGold({ ...p, hp }, expGain, 0);
  const text = combatNarrative({
    title: encounter.title, player: p, skill, target: encounter.monsterName, damage, taken,
    outcome: reward.levelUps ? `${encounter.monsterName} 被你的金融招式淨化，你獲得 ${expGain} EXP 並升到 Lv.${reward.level}。` : `${encounter.monsterName} 暫時退散，你獲得 ${expGain} EXP，目前經驗值為 ${reward.exp}/${reward.level * 120}。`,
    reward: '本區域只提供經驗值，不掉落裝備；若要裝備請挑戰地下城或世界 BOSS。',
    image: encounter.monsterImage,
    extra: [`本次隨機場景：${encounter.mapName}${encounter.theme ? `（${encounter.theme}）` : ''}。`, ...resolved.notes]
  });
  await log(p.id, 'training', text);
  res.json({ text, encounter });
});
app.post('/api/dungeon', auth, async (req, res) => {
  const p = await getPlayer(req.user.id);
  const settings = await getGameSettings();
  const save = currentDungeonSave(p);
  const floor = save.floor;
  const requested = req.body.floor ? Number(req.body.floor) : floor;
  if (Number.isFinite(requested) && requested !== floor) {
    return res.status(400).json({ error: `地下城每週五刷新後必須依序挑戰，目前只能挑戰第 ${floor} 層。` });
  }
  if (!await spend(p, settings.fatigueDungeon)) return res.status(400).json({ error: '疲勞不足' });
  const s = stats(p);
  const enemy = monsterForFloor(floor);
  const enemyHp = Math.round(120 + floor * 55 + Math.pow(floor, 2) * 1.35);
  const enemyAtk = Math.round(26 + floor * 5.8 + Math.pow(floor, 1.34) * 2.05);
  const enemyDef = Math.round(12 + floor * 4.6 + Math.pow(floor, 1.3) * 1.75);
  let hp = p.hp;
  let ehp = enemyHp;
  let totalDamage = 0;
  let totalTaken = 0;
  const effectNotes = [];
  let lastSkill = skillFor(p.classkey);
  for (let r = 1; r <= 8 && hp > 0 && ehp > 0; r++) {
    lastSkill = skillFor(p.classkey);
    const damage = Math.max(1, Math.round((s.atk + focusRoll(s, floor) + (lastSkill.focusBoost || 0)) * skillPower(lastSkill, s)) - enemyDef);
    ehp -= damage;
    totalDamage += damage;
    const rawTaken = ehp > 0 ? Math.max(0, enemyAtk + rand(floor * 3 + 18) - Math.round(s.def * 0.85)) : 0;
    const resolved = resolveIncomingDamage(rawTaken, s, lastSkill);
    const taken = resolved.taken;
    if (resolved.counter) {
      ehp -= resolved.counter;
      totalDamage += resolved.counter;
    }
    effectNotes.push(...resolved.notes);
    hp -= taken;
    totalTaken += taken;
  }
  const win = ehp <= 0;
  let gold = 0;
  let item = null;
  let claimText = '';
  if (win) {
    const claim = await one('SELECT * FROM dungeon_weekly_claims WHERE playerId=$1 AND floor=$2 AND weekKey=$3', [p.id, floor, save.weekKey]);
    if (!claim) {
      gold = Math.round((120 + floor * 48 + Math.pow(floor, 1.25) * 18) * (1 + clamp(s.effects?.goldBonus || 0, 0, 0.5)));
      await q('INSERT INTO dungeon_weekly_claims(playerId,floor,weekKey,claimedAt) VALUES($1,$2,$3,$4) ON CONFLICT(playerId,floor,weekKey) DO NOTHING', [p.id, floor, save.weekKey, now()]);
      claimText = `本週第 ${floor} 層獎勵金幣 ${gold} 已領取。`;
    } else {
      claimText = '本週已領過此層金幣獎勵，因此本次不重複給付金幣。';
    }
    const itemChance = chanceWithEffects(settings.dungeonEquipmentDropRate, s.effects);
    if (Math.random() < itemChance) {
      item = itemFor(p.classkey, SLOTS[rand(SLOTS.length)], floor);
    }
    await q('UPDATE players SET hp=$1, gold=gold+$2, dungeonSave=$3 WHERE id=$4', [Math.max(1, hp), gold, JSON.stringify({ floor: Math.min(DUNGEON_MAX_FLOOR, floor + 1), hp: Math.max(1, hp), weekKey: save.weekKey }), p.id]);
  } else {
    await q('UPDATE players SET hp=$1, dungeonSave=$2 WHERE id=$3', [Math.max(1, hp), JSON.stringify({ floor, hp: Math.max(1, hp), weekKey: save.weekKey }), p.id]);
  }
  const text = combatNarrative({
    title: `地下城第 ${floor} 層：金融迷宮`, player: p, skill: lastSkill, target: enemy.name, damage: totalDamage, taken: totalTaken,
    outcome: win ? `你在八回合內擊退「${enemy.name}」，通關後地下城存檔推進到第 ${Math.min(DUNGEON_MAX_FLOOR, floor + 1)} 層。` : `「${enemy.name}」守住了本層，你被迫撤退，但系統已暫存第 ${floor} 層進度。`,
    reward: win ? `${claimText}${item ? ` 同時發現一件 ${item.rarity} 裝備，可選擇是否替換。` : ' 本次沒有發現裝備。'}` : '撤退後不會掉落裝備，建議先休息、補藥或強化裝備後再來。',
    image: enemy.image,
    extra: [`V1.5 週五重置與深層難度已啟用：本層敵方 HP ${enemyHp}、攻擊 ${enemyAtk}、防禦 ${enemyDef}，累計造成 ${totalDamage} 傷害，累計受到 ${totalTaken} 傷害，剩餘 HP ${Math.max(1, hp)}/${s.hpMax}。`, ...effectNotes.slice(0, 2)]
  });
  await log(p.id, 'dungeon', text);
  res.json({ win, text, item, nextFloor: win ? Math.min(DUNGEON_MAX_FLOOR, floor + 1) : floor, weekKey: save.weekKey });
});
app.post('/api/equip', auth, async (req, res) => {
  const p = await getPlayer(req.user.id);
  const item = req.body.item;
  if (!item || !SLOTS.includes(item.slot)) return res.status(400).json({ error: '裝備格式錯誤' });
  if (!item.image || (ARMOR_SLOTS.includes(item.slot) && String(item.image).includes('/armor/'))) item.image = assetForItem(item.slot, item.level || 1, item.clsKey || p.classkey, item.rarity === 'BOSS神鑄');
  const eq = typeof p.equipment === 'string' ? JSON.parse(p.equipment) : p.equipment;
  eq[item.slot] = item;
  await q('UPDATE players SET equipment=$1 WHERE id=$2', [JSON.stringify(eq), p.id]);
  res.json({ message: `已替換 ${item.slot}：${item.name}` });
});
app.post('/api/enhance', auth, async (req, res) => {
  const p = await getPlayer(req.user.id);
  const slot = req.body.slot;
  const eq = typeof p.equipment === 'string' ? JSON.parse(p.equipment) : p.equipment;
  if (!eq[slot]) return res.status(400).json({ error: '沒有此裝備' });
  const current = Number(eq[slot].enhance || 0);
  if (current >= MAX_ENHANCE) return res.status(400).json({ error: `此裝備已達最高強化 +${MAX_ENHANCE}` });
  const next = current + 1;
  const materialSku = materialForForge('enhance', current);
  const material = shopItemBySku(materialSku);
  const price = forgeFee(current);
  if (p.gold < price) return res.status(400).json({ error: '金幣不足' });
  if (!await consumeInventory(p.id, materialSku, 1)) return res.status(400).json({ error: `缺少 ${material?.[0] || materialSku}` });
  const chance = ENHANCE_SUCCESS_RATES[next] || 0.05;
  const ok = Math.random() < chance;
  const gain = ok ? applyEnhanceStats(eq[slot], next) : null;
  await q('UPDATE players SET gold=gold-$1, equipment=$2 WHERE id=$3', [price, JSON.stringify(eq), p.id]);
  res.json({ message: ok ? `強化成功！消耗 ${material?.[0] || materialSku} 與 ${price} 金幣，${slot} +${next}，${gain.main === 'atk' ? '攻擊' : gain.main === 'def' ? '防禦' : '專注'}提升 ${gain.step}。` : `強化失敗，消耗 ${material?.[0] || materialSku} 與 ${price} 金幣。+7～+10 區間成功率較低，請斟酌資源。` });
});
app.post('/api/enchant', auth, async (req, res) => {
  const p = await getPlayer(req.user.id);
  const slot = req.body.slot;
  const ench = pick(ENCHANTS);
  const eq = typeof p.equipment === 'string' ? JSON.parse(p.equipment) : p.equipment;
  if (!eq[slot]) return res.status(400).json({ error: '沒有此裝備' });
  const current = Number(eq[slot].enhance || 0);
  const materialSku = materialForForge('enchant', current);
  const material = shopItemBySku(materialSku);
  const price = forgeFee(current);
  if (p.gold < price) return res.status(400).json({ error: '金幣不足' });
  if (!await consumeInventory(p.id, materialSku, 1)) return res.status(400).json({ error: `缺少 ${material?.[0] || materialSku}` });
  eq[slot].enchant = ench.name;
  eq[slot].enchantDesc = ench.desc;
  eq[slot].enchantEffects = ench.effects;
  await q('UPDATE players SET gold=gold-$1, equipment=$2 WHERE id=$3', [price, JSON.stringify(eq), p.id]);
  res.json({ message: `附魔成功：消耗 ${material?.[0] || materialSku} 與 ${price} 金幣，獲得 ${ench.name}，${ench.desc}。` });
});
app.post('/api/specialize', auth, async (req, res) => {
  const p = await getPlayer(req.user.id);
  const slot = req.body.slot;
  const spec = req.body.spec || '攻擊特化';
  const eq = typeof p.equipment === 'string' ? JSON.parse(p.equipment) : p.equipment;
  if (!eq[slot]) return res.status(400).json({ error: '沒有此裝備' });
  if (!SPECIALIZATIONS[spec]) return res.status(400).json({ error: '無此特化類型' });
  const current = Number(eq[slot].enhance || 0);
  const materialSku = materialForForge('specialize', current);
  const material = shopItemBySku(materialSku);
  const price = forgeFee(current);
  if (p.gold < price) return res.status(400).json({ error: '金幣不足' });
  if (!await consumeInventory(p.id, materialSku, 1)) return res.status(400).json({ error: `缺少 ${material?.[0] || materialSku}` });
  const rule = applySpecialization(eq[slot], spec);
  await q('UPDATE players SET gold=gold-$1, equipment=$2 WHERE id=$3', [price, JSON.stringify(eq), p.id]);
  res.json({ message: `${slot} 已完成 ${spec}：消耗 ${material?.[0] || materialSku} 與 ${price} 金幣，${rule.desc}。` });
});
app.post('/api/shop/buy', auth, async (req, res) => {
  const p = await getPlayer(req.user.id);
  const it = SHOP.find(x => x[1] === req.body.sku);
  if (!it) return res.status(404).json({ error: '無此商品' });
  const day = todayKey();
  const row = await one('SELECT qty FROM purchases WHERE playerId=$1 AND sku=$2 AND day=$3', [p.id, it[1], day]);
  if ((row?.qty || 0) >= it[4]) return res.status(400).json({ error: '已無庫存，請明天再來購買。' });
  if (p.gold < it[2]) return res.status(400).json({ error: '金幣不足' });
  let hp = p.hp;
  let staminaNow = p.stamina;
  let stored = false;
  if (it[1].startsWith('potion_hp')) hp = Math.min(p.hpmax, p.hp + (it[1].endsWith('_s') ? 60 : it[1].endsWith('_m') ? 150 : 350));
  if (it[1].startsWith('stamina')) staminaNow = Math.min(200, p.stamina + (it[1].includes('20') ? 20 : 50));
  if (!it[1].startsWith('potion_hp') && !it[1].startsWith('stamina')) {
    await addInventory(p.id, it[1], 1);
    stored = true;
  }
  await q('UPDATE players SET gold=gold-$1, hp=$2, stamina=$3 WHERE id=$4', [it[2], hp, staminaNow, p.id]);
  await q('INSERT INTO purchases(playerId,sku,day,qty) VALUES($1,$2,$3,$4) ON CONFLICT(playerId,sku,day) DO UPDATE SET qty=EXCLUDED.qty', [p.id, it[1], day, (row?.qty || 0) + 1]);
  res.json({ message: `購買 ${it[0]} 成功。${stored ? '已放入背包。' : it[3]}，今日已買 ${(row?.qty || 0) + 1}/${it[4]}。` });
});
app.post('/api/arena', auth, async (req, res) => {
  const p = await getPlayer(req.user.id);
  const settings = await getGameSettings();
  if (!await spend(p, settings.fatigueArena)) return res.status(400).json({ error: '疲勞不足' });
  const opp = normalizePlayer(await one('SELECT p.*,u.username FROM players p JOIN users u ON u.id=p.userId WHERE p.id<>$1 ORDER BY RANDOM() LIMIT 1', [p.id]));
  if (!opp) return res.json({ text: '競技場目前沒有對手。請先建立第二位玩家或邀請朋友註冊。' });
  const a = stats(p);
  const b = stats(opp);
  const skill = skillFor(p.classkey);
  const oppSkill = skillFor(opp.classkey);
  let damage = Math.max(1, Math.round((a.atk + focusRoll(a, 20) + (skill.focusBoost || 0)) * skillPower(skill, a)) - b.def);
  const rawTaken = Math.max(1, Math.round((b.atk + focusRoll(b, 20) + (oppSkill.focusBoost || 0)) * skillPower(oppSkill, b)) - a.def);
  const resolved = resolveIncomingDamage(rawTaken, a, skill);
  const taken = resolved.taken;
  damage += resolved.counter;
  const win = damage >= taken;
  const gold = win ? 80 : 20;
  await q('UPDATE players SET gold=gold+$1 WHERE id=$2', [gold, p.id]);
  const text = combatNarrative({
    title: 'PK 競技場', player: p, skill, target: safeText(opp.username), damage, taken,
    outcome: win ? `你以 ${damage} 對 ${taken} 的交換優勢擊敗 ${safeText(opp.username)}，競技場裁判宣布勝利。` : `${safeText(opp.username)} 的「${oppSkill.name}」壓過你的攻勢，本場判定敗北。`,
    reward: `本場獲得 ${gold} 金幣；PK 會消耗疲勞但不會掉落裝備。`,
    image: (CLASSES[opp.classkey] || CLASSES.risk_guardian).image
  });
  const opponentText = combatNarrative({
    title: 'PK 競技場防衛通知', player: opp, skill: oppSkill, target: safeText(p.username), damage: taken, taken: damage,
    outcome: win ? `${safeText(p.username)} 向你發起競技場挑戰，對方以 ${damage} 對 ${taken} 的攻勢取得勝利。` : `${safeText(p.username)} 向你發起競技場挑戰，你以 ${taken} 對 ${damage} 的反擊守住本場對戰。`,
    reward: '這筆紀錄由對方發起 PK 後同步寫入，不會消耗你的疲勞，也不會扣除金幣。',
    image: (CLASSES[p.classkey] || CLASSES.risk_guardian).image
  });
  await log(p.id, 'arena', text);
  await log(opp.id, 'arena-defense', opponentText);
  res.json({ text });
});
app.get('/api/guild', auth, async (req, res) => {
  const p = await getPlayer(req.user.id);
  if (!p) return res.status(404).json({ error: '角色不存在' });
  res.json(await guildPayload(p.id));
});
app.get('/api/guild/list', auth, async (req, res) => {
  const p = await getPlayer(req.user.id);
  if (!p) return res.status(404).json({ error: '角色不存在' });
  const payload = await guildPayload(p.id);
  res.json({ guilds: payload.guilds });
});
app.post('/api/guild/create', auth, async (req, res) => {
  const p = await getPlayer(req.user.id);
  const name = safeGuildName(req.body.guild || req.body.name || '');
  if (!p) return res.status(404).json({ error: '角色不存在' });
  if (await getGuildMembership(p.id)) return res.status(400).json({ error: '你已經加入公會，需先退出才能創立新公會。' });
  if (name.length < 2) return res.status(400).json({ error: '公會名稱至少 2 個字，最多 16 個字。' });
  if (await one('SELECT name FROM guilds WHERE name=$1', [name])) return res.status(400).json({ error: '此公會名稱已存在。' });
  await q('INSERT INTO guilds(name,ownerPlayerId,createdAt,level,treasury,notice,renameAt) VALUES($1,$2,$3,1,0,$4,0)', [name, p.id, now(), '歡迎加入公會，請一起捐獻金庫、挑戰更高成長。']);
  await q('INSERT INTO guild_members(guildName,playerId,role,joinedAt,donated) VALUES($1,$2,$3,$4,0)', [name, p.id, 'leader', now()]);
  await q('UPDATE players SET guild=$1 WHERE id=$2', [name, p.id]);
  await guildLog(name, p.id, 'create', `${safeText(p.username)} 創立了公會。`);
  res.json({ message: `已創立公會：${name}`, ...(await guildPayload(p.id)) });
});
app.post('/api/guild/apply', auth, async (req, res) => {
  const p = await getPlayer(req.user.id);
  const name = safeGuildName(req.body.guild || req.body.name || '');
  if (!p) return res.status(404).json({ error: '角色不存在' });
  if (await getGuildMembership(p.id)) return res.status(400).json({ error: '你已經加入公會。' });
  const guild = await one('SELECT * FROM guilds WHERE name=$1', [name]);
  if (!guild) return res.status(404).json({ error: '找不到此公會。' });
  const exists = await one('SELECT id FROM guild_applications WHERE guildName=$1 AND playerId=$2 AND status=$3', [name, p.id, 'pending']);
  if (exists) return res.status(400).json({ error: '你已送出申請，請等待審核。' });
  await q('INSERT INTO guild_applications(guildName,playerId,message,status,createdAt) VALUES($1,$2,$3,$4,$5)', [name, p.id, safeChatText(req.body.message || ''), 'pending', now()]);
  await guildLog(name, p.id, 'apply', `${safeText(p.username)} 送出入會申請。`, p.id);
  res.json({ message: `已送出加入「${name}」的申請，等待幹部以上審核。` });
});
app.post('/api/guild/application', auth, async (req, res) => {
  const p = await getPlayer(req.user.id);
  const membership = await getGuildMembership(p.id);
  const decision = req.body.decision === 'reject' ? 'reject' : 'approve';
  if (!membership) return res.status(400).json({ error: '你尚未加入公會。' });
  if (decision === 'approve' && rolePower(membership.role) < 2) return res.status(403).json({ error: '幹部以上才能同意申請。' });
  if (decision === 'reject' && rolePower(membership.role) < 3) return res.status(403).json({ error: '只有會長或副會長可以拒絕申請。' });
  const appRow = await one('SELECT * FROM guild_applications WHERE id=$1 AND status=$2', [Number(req.body.id), 'pending']);
  if (!appRow || appRow.guildname !== membership.guildName) return res.status(404).json({ error: '找不到待審核申請。' });
  if (decision === 'approve') {
    if (await getGuildMembership(appRow.playerid)) return res.status(400).json({ error: '申請者已加入其他公會。' });
    const count = await guildMemberCount(membership.guildName);
    if (count >= guildCapacity(membership.level)) return res.status(400).json({ error: '公會人數已滿，請先用公會金庫升級公會等級。' });
    await q('INSERT INTO guild_members(guildName,playerId,role,joinedAt,donated) VALUES($1,$2,$3,$4,0)', [membership.guildName, appRow.playerid, 'member', now()]);
    await q('UPDATE players SET guild=$1 WHERE id=$2', [membership.guildName, appRow.playerid]);
  }
  await q('UPDATE guild_applications SET status=$1,decidedAt=$2,decidedBy=$3 WHERE id=$4', [decision === 'approve' ? 'approved' : 'rejected', now(), p.id, appRow.id]);
  await guildLog(membership.guildName, p.id, decision, `${safeText(p.username)} ${decision === 'approve' ? '同意' : '拒絕'}了一筆入會申請。`, appRow.playerid);
  res.json({ message: decision === 'approve' ? '已同意入會申請。' : '已拒絕入會申請。', ...(await guildPayload(p.id)) });
});
app.post('/api/guild/donate', auth, async (req, res) => {
  const p = await getPlayer(req.user.id);
  const membership = await getGuildMembership(p.id);
  const amount = Math.floor(Number(req.body.amount || 0));
  if (!membership) return res.status(400).json({ error: '你尚未加入公會。' });
  if (amount <= 0) return res.status(400).json({ error: '捐獻金額需大於 0。' });
  if (p.gold < amount) return res.status(400).json({ error: '金幣不足。' });
  await q('UPDATE players SET gold=gold-$1 WHERE id=$2', [amount, p.id]);
  await q('UPDATE guilds SET treasury=treasury+$1 WHERE name=$2', [amount, membership.guildName]);
  await q('UPDATE guild_members SET donated=donated+$1 WHERE guildName=$2 AND playerId=$3', [amount, membership.guildName, p.id]);
  await guildLog(membership.guildName, p.id, 'donate', `${safeText(p.username)} 捐獻 ${amount} 金幣到公會金庫。`);
  res.json({ message: `已捐獻 ${amount} 金幣到公會金庫。`, ...(await guildPayload(p.id)) });
});
app.post('/api/guild/upgrade', auth, async (req, res) => {
  const p = await getPlayer(req.user.id);
  const membership = await getGuildMembership(p.id);
  if (!membership) return res.status(400).json({ error: '你尚未加入公會。' });
  if (rolePower(membership.role) < 3) return res.status(403).json({ error: '只有會長或副會長可以使用公會金庫升級。' });
  const cost = guildUpgradeCost(membership.level);
  if (Number(membership.treasury || 0) < cost) return res.status(400).json({ error: `公會金庫不足，升級需要 ${cost} 金幣。` });
  await q('UPDATE guilds SET treasury=treasury-$1, level=level+1 WHERE name=$2', [cost, membership.guildName]);
  await guildLog(membership.guildName, p.id, 'upgrade', `${safeText(p.username)} 使用金庫 ${cost} 金幣，將公會升到 Lv.${Number(membership.level) + 1}。`);
  res.json({ message: `公會升級成功，成員上限增加 10。`, ...(await guildPayload(p.id)) });
});
app.post('/api/guild/rename', auth, async (req, res) => {
  const p = await getPlayer(req.user.id);
  const membership = await getGuildMembership(p.id);
  const name = safeGuildName(req.body.name || req.body.guild || '');
  if (!membership) return res.status(400).json({ error: '你尚未加入公會。' });
  if (membership.role !== 'leader') return res.status(403).json({ error: '只有會長可以改名。' });
  if (name.length < 2) return res.status(400).json({ error: '公會名稱至少 2 個字，最多 16 個字。' });
  if (name === membership.guildName) return res.status(400).json({ error: '新名稱不可與目前相同。' });
  if (await one('SELECT name FROM guilds WHERE name=$1', [name])) return res.status(400).json({ error: '此公會名稱已存在。' });
  if (Number(membership.renameAt || 0) && now() - Number(membership.renameAt) < GUILD_RENAME_COOLDOWN) return res.status(400).json({ error: '公會改名冷卻中，冷卻時間為 7 天。' });
  const cost = guildRenameCost(membership.level);
  if (p.gold < cost) return res.status(400).json({ error: `金幣不足，改名需要 ${cost} 金幣。` });
  const oldName = membership.guildName;
  await transaction(async (tx) => {
    await tx('UPDATE players SET gold=gold-$1 WHERE id=$2', [cost, p.id]);
    await tx('UPDATE guilds SET name=$1, renameAt=$2 WHERE name=$3', [name, now(), oldName]);
    await tx('UPDATE players SET guild=$1 WHERE guild=$2', [name, oldName]);
    await tx('UPDATE chat_messages SET guild=$1 WHERE guild=$2', [name, oldName]);
  });
  await guildLog(name, p.id, 'rename', `${safeText(p.username)} 花費 ${cost} 金幣，將公會「${oldName}」改名為「${name}」。`);
  res.json({ message: `公會已改名為：${name}`, ...(await guildPayload(p.id)) });
});
app.post('/api/guild/notice', auth, async (req, res) => {
  const p = await getPlayer(req.user.id);
  const membership = await getGuildMembership(p.id);
  if (!membership) return res.status(400).json({ error: '你尚未加入公會。' });
  if (rolePower(membership.role) < 3) return res.status(403).json({ error: '只有會長或副會長可以編輯公告。' });
  const notice = safeGuildNotice(req.body.notice || '');
  await q('UPDATE guilds SET notice=$1 WHERE name=$2', [notice, membership.guildName]);
  await guildLog(membership.guildName, p.id, 'notice', `${safeText(p.username)} 更新了公會公告。`);
  res.json({ message: '公會公告已更新。', ...(await guildPayload(p.id)) });
});
app.post('/api/guild/role', auth, async (req, res) => {
  const p = await getPlayer(req.user.id);
  const membership = await getGuildMembership(p.id);
  const targetId = Number(req.body.playerId);
  const role = ['vice', 'officer', 'member'].includes(req.body.role) ? req.body.role : null;
  if (!membership) return res.status(400).json({ error: '你尚未加入公會。' });
  if (!role) return res.status(400).json({ error: '無此職階。' });
  const target = await one('SELECT * FROM guild_members WHERE guildName=$1 AND playerId=$2', [membership.guildName, targetId]);
  if (!target) return res.status(404).json({ error: '找不到此公會成員。' });
  if (target.role === 'leader') return res.status(403).json({ error: '不能變更會長職階。' });
  if (membership.role !== 'leader' && !(membership.role === 'vice' && ['officer', 'member'].includes(role) && ['officer', 'member'].includes(target.role))) {
    return res.status(403).json({ error: '只有會長可任命副會長；副會長僅能調整幹部與成員。' });
  }
  await q('UPDATE guild_members SET role=$1 WHERE guildName=$2 AND playerId=$3', [role, membership.guildName, targetId]);
  await guildLog(membership.guildName, p.id, 'role', `${safeText(p.username)} 將成員職階調整為 ${roleLabel(role)}。`, targetId);
  res.json({ message: '職階已更新。', ...(await guildPayload(p.id)) });
});
app.post('/api/guild/kick', auth, async (req, res) => {
  const p = await getPlayer(req.user.id);
  const membership = await getGuildMembership(p.id);
  const targetId = Number(req.body.playerId);
  if (!membership) return res.status(400).json({ error: '你尚未加入公會。' });
  if (rolePower(membership.role) < 3) return res.status(403).json({ error: '只有會長或副會長可以踢人。' });
  if (targetId === p.id) return res.status(400).json({ error: '請使用離開公會功能。' });
  const target = await one('SELECT * FROM guild_members WHERE guildName=$1 AND playerId=$2', [membership.guildName, targetId]);
  if (!target) return res.status(404).json({ error: '找不到此公會成員。' });
  if (target.role === 'leader' || (membership.role === 'vice' && rolePower(target.role) >= 3)) return res.status(403).json({ error: '副會長不能踢除會長或其他副會長。' });
  await q('DELETE FROM guild_members WHERE guildName=$1 AND playerId=$2', [membership.guildName, targetId]);
  await q('UPDATE players SET guild=$1 WHERE id=$2', ['', targetId]);
  await guildLog(membership.guildName, p.id, 'kick', `${safeText(p.username)} 將一名成員移出公會。`, targetId);
  res.json({ message: '已將成員移出公會。', ...(await guildPayload(p.id)) });
});
app.post('/api/guild/leave', auth, async (req, res) => {
  const p = await getPlayer(req.user.id);
  const membership = await getGuildMembership(p.id);
  if (!membership) return res.status(400).json({ error: '你尚未加入公會。' });
  const count = await guildMemberCount(membership.guildName);
  if (membership.role === 'leader' && count > 1) return res.status(400).json({ error: '會長需先移交職位或移除其他成員後才能離開。' });
  if (membership.role === 'leader') {
    await q('DELETE FROM guilds WHERE name=$1', [membership.guildName]);
    await q('UPDATE players SET guild=$1 WHERE id=$2', ['', p.id]);
    return res.json({ message: '你已解散公會並離開。', ...(await guildPayload(p.id)) });
  }
  await guildLog(membership.guildName, p.id, 'leave', `${safeText(p.username)} 離開了公會。`);
  await q('DELETE FROM guild_members WHERE guildName=$1 AND playerId=$2', [membership.guildName, p.id]);
  await q('UPDATE players SET guild=$1 WHERE id=$2', ['', p.id]);
  res.json({ message: '已離開公會。', ...(await guildPayload(p.id)) });
});
app.post('/api/guild', auth, async (req, res) => {
  const p = await getPlayer(req.user.id);
  const name = safeGuildName(req.body.guild || req.body.name || '');
  if (!p) return res.status(404).json({ error: '角色不存在' });
  if (!name) return res.status(400).json({ error: '請使用公會管理介面的離開公會按鈕。' });
  if (await one('SELECT name FROM guilds WHERE name=$1', [name])) {
    req.body.guild = name;
    return res.status(400).json({ error: '此版本已改為申請審核制，請使用公會清單的申請按鈕送出入會申請。' });
  }
  return res.status(400).json({ error: '此版本需使用「創立公會」按鈕建立公會。' });
});
app.post('/api/guild-war', auth, async (req, res) => {
  res.status(400).json({ error: '公會戰/攻城戰暫未開放，待後續版本更新。' });
});
app.get('/api/boss', auth, async (req, res) => {
  const day = todayKey();
  const idx = bossIndex();
  const b = await ensureBoss();
  res.json({ state: b, boss: BOSSES[idx], leaderboard: await all('SELECT u.username,bd.damage,p.classKey AS "classKey" FROM boss_damage bd JOIN players p ON p.id=bd.playerId JOIN users u ON u.id=p.userId WHERE bd.day=$1 ORDER BY bd.damage DESC LIMIT 20', [day]) });
});
app.post('/api/boss/attack', auth, async (req, res) => {
  const result = await performBossAttack(req.user.id);
  res.status(result.status || 200).json(result.body);
});
app.post('/api/boss/craft', auth, async (req, res) => {
  const p = await getPlayer(req.user.id);
  if (p.bossfragments < 30) return res.status(400).json({ error: '碎片不足 30' });
  const it = itemFor(p.classkey, SLOTS[rand(SLOTS.length)], EQUIPMENT_LEVEL_CAP, true);
  const bi = BOSSES[bossIndex()];
  it.name = `${bi[2]}・${it.slot}`;
  await q('UPDATE players SET bossFragments=bossFragments-30 WHERE id=$1', [p.id]);
  res.json({ message: '已合成隨機 BOSS 裝備', item: it });
});
app.get('/api/daily-quiz', auth, async (req, res) => {
  const p = await getPlayer(req.user.id);
  const day = todayKey();
  const attempt = await one('SELECT * FROM daily_quiz_attempts WHERE playerId=$1 AND day=$2', [p.id, day]);
  if (attempt) {
    const ids = Array.isArray(attempt.questionids) ? attempt.questionids : JSON.parse(attempt.questionids);
    const answers = typeof attempt.answers === 'string' ? JSON.parse(attempt.answers) : attempt.answers;
    const rows = await all('SELECT * FROM quiz_questions WHERE id=ANY($1::text[])', [ids]);
    const byId = Object.fromEntries(rows.map(r => [r.id, r]));
    return res.json({
      completed: true,
      score: attempt.score,
      rewardExp: attempt.rewardexp,
      rewardGold: attempt.rewardgold,
      answers,
      questions: ids.map(id => publicQuestion(byId[id], true)).filter(Boolean)
    });
  }
  const questions = await getDailyQuestionRows(p.id);
  res.json({ completed: false, questions: questions.map(r => publicQuestion(r, false)) });
});
app.post('/api/daily-quiz/submit', auth, async (req, res) => {
  const p = await getPlayer(req.user.id);
  const day = todayKey();
  const exists = await one('SELECT * FROM daily_quiz_attempts WHERE playerId=$1 AND day=$2', [p.id, day]);
  if (exists) return res.status(400).json({ error: '今日每日任務已完成，請明天再挑戰。' });
  const questions = await getDailyQuestionRows(p.id);
  const answers = req.body.answers || {};
  let score = 0;
  const review = questions.map((row) => {
    const selected = Number(answers[row.id]);
    const correct = selected === Number(row.answer);
    if (correct) score += 1;
    return { ...publicQuestion(row, true), selected: Number.isFinite(selected) ? selected : null, correct };
  });
  const rewardExp = 50 + score * 35 + (score === 5 ? 80 : 0);
  const rewardGold = 150 + score * 90 + (score === 5 ? 200 : 0);
  const reward = await grantExpGold(p, rewardExp, rewardGold);
  await q('INSERT INTO daily_quiz_attempts(playerId,day,questionIds,answers,score,rewardExp,rewardGold,createdAt) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [p.id, day, JSON.stringify(questions.map(x => x.id)), JSON.stringify(answers), score, rewardExp, rewardGold, now()]);
  const text = `每日任務：台灣銀行業知識問答完成，答對 ${score}/5 題，獲得 ${rewardExp} EXP 與 ${rewardGold} 金幣${reward.levelUps ? `，並升到 Lv.${reward.level}` : ''}。`;
  await log(p.id, 'daily-quiz', text);
  res.json({ completed: true, score, rewardExp, rewardGold, levelUps: reward.levelUps, level: reward.level, review, text });
});
app.get('/api/leaderboards', async (req, res) => {
  res.json({
    level: await all('SELECT u.username,p.level,p.exp,p.classKey AS "classKey" FROM players p JOIN users u ON u.id=p.userId ORDER BY p.level DESC,p.exp DESC LIMIT 20'),
    gold: await all('SELECT u.username,p.gold,p.level,p.classKey AS "classKey" FROM players p JOIN users u ON u.id=p.userId ORDER BY p.gold DESC,p.level DESC LIMIT 20'),
    boss: await all('SELECT u.username,bd.damage,p.classKey AS "classKey" FROM boss_damage bd JOIN players p ON p.id=bd.playerId JOIN users u ON u.id=p.userId WHERE bd.day=$1 ORDER BY bd.damage DESC LIMIT 20', [todayKey()])
  });
});
app.get('/api/catalog', (req, res) => {
  const out = {};
  Object.keys(CLASSES).forEach(c => {
    out[c] = {};
    SLOTS.forEach(s => { out[c][s] = Array.from({ length: EQUIPMENT_LEVEL_CAP }, (_, i) => itemFor(c, s, i + 1)); });
  });
  res.json(out);
});

app.get('/api/admin/summary', auth, adminAuth, async (req, res) => {
  const [users, players, guilds, logs] = await Promise.all([
    one('SELECT COUNT(*)::int AS count FROM users'),
    one('SELECT COUNT(*)::int AS count FROM players'),
    one('SELECT COUNT(*)::int AS count FROM guilds'),
    all('SELECT al.*,u.username FROM admin_logs al LEFT JOIN users u ON u.id=al.adminUserId ORDER BY al.id DESC LIMIT 20')
  ]);
  res.json({
    users: Number(users?.count || 0),
    players: Number(players?.count || 0),
    guilds: Number(guilds?.count || 0),
    online: onlineSnapshot(),
    settings: await getGameSettings(),
    announcements: await all('SELECT * FROM system_announcements ORDER BY id DESC LIMIT 20'),
    logs
  });
});
app.get('/api/admin/players', auth, adminAuth, async (req, res) => {
  const term = `%${safeText(req.query.q || '').toLowerCase()}%`;
  const rows = await all(`SELECT p.id,p.userId AS "userId",u.username,u.role,u.banned,p.classKey AS "classKey",p.level,p.exp,p.gold,p.hp,p.hpMax AS "hpMax",p.stamina,p.guild,p.bossFragments AS "bossFragments"
    FROM players p JOIN users u ON u.id=p.userId
    WHERE LOWER(u.username) LIKE $1 OR CAST(p.id AS TEXT) LIKE $1
    ORDER BY p.id DESC LIMIT 80`, [term]);
  res.json({ players: rows });
});
app.get('/api/admin/player/:id', auth, adminAuth, async (req, res) => {
  const p = normalizePlayer(await one('SELECT p.*,u.username,u.role,u.banned FROM players p JOIN users u ON u.id=p.userId WHERE p.id=$1', [Number(req.params.id)]));
  if (!p) return res.status(404).json({ error: '找不到玩家' });
  res.json({
    player: p,
    stats: stats(p),
    equipment: typeof p.equipment === 'string' ? JSON.parse(p.equipment || '{}') : (p.equipment || {}),
    inventory: await getInventory(p.id),
    logs: await all('SELECT * FROM battle_log WHERE playerId=$1 ORDER BY id DESC LIMIT 30', [p.id])
  });
});
app.post('/api/admin/player/:id/update', auth, adminAuth, async (req, res) => {
  if (!requireConfirm(req, res)) return;
  const p = await one('SELECT * FROM players WHERE id=$1', [Number(req.params.id)]);
  if (!p) return res.status(404).json({ error: '找不到玩家' });
  const fields = ['level', 'exp', 'gold', 'hp', 'hpMax', 'atk', 'def', 'focus', 'stamina', 'bossFragments'];
  const updates = [];
  const params = [];
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      updates.push(`${field}=$${updates.length + 1}`);
      params.push(Math.max(0, Math.round(Number(req.body[field] || 0))));
    }
  }
  if (!updates.length) return res.status(400).json({ error: '沒有可更新欄位' });
  params.push(Number(req.params.id));
  await q(`UPDATE players SET ${updates.join(',')} WHERE id=$${params.length}`, params);
  await adminLog(req.user.id, 'player_update', 'player', req.params.id, req.body);
  res.json({ message: '玩家資料已更新。' });
});
app.post('/api/admin/player/:id/ban', auth, adminAuth, async (req, res) => {
  if (!requireConfirm(req, res)) return;
  const banned = req.body.banned ? 1 : 0;
  const p = await one('SELECT userId FROM players WHERE id=$1', [Number(req.params.id)]);
  if (!p) return res.status(404).json({ error: '找不到玩家' });
  await q('UPDATE users SET banned=$1 WHERE id=$2', [banned, p.userid]);
  await adminLog(req.user.id, banned ? 'player_ban' : 'player_unban', 'player', req.params.id, { banned });
  res.json({ message: banned ? '玩家已停權。' : '玩家已解除停權。' });
});
app.post('/api/admin/grant/material', auth, adminAuth, async (req, res) => {
  if (!requireConfirm(req, res)) return;
  const playerId = Number(req.body.playerId);
  const sku = String(req.body.sku || '');
  const qty = Math.max(1, Math.min(9999, Math.round(Number(req.body.qty || 1))));
  const target = await one('SELECT id FROM players WHERE id=$1', [playerId]);
  if (!target) return res.status(404).json({ error: '找不到玩家' });
  if (!INVENTORY_SKUS.has(sku)) return res.status(400).json({ error: '無此道具 SKU' });
  await addInventory(playerId, sku, qty);
  await adminLog(req.user.id, 'grant_material', 'player', playerId, { sku, qty });
  res.json({ message: `已補發 ${shopItemBySku(sku)?.[0] || sku} x${qty}。` });
});
app.post('/api/admin/grant/equipment', auth, adminAuth, async (req, res) => {
  if (!requireConfirm(req, res)) return;
  const playerId = Number(req.body.playerId);
  const p = normalizePlayer(await one('SELECT * FROM players WHERE id=$1', [playerId]));
  if (!p) return res.status(404).json({ error: '找不到玩家' });
  const slot = SLOTS.includes(req.body.slot) ? req.body.slot : '武器';
  const level = clamp(req.body.level || p.level || 1, 1, EQUIPMENT_LEVEL_CAP);
  const boss = !!req.body.boss;
  const item = itemFor(p.classkey, slot, level, boss);
  if (boss) item.name = `管理補發・${item.slot}`;
  const eq = typeof p.equipment === 'string' ? JSON.parse(p.equipment || '{}') : (p.equipment || {});
  eq[slot] = item;
  await q('UPDATE players SET equipment=$1 WHERE id=$2', [JSON.stringify(eq), p.id]);
  await adminLog(req.user.id, 'grant_equipment', 'player', playerId, { slot, level, boss });
  res.json({ message: `已補發並裝備 ${item.name}。`, item });
});
app.get('/api/admin/guilds', auth, adminAuth, async (req, res) => {
  const guilds = await all(`SELECT g.*,COUNT(gm.playerId)::int AS members
    FROM guilds g LEFT JOIN guild_members gm ON gm.guildName=g.name
    GROUP BY g.name,g.ownerPlayerId,g.createdAt,g.level,g.treasury,g.notice,g.renameAt
    ORDER BY members DESC,g.createdAt DESC LIMIT 100`);
  res.json({ guilds: guilds.map(g => ({ ...g, capacity: guildCapacity(g.level) })) });
});
app.post('/api/admin/guild/update', auth, adminAuth, async (req, res) => {
  if (!requireConfirm(req, res)) return;
  const name = safeGuildName(req.body.name || '');
  const guild = await one('SELECT * FROM guilds WHERE name=$1', [name]);
  if (!guild) return res.status(404).json({ error: '找不到公會' });
  const level = Math.round(clamp(req.body.level || guild.level || 1, 1, 50));
  const treasury = Math.round(clamp(req.body.treasury || guild.treasury || 0, 0, 999999999));
  const notice = safeGuildNotice(req.body.notice ?? guild.notice ?? '');
  await q('UPDATE guilds SET level=$1,treasury=$2,notice=$3 WHERE name=$4', [level, treasury, notice, name]);
  await adminLog(req.user.id, 'guild_update', 'guild', name, { level, treasury, notice });
  res.json({ message: '公會資料已更新。' });
});
app.post('/api/admin/settings', auth, adminAuth, async (req, res) => {
  if (!requireConfirm(req, res)) return;
  const settings = await setGameSettings(req.body.settings || {});
  await adminLog(req.user.id, 'settings_update', 'settings', 'game', settings);
  res.json({ message: '遊戲參數已更新。', settings });
});
app.post('/api/admin/announcement', auth, adminAuth, async (req, res) => {
  if (!requireConfirm(req, res)) return;
  const title = safeText(req.body.title || '系統公告');
  const text = safeLongText(req.body.text || '', 500);
  if (!text) return res.status(400).json({ error: '公告內容不可空白' });
  await q('INSERT INTO system_announcements(title,text,active,createdAt,createdBy) VALUES($1,$2,1,$3,$4)', [title, text, now(), req.user.id]);
  await adminLog(req.user.id, 'announcement_create', 'announcement', title, { text });
  res.json({ message: '公告已發布。' });
});
app.post('/api/admin/announcement/:id/toggle', auth, adminAuth, async (req, res) => {
  if (!requireConfirm(req, res)) return;
  const active = req.body.active ? 1 : 0;
  await q('UPDATE system_announcements SET active=$1 WHERE id=$2', [active, Number(req.params.id)]);
  await adminLog(req.user.id, 'announcement_toggle', 'announcement', req.params.id, { active });
  res.json({ message: active ? '公告已啟用。' : '公告已停用。' });
});
app.get('/api/admin/logs', auth, adminAuth, async (req, res) => {
  res.json({ logs: await all('SELECT al.*,u.username FROM admin_logs al LEFT JOIN users u ON u.id=al.adminUserId ORDER BY al.id DESC LIMIT 100') });
});

async function performBossAttack(userId) {
  const p = await getPlayer(userId);
  if (!p) return { status: 404, body: { error: '角色不存在' } };
  const settings = await getGameSettings();
  const b = await ensureBoss();
  if (b.killed) return { status: 400, body: { error: '今日 BOSS 已被擊退' } };
  if (!await spend(p, settings.fatigueBoss)) return { status: 400, body: { error: '疲勞不足' } };
  const s = stats(p);
  const skill = skillFor(p.classkey);
  const bi = BOSSES[bossIndex()];
  const damage = Math.max(50, Math.round((s.atk * 6 + s.focus * 3 + (skill.focusBoost || 0) * 5 + focusRoll(s, 250)) * skillPower(skill, s)));
  const hp = Math.max(0, Number(b.hp) - damage);
  await q('UPDATE boss_state SET hp=$1, killed=$2 WHERE day=$3', [hp, hp <= 0 ? 1 : 0, todayKey()]);
  const old = await one('SELECT damage FROM boss_damage WHERE day=$1 AND playerId=$2', [todayKey(), p.id]);
  await q('INSERT INTO boss_damage(day,playerId,damage) VALUES($1,$2,$3) ON CONFLICT(day,playerId) DO UPDATE SET damage=EXCLUDED.damage', [todayKey(), p.id, (old?.damage || 0) + damage]);
  let body;
  if (Math.random() < chanceWithEffects(settings.bossEquipmentDropRate, s.effects)) {
    const it = itemFor(p.classkey, SLOTS[rand(SLOTS.length)], EQUIPMENT_LEVEL_CAP, true);
    it.name = `${bi[2]}・${it.slot}`;
    body = {
      text: combatNarrative({
        title: '世界 BOSS 即時戰', player: p, skill, target: bi[1], damage, taken: 0,
        outcome: hp <= 0 ? `${bi[1]} 的核心 HP 歸零，全服今日 BOSS 被擊退。` : `${bi[1]} 被你打出破綻，稀有掉落判定成功。`,
        reward: `超低機率掉落！你發現 ${it.name}，可比較現有裝備後決定是否替換。`,
        image: bi[4]
      }),
      item: it,
      damage,
      hp,
      maxHp: b.maxhp
    };
  } else {
    let frag = 0;
    if (Math.random() < chanceWithEffects(settings.bossFragmentDropRate, s.effects, 'bossFragment', 0.85)) {
      frag = 1 + (Math.random() < chanceWithEffects(settings.bossFragmentBonusDropRate, s.effects, 'bossFragment', 0.35) ? 1 : 0);
      await q('UPDATE players SET bossFragments=bossFragments+$1 WHERE id=$2', [frag, p.id]);
    }
    body = {
      text: combatNarrative({
        title: '世界 BOSS 即時戰', player: p, skill, target: bi[1], damage, taken: 0,
        outcome: `${bi[1]} 剩餘 HP ${hp}/${b.maxhp}，你的累積傷害已寫入今日 BOSS 排行榜。`,
        reward: frag > 0 ? `你獲得 ${frag} 個 BOSS 碎片；累積 30 個碎片可合成隨機部位 BOSS 裝備。` : `本輪未取得 BOSS 碎片；碎片掉落率已下修，仍可透過持續參戰累積合成資源。`,
        image: bi[4]
      }),
      damage,
      hp,
      maxHp: b.maxhp,
      fragments: frag
    };
  }
  io.to('world-boss').emit('bossUpdate', { attacker: p.username || `玩家${p.id}`, damage, hp, maxHp: b.maxhp, killed: hp <= 0, text: body.text, at: now() });
  return { body };
}

function normalizeChatRow(row) {
  return {
    id: row.id,
    channel: row.channel,
    guild: row.guild || '',
    username: row.username,
    text: row.text,
    at: Number(row.createdat || row.createdAt || now())
  };
}
async function recentChat(channel, guild = '') {
  const rows = channel === 'guild'
    ? await all('SELECT * FROM chat_messages WHERE channel=$1 AND guild=$2 ORDER BY id DESC LIMIT 50', ['guild', guild])
    : await all('SELECT * FROM chat_messages WHERE channel=$1 ORDER BY id DESC LIMIT 50', ['global']);
  return rows.reverse().map(normalizeChatRow);
}
async function syncChat(socket) {
  const p = await getPlayer(socket.user.id);
  const guild = p?.guild || '';
  for (const room of socket.rooms) {
    if (String(room).startsWith('chat:guild:')) socket.leave(room);
  }
  socket.join('chat:global');
  if (guild) socket.join(`chat:guild:${guild}`);
  socket.emit('chatStatus', { guild });
  socket.emit('chatHistory', { channel: 'global', messages: await recentChat('global') });
  socket.emit('chatHistory', { channel: 'guild', guild, messages: guild ? await recentChat('guild', guild) : [] });
}
async function handleChatSend(socket, payload = {}) {
  const text = safeChatText(payload.text);
  if (!text) return;
  if (socket.data.lastChatAt && now() - socket.data.lastChatAt < 800) {
    socket.emit('chatError', { message: '發話速度太快，請稍後再送出。' });
    return;
  }
  socket.data.lastChatAt = now();
  const p = await getPlayer(socket.user.id);
  const channel = payload.channel === 'guild' ? 'guild' : 'global';
  const guild = channel === 'guild' ? (p?.guild || '') : '';
  if (channel === 'guild' && !guild) {
    socket.emit('chatError', { message: '你尚未加入公會，不能使用公會頻道。' });
    return;
  }
  const row = await one('INSERT INTO chat_messages(channel,guild,userId,username,text,createdAt) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', [channel, guild, socket.user.id, safeText(socket.user.username), text, now()]);
  const msg = normalizeChatRow(row);
  io.to(channel === 'guild' ? `chat:guild:${guild}` : 'chat:global').emit('chatMessage', msg);
}

io.on('connection', async (socket) => {
  const username = socket.user.username;
  markOnline(socket.user);
  socket.emit('battleLog', { mode: 'system', text: `${safeText(username)} 已連線即時戰鬥伺服器。`, at: now() });
  socket.emit('onlineUsers', { users: onlineSnapshot() });
  socket.on('disconnect', () => markOffline(socket.user));
  try { await syncChat(socket); } catch (e) { socket.emit('chatError', { message: '聊天室同步失敗，請重新整理頁面。' }); }
  socket.on('joinChat', async () => {
    try { await syncChat(socket); } catch (e) { socket.emit('chatError', { message: '聊天室同步失敗。' }); }
  });
  socket.on('chatSend', async (payload) => {
    try { await handleChatSend(socket, payload); } catch (e) { socket.emit('chatError', { message: '訊息送出失敗。' }); }
  });
  socket.on('joinBattle', async ({ battleId } = {}) => {
    const room = ['world-boss', 'arena'].includes(battleId) ? battleId : 'arena';
    socket.join(room);
    socket.to(room).emit('battleLog', { mode: room, text: `${safeText(username)} 進入 ${room} 戰場。`, at: now() });
    if (room === 'world-boss') {
      const b = await ensureBoss();
      socket.emit('bossUpdate', { hp: b.hp, maxHp: b.maxhp, killed: !!b.killed, text: '已同步世界 BOSS 狀態。', at: now() });
    }
  });
  socket.on('bossAttack', async () => {
    const result = await performBossAttack(socket.user.id);
    socket.emit('actionResult', result.body);
  });
  socket.on('arenaStrike', async ({ target = '競技場對手' } = {}) => {
    const player = await getPlayer(socket.user.id);
    const s = stats(player);
    const skill = skillFor(player.classkey);
    const damage = Math.max(1, Math.round((s.atk + focusRoll(s, 30) + (skill.focusBoost || 0)) * skillPower(skill, s)));
    const text = combatNarrative({
      title: '即時競技場', player, skill, target: safeText(target), damage, taken: rand(20),
      outcome: `${safeText(username)} 的攻擊已同步給競技場房間內所有玩家。`,
      reward: 'Socket.IO 即時訊息已送出；正式天梯積分可在下一版加入。',
      image: (CLASSES[player.classkey] || CLASSES.risk_guardian).image
    });
    await log(player.id, 'socket-arena', text);
    io.to('arena').emit('battleLog', { mode: 'arena', text, damage, at: now() });
  });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

initDb()
  .then(() => server.listen(PORT, () => console.log(`Finance RPG PG + Socket.IO running on ${PORT}`)))
  .catch((err) => { console.error('Database init failed:', err); process.exit(1); });
