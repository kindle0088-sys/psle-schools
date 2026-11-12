#!/usr/bin/env node
/**
 * 等时圈求解器验证：用已知起点跑通，并对照常识校核时间量级。
 *
 * 校核口径：**站台到站台的纯车程（含等车）**，不含两端步行——
 *   本模型给的是「坐标到坐标」的完整时间，因此对比时要扣掉步行段。
 *   用「门到门」的公开通勤时间对比会系统性高估偏差（多算两端步行 10-15 分钟）。
 *
 * 参考值（EW/NS 线 11-17 站，含等车）：
 *   Bishan → Raffles Place   NS 9 站   约 20-22 分钟
 *   Jurong East → City Hall  EW 11 站  约 26-28 分钟
 *   Tampines → City Hall     EW 11 站  约 26-28 分钟
 *   Woodlands → Raffles Pl.  NS 17 站  约 38-42 分钟
 */
const fs = require('fs');
const path = require('path');
const Iso = require('../lib/iso.cjs');

const BASE = path.join(__dirname, '..');
const net = JSON.parse(fs.readFileSync(path.join(BASE, 'data/network.json'), 'utf8'));
const schools = JSON.parse(fs.readFileSync(path.join(BASE, 'data/schools.json'), 'utf8'));
const graph = Iso.buildGraph(net);

console.log('▸ 图规模: %d 站 / %d 代号 / %d 边 + %d 换乘', net.stations.length,
  [...graph.adj.keys()].length, net.edges.length, net.transfers.length);
console.log('   参数: 站间 %s 分钟 ｜ 换乘 %s 分钟 ｜ 步行 %s m/min\n',
  net.params.rideMinPerStop, net.params.transferMin, net.params.walkMPerMin);

/** 指定起点跑一遍 */
function run(label, origin, notes = '') {
  const t0 = Date.now();
  const { stationMin, codeDist } = Iso.solveFrom(graph, origin);
  const list = Iso.timeToSchools(graph, stationMin, schools);
  const ms = Date.now() - t0;

  const valid = list.filter(x => x.minutes != null).sort((a, b) => a.minutes - b.minutes);
  const near = Iso.nearestStations(graph, origin, 3);

  console.log('══ %s %s', label, notes ? `(${notes})` : '');
  console.log('   最近站: %s', near.map(s => `${s.name} [${s.codes.join('/')}] ${s.distM}m`).join(' ｜ '));
  console.log('   求解耗时 %dms ｜ 可达学校 %d/%d', ms, valid.length, schools.length);

  const buckets = { '≤30': 0, '31-45': 0, '46-60': 0, '61-90': 0, '>90': 0 };
  for (const v of valid) {
    if (v.minutes <= 30) buckets['≤30']++;
    else if (v.minutes <= 45) buckets['31-45']++;
    else if (v.minutes <= 60) buckets['46-60']++;
    else if (v.minutes <= 90) buckets['61-90']++;
    else buckets['>90']++;
  }
  console.log('   分布: %s', Object.entries(buckets).map(([k, v]) => `${k}分钟 ${v}所`).join(' ｜ '));

  console.log('   最近 8 所:');
  for (const v of valid.slice(0, 8)) {
    console.log('     %s %s  (乘 %d + 走 %d, 经 %s %dm)',
      String(v.minutes).padStart(3) + 'min',
      v.school.name.padEnd(40).slice(0, 40),
      v.rideMinutes, v.walkMinutes, v.viaStation, v.accessWalkM);
  }
  console.log('');
  return { label, valid, buckets, ms };
}

// ── 已知起点 ──
const POINTS = [
  ['Bishan MRT', { lat: 1.35102, lon: 103.85006 }, 'NS17/CC15'],
  ['Jurong East MRT', { lat: 1.33303, lon: 103.74237 }, 'EW24/NS1'],
  ['Tampines MRT', { lat: 1.35515, lon: 103.94301 }, 'DT32/EW2'],
  ['Woodlands MRT', { lat: 1.43682, lon: 103.78607 }, 'NS9/TE2'],
  ['Punggol MRT', { lat: 1.40524, lon: 103.90234 }, 'NE17/PTC'],
];

const results = POINTS.map(([l, p, n]) => run(l, p, n));

// ── 交叉校核：几个具体 OD 对 ──
console.log('══ 单点校核（对照公开常识）');
function minutesBetween(from, toCode) {
  const { stationMin } = Iso.solveFrom(graph, from);
  const st = net.stations.find(s => s.codes.includes(toCode));
  const hit = stationMin.get(st.id);
  return hit ? Math.round(hit.minutes) : null;
}
const checks = [
  ['Bishan → Raffles Place (NS26)', POINTS[0][1], 'NS26', 21],
  ['Jurong East → City Hall (EW13)', POINTS[1][1], 'EW13', 27],
  ['Tampines → City Hall (EW13)', POINTS[2][1], 'EW13', 27],
  ['Woodlands → Raffles Place (NS26)', POINTS[3][1], 'NS26', 40],
];
for (const [label, from, code, expect] of checks) {
  const got = minutesBetween(from, code);
  const diff = got == null ? null : got - expect;
  const verdict = diff == null ? '✗ 无结果'
    : Math.abs(diff) <= 6 ? '✅ 合理'
      : Math.abs(diff) <= 12 ? '⚠ 偏差较大' : '❌ 明显偏差';
  console.log('   %s  模型 %s 分钟 / 常识约 %s 分钟  →  %s',
    label.padEnd(34), String(got).padStart(3), String(expect).padStart(3), verdict);
}

// ── 学校端：有多少学校最近站超过 800m（需巴士接驳） ──
console.log('\n══ 学校通达性');
const reach = [];
for (const sc of schools) {
  if (!sc.lat) continue;
  let min = Infinity, at = null;
  for (const st of net.stations) {
    const d = Iso.haversine({ lat: sc.lat, lon: sc.lon }, st);
    if (d < min) { min = d; at = st; }
  }
  reach.push({ name: sc.name, distM: Math.round(min), station: at.name });
}
reach.sort((a, b) => b.distM - a.distM);
const over800 = reach.filter(r => r.distM > 800);
const over1200 = reach.filter(r => r.distM > 1200);
console.log('   学校 %d 所 ｜ 最近站 >800m: %d 所 (' + ((over800.length / reach.length) * 100).toFixed(0) + '%) ｜ >1200m: %d 所',
  reach.length, over800.length, over1200.length);
console.log('   最远的 6 所（模型会偏乐观，需巴士接驳）:');
over800.slice(0, 6).forEach(r => console.log('     %s  %dm  (%s)', r.name.padEnd(40).slice(0, 40), r.distM, r.station));
console.log('   最近的 5 所（步行 400m 内）:');
reach.slice(-5).reverse().forEach(r => console.log('     %s  %dm  (%s)', r.name.padEnd(40).slice(0, 40), r.distM, r.station));

fs.mkdirSync(path.join(BASE, '.tmp'), { recursive: true });
fs.writeFileSync(path.join(BASE, '.tmp/reach-audit.json'), JSON.stringify(reach, null, 1));
console.log('\n   明细已存 .tmp/reach-audit.json');
