#!/usr/bin/env node
/**
 * 为特定学生生成候选学校池（不写报告，只出分析数据）
 *
 * 学生画像来自 data/students/<id>.json（见 lib/student.cjs）。
 * 默认学生 abc1；换人用 STUDENT=<id> 环境变量，无需改代码。
 */
const fs = require('fs');
const path = require('path');
const Iso = require('../lib/iso.cjs');

const BASE = path.join(__dirname, '..');
const net = JSON.parse(fs.readFileSync(path.join(BASE, 'data/network.json'), 'utf8'));
const schools = JSON.parse(fs.readFileSync(path.join(BASE, 'docs/data/schools.json'), 'utf8')).schools;
const graph = Iso.buildGraph(net);

const Stu = require('../lib/student.cjs');
const STU = Stu.load();
const SCORE = STU.al;
const POSTAL = STU.home.postal;
const MAX_COMMUTE = STU.maxCommuteMin;
const PG = STU.postingGroupLabel;      // 'Posting Group 3'，用于匹配 rows.label

async function geocode(q) {
  const url = 'https://www.onemap.gov.sg/api/common/elastic/search?searchVal=' +
    encodeURIComponent(q) + '&returnGeom=Y&getAddrDetails=Y&pageNum=1';
  const j = await (await fetch(url)).json();
  const r = (j.results || [])[0];
  if (!r) return null;
  return { lat: +r.LATITUDE, lon: +r.LONGITUDE, label: r.SEARCHVAL, addr: r.ADDRESS };
}

/**
 * 取学生**所属档位**的非附属区间上端。
 *
 * ⚠️ 这里曾经取「所有档里 max 最大的那个」，实际永远取到 PG1 行
 *    （25–30 永远最大），把门槛系统性低估 8–10 分。与报告和看板
 *    犯的是同一个错，这里是第三处残留。
 */
function gate(sc) {
  if (!sc.cop?.rows?.length) return null;
  const r = sc.cop.rows.find(x => x.label === PG);
  if (!r) return null;                 // 该校不开学生所属档位
  const v = r.nonAff;
  return v ? { ...v, label: r.label, kind: r.kind } : null;
}

const hasItem = (sc, type, kw) =>
  (sc.electives || []).some(g => g.type === type && (g.items || []).some(i => i && i.includes(kw)));

function electOf(sc, prefix) {
  return (sc.electives || []).filter(g => (g.type || '').startsWith(prefix));
}

/** CCA 匹配：Robotics / AI / Drama / Swimming / Cooking */
const CCA_KEYS = [
  { k: 'Robotics', re: /robot|mechatron|stem|maker/i },
  { k: 'AI/Computing', re: /\bai\b|artificial|coding|program|comput|informatics|digital|cyber/i },
  { k: 'Drama', re: /drama|theatre|theater|performing arts|speech|debate/i },
  { k: 'Swimming', re: /swim|aquatic|water polo|lifesaving/i },
  { k: 'Cooking', re: /cook|culinary|food|nutrition|home econ/i },
];

function ccaMatch(sc) {
  const hits = [];
  const list = sc.cca || [];
  for (const { k, re } of CCA_KEYS) {
    const found = list.filter(c => re.test(c));
    if (found.length) hits.push({ key: k, items: found });
  }
  return hits;
}

(async () => {
  const origin = STU.home.coords
    ? { ...STU.home.coords, label: STU.home.address || POSTAL, addr: STU.home.address || '' }
    : await geocode(POSTAL);
  if (!origin) { console.error('✗ 邮编 ' + POSTAL + ' 地理编码失败'); process.exit(1); }
  console.log('▸ 起点:', origin.label);
  console.log('  坐标:', origin.lat, origin.lon);

  const { stationMin, access } = (() => {
    const r = Iso.solveFrom(graph, origin);
    return r;
  })();
  const accessStations = Iso.nearestStations(graph, origin, 3);
  console.log('  最近站:', accessStations.map(s => `${s.name}[${s.codes.join('/')}] ${s.distM}m`).join(' | '));

  const times = Iso.timeToSchools(graph, stationMin, schools.filter(s => s.lat && s.lon));
  const tmap = new Map(times.map(t => [t.school.slug, t]));

  const rows = schools.map(sc => {
    const g = gate(sc);
    const t = tmap.get(sc.slug);
    const margin = g ? g.max - SCORE : null;
    return {
      slug: sc.slug,
      name: sc.name,
      area: sc.area,
      gender: sc.nature,     // Boys School / Girls School / Co-educational
      type: sc.type,
      ip: sc.ip, sap: sc.sap, autonomous: sc.autonomous, independent: sc.independent,
      cop: g ? { min: g.min, max: g.max, markMax: g.markMax, kind: g.kind, label: g.label, year: sc.cop.year } : null,
      margin,
      minutes: t ? t.minutes : null,
      via: t ? `${t.viaStation} ${t.viaStationName}` : null,
      walkM: t ? t.accessWalkM : null,
      cca: ccaMatch(sc),
      ccaCount: (sc.cca || []).length,
      alp: electOf(sc, 'Applied Learning'),
      llp: electOf(sc, 'Learning for Life'),
    };
  });

  // 过滤：可达 45 分钟 + 有 COP + 分数够得着（margin >= -2，留一点冲刺空间）
  const pool = rows
    .filter(r => r.minutes != null && r.minutes <= MAX_COMMUTE)
    .filter(r => r.cop && r.margin >= -2)
    .sort((a, b) => b.margin - a.margin);

  console.log(`\n▸ 45 分钟内 + 分数够得着（margin ≥ -2）: ${pool.length} 所`);

  // 按 margin 分档
  const reach = pool.filter(r => r.margin >= -2 && r.margin <= 1);
  const match = pool.filter(r => r.margin >= 2 && r.margin <= 5);
  const safe = pool.filter(r => r.margin >= 6 && r.margin <= 10);
  const verySafe = pool.filter(r => r.margin > 10);

  const show = (label, arr, n = 100) => {
    console.log(`\n── ${label}（${arr.length} 所）`);
    arr.slice(0, n).forEach(r => {
      const g = r.gender === 'Boys School' ? '男' : r.gender === 'Girls School' ? '女' : '混';
      const flags = [r.ip ? 'IP' : '', r.sap ? 'SAP' : '', r.independent ? '独立' : r.autonomous ? '自主' : '']
        .filter(Boolean).join('/');
      const alp = r.alp.length ? r.alp[0].category || (r.alp[0].items || [])[0] : '—';
      console.log(`  ${String(r.minutes).padStart(2)}min m=${String(r.margin).padStart(3)} ${g} ${r.cop.max} ${r.name.padEnd(42).slice(0, 42)} [${flags}] ALP:${alp}`);
    });
  };

  show('冲刺 Reach（margin -2 ~ +1）', reach);
  show('匹配 Match（margin 2 ~ 5）', match);
  show('稳妥 Safe（margin 6 ~ 10）', safe);
  console.log(`\n── 极稳（margin > 10）: ${verySafe.length} 所（仅列 8 所）`);
  verySafe.slice(0, 8).forEach(r => {
    const g = r.gender === 'Boys School' ? '男' : r.gender === 'Girls School' ? '女' : '混';
    console.log(`  ${String(r.minutes).padStart(2)}min m=${r.margin} ${g} ${r.name}`);
  });

  const poolPayload = JSON.stringify({
    student: { id: STU.id, score: SCORE, pg: PG, postal: POSTAL, maxCommute: MAX_COMMUTE },
    origin,
    pool, reach, match, safe, verySafe,
  }, null, 1);
  fs.writeFileSync(path.join(BASE, `data/_student-pool-${STU.id}.json`), poolPayload);
  fs.writeFileSync(path.join(BASE, 'data/_student-pool.json'), poolPayload);
  console.log(`\n▸ 已存 data/_student-pool-${STU.id}.json（并同步 data/_student-pool.json）`);
})();
