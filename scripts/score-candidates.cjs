#!/usr/bin/env node
/**
 * 学生择校评分模型
 *
 * 学生画像来自 data/students/<id>.json（见 lib/student.cjs）。
 * 默认 abc1；换人用 STUDENT=<id> 环境变量，无需改代码。
 *
 * 五维加权，权重为用户指定：
 *   录取安全性 30% ｜ 距离/通勤 25% ｜ 学术课程匹配 15% ｜ CCA 匹配 15% ｜ ALP/LLP 特色 15%
 *
 * 输出 data/_recommend.json，供报告页直接内嵌。
 */
const fs = require('fs');
const path = require('path');
const Iso = require('../lib/iso.cjs');

const BASE = path.join(__dirname, '..');
const net = JSON.parse(fs.readFileSync(path.join(BASE, 'data/network.json'), 'utf8'));
const schools = JSON.parse(fs.readFileSync(path.join(BASE, 'docs/data/schools.json'), 'utf8')).schools;
/* docs/data/schools.json 为了体积刻意不输出 subjects（95KB），源数据仍完整保留在 data/schools.json。
   2026-11-24 abcd2 需要「逐校 offered subjects」：只读源数据补这一维，不把大字段塞回前端产物。 */
const RAW_SCHOOLS = JSON.parse(fs.readFileSync(path.join(BASE, 'data/schools.json'), 'utf8'));
const RAW_BY_SLUG = new Map(RAW_SCHOOLS.map(s => [s.slug, s]));
const graph = Iso.buildGraph(net);

const Stu = require('../lib/student.cjs');
const STU = Stu.load();
const Walk = require('../lib/walk.cjs');

/* 步行路网数据（data/walk-<id>.json）。没有就只用地铁单源，不报错。 */
const WALK = Walk.load(STU.id);

/* 公交数据（data/bus-<id>.json）：只给 commuteMode=bus 的学生用。
   结构是「从指定起点站上车、不换乘、下车步行到校」的最快方案，
   纯步行仍由 WALK 提供；两者取快者，MRT 完全不参与。 */
const BUS_FILE = path.join(BASE, `data/bus-${STU.id}.json`);
const BUS = fs.existsSync(BUS_FILE) ? JSON.parse(fs.readFileSync(BUS_FILE, 'utf8')) : null;
if (STU.commuteMode === 'bus' && !BUS) {
  console.error(`\n✗ commuteMode=bus 需要 ${BUS_FILE}，找不到\n`);
  process.exit(1);
}
const BUS_BY_SLUG = BUS ? new Map(BUS.rows.filter(r => r.bus).map(r => [r.slug, r.bus])) : new Map();

// MOE 邮编筛选结果按邮编天然区分学生；缺失时降级为「未做附近筛选」
const MOE_NEARBY = (() => {
  const f = Stu.nearbyFile(STU);
  return fs.existsSync(f) ? new Set(JSON.parse(fs.readFileSync(f, 'utf8')).schools) : new Set();
})();

const SCORE = STU.al;
const POSTAL = STU.home.postal;
const MAX_MIN = STU.maxCommuteMin;
/* 通勤口径。fastest = min(步行, 地铁)（abc1/abc2）；walk = 只认全程步行（abc3）。
   两种口径下 minutes 字段含义不同，报告必须按同一个人读它，否则会出现
   「门槛写 40 分钟、表里全是地铁 33/34 分钟」这种自相矛盾。 */
const MODE = STU.commuteMode;
const PG = STU.postingGroupLabel;      // 'Posting Group 3'，用于匹配 rows.label
// 通勤评分满分线 —— 与学生分数无关，过去写成 17 只是巧合
const FULL_MARK = STU.commuteFullMarkMin;

/* 评分权重：学生可覆盖，默认值保持不变。
   之前 30/25/15/15/15 硬编码在算式里，配置里写什么都不影响 —— 
   而 _recommend.json 还输出了一份 weights，看起来像是可配的。 */
const DEFAULT_WEIGHTS = { safety: .30, commute: .25, academic: .15, cca: .15, feature: .15 };
const W = (() => {
  const raw = STU.weights || {};
  const out = { ...DEFAULT_WEIGHTS };
  let sum = 0;
  for (const k of Object.keys(DEFAULT_WEIGHTS)) {
    if (typeof raw[k] === 'number' && raw[k] >= 0) out[k] = raw[k];
    sum += out[k];
  }
  // 权重必须能归一；否则按比例缩放，避免总分溢出 100
  if (Math.abs(sum - 1) > 1e-6) {
    if (sum <= 0) return { ...DEFAULT_WEIGHTS };
    for (const k of Object.keys(out)) out[k] = out[k] / sum;
  }
  return out;
})();

/** 取某校的完整 CCA 名称集合（优先 ccaFull，回退 MOE 登记） */
function ccaNamesOf(sc) {
  if (sc.ccaFull && sc.ccaFull.categories) {
    return Object.values(sc.ccaFull.categories).flat().map(i => i.name);
  }
  return sc.cca || [];
}

/* ── 五维评分 ───────────────────────────────────────────── */

/** 录取安全性：margin = COP(非附属最宽松档) max − 学生分数 */
/**
 * 录取安全性：margin = 该校 PG3 非附属区间上端 − 学生分数。
 *
 * AL 17 在 PG3（4–20）里属于中下段，可及学校余量只有 0–5 分，
 * 因此沿用「6 分起步」的旧标定会让所有候选都挤在最低档、失去区分度。
 * 这里按实际分布重新标定：0 分=压线、5 分=相对最稳。
 */
function scoreSafety(margin) {
  if (margin == null) return 40;
  if (margin >= 6) return 90;                          // 理论上的余裕档
  const table = { 0: 40, 1: 50, 2: 58, 3: 66, 4: 74, 5: 82 };
  if (margin in table) return table[margin];
  return 40;
}

/** 通勤：FULL_MARK 分钟内满分，到 MAX_MIN 时约 60 分，下限 30 */
function scoreCommute(min) {
  if (min == null) return 0;
  if (min <= FULL_MARK) return 100;
  const span = Math.max(1, MAX_MIN - FULL_MARK);
  return Math.max(30, Math.round(100 - (min - FULL_MARK) * (40 / span)));
}

/**
 * 学术/课程匹配：先看 ALP 类别，再看**项目名称里的实际内容**。
 *
 * 只看 category 会误判——例如 North Vista 的类别是 "Cities and Urban Landscapes"，
 * 但项目实际叫 "Farm-to-Table"（农业），与 Computing 无关；
 * 而 Compassvale 同为 STEM 类，项目是 "Aeronautics, Coding, Engineering"（含 Coding）。
 */
const ALP_CAT_BASE = [
  [/Emerging Technologies/i, 78],
  [/Future of Transportation/i, 76],
  [/Cities and Urban Landscapes/i, 72],
  [/^STEM -/i, 68],
  [/^STEM$/i, 70],
  [/Business & Entrepreneurship/i, 52],
  [/Aesthetics/i, 48],
  [/Languages/i, 46],
  [/Music & Performing Arts/i, 44],
  [/Sports & Outdoor Education/i, 42],
];
function scoreAcademic(alpCats, alpItems) {
  if (!alpCats.length) return 55;                    // 未列 ALP（多为自主学校），给中性偏上
  const cat = alpCats.join(' | ');
  let base = 50;
  for (const [re, v] of ALP_CAT_BASE) if (re.test(cat)) { base = Math.max(base, v); }

  // 项目名称里的实际内容决定加成
  const txt = (alpItems || []).join(' ');
  if (/coding|programming|computational|robotic|artificial intelligence|\bAI\b|maker|micro:?bit|python/i.test(txt)) base += 24;
  else if (/engineering|aeronautic|electronic|design.{0,6}technolog|mechatron/i.test(txt)) base += 14;
  else if (/smart|innovat|technolog|digital/i.test(txt)) base += 8;
  else if (/sustainab|green|eco|environment/i.test(txt)) base += 3;
  return Math.min(100, base);
}

/** CCA 匹配 */
/**
 * 兴趣 → CCA 匹配规则。
 *
 * ⚠️ 这里的 score 是「命中**这个学生**的兴趣」时的分值，不是通用好坏。
 *    改造前所有分值都是硬编码的通用偏好（合唱 58、戏剧 78），
 *    学生配置里的 interests 字段写了却完全不参与计算——典型的「看着能用」。
 *
 * keys 用中文和英文都认，配置里写 "Robotics" 或 "机器人" 都能命中。
 */
const CCA_INTEREST_RULES = [
  { keys: ['robotics', '机器人'],           label: '机器人', re: /robot|mechatron/i, score: 95 },
  { keys: ['ai', 'artificial intelligence'], label: 'AI',    re: /infocomm|comput|program|maker|electronic|coding/i, score: 94 },
  { keys: ['computing', 'computing', 'programming', '编程'], label: '编程', re: /infocomm|comput|program|maker|electronic|coding/i, score: 92 },
  { keys: ['drama', '戏剧'],                label: '戏剧', re: /drama|theatr|eldds/i, score: 90 },
  { keys: ['swimming', '游泳'],             label: '游泳', re: /swim|water polo|lifesaving/i, score: 88 },
  { keys: ['cooking', '烹饪'],              label: '烹饪', re: /cook|culinary|food|nutrition/i, score: 88 },
  { keys: ['music', '音乐'],                label: '音乐', re: /choir|chorale|band|orchestra|ensemble|guzheng|angklung|harmonica|drum/i, score: 80 },
  { keys: ['sports', '体育'],               label: '体育', re: /basketball|football|netball|volleyball|badminton|table tennis|track|wushu|sailing|canoe|floorball|hockey|softball|fencing|shooting/i, score: 70 },
  { keys: ['uniformed', '制服团体'],         label: '制服团体', re: /ncc|npcc|ncdcc|scout|guide|brigade|red cross|st john/i, score: 60 },
];

/** 没有配置兴趣时的通用评分（与改造前完全一致，保证向后兼容） */
function scoreCcaGeneric(ccaList) {
  const has = re => ccaList.some(c => re.test(c));
  let s = 45;
  if (has(/infocomm|comput|program|robotic|maker|science/i)) s = Math.max(s, 85);
  if (has(/swim|water polo|lifesaving/i)) s = Math.max(s, 82);
  if (has(/drama|theatre/i)) s = Math.max(s, 78);
  if (has(/basketball|football|netball|volleyball|badminton|table tennis|track|wushu|sailing|canoe/i)) s = Math.max(s, 62);
  if (has(/dance|choir|band|orchestra/i)) s = Math.max(s, 58);
  if (has(/ncc|npcc|scouts|guides|red cross/i)) s = Math.max(s, 52);
  if (ccaList.length >= 14) s = Math.min(100, s + 4);
  return s;
}

/**
 * 按学生兴趣给 CCA 打分。
 * 命中的兴趣项取最高分；一个都不命中时给 45（不能因为「有 30 个社团」就当成匹配）。
 */
function scoreCca(ccaList, interests) {
  const wanted = (interests || []).map(x => String(x).toLowerCase().trim()).filter(Boolean);
  if (!wanted.length) return scoreCcaGeneric(ccaList);

  const has = re => ccaList.some(c => re.test(c));
  const matched = [];
  let best = 0;
  for (const rule of CCA_INTEREST_RULES) {
    const isWanted = rule.keys.some(k => wanted.some(w => w.includes(k) || k.includes(w)));
    if (!isWanted) continue;
    if (has(rule.re)) { best = Math.max(best, rule.score); matched.push(rule.keys[0]); }
  }
  let s = best || 45;
  // 命中越多，说明学校在这个学生关心的方向上越全面
  if (matched.length >= 2) s = Math.min(100, s + 3);
  if (ccaList.length >= 14) s = Math.min(100, s + 2);
  return s;
}

/**
 * 命中了哪几项兴趣（中文标签）。
 *
 * 为什么要单独给这份名单：报告里以前只能写「机器人 + 戏剧都有 / 两项主要兴趣都没有」，
 * 而这种二元判断漏掉了「只有游泳」这类学校 —— Outram 明明有水球和泳池，
 * 却被盖章成「两项主要兴趣都没有」，读起来就是错的。
 */
function ccaHitLabels(ccaList, interests) {
  const wanted = (interests || []).map(x => String(x).toLowerCase().trim()).filter(Boolean);
  if (!wanted.length) return [];
  const has = re => ccaList.some(c => re.test(c));
  const out = [];
  for (const rule of CCA_INTEREST_RULES) {
    const isWanted = rule.keys.some(k => wanted.some(w => w.includes(k) || k.includes(w)));
    if (isWanted && has(rule.re) && !out.includes(rule.label)) out.push(rule.label);
  }
  return out;
}

/* ── 学术科目维度（2026-11-24 abcd2 新增）──────────────────────────
   与五维综合分刻意分开：subjects offered 是「这届开了什么」的事实快照，
   不能冒充「这个孩子适不适合这所学校」的分数。这里只产出匹配与稀缺标注，
   由报告决定是否高亮；综合分算式保持原样，避免悄悄改变既有学生口径。 */
const SUBJECT_NOTE_RE = /offered to the current student cohort|Tamil Language will have to attend/i;
const SUBJECT_SPECIAL_SCHOOLS = new Set([
  'School of the Arts, Singapore', 'Singapore Sports School',
  'Crest Secondary School', 'Spectra Secondary School', 'Assumption Pathway School',
]);
const SUBJECT_INTERESTS = STU.interests && STU.interests.subjects ? STU.interests.subjects : [];
const normSubject = s => String(s).toLowerCase().replace(/&/g, 'and').replace(/\s+/g, ' ').trim();
const cleanSubjects = arr => (arr || []).filter(v => !SUBJECT_NOTE_RE.test(v));
const SUBJECT_RARITY_MAX = 20;   // ≤20/142 判为「稀缺」；门槛写进报告，便于复核
/* 低年级共同课程 / 同一门课的写法变体不算「独特或强项」，否则 CCE、Food & Consumer
   Education、Humanities 变体会因为各校写法不同而假稀缺。 */
const RARE_IGNORE = new Set([
  'character and citizenship education', 'food and consumer education',
  'humanities general', 'humanities geography', 'humanities history',
  'humanities literature', 'humanities exposure modules', 'combined science',
  'physical education', 'social studies',
]);

/* 同一门课在 snapshot 里有多种写法（CCE / CCE-S1 / Humanities (Geography) /
   Humanities (SS, Geography) / Science (Phy, Chem)…）。不归并就会把「写法不同」
   误判成「稀缺」，所以先做一层保守归一；归一后反而是真稀缺的留下。 */
function canonicalSubject(v) {
  const s = normSubject(v);
  if (!s) return null;
  if (/^cce(?:[- ]|$)/.test(s) || s.startsWith('character and citizenship')) return 'character and citizenship education';
  if (s.startsWith('applied learning programme')) return null;
  if (/syllabus b/.test(s)) return null;   // 同一语种的版本标记，不是独立科目
  if (s.startsWith('food and consumer education')) return 'food and consumer education';
  if (s.startsWith('humanities')) {
    if (/literature/.test(s)) return 'humanities literature';
    if (/exposure/.test(s)) return 'humanities exposure modules';
    if (/geography/.test(s)) return 'humanities geography';
    if (/history/.test(s)) return 'humanities history';
    return 'humanities general';
  }
  if (/^science\s*\(/.test(s)) return 'combined science';
  return s;
}

/* 稀缺度只在 142 所普通课程校之间比，专门课程校（IP 以外的 SOTA / Sports /
   Crest / Spectra / Assumption Pathway）不进分母，否则它们的 0–8 项会污染基准。 */
const SUBJECT_COUNTS = (() => {
  const m = new Map();
  for (const s of RAW_SCHOOLS) {
    if (SUBJECT_SPECIAL_SCHOOLS.has(s.name)) continue;
    const keys = new Set(cleanSubjects(s.subjects).map(canonicalSubject).filter(Boolean));
    for (const k of keys) m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
})();

/* applied subjects 的官方列举见 MOE「Subjects for Express course」：
   Computing / Exercise & Sports Science / Drama 等；本地快照另常见 D&T、NFS、Art、Music、Electronics。
   映射写死在这里并在报告披露，避免把「Applied Subjects」解释成玄学。 */
const APPLIED_RES = [
  /^computing$/i, /computer applications/i, /design\s*(?:and|&)\s*technology/i,
  /nutrition\s*(?:and|&)\s*food science/i, /drama/i, /exercise\s*(?:and|&)\s*sports science/i,
  /^(?:higher\s+)?art$/i, /^(?:higher\s+)?music$/i, /electronics/i,
];
const SUBJECT_RULES = [
  { key: 'Higher Chinese', exact: /higher chinese/i },
  { key: 'Additional Mathematics', exact: /additional mathematics/i },
  { key: 'Science', exact: /^science(?:\s|\(|$)/i },
  { key: 'Computing', exact: /^computing$/i, related: /computer applications/i,
    relatedNote: 'Computer Applications = G1 Computing（原 CPA），PG3 需确认是否另有 G2/G3' },
  { key: 'Design & Technology', exact: /design\s*(?:and|&)\s*technology/i },
  { key: 'Nutrition and Food Science', exact: /nutrition\s*(?:and|&)\s*food science/i },
  { key: 'Applied Subjects', applied: true },
];

function subjectProfile(slug, electives) {
  const subjects = cleanSubjects(RAW_BY_SLUG.get(slug) && RAW_BY_SLUG.get(slug).subjects);
  const wanted = new Set(SUBJECT_INTERESTS.map(normSubject));
  const detail = {};
  for (const rule of SUBJECT_RULES) {
    if (!wanted.has(normSubject(rule.key))) continue;
    const exact = rule.applied
      ? subjects.filter(v => APPLIED_RES.some(re => re.test(v)))
      : subjects.filter(v => rule.exact.test(v));
    const related = rule.related
      ? subjects.filter(v => rule.related.test(v) && !exact.includes(v)) : [];
    if (exact.length || related.length) {
      detail[rule.key] = { exact, related, relatedNote: rule.relatedNote || null };
    }
  }
  const seenRare = new Set();
  const rare = subjects.filter(v => {
    const k = canonicalSubject(v);
    if (!k || seenRare.has(k) || RARE_IGNORE.has(k)) return false;
    seenRare.add(k);
    return (SUBJECT_COUNTS.get(k) ?? 999) <= SUBJECT_RARITY_MAX;
  });
  /* 「强项」不用主观排名，用学校公开的 Electives / Programmes 栏目：
     CLEP、SAP、IP、音乐/艺术 elective programme 这类是真正的逐校差异。 */
  const strong = (electives || [])
    .filter(e => /^(?:Electives|Programmes)$/i.test(e.type || ''))
    .flatMap(e => e.items || []);
  /* 「Computer Applications」只算 G1 关联，不冒充 G3 Computing 的完整命中；
     但它仍要出现在表上并注明，否则家长看到学校没 Computing 会误以为完全没有计算机课。 */
  const subjectHits = Object.keys(detail).filter(k => detail[k].exact.length);
  const subjectSoftHits = Object.keys(detail).filter(k => !detail[k].exact.length && detail[k].related.length);
  return {
    subjects,
    subjectHits,
    subjectSoftHits,
    subjectHitDetail: detail,
    subjectFit: subjectHits.length,
    rareSubjects: rare,
    strongProgrammes: strong,
    subjectRarityMax: SUBJECT_RARITY_MAX,
  };
}

/** ALP / LLP 与学校特色 */
function scoreFeature(sc, alpCats, llpCats) {
  let s = 55;
  if (alpCats.length) s += 10;
  if (llpCats.length) s += 8;
  if (alpCats.some(c => /STEM/i.test(c))) s += 10;
  if (llpCats.some(c => /Sports|Outdoor/i.test(c))) s += 3;
  if (sc.independent) s += 10;
  else if (sc.autonomous) s += 8;
  if (sc.sap) s += 4;
  if ((sc.cca || []).some(c => /infocomm/i.test(c))) s += 3;
  return Math.min(100, s);
}

/* ── 主流程 ─────────────────────────────────────────────── */
/**
 * 取该校 **Posting Group 3** 的非附属区间。
 *
 * ⚠️ 这里曾经取"所有档里 max 最大的那个"，结果取到了 PG1 行
 *    （PG1 区间是 25-30，永远最大），把门槛系统性低估 8-10 分。
 *    PG3 学生只能竞争该校 PG3 档的名额，因此必须只看 PG3 行。
 */
function gate(sc) {
  if (!sc.cop?.rows?.length) return null;
  const r = sc.cop.rows.find(x => x.label === PG);
  if (!r) return null;                 // 该校不开学生所属档位

  /* ⚠️ 这里曾经写 `r.nonAff || r.aff`，会让「该档只招附属生」的学校
     回退到附属区间，被误判为可报。
     实例：Kuo Chuan Presbyterian 的 PG3 只有附属区间（8–20），
     非附属生根本不在名额池里，却因回退被算成 margin +3、排进主池第 17 位。
     正确做法：按学生的附属身份选列。无附属关系时 nonAff 为空 = 不可报。 */
  const v = STU.hasAffiliation ? (r.aff || r.nonAff) : r.nonAff;
  return v ? { ...v, label: r.label, kind: r.kind, isAff: STU.hasAffiliation && !r.nonAff } : null;
}

(async () => {
  // 配置里有坐标就直接用，省一次网络请求（也避免 OneMap 限速拖慢整条链）
  let origin;
  if (STU.home.coords) {
    origin = { ...STU.home.coords, label: STU.home.address || POSTAL };
  } else {
    const j = await (await fetch('https://www.onemap.gov.sg/api/common/elastic/search?searchVal=' +
      encodeURIComponent(POSTAL) + '&returnGeom=Y&getAddrDetails=Y&pageNum=1')).json();
    const r = (j.results || [])[0];
    if (!r) { console.error('✗ 邮编 ' + POSTAL + ' 地理编码失败'); process.exit(1); }
    origin = { lat: +r.LATITUDE, lon: +r.LONGITUDE, label: r.SEARCHVAL };
  }
  const stationMin = Iso.solveFrom(graph, origin).stationMin;
  const tmap = new Map(Iso.timeToSchools(graph, stationMin, schools.filter(s => s.lat && s.lon))
    .map(t => [t.school.slug, t]));

  const all = schools.map(sc => {
    const g = gate(sc);
    const t = tmap.get(sc.slug);
    // 通勤：fastest → 步行/地铁取最快；walk → 只认全程步行（争议项取区间上端）
    //      bus → min(不换乘公交总时间, 全程步行时间)；地铁只留作参考列，不参与门槛
    const cm = Walk.merge(WALK ? WALK.bySlug.get(sc.slug) : null, t ? t.minutes : null);
    let commuteMin = Walk.scored(cm, MODE);
    let busPick = null;
    if (MODE === 'bus') {
      const walkGate = cm && cm.walkMin != null
        ? (cm.walkUpperMin != null ? cm.walkUpperMin : cm.walkMin) : null;
      busPick = BUS_BY_SLUG.get(sc.slug) || null;
      const busMin = busPick ? busPick.total : null;
      if (busMin == null) commuteMin = walkGate;
      else if (walkGate == null) commuteMin = busMin;
      else commuteMin = Math.min(busMin, walkGate);
    }
    const alpCats = (sc.electives || []).filter(x => x.type.startsWith('Applied Learning')).map(x => x.category || '');
    const llpCats = (sc.electives || []).filter(x => x.type.startsWith('Learning for Life')).map(x => x.category || '');
    const alpItems = (sc.electives || []).filter(x => x.type.startsWith('Applied Learning')).flatMap(x => x.items || []);
    const llpItems = (sc.electives || []).filter(x => x.type.startsWith('Learning for Life')).flatMap(x => x.items || []);
    const ccaList = ccaNamesOf(sc);
    const margin = g ? g.max - SCORE : null;
    const s = {
      safety: scoreSafety(margin),
      // ⚠️ 口径变更（2026-11-12）：原来只吃地铁模型，现在吃 min(步行, 地铁)。
      //    Punggol 这批学校其实走路上学比坐地铁快 7–12 分钟，只看地铁会系统性低估。
      // ⚠️ 口径再变（2026-11-16）：commuteMode=walk 的学生只吃步行，见 lib/walk.cjs。
      commute: scoreCommute(commuteMin),
      academic: scoreAcademic(alpCats, alpItems),
      // ⚠️ 用 ccaFull（官网核实过的完整清单），不是 sc.cca（MOE 登记，常年漏登）。
      //    否则 Greendale 这种「MOE 只登记 7 项、实际 19 项」的学校会被系统性低估。
      cca: scoreCca(ccaList, STU.interests.cca),
      feature: scoreFeature(sc, alpCats, llpCats),
    };
    const total = Math.round(
      s.safety * W.safety + s.commute * W.commute + s.academic * W.academic +
      s.cca * W.cca + s.feature * W.feature);
    return {
      slug: sc.slug, name: sc.name, area: sc.area, address: sc.address, postal: sc.postal,
      nature: sc.nature, type: sc.type, ip: sc.ip, sap: sc.sap,
      autonomous: sc.autonomous, independent: sc.independent,
      cop: g ? { min: g.min, max: g.max, markMax: g.markMax, kind: g.kind, year: sc.cop.year } : null,
      /* 官方星号标记与历史 COP 一并带过去：报告要引用它们，
         而 pool 是精简对象，不显式拷贝下游就拿不到。 */
      copFlags: sc.copFlags || null,
      copHistory: sc.copHistory || null,
      margin,
      /* minutes = 参与门槛与评分的分钟数：fastest 口径下是「步行/地铁取最快」，
         walk 口径下是「全程步行（争议项取区间上端）」。
         mrtMinutes / walkMinutes 始终分开保留，仅供展示。 */
      minutes: commuteMin,
      commuteBasis: MODE,          // 'fastest' | 'walk' | 'bus' —— 报告据此决定文案，不再靠猜
      commuteMode: MODE === 'bus'
        ? (busPick && (Walk.scored(cm, 'walk') == null || busPick.total <= (cm.walkUpperMin ?? cm.walkMin)) ? 'bus' : 'walk')
        : (cm ? cm.best : null),
      /* bus 口径专属：公交方案明细。MRT 时间仍保留在 mrtMinutes，但仅作参考。 */
      busMinutes: busPick ? busPick.total : null,
      busService: busPick ? busPick.svc : null,
      busDirection: busPick ? busPick.dir : null,
      busStopCode: busPick ? busPick.stop : null,
      busStopName: busPick ? busPick.stopName : null,
      busHops: busPick ? busPick.hops : null,
      busRideMinutes: busPick ? busPick.rideMin : null,
      busWalkMinutes: busPick ? busPick.walkFromStopMin : null,
      mrtMinutes: cm ? cm.mrtMin : null,
      walkMinutes: cm ? cm.walkMin : null,
      walkUpperMinutes: cm ? cm.walkUpperMin : null,
      walkMeters: cm ? cm.walkM : null,
      walkDisputed: cm ? cm.walkDisputed : false,
      walkRange: cm ? cm.walkRange : null,
      rideMinutes: t ? t.rideMinutes : null,
      walkMinutesToStation: t ? t.walkMinutes : null,
      via: t ? `${t.viaStation} ${t.viaStationName}` : null,
      accessWalkM: t ? t.accessWalkM : null,
      cca: sc.cca || [],
      /* 命中孩子哪几项兴趣（中文标签，空数组 = 五项都没社团承接）。
         报告里的「一句话」列直接用它，不再用「机器人/戏剧有没有」这种二元判断。 */
      ccaHits: ccaHitLabels(ccaList, STU.interests.cca),
      /* abcd2 起：学术科目事实与匹配。没有 interests.subjects 的学生完全不输出这些字段。 */
      ...(SUBJECT_INTERESTS.length ? subjectProfile(sc.slug, sc.electives) : {}),
      alpCats, alpItems, llpCats, llpItems,
      dsaAreas: sc.dsaAreas || [],
      moeNearby: MOE_NEARBY.has(sc.name),
      scores: s, total,
    };
  });

  // 性别口径：any=只看混校（单性别另列）；boys/girls=混校 + 对应单性别校
  const wantSex = STU.gender;              // any | boys | girls
  const sexOk = sc => {
    const isBoy = sc.nature === 'Boys School';
    const isGirl = sc.nature === 'Girls School';
    if (!isBoy && !isGirl) return true;    // 混校恒可
    if (wantSex === 'boys') return isBoy;
    if (wantSex === 'girls') return isGirl;
    return false;                          // any → 单性别校不进主池
  };

  // 池子：通勤上限内 + 有 COP + 性别符合 + 分数够得着
  const pool = all
    .filter(x => x.minutes != null && x.minutes <= MAX_MIN)
    .filter(x => x.cop && x.margin >= 0)
    .filter(x => sexOk(x))
    .sort((a, b) => b.total - a.total);
  // 落盘具体名次，报告里直接显示，读者不必自己数
  pool.forEach((x, i) => { x.rank = i + 1; });

  // 因性别被「排除」的单性别学校 —— 必须是 !sexOk，否则会与主池重叠重复计数
  // （gender=boys 时男校已进主池，这里只应剩女校）
  const singleSex = all.filter(x => x.minutes != null && x.minutes <= MAX_MIN &&
    (x.nature === 'Boys School' || x.nature === 'Girls School') && x.cop && x.margin >= 0 &&
    !sexOk(x));

  // 够不着的名校（margin < 0）
  const outOfReach = all.filter(x => x.minutes != null && x.minutes <= MAX_MIN && x.cop && x.margin < 0)
    .sort((a, b) => b.margin - a.margin);

  console.log('▸ 起点:', origin.label, origin.lat.toFixed(5), origin.lon.toFixed(5));
  console.log(`▸ 通勤口径: ${MODE === 'walk' ? '只认全程步行（争议项取区间上端）' : MODE === 'bus' ? 'min(不换乘公交+步行, 全程步行)；地铁不计' : '步行 / 地铁取最快'}`);
  console.log(`▸ 候选池（${wantSex === 'any' ? '混校' : wantSex === 'boys' ? '混校+男校' : '混校+女校'} / ${MAX_MIN}min / margin≥0）:`, pool.length, '所');
  console.log('');
  console.log('排名  总分  通勤  余量  COP       校名 / ALP   （通勤 = ' +
    (MODE === 'walk' ? '步行' : MODE === 'bus' ? '公交/步行取快' : '步行/地铁取最快') + '，带 * 为争议项）');
  pool.forEach((x, i) => {
    console.log(
      String(i + 1).padStart(3) + '  ' + String(x.total).padStart(4) + '  ' +
      (String(x.minutes).padStart(2) + (MODE === 'walk' ? 'W' : MODE === 'bus'
        ? (x.commuteMode === 'bus' ? 'B' : 'W')
        : (x.commuteMode === 'walk' ? 'W' : 'M')) +
        (x.walkDisputed ? '*' : ' ')).padStart(6) + ' ' + String(x.margin).padStart(4) + '  ' +
      (x.cop.min + '-' + x.cop.max + (x.cop.markMax || '')).padEnd(9) + ' ' +
      (x.moeNearby ? '*' : ' ') + x.name.replace(/ Secondary School| \(Secondary\)/, '') +
      '  『' + (x.alpCats[0] || '—') + '』'
    );
  });

  console.log('');
  console.log('── 单性别学校（因「最好混校」排除）:', singleSex.length, '所');
  singleSex.forEach(x => console.log('   ' + String(x.minutes).padStart(2) + 'm ' + x.minutes + ' ' + x.name + ' (' + x.nature + ')'));

  console.log('');
  console.log(`── ${MAX_MIN} 分钟内但分数够不着（margin<0）:`, outOfReach.length, '所');
  outOfReach.slice(0, 12).forEach(x => console.log('   ' + String(x.minutes).padStart(2) + 'm ' + String(x.margin).padStart(3) + ' ' + x.name + ' [' + x.cop.min + '-' + x.cop.max + (x.cop.markMax || '') + ']'));

  /* walk 口径专属：被「走路走不到」这条硬约束淘汰、但地铁其实能到且分数够得着的学校。
     报告里必须把它们单独列出来 —— 它们是家长最容易反过来问「为什么不考虑」的那批。 */
  const walkCut = MODE !== 'walk' ? [] : all
    .filter(x => x.margin != null && x.margin >= 0 && (x.minutes == null || x.minutes > MAX_MIN))
    .filter(x => sexOk(x))
    .filter(x => x.mrtMinutes != null && x.mrtMinutes <= MAX_MIN)
    .sort((a, b) => (a.minutes ?? 999) - (b.minutes ?? 999));
  if (MODE === 'walk') {
    console.log('');
    console.log(`── 步行超 ${MAX_MIN} 分钟、但地铁在 ${MAX_MIN} 分钟内且分数够得着（被硬约束淘汰）:`, walkCut.length, '所');
    walkCut.slice(0, 20).forEach(x => console.log('   步行 ' + String(x.walkMinutes == null ? '?' : x.walkMinutes).padStart(3) +
      'm / 地铁 ' + String(x.mrtMinutes).padStart(2) + 'm  ' + x.name + '  余量 +' + x.margin));
  }

  /* 全国口径统计 —— 报告里所有「N 所」都从这里取，避免换学生后数字失真。
     过去这些数字是硬编码在报告模板里的（130/68/47/20/19/1），
     换一个分数或邮编就全错。 */
  const stats = {
    totalSchools: schools.length,
    // 有「学生所属档位」的学校（纯 IP 校没有这一行，学生报不了）
    withStudentPG: all.filter(x => x.cop).length,
    // 全国够得着（不限通勤）
    reachableNationwide: all.filter(x => x.cop && x.margin >= 0).length,
    // 通勤上限内可达
    withinCommute: all.filter(x => x.minutes != null && x.minutes <= MAX_MIN).length,
    // 通勤内 + 够得着（= 主池 + 单性别）
    withinCommuteReachable: all.filter(x => x.minutes != null && x.minutes <= MAX_MIN && x.cop && x.margin >= 0).length,
    poolMixed: pool.length,
    poolSingleSex: singleSex.length,
    outOfReach: outOfReach.length,
    /* 学术科目维度（abcd2 起）。没有配置的学生是空数组/null，报告据此不渲染科目段。 */
    subjectInterests: SUBJECT_INTERESTS,
    subjectRarityMax: SUBJECT_INTERESTS.length ? SUBJECT_RARITY_MAX : null,
    subjectFitInPool: SUBJECT_INTERESTS.length
      ? pool.map(x => ({ name: x.name, fit: x.subjectFit, hits: x.subjectHits }))
      : [],
    // 通勤口径：步行 vs 地铁的分工，报告里引用这些数字而非写死
    walkDataUsed: !!WALK,
    /* 口径本身 —— 报告据此决定「通勤」列怎么写、门槛怎么解释。
       少了这个字段，模板只能猜，猜错就会出现「写 40 分钟步行、表里全是地铁 34 分钟」。 */
    commuteMode: MODE,
    walkFasterTotal: all.filter(x => x.commuteMode === 'walk').length,
    walkFasterInPool: pool.filter(x => x.commuteMode === 'walk').length,
    walkDisputedInPool: pool.filter(x => x.walkDisputed).length,
    // walk 口径专属：被「走不到」淘汰、但地铁可达且分数够得着的学校（数量 + 名单）
    walkCutCount: walkCut.length,
    walkCutNames: walkCut.map(x => x.name.replace(/ Secondary School| \(Secondary\)/, '')),
    walkCutDetail: walkCut.map(x => ({
      name: x.name.replace(/ Secondary School| \(Secondary\)/, ''),
      walkMinutes: x.walkMinutes,
      walkUpperMinutes: x.walkUpperMinutes,
      mrtMinutes: x.mrtMinutes,
      margin: x.margin,
      total: x.total,
      cop: x.cop ? { min: x.cop.min, max: x.cop.max, markMax: x.cop.markMax } : null,
      sap: !!x.sap, ip: !!x.ip, autonomous: !!x.autonomous,
      nature: x.nature,
    })),
    /* bus 口径专属统计。报告里「公交可达多少所」「几所靠公交入池」都从这里取。 */
    busUsed: MODE === 'bus',
    busReachableTotal: MODE === 'bus' ? all.filter(x => x.busMinutes != null && x.busMinutes <= MAX_MIN).length : null,
    busReachableInPool: MODE === 'bus' ? pool.filter(x => x.busMinutes != null && x.busMinutes <= MAX_MIN).length : null,
    busInPool: MODE === 'bus' ? pool.filter(x => x.commuteMode === 'bus').length : null,
    walkInPool: MODE === 'bus' ? pool.filter(x => x.commuteMode === 'walk').length : null,
    busBoardingStop: MODE === 'bus' && BUS ? BUS.boardingStop : null,
    busParams: MODE === 'bus' && BUS ? BUS.params : null,
    busCutCount: MODE === 'bus' ? all.filter(x =>
      x.margin >= 0 && (x.minutes == null || x.minutes > MAX_MIN) &&
      x.mrtMinutes != null && x.mrtMinutes <= MAX_MIN).length : null,
    busCutDetail: MODE === 'bus' ? all.filter(x =>
      x.margin >= 0 && (x.minutes == null || x.minutes > MAX_MIN) &&
      x.mrtMinutes != null && x.mrtMinutes <= MAX_MIN)
      .sort((a, b) => a.mrtMinutes - b.mrtMinutes).slice(0, 12).map(x => ({
        name: x.name.replace(/ Secondary School| \(Secondary\)/, ''),
        mrtMinutes: x.mrtMinutes,
        busMinutes: x.busMinutes,
        walkMinutes: x.walkMinutes,
        walkUpperMinutes: x.walkUpperMinutes,
        margin: x.margin,
      })) : [],
    // MOE 邮编筛选
    nearbyUsed: MOE_NEARBY.size > 0,
    nearbyCount: MOE_NEARBY.size,
    nearbyReachable: MOE_NEARBY.size
      ? all.filter(x => MOE_NEARBY.has(x.name) && x.cop && x.margin >= 0).length
      : null,
    nearbyReachableMixed: MOE_NEARBY.size
      ? all.filter(x => MOE_NEARBY.has(x.name) && x.cop && x.margin >= 0 && x.nature !== 'Boys School' && x.nature !== 'Girls School').length
      : null,
    nearbyReachableSingle: MOE_NEARBY.size
      ? all.filter(x => MOE_NEARBY.has(x.name) && x.cop && x.margin >= 0 && (x.nature === 'Boys School' || x.nature === 'Girls School')).length
      : null,
    // 名单也给出去，报告里不写死校名
    nearbyOutOfReachNames: MOE_NEARBY.size
      ? all.filter(x => MOE_NEARBY.has(x.name) && x.cop && x.margin < 0)
          .sort((a, b) => b.margin - a.margin)
          .map(x => x.name.replace(/ Secondary School| \(Secondary\)/, ''))
      : [],
    nearbySingleSexName: MOE_NEARBY.size
      ? (all.find(x => MOE_NEARBY.has(x.name) && x.cop && x.margin >= 0 &&
          (x.nature === 'Boys School' || x.nature === 'Girls School')) || {}).name?.replace(/ Secondary School| \(Secondary\)/, '') || null
      : null,
    nearbySingleSexType: (() => {
      if (!MOE_NEARBY.size) return null;
      const x = all.find(y => MOE_NEARBY.has(y.name) && y.cop && y.margin >= 0 &&
        (y.nature === 'Boys School' || y.nature === 'Girls School'));
      return x ? (x.nature === 'Boys School' ? 'boys' : 'girls') : null;
    })(),
  };

  const payload = JSON.stringify({
    student: {
      id: STU.id, label: STU.label, score: SCORE, pg: PG,
      postal: POSTAL, maxCommute: MAX_MIN, commuteFullMarkMin: FULL_MARK,
      pgShort: STU.postingGroup, pgLabel: PG,
      gender: STU.gender, hasAffiliation: STU.hasAffiliation,
      commuteMode: MODE,
      moeNearbyUsed: MOE_NEARBY.size > 0,
      walkData: WALK ? {
        generatedAt: WALK.generatedAt,
        schoolCount: WALK.bySlug.size,
        walkMetersPerMin: WALK.walkMetersPerMin,
        source: WALK.source,
        rule: MODE === 'walk'
          ? '只认全程步行；两家引擎分歧 >1.4× 的标为争议项，展示区间并按上端过闸与计分'
          : MODE === 'bus'
            ? '只认不换乘公交+步行或纯步行；争议项按区间上端过闸；地铁不参与'
            : '步行与地铁取最快者参与通勤评分；两家引擎分歧 >1.4× 的标为争议项，展示区间并按上端计分',
      } : null,
    },
    origin, pool, singleSex, outOfReach, stats,
    weights: W,
  }, null, 1);
  // 按学生分文件，多学生共存互不覆盖；同时写一份 _recommend.json 指向当前学生
  fs.writeFileSync(path.join(BASE, `data/_recommend-${STU.id}.json`), payload);
  fs.writeFileSync(path.join(BASE, 'data/_recommend.json'), payload);
  console.log(`\n▸ 已存 data/_recommend-${STU.id}.json（并同步 data/_recommend.json）`);
})();
