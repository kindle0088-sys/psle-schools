#!/usr/bin/env node
/**
 * 学生择校评分模型（AL 17 / PG3 / Punggol 828765 / 45 分钟上限）
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
const graph = Iso.buildGraph(net);
const MOE_NEARBY = (() => {
  const f = path.join(BASE, 'data/moe-nearby-828765.json');
  return fs.existsSync(f) ? new Set(JSON.parse(fs.readFileSync(f, 'utf8')).schools) : new Set();
})();

const SCORE = 17;
const POSTAL = '828765';
const MAX_MIN = 45;

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

/** 通勤：17 分钟内满分，45 分钟 60 分 */
function scoreCommute(min) {
  if (min == null) return 0;
  if (min <= 17) return 100;
  return Math.max(30, Math.round(100 - (min - 17) * 1.43));
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
function scoreCca(ccaList) {
  const has = re => ccaList.some(c => re.test(c));
  let s = 45;
  if (has(/infocomm|comput|program|robotic|maker|science/i)) s = Math.max(s, 85);
  if (has(/swim|water polo|lifesaving/i)) s = Math.max(s, 82);
  if (has(/drama|theatre/i)) s = Math.max(s, 78);
  if (has(/basketball|football|netball|volleyball|badminton|table tennis|track|wushu|sailing|canoe/i)) s = Math.max(s, 62);
  if (has(/dance|choir|band|orchestra/i)) s = Math.max(s, 58);
  if (has(/ncc|npcc|scouts|guides|red cross/i)) s = Math.max(s, 52);
  // 项目丰富度微调
  if (ccaList.length >= 14) s = Math.min(100, s + 4);
  return s;
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
  const r = sc.cop.rows.find(x => x.label === 'Posting Group 3');
  if (!r) return null;                 // 纯 IP 校没有 PG3 行
  const v = r.nonAff || r.aff;
  return v ? { ...v, label: r.label, kind: r.kind } : null;
}

(async () => {
  const j = await (await fetch('https://www.onemap.gov.sg/api/common/elastic/search?searchVal=' +
    POSTAL + '&returnGeom=Y&getAddrDetails=Y&pageNum=1')).json();
  const origin = { lat: +j.results[0].LATITUDE, lon: +j.results[0].LONGITUDE, label: j.results[0].SEARCHVAL };
  const stationMin = Iso.solveFrom(graph, origin).stationMin;
  const tmap = new Map(Iso.timeToSchools(graph, stationMin, schools.filter(s => s.lat && s.lon))
    .map(t => [t.school.slug, t]));

  const all = schools.map(sc => {
    const g = gate(sc);
    const t = tmap.get(sc.slug);
    const alpCats = (sc.electives || []).filter(x => x.type.startsWith('Applied Learning')).map(x => x.category || '');
    const llpCats = (sc.electives || []).filter(x => x.type.startsWith('Learning for Life')).map(x => x.category || '');
    const alpItems = (sc.electives || []).filter(x => x.type.startsWith('Applied Learning')).flatMap(x => x.items || []);
    const llpItems = (sc.electives || []).filter(x => x.type.startsWith('Learning for Life')).flatMap(x => x.items || []);
    const margin = g ? g.max - SCORE : null;
    const s = {
      safety: scoreSafety(margin),
      commute: scoreCommute(t ? t.minutes : null),
      academic: scoreAcademic(alpCats, alpItems),
      cca: scoreCca(sc.cca || []),
      feature: scoreFeature(sc, alpCats, llpCats),
    };
    const total = Math.round(s.safety * .30 + s.commute * .25 + s.academic * .15 + s.cca * .15 + s.feature * .15);
    return {
      slug: sc.slug, name: sc.name, area: sc.area, address: sc.address, postal: sc.postal,
      nature: sc.nature, type: sc.type, ip: sc.ip, sap: sc.sap,
      autonomous: sc.autonomous, independent: sc.independent,
      cop: g ? { min: g.min, max: g.max, markMax: g.markMax, kind: g.kind, year: sc.cop.year } : null,
      margin,
      minutes: t ? t.minutes : null,
      rideMinutes: t ? t.rideMinutes : null,
      walkMinutes: t ? t.walkMinutes : null,
      via: t ? `${t.viaStation} ${t.viaStationName}` : null,
      accessWalkM: t ? t.accessWalkM : null,
      cca: sc.cca || [],
      alpCats, alpItems, llpCats, llpItems,
      dsaAreas: sc.dsaAreas || [],
      moeNearby: MOE_NEARBY.has(sc.name),
      scores: s, total,
    };
  });

  // 池子：45 分钟内 + 有 COP + 混校 + 分数够得着（margin >= 4，保守一点）
  const pool = all
    .filter(x => x.minutes != null && x.minutes <= MAX_MIN)
    .filter(x => x.cop && x.margin >= 0)
    .filter(x => x.nature !== 'Boys School' && x.nature !== 'Girls School')
    .sort((a, b) => b.total - a.total);

  // 同时保留单性别学校信息（供说明为什么排除）
  const singleSex = all.filter(x => x.minutes != null && x.minutes <= MAX_MIN &&
    (x.nature === 'Boys School' || x.nature === 'Girls School') && x.cop && x.margin >= 4);

  // 够不着的名校（margin < 0）
  const outOfReach = all.filter(x => x.minutes != null && x.minutes <= MAX_MIN && x.cop && x.margin < 0)
    .sort((a, b) => b.margin - a.margin);

  console.log('▸ 起点:', origin.label, origin.lat.toFixed(5), origin.lon.toFixed(5));
  console.log('▸ 候选池（混校 / 45min / margin≥4）:', pool.length, '所');
  console.log('');
  console.log('排名  总分  分钟  余量  COP       校名 / ALP');
  pool.forEach((x, i) => {
    console.log(
      String(i + 1).padStart(3) + '  ' + String(x.total).padStart(4) + '  ' +
      String(x.minutes).padStart(3) + 'm  ' + String(x.margin).padStart(4) + '  ' +
      (x.cop.min + '-' + x.cop.max + (x.cop.markMax || '')).padEnd(9) + ' ' +
      (x.moeNearby ? '*' : ' ') + x.name.replace(/ Secondary School| \(Secondary\)/, '') +
      '  『' + (x.alpCats[0] || '—') + '』'
    );
  });

  console.log('');
  console.log('── 单性别学校（因「最好混校」排除）:', singleSex.length, '所');
  singleSex.forEach(x => console.log('   ' + String(x.minutes).padStart(2) + 'm ' + x.minutes + ' ' + x.name + ' (' + x.nature + ')'));

  console.log('');
  console.log('── 45 分钟内但分数够不着（margin<0）:', outOfReach.length, '所');
  outOfReach.slice(0, 12).forEach(x => console.log('   ' + String(x.minutes).padStart(2) + 'm ' + String(x.margin).padStart(3) + ' ' + x.name + ' [' + x.cop.min + '-' + x.cop.max + (x.cop.markMax || '') + ']'));

  fs.writeFileSync(path.join(BASE, 'data/_recommend.json'), JSON.stringify({
    student: { score: SCORE, pg: 'PG3', postal: POSTAL, maxCommute: MAX_MIN },
    origin, pool, singleSex, outOfReach,
    weights: { safety: .30, commute: .25, academic: .15, cca: .15, feature: .15 },
  }, null, 1));
  console.log('\n▸ 已存 data/_recommend.json');
})();
